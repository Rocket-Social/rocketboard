-- Wave 2 AI Kanban Phase 7-C — per-persona hourly rate cap.
--
-- Per Phase 7 plan ~/.claude/plans/ai-kanban-phase-7-2026-05-07.md §1.3 + §3.
--
-- Closes Phase 6 D6-11 deferred follow-up. Adds an admin-configurable
-- `max_runs_per_hour` column on `ai_personas` (default 60) and an
-- early-pickup check in `start_agent_run` that fails the run with
-- `error_text='persona_rate_limited'` once the rolling 60-min window
-- exceeds the cap. Applies to free + paid orgs both — abuse protection,
-- not a paywall.
--
-- Decisions (D7-* are locked in the plan):
--   - D7-3: default 60 runs/hr; configurable per persona via UI.
--   - D7-7: rate-cap check fires at worker pickup time, AFTER the
--     queued→running CAS so the worker owns the row before mutating it
--     (codex S4). Mirrors the cost-cap pattern.
--   - T7-5: NULL is the only bypass (admin opt-out for high-trust
--     personas). 0 is rejected by the check constraint, not bypassed
--     (codex S2).
--   - T7-6: rolling 60-min window (smoother UX, catches bursts at the
--     minute-59→60 boundary).
--
-- Codex outside-voice:
--   - C3: SECURITY DEFINER fns set search_path = public, pg_temp.
--   - S2: NULL-only bypass; 0 rejected by check constraint.
--   - S3: get_persona_hour_run_count excludes the target_run_id from
--     the count so the run being picked doesn't count against itself.
--   - S4: rate-cap check happens AFTER the queued→running CAS.
--
-- Eng review note: persona admin gate is enforced by the existing
-- `ai_personas_manage` RLS policy (org admins only for UPDATE). Adding
-- `max_runs_per_hour` to the column set is sufficient; no new RPC.
--
-- Object count delta: 427 → 428 functions (1 new helper). dispatch is
-- modified, not added. start_agent_run is replaced (drop+create same
-- signature). No table delta.

-- ============================================================
-- 1. ai_personas.max_runs_per_hour column
-- ============================================================

alter table public.ai_personas
  add column if not exists max_runs_per_hour numeric default 60
    check (
      max_runs_per_hour is null
      or (max_runs_per_hour > 0 and max_runs_per_hour <= 9999)
    );

comment on column public.ai_personas.max_runs_per_hour is
  'Rolling 60-min cap on agent runs picked up for this persona. NULL = '
  'admin opt-out (no cap). 0 is rejected by the check constraint. Default '
  '60 = one run/min average. Enforced inside start_agent_run AFTER the '
  'queued→running CAS so the worker owns the run before flagging it failed.';

-- ============================================================
-- 2. Helper: get_persona_hour_run_count
-- ============================================================
--
-- Counts ai_agent_runs for the persona created in the last hour.
-- exclude_run_id lets the rate-cap check skip the run currently being
-- picked up so it doesn't count against itself (codex S3). With cap=60,
-- the 60th run sees 59 prior (excluding itself) and succeeds; the 61st
-- sees 60 prior and is rejected.

create or replace function public.get_persona_hour_run_count(
  target_persona_id uuid,
  exclude_run_id uuid default null
)
returns integer
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select count(*)::integer
  from public.ai_agent_runs r
  where r.persona_id = target_persona_id
    and r.created_at >= now() - interval '1 hour'
    and (exclude_run_id is null or r.id <> exclude_run_id)
$$;

revoke all on function public.get_persona_hour_run_count(uuid, uuid) from public;
revoke all on function public.get_persona_hour_run_count(uuid, uuid) from anon, authenticated;
-- service_role bypasses; SECURITY DEFINER callers run as postgres.

-- ============================================================
-- 3. start_agent_run — extend with rate-cap check (D7-7, codex S4)
-- ============================================================
--
-- Replaces the Phase 6-B definition. Behaviour preserved:
--   - Validate target_run_id.
--   - Lookup org cap; pre-flight cost-cap rejection (Phase 6-B D6-2).
--   - Queued → running CAS.
-- New (Phase 7-C):
--   - If the CAS succeeded AND the persona has a non-null
--     `max_runs_per_hour`, count the persona's runs in the last hour
--     EXCLUDING this run (so it doesn't count itself).
--   - If the count >= cap, set this run to status='failed' /
--     error_text='persona_rate_limited' and return false. The worker
--     sees false, stops, and the dispatcher sees the failure surfaced
--     in My AI Kanban with the canonical error_text.
--   - Mirrors the cost-cap pattern's CAS-first ordering (codex S4) so
--     two workers never race on the same queued run.

create or replace function public.start_agent_run(target_run_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rows_affected integer;
  v_org_id uuid;
  v_cap numeric;
  v_spend numeric;
  v_persona_id uuid;
  v_max_runs numeric;
  v_recent_count integer;
begin
  if target_run_id is null then
    raise exception 'start_agent_run: target_run_id is required.';
  end if;

  select r.organization_id, o.ai_run_budget_usd_monthly_cap, r.persona_id
    into v_org_id, v_cap, v_persona_id
  from public.ai_agent_runs r
  join public.organizations o on o.id = r.organization_id
  where r.id = target_run_id
    and r.status = 'queued';

  if v_org_id is null then
    return false;
  end if;

  -- Cost-cap pre-flight (Phase 6-B D6-2): reject before the worker burns LLM dollars.
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

  -- Queued → running CAS (Phase 4 invariant). The cost cap above did NOT
  -- transition this run yet; the CAS is the single point where ownership
  -- is claimed. After the CAS the rate-cap check can safely UPDATE the
  -- row to failed without racing another worker (codex S4).
  update public.ai_agent_runs
  set status = 'running',
      started_at = timezone('utc', now())
  where id = target_run_id
    and status = 'queued';

  get diagnostics rows_affected = row_count;
  if rows_affected = 0 then
    return false;
  end if;

  -- Rate-cap check (Phase 7-C D7-7). NULL = admin opt-out (T7-5 / codex S2).
  -- Run is now status='running'; we own it. Excluding target_run_id from
  -- the count avoids off-by-one (codex S3).
  select p.max_runs_per_hour
    into v_max_runs
  from public.ai_personas p
  where p.id = v_persona_id;

  if v_max_runs is not null then
    v_recent_count := public.get_persona_hour_run_count(v_persona_id, target_run_id);
    if v_recent_count >= v_max_runs then
      update public.ai_agent_runs
      set status = 'failed',
          finished_at = timezone('utc', now()),
          error_text = 'persona_rate_limited'
      where id = target_run_id
        and status = 'running';
      return false;
    end if;
  end if;

  return true;
end;
$$;

revoke all on function public.start_agent_run(uuid) from public;
revoke all on function public.start_agent_run(uuid) from anon;
revoke all on function public.start_agent_run(uuid) from authenticated;
grant execute on function public.start_agent_run(uuid) to service_role;
