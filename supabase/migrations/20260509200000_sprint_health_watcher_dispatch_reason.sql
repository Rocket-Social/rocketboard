-- Wave 3 v0.5 — Sprint Health Watcher dispatch routing.
--
-- The unified Wave 2 dispatch backbone already accepts `'project_monitor'`
-- as a valid `dispatch_reason` (see Phase 2a, line 208), but every actual
-- schedule fire today calls `dispatch_agent_run` with reason `'schedule'`.
-- The new Sprint Health Watcher monitor Job needs a way for the worker
-- to recognize a run as a "scan a project, file Auto-flag comments"
-- monitor scan vs. a normal task run.
--
-- This migration extends `clone_template_to_card` to read the
-- `__source_template_slug` marker the frontend already stamps onto the
-- schedule's `card_template` JSONB and pick the right dispatch_reason:
--
--   slug='sprint-health-watcher'  →  dispatch_reason='project_monitor'
--   anything else                 →  dispatch_reason='schedule' (today's behavior)
--
-- The worker then reads `run.dispatch_reason` to switch prompts AND to
-- treat `add_comment` as mutating (queued for owner approval) rather
-- than auto-applying. No new column, no new table — just the same
-- jsonb marker the frontend was already passing through.

set search_path = public;

create or replace function public.clone_template_to_card(
  template jsonb,
  target_project_id uuid,
  target_assignee_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  project_row public.projects%rowtype;
  resolved_persona_id uuid;
  card_title text;
  card_body text;
  allocated_card_number integer;
  new_card_id uuid;
  today_date text := to_char(timezone('utc', now()), 'YYYY-MM-DD');
  today_week text := to_char(timezone('utc', now()), 'IYYY-"W"IW');
  source_slug text;
  resolved_dispatch_reason text;
begin
  if template is null or jsonb_typeof(template) <> 'object' then
    raise exception 'clone_template_to_card: template must be a JSON object.';
  end if;
  if target_project_id is null then
    raise exception 'clone_template_to_card: target_project_id is required.';
  end if;
  if target_assignee_user_id is null then
    raise exception 'clone_template_to_card: target_assignee_user_id is required.';
  end if;

  select * into project_row from public.projects where id = target_project_id;
  if project_row.id is null then
    raise exception 'clone_template_to_card: project % not found.', target_project_id;
  end if;

  select id into resolved_persona_id
  from public.ai_personas
  where agent_user_id = target_assignee_user_id
  limit 1;

  if resolved_persona_id is null then
    raise exception 'clone_template_to_card: assignee % is not a provisioned bot user.', target_assignee_user_id;
  end if;

  card_title := coalesce(template->>'title', 'Scheduled task');
  card_body := template->>'body_md';

  card_title := replace(card_title, '${date}', today_date);
  card_title := replace(card_title, '${week}', today_week);
  if card_body is not null then
    card_body := replace(card_body, '${date}', today_date);
    card_body := replace(card_body, '${week}', today_week);
  end if;

  update public.projects
  set next_card_number = next_card_number + 1
  where id = target_project_id
  returning next_card_number - 1 into allocated_card_number;

  insert into public.project_members (project_id, user_id, role)
  values (target_project_id, target_assignee_user_id, 'member'::public.scope_access_role)
  on conflict (project_id, user_id) do nothing;

  insert into public.cards (
    project_id,
    project_card_number,
    title,
    body_md,
    assignee_user_id,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    target_project_id,
    allocated_card_number,
    card_title,
    card_body,
    target_assignee_user_id,
    coalesce(auth.uid(), target_assignee_user_id),
    coalesce(auth.uid(), target_assignee_user_id)
  )
  returning id into new_card_id;

  -- Route monitor Jobs (Wave 3) to dispatch_reason='project_monitor' so
  -- the worker can branch its prompt + tool-call handling. The legacy
  -- `__source_template_slug` JSONB key is what the frontend stamps;
  -- staying on that key keeps already-persisted schedules attributable.
  source_slug := template->>'__source_template_slug';
  resolved_dispatch_reason := case
    when source_slug = 'sprint-health-watcher' then 'project_monitor'
    else 'schedule'
  end;

  perform public.dispatch_agent_run(
    target_card_id => new_card_id,
    target_persona_id => resolved_persona_id,
    target_dispatch_reason => resolved_dispatch_reason
  );

  return new_card_id;
end;
$$;

revoke all on function public.clone_template_to_card(jsonb, uuid, uuid) from public;
revoke all on function public.clone_template_to_card(jsonb, uuid, uuid) from anon;
grant execute on function public.clone_template_to_card(jsonb, uuid, uuid) to authenticated, service_role;
