// Wave 2 AI Kanban — Job catalog constants (renamed from "templates"
// per founder vocabulary call after the Wave 3 panel review: a "Job"
// is the prebuilt thing you pick from the catalog; cards on the AI
// Kanban are job-cards; schedules back recurring jobs).
//
// File name kept as `agent-recipes.ts` for git history; the exported
// types and constants use the `Job` vocabulary throughout.
//
// Jobs here are **pre-fills** — selecting one in `NewTaskDialog`
// hydrates Title / Description / Assign-to / Repeat with the values
// declared below. The user can still edit anything after picking.
//
// "Triage New Bugs" ships as a manual one-off because the assignee-
// change trigger fires on assignment, not on card creation. When
// event-trigger infra expands, drop `recurringDisabled` to unlock cron.

// `kind` discriminates a "task" Job (existing pattern: produces a card
// in your Personal AI Workspace) from a "monitor" Job (Wave 3: scans
// an existing project's cards and posts findings as comments). New
// jobs default to 'task' for back-compat with the original three.
export type JobKind = 'monitor' | 'task'

export type JobRequirement =
  | {
      defaultValue?: number
      key: string
      kind: 'positive_integer'
      label: string
      placeholder: string
    }
  | {
      key: string
      kind: 'project_picker'
      label: string
      placeholder: string
    }
  | {
      key: string
      kind: 'url'
      label: string
      placeholder: string
    }

// Locked persona slugs the v1 jobs dispatch to. Sara (monitor) and
// Andy (assistant) are seeded by the factory persona script and
// auto-provisioned in every org via the Phase 3c trigger.
export type JobPersonaSlug = 'andy' | 'sara'

// Repeat presets a Job can declare. Mirrors the `RepeatOption` shape
// in `NewTaskDialog.tsx` so picking a job can populate the radio
// without a translation step. `cron` carries the canonical 5-field
// expression + IANA timezone the schedule should be created with.
export type JobRepeat =
  | {
      cron: string
      kind: 'cron'
      timezone: string
    }
  | {kind: 'one_off'}

export type AgentJob = {
  // Stable id — used as `?job=` URL param + as the
  // `__source_template_slug` value stamped into `card_template` JSONB
  // for edit-mode job attribution (the JSONB key keeps its legacy name
  // to preserve attribution on already-persisted schedule rows).
  slug: string
  // What flavor of job this is. Default 'task' for back-compat with the
  // original three (Triage Bugs, Crash Log, Feedback Roundup).
  kind?: JobKind
  // User-facing display name. Appears as the radio label in the picker
  // and as the job name on the Jobs section card.
  name: string
  // 1–2 sentence description shown on the Jobs section card. Also
  // available in the picker subtext.
  description: string
  // Short trigger / persona / apply summary line — the muted text under
  // the description on each Jobs card.
  configSummary: string
  personaSlug: JobPersonaSlug
  // Pre-fill values for `NewTaskDialog` fields.
  defaultTitle: string
  defaultBodyMd: string
  defaultRepeat: JobRepeat
  // When true, the Recurring radio is disabled in NewTaskDialog with a
  // forward-looking tooltip. Triage New Bugs only.
  recurringDisabled?: true
  // Required user-supplied inputs (URL fields, positive integers,
  // project picker for monitor jobs). Empty array = no extra inputs.
  // The field values get resolved into the title/body placeholders at
  // submit time + carried on the `card_template.placeholders` JSONB
  // for the worker to substitute at clone time.
  requiresUserInput: JobRequirement[]
  // Extra fields merged into the `card_template` JSONB on submit. Tags
  // are the typical case; the worker / clone_template_to_card pipeline
  // ignores unknown JSONB keys so this is a forward-compat extension
  // point.
  cardTemplateExtras?: Record<string, unknown>
}

export const AGENT_JOBS: readonly AgentJob[] = [
  {
    cardTemplateExtras: {tags: ['bug-triage']},
    configSummary: 'Trigger: manual · Persona: Sara · Apply: Suggest only',
    defaultBodyMd:
      'Read the bug report below, set an appropriate priority, and identify the right engineer to assign based on tags or domain. Apply this job manually each time a bug card needs triage.\n\n*v1: this job does not auto-trigger on tag changes — pick it from the +New Task picker each time.*',
    defaultRepeat: {kind: 'one_off'},
    defaultTitle: 'Triage new bugs',
    description:
      'Sara reads the bug card, sets priority, and identifies the right assignee.',
    name: 'Triage New Bugs',
    personaSlug: 'sara',
    recurringDisabled: true,
    requiresUserInput: [],
    slug: 'triage-new-bugs',
  },
  {
    cardTemplateExtras: {tags: ['crash-triage', 'automated']},
    configSummary: 'Trigger: weekdays 10:00 · Persona: Sara · Apply: Suggest only',
    defaultBodyMd:
      'Read the crash log at ${crash_log_source_url} and file the top ${top_n} issues as cards. Use priority based on crash count.\n\n*Files cards in your Personal AI Workspace in v1; project targeting coming soon.*',
    defaultRepeat: {cron: '0 10 * * 1-5', kind: 'cron', timezone: 'UTC'},
    defaultTitle: 'Daily Crash Log Triage — ${date}',
    description:
      'Every weekday at 10am, Sara reads the configured crash log and files the top N issues as cards.',
    name: 'Daily Crash Log Triage',
    personaSlug: 'sara',
    requiresUserInput: [
      {
        key: 'crash_log_source_url',
        kind: 'url',
        label: 'Crash log URL',
        placeholder: 'https://crash.example.com/yesterday.json',
      },
      {
        defaultValue: 3,
        key: 'top_n',
        kind: 'positive_integer',
        label: 'Top N',
        placeholder: '3',
      },
    ],
    slug: 'daily-crash-log-triage',
  },
  {
    cardTemplateExtras: {tags: ['feedback', 'automated']},
    configSummary: 'Trigger: Fridays 16:00 · Persona: Andy · Apply: Suggest only',
    defaultBodyMd:
      'Read the feedback source at ${feedback_source_url} and file one card per discrete piece of feedback. Group similar items.\n\n*Files cards in your Personal AI Workspace in v1; project targeting coming soon.*',
    defaultRepeat: {cron: '0 16 * * 5', kind: 'cron', timezone: 'UTC'},
    defaultTitle: 'Customer Feedback Roundup — ${week}',
    description:
      'Every Friday at 4pm, Andy scans a configured feedback source and files cards for each piece.',
    name: 'Customer Feedback to Cards',
    personaSlug: 'andy',
    requiresUserInput: [
      {
        key: 'feedback_source_url',
        kind: 'url',
        label: 'Feedback source URL',
        placeholder: 'https://feedback.example.com/this-week.json',
      },
    ],
    slug: 'customer-feedback-to-cards',
  },
  {
    // Wire identifier ('sprint-health-watcher') is intentionally kept —
    // it's the slug stamped into existing card_template JSONB and the
    // key the edge function branches on. Display name + copy below
    // reflect the renamed product surface ("Sprint Manager").
    cardTemplateExtras: {tags: ['monitor', 'sprint-manager']},
    configSummary: 'Scope: a project · Daily · Persona: Sara · Suggest only',
    defaultBodyMd:
      'Sprint Manager runs once a day in the target project. The agent:\n\n1. Posts comments and messages card creators or assignees for any cards that do not have an Assignee, Due Date, or Effort (if active) fields filled out.\n2. Warns Assignees of any cards with high priority Status (e.g., Urgent/High) that are due that day.\n3. Messages Assignees and card creators (if different users) of all tasks that are overdue.\n4. Sends a beginning-of-sprint and end-of-sprint summary email to all sprint Assignees.\n\nFindings queue for your approval before posting.\n\n*This card is the schedule heartbeat — the agent does not act on it.*',
    // Cron is daily at 09:00; the actual timezone is overridden at submit
    // time with the target project's workspace timezone (see
    // NewTaskDialog handleSubmit). UTC here is a defensive fallback.
    defaultRepeat: {cron: '0 9 * * *', kind: 'cron', timezone: 'UTC'},
    defaultTitle: 'Sprint Manager',
    description:
      'Daily sprint manager: comments on incomplete cards, warns owners of due-today and overdue work, and emails sprint summaries on sprint start/end.',
    kind: 'monitor',
    name: 'Sprint Manager',
    personaSlug: 'sara',
    requiresUserInput: [
      {
        key: 'project_id',
        kind: 'project_picker',
        label: 'Project to watch',
        placeholder: 'Pick a project',
      },
    ],
    slug: 'sprint-health-watcher',
  },
] as const

export function findJobBySlug(slug: string | null | undefined): AgentJob | null {
  if (!slug) return null
  return AGENT_JOBS.find((j) => j.slug === slug) ?? null
}

// Marker key the frontend stamps into `card_template` JSONB so edit-mode
// can resolve "which job was this schedule created from?" without a
// schema change. The JSONB value keeps its original `__source_template_slug`
// string so already-persisted schedule rows continue to resolve. The
// constant identifier was renamed for vocabulary consistency.
export const SOURCE_JOB_SLUG_KEY = '__source_template_slug'
