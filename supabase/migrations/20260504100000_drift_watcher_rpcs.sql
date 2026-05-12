-- Drift Watcher RPCs.
--
-- The Drift Watcher is the Wave 1 quality-monitoring background agent.
-- An hourly pg_cron job (added in a follow-up migration) hits the
-- `drift-watcher` edge function, which iterates orgs that have flipped
-- `organizations.drift_watcher_enabled = true` and runs four hard-coded
-- heuristics over their cards. For each affected card the dispatcher
-- inserts a notification with `kind='drift_nudge'` and a 24h dedup
-- window so the same card never spams the same user twice in a day.
--
-- This migration adds four SECURITY DEFINER, service-role-only RPCs that
-- keep all writes inside Postgres' privilege model rather than letting
-- the edge function client manipulate ai_personas / notifications /
-- ai_agent_runs directly with service role:
--
--   1. `get_or_create_drift_watcher_persona(target_org_id)` returns the
--      org's Drift Watcher persona, lazily creating it on first tick.
--      Per-org because `ai_personas.organization_id` is NOT NULL.
--   2. `find_drift_watcher_candidates(target_org_id, stale_threshold)`
--      returns at most one row per affected card. Card → highest-priority
--      heuristic via DISTINCT ON, so a card that's both overdue and stale
--      yields a single 'overdue' nudge. This shape is also useful for a
--      future "preview drift" admin surface.
--   3. `dispatch_drift_watcher_notifications(target_org_id, dedup_hours)`
--      iterates the candidate set and calls public.insert_notification for
--      each. Returns the count of rows that survived dedup.
--   4. `record_drift_watcher_run(...)` writes a single completed row to
--      `ai_agent_runs`. Drift Watcher v1 does not need queued/running
--      transitions; the row is inserted only after the tick finishes
--      (success or failure).

-- ============================================================
-- 1. get_or_create_drift_watcher_persona
-- ============================================================

create or replace function public.get_or_create_drift_watcher_persona(
  target_org_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  persona_id uuid;
begin
  if target_org_id is null then
    raise exception 'get_or_create_drift_watcher_persona: target_org_id is required.';
  end if;

  select id into persona_id
  from public.ai_personas
  where organization_id = target_org_id
    and slug = 'drift-watcher'
  limit 1;

  if persona_id is not null then
    return persona_id;
  end if;

  insert into public.ai_personas (
    organization_id,
    name,
    slug,
    accent_color,
    focus_area,
    system_prompt,
    is_default,
    is_enabled
  ) values (
    target_org_id,
    'Sara',
    'drift-watcher',
    'green',
    'Quality Drift Watch',
    -- Drift Watcher does not call an LLM in v1, but ai_personas.system_prompt
    -- is NOT NULL. Seed with a plausible prompt so a future version that adds
    -- LLM-authored summaries can flip on without a backfill.
    'You are Sara, the Drift Watcher. You scan cards once an hour for stale work, missing assignees, missing due dates, and overdue deadlines, then nudge the responsible person — without ever editing their card.',
    false,
    true
  )
  returning id into persona_id;

  return persona_id;
end;
$$;

revoke all on function public.get_or_create_drift_watcher_persona(uuid) from public;
revoke all on function public.get_or_create_drift_watcher_persona(uuid) from anon, authenticated;
grant execute on function public.get_or_create_drift_watcher_persona(uuid) to service_role;

-- ============================================================
-- 2. find_drift_watcher_candidates
-- ============================================================

create or replace function public.find_drift_watcher_candidates(
  target_org_id uuid,
  stale_threshold interval default interval '7 days'
)
returns table (
  card_id uuid,
  project_id uuid,
  organization_id uuid,
  title text,
  target_user_id uuid,
  heuristic text,
  due_at date,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with candidate_cards as (
    select
      card.id as card_id,
      card.project_id,
      workspace.organization_id,
      card.title,
      -- created_by_user_id is NOT NULL on cards, so target_user_id is
      -- never null. The assignee is preferred when present; otherwise
      -- nudge the original author.
      coalesce(card.assignee_user_id, card.created_by_user_id) as target_user_id,
      card.due_at,
      card.updated_at,
      card.assignee_user_id,
      card.sprint_id,
      status_option.category as status_category,
      sprint.status as sprint_status
    from public.cards card
    join public.projects proj on proj.id = card.project_id
    join public.workspaces workspace on workspace.id = proj.workspace_id
    left join public.project_status_options status_option
      on status_option.id = card.status_option_id
    left join public.project_sprints sprint on sprint.id = card.sprint_id
    where workspace.organization_id = target_org_id
      and card.archived_at is null
      and card.deleted_at is null
  ),
  matched as (
    -- Priority 1: overdue (highest-signal nudge — the date already passed).
    select
      card_id, project_id, organization_id, title, target_user_id,
      'overdue'::text as heuristic, 1 as priority, due_at, updated_at
    from candidate_cards
    where due_at is not null
      and due_at < current_date
      and (status_category is null or status_category <> 'completed')

    union all

    -- Priority 2: in active sprint but missing a due date.
    select
      card_id, project_id, organization_id, title, target_user_id,
      'missing_due_date'::text, 2, due_at, updated_at
    from candidate_cards
    where sprint_status = 'active'
      and due_at is null

    union all

    -- Priority 3: stale — sitting in a "started" status without an update.
    select
      card_id, project_id, organization_id, title, target_user_id,
      'stale'::text, 3, due_at, updated_at
    from candidate_cards
    where status_category = 'started'
      and updated_at < timezone('utc', now()) - stale_threshold

    union all

    -- Priority 4: in active sprint but no assignee. Lowest priority because
    -- the nudge goes to the card creator, not someone who already owns it.
    select
      card_id, project_id, organization_id, title, target_user_id,
      'missing_assignee'::text, 4, due_at, updated_at
    from candidate_cards
    where sprint_status = 'active'
      and assignee_user_id is null
  )
  select distinct on (card_id)
    card_id, project_id, organization_id, title, target_user_id, heuristic, due_at, updated_at
  from matched
  order by card_id, priority asc;
$$;

revoke all on function public.find_drift_watcher_candidates(uuid, interval) from public;
revoke all on function public.find_drift_watcher_candidates(uuid, interval) from anon, authenticated;
grant execute on function public.find_drift_watcher_candidates(uuid, interval) to service_role;

-- ============================================================
-- 3. dispatch_drift_watcher_notifications
-- ============================================================

create or replace function public.dispatch_drift_watcher_notifications(
  target_org_id uuid,
  dedup_hours integer default 24
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate record;
  inserted_count integer := 0;
  notification_id uuid;
  card_label text;
  notification_title text;
  notification_body text;
begin
  if target_org_id is null then
    raise exception 'dispatch_drift_watcher_notifications: target_org_id is required.';
  end if;
  if dedup_hours is null or dedup_hours <= 0 then
    raise exception 'dispatch_drift_watcher_notifications: dedup_hours must be positive.';
  end if;

  for candidate in
    select * from public.find_drift_watcher_candidates(target_org_id)
  loop
    card_label := coalesce(nullif(trim(candidate.title), ''), 'A card');

    notification_title := case candidate.heuristic
      when 'overdue' then card_label || ' is overdue'
      when 'missing_due_date' then card_label || ' is missing a due date'
      when 'stale' then card_label || ' hasn''t moved in 7 days'
      when 'missing_assignee' then card_label || ' needs an assignee'
      else 'A card needs your attention'
    end;

    notification_body := case candidate.heuristic
      when 'overdue' then 'Due ' || candidate.due_at::text || ' — please update or close this card.'
      when 'missing_due_date' then 'This card is in the active sprint but has no due date.'
      when 'stale' then 'In progress since ' || candidate.updated_at::date::text || ' with no updates.'
      when 'missing_assignee' then 'This card is in the active sprint but has no assignee.'
      else null
    end;

    notification_id := public.insert_notification(
      target_user_id => candidate.target_user_id,
      target_organization_id => candidate.organization_id,
      target_kind => 'drift_nudge',
      target_title => notification_title,
      target_body => notification_body,
      target_link => 'card:' || candidate.card_id::text,
      target_project_id => candidate.project_id,
      target_card_id => candidate.card_id,
      target_origin_user_id => null,
      target_origin_run_id => null,
      target_dedup_window => make_interval(hours => dedup_hours)
    );

    if notification_id is not null then
      inserted_count := inserted_count + 1;
    end if;
  end loop;

  return inserted_count;
end;
$$;

revoke all on function public.dispatch_drift_watcher_notifications(uuid, integer) from public;
revoke all on function public.dispatch_drift_watcher_notifications(uuid, integer) from anon, authenticated;
grant execute on function public.dispatch_drift_watcher_notifications(uuid, integer) to service_role;

-- ============================================================
-- 4. record_drift_watcher_run
-- ============================================================

create or replace function public.record_drift_watcher_run(
  target_org_id uuid,
  target_persona_id uuid,
  target_status text,
  target_started_at timestamptz,
  target_finished_at timestamptz,
  target_error_text text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
begin
  if target_org_id is null or target_persona_id is null then
    raise exception 'record_drift_watcher_run: org and persona are required.';
  end if;
  if target_status is null then
    raise exception 'record_drift_watcher_run: status is required.';
  end if;

  insert into public.ai_agent_runs (
    organization_id,
    persona_id,
    status,
    dispatch_reason,
    started_at,
    finished_at,
    error_text
  ) values (
    target_org_id,
    target_persona_id,
    target_status,
    'schedule',
    target_started_at,
    target_finished_at,
    target_error_text
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

revoke all on function public.record_drift_watcher_run(uuid, uuid, text, timestamptz, timestamptz, text) from public;
revoke all on function public.record_drift_watcher_run(uuid, uuid, text, timestamptz, timestamptz, text) from anon, authenticated;
grant execute on function public.record_drift_watcher_run(uuid, uuid, text, timestamptz, timestamptz, text) to service_role;
