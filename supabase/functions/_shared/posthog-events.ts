// Shared PostHog event-name constants for AI agent telemetry. Mirrored
// in src/features/ai/posthog-events.ts; a unit test on the frontend side
// asserts both files agree (Deno can't import from src/, hence the dupe).
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
