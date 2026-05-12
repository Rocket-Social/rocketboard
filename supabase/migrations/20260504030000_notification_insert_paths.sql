-- Wire the first inbox writers: card assignment and comment-on-owned-card.
--
-- Adds a SECURITY DEFINER `insert_notification` helper that handles the
-- two cross-cutting concerns from the inbox spec:
--
--   1. Self-notify prevention: never notify a user about their own action
--      (origin_user_id = target_user_id → no row).
--   2. Dedup: skip the insert if a row with the same (user_id, kind, link)
--      already exists within the dedup window. Default window is 1 hour;
--      callers like the upcoming Drift Watcher pass 24 hours.
--
-- The helper itself is service-role-only — every authorized caller is
-- another SECURITY DEFINER RPC that has already vetted the action. We
-- then patch the two RPCs that own the v1 trigger paths:
--
--   - set_card_assignee → kind='assignment' for the new assignee
--   - add_card_comment  → kind='comment_on_owned_card' for the card owner
--
-- @mention notifications are deferred — Rocketboard does not yet have
-- @mention parsing in card comments. When that ships, the parser inserts
-- kind='mention' through the same helper.

create or replace function public.insert_notification(
  target_user_id uuid,
  target_organization_id uuid,
  target_kind text,
  target_title text,
  target_body text default null,
  target_link text default null,
  target_project_id uuid default null,
  target_card_id uuid default null,
  target_origin_user_id uuid default null,
  target_origin_run_id uuid default null,
  target_dedup_window interval default interval '1 hour'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
begin
  if target_user_id is null then
    raise exception 'insert_notification: target_user_id is required.';
  end if;
  if target_organization_id is null then
    raise exception 'insert_notification: target_organization_id is required.';
  end if;
  if target_kind is null or target_title is null then
    raise exception 'insert_notification: kind and title are required.';
  end if;

  -- Self-notify guard.
  if target_origin_user_id is not null and target_origin_user_id = target_user_id then
    return null;
  end if;

  -- Dedup probe: same (user, kind, link) inside the rolling window collapses.
  -- `is not distinct from` makes NULL link match NULL link.
  if exists (
    select 1
    from public.notifications n
    where n.user_id = target_user_id
      and n.kind = target_kind
      and n.link is not distinct from target_link
      and n.created_at > timezone('utc', now()) - target_dedup_window
  ) then
    return null;
  end if;

  insert into public.notifications (
    user_id, organization_id, project_id, card_id,
    kind, title, body, link,
    origin_user_id, origin_run_id
  ) values (
    target_user_id, target_organization_id, target_project_id, target_card_id,
    target_kind, target_title, target_body, target_link,
    target_origin_user_id, target_origin_run_id
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

revoke all on function public.insert_notification(uuid, uuid, text, text, text, text, uuid, uuid, uuid, uuid, interval) from public;
revoke all on function public.insert_notification(uuid, uuid, text, text, text, text, uuid, uuid, uuid, uuid, interval) from anon, authenticated;
grant execute on function public.insert_notification(uuid, uuid, text, text, text, text, uuid, uuid, uuid, uuid, interval) to service_role;

-- ============================================================
-- set_card_assignee — emit kind='assignment' on assignee change
-- ============================================================

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
  target_org_id uuid;
begin
  select *
    into current_card
  from public.cards card
  where card.id = target_card_id
    and public.can_edit_project(card.project_id, auth.uid());

  if current_card.id is null then
    raise exception 'Card not found.';
  end if;

  if target_assignee_user_id is not null
     and not public.can_edit_project(current_card.project_id, target_assignee_user_id) then
    raise exception 'Assignee must have edit access to this project.';
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

  if target_assignee_user_id is not null then
    select organization_id
      into target_org_id
    from public.projects
    where id = current_card.project_id;

    if target_org_id is not null then
      perform public.insert_notification(
        target_user_id => target_assignee_user_id,
        target_organization_id => target_org_id,
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

-- ============================================================
-- add_card_comment — emit kind='comment_on_owned_card' for owner
-- ============================================================

create or replace function public.add_card_comment(target_card_id uuid, target_body_text text)
returns table (
  id uuid,
  author_name text,
  body_text text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_card public.cards%rowtype;
  target_org_id uuid;
  created_comment public.card_comments%rowtype;
  normalized_body text := trim(target_body_text);
begin
  select *
    into target_card
  from public.cards card
  where card.id = target_card_id
    and public.can_edit_project(card.project_id, auth.uid());

  if target_card.id is null then
    raise exception 'Card not found.';
  end if;

  if normalized_body is null or normalized_body = '' then
    raise exception 'Comment body is required.';
  end if;

  insert into public.card_comments (card_id, body_text, created_by_user_id, metadata)
  values (
    target_card_id,
    normalized_body,
    auth.uid(),
    public.current_automation_metadata()
  )
  returning * into created_comment;

  if target_card.assignee_user_id is not null then
    select organization_id
      into target_org_id
    from public.projects
    where id = target_card.project_id;

    if target_org_id is not null then
      perform public.insert_notification(
        target_user_id => target_card.assignee_user_id,
        target_organization_id => target_org_id,
        target_kind => 'comment_on_owned_card',
        target_title => 'New comment on "' || coalesce(target_card.title, 'a card') || '"',
        target_body => substring(normalized_body for 280),
        target_link => 'card:' || target_card.id::text,
        target_project_id => target_card.project_id,
        target_card_id => target_card.id,
        target_origin_user_id => auth.uid()
      );
    end if;
  end if;

  return query
  select
    created_comment.id,
    public.profile_display_name(created_comment.created_by_user_id) as author_name,
    created_comment.body_text,
    created_comment.created_at
  ;
end;
$$;
