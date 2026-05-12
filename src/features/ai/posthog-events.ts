// Frontend mirror of supabase/functions/_shared/posthog-events.ts.
//
// Deno can't import from src/, so the constants are duplicated. The
// unit test in posthog-events.test.ts asserts both files agree by
// reading the edge file at compile time and comparing keys/values.
//
// Per Phase 6 plan D6-15.

export const AI_AGENT_EVENT = {
  RUN_DISPATCHED: 'agent_run_dispatched',
  RUN_STARTED: 'agent_run_started',
  RUN_COMPLETED: 'agent_run_completed',
  RUN_FAILED: 'agent_run_failed',
  TOOL_CALL_EMITTED: 'tool_call_emitted',
  TOOL_CALL_APPROVED: 'tool_call_approved',
  TOOL_CALL_REJECTED: 'tool_call_rejected',
  RECURRING_SCHEDULE_CREATED: 'recurring_schedule_created',
  TEMPLATE_PICKED: 'template_picked',
} as const

export type AiAgentEventName = (typeof AI_AGENT_EVENT)[keyof typeof AI_AGENT_EVENT]
