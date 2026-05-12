-- Linear-style "follow a task" — explicit per-user follower list driving
-- inbox notifications. Replaces the assignee-only comment-recipient model
-- with a fan-out across `card_followers`.
--
-- Auto-follow rules (mirroring Linear's defaults):
--   1. Card creator on cards INSERT
--   2. Card assignee on set_card_assignee (the user-facing path)
--   3. Comment author on add_card_comment
-- Plus a manual `follow_card` / `unfollow_card` RPC pair for explicit toggles.
--
-- Comment fan-out: replaces the prior assignee-only `comment_on_owned_card`
-- emission with `comment_on_followed_card`, fanned to every follower except
-- the comment author (the existing self-notify guard in
-- public.insert_notification handles the exclusion implicitly via
-- `target_origin_user_id`).
--
-- Backfill: every existing (card, assignee) and (card, creator) pair gets
-- an auto-follow row, plus distinct (card, comment author) pairs from
-- card_comments. Backfill source labels stay 'assignee_auto' /
-- 'creator_auto' / 'comment_auto' so downstream tooling can distinguish
-- explicit follows from inferred ones.
--
-- The `comment_on_owned_card` kind stays valid in
-- notifications_kind_check for historical rows; new emissions use
-- `comment_on_followed_card`.

set search_path = public;

-- ---------------------------------------------------------------
-- 1. card_followers table + RLS
-- ---------------------------------------------------------------

create table public.card_followers (
  card_id uuid not null references public.cards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (
    source in ('manual', 'assignee_auto', 'creator_auto', 'comment_auto')
  ),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (card_id, user_id)
);

-- Reverse lookup: "all cards user X follows" — used by future digest /
-- per-user dashboards. Cheap; one row per follow.
create index card_followers_user_idx
  on public.card_followers (user_id);

alter table public.card_followers enable row level security;

-- Self-select only in v1. The future "followers avatar stack" feature
-- (defer per plan §6 follow-ups) will broaden this to anyone who can
-- read the card via can_access_project.
create policy card_followers_select_self on public.card_followers
  for select
  to authenticated
  using (user_id = auth.uid());

-- All inserts and deletes flow through the SECURITY DEFINER RPCs
-- (manual path) or trigger fns (auto-follow path). No direct mutation
-- from authenticated. Supabase default-grants ALL on new tables to
-- authenticated, so the revoke must explicitly target that role (the
-- `revoke from public` form leaves authenticated grants intact).
revoke all on table public.card_followers from public;
revoke all on table public.card_followers from authenticated;
grant select on table public.card_followers to authenticated;

-- ---------------------------------------------------------------
-- 2. Extend notifications_kind_check
-- ---------------------------------------------------------------

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (
    kind in (
      'mention',
      'assignment',
      'comment_on_owned_card',
      'comment_on_followed_card',
      'drift_nudge',
      'run_completed',
      'run_awaiting_approval',
      'org_budget_warning',
      'org_budget_capped',
      'org_dispatch_quota_warning',
      'org_dispatch_quota_exceeded'
    )
  );

-- ---------------------------------------------------------------
-- 3. follow_card / unfollow_card RPCs
-- ---------------------------------------------------------------

create or replace function public.follow_card(target_card_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  card_row public.cards%rowtype;
begin
  if auth.uid() is null then
    raise exception 'follow_card: caller must be authenticated.';
  end if;

  select *
    into card_row
  from public.cards
  where id = target_card_id;

  if card_row.id is null then
    raise exception 'follow_card: card not found.';
  end if;

  -- Read-access gate. Use the same policy the cards SELECT relies on
  -- (can_access_project) so any user who can see the card can follow it.
  if not public.can_access_project(card_row.project_id) then
    raise exception 'follow_card: caller cannot read this card.';
  end if;

  insert into public.card_followers (card_id, user_id, source)
  values (target_card_id, auth.uid(), 'manual')
  on conflict (card_id, user_id) do nothing;
end;
$$;

revoke all on function public.follow_card(uuid) from public;
revoke all on function public.follow_card(uuid) from anon;
grant execute on function public.follow_card(uuid) to authenticated;

create or replace function public.unfollow_card(target_card_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'unfollow_card: caller must be authenticated.';
  end if;

  delete from public.card_followers
  where card_id = target_card_id
    and user_id = auth.uid();
end;
$$;

revoke all on function public.unfollow_card(uuid) from public;
revoke all on function public.unfollow_card(uuid) from anon;
grant execute on function public.unfollow_card(uuid) to authenticated;

-- ---------------------------------------------------------------
-- 4. Auto-follow trigger fns
-- ---------------------------------------------------------------

-- Card create → auto-follow the creator. Uses a trigger rather than
-- editing every code path that creates a card (clone_template_to_card,
-- direct INSERT via the row-level policy, etc.).
create or replace function public.cards_after_insert_auto_follow_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.created_by_user_id is not null then
    insert into public.card_followers (card_id, user_id, source)
    values (NEW.id, NEW.created_by_user_id, 'creator_auto')
    on conflict (card_id, user_id) do nothing;
  end if;
  return NEW;
end;
$$;

drop trigger if exists cards_after_insert_auto_follow on public.cards;
create trigger cards_after_insert_auto_follow
  after insert on public.cards
  for each row execute function public.cards_after_insert_auto_follow_fn();

-- ---------------------------------------------------------------
-- 5. Replace set_card_assignee → add follower upsert
-- ---------------------------------------------------------------

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

  if target_assignee_user_id is not null then
    -- Auto-follow the new assignee. Skipped for agent users (they don't
    -- consume the inbox surface). The on-conflict clause references the
    -- PK by constraint name to avoid an ambiguity with this function's
    -- `card_id` OUT parameter.
    if agent_persona_row.id is null then
      insert into public.card_followers (card_id, user_id, source)
      values (current_card.id, target_assignee_user_id, 'assignee_auto')
      on conflict on constraint card_followers_pkey do nothing;
    end if;

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
  'User-facing assignee setter. Phase 4 follow-up: detects agent persona targets (via ai_personas.agent_user_id), validates project.agents_assignable + same-org, idempotently adds the bot to project_members. Follow-card v1: also upserts (card, new_assignee, ''assignee_auto'') into card_followers for non-agent assignees. Fires insert_notification with kind=assignment on actual reassignment.';

-- ---------------------------------------------------------------
-- 6. Replace add_card_comment → fan out to followers
-- ---------------------------------------------------------------

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
  follower_row record;
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

  -- Auto-follow the commenter (Linear default). Idempotent.
  if auth.uid() is not null then
    insert into public.card_followers (card_id, user_id, source)
    values (target_card_id, auth.uid(), 'comment_auto')
    on conflict (card_id, user_id) do nothing;
  end if;

  -- Fan out to every follower. The self-notify guard inside
  -- insert_notification (target_origin_user_id == target_user_id → null)
  -- skips the comment author automatically. Dedup window stays at
  -- the default 1 hour, so a flurry of comments collapses to one
  -- notification per recipient.
  select w.organization_id into target_org_id
  from public.workspaces w
  join public.projects p on p.workspace_id = w.id
  where p.id = target_card.project_id;

  if target_org_id is not null then
    for follower_row in
      select user_id from public.card_followers
      where card_id = target_card.id
    loop
      perform public.insert_notification(
        target_user_id => follower_row.user_id,
        target_organization_id => target_org_id,
        target_kind => 'comment_on_followed_card',
        target_title => 'New comment on "' || coalesce(target_card.title, 'a card') || '"',
        target_body => substring(normalized_body for 280),
        target_link => 'card:' || target_card.id::text,
        target_project_id => target_card.project_id,
        target_card_id => target_card.id,
        target_origin_user_id => auth.uid()
      );
    end loop;
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

comment on function public.add_card_comment(uuid, text) is
  'Add a comment to a card. Follow-card v1: auto-follows the comment author, then fans out kind=comment_on_followed_card to every follower (the insert_notification self-notify guard implicitly skips the author). Replaces the assignee-only comment_on_owned_card emission from 20260504030000.';

-- ---------------------------------------------------------------
-- 7. Backfill auto-follow rows for existing data
-- ---------------------------------------------------------------

do $$
begin
  -- Existing creators (every card has a created_by_user_id).
  insert into public.card_followers (card_id, user_id, source, created_at)
  select c.id, c.created_by_user_id, 'creator_auto', timezone('utc', now())
  from public.cards c
  where c.created_by_user_id is not null
  on conflict (card_id, user_id) do nothing;

  -- Existing assignees. Skip rows that already exist under a different
  -- source (e.g., the creator path above already inserted them).
  insert into public.card_followers (card_id, user_id, source, created_at)
  select c.id, c.assignee_user_id, 'assignee_auto', timezone('utc', now())
  from public.cards c
  where c.assignee_user_id is not null
  on conflict (card_id, user_id) do nothing;

  -- Existing commenters (distinct per card to avoid noise).
  insert into public.card_followers (card_id, user_id, source, created_at)
  select distinct on (cc.card_id, cc.created_by_user_id)
    cc.card_id, cc.created_by_user_id, 'comment_auto', timezone('utc', now())
  from public.card_comments cc
  where cc.created_by_user_id is not null
  on conflict (card_id, user_id) do nothing;
end$$;
