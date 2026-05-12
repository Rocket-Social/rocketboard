-- Wave 2 AI Kanban Phase 6-B — cost cap enforcement + budget alerts.
--
-- Per Phase 6 plan ~/.claude/plans/ai-kanban-phase-6-2026-05-06.md §1.4-§1.6.
--
-- This migration wires the dormant `organizations.ai_run_budget_usd_monthly_cap`
-- column (declared in Phase 2c, never enforced) into the worker's run-pickup
-- path and the org-admin Inbox flow. After this lands, an org with a non-null
-- cap will:
--
--   1. Pre-flight check at every worker pickup. If the calendar-month spend
--      already meets the cap, `start_agent_run` writes the run as
--      status='failed', error_text='org_budget_capped' and returns false.
--      The worker sees the false return and stops; no Anthropic call happens.
--
--   2. Receive 80% / 100% Inbox notifications (idempotent per-month) the
--      first time a run pushes the calendar-month spend across each
--      threshold.
--
-- Decisions (D6-* are locked in the plan):
--   - D6-1: cost-cap window is calendar-month (resets on the 1st), matches
--     Stripe billing reset semantics. Existing column comment said
--     "rolling-30d" — updated below.
--   - D6-2: rejected runs land as status='failed', error_text='org_budget_capped'
--     so dispatchers see the failure on their AI Kanban grid.
--   - D6-9: notification kinds = `org_budget_warning` (80%) + `org_budget_capped` (100%).
--   - D6-10: dedicated `organization_budget_alert_log` table for idempotency,
--     keyed on (org, threshold_kind, alert_window_start_ts).
--   - D6-19: in-product cap editor ships in this PR via `update_org_budget_cap`.
--   - Eng review A1: alert_log RLS-enabled with no policies (denies anon +
--     authenticated reads/writes). Trigger fn is SECURITY DEFINER so it can
--     INSERT regardless of caller.
--   - Eng review A2: trigger WHEN tightened to fire only on actual cost
--     transitions (token_cost_usd distinct from old AND > 0) so streaming /
--     comment UPDATEs don't re-run the alert logic.
--
-- Object count delta: 416 → 420 functions (4 new). 84 → 85 tables (alert_log).

-- ============================================================
-- 1. Update existing column comment per D6-1 (calendar-month)
-- ============================================================

comment on column public.organizations.ai_run_budget_usd_monthly_cap is
  'Calendar-month USD cap on cumulative AI agent run cost. Null = no cap. '
  'Worker rejects new runs once the calendar-month sum '
  '(date_trunc(''month'', now() in UTC)) of ai_agent_runs.token_cost_usd '
  'crosses this value. Resets at month boundary — matches Stripe billing.';

-- ============================================================
-- 2. Helper: calendar-month spend sum
-- ============================================================

-- Sums ai_agent_runs.token_cost_usd for the calendar month that contains
-- ref_ts. Default ref_ts = now() — passed explicitly from the trigger and
-- start_agent_run for testability.
--
-- SECURITY INVOKER per plan §3: keeps the helper privilege-thin. Direct
-- authenticated calls are blocked by REVOKE below; SECURITY DEFINER RPCs
-- (start_agent_run, get_org_budget_utilization, the trigger fn) all run
-- as the function owner (postgres) and therefore have implicit execute.
create or replace function public.get_org_calendar_month_spend_usd(
  target_org_id uuid,
  ref_ts timestamptz default now()
)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(token_cost_usd), 0)::numeric
  from public.ai_agent_runs
  where organization_id = target_org_id
    and finished_at is not null
    and finished_at >= date_trunc('month', ref_ts)
    and finished_at <  date_trunc('month', ref_ts) + interval '1 month'
$$;

revoke all on function public.get_org_calendar_month_spend_usd(uuid, timestamptz) from public;
revoke all on function public.get_org_calendar_month_spend_usd(uuid, timestamptz) from anon, authenticated;
-- service_role bypasses, no explicit grant needed; SECURITY DEFINER callers
-- run as postgres which has implicit execute.

-- ============================================================
-- 3. organization_budget_alert_log — idempotency for 80%/100% alerts
-- ============================================================

create table if not exists public.organization_budget_alert_log (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  threshold_kind text not null,
  alert_window_start_ts date not null,
  alerted_at timestamptz not null default timezone('utc', now()),
  primary key (organization_id, threshold_kind, alert_window_start_ts),
  constraint org_budget_alert_log_threshold_check
    check (threshold_kind in ('org_budget_warning', 'org_budget_capped'))
);

-- RLS deny-all (eng review A1): enable RLS with no policies. PostgREST
-- denies all reads + writes. Trigger fn is SECURITY DEFINER and bypasses
-- RLS via the postgres function owner.
alter table public.organization_budget_alert_log enable row level security;

revoke all privileges on public.organization_budget_alert_log from anon, authenticated;
grant all on public.organization_budget_alert_log to service_role;

-- ============================================================
-- 4. Extend notifications.kind constraint for new alert kinds
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
      'org_budget_capped'
    )
  );

-- ============================================================
-- 5. RPC get_org_budget_utilization — admin-only, drives <OrgBudgetMeter>
-- ============================================================

-- Single round-trip for the meter: returns calendar-month spend, the cap,
-- the percent consumed (null when cap is null/zero), and the month window
-- start so the UI can show "month X starts on …" if useful later.
create or replace function public.get_org_budget_utilization(target_org_id uuid)
returns table (
  calendar_month_spend_usd numeric,
  cap_usd numeric,
  percent_consumed numeric,
  month_window_start_ts timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cap numeric;
  v_spend numeric;
  v_window_start timestamptz;
  v_now timestamptz := now();
begin
  if not public.can_manage_organization(target_org_id) then
    raise exception 'Organization admin access required';
  end if;

  select ai_run_budget_usd_monthly_cap into v_cap
  from public.organizations
  where id = target_org_id;

  v_window_start := date_trunc('month', v_now);
  v_spend := public.get_org_calendar_month_spend_usd(target_org_id, v_now);

  return query select
    v_spend as calendar_month_spend_usd,
    v_cap as cap_usd,
    case
      when v_cap is null or v_cap <= 0 then null
      else round((v_spend / v_cap) * 100, 2)
    end as percent_consumed,
    v_window_start as month_window_start_ts;
end;
$$;

revoke all on function public.get_org_budget_utilization(uuid) from public;
revoke all on function public.get_org_budget_utilization(uuid) from anon;
grant execute on function public.get_org_budget_utilization(uuid) to authenticated, service_role;

-- ============================================================
-- 6. RPC update_org_budget_cap — admin-only inline cap editor (D6-19)
-- ============================================================

-- Returns the new cap value (NULL allowed = clear the cap). Bounded
-- [0, 999999.99] to avoid `numeric(10,2)` overflow on the underlying
-- column (10 total digits, 2 fractional).
create or replace function public.update_org_budget_cap(
  target_org_id uuid,
  new_cap_usd numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  result numeric;
begin
  if not public.can_manage_organization(target_org_id) then
    raise exception 'Organization admin access required';
  end if;

  if new_cap_usd is not null then
    if new_cap_usd < 0 then
      raise exception 'update_org_budget_cap: cap cannot be negative';
    end if;
    if new_cap_usd > 999999.99 then
      raise exception 'update_org_budget_cap: cap exceeds maximum (999999.99)';
    end if;
  end if;

  update public.organizations
  set ai_run_budget_usd_monthly_cap = new_cap_usd
  where id = target_org_id
  returning ai_run_budget_usd_monthly_cap into result;

  if not found then
    raise exception 'Organization not found';
  end if;

  return result;
end;
$$;

revoke all on function public.update_org_budget_cap(uuid, numeric) from public;
revoke all on function public.update_org_budget_cap(uuid, numeric) from anon;
grant execute on function public.update_org_budget_cap(uuid, numeric) to authenticated, service_role;

-- ============================================================
-- 7. start_agent_run — extend with cost-cap pre-flight check
-- ============================================================

-- Replaces the Phase 2c definition. Behaviour preserved (queued → running
-- atomic transition, returns false when the worker lost the race or the
-- run no longer exists), with an added pre-flight:
--
--   IF the org has a non-null cap AND the calendar-month spend already
--   crosses it, write the run as failed with error_text='org_budget_capped'
--   and return false. The worker will see false, stop, and the dispatcher
--   sees the failure surfaced in My AI Kanban with the canonical
--   error_text. The status transition is also wrapped in `where ... and
--   status='queued'` so the cap-rejection only fires on still-queued runs
--   (no double-write if a prior worker already moved the row).
create or replace function public.start_agent_run(target_run_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  rows_affected integer;
  v_org_id uuid;
  v_cap numeric;
  v_spend numeric;
begin
  if target_run_id is null then
    raise exception 'start_agent_run: target_run_id is required.';
  end if;

  -- Look up the run + its org cap together. We want to short-circuit
  -- when the run is no longer queued (lost the race to another worker)
  -- so we don't waste the spend aggregate.
  select r.organization_id, o.ai_run_budget_usd_monthly_cap
    into v_org_id, v_cap
  from public.ai_agent_runs r
  join public.organizations o on o.id = r.organization_id
  where r.id = target_run_id
    and r.status = 'queued';

  if v_org_id is null then
    return false;
  end if;

  -- Cap pre-flight (D6-2): reject before the worker burns LLM dollars.
  if v_cap is not null then
    v_spend := public.get_org_calendar_month_spend_usd(v_org_id, now());
    if v_spend >= v_cap then
      update public.ai_agent_runs
      set status = 'failed',
          finished_at = timezone('utc', now()),
          error_text = 'org_budget_capped'
      where id = target_run_id
        and status = 'queued';
      return false;
    end if;
  end if;

  update public.ai_agent_runs
  set status = 'running',
      started_at = timezone('utc', now())
  where id = target_run_id
    and status = 'queued';

  get diagnostics rows_affected = row_count;
  return rows_affected > 0;
end;
$$;

revoke all on function public.start_agent_run(uuid) from public;
revoke all on function public.start_agent_run(uuid) from anon;
revoke all on function public.start_agent_run(uuid) from authenticated;
grant execute on function public.start_agent_run(uuid) to service_role;

-- ============================================================
-- 8. Trigger fn: 80% + 100% notifications on token_cost_usd transitions
-- ============================================================

-- AFTER UPDATE on ai_agent_runs. Fires only when token_cost_usd changes
-- to a positive value (eng review A2 WHEN clause), so streaming UPDATEs
-- and status-only UPDATEs don't re-run the threshold logic.
--
-- Algorithm:
--   1. Look up the org's cap. Null cap = no enforcement, exit.
--   2. Find the most-recently-added admin recipient (mirrors the
--      monitor_run_failed pattern from Phase 2 — first admin wins).
--   3. Compute v_new_spend (post-UPDATE) and v_pre_spend (pre-UPDATE) so
--      we can detect threshold crossings precisely. Calendar-month
--      semantics: if the run finished_at was set inside this UPDATE and
--      lies in this month, it's already in v_new_spend.
--   4. For each threshold (80% then 100%), if v_pre_spend < threshold AND
--      v_new_spend >= threshold, attempt to insert into
--      organization_budget_alert_log. ON CONFLICT DO NOTHING means a
--      duplicate alert in the same window is a silent no-op. If FOUND
--      (i.e. the insert produced a row), emit the inbox notification.
create or replace function public.ai_agent_runs_after_update_budget_alert_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap numeric;
  v_owner_id uuid;
  v_window_start date;
  v_pre_spend numeric;
  v_new_spend numeric;
  v_threshold_value numeric;
begin
  -- Exit early if this UPDATE didn't add cost. Belt + suspenders with
  -- the WHEN clause (which already guards on `> 0` + `IS DISTINCT FROM`).
  if NEW.token_cost_usd is null or NEW.token_cost_usd <= 0 then
    return NEW;
  end if;

  select ai_run_budget_usd_monthly_cap
    into v_cap
  from public.organizations
  where id = NEW.organization_id;

  if v_cap is null or v_cap <= 0 then
    return NEW;
  end if;

  v_window_start := date_trunc('month', now())::date;

  v_new_spend := public.get_org_calendar_month_spend_usd(NEW.organization_id, now());
  -- Subtract the new value, re-add the old value. OLD.token_cost_usd is
  -- NOT NULL (column default 0); same for NEW.
  v_pre_spend := v_new_spend - NEW.token_cost_usd + coalesce(OLD.token_cost_usd, 0);

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

  -- 80% warning
  v_threshold_value := v_cap * 0.80;
  if v_pre_spend < v_threshold_value and v_new_spend >= v_threshold_value then
    insert into public.organization_budget_alert_log (
      organization_id, threshold_kind, alert_window_start_ts
    )
    values (NEW.organization_id, 'org_budget_warning', v_window_start)
    on conflict (organization_id, threshold_kind, alert_window_start_ts) do nothing;

    if FOUND then
      perform public.insert_notification(
        target_user_id => v_owner_id,
        target_organization_id => NEW.organization_id,
        target_kind => 'org_budget_warning',
        target_title => 'AI agent budget — 80% used this month',
        target_body => 'Your org has used $' || to_char(v_new_spend, 'FM999990.00')
          || ' of $' || to_char(v_cap, 'FM999990.00')
          || ' in agent runs this calendar month. Bump your cap or pause a persona to keep dispatching.',
        target_link => '/ai-agents',
        target_origin_run_id => NEW.id
      );
    end if;
  end if;

  -- 100% capped
  v_threshold_value := v_cap;
  if v_pre_spend < v_threshold_value and v_new_spend >= v_threshold_value then
    insert into public.organization_budget_alert_log (
      organization_id, threshold_kind, alert_window_start_ts
    )
    values (NEW.organization_id, 'org_budget_capped', v_window_start)
    on conflict (organization_id, threshold_kind, alert_window_start_ts) do nothing;

    if FOUND then
      perform public.insert_notification(
        target_user_id => v_owner_id,
        target_organization_id => NEW.organization_id,
        target_kind => 'org_budget_capped',
        target_title => 'AI agent budget exceeded — runs paused',
        target_body => 'Your org has reached its $' || to_char(v_cap, 'FM999990.00')
          || ' budget cap this calendar month. New agent runs are queued but won''t dispatch '
          || 'until the cap is increased or the next month starts.',
        target_link => '/ai-agents',
        target_origin_run_id => NEW.id
      );
    end if;
  end if;

  return NEW;
end;
$$;

revoke all on function public.ai_agent_runs_after_update_budget_alert_fn() from public;
revoke all on function public.ai_agent_runs_after_update_budget_alert_fn() from anon, authenticated;
grant execute on function public.ai_agent_runs_after_update_budget_alert_fn() to service_role;

drop trigger if exists ai_agent_runs_after_update_budget_alert on public.ai_agent_runs;

create trigger ai_agent_runs_after_update_budget_alert
  after update on public.ai_agent_runs
  for each row
  when (
    OLD.token_cost_usd is distinct from NEW.token_cost_usd
    and NEW.token_cost_usd > 0
  )
  execute function public.ai_agent_runs_after_update_budget_alert_fn();
