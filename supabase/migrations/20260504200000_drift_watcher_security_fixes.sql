-- Drift Watcher retro-review security hardening.
--
-- Batch follow-up to PR #455/#456 covering five SQL-side findings from
-- the post-ship adversarial review:
--
--   A2 — Cap card_label to 200 chars in the dispatcher so a malicious
--        card title (terabyte string, ANSI escapes, RTL-override Unicode)
--        cannot bloat notifications.title or smuggle text through the
--        future Inbox renderer.
--   A3 — find_drift_watcher_candidates leaked across tenants when an
--        assignee or creator left an org but stayed on `auth.users`. The
--        watcher kept nudging them about cards they could no longer see.
--        Add an explicit organization_members membership check on the
--        resolved target_user_id.
--   A4 — Code comment at the intentional self-notify bypass site so a
--        future reader does not "fix" it. Drift Watcher has no human
--        actor; the agent must be allowed to nudge the assignee even
--        when they were the last person to touch the card.
--   N1 — record_drift_watcher_run hardcoded dispatch_reason='schedule'.
--        Parameterize so a future manual-trigger surface can record
--        dispatch_reason='manual' through the same RPC. Default keeps
--        the existing scheduled path source-compatible.
--
-- A1 (constant-time bearer compare) and N2 (UUID-validate org_id query
-- param + drift_watcher_enabled gate on manual path) are addressed in
-- the matching edge function diff. A5 (cron.job permissions) is a
-- contract assertion only.

-- ============================================================
-- A3 — find_drift_watcher_candidates
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
      -- never null. Assignee preferred when present; otherwise nudge
      -- the original author.
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
      -- Cross-tenant guard: an assignee or creator who left the org
      -- must not keep receiving drift nudges. Their auth.users row is
      -- preserved on departure (FK is ON DELETE SET NULL on assignee,
      -- ON DELETE RESTRICT on creator), so the join inside cards keeps
      -- the row, but the recipient is no longer entitled to information
      -- about cards in this org. Bind the recipient to current
      -- membership before the candidate ever surfaces.
      and exists (
        select 1
        from public.organization_members om
        where om.organization_id = workspace.organization_id
          and om.user_id = coalesce(card.assignee_user_id, card.created_by_user_id)
      )
  ),
  matched as (
    -- Priority 1: overdue (highest-signal nudge — date already passed).
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

    -- Priority 4: in active sprint, no assignee. Lowest priority because
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

-- ============================================================
-- A2 + A4 — dispatch_drift_watcher_notifications
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
    -- Cap the title used in notification text. Card titles are
    -- user-controlled and have no server-side length limit; a
    -- multi-megabyte title would balloon notifications.title and
    -- choke any future Inbox renderer that loads bodies eagerly. Cap
    -- at 200 chars (well above any reasonable card label) and trim
    -- whitespace inside the slice so the cap does not strand a
    -- trailing space mid-word.
    card_label := coalesce(nullif(trim(left(candidate.title, 200)), ''), 'A card');

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

    -- Self-notify bypass is INTENTIONAL. The Drift Watcher has no human
    -- actor — the persona is the system itself. We pass NULL here so
    -- the assignee still gets nudged about a card even if they were
    -- the last person to touch it. The 24h dedup window prevents spam.
    -- Do not "fix" this by passing a system user id; the helper would
    -- swallow the nudge under the self-notify guard.
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

-- ============================================================
-- N1 — record_drift_watcher_run dispatch_reason parameterized
-- ============================================================

-- Postgres identifies functions by (name, argument types). Adding the
-- new parameter changes the signature, so the prior 6-arg overload
-- must be dropped first to keep the function count flat and avoid
-- two coexisting overloads with subtly different defaults.
drop function if exists public.record_drift_watcher_run(
  uuid, uuid, text, timestamptz, timestamptz, text
);

create or replace function public.record_drift_watcher_run(
  target_org_id uuid,
  target_persona_id uuid,
  target_status text,
  target_started_at timestamptz,
  target_finished_at timestamptz,
  target_error_text text default null,
  target_dispatch_reason text default 'schedule'
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
  if target_dispatch_reason is null then
    raise exception 'record_drift_watcher_run: dispatch_reason is required.';
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
    target_dispatch_reason,
    target_started_at,
    target_finished_at,
    target_error_text
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

revoke all on function public.record_drift_watcher_run(uuid, uuid, text, timestamptz, timestamptz, text, text) from public;
revoke all on function public.record_drift_watcher_run(uuid, uuid, text, timestamptz, timestamptz, text, text) from anon, authenticated;
grant execute on function public.record_drift_watcher_run(uuid, uuid, text, timestamptz, timestamptz, text, text) to service_role;
