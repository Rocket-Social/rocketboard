import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getErrorMessage, rpcAdapter } from '../../platform/data/rpc-adapter'
import { useToast } from '../../components/ui/toast'
import { captureEvent } from '../../platform/monitoring/posthog'
import { cardDetailQueryOptions } from '../cards/card.queries'
import { agentRepository } from './agent.repository'
import {
  createPersona,
  listConversations,
  listMessages,
  listPersonas,
  updatePersona,
} from './ai.repository'
import { fetchUrlAllowlistRepository } from './fetch-url-allowlist.repository'
import { orgBudgetRepository } from './org-budget.repository'
import { orgQuotaRepository } from './org-quota.repository'
import { AI_AGENT_EVENT } from './posthog-events'

export const aiKeys = {
  agentRunsForUser: (userId: string, organizationId: string) =>
    [...aiKeys.all, 'agent-runs', userId, organizationId] as const,
  agentSchedules: (userId: string) =>
    [...aiKeys.all, 'agent-schedules', userId] as const,
  all: ['ai'] as const,
  assignablePersonas: (organizationId: string) =>
    [...aiKeys.all, 'assignable-personas', organizationId] as const,
  assignablePersonasForProject: (projectId: string) =>
    [...aiKeys.all, 'assignable-personas-for-project', projectId] as const,
  conversations: (userId: string, surface?: string, surfaceResourceId?: string) =>
    [...aiKeys.all, 'conversations', userId, surface, surfaceResourceId] as const,
  fetchUrlAllowlist: (organizationId: string) =>
    [...aiKeys.all, 'fetch-url-allowlist', organizationId] as const,
  messages: (conversationId: string) =>
    [...aiKeys.all, 'messages', conversationId] as const,
  orgBudgetUtilization: (organizationId: string) =>
    [...aiKeys.all, 'org-budget-utilization', organizationId] as const,
  orgQuotaUtilization: (organizationId: string) =>
    [...aiKeys.all, 'org-quota-utilization', organizationId] as const,
  personalAiWorkspace: (userId: string, organizationId: string) =>
    [...aiKeys.all, 'personal-ai-workspace', userId, organizationId] as const,
  personas: (orgId: string) => [...aiKeys.all, 'personas', orgId] as const,
}

/**
 * Phase 5: read-only access to per-org `organization_ai_fetch_allowlist`.
 * Powers the inline allowlist warning rendered in TemplateConfigInputs
 * when a user-supplied URL's hostname is not allowlisted.
 */
export function useFetchUrlAllowlistQuery(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryFn: () => fetchUrlAllowlistRepository.listForOrganization(organizationId!),
    queryKey: aiKeys.fetchUrlAllowlist(organizationId ?? ''),
    staleTime: 5 * 60_000,
  })
}

export function personasQueryOptions(organizationId: string) {
  return queryOptions({
    enabled: !!organizationId,
    queryFn: () => listPersonas(organizationId),
    queryKey: aiKeys.personas(organizationId),
    staleTime: 5 * 60_000,
  })
}

export function usePersonasQuery(organizationId: string) {
  return useQuery(personasQueryOptions(organizationId))
}

export function useSeedPersonasMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (organizationId: string) =>
      rpcAdapter.call('seed_default_ai_personas', {
        p_organization_id: organizationId,
      }),
    onSuccess: (_data, organizationId) => {
      void queryClient.invalidateQueries({
        queryKey: aiKeys.personas(organizationId),
      })
    },
  })
}

export function useUpdatePersonaMutation(organizationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      personaId,
      updates,
    }: {
      personaId: string
      updates: Parameters<typeof updatePersona>[1]
    }) => updatePersona(personaId, updates),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: aiKeys.personas(organizationId),
      })
    },
  })
}

export function useCreatePersonaMutation(organizationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (persona: Parameters<typeof createPersona>[1]) =>
      createPersona(organizationId, persona),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: aiKeys.personas(organizationId),
      })
    },
  })
}

export function useConversationsQuery(
  userId: string,
  surface?: string,
  surfaceResourceId?: string,
) {
  return useQuery({
    enabled: !!userId,
    queryFn: () => listConversations(userId, surface, surfaceResourceId),
    queryKey: aiKeys.conversations(userId, surface, surfaceResourceId),
    staleTime: 30_000,
  })
}

export function useMessagesQuery(conversationId: string | null) {
  return useQuery({
    enabled: !!conversationId,
    queryFn: () => listMessages(conversationId!),
    queryKey: aiKeys.messages(conversationId ?? ''),
    staleTime: 10_000,
  })
}

// Wave 2 AI Kanban — agent-dispatch hooks. Phase 1 wires the
// provisioning RPCs; the UI that calls them lands in Phase 3.

/**
 * Lazily promotes an AI persona to a bot `auth.users` row + org member.
 * Service-role-only — typical caller is the dispatch worker, not the
 * browser. Exposed here for completeness + future admin tooling.
 */
export function useProvisionAgentUserMutation(organizationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (personaId: string) => agentRepository.provisionAgentUser(personaId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: aiKeys.personas(organizationId)})
    },
  })
}

/**
 * Lazily creates the Personal AI Workspace project for the (user, org)
 * pair on first read. Mounted by the AI Kanban surface (Phase 3) so
 * the workspace exists before any free-form task is dispatched.
 */
export function usePersonalAiWorkspaceQuery(input: {
  userId: string | null
  organizationId: string | null
}) {
  return useQuery({
    enabled: Boolean(input.userId && input.organizationId),
    queryFn: () =>
      agentRepository.provisionPersonalAiWorkspace({
        organizationId: input.organizationId!,
        userId: input.userId!,
      }),
    queryKey: aiKeys.personalAiWorkspace(input.userId ?? '', input.organizationId ?? ''),
    staleTime: 5 * 60_000,
  })
}

/**
 * Denormalized run list backing the My AI Kanban grid. Single round-trip
 * with persona + project context joined per PRD §8.4 / Eng D11.
 */
export function useAgentRunsForUserQuery(input: {
  userId: string | null
  organizationId: string | null
}) {
  return useQuery({
    enabled: Boolean(input.userId && input.organizationId),
    queryFn: () =>
      agentRepository.getAgentRunsForUser(input.userId!, input.organizationId!),
    queryKey: aiKeys.agentRunsForUser(input.userId ?? '', input.organizationId ?? ''),
    staleTime: 10_000,
  })
}

/**
 * Personas eligible to be dispatched to. Filters to roles
 * 'assistant' / 'monitor' AND `agent_user_id IS NOT NULL` so the +New
 * Task picker never offers a persona that the dispatch path will
 * refuse.
 */
export function useAssignablePersonasQuery(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryFn: () => agentRepository.listAssignablePersonas(organizationId!),
    queryKey: aiKeys.assignablePersonas(organizationId ?? ''),
    staleTime: 5 * 60_000,
  })
}

/**
 * Phase 4 PR 4-B (D11): personas eligible for a specific project.
 *
 * Wraps the SECURITY DEFINER `list_project_assignable_personas` RPC.
 * Server-side gate on `can_edit_project` keeps read-only viewers from
 * enumerating which agents are configured for projects they only
 * have read access to. Returns an empty array when the project is
 * locked (`agents_assignable=false`) or when the caller lacks edit
 * permission.
 */
export function useAssignablePersonasForProjectQuery(projectId: string | null | undefined) {
  return useQuery({
    enabled: Boolean(projectId),
    queryFn: () => agentRepository.listProjectAssignablePersonas(projectId!),
    queryKey: aiKeys.assignablePersonasForProject(projectId ?? ''),
    staleTime: 60_000,
  })
}

/**
 * Creates a free-form one-off task in the user's Personal AI
 * Workspace. The card lands queued and the worker picks it up via
 * pg_notify or the 30s pull-fallback.
 */
export function useCreateOneOffPersonalTaskMutation(input: {
  userId: string
  organizationId: string
}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: Parameters<typeof agentRepository.createOneOffPersonalTask>[0]) =>
      agentRepository.createOneOffPersonalTask(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: aiKeys.agentRunsForUser(input.userId, input.organizationId),
      })
    },
  })
}

/**
 * Creates a recurring `ai_agent_schedules` row and (optionally) fires
 * one card immediately so the user sees a queued run in the grid as
 * soon as the modal closes.
 */
export function useCreateRecurringPersonalTaskMutation(input: {
  userId: string
  organizationId: string
}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (
      payload: Parameters<typeof agentRepository.createRecurringPersonalTask>[0],
    ) => agentRepository.createRecurringPersonalTask(payload),
    onSuccess: (scheduleId, payload) => {
      void queryClient.invalidateQueries({
        queryKey: aiKeys.agentRunsForUser(input.userId, input.organizationId),
      })
      captureEvent(AI_AGENT_EVENT.RECURRING_SCHEDULE_CREATED, {
        organization_id: input.organizationId,
        schedule_id: scheduleId,
        persona_id: payload.personaId,
        cron_expression: payload.cronExpression,
        timezone: payload.timezone,
        fire_once_on_create: payload.fireOnce,
      })
    },
  })
}

// Wave 2 AI Kanban Phase 4 (PR 4-A) — tool-call review mutations.
//
// Both wrap the canonical Phase 2c RPCs (`approve_tool_call(run_id,
// tool_call_index, edited_args)` and `reject_tool_call(run_id,
// tool_call_index, reason)`). The realtime channel on
// `ai_agent_runs` (filtered by card_id, set up in
// `card.realtime.ts`) refreshes the action bar after the dispatcher
// runs server-side, so we don't need optimistic JSONB rewrites — we
// rely on the realtime UPDATE for the canonical 'executed' /
// 'rejected' status.
//
// D9 — race resolution: when another reviewer or the auto-expiration
// path beat us to the row, the RPC raises `tool_call_no_longer_pending`.
// Catch that, fire an info toast, and invalidate the cache so the
// action bar refreshes with whatever resolved.

export type ApproveAgentToolCallInput = {
  cardId: string
  editedArgs?: Record<string, unknown>
  runId: string
  toolCallIndex: number
}

export type RejectAgentToolCallInput = {
  cardId: string
  reason?: string
  runId: string
  toolCallIndex: number
}

const TOOL_CALL_RACE_RE = /tool_call_no_longer_pending/

export function useApproveAgentToolCallMutation() {
  const queryClient = useQueryClient()
  const {toast} = useToast()

  return useMutation({
    mutationFn: async (input: ApproveAgentToolCallInput) => {
      await rpcAdapter.call('approve_tool_call', {
        run_id: input.runId,
        tool_call_index: input.toolCallIndex,
        edited_args: input.editedArgs ?? null,
      })
      return input
    },
    onError: (error, vars) => {
      if (TOOL_CALL_RACE_RE.test(getErrorMessage(error, ''))) {
        console.warn('Tool call race resolved by another reviewer or expiration', vars)
        toast({
          title: 'This action was already resolved',
          description: 'Refreshing the latest state.',
          variant: 'info',
        })
        void queryClient.invalidateQueries({
          queryKey: cardDetailQueryOptions(vars.cardId).queryKey,
        })
        return
      }
      toast({
        title: 'Action failed',
        description: getErrorMessage(error, 'Could not apply the action.'),
        variant: 'error',
      })
    },
    onSuccess: (vars) => {
      // Realtime push will overwrite, but kick a refetch in case the
      // user has the publication misconfigured (D15 guards against
      // this in fresh DBs but not in pre-existing prod state).
      void queryClient.invalidateQueries({
        queryKey: cardDetailQueryOptions(vars.cardId).queryKey,
      })
      captureEvent(AI_AGENT_EVENT.TOOL_CALL_APPROVED, {
        run_id: vars.runId,
        tool_call_index: vars.toolCallIndex,
        card_id: vars.cardId,
        edited: Boolean(vars.editedArgs),
      })
    },
  })
}

export function useRejectAgentToolCallMutation() {
  const queryClient = useQueryClient()
  const {toast} = useToast()

  return useMutation({
    mutationFn: async (input: RejectAgentToolCallInput) => {
      await rpcAdapter.call('reject_tool_call', {
        run_id: input.runId,
        tool_call_index: input.toolCallIndex,
        reason: input.reason ?? null,
      })
      return input
    },
    onError: (error, vars) => {
      if (TOOL_CALL_RACE_RE.test(getErrorMessage(error, ''))) {
        console.warn('Tool call race resolved by another reviewer or expiration', vars)
        toast({
          title: 'This action was already resolved',
          description: 'Refreshing the latest state.',
          variant: 'info',
        })
        void queryClient.invalidateQueries({
          queryKey: cardDetailQueryOptions(vars.cardId).queryKey,
        })
        return
      }
      toast({
        title: 'Action failed',
        description: getErrorMessage(error, 'Could not reject the action.'),
        variant: 'error',
      })
    },
    onSuccess: (vars) => {
      void queryClient.invalidateQueries({
        queryKey: cardDetailQueryOptions(vars.cardId).queryKey,
      })
      captureEvent(AI_AGENT_EVENT.TOOL_CALL_REJECTED, {
        run_id: vars.runId,
        tool_call_index: vars.toolCallIndex,
        card_id: vars.cardId,
        had_reason: typeof vars.reason === 'string' && vars.reason.length > 0,
      })
    },
  })
}

// Phase 4 PR 4-B (D14): undo path for "I reassigned to the wrong agent."
//
// `cancel_agent_run` is service_role + owner-or-editor (see
// 20260505010000_*.sql:457). The caller passes `cardId` so the
// mutation can invalidate the card's detail cache; the actual cancel
// only needs `runId`. If the run already started, the RPC silently
// no-ops on terminal-state — which the calling toast turns into the
// "Could not undo — agent already started" warning (D17 undo-fail).

export type UndoCancelAgentRunInput = {
  cardId: string
  runId: string
}

export function useUndoCancelAgentRunMutation() {
  const queryClient = useQueryClient()
  const {toast} = useToast()

  return useMutation({
    mutationFn: async (input: UndoCancelAgentRunInput) => {
      await rpcAdapter.call('cancel_agent_run', {
        target_run_id: input.runId,
        target_reason: 'undo_reassign',
      })
      return input
    },
    onError: (error, _vars) => {
      // Undo-fail (D17): the agent already started or the cancel
      // raised. Surface honestly + invalidate so the user sees the
      // canonical state.
      toast({
        title: 'Could not undo',
        description: getErrorMessage(
          error,
          'The agent already started. The run will continue.',
        ),
        variant: 'error',
      })
      if (_vars.cardId) {
        void queryClient.invalidateQueries({
          queryKey: cardDetailQueryOptions(_vars.cardId).queryKey,
        })
      }
    },
    onSuccess: (vars) => {
      void queryClient.invalidateQueries({
        queryKey: cardDetailQueryOptions(vars.cardId).queryKey,
      })
    },
  })
}

// Wave 2 AI Kanban Phase 6-B — org budget meter + inline cap editor.
//
// `useOrgBudgetUtilizationQuery` drives the <OrgBudgetMeter> on
// /ai-agents. Server-side admin gate; non-admins receive a thrown error,
// which the meter component catches by returning null. Refetch every
// 60s while mounted (D6-16) — the cap is a pre-flight check, not a
// streaming gauge, so 60s is plenty for "yes my cap-bump landed."
//
// `useUpdateOrgBudgetCapMutation` powers <EditOrgBudgetCapDialog>.
// onSuccess invalidates the utilization query so the meter reflects the
// new cap on the next paint.

export function useOrgBudgetUtilizationQuery(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryFn: () => orgBudgetRepository.getUtilization(organizationId!),
    queryKey: aiKeys.orgBudgetUtilization(organizationId ?? ''),
    refetchInterval: 60_000,
    // Non-admins get an admin-gate error from the RPC — don't retry.
    retry: false,
    staleTime: 30_000,
  })
}

export type UpdateOrgBudgetCapInput = {
  organizationId: string
  newCapUsd: number | null
}

export function useUpdateOrgBudgetCapMutation() {
  const queryClient = useQueryClient()
  const {toast} = useToast()

  return useMutation({
    mutationFn: (input: UpdateOrgBudgetCapInput) =>
      orgBudgetRepository.updateCap(input.organizationId, input.newCapUsd),
    onError: (error) => {
      toast({
        title: 'Could not update budget cap',
        description: getErrorMessage(error, 'The cap could not be saved.'),
        variant: 'error',
      })
    },
    onSuccess: (newCap, input) => {
      const formatted = newCap === null ? 'cleared' : '$' + newCap.toFixed(2)
      toast({
        title: 'Budget cap updated',
        description: `Cap is now ${formatted}.`,
        variant: 'info',
      })
      void queryClient.invalidateQueries({
        queryKey: aiKeys.orgBudgetUtilization(input.organizationId),
      })
    },
  })
}

// Wave 2 AI Kanban Phase 7-B — org dispatch + recurring quota meter.
//
// `useOrgQuotaUtilizationQuery` drives the <OrgQuotaMeter> on /ai-agents
// for free-tier orgs. Server-side admin gate; non-admins receive a
// thrown error which the meter component catches by returning null.
// Refetch every 60s — the dispatch counter changes as runs are queued
// but doesn't need streaming-grade freshness.
export function useOrgQuotaUtilizationQuery(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryFn: () => orgQuotaRepository.getUtilization(organizationId!),
    queryKey: aiKeys.orgQuotaUtilization(organizationId ?? ''),
    refetchInterval: 60_000,
    retry: false,
    staleTime: 30_000,
  })
}
