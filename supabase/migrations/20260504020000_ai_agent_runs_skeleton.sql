-- Canonical "this AI agent did a thing" run table.
--
-- This is the *skeleton*: the upcoming Quality Drift Watcher writes
-- through it (one row per hourly tick), and a wider AI dispatch pipeline
-- will extend the worker side. Schema is intentionally permissive about
-- nulls because Wave 1 only emits org-scoped scheduled runs (no card,
-- no project, no conversation, no result comment, no human dispatcher).
-- Later phases will add NOT NULL gates as those code paths come online.

create table public.ai_agent_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  card_id uuid references public.cards(id) on delete set null,
  persona_id uuid not null references public.ai_personas(id) on delete cascade,
  status text not null default 'queued',
  dispatch_reason text not null,
  prompt text,
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  result_comment_id uuid references public.card_comments(id) on delete set null,
  tool_calls jsonb not null default '[]'::jsonb,
  token_cost_usd numeric not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  error_text text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ai_agent_runs_status_check check (
    status in ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'awaiting_approval')
  ),
  constraint ai_agent_runs_dispatch_reason_check check (
    dispatch_reason in ('assignee_changed', 'manual', 'schedule', 'automation', 'project_monitor')
  )
);

create trigger set_ai_agent_runs_updated_at
  before update on public.ai_agent_runs
  for each row execute function public.set_updated_at();

-- Org-scoped browse: list a tenant's runs newest-first. Drives any future
-- "AI activity" admin surface plus the per-card drilldown.
create index ai_agent_runs_org_created_idx
  on public.ai_agent_runs (organization_id, created_at desc);

create index ai_agent_runs_persona_created_idx
  on public.ai_agent_runs (persona_id, created_at desc);

-- Pending-work index for the future worker poll (status in queued/running/awaiting_approval).
-- Partial keeps the index tiny — terminal states dominate row counts.
create index ai_agent_runs_pending_idx
  on public.ai_agent_runs (status, created_at)
  where status in ('queued', 'running', 'awaiting_approval');

-- Per-card drilldown when a card has been touched by an agent.
create index ai_agent_runs_card_created_idx
  on public.ai_agent_runs (card_id, created_at desc)
  where card_id is not null;

alter table public.ai_agent_runs enable row level security;

-- Org members can read their org's run history. Project-level scoping
-- can tighten this in a later phase once dispatched runs become
-- card-bound; for the Wave 1 drift-watcher writer the runs are all
-- org-scoped so org membership is the right grant.
create policy ai_agent_runs_select_org_member on public.ai_agent_runs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members om
      where om.organization_id = ai_agent_runs.organization_id
        and om.user_id = auth.uid()
    )
  );

-- No INSERT / UPDATE / DELETE policies for authenticated. Inserts and
-- lifecycle transitions come from the Drift Watcher edge function and
-- (later) the AI dispatcher, both running as service_role.

revoke all privileges on public.ai_agent_runs from anon, authenticated;
grant select on public.ai_agent_runs to authenticated;
grant all on public.ai_agent_runs to service_role;

-- Now that ai_agent_runs exists, attach the foreign key on
-- notifications.origin_run_id. ON DELETE SET NULL preserves the user's
-- inbox row even if the source run is later purged.
alter table public.notifications
  add constraint notifications_origin_run_id_fk
  foreign key (origin_run_id)
  references public.ai_agent_runs(id)
  on delete set null;

-- Tighten Phase 1a's grants on notifications + inbox_preferences. The
-- earlier migration revoked from `public` but Supabase grants ALL on
-- new tables to `authenticated` by default; revoking explicitly is the
-- only way to lock writes down to service_role for notifications.
revoke all privileges on public.notifications from anon, authenticated;
grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;

revoke all privileges on public.inbox_preferences from anon, authenticated;
grant select, insert, update, delete on public.inbox_preferences to authenticated;
grant all on public.inbox_preferences to service_role;
