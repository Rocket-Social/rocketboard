# Changelog

Rocketboard was developed privately before being open sourced. Earlier internal
release notes are intentionally omitted from this repository.

This changelog tracks public open-source releases from launch onward.

## [0.2.0] - 2026-05-12

### Added
- **AI Agents general availability.** Telemetry on every dispatch (run-level
  metrics only — no card body text, no prompt text, no API keys captured).
  Per-org calendar-month cost cap with bar-style meter on `/ai-agents`, 80%
  warning, 100% rejection. Free-tier quotas (100 dispatches/month, 1 recurring
  schedule). Per-persona hourly rate cap (default 60, NULL to opt out). Public
  operator guide at [docs/AI_AGENTS.md](./docs/AI_AGENTS.md).
- **Org-scoped API keys.** Org admins can save one Anthropic key for the
  whole organization. Admin-only write and admin-only existence visibility.
- **AI Kanban surface** at `/ai-agents` — status-grouped board for scheduled
  and one-shot agent runs, with realtime updates, per-card tool-call action
  bar, two-step "+New Task" dialog (pick a job, then configure inputs), and a
  mobile FAB.
- **Sprint Manager job.** A monitor-kind AI persona that scans a chosen
  project on a cron schedule and auto-flags cards with missing assignees or
  cards stuck in-progress for more than seven days. Each finding is queued
  for owner approval before any comment is posted.
- **`send_inbox_message` and `send_email` tool calls** for AI agents.
  Personas can request in-app notifications or send emails on behalf of their
  owner, gated through the same approval flow as other tool calls.
- **Agent persona-as-bot-user.** Each persona has a real user row provisioned
  per organization, so assigning to an agent works through the same code path
  as assigning to a person.
- **Card follows (Linear-style subscribers).** Click the bell on any card to
  follow it; see the roster of other followers in a popover. Auto-follow on
  assignment, comment, and edit.
- **`/inbox` surface** for notifications, with sidebar nav, unread badge,
  grouped notifications, and bulk actions.
- **Jira (Atlassian) integration.** OAuth flow, multi-site selection,
  scope-aware resource matching.
- **GitHub board: stats tab, setup gating, repo access controls,** and
  Activity table improvements.
- **Initiative delete** option in the initiative sidebar menu.
- **Drift watcher.** Optional hourly background job (via pg_cron) that
  monitors project drift; toggle from Org Settings.
- **Notifications + inbox preferences tables**, with assignment and
  comment-on-owned-card notifications wired through.
- **Workspace create dialog** launchable from the sidebar plus button.
- **Invite request flow** — members request access, admins approve.
- **Monday-style assignee picker** with search, X-on-chip, and no
  auto-populate. BoardView `groupBy='assignee'`. TableView assignee column
  with Asana-style X-on-hover.
- **Wiki revision history** below comments, with coalesced revision snapshots,
  stable per-page revision_number, AI affordance + context, and title in
  full-text search.
- **Canvas: FigJam-style multi-select,** equidistant spacing guides, smart
  guides, shape copy/paste, shape resize from borders, zoom dropdown, drag
  selected shapes, shape popup toolbar with text editing, color picker.
- **Sprint backlog** placement below sprint groups; sprints listed in reverse
  chronological order in the picker.
- **Standardized task scope pickers** across BoardView, TableView, and Gantt.
- **Sidebar context menus,** Monday-style scroll behavior, and project
  add/remove no longer require a hard reload.
- **Project-scoped task mode** (replaces user-scoped).
- **Global command palette** mounts everywhere; search trigger sits inline in
  the header.

### Changed
- **Anthropic OAuth** now uses a Hermes-style console-callback paste flow,
  with auto-fallback between credential kinds and better 429 error messages.
- **Sprint Manager** is the new name for what was prototyped as "Sprint
  Health Watcher".

### Fixed
- **Anthropic OAuth 429 "Error" responses** caused by missing Claude Code
  identity and beta headers.
- **Mobile hamburger** now actually opens the sidebar.
- **ConfirmDialog z-index** above CardSheet and palette so confirms always
  surface.
- **Sprint history** preserved during transient refresh failures; complete
  sprint create-next path repaired; planned sprint now marked complete on
  start_sprint failure.
- **Gantt:** date range and granularity persistence; day-scale single-column
  stretch; toolbar wrap; task-bar overrun clamp.
- **Wiki:** title rename no longer hangs on "Loading page…"; stale sidebar
  links for deleted pages cleaned up.
- **Card composer** no longer reports unsaved changes when empty.
- **Open-redirect hardening** on the GitHub callback and billing returnUrl
  parameters.
- **Tenant-isolation hardening** on invitations and four defence-in-depth
  gaps.
- **Edge function JWT verification** corrected for AI functions.
- **Custom text column truncation, priority sorting, lazy dialog load error
  dismissal,** and other small UI polish.

### Removed
- Internal sprint planning artifact previously checked into `docs/`.

## [0.1.0] - 2026-04-12

### Added
- Workspace-first collaboration across organizations, workspaces, projects, and
  multiple project views including table, kanban, gantt, document, GitHub, and
  canvas.
- Cards, comments, attachments, assignees, scheduling, custom fields, invites,
  and project sharing.
- My Notes and wiki surfaces with rich editing, autosave, comments, nested
  navigation, and document-style collaboration.
- AI agents with bring-your-own provider credentials, default personas,
  conversation history, and project-context chat.
- Self-hosting support on Supabase, including local development and deployment
  guidance for the public repository.
