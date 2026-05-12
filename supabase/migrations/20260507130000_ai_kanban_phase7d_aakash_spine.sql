-- AI Kanban Phase 7-D: Aakash spine persistence.
--
-- Persists the Aakash spine ratio (cards modified by agents per
-- weekly active human) into a per-org-per-week table so the metric is
-- reliably queryable from SQL without re-deriving from PostHog. Drives
-- a Phase 7.1 in-product tile (D7-9) and the GA marketing dashboard.
--
-- Adds:
--   1. metrics_org_agent_engagement table (1 row per active org per
--      ISO week, RLS deny-all, narrowed service_role grants).
--   2. metrics_aakash_spine_tick(target_week_start date default null)
--      SECURITY DEFINER fn that upserts one row per organization for
--      the requested week. NULL target_week_start = current ISO week
--      (Monday-based, UTC).
--   3. pg_cron job 'metrics-aakash-spine-tick' at 03:00 UTC daily
--      (recomputes the in-progress week, idempotent).
--   4. 4-week historical backfill via the parameterized tick.
--
-- Object count: 86 → 87 tables (metrics_org_agent_engagement),
-- 428 → 429 functions (metrics_aakash_spine_tick).
--
-- Definitions:
--   - cards_modified_by_agent(org, week) = distinct cards where an
--     `organization_members.role = 'agent'` user appears in
--     card_comments.created_by_user_id (per comment created_at) OR
--     cards.updated_by_user_id (per cards.updated_at) within the
--     7-day window, restricted to cards whose project's workspace is
--     in the org.
--
--   - weekly_active_users(org, week) = distinct human users (members
--     of the org with role <> 'agent') whose user_activity heartbeat
--     fired within the 7-day window. Caveat: user_activity is a
--     single-row "last seen" table (PK=user_id), so this signal is
--     accurate for the **in-progress week** but undercounts past
--     weeks for users who were active across multiple weeks (their
--     last_active_at rolls forward to the most recent week, dropping
--     them out of older windows). The nightly cron always recomputes
--     the current week, so live metrics are accurate; the 4-week
--     backfill should be read as best-effort historical context.
--
-- spine_ratio is a generated stored column: numeric(cards/wau) when
-- wau > 0, else null. NULL ratio for zero-WAU orgs avoids divide-by-
-- zero and signals "not enough humans this week to compute spine."

-- ============================================================
-- 1. metrics_org_agent_engagement table
-- ============================================================

create table if not exists public.metrics_org_agent_engagement (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  week_start date not null,
  cards_modified_by_agent integer not null default 0,
  weekly_active_users integer not null default 0,
  spine_ratio numeric generated always as (
    case
      when weekly_active_users > 0
        then cards_modified_by_agent::numeric / weekly_active_users
      else null
    end
  ) stored,
  computed_at timestamptz not null default timezone('utc', now()),
  primary key (organization_id, week_start)
);

-- RLS deny-all (mirrors Phase 6-B organization_budget_alert_log and
-- Phase 7-B organization_dispatch_quota_alert_log). Codex S8: narrow
-- service_role grants — tick fn only needs select/insert/update. We
-- explicitly revoke first because Supabase's default privileges grant
-- service_role all privileges on every public table at create-time.
alter table public.metrics_org_agent_engagement enable row level security;
revoke all privileges on public.metrics_org_agent_engagement from anon, authenticated;
revoke all privileges on public.metrics_org_agent_engagement from service_role;
grant select, insert, update on public.metrics_org_agent_engagement to service_role;

-- ============================================================
-- 2. metrics_aakash_spine_tick — upsert one row per org per week
-- ============================================================

create or replace function public.metrics_aakash_spine_tick(
  target_week_start date default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_week_start date := coalesce(
    target_week_start,
    date_trunc('week', timezone('utc', now()))::date
  );
  v_window_start timestamptz := v_week_start::timestamptz;
  v_window_end timestamptz := (v_week_start + interval '7 days')::timestamptz;
  v_upserted integer := 0;
begin
  -- Drive from organizations LEFT JOIN aggregates (codex S7) so every
  -- org gets a row, even those with zero activity that week. The
  -- aggregates are inline CTEs (per implementation note: no extracted
  -- view) and resolve org-membership via organization_members.
  with humans_active as (
    select
      om.organization_id,
      count(distinct ua.user_id)::integer as wau
    from public.organization_members om
    join public.user_activity ua on ua.user_id = om.user_id
    where om.role <> 'agent'
      and ua.last_active_at >= v_window_start
      and ua.last_active_at <  v_window_end
    group by om.organization_id
  ),
  agent_card_touches as (
    -- Comments authored by an agent member of the card's org.
    select distinct
      w.organization_id,
      cmt.card_id
    from public.card_comments cmt
    join public.cards crd      on crd.id = cmt.card_id
    join public.projects prj   on prj.id = crd.project_id
    join public.workspaces w   on w.id   = prj.workspace_id
    join public.organization_members om
      on om.organization_id = w.organization_id
     and om.user_id         = cmt.created_by_user_id
     and om.role            = 'agent'
    where cmt.created_at >= v_window_start
      and cmt.created_at <  v_window_end
    union
    -- Cards whose last writer was an agent member of the card's org.
    -- Note: cards.updated_at is overwritten on each edit, so this only
    -- captures the agent's edit if it was the most recent — earlier
    -- agent edits later overwritten by humans don't count. Acceptable
    -- per definition: "cards modified by agent" = cards currently
    -- attributed to an agent's edit in the window.
    select distinct
      w.organization_id,
      crd.id
    from public.cards crd
    join public.projects prj on prj.id = crd.project_id
    join public.workspaces w on w.id   = prj.workspace_id
    join public.organization_members om
      on om.organization_id = w.organization_id
     and om.user_id         = crd.updated_by_user_id
     and om.role            = 'agent'
    where crd.updated_at >= v_window_start
      and crd.updated_at <  v_window_end
  ),
  agent_modified_counts as (
    select
      organization_id,
      count(distinct card_id)::integer as cards_modified_by_agent
    from agent_card_touches
    group by organization_id
  )
  insert into public.metrics_org_agent_engagement (
    organization_id,
    week_start,
    cards_modified_by_agent,
    weekly_active_users,
    computed_at
  )
  select
    o.id,
    v_week_start,
    coalesce(amc.cards_modified_by_agent, 0),
    coalesce(ha.wau, 0),
    timezone('utc', now())
  from public.organizations o
  left join humans_active        ha  on ha.organization_id  = o.id
  left join agent_modified_counts amc on amc.organization_id = o.id
  on conflict (organization_id, week_start)
    do update set
      cards_modified_by_agent = excluded.cards_modified_by_agent,
      weekly_active_users     = excluded.weekly_active_users,
      computed_at             = excluded.computed_at;

  get diagnostics v_upserted = row_count;
  return v_upserted;
end;
$$;

revoke all on function public.metrics_aakash_spine_tick(date) from public;
revoke all on function public.metrics_aakash_spine_tick(date) from anon;
revoke all on function public.metrics_aakash_spine_tick(date) from authenticated;
grant execute on function public.metrics_aakash_spine_tick(date) to service_role;

-- ============================================================
-- 3. pg_cron schedule — daily at 03:00 UTC
-- ============================================================

-- Idempotent re-schedule (mirrors drift-watcher-hourly + ai-agent-
-- schedules-tick patterns). Daily cadence is intentional even though
-- the metric is weekly: the in-progress week's row is recomputed each
-- night so the latest week-to-date never drifts more than 24 hours
-- behind reality.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'metrics-aakash-spine-tick') then
    perform cron.unschedule('metrics-aakash-spine-tick');
  end if;
end
$$;

select cron.schedule(
  'metrics-aakash-spine-tick',
  '0 3 * * *',
  $cron$
  select public.metrics_aakash_spine_tick();
  $cron$
);

-- ============================================================
-- 4. Backfill: 4 weeks of historical data
-- ============================================================
--
-- Codex S6: parameterized tick enables historical backfill. We fill 4
-- weeks (current week + 3 prior) so the in-product tile (D7-9) has
-- enough series data to render a trend on first launch.
do $$
declare
  i integer;
begin
  for i in 0..3 loop
    perform public.metrics_aakash_spine_tick(
      (date_trunc('week', timezone('utc', now()))::date - (i * 7))
    );
  end loop;
end
$$;
