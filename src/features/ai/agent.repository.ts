// Wave 2 AI Kanban — agent dispatch repository.
//
// Phase 1 introduced provisioning wrappers; Phase 3 PR B adds:
//   - Read paths used by the My AI Kanban grid (denormalized JOIN per
//     PRD §8.4 to avoid N+1 fetches).
//   - The +New Task creation flow — one-off tasks (clone_template_to_card)
//     and recurring tasks (insert into ai_agent_schedules + optional
//     immediate fire).
//
// All write paths target the user's Personal AI Workspace project unless
// the caller passes an explicit project id.
//
// **rpcAdapter.call vs callSingle.** SQL functions that `RETURNS <scalar>`
// (uuid, timestamptz, etc) come back from PostgREST as the bare scalar —
// the RPC's `data` field IS the value. Use `rpcAdapter.call`. Functions
// that `RETURNS TABLE(...)` come back as an array of row objects; use
// `rpcAdapter.callSingle` to unwrap the first row. Mixing them silently
// breaks: `callSingle` does `data[0]` on a scalar, which indexes into
// the string and returns the first character (e.g. "2" from a
// timestamptz like "2026-..."). The Phase 5-A recurring task INSERT
// surfaced this as `next_run_at: "2"` rejected by Postgres.

import {getSupabaseBrowserClient} from '../../platform/supabase/client'
import {rpcAdapter, snakeToCamel} from '../../platform/data/rpc-adapter'
import type {AgentRunWithContext, AssignablePersona} from './agent.types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types lag; cast for nested-select shape
function aiTable(name: string): any {
  return (getSupabaseBrowserClient() as any).from(name)
}

// Exported so agent.repository.test.ts can substring-assert against the
// JOIN string without mocking the supabase chain. Single round trip per
// PRD §8.4 / Eng D11 — persona, project, and card all denormalized here.
export const AGENT_RUN_WITH_CONTEXT_COLUMNS = `
  *,
  card:cards!card_id (id, title),
  persona:ai_personas!persona_id (id, name, slug, accent_color, avatar_url, role, agent_user_id),
  project:projects!project_id (id, name, slug, kind)
`

export type CreateOneOffPersonalTaskInput = {
  workspaceProjectId: string
  agentUserId: string
  title: string
  bodyMd: string
  // Phase 5: extra JSONB fields merged into the cloned card_template
  // (e.g. tags, the __source_template_slug marker, resolved
  // user-input placeholders). Worker ignores unknown keys.
  cardTemplateExtras?: Record<string, unknown>
}

export type CreateRecurringPersonalTaskInput = {
  workspaceProjectId: string
  organizationId: string
  userId: string
  personaId: string
  agentUserId: string
  title: string
  bodyMd: string
  cronExpression: string
  timezone: string
  fireOnce: boolean
  // Phase 5: extra JSONB fields persisted on `ai_agent_schedules.card_template`
  // and forwarded to the optional fire-once `clone_template_to_card`.
  cardTemplateExtras?: Record<string, unknown>
}

export const agentRepository = {
  /**
   * Lazily promotes an AI persona to a bot `auth.users` row + org member.
   * Idempotent on the SQL side — repeated calls return the same uuid.
   * Service-role-only (called from edge functions); the browser client
   * never invokes this directly.
   */
  async provisionAgentUser(personaId: string): Promise<string> {
    const result = await rpcAdapter.call<string | null>('provision_agent_user', {
      target_persona_id: personaId,
    })
    if (!result) {
      throw new Error('provision_agent_user returned no value')
    }
    return result
  },

  /**
   * Lazily creates the Personal AI Workspace project for the given
   * (user, organization). Idempotent — returns the existing project id
   * on subsequent calls. Authenticated callers may only provision their
   * own workspace; service_role can act on any user.
   */
  async provisionPersonalAiWorkspace(input: {
    userId: string
    organizationId: string
  }): Promise<string> {
    const result = await rpcAdapter.call<string | null>(
      'provision_personal_ai_workspace',
      {
        target_org_id: input.organizationId,
        target_user_id: input.userId,
      },
    )
    if (!result) {
      throw new Error('provision_personal_ai_workspace returned no value')
    }
    return result
  },

  /**
   * Returns the user's recent runs in the org, denormalized with persona
   * and project context — single round trip per PRD §8.4 / Eng D11.
   */
  async getAgentRunsForUser(
    userId: string,
    organizationId: string,
  ): Promise<AgentRunWithContext[]> {
    const {data, error} = await aiTable('ai_agent_runs')
      .select(AGENT_RUN_WITH_CONTEXT_COLUMNS)
      .eq('created_by_user_id', userId)
      .eq('organization_id', organizationId)
      .order('created_at', {ascending: false})
      .limit(200)

    if (error) throw error
    return ((data as unknown[]) ?? []).map((row) =>
      snakeToCamel<AgentRunWithContext>(row),
    )
  },

  /**
   * Personas eligible to be dispatched to via the +New Task picker.
   * Filters to roles 'assistant' and 'monitor' (per PRD §22.4a) AND
   * `agent_user_id IS NOT NULL` so the picker never offers a persona
   * the dispatch path will reject.
   */
  async listAssignablePersonas(organizationId: string): Promise<AssignablePersona[]> {
    const {data, error} = await aiTable('ai_personas')
      .select('id, name, slug, accent_color, avatar_url, role, agent_user_id')
      .eq('organization_id', organizationId)
      .eq('is_enabled', true)
      .in('role', ['assistant', 'monitor'])
      .not('agent_user_id', 'is', null)
      .order('name', {ascending: true})

    if (error) throw error
    return ((data as Array<Record<string, unknown>>) ?? []).map((row) =>
      snakeToCamel<AssignablePersona>(row),
    )
  },

  /**
   * Phase 4 PR 4-B (D11): in-project assignee picker source.
   *
   * Calls `list_project_assignable_personas` which gates on
   * `can_edit_project` server-side. Read-only viewers get an empty
   * list and can't enumerate which agents are configured for projects
   * they only have read access to.
   */
  async listProjectAssignablePersonas(projectId: string): Promise<AssignablePersona[]> {
    const data = await rpcAdapter.callAndTransform<AssignablePersona[] | null>(
      'list_project_assignable_personas',
      {target_project_id: projectId},
    )
    return data ?? []
  },

  /**
   * Creates a free-form one-off card in the user's Personal AI
   * Workspace and dispatches the run atomically via
   * `clone_template_to_card`. The RPC inserts the card AND fires
   * `dispatch_agent_run` server-side, so the run is queued before the
   * call returns.
   *
   * Returns the new card's id; the run id can be loaded via the
   * realtime subscription on the My AI Kanban grid.
   */
  async createOneOffPersonalTask(input: CreateOneOffPersonalTaskInput): Promise<string> {
    const cardId = await rpcAdapter.call<string | null>('clone_template_to_card', {
      target_assignee_user_id: input.agentUserId,
      target_project_id: input.workspaceProjectId,
      template: {
        body_md: input.bodyMd,
        title: input.title,
        ...(input.cardTemplateExtras ?? {}),
      },
    })
    if (!cardId) {
      throw new Error('clone_template_to_card returned no value')
    }
    return cardId
  },

  /**
   * Creates a recurring `ai_agent_schedules` row and (optionally) fires
   * one card immediately so the user sees a queued run in the grid
   * within seconds of submitting the modal.
   *
   * The flow is three round trips:
   *   1. `next_cron_fire` — validates the cron expression and returns
   *      the next match in the schedule's timezone.
   *   2. INSERT into `ai_agent_schedules` (RLS allows authenticated
   *      owners to insert their own rows — see Phase 2a migration).
   *   3. (optional) `clone_template_to_card` — fires one card now so
   *      the recurring schedule has an immediately-visible artifact.
   */
  async createRecurringPersonalTask(
    input: CreateRecurringPersonalTaskInput,
  ): Promise<string> {
    const nextRunAt = await rpcAdapter.call<string | null>('next_cron_fire', {
      cron_expr: input.cronExpression,
      from_ts: new Date().toISOString(),
      tz: input.timezone,
    })
    if (!nextRunAt) {
      throw new Error('next_cron_fire returned no value')
    }

    const cardTemplate = {
      body_md: input.bodyMd,
      title: input.title,
      ...(input.cardTemplateExtras ?? {}),
    }

    const {data: insertedRow, error: insertError} = await aiTable('ai_agent_schedules')
      .insert({
        card_template: cardTemplate,
        created_by_user_id: input.userId,
        cron_expression: input.cronExpression,
        is_paused: false,
        next_run_at: nextRunAt,
        organization_id: input.organizationId,
        persona_id: input.personaId,
        target_project_id: input.workspaceProjectId,
        timezone: input.timezone,
      })
      .select('id')
      .single()

    if (insertError) throw insertError
    const scheduleId = (insertedRow as {id: string} | null)?.id
    if (!scheduleId) {
      throw new Error('ai_agent_schedules insert returned no id')
    }

    if (input.fireOnce) {
      await rpcAdapter.call<string | null>('clone_template_to_card', {
        target_assignee_user_id: input.agentUserId,
        target_project_id: input.workspaceProjectId,
        template: cardTemplate,
      })
    }

    return scheduleId
  },
}
