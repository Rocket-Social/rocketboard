-- Wave 2 AI Kanban Phase 4 follow-up: allow set_card_assignee to accept
-- agent users as assignees.
--
-- The picker (PR #470 CardSheet, PR #471 BoardView assignee mode) shows
-- agents alongside humans, but the prior set_card_assignee impl rejected
-- agents because their org_role is 'agent' (set by provision_agent_user)
-- and can_edit_project requires 'admin' or 'member'. The schedule-fire
-- path via clone_template_to_card worked because it called
-- dispatch_agent_run directly without ever going through
-- set_card_assignee, masking this bug until users tried the
-- in-UI reassign flow on a project board.
--
-- Fix: detect agent targets, validate the project allows agents and the
-- persona is in the same org, then auto-add the bot to project_members
-- so downstream RLS surfaces the card to it (idempotent insert mirroring
-- clone_template_to_card's schedule-fire path). Skip can_edit_project for
-- agents — the assignability check above is the authoritative gate.
--
-- Notification side effect (insert_notification with kind='assignment')
-- is preserved verbatim from the 20260504030000_notification_insert_paths
-- baseline so the migration-contract test continues to assert the
-- callsite. The lookup uses workspace.organization_id since
-- projects.organization_id was never added — the prior migration's read
-- of `select organization_id from public.projects` was already silently
-- broken (projects has workspace_id only); this version uses the same
-- workspace join as dispatch_agent_run.
--
-- Function signature is unchanged so the function-count baseline (416
-- after PR #470) does not move.

set search_path = public;

create or replace function public.set_card_assignee(
  target_card_id uuid,
  target_assignee_user_id uuid default null
)
returns table (
  card_id uuid,
  title text,
  body_md text,
  body_json jsonb,
  status_option_id uuid,
  priority_option_id uuid,
  assignee_name text,
  assignee_user_id uuid,
  start_at date,
  due_at date,
  effort numeric,
  tags text[],
  status_position integer,
  group_id uuid,
  group_position integer,
  sprint_id uuid,
  initiative_id uuid,
  custom_field_values jsonb,
  created_at timestamptz,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_card public.cards%rowtype;
  agent_persona_row public.ai_personas%rowtype;
  project_row public.projects%rowtype;
  project_org_id uuid;
begin
  select *
    into current_card
  from public.cards card
  where card.id = target_card_id
    and public.can_edit_project(card.project_id, auth.uid());

  if current_card.id is null then
    raise exception 'Card not found.';
  end if;

  if target_assignee_user_id is not null then
    -- Agent path: detect whether the target is an enabled
    -- assistant/monitor persona's bot user.
    select * into agent_persona_row
    from public.ai_personas
    where agent_user_id = target_assignee_user_id
      and is_enabled = true
      and role in ('assistant','monitor')
    limit 1;

    if agent_persona_row.id is not null then
      select * into project_row
      from public.projects
      where id = current_card.project_id;

      if project_row.agents_assignable = false then
        raise exception 'set_card_assignee: project % does not allow agent assignees.',
          coalesce(project_row.slug, current_card.project_id::text);
      end if;

      select w.organization_id into project_org_id
      from public.workspaces w
      where w.id = project_row.workspace_id;

      if project_org_id is null
         or project_org_id <> agent_persona_row.organization_id then
        raise exception 'set_card_assignee: agent % is not in the project organization.',
          agent_persona_row.slug;
      end if;

      -- Auto-add the bot to project_members so RLS subscriptions show
      -- the card to it. Idempotent — mirrors the same insert in
      -- clone_template_to_card for the schedule-fire path.
      insert into public.project_members (project_id, user_id, role)
      values (current_card.project_id, target_assignee_user_id, 'member'::public.scope_access_role)
      on conflict (project_id, user_id) do nothing;
    elsif not public.can_edit_project(current_card.project_id, target_assignee_user_id) then
      raise exception 'Assignee must have edit access to this project.';
    end if;
  end if;

  if current_card.assignee_user_id is not distinct from target_assignee_user_id then
    return query
    select *
    from public.get_card_rpc_rows(current_card.project_id, current_card.id);
    return;
  end if;

  update public.cards
  set
    assignee_user_id = target_assignee_user_id,
    updated_by_user_id = auth.uid()
  where id = current_card.id;

  -- Assignment notification: kind='assignment' (preserved verbatim
  -- from 20260504030000_notification_insert_paths to keep the
  -- migration-contract assertion green). Resolve org via the
  -- project → workspace join because projects has no organization_id
  -- column directly.
  if target_assignee_user_id is not null then
    select w.organization_id into project_org_id
    from public.workspaces w
    join public.projects p on p.workspace_id = w.id
    where p.id = current_card.project_id;

    if project_org_id is not null then
      perform public.insert_notification(
        target_user_id => target_assignee_user_id,
        target_organization_id => project_org_id,
        target_kind => 'assignment',
        target_title => coalesce(current_card.title, 'A card') || ' was assigned to you',
        target_body => null,
        target_link => 'card:' || current_card.id::text,
        target_project_id => current_card.project_id,
        target_card_id => current_card.id,
        target_origin_user_id => auth.uid()
      );
    end if;
  end if;

  return query
  select *
  from public.get_card_rpc_rows(current_card.project_id, current_card.id);
end;
$$;

comment on function public.set_card_assignee(uuid, uuid) is
  'User-facing assignee setter. Phase 4 follow-up: detects agent persona targets (via ai_personas.agent_user_id), validates project.agents_assignable + same-org, and idempotently adds the bot to project_members so RLS surfaces the card. Non-agent targets still go through can_edit_project. Fires insert_notification with kind=assignment on actual reassignment.';
