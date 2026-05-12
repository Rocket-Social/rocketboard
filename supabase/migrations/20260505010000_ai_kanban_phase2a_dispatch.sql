-- AI Kanban (Wave 2 F1) — Phase 2a dispatch backbone.
--
-- Per docs/AI_KANBAN_PRD_2026_05_03.md §7.4 + §7.5 + §8.1 + §19 Phase 2.
-- Adds the SQL backbone for "agent = app user" dispatch: schedules
-- table, retry-chain link on runs, the trigger that auto-enqueues a
-- run when a card is assigned to a bot user, loop protection, and the
-- core write-path / lifecycle RPCs.
--
-- This is a *backbone* — runs land in `queued` and sit there until the
-- ai-agent-run edge function (Phase 2b/2c) picks them up. With this
-- migration applied, you can:
--   - Assign a card to a persona's bot user and watch a queued
--     ai_agent_runs row appear (manual SQL test path).
--   - Cancel a run mid-flight via cancel_agent_run.
--   - Create + pause + resume a recurring schedule (the tick that
--     fires schedules into runs lands in Phase 2b).
--
-- Schema deltas:
--   1. ai_agent_runs gains previous_run_id (PRD §7.4 retry chain link)
--      and the missing query indexes per the PRD shape.
--   2. ai_agent_schedules — new table for recurring runs.
--   3. Loop-protection helper function — counts ancestor runs in the
--      previous_run_id chain to refuse cycles.
--   4. cards_after_assignee_change_dispatch trigger — when a card's
--      assignee_user_id changes to an agent (a user mapped via
--      ai_personas.agent_user_id), enqueue a run via dispatch_agent_run.
--
-- New SECURITY DEFINER RPCs:
--   - dispatch_agent_run — central write path, idempotent against same
--     (card, persona, in-flight) — used by trigger, manual UI, schedules.
--   - pause_agent_schedule / resume_agent_schedule — schedule control.
--   - cancel_agent_run — abort an in-flight run; service_role for
--     trigger-driven auto-cancel, authenticated for user-initiated.
--
-- Approve/reject_tool_call, retry_agent_run, clone_template_to_card,
-- update_agent_schedule, ai_agent_schedules_tick + pg_cron job, and
-- the ai-agent-run edge function with 7 tools all land in Phase 2b/2c.

-- ============================================================
-- 1. ai_agent_runs — previous_run_id + indexes
-- ============================================================

alter table public.ai_agent_runs
  add column if not exists previous_run_id uuid references public.ai_agent_runs(id) on delete set null;

-- Retry-chain queries (find prior runs of a given run, find runs that
-- got retried) need this index. Partial because most runs do not have
-- a previous_run_id.
create index if not exists ai_agent_runs_previous_run_id_idx
  on public.ai_agent_runs (previous_run_id)
  where previous_run_id is not null;

-- "Show me this user's runs" surface (Personal AI Kanban Phase 3).
create index if not exists ai_agent_runs_creator_created_idx
  on public.ai_agent_runs (created_by_user_id, created_at desc);

-- ============================================================
-- 2. ai_agent_schedules
-- ============================================================

create table if not exists public.ai_agent_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  persona_id uuid not null references public.ai_personas(id) on delete cascade,
  card_template jsonb not null,
  cron_expression text not null,
  timezone text not null default 'UTC',
  target_project_id uuid references public.projects(id) on delete set null,
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  is_paused boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ai_agent_schedules_template_object check (jsonb_typeof(card_template) = 'object'),
  constraint ai_agent_schedules_cron_nonblank check (length(trim(cron_expression)) > 0),
  constraint ai_agent_schedules_timezone_nonblank check (length(trim(timezone)) > 0)
);

create trigger ai_agent_schedules_set_updated_at
  before update on public.ai_agent_schedules
  for each row execute function public.set_updated_at();

-- The pg_cron tick scans for due, unpaused schedules. Partial index
-- keeps the scan cheap as the table grows.
create index if not exists ai_agent_schedules_due_idx
  on public.ai_agent_schedules (next_run_at)
  where is_paused = false;

create index if not exists ai_agent_schedules_creator_idx
  on public.ai_agent_schedules (created_by_user_id, created_at desc);

create index if not exists ai_agent_schedules_persona_idx
  on public.ai_agent_schedules (persona_id, created_at desc);

create index if not exists ai_agent_schedules_target_project_idx
  on public.ai_agent_schedules (target_project_id, created_at desc)
  where target_project_id is not null;

alter table public.ai_agent_schedules enable row level security;

-- Owners + project members can read schedules. Service role has full
-- access for the tick + admin tooling.
create policy ai_agent_schedules_select on public.ai_agent_schedules
  for select
  to authenticated
  using (
    created_by_user_id = auth.uid()
    or (
      target_project_id is not null
      and public.can_access_project(target_project_id, auth.uid())
    )
  );

-- Owners create their own schedules. Project membership is required if
-- the schedule fires into a real project (free-form schedules in the
-- Personal AI Workspace pass target_project_id of that workspace, which
-- only the owner can edit).
create policy ai_agent_schedules_insert on public.ai_agent_schedules
  for insert
  to authenticated
  with check (
    created_by_user_id = auth.uid()
    and (
      target_project_id is null
      or public.can_edit_project(target_project_id, auth.uid())
    )
  );

create policy ai_agent_schedules_update_owner on public.ai_agent_schedules
  for update
  to authenticated
  using (created_by_user_id = auth.uid())
  with check (created_by_user_id = auth.uid());

create policy ai_agent_schedules_delete_owner on public.ai_agent_schedules
  for delete
  to authenticated
  using (created_by_user_id = auth.uid());

revoke all privileges on public.ai_agent_schedules from anon, authenticated;
grant select, insert, update, delete on public.ai_agent_schedules to authenticated;
grant all on public.ai_agent_schedules to service_role;

-- ============================================================
-- 3. Loop protection helper
-- ============================================================

-- Counts ancestor runs in the previous_run_id chain. Used by
-- dispatch_agent_run + (Phase 2b) the worker to refuse cycles like
-- A retries B retries A. Cap of 5 follows PRD §17 R8 (60s loop
-- protection trigger) — at chain length 5 the loop is firmly
-- pathological and we abort.
create or replace function public.count_agent_run_ancestors(target_run_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with recursive chain(run_id, depth) as (
    select target_run_id, 0
    union all
    select r.previous_run_id, c.depth + 1
    from chain c
    join public.ai_agent_runs r on r.id = c.run_id
    where r.previous_run_id is not null
      and c.depth < 50  -- belt-and-suspenders cap; real cap is at the caller
  )
  select coalesce(max(depth), 0) from chain;
$$;

revoke all on function public.count_agent_run_ancestors(uuid) from public;
revoke all on function public.count_agent_run_ancestors(uuid) from anon;
grant execute on function public.count_agent_run_ancestors(uuid) to authenticated, service_role;

-- ============================================================
-- 4. dispatch_agent_run — the canonical write path
-- ============================================================

create or replace function public.dispatch_agent_run(
  target_card_id uuid,
  target_persona_id uuid,
  target_dispatch_reason text default 'manual',
  target_prompt text default null,
  target_previous_run_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  card_row public.cards%rowtype;
  persona_row public.ai_personas%rowtype;
  project_row public.projects%rowtype;
  workspace_org_id uuid;
  caller_user_id uuid;
  existing_run_id uuid;
  inserted_run_id uuid;
  ancestor_depth integer;
begin
  if target_card_id is null or target_persona_id is null then
    raise exception 'dispatch_agent_run: card and persona are required.';
  end if;

  if target_dispatch_reason is null
     or target_dispatch_reason not in ('assignee_changed','manual','schedule','automation','project_monitor') then
    raise exception 'dispatch_agent_run: invalid dispatch_reason %', target_dispatch_reason;
  end if;

  caller_user_id := auth.uid();
  -- Service role contexts (triggers, schedules) have no auth.uid(). The
  -- INSERT below falls back to card.updated_by_user_id and finally
  -- card.created_by_user_id (NOT NULL, always a real auth.users row)
  -- so the fkey is always satisfied.

  select * into persona_row from public.ai_personas where id = target_persona_id;
  if persona_row.id is null then
    raise exception 'dispatch_agent_run: persona % not found.', target_persona_id;
  end if;

  if persona_row.is_enabled = false then
    raise exception 'dispatch_agent_run: persona % is disabled.', persona_row.slug;
  end if;

  -- AI Kanban dispatch only fires for assistant/monitor personas. Chat-
  -- only personas are gated by the role column added in Phase 1.
  if persona_row.role not in ('assistant','monitor') then
    raise exception 'dispatch_agent_run: persona % role % is not dispatchable.',
      persona_row.slug, persona_row.role;
  end if;

  select * into card_row from public.cards where id = target_card_id;
  if card_row.id is null then
    raise exception 'dispatch_agent_run: card % not found.', target_card_id;
  end if;

  select * into project_row from public.projects where id = card_row.project_id;
  if project_row.id is null then
    raise exception 'dispatch_agent_run: card %s project missing.', card_row.id;
  end if;

  -- Project must allow agent assignment. Strategy/exec projects flip
  -- this off; dispatch must refuse.
  if project_row.agents_assignable = false then
    raise exception 'dispatch_agent_run: project % has agents_assignable=false.', project_row.slug;
  end if;

  -- Org consistency: card -> project -> workspace -> organization.
  select w.organization_id into workspace_org_id
  from public.workspaces w
  where w.id = project_row.workspace_id;

  if workspace_org_id is null or workspace_org_id <> persona_row.organization_id then
    raise exception 'dispatch_agent_run: persona org % does not match card org %.',
      persona_row.organization_id, workspace_org_id;
  end if;

  -- Loop protection: refuse retry chains deeper than 5.
  if target_previous_run_id is not null then
    ancestor_depth := public.count_agent_run_ancestors(target_previous_run_id);
    if ancestor_depth >= 5 then
      raise exception 'dispatch_agent_run: retry chain too deep (% ancestors).', ancestor_depth;
    end if;
  end if;

  -- Idempotency: if an in-flight run already exists for this (card,
  -- persona) pair, return its id rather than enqueuing a duplicate.
  -- Trigger-driven dispatch on the same assignee change should be a
  -- no-op the second time the trigger fires.
  select id into existing_run_id
  from public.ai_agent_runs
  where card_id = target_card_id
    and persona_id = target_persona_id
    and status in ('queued', 'running', 'awaiting_approval')
  order by created_at desc
  limit 1;

  if existing_run_id is not null then
    return existing_run_id;
  end if;

  insert into public.ai_agent_runs (
    organization_id,
    project_id,
    card_id,
    persona_id,
    status,
    dispatch_reason,
    prompt,
    previous_run_id,
    created_by_user_id
  ) values (
    workspace_org_id,
    project_row.id,
    target_card_id,
    target_persona_id,
    'queued',
    target_dispatch_reason,
    target_prompt,
    target_previous_run_id,
    coalesce(caller_user_id, card_row.updated_by_user_id, card_row.created_by_user_id)
  )
  returning id into inserted_run_id;

  -- The Phase 2b/2c worker listens for this notify channel; the
  -- pull-fallback cron tick covers the case where the listener was
  -- offline at insert time.
  perform pg_notify('ai_agent_runs_queued', inserted_run_id::text);

  return inserted_run_id;
end;
$$;

revoke all on function public.dispatch_agent_run(uuid, uuid, text, text, uuid) from public;
revoke all on function public.dispatch_agent_run(uuid, uuid, text, text, uuid) from anon;
grant execute on function public.dispatch_agent_run(uuid, uuid, text, text, uuid) to authenticated, service_role;

-- ============================================================
-- 5. cards trigger — auto-dispatch on assignee change to a bot user
-- ============================================================

create or replace function public.cards_after_assignee_change_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matching_persona public.ai_personas%rowtype;
begin
  -- No-op when the column didn't actually change (handles UPDATE statements
  -- that touch other columns).
  if old.assignee_user_id is not distinct from new.assignee_user_id then
    return null;
  end if;

  -- No-op when assignee was cleared.
  if new.assignee_user_id is null then
    return null;
  end if;

  -- Resolve assignee -> persona via the agent_user_id column added in
  -- Phase 1. Non-agent assignees produce no row here, which is the
  -- REG-2 invariant (PRD §19 Phase 2): "non-agent human assignee no
  -- AI run".
  select * into matching_persona
  from public.ai_personas
  where agent_user_id = new.assignee_user_id
  limit 1;

  if matching_persona.id is null then
    return null;
  end if;

  -- The dispatch RPC handles all gating + idempotency + the ai_agent_runs
  -- write. We swallow exceptions inside the trigger so a card update
  -- doesn't fail because the persona is misconfigured — the run just
  -- doesn't get created and an error is logged for debugging.
  begin
    perform public.dispatch_agent_run(
      target_card_id => new.id,
      target_persona_id => matching_persona.id,
      target_dispatch_reason => 'assignee_changed'
    );
  exception
    when others then
      raise warning 'cards_after_assignee_change_dispatch: dispatch failed for card % persona %: %',
        new.id, matching_persona.id, sqlerrm;
  end;

  return null;
end;
$$;

drop trigger if exists cards_assignee_dispatch on public.cards;
create trigger cards_assignee_dispatch
  after update of assignee_user_id on public.cards
  for each row
  execute function public.cards_after_assignee_change_dispatch();

-- ============================================================
-- 6. pause / resume_agent_schedule
-- ============================================================

create or replace function public.pause_agent_schedule(target_schedule_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  schedule_row public.ai_agent_schedules%rowtype;
begin
  if target_schedule_id is null then
    raise exception 'pause_agent_schedule: target_schedule_id is required.';
  end if;

  select * into schedule_row from public.ai_agent_schedules where id = target_schedule_id;
  if schedule_row.id is null then
    raise exception 'pause_agent_schedule: schedule % not found.', target_schedule_id;
  end if;

  -- Owner OR project editor (mirrors the schedule update RLS).
  if schedule_row.created_by_user_id <> coalesce(auth.uid(), schedule_row.created_by_user_id)
     and (schedule_row.target_project_id is null
          or not public.can_edit_project(schedule_row.target_project_id, auth.uid())) then
    raise exception 'You do not have permission to pause this schedule.';
  end if;

  update public.ai_agent_schedules
  set is_paused = true, updated_at = timezone('utc', now())
  where id = target_schedule_id;
end;
$$;

revoke all on function public.pause_agent_schedule(uuid) from public;
revoke all on function public.pause_agent_schedule(uuid) from anon;
grant execute on function public.pause_agent_schedule(uuid) to authenticated, service_role;

create or replace function public.resume_agent_schedule(target_schedule_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  schedule_row public.ai_agent_schedules%rowtype;
begin
  if target_schedule_id is null then
    raise exception 'resume_agent_schedule: target_schedule_id is required.';
  end if;

  select * into schedule_row from public.ai_agent_schedules where id = target_schedule_id;
  if schedule_row.id is null then
    raise exception 'resume_agent_schedule: schedule % not found.', target_schedule_id;
  end if;

  if schedule_row.created_by_user_id <> coalesce(auth.uid(), schedule_row.created_by_user_id)
     and (schedule_row.target_project_id is null
          or not public.can_edit_project(schedule_row.target_project_id, auth.uid())) then
    raise exception 'You do not have permission to resume this schedule.';
  end if;

  update public.ai_agent_schedules
  set is_paused = false, updated_at = timezone('utc', now())
  where id = target_schedule_id;
end;
$$;

revoke all on function public.resume_agent_schedule(uuid) from public;
revoke all on function public.resume_agent_schedule(uuid) from anon;
grant execute on function public.resume_agent_schedule(uuid) to authenticated, service_role;

-- ============================================================
-- 7. cancel_agent_run
-- ============================================================

create or replace function public.cancel_agent_run(
  target_run_id uuid,
  target_reason text default 'user_cancelled'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  run_row public.ai_agent_runs%rowtype;
  caller_user_id uuid;
  caller_can_edit boolean;
begin
  if target_run_id is null then
    raise exception 'cancel_agent_run: target_run_id is required.';
  end if;

  caller_user_id := auth.uid();

  -- Lock the row so no concurrent mutation lands a tool call between
  -- our status check and the update.
  select * into run_row
  from public.ai_agent_runs
  where id = target_run_id
  for update;

  if run_row.id is null then
    raise exception 'cancel_agent_run: run % not found.', target_run_id;
  end if;

  -- Permission: owner of the run OR project editor OR service_role
  -- (no auth.uid()).
  caller_can_edit := false;
  if caller_user_id is null then
    -- Service role context — always allowed.
    caller_can_edit := true;
  elsif run_row.created_by_user_id = caller_user_id then
    caller_can_edit := true;
  elsif run_row.project_id is not null
        and public.can_edit_project(run_row.project_id, caller_user_id) then
    caller_can_edit := true;
  end if;

  if not caller_can_edit then
    raise exception 'You do not have permission to cancel this run.';
  end if;

  -- Idempotent: terminal-state runs are a silent no-op.
  if run_row.status not in ('queued','running','awaiting_approval') then
    return;
  end if;

  update public.ai_agent_runs
  set status = 'cancelled',
      finished_at = timezone('utc', now()),
      error_text = target_reason
  where id = target_run_id;

  -- If a streaming comment was opened, terminate it cleanly. Phase 2b's
  -- worker writes to this row; we mark it non-streaming so the inbox
  -- query stops returning it.
  if run_row.result_comment_id is not null then
    update public.card_comments
    set is_streaming = false
    where id = run_row.result_comment_id;
  end if;

  perform pg_notify('ai_agent_run_cancelled', target_run_id::text);
end;
$$;

revoke all on function public.cancel_agent_run(uuid, text) from public;
revoke all on function public.cancel_agent_run(uuid, text) from anon;
grant execute on function public.cancel_agent_run(uuid, text) to authenticated, service_role;
