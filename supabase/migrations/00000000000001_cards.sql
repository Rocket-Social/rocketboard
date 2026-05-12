-- Cards: status/priority options, groups, sprints, cards, comments, rich text helpers.
-- Canonical greenfield owner file. Modify in place.

create table public.project_status_options (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  label text not null,
  key text not null,
  category text not null,
  position integer not null default 0,
  is_default boolean not null default false,
  color text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint pso_project_key_unique unique (project_id, key),
  constraint pso_label_not_blank check (length(trim(label)) > 0),
  constraint pso_valid_category check (category in ('not_started', 'started', 'completed'))
);

create index pso_project_id_idx on public.project_status_options (project_id, category, position);

create trigger pso_set_updated_at
before update on public.project_status_options
for each row execute function public.set_updated_at();

alter table public.project_status_options enable row level security;

create policy pso_select_for_members
on public.project_status_options
for select
to authenticated
using (
  public.can_access_project(project_id)
  and public.project_is_active(project_id)
);

create table public.project_priority_options (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  label text not null,
  key text not null,
  sort_order integer not null default 0,
  color text,
  is_default boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ppo_project_key_unique unique (project_id, key),
  constraint ppo_label_not_blank check (length(trim(label)) > 0)
);

create index ppo_project_id_idx on public.project_priority_options (project_id, sort_order);

create trigger ppo_set_updated_at
before update on public.project_priority_options
for each row execute function public.set_updated_at();

alter table public.project_priority_options enable row level security;

create policy ppo_select_for_members
on public.project_priority_options
for select
to authenticated
using (
  public.can_access_project(project_id)
  and public.project_is_active(project_id)
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  project_card_number integer not null,
  title text not null,
  body_md text,
  status_option_id uuid references public.project_status_options (id) on delete set null,
  priority_option_id uuid references public.project_priority_options (id) on delete set null,
  assignee_user_id uuid references auth.users (id) on delete set null,
  start_at date,
  due_at date,
  effort integer not null default 1,
  blocked_reason text,
  tags text[] not null default '{}'::text[],
  custom_data jsonb not null default '{}'::jsonb,
  position integer not null default 0,
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  updated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  archived_at timestamptz,
  archived_by_user_id uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by_user_id uuid references auth.users (id) on delete set null,
  initiative_id uuid,
  constraint cards_project_card_number_positive check (project_card_number >= 1),
  constraint cards_project_card_number_key unique (project_id, project_card_number),
  constraint cards_effort_nonnegative check (effort >= 0),
  constraint cards_lifecycle_mutex check (not (archived_at is not null and deleted_at is not null))
);

create index cards_project_id_idx on public.cards (project_id, position)
  where archived_at is null and deleted_at is null;

create index cards_project_status_option_idx on public.cards (project_id, status_option_id, position)
  where archived_at is null and deleted_at is null;

create index cards_assignee_user_id_idx on public.cards (assignee_user_id)
  where archived_at is null and deleted_at is null;

create index cards_project_archived_idx on public.cards (project_id, archived_at)
  where archived_at is not null;

create index cards_project_deleted_idx on public.cards (project_id, deleted_at)
  where deleted_at is not null;

create trigger cards_set_updated_at
before update on public.cards
for each row execute function public.set_updated_at();

create trigger cards_auto_touch_project
  after insert or update or delete on public.cards
  for each row execute function public.trigger_touch_project();

alter table public.cards enable row level security;

create policy cards_select_active
on public.cards
for select
to authenticated
using (
  public.can_access_project(project_id)
  and public.project_is_active(project_id)
  and archived_at is null
  and deleted_at is null
);

create table public.card_comments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  body_text text not null,
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now())
);

create index card_comments_card_id_idx on public.card_comments (card_id, created_at);

alter table public.card_comments enable row level security;

create policy card_comments_select_for_members
on public.card_comments
for select
to authenticated
using (
  exists (
    select 1
    from public.cards card
    where card.id = card_comments.card_id
      and public.can_access_project(card.project_id)
  )
);

-- card_field_values RLS policy removed: values now on cards.custom_data

-- ── Write RLS policies for cards domain ────────────────────────────

create policy cards_insert_for_members on public.cards
  for insert to authenticated with check (
    public.can_edit_project(project_id)
    and public.project_is_active(project_id)
  );

create policy cards_update_for_members on public.cards
  for update to authenticated using (
    public.can_edit_project(project_id)
    and public.project_is_active(project_id)
  );

create policy cards_delete_for_members on public.cards
  for delete to authenticated using (
    public.can_edit_project(project_id)
  );

create policy card_comments_insert_for_members on public.card_comments
  for insert to authenticated with check (
    exists (
      select 1 from public.cards card
      where card.id = card_comments.card_id
        and public.can_edit_project(card.project_id)
    )
  );

create policy pso_insert_for_managers on public.project_status_options
  for insert to authenticated with check (public.can_edit_project(project_id));

create policy pso_update_for_managers on public.project_status_options
  for update to authenticated using (public.can_edit_project(project_id));

create policy pso_delete_for_managers on public.project_status_options
  for delete to authenticated using (public.can_edit_project(project_id));

create policy ppo_insert_for_managers on public.project_priority_options
  for insert to authenticated with check (public.can_edit_project(project_id));

create policy ppo_update_for_managers on public.project_priority_options
  for update to authenticated using (public.can_edit_project(project_id));

create policy ppo_delete_for_managers on public.project_priority_options
  for delete to authenticated using (public.can_edit_project(project_id));

create table public.project_groups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  label text not null,
  position integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  updated_by_user_id uuid not null references auth.users (id) on delete restrict,
  constraint project_groups_label_not_blank check (length(trim(label)) > 0)
);

create unique index project_groups_project_label_key
  on public.project_groups (project_id, lower(trim(label)));

create index project_groups_project_id_idx
  on public.project_groups (project_id, position, created_at);

create trigger project_groups_set_updated_at
before update on public.project_groups
for each row execute function public.set_updated_at();

create trigger project_groups_auto_touch_project
  after insert or update or delete on public.project_groups
  for each row execute function public.trigger_touch_project();

alter table public.project_groups enable row level security;

create policy project_groups_select_for_members
on public.project_groups
for select
to authenticated
using (public.can_access_project(project_id));

create policy project_groups_insert_for_managers on public.project_groups
  for insert to authenticated with check (public.can_edit_project(project_id));

create policy project_groups_update_for_managers on public.project_groups
  for update to authenticated using (public.can_edit_project(project_id));

create policy project_groups_delete_for_managers on public.project_groups
  for delete to authenticated using (public.can_edit_project(project_id));

alter table public.cards
  add column if not exists group_id uuid references public.project_groups (id) on delete set null,
  add column if not exists group_position integer not null default 0;

create index cards_project_group_idx
  on public.cards (project_id, group_id, group_position);

create or replace function public.get_project_groups(target_project_id uuid)
returns table (
  group_id uuid,
  label text,
  group_position integer,
  project_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    project_group.id as group_id,
    project_group.label,
    project_group.position as group_position,
    project_group.project_id,
    project_group.created_at,
    project_group.updated_at
  from public.project_groups project_group
  where project_group.project_id = target_project_id
    and public.can_access_project(target_project_id, auth.uid())
  order by project_group.position asc, project_group.created_at asc, project_group.id asc;
$$;

revoke all on function public.get_project_groups(uuid) from public;

grant execute on function public.get_project_groups(uuid) to authenticated;

create table public.project_sprints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  goal text,
  start_date date,
  end_date date,
  status public.sprint_status not null default 'planned',
  position integer not null default 0,
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  updated_by_user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  constraint project_sprints_name_not_blank check (length(trim(name)) > 0),
  constraint project_sprints_date_order check (start_date is null or end_date is null or start_date <= end_date),
  constraint project_sprints_completed_consistency check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  )
);

create unique index project_sprints_project_name_key
  on public.project_sprints (project_id, lower(trim(name)));

create index project_sprints_project_id_idx
  on public.project_sprints (project_id, position, created_at);

create unique index project_sprints_one_active_per_project
  on public.project_sprints (project_id) where status = 'active';

create trigger project_sprints_set_updated_at
before update on public.project_sprints
for each row execute function public.set_updated_at();

create trigger project_sprints_auto_touch_project
  after insert or update or delete on public.project_sprints
  for each row execute function public.trigger_touch_project();

alter table public.project_sprints enable row level security;

create policy project_sprints_select_for_members
on public.project_sprints
for select
to authenticated
using (public.can_access_project(project_id));

create policy project_sprints_insert_for_managers on public.project_sprints
  for insert to authenticated with check (public.can_edit_project(project_id));

create policy project_sprints_update_for_managers on public.project_sprints
  for update to authenticated using (public.can_edit_project(project_id));

create policy project_sprints_delete_for_managers on public.project_sprints
  for delete to authenticated using (public.can_edit_project(project_id));

alter table public.cards
  add column if not exists sprint_id uuid references public.project_sprints (id) on delete set null;

create index cards_project_sprint_idx
  on public.cards (project_id, sprint_id)
  where archived_at is null and deleted_at is null;


create or replace function public.archive_cards(target_card_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project_id uuid;
  calling_user_id uuid := auth.uid();
begin
  if array_length(target_card_ids, 1) is null or array_length(target_card_ids, 1) = 0 then
    return;
  end if;

  select distinct project_id into target_project_id
  from public.cards where id = any(target_card_ids);

  if target_project_id is null then
    raise exception 'CARD_NOT_FOUND';
  end if;

  if not public.can_edit_project(target_project_id, calling_user_id) then
    raise exception 'You do not have access to archive these cards.';
  end if;

  update public.cards
  set archived_at = timezone('utc', now()),
      archived_by_user_id = calling_user_id,
      updated_at = timezone('utc', now()),
      updated_by_user_id = calling_user_id
  where id = any(target_card_ids)
    and archived_at is null
    and deleted_at is null;

end;
$$;

revoke all on function public.archive_cards(uuid[]) from public;

grant execute on function public.archive_cards(uuid[]) to authenticated;

create or replace function public.unarchive_cards(target_card_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project_id uuid;
  calling_user_id uuid := auth.uid();
begin
  if array_length(target_card_ids, 1) is null or array_length(target_card_ids, 1) = 0 then
    return;
  end if;

  select distinct project_id into target_project_id
  from public.cards where id = any(target_card_ids);

  if target_project_id is null then
    raise exception 'CARD_NOT_FOUND';
  end if;

  if not public.can_edit_project(target_project_id, calling_user_id) then
    raise exception 'You do not have access to unarchive these cards.';
  end if;

  update public.cards
  set archived_at = null,
      archived_by_user_id = null,
      updated_at = timezone('utc', now()),
      updated_by_user_id = calling_user_id
  where id = any(target_card_ids)
    and archived_at is not null;

end;
$$;

revoke all on function public.unarchive_cards(uuid[]) from public;

grant execute on function public.unarchive_cards(uuid[]) to authenticated;

create or replace function public.trash_cards(target_card_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project_id uuid;
  calling_user_id uuid := auth.uid();
begin
  if array_length(target_card_ids, 1) is null or array_length(target_card_ids, 1) = 0 then
    return;
  end if;

  select distinct project_id into target_project_id
  from public.cards where id = any(target_card_ids);

  if target_project_id is null then
    raise exception 'CARD_NOT_FOUND';
  end if;

  if not public.can_edit_project(target_project_id, calling_user_id) then
    raise exception 'You do not have access to trash these cards.';
  end if;

  update public.cards
  set archived_at = null,
      archived_by_user_id = null,
      deleted_at = timezone('utc', now()),
      deleted_by_user_id = calling_user_id,
      updated_at = timezone('utc', now()),
      updated_by_user_id = calling_user_id
  where id = any(target_card_ids)
    and deleted_at is null;

end;
$$;

revoke all on function public.trash_cards(uuid[]) from public;

grant execute on function public.trash_cards(uuid[]) to authenticated;

create or replace function public.restore_cards(target_card_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project_id uuid;
  calling_user_id uuid := auth.uid();
begin
  if array_length(target_card_ids, 1) is null or array_length(target_card_ids, 1) = 0 then
    return;
  end if;

  select distinct project_id into target_project_id
  from public.cards where id = any(target_card_ids);

  if target_project_id is null then
    raise exception 'CARD_NOT_FOUND';
  end if;

  if not public.can_edit_project(target_project_id, calling_user_id) then
    raise exception 'You do not have access to restore these cards.';
  end if;

  update public.cards
  set deleted_at = null,
      deleted_by_user_id = null,
      updated_at = timezone('utc', now()),
      updated_by_user_id = calling_user_id
  where id = any(target_card_ids)
    and deleted_at is not null;

end;
$$;

revoke all on function public.restore_cards(uuid[]) from public;

grant execute on function public.restore_cards(uuid[]) to authenticated;

create or replace function public.permanent_delete_cards(target_card_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project_id uuid;
  calling_user_id uuid := auth.uid();
begin
  if array_length(target_card_ids, 1) is null or array_length(target_card_ids, 1) = 0 then
    return;
  end if;

  select distinct project_id into target_project_id
  from public.cards where id = any(target_card_ids);

  if target_project_id is null then
    raise exception 'CARD_NOT_FOUND';
  end if;

  if not public.can_edit_project(target_project_id, calling_user_id) then
    raise exception 'You do not have permission to permanently delete these cards.';
  end if;

  delete from public.cards where id = any(target_card_ids);

end;
$$;

revoke all on function public.permanent_delete_cards(uuid[]) from public;

grant execute on function public.permanent_delete_cards(uuid[]) to authenticated;

create or replace function public.delete_card(target_card_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.trash_cards(array[target_card_id]);
end;
$$;

revoke all on function public.delete_card(uuid) from public;

grant execute on function public.delete_card(uuid) to authenticated;

create or replace function public.delete_cards(target_card_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.trash_cards(target_card_ids);
end;
$$;

revoke all on function public.delete_cards(uuid[]) from public;

grant execute on function public.delete_cards(uuid[]) to authenticated;

create or replace function public.empty_rich_text_document()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'type', 'doc',
    'content', '[]'::jsonb
  );
$$;

create or replace function public.rich_text_document_from_plain_text(source_text text)
returns jsonb
language sql
immutable
as $$
  select
    case
      when coalesce(btrim(source_text), '') = '' then public.empty_rich_text_document()
      else jsonb_build_object(
        'type', 'doc',
        'content',
        coalesce(
          (
            select jsonb_agg(
              case
                when line = '' then jsonb_build_object('type', 'paragraph')
                else jsonb_build_object(
                  'type', 'paragraph',
                  'content', jsonb_build_array(
                    jsonb_build_object(
                      'type', 'text',
                      'text', line
                    )
                  )
                )
              end
              order by ordinality
            )
            from regexp_split_to_table(replace(coalesce(source_text, ''), E'\r\n', E'\n'), E'\n')
              with ordinality as lines(line, ordinality)
          ),
          '[]'::jsonb
        )
      )
    end;
$$;

create or replace function public.coalesce_rich_text_document(source_content jsonb, fallback_text text default '')
returns jsonb
language sql
immutable
as $$
  select
    case
      when jsonb_typeof(source_content) = 'object' and coalesce(source_content->>'type', '') = 'doc'
        then source_content
      else public.rich_text_document_from_plain_text(fallback_text)
    end;
$$;

alter table public.cards
  add column if not exists body_json jsonb not null default public.empty_rich_text_document();

alter table public.cards replica identity full;

alter table public.cards
  alter column effort type numeric using effort::numeric,
  alter column effort drop default,
  alter column effort drop not null;

alter table public.cards
  drop constraint if exists cards_effort_nonnegative;

alter table public.cards
  add constraint cards_effort_nonnegative
  check (effort is null or effort >= 0);

alter table public.cards
  drop column if exists blocked_reason;

create function public.get_project_card_rows(target_project_id uuid)
returns table (
  card_id uuid,
  project_key text,
  project_card_number integer,
  card_ref text,
  title text,
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
language sql
stable
security definer
set search_path = public
as $$
  select
    card.id as card_id,
    project.project_key,
    card.project_card_number,
    public.format_card_ref(project.project_key, card.project_card_number) as card_ref,
    card.title,
    card.status_option_id,
    card.priority_option_id,
    coalesce(profile.full_name, split_part(profile.email, '@', 1), 'Unassigned') as assignee_name,
    card.assignee_user_id,
    card.start_at,
    card.due_at,
    card.effort,
    card.tags,
    card.position as status_position,
    card.group_id,
    card.group_position,
    card.sprint_id,
    card.initiative_id,
    card.custom_data as custom_field_values,
    card.created_at,
    card.completed_at
  from public.cards card
  join public.projects project
    on project.id = card.project_id
  left join public.profiles profile
    on profile.user_id = card.assignee_user_id
  left join public.project_status_options status_opt
    on status_opt.id = card.status_option_id
  where card.project_id = target_project_id
    and card.archived_at is null
    and card.deleted_at is null
    and public.can_access_project(target_project_id, auth.uid())
  order by
    case status_opt.category
      when 'not_started' then 0
      when 'started' then 1
      when 'completed' then 2
      else 99
    end,
    coalesce(status_opt.position, 0),
    card.position asc,
    card.created_at asc,
    card.id asc;
$$;

revoke all on function public.get_project_card_rows(uuid) from public;

grant execute on function public.get_project_card_rows(uuid) to authenticated;

create function public.create_card(
  target_project_id uuid,
  target_title text,
  target_body_md text default '',
  target_body_json jsonb default null,
  target_status_option_id uuid default null,
  target_priority_option_id uuid default null,
  target_start_at date default null,
  target_due_at date default null,
  target_effort numeric default null,
  target_group_id uuid default null,
  target_tags text[] default '{}'::text[],
  target_sprint_id uuid default null,
  target_initiative_id uuid default null
)
returns table (
  card_id uuid,
  project_key text,
  project_card_number integer,
  card_ref text,
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
  created_card public.cards%rowtype;
  next_position integer;
  next_group_position integer;
  allocated_project_card_number integer;
  normalized_title text := trim(target_title);
  resolved_status_option_id uuid;
begin
  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'You do not have access to create cards in this project.';
  end if;

  if normalized_title is null or normalized_title = '' then
    raise exception 'Card title is required.';
  end if;

  if target_effort is not null and target_effort < 0 then
    raise exception 'Effort must be zero or greater.';
  end if;

  if target_group_id is not null and not exists (
    select 1
    from public.project_groups project_group
    where project_group.id = target_group_id
      and project_group.project_id = target_project_id
  ) then
    raise exception 'Group not found.';
  end if;

  if target_sprint_id is not null and not exists (
    select 1
    from public.project_sprints sprint
    where sprint.id = target_sprint_id
      and sprint.project_id = target_project_id
  ) then
    raise exception 'Sprint not found.';
  end if;

  if target_initiative_id is not null and not exists (
    select 1
    from public.workspace_initiatives wi
    join public.projects p on p.workspace_id = wi.workspace_id
    where wi.id = target_initiative_id
      and p.id = target_project_id
      and wi.archived_at is null
      and wi.deleted_at is null
  ) then
    raise exception 'Initiative not found or belongs to a different workspace.';
  end if;

  resolved_status_option_id := coalesce(
    target_status_option_id,
    (select id from public.project_status_options where project_id = target_project_id and is_default = true limit 1)
  );

  select project.next_card_number
    into allocated_project_card_number
  from public.projects project
  where project.id = target_project_id
  for update;

  if allocated_project_card_number is null then
    raise exception 'Project not found.';
  end if;

  select coalesce(max(card.position), -1) + 1
    into next_position
  from public.cards card
  where card.project_id = target_project_id
    and card.status_option_id is not distinct from resolved_status_option_id;

  select coalesce(max(card.group_position), -1) + 1
    into next_group_position
  from public.cards card
  where card.project_id = target_project_id
    and card.group_id is not distinct from target_group_id;

  insert into public.cards (
    project_id,
    project_card_number,
    title,
    body_md,
    body_json,
    status_option_id,
    priority_option_id,
    assignee_user_id,
    start_at,
    due_at,
    effort,
    tags,
    group_id,
    group_position,
    sprint_id,
    initiative_id,
    position,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    target_project_id,
    allocated_project_card_number,
    normalized_title,
    nullif(trim(coalesce(target_body_md, '')), ''),
    public.coalesce_rich_text_document(target_body_json, target_body_md),
    resolved_status_option_id,
    target_priority_option_id,
    auth.uid(),
    case
      when (select category from public.project_status_options where id = resolved_status_option_id) = 'started'
        and target_start_at is null then current_date
      else target_start_at
    end,
    target_due_at,
    target_effort,
    coalesce(target_tags, '{}'::text[]),
    target_group_id,
    next_group_position,
    target_sprint_id,
    target_initiative_id,
    next_position,
    auth.uid(),
    auth.uid()
  )
  returning * into created_card;

  update public.projects project
  set next_card_number = allocated_project_card_number + 1
  where project.id = target_project_id;


  return query
  select
    row.card_id,
    row.project_key,
    row.project_card_number,
    row.card_ref,
    row.title,
    created_card.body_md,
    created_card.body_json,
    row.status_option_id,
    row.priority_option_id,
    row.assignee_name,
    row.assignee_user_id,
    row.start_at,
    row.due_at,
    row.effort,
    row.tags,
    row.status_position,
    row.group_id,
    row.group_position,
    row.sprint_id,
    row.initiative_id,
    row.custom_field_values,
    row.created_at,
    row.completed_at
  from public.get_project_card_rows(target_project_id) row
  where row.card_id = created_card.id;
end;
$$;

revoke all on function public.create_card(uuid, text, text, jsonb, uuid, uuid, date, date, numeric, uuid, text[], uuid, uuid) from public;

grant execute on function public.create_card(uuid, text, text, jsonb, uuid, uuid, date, date, numeric, uuid, text[], uuid, uuid) to authenticated;

create function public.get_card_rpc_rows(
  target_project_id uuid,
  target_card_id uuid
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
stable
security definer
set search_path = public
as $$
declare
  has_initiative_id boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cards'
      and column_name = 'initiative_id'
  )
  into has_initiative_id;

  if has_initiative_id then
    return query
    select
      card.id as card_id,
      card.title,
      coalesce(card.body_md, '') as body_md,
      public.coalesce_rich_text_document(card.body_json, card.body_md) as body_json,
      card.status_option_id,
      card.priority_option_id,
      coalesce(profile.full_name, split_part(profile.email, '@', 1), 'Unassigned') as assignee_name,
      card.assignee_user_id,
      card.start_at,
      card.due_at,
      card.effort,
      card.tags,
      card.position as status_position,
      card.group_id,
      card.group_position,
      card.sprint_id,
      card.initiative_id,
      card.custom_data as custom_field_values,
      card.created_at,
      card.completed_at
    from public.cards card
    left join public.profiles profile
      on profile.user_id = card.assignee_user_id
    where card.id = target_card_id
      and card.project_id = target_project_id
      and public.can_access_project(target_project_id, auth.uid());
  else
    return query
    select
      card.id as card_id,
      card.title,
      coalesce(card.body_md, '') as body_md,
      public.coalesce_rich_text_document(card.body_json, card.body_md) as body_json,
      card.status_option_id,
      card.priority_option_id,
      coalesce(profile.full_name, split_part(profile.email, '@', 1), 'Unassigned') as assignee_name,
      card.assignee_user_id,
      card.start_at,
      card.due_at,
      card.effort,
      card.tags,
      card.position as status_position,
      card.group_id,
      card.group_position,
      card.sprint_id,
      null::uuid as initiative_id,
      card.custom_data as custom_field_values,
      card.created_at,
      card.completed_at
    from public.cards card
    left join public.profiles profile
      on profile.user_id = card.assignee_user_id
    where card.id = target_card_id
      and card.project_id = target_project_id
      and public.can_access_project(target_project_id, auth.uid());
  end if;
end;
$$;

revoke all on function public.get_card_rpc_rows(uuid, uuid) from public;

grant execute on function public.get_card_rpc_rows(uuid, uuid) to authenticated;

create function public.update_card(
  target_card_id uuid,
  target_title text,
  target_body_md text default '',
  target_body_json jsonb default null,
  target_status_option_id uuid default null,
  target_priority_option_id uuid default null,
  target_start_at date default null,
  target_due_at date default null,
  target_effort numeric default null,
  target_tags text[] default '{}'::text[],
  target_completed_at date default null,
  target_initiative_id uuid default null,
  target_initiative_changed boolean default false
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
  next_position integer;
  normalized_title text := trim(target_title);
begin
  select *
    into current_card
  from public.cards card
  where card.id = target_card_id
    and public.can_edit_project(card.project_id, auth.uid());

  if current_card.id is null then
    raise exception 'Card not found.';
  end if;

  if normalized_title is null or normalized_title = '' then
    raise exception 'Card title is required.';
  end if;

  if target_effort is not null and target_effort < 0 then
    raise exception 'Effort must be zero or greater.';
  end if;

  if target_initiative_changed and target_initiative_id is not null and not exists (
    select 1
    from public.workspace_initiatives wi
    join public.projects p on p.workspace_id = wi.workspace_id
    where wi.id = target_initiative_id
      and p.id = current_card.project_id
      and wi.archived_at is null
      and wi.deleted_at is null
  ) then
    raise exception 'Initiative not found or belongs to a different workspace.';
  end if;

  if current_card.status_option_id is not distinct from target_status_option_id then
    next_position := current_card.position;
  else
    select coalesce(max(card.position), -1) + 1
      into next_position
    from public.cards card
    where card.project_id = current_card.project_id
      and card.status_option_id is not distinct from target_status_option_id;
  end if;

  update public.cards
  set
    title = normalized_title,
    body_md = case
      when target_body_md is not null then nullif(trim(target_body_md), '')
      else current_card.body_md
    end,
    body_json = case
      when target_body_json is not null then public.coalesce_rich_text_document(target_body_json, target_body_md)
      else current_card.body_json
    end,
    status_option_id = target_status_option_id,
    priority_option_id = target_priority_option_id,
    start_at = case
      when (select category from public.project_status_options where id = target_status_option_id) = 'started'
        and coalesce((select category from public.project_status_options where id = current_card.status_option_id), '') <> 'started'
        and target_start_at is null
        then current_date
      else target_start_at
    end,
    due_at = target_due_at,
    effort = target_effort,
    tags = coalesce(target_tags, '{}'::text[]),
    position = current_card.position,
    initiative_id = case
      when target_initiative_changed then target_initiative_id
      else current_card.initiative_id
    end,
    completed_at = case
      when coalesce((select category from public.project_status_options where id = target_status_option_id), '') <> 'completed'
        then null
      when target_completed_at is not null
        then timezone('utc', target_completed_at::timestamp)
      when (select category from public.project_status_options where id = target_status_option_id) = 'completed'
        and coalesce((select category from public.project_status_options where id = current_card.status_option_id), '') <> 'completed'
        then timezone('utc', now())
      else current_card.completed_at
    end,
    updated_by_user_id = auth.uid()
  where id = target_card_id;


  return query
  select *
  from public.get_card_rpc_rows(current_card.project_id, target_card_id);
end;
$$;

revoke all on function public.update_card(uuid, text, text, jsonb, uuid, uuid, date, date, numeric, text[], date, uuid, boolean) from public;

grant execute on function public.update_card(uuid, text, text, jsonb, uuid, uuid, date, date, numeric, text[], date, uuid, boolean) to authenticated;

create function public.move_card(
  target_card_id uuid,
  target_status_option_id uuid,
  target_position integer default null
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
  normalized_target_position integer;
  target_count integer;
begin
  select *
    into current_card
  from public.cards card
  where card.id = target_card_id
    and public.can_edit_project(card.project_id, auth.uid());

  if current_card.id is null then
    raise exception 'Card not found.';
  end if;

  select count(*)
    into target_count
  from public.cards card
  where card.project_id = current_card.project_id
    and card.status_option_id is not distinct from target_status_option_id
    and card.id <> target_card_id;

  normalized_target_position := greatest(0, least(coalesce(target_position, target_count), target_count));

  if current_card.status_option_id is not distinct from target_status_option_id and current_card.position = normalized_target_position then
    return query
    select *
    from public.get_card_rpc_rows(current_card.project_id, current_card.id);
    return;
  end if;

  if current_card.status_option_id is not distinct from target_status_option_id then
    if normalized_target_position > current_card.position then
      update public.cards as card
      set position = card.position - 1
      where card.project_id = current_card.project_id
        and card.status_option_id is not distinct from current_card.status_option_id
        and card.id <> current_card.id
        and card.position > current_card.position
        and card.position <= normalized_target_position;
    else
      update public.cards as card
      set position = card.position + 1
      where card.project_id = current_card.project_id
        and card.status_option_id is not distinct from current_card.status_option_id
        and card.id <> current_card.id
        and card.position >= normalized_target_position
        and card.position < current_card.position;
    end if;
  else
    update public.cards as card
    set position = card.position - 1
    where card.project_id = current_card.project_id
      and card.status_option_id is not distinct from current_card.status_option_id
      and card.position > current_card.position;

    update public.cards as card
    set position = card.position + 1
    where card.project_id = current_card.project_id
      and card.status_option_id is not distinct from target_status_option_id
      and card.position >= normalized_target_position;
  end if;

  update public.cards as card
  set
    status_option_id = target_status_option_id,
    position = normalized_target_position,
    start_at = case
      when (select category from public.project_status_options where id = target_status_option_id) = 'started'
        and coalesce((select category from public.project_status_options where id = current_card.status_option_id), '') <> 'started'
        and card.start_at is null
        then current_date
      else card.start_at
    end,
    completed_at = case
      when (select category from public.project_status_options where id = target_status_option_id) = 'completed'
        and coalesce((select category from public.project_status_options where id = current_card.status_option_id), '') <> 'completed'
        then timezone('utc', now())
      when coalesce((select category from public.project_status_options where id = target_status_option_id), '') <> 'completed'
        then null
      else card.completed_at
    end,
    updated_by_user_id = auth.uid()
  where card.id = current_card.id;


  return query
  select *
  from public.get_card_rpc_rows(current_card.project_id, current_card.id);
end;
$$;

revoke all on function public.move_card(uuid, uuid, integer) from public;

grant execute on function public.move_card(uuid, uuid, integer) to authenticated;

create function public.move_card_to_group(
  target_card_id uuid,
  target_group_id uuid default null,
  target_position integer default null
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
  normalized_target_position integer;
  target_count integer;
begin
  select *
    into current_card
  from public.cards card
  where card.id = target_card_id
    and public.can_edit_project(card.project_id, auth.uid());

  if current_card.id is null then
    raise exception 'Card not found.';
  end if;

  if target_group_id is not null and not exists (
    select 1
    from public.project_groups project_group
    where project_group.id = target_group_id
      and project_group.project_id = current_card.project_id
  ) then
    raise exception 'Group not found.';
  end if;

  select count(*)
    into target_count
  from public.cards card
  where card.project_id = current_card.project_id
    and card.group_id is not distinct from target_group_id
    and card.id <> target_card_id;

  normalized_target_position := greatest(0, least(coalesce(target_position, target_count), target_count));

  if current_card.group_id is not distinct from target_group_id
    and current_card.group_position = normalized_target_position then
    return query
    select *
    from public.get_card_rpc_rows(current_card.project_id, current_card.id);
    return;
  end if;

  if current_card.group_id is not distinct from target_group_id then
    if normalized_target_position > current_card.group_position then
      update public.cards as card
      set group_position = card.group_position - 1
      where card.project_id = current_card.project_id
        and card.group_id is not distinct from current_card.group_id
        and card.id <> current_card.id
        and card.group_position > current_card.group_position
        and card.group_position <= normalized_target_position;
    else
      update public.cards as card
      set group_position = card.group_position + 1
      where card.project_id = current_card.project_id
        and card.group_id is not distinct from current_card.group_id
        and card.id <> current_card.id
        and card.group_position >= normalized_target_position
        and card.group_position < current_card.group_position;
    end if;
  else
    update public.cards as card
    set group_position = card.group_position - 1
    where card.project_id = current_card.project_id
      and card.group_id is not distinct from current_card.group_id
      and card.group_position > current_card.group_position;

    update public.cards as card
    set group_position = card.group_position + 1
    where card.project_id = current_card.project_id
      and card.group_id is not distinct from target_group_id
      and card.group_position >= normalized_target_position;
  end if;

  update public.cards as card
  set
    group_id = target_group_id,
    group_position = normalized_target_position,
    updated_by_user_id = auth.uid()
  where card.id = current_card.id;


  return query
  select *
  from public.get_card_rpc_rows(current_card.project_id, current_card.id);
end;
$$;

revoke all on function public.move_card_to_group(uuid, uuid, integer) from public;

grant execute on function public.move_card_to_group(uuid, uuid, integer) to authenticated;

create function public.set_card_schedule(
  target_card_id uuid,
  target_start_at date default null,
  target_due_at date default null
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
begin
  select *
    into current_card
  from public.cards card
  where card.id = target_card_id
    and public.can_edit_project(card.project_id, auth.uid());

  if current_card.id is null then
    raise exception 'Card not found.';
  end if;

  if target_start_at is not null and target_due_at is not null and target_due_at < target_start_at then
    raise exception 'Due date must be on or after the start date.';
  end if;

  if current_card.start_at is not distinct from target_start_at
    and current_card.due_at is not distinct from target_due_at then
    return query
    select *
    from public.get_card_rpc_rows(current_card.project_id, current_card.id);
    return;
  end if;

  update public.cards
  set
    start_at = target_start_at,
    due_at = target_due_at,
    updated_by_user_id = auth.uid()
  where id = current_card.id;


  return query
  select *
  from public.get_card_rpc_rows(current_card.project_id, current_card.id);
end;
$$;

revoke all on function public.set_card_schedule(uuid, date, date) from public;

grant execute on function public.set_card_schedule(uuid, date, date) to authenticated;

create function public.set_card_assignee(
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


  return query
  select *
  from public.get_card_rpc_rows(current_card.project_id, current_card.id);
end;
$$;

revoke all on function public.set_card_assignee(uuid, uuid) from public;

grant execute on function public.set_card_assignee(uuid, uuid) to authenticated;

create function public.create_project_group(
  target_project_id uuid,
  target_label text default 'New group'
)
returns table (
  group_id uuid,
  label text,
  group_position integer,
  project_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_group public.project_groups%rowtype;
  next_position integer;
  normalized_label text := trim(target_label);
begin
  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to manage groups on this project.';
  end if;

  if normalized_label is null or normalized_label = '' then
    raise exception 'Group label is required.';
  end if;

  select coalesce(max(project_group.position), -1) + 1
    into next_position
  from public.project_groups project_group
  where project_group.project_id = target_project_id;

  insert into public.project_groups (
    project_id,
    label,
    position,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    target_project_id,
    normalized_label,
    next_position,
    auth.uid(),
    auth.uid()
  )
  returning * into created_group;


  return query
  select *
  from public.get_project_groups(target_project_id)
  where get_project_groups.group_id = created_group.id;
end;
$$;

revoke all on function public.create_project_group(uuid, text) from public;

grant execute on function public.create_project_group(uuid, text) to authenticated;

create function public.reorder_project_groups(target_group_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project_id uuid;
begin
  if coalesce(cardinality(target_group_ids), 0) = 0 then
    return;
  end if;

  select project_group.project_id
    into target_project_id
  from public.project_groups project_group
  where project_group.id = target_group_ids[1]
  limit 1;

  if target_project_id is null then
    raise exception 'Group not found.';
  end if;

  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to manage groups on this project.';
  end if;

  if exists (
    select 1
    from public.project_groups project_group
    where project_group.id = any(target_group_ids)
      and project_group.project_id <> target_project_id
  ) then
    raise exception 'Groups must belong to the same project.';
  end if;

  update public.project_groups project_group
  set
    position = next_position.position,
    updated_by_user_id = auth.uid()
  from (
    select
      entry.group_id,
      entry.ordinality - 1 as position
    from unnest(target_group_ids) with ordinality as entry(group_id, ordinality)
  ) next_position
  where project_group.id = next_position.group_id
    and project_group.project_id = target_project_id;

end;
$$;

revoke all on function public.reorder_project_groups(uuid[]) from public;

grant execute on function public.reorder_project_groups(uuid[]) to authenticated;

create function public.set_project_builtin_field_label(
  target_project_id uuid,
  target_field_key text,
  target_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_field_key text := lower(trim(coalesce(target_field_key, '')));
  normalized_label text := nullif(trim(coalesce(target_label, '')), '');
  current_labels jsonb;
  next_labels jsonb;
begin
  if normalized_field_key = '' or not normalized_field_key = any(public.optional_table_field_keys()) then
    raise exception 'Unknown built-in field.';
  end if;

  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to rename this field.';
  end if;

  select coalesce(project.builtin_field_labels, '{}'::jsonb)
    into current_labels
  from public.projects project
  where project.id = target_project_id;

  if current_labels is null then
    raise exception 'Project not found.';
  end if;

  next_labels :=
    case
      when normalized_label is null then current_labels - normalized_field_key
      else jsonb_set(current_labels, array[normalized_field_key], to_jsonb(normalized_label), true)
    end;

  update public.projects
  set builtin_field_labels = next_labels
  where id = target_project_id;


  return next_labels;
end;
$$;

revoke all on function public.set_project_builtin_field_label(uuid, text, text) from public;

grant execute on function public.set_project_builtin_field_label(uuid, text, text) to authenticated;

create or replace function public.get_workspace_trash(target_workspace_id uuid)
returns table (
  entity_id uuid,
  entity_type text,
  title text,
  project_name text,
  deleted_at timestamptz,
  deleted_by_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id as entity_id,
    'card'::text as entity_type,
    c.title,
    p.name as project_name,
    c.deleted_at,
    coalesce(prof.full_name, 'Unknown') as deleted_by_name
  from public.cards c
  join public.projects p on p.id = c.project_id
  left join public.profiles prof on prof.user_id = c.deleted_by_user_id
  where p.workspace_id = target_workspace_id
    and c.deleted_at is not null
    and public.can_access_workspace(target_workspace_id, auth.uid())

  union all

  select
    p.id as entity_id,
    'project'::text as entity_type,
    p.name as title,
    null as project_name,
    p.deleted_at,
    coalesce(prof.full_name, 'Unknown') as deleted_by_name
  from public.projects p
  left join public.profiles prof on prof.user_id = p.deleted_by_user_id
  where p.workspace_id = target_workspace_id
    and p.deleted_at is not null
    and public.can_access_workspace(target_workspace_id, auth.uid())

  order by deleted_at desc
  limit 200;
$$;

revoke all on function public.get_workspace_trash(uuid) from public;

grant execute on function public.get_workspace_trash(uuid) to authenticated;

create or replace function public.get_workspace_archive(target_workspace_id uuid)
returns table (
  entity_id uuid,
  entity_type text,
  title text,
  project_name text,
  archived_at timestamptz,
  archived_by_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id as entity_id,
    'card'::text as entity_type,
    c.title,
    p.name as project_name,
    c.archived_at,
    coalesce(prof.full_name, 'Unknown') as archived_by_name
  from public.cards c
  join public.projects p on p.id = c.project_id
  left join public.profiles prof on prof.user_id = c.archived_by_user_id
  where p.workspace_id = target_workspace_id
    and c.archived_at is not null
    and public.can_access_workspace(target_workspace_id, auth.uid())

  union all

  select
    p.id as entity_id,
    'project'::text as entity_type,
    p.name as title,
    null as project_name,
    p.archived_at,
    coalesce(prof.full_name, 'Unknown') as archived_by_name
  from public.projects p
  left join public.profiles prof on prof.user_id = p.archived_by_user_id
  where p.workspace_id = target_workspace_id
    and p.archived_at is not null
    and public.can_access_workspace(target_workspace_id, auth.uid())

  order by archived_at desc
  limit 200;
$$;

revoke all on function public.get_workspace_archive(uuid) from public;

grant execute on function public.get_workspace_archive(uuid) to authenticated;

create or replace function public.get_project_status_options(target_project_id uuid)
returns table (
  id uuid,
  key text,
  label text,
  category text,
  "position" integer,
  is_default boolean,
  color text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pso.id,
    pso.key,
    pso.label,
    pso.category,
    pso.position,
    pso.is_default,
    pso.color
  from public.project_status_options pso
  where pso.project_id = target_project_id
    and public.can_access_project(target_project_id, auth.uid())
  order by
    case pso.category
      when 'not_started' then 0
      when 'started' then 1
      when 'completed' then 2
    end,
    pso.position asc;
$$;

revoke all on function public.get_project_status_options(uuid) from public;

grant execute on function public.get_project_status_options(uuid) to authenticated;

create or replace function public.set_project_builtin_option_label(
  target_project_id uuid,
  target_field_key text,
  target_option_key text,
  target_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_field_key text := lower(trim(coalesce(target_field_key, '')));
  normalized_option_key text := lower(trim(coalesce(target_option_key, '')));
  normalized_label text := nullif(trim(coalesce(target_label, '')), '');
  current_labels jsonb;
  current_option_labels jsonb;
  next_labels jsonb;
  next_option_labels jsonb;
  option_storage_key text;
begin
  if normalized_field_key <> 'priority' then
    raise exception 'Unknown built-in field.';
  end if;

  if normalized_option_key not in ('none', 'urgent', 'high', 'medium', 'low') then
    raise exception 'Unknown priority option.';
  end if;

  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to edit labels on this project.';
  end if;

  select coalesce(project.builtin_field_labels, '{}'::jsonb)
    into current_labels
  from public.projects project
  where project.id = target_project_id;

  if current_labels is null then
    raise exception 'Project not found.';
  end if;

  option_storage_key := '__priorityOptionLabels';

  current_option_labels :=
    case
      when jsonb_typeof(current_labels -> option_storage_key) = 'object'
        then current_labels -> option_storage_key
      else '{}'::jsonb
    end;

  next_option_labels :=
    case
      when normalized_label is null then current_option_labels - normalized_option_key
      else jsonb_set(current_option_labels, array[normalized_option_key], to_jsonb(normalized_label), true)
    end;

  next_labels :=
    case
      when next_option_labels = '{}'::jsonb then current_labels - option_storage_key
      else jsonb_set(current_labels, array[option_storage_key], next_option_labels, true)
    end;

  update public.projects
  set builtin_field_labels = next_labels
  where id = target_project_id;


  return next_labels;
end;
$$;

revoke all on function public.set_project_builtin_option_label(uuid, text, text, text) from public;

grant execute on function public.set_project_builtin_option_label(uuid, text, text, text) to authenticated;

create or replace function public.add_project_status_option(
  target_project_id uuid, target_label text, target_category text
)
returns table (option_id uuid, option_label text, option_key text, option_category text, option_position integer, option_is_default boolean)
language plpgsql security definer set search_path = public
as $$
declare
  normalized_label text := trim(target_label);
  generated_key text;
  next_position integer;
  created_option public.project_status_options%rowtype;
  key_suffix integer := 0;
begin
  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to manage statuses in this project.';
  end if;
  if normalized_label is null or normalized_label = '' then raise exception 'Status label is required.'; end if;
  if target_category not in ('not_started', 'started', 'completed') then raise exception 'Invalid status category.'; end if;

  generated_key := lower(regexp_replace(normalized_label, '\s+', '_', 'g'));
  while exists (select 1 from public.project_status_options where project_id = target_project_id
    and key = case when key_suffix = 0 then generated_key else generated_key || '_' || key_suffix end
  ) loop key_suffix := key_suffix + 1; end loop;
  if key_suffix > 0 then generated_key := generated_key || '_' || key_suffix; end if;

  select coalesce(max(pso.position), -1) + 1 into next_position
  from public.project_status_options pso where pso.project_id = target_project_id and pso.category = target_category;

  insert into public.project_status_options (project_id, label, key, category, position, is_default)
  values (target_project_id, normalized_label, generated_key, target_category, next_position, false)
  returning * into created_option;

  return query select created_option.id, created_option.label, created_option.key,
    created_option.category, created_option.position, created_option.is_default;
end;
$$;

revoke all on function public.add_project_status_option(uuid, text, text) from public;

grant execute on function public.add_project_status_option(uuid, text, text) to authenticated;

create or replace function public.set_project_status_option_color(target_option_id uuid, target_color text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  target_option public.project_status_options%rowtype;
begin
  select * into target_option from public.project_status_options where id = target_option_id;
  if target_option.id is null then raise exception 'Status option not found.'; end if;
  if not public.can_edit_project(target_option.project_id, auth.uid()) then
    raise exception 'You do not have permission to manage statuses in this project.';
  end if;
  update public.project_status_options set color = nullif(trim(target_color), '') where id = target_option_id;
end;
$$;

revoke all on function public.set_project_status_option_color(uuid, text) from public;

grant execute on function public.set_project_status_option_color(uuid, text) to authenticated;

create or replace function public.get_project_priority_options(target_project_id uuid)
returns table (
  id uuid,
  label text,
  key text,
  sort_order integer,
  color text,
  is_default boolean
)
language sql stable security definer set search_path = public
as $$
  select
    ppo.id,
    ppo.label,
    ppo.key,
    ppo.sort_order,
    ppo.color,
    ppo.is_default
  from public.project_priority_options ppo
  where ppo.project_id = target_project_id
    and public.can_access_project(target_project_id, auth.uid())
  order by ppo.sort_order asc, ppo.created_at asc;
$$;

revoke all on function public.get_project_priority_options(uuid) from public;

grant execute on function public.get_project_priority_options(uuid) to authenticated;

create or replace function public.add_project_priority_option(
  target_project_id uuid,
  target_label text,
  target_color text default null
)
returns table (
  option_id uuid,
  option_label text,
  option_key text,
  option_sort_order integer,
  option_color text,
  option_is_default boolean
)
language plpgsql security definer set search_path = public
as $$
declare
  normalized_label text := trim(target_label);
  new_key text;
  next_sort_order integer;
  created_option public.project_priority_options%rowtype;
begin
  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to manage priorities in this project.';
  end if;

  if normalized_label is null or normalized_label = '' then
    raise exception 'Priority label is required.';
  end if;

  new_key := lower(regexp_replace(normalized_label, '[^a-z0-9]+', '_', 'g'));
  if new_key = '' then new_key := 'priority'; end if;

  -- Ensure key uniqueness within project
  while exists (select 1 from public.project_priority_options where project_id = target_project_id and key = new_key) loop
    new_key := new_key || '_' || substr(gen_random_uuid()::text, 1, 4);
  end loop;

  select coalesce(max(ppo.sort_order), -1) + 1 into next_sort_order
  from public.project_priority_options ppo
  where ppo.project_id = target_project_id;

  insert into public.project_priority_options (project_id, label, key, sort_order, color)
  values (target_project_id, normalized_label, new_key, next_sort_order, nullif(trim(coalesce(target_color, '')), ''))
  returning * into created_option;


  return query select
    created_option.id,
    created_option.label,
    created_option.key,
    created_option.sort_order,
    created_option.color,
    created_option.is_default;
end;
$$;

revoke all on function public.add_project_priority_option(uuid, text, text) from public;

grant execute on function public.add_project_priority_option(uuid, text, text) to authenticated;

create or replace function public.set_project_priority_option_color(target_option_id uuid, target_color text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  target_option public.project_priority_options%rowtype;
begin
  select * into target_option from public.project_priority_options where id = target_option_id;
  if target_option.id is null then raise exception 'Priority option not found.'; end if;
  if not public.can_edit_project(target_option.project_id, auth.uid()) then
    raise exception 'You do not have permission to manage priorities in this project.';
  end if;
  update public.project_priority_options set color = nullif(trim(target_color), '') where id = target_option_id;
end;
$$;

revoke all on function public.set_project_priority_option_color(uuid, text) from public;

grant execute on function public.set_project_priority_option_color(uuid, text) to authenticated;

create or replace function public.get_project_sprints(target_project_id uuid)
returns table (
  id uuid,
  project_id uuid,
  name text,
  goal text,
  start_date date,
  end_date date,
  status public.sprint_status,
  "position" integer,
  created_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    sprint.id,
    sprint.project_id,
    sprint.name,
    sprint.goal,
    sprint.start_date,
    sprint.end_date,
    sprint.status,
    sprint.position,
    sprint.created_at,
    sprint.updated_at,
    sprint.completed_at
  from public.project_sprints sprint
  where sprint.project_id = target_project_id
    and public.can_access_project(target_project_id, auth.uid())
  order by
    case sprint.status
      when 'active' then 0
      when 'planned' then 1
      when 'completed' then 2
    end,
    sprint.start_date asc nulls last,
    sprint.position asc,
    sprint.created_at asc;
$$;

revoke all on function public.get_project_sprints(uuid) from public;

grant execute on function public.get_project_sprints(uuid) to authenticated;

create function public.create_project_sprint(
  target_project_id uuid,
  target_name text,
  target_start_date date default null,
  target_end_date date default null,
  target_goal text default null
)
returns table (
  id uuid,
  project_id uuid,
  name text,
  goal text,
  start_date date,
  end_date date,
  status public.sprint_status,
  "position" integer,
  created_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_sprint public.project_sprints%rowtype;
  next_position integer;
  normalized_name text := trim(target_name);
begin
  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to manage sprints on this project.';
  end if;

  if normalized_name is null or normalized_name = '' then
    raise exception 'Sprint name is required.';
  end if;

  select coalesce(max(sprint.position), -1) + 1
    into next_position
  from public.project_sprints sprint
  where sprint.project_id = target_project_id;

  insert into public.project_sprints (
    project_id,
    name,
    goal,
    start_date,
    end_date,
    position,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    target_project_id,
    normalized_name,
    nullif(trim(coalesce(target_goal, '')), ''),
    target_start_date,
    target_end_date,
    next_position,
    auth.uid(),
    auth.uid()
  )
  returning * into created_sprint;


  return query
  select *
  from public.get_project_sprints(target_project_id)
  where get_project_sprints.id = created_sprint.id;
end;
$$;

revoke all on function public.create_project_sprint(uuid, text, date, date, text) from public;

grant execute on function public.create_project_sprint(uuid, text, date, date, text) to authenticated;

create function public.update_project_sprint(
  target_sprint_id uuid,
  target_name text default null,
  target_start_date date default null,
  target_end_date date default null,
  target_goal text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_sprint public.project_sprints%rowtype;
  normalized_name text;
begin
  select *
    into target_sprint
  from public.project_sprints sprint
  where sprint.id = target_sprint_id;

  if target_sprint.id is null then
    raise exception 'Sprint not found.';
  end if;

  if not public.can_edit_project(target_sprint.project_id, auth.uid()) then
    raise exception 'You do not have permission to manage sprints on this project.';
  end if;

  normalized_name := coalesce(nullif(trim(target_name), ''), target_sprint.name);

  update public.project_sprints
  set
    name = normalized_name,
    goal = nullif(trim(coalesce(target_goal, '')), ''),
    start_date = target_start_date,
    end_date = target_end_date,
    updated_by_user_id = auth.uid()
  where id = target_sprint_id;

end;
$$;

revoke all on function public.update_project_sprint(uuid, text, date, date, text) from public;

grant execute on function public.update_project_sprint(uuid, text, date, date, text) to authenticated;

create function public.start_sprint(target_sprint_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_sprint public.project_sprints%rowtype;
begin
  select *
    into target_sprint
  from public.project_sprints sprint
  where sprint.id = target_sprint_id;

  if target_sprint.id is null then
    raise exception 'Sprint not found.';
  end if;

  if not public.can_edit_project(target_sprint.project_id, auth.uid()) then
    raise exception 'You do not have permission to manage sprints on this project.';
  end if;

  if target_sprint.status = 'active' then
    return;
  end if;

  if target_sprint.status = 'completed' then
    raise exception 'Cannot start a completed sprint.';
  end if;

  if exists (
    select 1
    from public.project_sprints sprint
    where sprint.project_id = target_sprint.project_id
      and sprint.status = 'active'
      and sprint.id <> target_sprint_id
  ) then
    raise exception 'Another sprint is already active. Complete it before starting a new one.';
  end if;

  update public.project_sprints
  set
    status = 'active',
    updated_by_user_id = auth.uid()
  where id = target_sprint_id;

end;
$$;

revoke all on function public.start_sprint(uuid) from public;

grant execute on function public.start_sprint(uuid) to authenticated;

create function public.complete_sprint(
  target_sprint_id uuid,
  target_action text,
  target_next_sprint_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_sprint public.project_sprints%rowtype;
  normalized_action text := lower(trim(target_action));
begin
  select *
    into target_sprint
  from public.project_sprints sprint
  where sprint.id = target_sprint_id;

  if target_sprint.id is null then
    raise exception 'Sprint not found.';
  end if;

  if not public.can_edit_project(target_sprint.project_id, auth.uid()) then
    raise exception 'You do not have permission to manage sprints on this project.';
  end if;

  if target_sprint.status = 'completed' then
    raise exception 'Sprint is already completed.';
  end if;

  if normalized_action not in ('move_to_next', 'return_to_backlog', 'keep') then
    raise exception 'Action must be one of "move_to_next", "return_to_backlog", or "keep".';
  end if;

  if normalized_action = 'move_to_next' then
    if target_next_sprint_id is null then
      raise exception 'Next sprint is required when moving incomplete cards.';
    end if;

    if not exists (
      select 1
      from public.project_sprints sprint
      where sprint.id = target_next_sprint_id
        and sprint.project_id = target_sprint.project_id
        and sprint.status <> 'completed'
    ) then
      raise exception 'Next sprint not found or already completed.';
    end if;

    update public.cards card
    set
      sprint_id = target_next_sprint_id,
      updated_by_user_id = auth.uid()
    where card.sprint_id = target_sprint_id
      and card.archived_at is null
      and card.deleted_at is null
      and (
        card.status_option_id is null
        or (select pso.category from public.project_status_options pso where pso.id = card.status_option_id) <> 'completed'
      );
  elsif normalized_action = 'return_to_backlog' then
    update public.cards card
    set
      sprint_id = null,
      updated_by_user_id = auth.uid()
    where card.sprint_id = target_sprint_id
      and card.archived_at is null
      and card.deleted_at is null
      and (
        card.status_option_id is null
        or (select pso.category from public.project_status_options pso where pso.id = card.status_option_id) <> 'completed'
      );
  end if;

  update public.project_sprints
  set
    status = 'completed',
    completed_at = timezone('utc', now()),
    updated_by_user_id = auth.uid()
  where id = target_sprint_id;

end;
$$;

revoke all on function public.complete_sprint(uuid, text, uuid) from public;

grant execute on function public.complete_sprint(uuid, text, uuid) to authenticated;

create function public.delete_sprint(target_sprint_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_sprint public.project_sprints%rowtype;
begin
  select *
    into target_sprint
  from public.project_sprints sprint
  where sprint.id = target_sprint_id;

  if target_sprint.id is null then
    raise exception 'Sprint not found.';
  end if;

  if not public.can_edit_project(target_sprint.project_id, auth.uid()) then
    raise exception 'You do not have permission to manage sprints on this project.';
  end if;

  delete from public.project_sprints
  where id = target_sprint_id;

end;
$$;

revoke all on function public.delete_sprint(uuid) from public;

grant execute on function public.delete_sprint(uuid) to authenticated;

create function public.set_card_sprint(
  target_card_id uuid,
  target_sprint_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_card public.cards%rowtype;
begin
  select *
    into current_card
  from public.cards card
  where card.id = target_card_id
    and public.can_edit_project(card.project_id, auth.uid());

  if current_card.id is null then
    raise exception 'Card not found.';
  end if;

  if target_sprint_id is not null and not exists (
    select 1
    from public.project_sprints sprint
    where sprint.id = target_sprint_id
      and sprint.project_id = current_card.project_id
  ) then
    raise exception 'Sprint not found or belongs to a different project.';
  end if;

  update public.cards
  set
    sprint_id = target_sprint_id,
    updated_by_user_id = auth.uid()
  where id = target_card_id;

end;
$$;

revoke all on function public.set_card_sprint(uuid, uuid) from public;

grant execute on function public.set_card_sprint(uuid, uuid) to authenticated;

create or replace function public.set_card_initiative(
  target_card_id uuid,
  target_initiative_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_card public.cards%rowtype;
begin
  select *
    into current_card
  from public.cards card
  where card.id = target_card_id
    and public.can_edit_project(card.project_id, auth.uid());

  if current_card.id is null then
    raise exception 'Card not found.';
  end if;

  if target_initiative_id is not null and not exists (
    select 1
    from public.workspace_initiatives wi
    join public.projects p on p.workspace_id = wi.workspace_id
    where wi.id = target_initiative_id
      and p.id = current_card.project_id
      and wi.archived_at is null
      and wi.deleted_at is null
  ) then
    raise exception 'Initiative not found or belongs to a different workspace.';
  end if;

  update public.cards
  set
    initiative_id = target_initiative_id,
    updated_by_user_id = auth.uid()
  where id = target_card_id;

end;
$$;

revoke all on function public.set_card_initiative(uuid, uuid) from public;

grant execute on function public.set_card_initiative(uuid, uuid) to authenticated;

alter table public.card_comments
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create or replace function public.profile_display_name(target_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select coalesce(profile.full_name, split_part(profile.email, '@', 1), 'Unknown')
      from public.profiles profile
      where profile.user_id = target_user_id
      limit 1
    ),
    'Unknown'
  );
$$;

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
  target_project_id uuid;
  created_comment public.card_comments%rowtype;
  normalized_body text := trim(target_body_text);
begin
  select card.project_id
    into target_project_id
  from public.cards card
  where card.id = target_card_id
    and public.can_edit_project(card.project_id, auth.uid());

  if target_project_id is null then
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


  return query
  select
    created_comment.id,
    public.profile_display_name(created_comment.created_by_user_id) as author_name,
    created_comment.body_text,
    created_comment.created_at
  ;
end;
$$;

revoke all on function public.add_card_comment(uuid, text) from public;

grant execute on function public.add_card_comment(uuid, text) to authenticated;

revoke all on function public.profile_display_name(uuid) from public;

create function public.rename_project_group(
  target_group_id uuid,
  target_label text
)
returns table (
  group_id uuid,
  label text,
  group_position integer,
  project_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group public.project_groups%rowtype;
  normalized_label text := trim(target_label);
begin
  select *
    into target_group
  from public.project_groups project_group
  where project_group.id = target_group_id;

  if target_group.id is null then
    raise exception 'Group not found.';
  end if;

  if not public.can_edit_project(target_group.project_id, auth.uid()) then
    raise exception 'You do not have permission to manage groups on this project.';
  end if;

  if normalized_label is null or normalized_label = '' then
    raise exception 'Group label is required.';
  end if;

  update public.project_groups
  set
    label = normalized_label,
    updated_by_user_id = auth.uid()
  where id = target_group_id;

  perform public.touch_project(target_group.project_id, auth.uid());

  return query
  select *
  from public.get_project_groups(target_group.project_id)
  where get_project_groups.group_id = target_group_id;
end;
$$;

revoke all on function public.rename_project_group(uuid, text) from public;

grant execute on function public.rename_project_group(uuid, text) to authenticated;

create function public.delete_project_group(
  target_group_id uuid,
  target_delete_cards boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group public.project_groups%rowtype;
  ungrouped_base_position integer;
begin
  select *
    into target_group
  from public.project_groups project_group
  where project_group.id = target_group_id;

  if target_group.id is null then
    raise exception 'Group not found.';
  end if;

  if not public.can_edit_project(target_group.project_id, auth.uid()) then
    raise exception 'You do not have permission to manage groups on this project.';
  end if;

  if target_delete_cards then
    delete from public.cards
    where project_id = target_group.project_id
      and group_id = target_group_id;
  else
    select coalesce(max(card.group_position), -1) + 1
      into ungrouped_base_position
    from public.cards card
    where card.project_id = target_group.project_id
      and card.group_id is null;

    update public.cards card
    set
      group_id = null,
      group_position = ungrouped_base.next_position + moved_card.ordinality - 1,
      updated_by_user_id = auth.uid()
    from (
      select
        moved.id,
        row_number() over (order by moved.group_position asc, moved.created_at asc, moved.id asc) as ordinality
      from public.cards moved
      where moved.project_id = target_group.project_id
        and moved.group_id = target_group_id
    ) moved_card
    cross join lateral (
      select ungrouped_base_position as next_position
    ) ungrouped_base
    where card.id = moved_card.id;
  end if;

  delete from public.project_groups
  where id = target_group_id;

  update public.project_groups project_group
  set
    position = project_group.position - 1,
    updated_by_user_id = auth.uid()
  where project_group.project_id = target_group.project_id
    and project_group.position > target_group.position;

  perform public.touch_project(target_group.project_id, auth.uid());
end;
$$;

revoke all on function public.delete_project_group(uuid, boolean) from public;

grant execute on function public.delete_project_group(uuid, boolean) to authenticated;

create or replace function public.rename_project_status_option(target_option_id uuid, target_new_label text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  target_option public.project_status_options%rowtype;
  normalized_label text := trim(target_new_label);
  generated_key text;
  key_suffix integer := 0;
begin
  select * into target_option from public.project_status_options where id = target_option_id;
  if target_option.id is null then raise exception 'Status option not found.'; end if;
  if not public.can_edit_project(target_option.project_id, auth.uid()) then
    raise exception 'You do not have permission to manage statuses in this project.';
  end if;
  if normalized_label is null or normalized_label = '' then raise exception 'Status label is required.'; end if;

  generated_key := lower(regexp_replace(normalized_label, '\s+', '_', 'g'));
  while exists (select 1 from public.project_status_options where project_id = target_option.project_id
    and key = case when key_suffix = 0 then generated_key else generated_key || '_' || key_suffix end
    and id <> target_option_id
  ) loop key_suffix := key_suffix + 1; end loop;
  if key_suffix > 0 then generated_key := generated_key || '_' || key_suffix; end if;

  update public.project_status_options set label = normalized_label, key = generated_key where id = target_option_id;
end;
$$;

revoke all on function public.rename_project_status_option(uuid, text) from public;

grant execute on function public.rename_project_status_option(uuid, text) to authenticated;

create or replace function public.delete_project_status_option(target_option_id uuid)
returns table(reassigned_count integer, reassigned_to text)
language plpgsql security definer set search_path = public
as $$
declare
  target_option public.project_status_options%rowtype;
  default_option public.project_status_options%rowtype;
  total_count integer;
  category_count integer;
  v_reassigned_count integer := 0;
begin
  select * into target_option from public.project_status_options where id = target_option_id;
  if target_option.id is null then raise exception 'Status option not found.'; end if;
  if not public.can_edit_project(target_option.project_id, auth.uid()) then
    raise exception 'You do not have permission to manage statuses in this project.';
  end if;

  select count(*) into total_count from public.project_status_options where project_id = target_option.project_id;
  if total_count <= 1 then raise exception 'Cannot delete the only status option.'; end if;

  if target_option.category = 'completed' then
    select count(*) into category_count from public.project_status_options
    where project_id = target_option.project_id and category = 'completed';
    if category_count <= 1 then raise exception 'At least one completed status is required.'; end if;
  end if;

  select * into default_option from public.project_status_options
  where project_id = target_option.project_id and is_default = true and id <> target_option_id limit 1;
  if default_option.id is null then
    select * into default_option from public.project_status_options
    where project_id = target_option.project_id and id <> target_option_id order by position limit 1;
  end if;

  update public.cards
  set status_option_id = default_option.id,
      completed_at = case when target_option.category = 'completed' and default_option.category <> 'completed' then null else completed_at end,
      updated_at = timezone('utc', now()), updated_by_user_id = auth.uid()
  where status_option_id = target_option_id;
  get diagnostics v_reassigned_count = row_count;

  delete from public.project_status_options where id = target_option_id;
  perform public.touch_project(target_option.project_id, auth.uid());

  return query select v_reassigned_count, default_option.label;
end;
$$;

revoke all on function public.delete_project_status_option(uuid) from public;

grant execute on function public.delete_project_status_option(uuid) to authenticated;

create or replace function public.rename_project_priority_option(target_option_id uuid, target_new_label text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  target_option public.project_priority_options%rowtype;
  normalized_label text := trim(target_new_label);
begin
  select * into target_option from public.project_priority_options where id = target_option_id;
  if target_option.id is null then raise exception 'Priority option not found.'; end if;
  if not public.can_edit_project(target_option.project_id, auth.uid()) then
    raise exception 'You do not have permission to manage priorities in this project.';
  end if;
  if normalized_label is null or normalized_label = '' then
    raise exception 'Priority label is required.';
  end if;
  update public.project_priority_options set label = normalized_label where id = target_option_id;
  perform public.touch_project(target_option.project_id, auth.uid());
end;
$$;

revoke all on function public.rename_project_priority_option(uuid, text) from public;

grant execute on function public.rename_project_priority_option(uuid, text) to authenticated;

create or replace function public.delete_project_priority_option(target_option_id uuid)
returns table(reassigned_count integer)
language plpgsql security definer set search_path = public
as $$
declare
  target_option public.project_priority_options%rowtype;
  option_count integer;
  v_reassigned_count integer := 0;
begin
  select * into target_option from public.project_priority_options where id = target_option_id;
  if target_option.id is null then raise exception 'Priority option not found.'; end if;
  if not public.can_edit_project(target_option.project_id, auth.uid()) then
    raise exception 'You do not have permission to manage priorities in this project.';
  end if;

  select count(*) into option_count from public.project_priority_options where project_id = target_option.project_id;
  if option_count <= 1 then raise exception 'Cannot delete the last priority option.'; end if;

  -- Set cards to null (no priority) since priority is optional
  update public.cards set priority_option_id = null
  where priority_option_id = target_option_id;
  get diagnostics v_reassigned_count = row_count;

  delete from public.project_priority_options where id = target_option_id;
  perform public.touch_project(target_option.project_id, auth.uid());

  return query select v_reassigned_count;
end;
$$;

revoke all on function public.delete_project_priority_option(uuid) from public;

grant execute on function public.delete_project_priority_option(uuid) to authenticated;
-- Adds public.duplicate_cards(target_project_id, target_card_ids): atomic
-- server-side card duplication. Copies title (with " (copy)" suffix), body,
-- status, priority, assignee, custom_data, tags, schedule, group, sprint,
-- initiative. New cards land immediately after their sources within each
-- status bucket and group bucket (existing cards shift down to make room).
-- Single transaction prevents the half-built-card footgun seen with
-- client-side create_card + set_card_assignee + set_card_field_value loops.

create or replace function public.duplicate_cards(
  target_project_id uuid,
  target_card_ids uuid[]
)
returns table (
  card_id uuid,
  project_key text,
  project_card_number integer,
  card_ref text,
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
  calling_user_id uuid := auth.uid();
  next_number integer;
  new_card_ids uuid[] := '{}'::uuid[];
  new_card_id uuid;
  source_row record;
  bucket_row record;
begin
  if target_card_ids is null or array_length(target_card_ids, 1) is null then
    return;
  end if;

  if not public.can_edit_project(target_project_id, calling_user_id) then
    raise exception 'You do not have access to duplicate cards in this project.';
  end if;

  select project.next_card_number
    into next_number
  from public.projects project
  where project.id = target_project_id
  for update;

  if next_number is null then
    raise exception 'Project not found.';
  end if;

  -- Shift existing cards in each affected status bucket so duplicates can
  -- slot in immediately after the last selected source card in that bucket.
  for bucket_row in
    select
      card.status_option_id,
      max(card.position) as max_source_position,
      count(*) as source_count
    from public.cards card
    where card.id = any(target_card_ids)
      and card.project_id = target_project_id
      and card.archived_at is null
      and card.deleted_at is null
    group by card.status_option_id
  loop
    update public.cards
    set position = public.cards.position + bucket_row.source_count
    where public.cards.project_id = target_project_id
      and public.cards.status_option_id is not distinct from bucket_row.status_option_id
      and public.cards.position > bucket_row.max_source_position
      and public.cards.archived_at is null
      and public.cards.deleted_at is null;
  end loop;

  -- Same shift, but for group_position within each affected group bucket.
  for bucket_row in
    select
      card.group_id,
      max(card.group_position) as max_source_group_position,
      count(*) as source_count
    from public.cards card
    where card.id = any(target_card_ids)
      and card.project_id = target_project_id
      and card.archived_at is null
      and card.deleted_at is null
    group by card.group_id
  loop
    update public.cards
    set group_position = public.cards.group_position + bucket_row.source_count
    where public.cards.project_id = target_project_id
      and public.cards.group_id is not distinct from bucket_row.group_id
      and public.cards.group_position > bucket_row.max_source_group_position
      and public.cards.archived_at is null
      and public.cards.deleted_at is null;
  end loop;

  -- Insert duplicates in input order. For each source, compute its new
  -- position as (max_source_position_in_bucket + 1 + offset_within_bucket),
  -- so multi-select in the same bucket lands contiguously after the last
  -- selected card, in source order.
  for source_row in
    with numbered as (
      select
        card.*,
        array_position(target_card_ids, card.id) as input_index
      from public.cards card
      where card.id = any(target_card_ids)
        and card.project_id = target_project_id
        and card.archived_at is null
        and card.deleted_at is null
    ),
    status_bucket_stats as (
      select
        n.status_option_id,
        max(n.position) as max_pos
      from numbered n
      group by n.status_option_id
    ),
    group_bucket_stats as (
      select
        n.group_id,
        max(n.group_position) as max_gpos
      from numbered n
      group by n.group_id
    )
    select
      n.id,
      n.title,
      n.body_md,
      n.body_json,
      n.status_option_id,
      n.priority_option_id,
      n.assignee_user_id,
      n.start_at,
      n.due_at,
      n.effort,
      n.tags,
      n.custom_data,
      n.group_id,
      n.sprint_id,
      n.initiative_id,
      n.input_index,
      sbs.max_pos + 1 +
        (row_number() over (partition by n.status_option_id order by n.position) - 1)::int
        as new_position,
      gbs.max_gpos + 1 +
        (row_number() over (partition by n.group_id order by n.group_position) - 1)::int
        as new_group_position
    from numbered n
    left join status_bucket_stats sbs
      on sbs.status_option_id is not distinct from n.status_option_id
    left join group_bucket_stats gbs
      on gbs.group_id is not distinct from n.group_id
    order by n.input_index
  loop
    insert into public.cards (
      project_id,
      project_card_number,
      title,
      body_md,
      body_json,
      status_option_id,
      priority_option_id,
      assignee_user_id,
      start_at,
      due_at,
      effort,
      tags,
      custom_data,
      group_id,
      group_position,
      sprint_id,
      initiative_id,
      position,
      created_by_user_id,
      updated_by_user_id
    )
    select
      target_project_id,
      next_number,
      source_row.title || ' (copy)',
      source_row.body_md,
      source_row.body_json,
      source_row.status_option_id,
      source_row.priority_option_id,
      source_row.assignee_user_id,
      source_row.start_at,
      source_row.due_at,
      source_row.effort,
      source_row.tags,
      source_row.custom_data,
      source_row.group_id,
      source_row.new_group_position,
      source_row.sprint_id,
      source_row.initiative_id,
      source_row.new_position,
      calling_user_id,
      calling_user_id
    returning id into new_card_id;

    new_card_ids := array_append(new_card_ids, new_card_id);
    next_number := next_number + 1;
  end loop;

  update public.projects project
  set next_card_number = next_number
  where project.id = target_project_id;

  return query
  select
    row.card_id,
    row.project_key,
    row.project_card_number,
    row.card_ref,
    row.title,
    card.body_md,
    card.body_json,
    row.status_option_id,
    row.priority_option_id,
    row.assignee_name,
    row.assignee_user_id,
    row.start_at,
    row.due_at,
    row.effort,
    row.tags,
    row.status_position,
    row.group_id,
    row.group_position,
    row.sprint_id,
    row.initiative_id,
    row.custom_field_values,
    row.created_at,
    row.completed_at
  from public.get_project_card_rows(target_project_id) row
  join public.cards card on card.id = row.card_id
  where row.card_id = any(new_card_ids)
  order by array_position(new_card_ids, row.card_id);
end;
$$;

revoke all on function public.duplicate_cards(uuid, uuid[]) from public;

grant execute on function public.duplicate_cards(uuid, uuid[]) to authenticated;

