-- Wave 2 AI Kanban Phase 7-B — free-tier dispatch + recurring quota enforcement.
--
-- Per Phase 7 plan ~/.claude/plans/ai-kanban-phase-7-2026-05-07.md §1.2 + §3.
--
-- Phase 7-B is the GA-gating PR. It opens the AI Kanban surface to all paid
-- AND free orgs, and uses product-level quotas as the gating mechanism for
-- free orgs (BYOK — Anthropic billing stays on the user). After this lands:
--
--   1. Free orgs (plan='free' AND no active VIP grant AND no canceled-with-grace)
--      see a 100-dispatches/calendar-month limit. The 101st dispatch raises
--      'free_tier_dispatch_quota_exceeded' from `dispatch_agent_run`.
--
--   2. Free orgs are limited to 1 active recurring schedule. New inserts
--      (or paused→active flips) past the 1st are rejected with
--      'free_tier_recurring_schedule_quota_exceeded'. Grandfathered orgs
--      with >1 already-active schedules keep their existing rows running
--      (D7-15 — no auto-pause to avoid surprising existing alpha customers).
--
--   3. Paid + VIP-granted + canceled-with-grace orgs bypass both quotas.
--
--   4. The AFTER-INSERT trigger emits 80% / 100% quota notifications
--      (idempotent per calendar month). The reject path in
--      `dispatch_agent_run` also emits the 100% notification as a
--      belt-and-suspenders fallback (codex C5).
--
-- Decisions (D7-* are locked in the plan):
--   - D7-2: 100 dispatches / calendar-month + 1 active recurring schedule
--   - D7-5: dispatch quota = calendar-month (matches Phase 6-B cost cap, UTC)
--   - D7-6: dispatch quota fires in `dispatch_agent_run` BEFORE insert
--   - D7-11: `is_paid_plan_active` mirrors `getEffectivePlan` —
--     plan IN ('pro','enterprise') AND plan_status IN ('active','past_due')
--     OR canceled-with-grace AND plan_ends_at > now()
--     OR VIP grant active
--   - D7-15: grandfathered free orgs with >1 active schedules stay running
--   - D7-18: notification kinds = `org_dispatch_quota_warning` (80%) +
--     `org_dispatch_quota_exceeded` (100%)
--
-- Eng review:
--   - A1: is_paid_plan_active includes VIP `admin_grant_plan` branch
--   - A2/A3: count-then-write race accepted; documented in plan §8 risks
--   - C1: keep dispatch_quota_alert_log separate from budget_alert_log (Phase 7.1 consolidates)
--   - P1: AFTER-INSERT trigger WHEN clause skips paid orgs (zero overhead)
--
-- Codex outside-voice:
--   - C1: is_paid_plan_active also includes plan_status='canceled' AND plan_ends_at > now() (grace window)
--   - C3: all SECURITY DEFINER fns set search_path = public, pg_temp
--   - C5: threshold math + belt-and-suspenders 100% notification from reject path
--   - C6: schedule quota via BEFORE INSERT OR UPDATE trigger (handles paused→active)
--   - S5: explicit UTC date_trunc on calendar-month dispatch helper
--
-- Object count delta: 420 → 427 functions (5 new helpers + 2 trigger fns + 1
-- modified + 1 belt-suspenders helper + 1 utilization RPC = 8 new+modified;
-- function-count baseline reflects the 7 brand-new functions and the
-- modified `dispatch_agent_run`). 85 → 86 tables (alert_log).

-- ============================================================
-- 1. Helper: is_paid_plan_active
-- ============================================================
--
-- Returns true if the org should bypass free-tier quotas. Mirrors
-- `getEffectivePlan` in src/features/billing/entitlement.types.ts:209-220:
--   - plan IN ('pro','enterprise') AND plan_status IN ('active','past_due')
--   - plan IN ('pro','enterprise') AND plan_status='canceled' AND plan_ends_at > now() (grace, codex C1)
--   - VIP grant active (admin_grant_plan IN ('pro','enterprise')
--                       AND (admin_grant_ends_at IS NULL OR admin_grant_ends_at > now()))

create or replace function public.is_paid_plan_active(target_org_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organizations o
    where o.id = target_org_id
      and (
        (o.plan in ('pro', 'enterprise') and o.plan_status in ('active', 'past_due'))
        or (
          o.plan in ('pro', 'enterprise')
          and o.plan_status = 'canceled'
          and o.plan_ends_at is not null
          and o.plan_ends_at > timezone('utc', now())
        )
        or (
          o.admin_grant_plan in ('pro', 'enterprise')
          and (
            o.admin_grant_ends_at is null
            or o.admin_grant_ends_at > timezone('utc', now())
          )
        )
      )
  )
$$;

revoke all on function public.is_paid_plan_active(uuid) from public;
revoke all on function public.is_paid_plan_active(uuid) from anon;
grant execute on function public.is_paid_plan_active(uuid) to authenticated, service_role;

-- ============================================================
-- 2. Helper: get_org_calendar_month_dispatches
-- ============================================================
--
-- Counts ai_agent_runs created in the current UTC calendar month for this
-- org. All dispatch_reasons count (manual + schedule + assignee_changed +
-- automation). Counts CREATED rows, so cap-rejected runs (which are
-- inserted as `failed`) still count toward the month — matching D7-2.

create or replace function public.get_org_calendar_month_dispatches(target_org_id uuid)
returns integer
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select count(*)::integer
  from public.ai_agent_runs r
  where r.organization_id = target_org_id
    and r.created_at >= date_trunc('month', timezone('utc', now()))
    and r.created_at <  date_trunc('month', timezone('utc', now())) + interval '1 month'
$$;

revoke all on function public.get_org_calendar_month_dispatches(uuid) from public;
revoke all on function public.get_org_calendar_month_dispatches(uuid) from anon;
grant execute on function public.get_org_calendar_month_dispatches(uuid) to authenticated, service_role;

-- ============================================================
-- 3. Helper: get_org_active_recurring_schedules
-- ============================================================
--
-- Current-state count of active (is_paused=false) recurring schedules for
-- the org. Used by both the schedule trigger (rejection path) and the
-- utilization RPC (meter display).

create or replace function public.get_org_active_recurring_schedules(target_org_id uuid)
returns integer
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select count(*)::integer
  from public.ai_agent_schedules s
  where s.organization_id = target_org_id
    and s.is_paused = false
$$;

revoke all on function public.get_org_active_recurring_schedules(uuid) from public;
revoke all on function public.get_org_active_recurring_schedules(uuid) from anon;
grant execute on function public.get_org_active_recurring_schedules(uuid) to authenticated, service_role;

-- ============================================================
-- 4. organization_dispatch_quota_alert_log — idempotency for 80% / 100% alerts
-- ============================================================
--
-- Mirrors Phase 6-B's organization_budget_alert_log pattern. RLS deny-all.
-- alert_window_start_date is the first day of the calendar month (UTC).
-- Eng review C1: kept separate from budget_alert_log; Phase 7.1 consolidates.

create table if not exists public.organization_dispatch_quota_alert_log (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  threshold_kind text not null,
  alert_window_start_date date not null,
  alerted_at timestamptz not null default timezone('utc', now()),
  primary key (organization_id, threshold_kind, alert_window_start_date),
  constraint org_dispatch_quota_alert_log_threshold_check
    check (threshold_kind in ('org_dispatch_quota_warning', 'org_dispatch_quota_exceeded'))
);

alter table public.organization_dispatch_quota_alert_log enable row level security;
revoke all privileges on public.organization_dispatch_quota_alert_log from anon, authenticated;
grant all on public.organization_dispatch_quota_alert_log to service_role;

-- ============================================================
-- 5. Extend notifications.kind constraint for new alert kinds
-- ============================================================

alter table public.notifications
  drop constraint if exists notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check check (
    kind in (
      'mention',
      'assignment',
      'comment_on_owned_card',
      'drift_nudge',
      'run_completed',
      'run_awaiting_approval',
      'org_budget_warning',
      'org_budget_capped',
      'org_dispatch_quota_warning',
      'org_dispatch_quota_exceeded'
    )
  );

-- ============================================================
-- 6. Helper: dispatch_quota_alert_emit_exceeded_if_uncrossed (codex C5 belt-suspenders)
-- ============================================================
--
-- Called from the `dispatch_agent_run` reject path so the 101st request
-- emits the exceeded notification even if the 100th somehow didn't (e.g.,
-- burst race that bypassed the AFTER-INSERT trigger). Idempotent via the
-- alert_log primary key.

create or replace function public.dispatch_quota_alert_emit_exceeded_if_uncrossed(target_org_id uuid)
returns boolean  -- true if a notification was newly emitted
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
  v_window_date date;
  v_inserted boolean := false;
begin
  v_window_date := date_trunc('month', timezone('utc', now()))::date;

  insert into public.organization_dispatch_quota_alert_log (
    organization_id, threshold_kind, alert_window_start_date
  )
  values (target_org_id, 'org_dispatch_quota_exceeded', v_window_date)
  on conflict (organization_id, threshold_kind, alert_window_start_date) do nothing;

  if not FOUND then
    return false;
  end if;

  select om.user_id
    into v_owner_id
  from public.organization_members om
  where om.organization_id = target_org_id
    and om.role = 'admin'::public.organization_role
  order by om.created_at asc
  limit 1;

  if v_owner_id is null then
    return false;
  end if;

  perform public.insert_notification(
    target_user_id => v_owner_id,
    target_organization_id => target_org_id,
    target_kind => 'org_dispatch_quota_exceeded',
    target_title => 'AI agent dispatches — 100/100 used this month',
    target_body => 'Your free-tier org has used all 100 AI agent dispatches this calendar month. New dispatches will be rejected until next month or you upgrade.',
    target_link => '/ai-agents',
    target_origin_run_id => null
  );

  return true;
end;
$$;

revoke all on function public.dispatch_quota_alert_emit_exceeded_if_uncrossed(uuid) from public;
revoke all on function public.dispatch_quota_alert_emit_exceeded_if_uncrossed(uuid) from anon, authenticated;
grant execute on function public.dispatch_quota_alert_emit_exceeded_if_uncrossed(uuid) to service_role;

-- ============================================================
-- 7. Trigger fn: ai_agent_runs_after_insert_quota_alert_fn (codex C5)
-- ============================================================
--
-- AFTER INSERT on ai_agent_runs. WHEN clause (eng review P1) skips paid
-- orgs so this only fires for free orgs. Threshold math:
--   - count >= 80 AND < 100 → emit warning (idempotent)
--   - count >= 100 → emit exceeded (idempotent)
-- Both keyed by (org, threshold_kind, calendar_month) — alert_log PK
-- enforces single emit per month.

create or replace function public.ai_agent_runs_after_insert_quota_alert_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_owner_id uuid;
  v_window_date date;
begin
  v_window_date := date_trunc('month', timezone('utc', now()))::date;

  select public.get_org_calendar_month_dispatches(NEW.organization_id) into v_count;

  -- Resolve admin recipient once; both branches use it.
  select om.user_id
    into v_owner_id
  from public.organization_members om
  where om.organization_id = NEW.organization_id
    and om.role = 'admin'::public.organization_role
  order by om.created_at asc
  limit 1;

  if v_owner_id is null then
    return NEW;
  end if;

  -- 100% exceeded — checked first so we never double-emit (warning + exceeded
  -- in the same crossing). If the 100th run lands directly past the warning
  -- threshold, only `exceeded` fires.
  if v_count >= 100 then
    insert into public.organization_dispatch_quota_alert_log (
      organization_id, threshold_kind, alert_window_start_date
    )
    values (NEW.organization_id, 'org_dispatch_quota_exceeded', v_window_date)
    on conflict (organization_id, threshold_kind, alert_window_start_date) do nothing;

    if FOUND then
      perform public.insert_notification(
        target_user_id => v_owner_id,
        target_organization_id => NEW.organization_id,
        target_kind => 'org_dispatch_quota_exceeded',
        target_title => 'AI agent dispatches — 100/100 used this month',
        target_body => 'Your free-tier org has used all 100 AI agent dispatches this calendar month. New dispatches will be rejected until next month or you upgrade.',
        target_link => '/ai-agents',
        target_origin_run_id => NEW.id
      );
    end if;
    return NEW;
  end if;

  -- 80% warning
  if v_count >= 80 then
    insert into public.organization_dispatch_quota_alert_log (
      organization_id, threshold_kind, alert_window_start_date
    )
    values (NEW.organization_id, 'org_dispatch_quota_warning', v_window_date)
    on conflict (organization_id, threshold_kind, alert_window_start_date) do nothing;

    if FOUND then
      perform public.insert_notification(
        target_user_id => v_owner_id,
        target_organization_id => NEW.organization_id,
        target_kind => 'org_dispatch_quota_warning',
        target_title => 'AI agent dispatches — 80% used this month',
        target_body => 'Your free-tier org has used ' || v_count || ' of 100 AI agent dispatches this calendar month. The remaining ' || (100 - v_count) || ' will go fast — upgrade to keep dispatching past the cap.',
        target_link => '/ai-agents',
        target_origin_run_id => NEW.id
      );
    end if;
  end if;

  return NEW;
end;
$$;

revoke all on function public.ai_agent_runs_after_insert_quota_alert_fn() from public;
revoke all on function public.ai_agent_runs_after_insert_quota_alert_fn() from anon, authenticated;
grant execute on function public.ai_agent_runs_after_insert_quota_alert_fn() to service_role;

drop trigger if exists ai_agent_runs_after_insert_quota_alert on public.ai_agent_runs;

create trigger ai_agent_runs_after_insert_quota_alert
  after insert on public.ai_agent_runs
  for each row
  when (not public.is_paid_plan_active(NEW.organization_id))
  execute function public.ai_agent_runs_after_insert_quota_alert_fn();

-- ============================================================
-- 8. Trigger fn: ai_agent_schedules_quota_check_fn (codex C6)
-- ============================================================
--
-- BEFORE INSERT OR UPDATE on ai_agent_schedules. Free orgs may have at
-- most 1 active recurring schedule. The trigger only checks transitions
-- INTO is_paused = false:
--   - INSERT with is_paused=true: skip (paused doesn't count)
--   - INSERT with is_paused=false: check
--   - UPDATE flipping is_paused true → false: check
--   - UPDATE that doesn't change is_paused (or false → true): skip
-- Paid orgs bypass via is_paid_plan_active. Grandfathered orgs with
-- multiple already-active schedules keep them (D7-15) — the count
-- excludes the row being checked, so an existing active row's UPDATE
-- doesn't count itself.

create or replace function public.ai_agent_schedules_quota_check_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_active_count integer;
begin
  -- Skip if the row is being created/updated to paused — paused schedules
  -- don't count toward the active quota.
  if NEW.is_paused = true then
    return NEW;
  end if;

  -- Skip if UPDATE didn't transition INTO active (was already active).
  if TG_OP = 'UPDATE' and OLD.is_paused = false then
    return NEW;
  end if;

  -- Paid orgs bypass.
  if public.is_paid_plan_active(NEW.organization_id) then
    return NEW;
  end if;

  -- D7-15: grandfathered orgs keep existing schedules running.
  -- Count active schedules EXCLUDING this row, so an UPDATE that's
  -- becoming the "first" active doesn't see itself.
  select count(*)::integer
    into v_active_count
  from public.ai_agent_schedules s
  where s.organization_id = NEW.organization_id
    and s.is_paused = false
    and s.id <> NEW.id;

  if v_active_count >= 1 then
    raise exception 'free_tier_recurring_schedule_quota_exceeded';
  end if;

  return NEW;
end;
$$;

revoke all on function public.ai_agent_schedules_quota_check_fn() from public;
revoke all on function public.ai_agent_schedules_quota_check_fn() from anon, authenticated;
grant execute on function public.ai_agent_schedules_quota_check_fn() to service_role;

drop trigger if exists ai_agent_schedules_quota_check on public.ai_agent_schedules;

create trigger ai_agent_schedules_quota_check
  before insert or update on public.ai_agent_schedules
  for each row
  execute function public.ai_agent_schedules_quota_check_fn();

-- ============================================================
-- 9. dispatch_agent_run — extend with free-tier quota check (D7-6)
-- ============================================================
--
-- Replaces the Phase 2a definition. Behaviour preserved (validation,
-- idempotency on existing in-flight run, INSERT + pg_notify), with an
-- added quota check between the idempotency short-circuit and the INSERT:
--
--   IF the org is free-tier (NOT is_paid_plan_active) AND the
--   calendar-month dispatch count is already >= 100, raise
--   'free_tier_dispatch_quota_exceeded'. Belt-and-suspenders: also
--   call dispatch_quota_alert_emit_exceeded_if_uncrossed so the 101st
--   request emits the exceeded notification even if the 100th somehow
--   didn't (codex C5).

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
set search_path = public, pg_temp
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
  v_dispatch_count integer;
begin
  if target_card_id is null or target_persona_id is null then
    raise exception 'dispatch_agent_run: card and persona are required.';
  end if;

  if target_dispatch_reason is null
     or target_dispatch_reason not in ('assignee_changed','manual','schedule','automation','project_monitor') then
    raise exception 'dispatch_agent_run: invalid dispatch_reason %', target_dispatch_reason;
  end if;

  caller_user_id := auth.uid();

  select * into persona_row from public.ai_personas where id = target_persona_id;
  if persona_row.id is null then
    raise exception 'dispatch_agent_run: persona % not found.', target_persona_id;
  end if;

  if persona_row.is_enabled = false then
    raise exception 'dispatch_agent_run: persona % is disabled.', persona_row.slug;
  end if;

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

  if project_row.agents_assignable = false then
    raise exception 'dispatch_agent_run: project % has agents_assignable=false.', project_row.slug;
  end if;

  select w.organization_id into workspace_org_id
  from public.workspaces w
  where w.id = project_row.workspace_id;

  if workspace_org_id is null or workspace_org_id <> persona_row.organization_id then
    raise exception 'dispatch_agent_run: persona org % does not match card org %.',
      persona_row.organization_id, workspace_org_id;
  end if;

  if target_previous_run_id is not null then
    ancestor_depth := public.count_agent_run_ancestors(target_previous_run_id);
    if ancestor_depth >= 5 then
      raise exception 'dispatch_agent_run: retry chain too deep (% ancestors).', ancestor_depth;
    end if;
  end if;

  -- Idempotency: if an in-flight run already exists for this (card,
  -- persona) pair, return its id rather than enqueuing a duplicate.
  -- This check fires BEFORE the quota check so retries on the same
  -- card-persona pair don't burn quota twice.
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

  -- Free-tier quota check (D7-6, codex C5). Eng review A5: AFTER auth +
  -- permission checks (above) so unauthorized callers get a permission
  -- error, not a quota leak. BEFORE the run-row insert so we don't burn
  -- a row on rejection.
  if not public.is_paid_plan_active(workspace_org_id) then
    v_dispatch_count := public.get_org_calendar_month_dispatches(workspace_org_id);
    if v_dispatch_count >= 100 then
      -- Belt-and-suspenders: emit the 100% notification if not already
      -- crossed. Idempotent — if the 100th already triggered the
      -- AFTER-INSERT trigger, this is a no-op.
      perform public.dispatch_quota_alert_emit_exceeded_if_uncrossed(workspace_org_id);
      raise exception 'free_tier_dispatch_quota_exceeded';
    end if;
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

  perform pg_notify('ai_agent_runs_queued', inserted_run_id::text);

  return inserted_run_id;
end;
$$;

revoke all on function public.dispatch_agent_run(uuid, uuid, text, text, uuid) from public;
revoke all on function public.dispatch_agent_run(uuid, uuid, text, text, uuid) from anon;
grant execute on function public.dispatch_agent_run(uuid, uuid, text, text, uuid) to authenticated, service_role;

-- ============================================================
-- 10. RPC: get_org_quota_utilization — admin-only, drives <OrgQuotaMeter>
-- ============================================================
--
-- Single round-trip for the meter: returns whether the org is on a paid
-- plan, current dispatch count + limit, current active recurring count +
-- limit. Frontend hides the meter for paid orgs (is_paid_plan = true).

create or replace function public.get_org_quota_utilization(target_org_id uuid)
returns table (
  is_paid_plan boolean,
  dispatches_used integer,
  dispatches_limit integer,
  recurring_used integer,
  recurring_limit integer,
  month_window_start_ts timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_paid boolean;
begin
  if not public.can_manage_organization(target_org_id) then
    raise exception 'Organization admin access required';
  end if;

  v_is_paid := public.is_paid_plan_active(target_org_id);

  return query select
    v_is_paid as is_paid_plan,
    public.get_org_calendar_month_dispatches(target_org_id) as dispatches_used,
    case when v_is_paid then -1 else 100 end as dispatches_limit,
    public.get_org_active_recurring_schedules(target_org_id) as recurring_used,
    case when v_is_paid then -1 else 1 end as recurring_limit,
    date_trunc('month', timezone('utc', now())) as month_window_start_ts;
end;
$$;

revoke all on function public.get_org_quota_utilization(uuid) from public;
revoke all on function public.get_org_quota_utilization(uuid) from anon;
grant execute on function public.get_org_quota_utilization(uuid) to authenticated, service_role;
