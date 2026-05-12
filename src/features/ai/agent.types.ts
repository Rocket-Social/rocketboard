// Wave 2 AI Kanban — agent dispatch domain types.
//
// Phase 1 added the persona columns that turn personas into bot users.
// Phase 2a adds the run + schedule lifecycle types this file declares.
// Both backend writes and the upcoming Phase 3 UI consume these types.
//
// The shapes mirror the SQL columns in:
//   - `ai_agent_runs` (Wave 1 skeleton + Phase 2a previous_run_id)
//   - `ai_agent_schedules` (Phase 2a, new)
//
// Tool call records live inside `ai_agent_runs.tool_calls` as a JSONB
// array. The shape is owned by the Phase 2c edge function but declared
// here so client UIs can render the audit log without re-deriving it.

export type AgentRunStatus =
  | 'awaiting_approval'
  | 'cancelled'
  | 'failed'
  | 'queued'
  | 'running'
  | 'succeeded'

export type AgentRunDispatchReason =
  | 'assignee_changed'
  | 'automation'
  | 'manual'
  | 'project_monitor'
  | 'schedule'

export type AgentToolCallStatus =
  | 'awaiting_approval'
  | 'executed'
  | 'expired'
  | 'rejected'

export type AgentToolCall = {
  // Logical name of the tool the worker invoked, e.g. `add_comment` or
  // `set_card_status`. Validated against the v1 capability whitelist
  // before execution.
  tool: string
  // Args the worker proposed. Mutating tools are validated against the
  // tool's JSON schema before approval is requested.
  args: Record<string, unknown>
  status: AgentToolCallStatus
  // Set when the worker first emitted the call. ISO-8601 string in UTC.
  proposedAt: string
  // Approval/rejection metadata. All four are null until terminal.
  approvedAt: string | null
  approvedByUserId: string | null
  rejectedAt: string | null
  rejectedReason: string | null
  // Set when the call actually executed (after approval, or
  // immediately for non-mutating tools like add_comment).
  executedAt: string | null
  // Set when the call was rolled forward (retry replaces an
  // awaiting_approval call from the prior attempt).
  expiredAt: string | null
  expiredReason: string | null
  // Args the reviewer optionally edited at approval time, if the v1
  // tool schema allows it.
  editedArgs: Record<string, unknown> | null
}

export type AgentRun = {
  id: string
  organizationId: string
  projectId: string | null
  cardId: string | null
  personaId: string
  status: AgentRunStatus
  dispatchReason: AgentRunDispatchReason
  prompt: string | null
  conversationId: string | null
  resultCommentId: string | null
  toolCalls: AgentToolCall[]
  tokenCostUsd: string | null
  startedAt: string | null
  finishedAt: string | null
  createdByUserId: string | null
  errorText: string | null
  // Retry chain link — the run this run replaced. Null for first runs.
  previousRunId: string | null
  createdAt: string
  updatedAt: string
}

export type AgentScheduleCardTemplate = {
  // Minimum the schedule needs to clone a card. The template can carry
  // any subset of card fields the user fills in via the schedule form;
  // the SQL only requires it to be a JSON object.
  title?: string
  bodyMd?: string
  // Plus any other card fields the schedule wants to seed. Kept open
  // so the +New Task form (Phase 5) can extend without a type churn.
  [key: string]: unknown
}

export type AgentSchedule = {
  id: string
  organizationId: string
  personaId: string
  cardTemplate: AgentScheduleCardTemplate
  cronExpression: string
  timezone: string
  targetProjectId: string | null
  nextRunAt: string
  lastRunAt: string | null
  createdByUserId: string
  isPaused: boolean
  createdAt: string
  updatedAt: string
}

// Persona role label set, mirrored from the SQL check constraint added
// in the Phase 1 provisioning migration.
export type PersonaRole = 'assistant' | 'chat' | 'monitor' | 'retro'

// Persona shape surfaced by the AI Kanban dispatch flow. The +New Task
// modal filters its picker to entries where `role IN ('assistant',
// 'monitor')` and `agentUserId IS NOT NULL` — only provisioned bot
// users can be dispatched to.
export type AssignablePersona = {
  id: string
  name: string
  slug: string
  accentColor: string
  avatarUrl: string | null
  role: PersonaRole
  agentUserId: string
}

// Denormalized run record used by the My AI Kanban grid. Backed by a
// single SQL JOIN per PRD §8.4 — the grid never refetches persona or
// project metadata per row.
export type AgentRunPersonaContext = {
  id: string
  name: string
  slug: string
  accentColor: string | null
  avatarUrl: string | null
  role: PersonaRole | null
  agentUserId: string | null
}

export type AgentRunProjectContext = {
  id: string
  name: string
  slug: string
  kind: string
}

// Card-side context surfaced in the My AI Kanban grid. cards.title is the
// source of truth for the run's display name — clone_template_to_card
// leaves ai_agent_runs.prompt NULL, so the title the user typed in the
// +New Task modal lives only on the card.
export type AgentRunCardContext = {
  id: string
  title: string
}

export type AgentRunWithContext = AgentRun & {
  card: AgentRunCardContext | null
  persona: AgentRunPersonaContext | null
  project: AgentRunProjectContext | null
}
