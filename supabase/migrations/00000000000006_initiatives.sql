-- Initiatives: workspace initiatives, updates, sparklines, card linking.
-- Canonical greenfield owner file. Modify in place.

create table public.workspace_initiatives (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  description text,
  status public.initiative_status not null default 'planned',
  health public.initiative_health not null default 'on_track',
  target_date date,
  lead_user_id uuid references auth.users (id) on delete set null,
  position integer not null default 0,
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  updated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz,
  archived_by_user_id uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by_user_id uuid references auth.users (id) on delete set null,
  visibility public.resource_access not null default 'open',
  constraint workspace_initiatives_name_not_blank check (length(trim(name)) > 0),
  constraint workspace_initiatives_lifecycle_mutex check (not (archived_at is not null and deleted_at is not null))
);

create unique index workspace_initiatives_workspace_name_key
  on public.workspace_initiatives (workspace_id, lower(trim(name)))
  where archived_at is null and deleted_at is null;

create index workspace_initiatives_workspace_id_idx
  on public.workspace_initiatives (workspace_id, position, created_at);

create trigger workspace_initiatives_set_updated_at
before update on public.workspace_initiatives
for each row execute function public.set_updated_at();

alter table public.cards
  add constraint cards_initiative_fk
  foreign key (initiative_id) references public.workspace_initiatives (id) on delete set null;

create index cards_initiative_idx
  on public.cards (initiative_id)
  where archived_at is null and deleted_at is null;

alter table public.workspace_initiatives enable row level security;

create policy workspace_initiatives_select_for_members
on public.workspace_initiatives
for select
to authenticated
using (
  public.can_access_workspace(workspace_id)
  and archived_at is null
  and deleted_at is null
  and (
    visibility = 'open'
    or lead_user_id = auth.uid()
    or public.can_manage_workspace(workspace_id)
  )
);

create table public.initiative_updates (
  id uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references public.workspace_initiatives (id) on delete cascade,
  body_text text not null,
  health_snapshot public.initiative_health,
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  constraint initiative_updates_body_not_blank check (length(trim(body_text)) > 0)
);

create index initiative_updates_initiative_id_idx
  on public.initiative_updates (initiative_id, created_at desc);

alter table public.initiative_updates enable row level security;

create policy initiative_updates_select_for_members
on public.initiative_updates
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_initiatives initiative
    where initiative.id = initiative_updates.initiative_id
      and public.can_access_workspace(initiative.workspace_id)
  )
);

-- ── Write RLS policies for initiatives domain ──────────────────────

create policy workspace_initiatives_insert_for_members on public.workspace_initiatives
  for insert to authenticated with check (public.can_edit_workspace(workspace_id));

create policy workspace_initiatives_update_for_members on public.workspace_initiatives
  for update to authenticated using (public.can_edit_workspace(workspace_id));

create policy workspace_initiatives_delete_for_managers on public.workspace_initiatives
  for delete to authenticated using (public.can_edit_workspace(workspace_id));

create policy initiative_updates_insert_for_members on public.initiative_updates
  for insert to authenticated with check (
    exists (
      select 1 from public.workspace_initiatives i
      where i.id = initiative_updates.initiative_id
        and public.can_edit_workspace(i.workspace_id)
    )
  );

create or replace function public.get_workspace_initiatives(target_workspace_id uuid)
returns table (
  id uuid,
  workspace_id uuid,
  name text,
  description text,
  status public.initiative_status,
  health public.initiative_health,
  target_date date,
  lead_user_id uuid,
  lead_name text,
  "position" integer,
  created_at timestamptz,
  updated_at timestamptz,
  latest_update_text text,
  latest_update_at timestamptz,
  visibility public.resource_access
)
language sql
stable
security definer
set search_path = public
as $$
  select
    initiative.id,
    initiative.workspace_id,
    initiative.name,
    initiative.description,
    initiative.status,
    initiative.health,
    initiative.target_date,
    initiative.lead_user_id,
    coalesce(profile.full_name, split_part(profile.email, '@', 1)) as lead_name,
    initiative.position,
    initiative.created_at,
    initiative.updated_at,
    latest_update.body_text as latest_update_text,
    latest_update.created_at as latest_update_at,
    initiative.visibility
  from public.workspace_initiatives initiative
  left join public.profiles profile
    on profile.user_id = initiative.lead_user_id
  left join lateral (
    select iu.body_text, iu.created_at
    from public.initiative_updates iu
    where iu.initiative_id = initiative.id
    order by iu.created_at desc
    limit 1
  ) latest_update on true
  where initiative.workspace_id = target_workspace_id
    and public.can_access_workspace(target_workspace_id, auth.uid())
    and initiative.archived_at is null
    and initiative.deleted_at is null
    and (initiative.visibility = 'open' or initiative.lead_user_id = auth.uid() or public.can_manage_workspace(target_workspace_id, auth.uid()))
  order by
    case initiative.status
      when 'active' then 0
      when 'planned' then 1
      when 'paused' then 2
      when 'completed' then 3
      when 'cancelled' then 4
    end,
    initiative.position asc,
    initiative.created_at asc;
$$;

revoke all on function public.get_workspace_initiatives(uuid) from public;

grant execute on function public.get_workspace_initiatives(uuid) to authenticated;

create or replace function public.get_workspace_initiative_summaries(target_workspace_id uuid)
returns table (
  initiative_id uuid,
  total_cards bigint,
  cards_not_started bigint,
  cards_started bigint,
  cards_completed bigint,
  project_count bigint,
  cards_completed_this_week bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with accessible_projects as (
    select p.id as project_id
    from public.projects p
    where p.workspace_id = target_workspace_id
      and public.can_access_project(p.id, auth.uid())
      and p.archived_at is null
      and p.deleted_at is null
  )
  select
    wi.id as initiative_id,
    count(c.id) as total_cards,
    count(c.id) filter (where coalesce(pso.category, 'not_started') = 'not_started') as cards_not_started,
    count(c.id) filter (where pso.category = 'started') as cards_started,
    count(c.id) filter (where pso.category = 'completed') as cards_completed,
    count(distinct c.project_id) as project_count,
    count(c.id) filter (where c.completed_at >= now() - interval '7 days') as cards_completed_this_week
  from public.workspace_initiatives wi
  left join public.cards c
    on c.initiative_id = wi.id
    and c.archived_at is null
    and c.deleted_at is null
    and c.project_id in (select project_id from accessible_projects)
  left join public.project_status_options pso
    on pso.id = c.status_option_id
  where wi.workspace_id = target_workspace_id
    and public.can_access_workspace(target_workspace_id, auth.uid())
    and wi.archived_at is null
    and wi.deleted_at is null
    and (wi.visibility = 'open' or wi.lead_user_id = auth.uid() or public.can_manage_workspace(target_workspace_id, auth.uid()))
  group by wi.id;
$$;

revoke all on function public.get_workspace_initiative_summaries(uuid) from public;

grant execute on function public.get_workspace_initiative_summaries(uuid) to authenticated;

create or replace function public.get_initiative_cards(target_initiative_id uuid)
returns table (
  card_id uuid,
  title text,
  status_option_id uuid,
  status_label text,
  status_category text,
  priority_option_id uuid,
  assignee_name text,
  assignee_user_id uuid,
  start_at date,
  due_at date,
  effort numeric,
  project_id uuid,
  project_name text,
  completed_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    card.id as card_id,
    card.title,
    card.status_option_id,
    coalesce(pso.label, 'Unknown') as status_label,
    coalesce(pso.category, 'not_started') as status_category,
    card.priority_option_id,
    coalesce(profile.full_name, split_part(profile.email, '@', 1), 'Unassigned') as assignee_name,
    card.assignee_user_id,
    card.start_at,
    card.due_at,
    card.effort,
    card.project_id,
    project.name as project_name,
    card.completed_at,
    card.created_at
  from public.cards card
  join public.workspace_initiatives wi
    on wi.id = card.initiative_id
  join public.projects project
    on project.id = card.project_id
  left join public.project_status_options pso
    on pso.id = card.status_option_id
  left join public.profiles profile
    on profile.user_id = card.assignee_user_id
  where card.initiative_id = target_initiative_id
    and public.can_access_workspace(wi.workspace_id, auth.uid())
    and public.can_access_project(card.project_id, auth.uid())
    and card.archived_at is null
    and card.deleted_at is null
    and project.archived_at is null
    and project.deleted_at is null
  order by
    project.name asc,
    case coalesce(pso.category, 'not_started')
      when 'not_started' then 0
      when 'started' then 1
      when 'completed' then 2
    end,
    card.position asc;
$$;

revoke all on function public.get_initiative_cards(uuid) from public;

grant execute on function public.get_initiative_cards(uuid) to authenticated;

create or replace function public.create_initiative(
  target_workspace_id uuid,
  target_name text,
  target_description text default null,
  target_target_date date default null,
  target_lead_user_id uuid default null,
  target_visibility public.resource_access default 'open'
)
returns table (
  id uuid,
  workspace_id uuid,
  name text,
  description text,
  status public.initiative_status,
  health public.initiative_health,
  target_date date,
  lead_user_id uuid,
  lead_name text,
  "position" integer,
  created_at timestamptz,
  updated_at timestamptz,
  visibility public.resource_access
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_initiative public.workspace_initiatives%rowtype;
  next_position integer;
  normalized_name text := trim(target_name);
begin
  if not public.can_edit_workspace(target_workspace_id, auth.uid()) then
    raise exception 'You do not have permission to create initiatives in this workspace.';
  end if;

  if normalized_name is null or normalized_name = '' then
    raise exception 'Initiative name is required.';
  end if;

  select coalesce(max(wi.position), -1) + 1
    into next_position
  from public.workspace_initiatives wi
  where wi.workspace_id = target_workspace_id
    and wi.archived_at is null
    and wi.deleted_at is null;

  insert into public.workspace_initiatives (
    workspace_id,
    name,
    description,
    target_date,
    lead_user_id,
    visibility,
    position,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    target_workspace_id,
    normalized_name,
    nullif(trim(coalesce(target_description, '')), ''),
    target_target_date,
    coalesce(target_lead_user_id, auth.uid()),
    coalesce(target_visibility, 'open'),
    next_position,
    auth.uid(),
    auth.uid()
  )
  returning * into created_initiative;

  return query
  select
    created_initiative.id,
    created_initiative.workspace_id,
    created_initiative.name,
    created_initiative.description,
    created_initiative.status,
    created_initiative.health,
    created_initiative.target_date,
    created_initiative.lead_user_id,
    coalesce(p.full_name, split_part(p.email, '@', 1)) as lead_name,
    created_initiative.position,
    created_initiative.created_at,
    created_initiative.updated_at,
    created_initiative.visibility
  from public.profiles p
  where p.user_id = created_initiative.lead_user_id;
end;
$$;

revoke all on function public.create_initiative(uuid, text, text, date, uuid, public.resource_access) from public;

grant execute on function public.create_initiative(uuid, text, text, date, uuid, public.resource_access) to authenticated;

create or replace function public.update_initiative(
  target_initiative_id uuid,
  target_name text default null,
  target_description text default null,
  target_status public.initiative_status default null,
  target_health public.initiative_health default null,
  target_target_date date default null,
  target_lead_user_id uuid default null,
  target_visibility public.resource_access default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_initiative public.workspace_initiatives%rowtype;
begin
  select *
    into current_initiative
  from public.workspace_initiatives wi
  where wi.id = target_initiative_id
    and wi.archived_at is null
    and wi.deleted_at is null;

  if current_initiative.id is null then
    raise exception 'Initiative not found.';
  end if;

  if not public.can_edit_workspace(current_initiative.workspace_id, auth.uid())
    and current_initiative.lead_user_id is distinct from auth.uid() then
    raise exception 'You do not have permission to update this initiative.';
  end if;

  update public.workspace_initiatives
  set
    name = coalesce(nullif(trim(target_name), ''), current_initiative.name),
    description = case when target_description is not null then nullif(trim(target_description), '') else current_initiative.description end,
    status = coalesce(target_status, current_initiative.status),
    health = coalesce(target_health, current_initiative.health),
    target_date = case when target_target_date is not null then target_target_date else current_initiative.target_date end,
    lead_user_id = case when target_lead_user_id is not null then target_lead_user_id else current_initiative.lead_user_id end,
    visibility = coalesce(target_visibility, current_initiative.visibility),
    updated_by_user_id = auth.uid()
  where id = target_initiative_id;
end;
$$;

revoke all on function public.update_initiative(uuid, text, text, public.initiative_status, public.initiative_health, date, uuid, public.resource_access) from public;

grant execute on function public.update_initiative(uuid, text, text, public.initiative_status, public.initiative_health, date, uuid, public.resource_access) to authenticated;

create or replace function public.archive_initiative(target_initiative_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_initiative public.workspace_initiatives%rowtype;
begin
  select *
    into current_initiative
  from public.workspace_initiatives wi
  where wi.id = target_initiative_id
    and wi.archived_at is null
    and wi.deleted_at is null;

  if current_initiative.id is null then
    raise exception 'Initiative not found.';
  end if;

  if not public.can_edit_workspace(current_initiative.workspace_id, auth.uid()) then
    raise exception 'You do not have permission to archive this initiative.';
  end if;

  update public.workspace_initiatives
  set
    archived_at = timezone('utc', now()),
    archived_by_user_id = auth.uid(),
    updated_by_user_id = auth.uid()
  where id = target_initiative_id;

  -- Unassign all cards from this initiative
  update public.cards
  set
    initiative_id = null,
    updated_by_user_id = auth.uid()
  where initiative_id = target_initiative_id;
end;
$$;

revoke all on function public.archive_initiative(uuid) from public;

grant execute on function public.archive_initiative(uuid) to authenticated;

create or replace function public.post_initiative_update(
  target_initiative_id uuid,
  target_body_text text,
  target_health public.initiative_health
)
returns table (
  id uuid,
  initiative_id uuid,
  body_text text,
  health_snapshot public.initiative_health,
  created_by_user_id uuid,
  author_name text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_initiative public.workspace_initiatives%rowtype;
  created_update public.initiative_updates%rowtype;
begin
  select *
    into current_initiative
  from public.workspace_initiatives wi
  where wi.id = target_initiative_id
    and wi.archived_at is null
    and wi.deleted_at is null;

  if current_initiative.id is null then
    raise exception 'Initiative not found.';
  end if;

  -- Only the initiative lead or workspace admin can post updates
  if current_initiative.lead_user_id is distinct from auth.uid()
    and not public.can_edit_workspace(current_initiative.workspace_id, auth.uid()) then
    raise exception 'Only the initiative lead or someone with edit access can post updates.';
  end if;

  if trim(coalesce(target_body_text, '')) = '' then
    raise exception 'Update text is required.';
  end if;

  -- Insert the update
  insert into public.initiative_updates (
    initiative_id,
    body_text,
    health_snapshot,
    created_by_user_id
  )
  values (
    target_initiative_id,
    trim(target_body_text),
    target_health,
    auth.uid()
  )
  returning * into created_update;

  -- Update the initiative health atomically
  update public.workspace_initiatives
  set
    health = target_health,
    updated_by_user_id = auth.uid()
  where workspace_initiatives.id = target_initiative_id;

  return query
  select
    created_update.id,
    created_update.initiative_id,
    created_update.body_text,
    created_update.health_snapshot,
    created_update.created_by_user_id,
    coalesce(p.full_name, split_part(p.email, '@', 1)) as author_name,
    created_update.created_at
  from public.profiles p
  where p.user_id = created_update.created_by_user_id;
end;
$$;

revoke all on function public.post_initiative_update(uuid, text, public.initiative_health) from public;

grant execute on function public.post_initiative_update(uuid, text, public.initiative_health) to authenticated;

create or replace function public.get_initiative_updates(target_initiative_id uuid)
returns table (
  id uuid,
  initiative_id uuid,
  body_text text,
  health_snapshot public.initiative_health,
  created_by_user_id uuid,
  author_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    iu.id,
    iu.initiative_id,
    iu.body_text,
    iu.health_snapshot,
    iu.created_by_user_id,
    coalesce(p.full_name, split_part(p.email, '@', 1)) as author_name,
    iu.created_at
  from public.initiative_updates iu
  join public.workspace_initiatives wi
    on wi.id = iu.initiative_id
  left join public.profiles p
    on p.user_id = iu.created_by_user_id
  where iu.initiative_id = target_initiative_id
    and public.can_access_workspace(wi.workspace_id, auth.uid())
  order by iu.created_at desc;
$$;

revoke all on function public.get_initiative_updates(uuid) from public;

grant execute on function public.get_initiative_updates(uuid) to authenticated;

create or replace function public.get_workspace_initiative_picker_cards(
  target_workspace_id uuid,
  target_initiative_id uuid
)
returns table (
  card_id uuid,
  title text,
  status_label text,
  status_category text,
  assignee_name text,
  project_id uuid,
  project_name text,
  initiative_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    card.id as card_id,
    card.title,
    coalesce(pso.label, 'Unknown') as status_label,
    coalesce(pso.category, 'not_started') as status_category,
    coalesce(profile.full_name, split_part(profile.email, '@', 1), 'Unassigned') as assignee_name,
    card.project_id,
    project.name as project_name,
    card.initiative_id
  from public.cards card
  join public.projects project
    on project.id = card.project_id
  left join public.project_status_options pso
    on pso.id = card.status_option_id
  left join public.profiles profile
    on profile.user_id = card.assignee_user_id
  where project.workspace_id = target_workspace_id
    and public.can_access_workspace(target_workspace_id, auth.uid())
    and public.can_access_project(card.project_id, auth.uid())
    and card.archived_at is null
    and card.deleted_at is null
    and project.archived_at is null
    and project.deleted_at is null
  order by
    project.name asc,
    case coalesce(pso.category, 'not_started')
      when 'not_started' then 0
      when 'started' then 1
      when 'completed' then 2
    end,
    card.position asc;
$$;

revoke all on function public.get_workspace_initiative_picker_cards(uuid, uuid) from public;

grant execute on function public.get_workspace_initiative_picker_cards(uuid, uuid) to authenticated;

create or replace function public.get_workspace_initiative_sparklines(target_workspace_id uuid)
returns table (
  initiative_id uuid,
  day date,
  cards_completed_cumulative bigint,
  total_scope bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with accessible_projects as (
    select p.id as project_id
    from public.projects p
    where p.workspace_id = target_workspace_id
      and public.can_access_project(p.id, auth.uid())
      and p.archived_at is null and p.deleted_at is null
  ),
  date_series as (
    select generate_series(
      current_date - interval '13 days',
      current_date,
      interval '1 day'
    )::date as day
  ),
  initiative_cards as (
    select c.initiative_id, c.completed_at, c.created_at
    from public.cards c
    where c.initiative_id is not null
      and c.archived_at is null and c.deleted_at is null
      and c.project_id in (select project_id from accessible_projects)
  )
  select
    wi.id as initiative_id,
    ds.day,
    count(ic.completed_at) filter (where ic.completed_at::date <= ds.day) as cards_completed_cumulative,
    count(ic.created_at) filter (where ic.created_at::date <= ds.day) as total_scope
  from public.workspace_initiatives wi
  cross join date_series ds
  left join initiative_cards ic on ic.initiative_id = wi.id
  where wi.workspace_id = target_workspace_id
    and public.can_access_workspace(target_workspace_id, auth.uid())
    and wi.archived_at is null and wi.deleted_at is null
    and (wi.visibility = 'open' or wi.lead_user_id = auth.uid() or public.can_manage_workspace(target_workspace_id, auth.uid()))
  group by wi.id, ds.day
  order by wi.id, ds.day;
$$;

revoke all on function public.get_workspace_initiative_sparklines(uuid) from public;

grant execute on function public.get_workspace_initiative_sparklines(uuid) to authenticated;

create or replace function public.reorder_initiative(
  target_initiative_id uuid,
  target_new_position integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_initiative public.workspace_initiatives%rowtype;
  old_position integer;
begin
  select * into current_initiative
  from public.workspace_initiatives wi
  where wi.id = target_initiative_id
    and wi.archived_at is null and wi.deleted_at is null;

  if current_initiative.id is null then
    raise exception 'Initiative not found.';
  end if;

  if not public.can_edit_workspace(current_initiative.workspace_id, auth.uid())
    and current_initiative.lead_user_id is distinct from auth.uid() then
    raise exception 'You do not have permission to reorder this initiative.';
  end if;

  old_position := current_initiative.position;

  if target_new_position < old_position then
    update public.workspace_initiatives
    set position = position + 1
    where workspace_id = current_initiative.workspace_id
      and position >= target_new_position
      and position < old_position
      and archived_at is null and deleted_at is null;
  elsif target_new_position > old_position then
    update public.workspace_initiatives
    set position = position - 1
    where workspace_id = current_initiative.workspace_id
      and position > old_position
      and position <= target_new_position
      and archived_at is null and deleted_at is null;
  end if;

  update public.workspace_initiatives
  set position = target_new_position
  where id = target_initiative_id;
end;
$$;

revoke all on function public.reorder_initiative(uuid, integer) from public;

grant execute on function public.reorder_initiative(uuid, integer) to authenticated;

create or replace function public.rename_initiative(
  target_initiative_id uuid,
  target_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  initiative_workspace_id uuid;
begin
  select workspace_id into initiative_workspace_id
  from public.workspace_initiatives
  where id = target_initiative_id;

  if initiative_workspace_id is null then
    raise exception 'Initiative not found';
  end if;

  if not public.can_access_workspace(initiative_workspace_id) then
    raise exception 'Cannot access workspace';
  end if;

  update public.workspace_initiatives
  set name = target_name
  where id = target_initiative_id;
end;
$$;

grant execute on function public.rename_initiative(uuid, text) to authenticated;

-- Hard delete of an initiative in a mixed-visibility workspace hits a
-- cascade-vs-RLS collision. The FK `cards.initiative_id` is
-- `ON DELETE SET NULL`, so the delete triggers an UPDATE on every linked
-- card, gated by `cards_update_for_members` which requires
-- `can_edit_project`. A workspace admin who isn't a project member of a
-- private project with linked cards would hit the cascade wall and the
-- whole delete would abort with a cryptic RLS denial. Preflight the
-- cards access inside the RPC so we can raise a specific error instead.
-- Soft-delete/archive remains the universal cleanup path for
-- mixed-visibility workspaces.

create or replace function public.delete_initiative(target_initiative_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_initiative public.workspace_initiatives%rowtype;
  blocking_project_id uuid;
begin
  select *
    into current_initiative
  from public.workspace_initiatives wi
  where wi.id = target_initiative_id;

  if current_initiative.id is null then
    raise exception 'Initiative not found.';
  end if;

  if not public.can_edit_workspace(current_initiative.workspace_id, auth.uid()) then
    raise exception 'You do not have permission to delete this initiative.';
  end if;

  -- Preflight: catch the cascade-vs-RLS collision before it happens. If the
  -- caller can't edit every project that has cards linked here, the
  -- ON DELETE SET NULL cascade would fail mid-transaction. Preflight
  -- surfaces that as a specific error instead of a generic RLS denial.
  select c.project_id into blocking_project_id
  from public.cards c
  where c.initiative_id = target_initiative_id
    and not public.can_edit_project(c.project_id, auth.uid())
  limit 1;

  if blocking_project_id is not null then
    raise exception 'Cannot delete initiative: it is linked to tasks in a project you do not have access to. Ask a project member to clear the link, or archive this initiative instead.';
  end if;

  delete from public.workspace_initiatives where id = target_initiative_id;
end;
$$;

revoke all on function public.delete_initiative(uuid) from public;
grant execute on function public.delete_initiative(uuid) to authenticated;
