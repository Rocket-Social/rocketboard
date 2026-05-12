// Wave 2 AI Kanban Phase 5 — schedule list + mutation surface.
//
// Backed by:
//   - SELECT under RLS (Phase 2a `ai_agent_schedules_select` policy:
//     creator OR project member)
//   - DELETE under RLS (Phase 2a `ai_agent_schedules_delete_owner`
//     policy: creator only)
//   - SECURITY DEFINER RPCs from Phase 2a/2b for pause / resume / update
//
// `update_agent_schedule` accepts all params nullable (null = leave
// unchanged) and recomputes `next_run_at` server-side when the cron or
// timezone changes.

import {getSupabaseBrowserClient} from '../../platform/supabase/client'
import {rpcAdapter, snakeToCamel} from '../../platform/data/rpc-adapter'
import type {AgentSchedule} from './agent.types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types lag for nested-select shapes
function aiTable(name: string): any {
  return (getSupabaseBrowserClient() as any).from(name)
}

export type UpdateAgentScheduleInput = {
  cardTemplate?: Record<string, unknown> | null
  newCronExpression?: string | null
  newPersonaId?: string | null
  newTargetProjectId?: string | null
  newTimezone?: string | null
  scheduleId: string
}

export const agentScheduleRepository = {
  /**
   * Returns schedules the caller can see under RLS — owner OR project
   * member of the schedule's target project.
   */
  async listForUser(userId: string): Promise<AgentSchedule[]> {
    const {data, error} = await aiTable('ai_agent_schedules')
      .select('*')
      .eq('created_by_user_id', userId)
      .order('is_paused', {ascending: true})
      .order('next_run_at', {ascending: true})

    if (error) throw error
    return ((data as Array<Record<string, unknown>>) ?? []).map((row) =>
      snakeToCamel<AgentSchedule>(row),
    )
  },

  /**
   * Phase 2b RPC. SECURITY DEFINER. Owner-or-editor mutation surface.
   * Recomputes `next_run_at` server-side when cron/timezone changes.
   * All params are optional — undefined fields are sent as null so the
   * RPC leaves them unchanged.
   */
  async update(input: UpdateAgentScheduleInput): Promise<void> {
    await rpcAdapter.call('update_agent_schedule', {
      new_cron_expression: input.newCronExpression ?? null,
      new_persona_id: input.newPersonaId ?? null,
      new_target_project_id: input.newTargetProjectId ?? null,
      new_template: input.cardTemplate ?? null,
      new_timezone: input.newTimezone ?? null,
      schedule_id: input.scheduleId,
    })
  },

  /**
   * Phase 2a RPC. SECURITY DEFINER. Flips `is_paused = true`. Tick worker
   * skips paused schedules.
   */
  async pause(scheduleId: string): Promise<void> {
    await rpcAdapter.call('pause_agent_schedule', {target_schedule_id: scheduleId})
  },

  /**
   * Phase 2a RPC. SECURITY DEFINER. Flips `is_paused = false` and
   * recomputes `next_run_at` so the schedule resumes from the next
   * matching cron fire.
   */
  async resume(scheduleId: string): Promise<void> {
    await rpcAdapter.call('resume_agent_schedule', {target_schedule_id: scheduleId})
  },

  /**
   * Phase 2a RLS policy `ai_agent_schedules_delete_owner` permits
   * direct DELETE for creators. Pending future runs are cancelled
   * implicitly (the tick worker won't pick up a deleted row); in-flight
   * runs are unaffected (no FK from runs to schedules).
   */
  async delete(scheduleId: string): Promise<void> {
    const {error} = await aiTable('ai_agent_schedules').delete().eq('id', scheduleId)
    if (error) throw error
  },
}
