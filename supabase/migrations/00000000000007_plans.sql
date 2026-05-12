-- Plans: workspace plans, plan views, roadmap, releases, scorecard.
-- Canonical greenfield owner file. Modify in place.

create table public.workspace_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  description text,
  position integer not null default 0,
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  updated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz,
  deleted_at timestamptz,
  constraint workspace_plans_name_not_blank check (length(trim(name)) > 0),
  constraint workspace_plans_lifecycle_mutex check (
    not (archived_at is not null and deleted_at is not null)
  )
);

create index workspace_plans_workspace_id_idx on public.workspace_plans (workspace_id);

create table public.plan_views (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.workspace_plans (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  view_type public.plan_view_type not null,
  name text not null,
  position integer not null default 0,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index plan_views_plan_id_idx on public.plan_views (plan_id);
create index plan_views_workspace_id_idx on public.plan_views (workspace_id);

create table public.plan_roadmap_lanes (
  id uuid primary key default gen_random_uuid(),
  plan_view_id uuid not null references public.plan_views (id) on delete cascade,
  title text not null,
  "group" text,
  group_type text not null default 'custom',
  position integer not null default 0,
  color text,
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index plan_roadmap_lanes_plan_view_id_idx on public.plan_roadmap_lanes (plan_view_id);

create table public.plan_roadmap_items (
  id uuid primary key default gen_random_uuid(),
  lane_id uuid not null references public.plan_roadmap_lanes (id) on delete cascade,
  label text not null,
  description text,
  start_period date not null,
  end_period date not null,
  color text,
  item_type public.roadmap_item_type not null default 'bar',
  initiative_id uuid references public.workspace_initiatives (id) on delete set null,
  position integer not null default 0,
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint plan_roadmap_items_dates_valid check (end_period >= start_period)
);

create index plan_roadmap_items_lane_id_idx on public.plan_roadmap_items (lane_id);

create table public.plan_roadmap_milestones (
  id uuid primary key default gen_random_uuid(),
  plan_view_id uuid not null references public.plan_views (id) on delete cascade,
  lane_id uuid references public.plan_roadmap_lanes (id) on delete set null,
  milestone_date date not null,
  label text not null,
  milestone_type public.roadmap_milestone_type not null default 'diamond',
  color text,
  position integer not null default 0,
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now())
);

create index plan_roadmap_milestones_plan_view_id_idx on public.plan_roadmap_milestones (plan_view_id);

create table public.plan_roadmap_matrix_cells (
  id uuid primary key default gen_random_uuid(),
  plan_view_id uuid not null references public.plan_views (id) on delete cascade,
  lane_id uuid not null references public.plan_roadmap_lanes (id) on delete cascade,
  period_key text not null,
  content_text text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint plan_roadmap_matrix_cells_unique_cell unique (plan_view_id, lane_id, period_key)
);

create or replace function public.can_access_plan(target_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_plans p
    where p.id = target_plan_id
      and public.can_access_workspace(p.workspace_id)
  );
$$;

create or replace function public.can_manage_plan(target_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_plans p
    where p.id = target_plan_id
      and public.can_edit_workspace(p.workspace_id)
  );
$$;

create or replace function public.can_access_plan_view(target_plan_view_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.plan_views v
    where v.id = target_plan_view_id
      and public.can_access_workspace(v.workspace_id)
  );
$$;

create or replace function public.can_manage_plan_view(target_plan_view_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.plan_views v
    where v.id = target_plan_view_id
      and public.can_edit_workspace(v.workspace_id)
  );
$$;

alter table public.workspace_plans enable row level security;

alter table public.plan_views enable row level security;

alter table public.plan_roadmap_lanes enable row level security;

alter table public.plan_roadmap_items enable row level security;

alter table public.plan_roadmap_milestones enable row level security;

alter table public.plan_roadmap_matrix_cells enable row level security;

create policy workspace_plans_select on public.workspace_plans
  for select using (public.can_access_workspace(workspace_id));

create policy workspace_plans_insert on public.workspace_plans
  for insert with check (public.can_edit_workspace(workspace_id));

create policy workspace_plans_update on public.workspace_plans
  for update using (public.can_edit_workspace(workspace_id));

create policy workspace_plans_delete on public.workspace_plans
  for delete using (public.can_edit_workspace(workspace_id));

create policy plan_views_select on public.plan_views
  for select using (public.can_access_plan(plan_id));

create policy plan_views_insert on public.plan_views
  for insert with check (public.can_manage_plan(plan_id));

create policy plan_views_update on public.plan_views
  for update using (public.can_manage_plan(plan_id));

create policy plan_views_delete on public.plan_views
  for delete using (public.can_manage_plan(plan_id));

create policy plan_roadmap_lanes_select on public.plan_roadmap_lanes
  for select using (public.can_access_plan_view(plan_view_id));

create policy plan_roadmap_lanes_insert on public.plan_roadmap_lanes
  for insert with check (public.can_access_plan_view(plan_view_id));

create policy plan_roadmap_lanes_update on public.plan_roadmap_lanes
  for update using (public.can_access_plan_view(plan_view_id));

create policy plan_roadmap_lanes_delete on public.plan_roadmap_lanes
  for delete using (public.can_access_plan_view(plan_view_id));

create policy plan_roadmap_items_select on public.plan_roadmap_items
  for select using (
    exists (
      select 1 from public.plan_roadmap_lanes l
      where l.id = plan_roadmap_items.lane_id
        and public.can_access_plan_view(l.plan_view_id)
    )
  );

create policy plan_roadmap_items_insert on public.plan_roadmap_items
  for insert with check (
    exists (
      select 1 from public.plan_roadmap_lanes l
      where l.id = plan_roadmap_items.lane_id
        and public.can_access_plan_view(l.plan_view_id)
    )
  );

create policy plan_roadmap_items_update on public.plan_roadmap_items
  for update using (
    exists (
      select 1 from public.plan_roadmap_lanes l
      where l.id = plan_roadmap_items.lane_id
        and public.can_access_plan_view(l.plan_view_id)
    )
  );

create policy plan_roadmap_items_delete on public.plan_roadmap_items
  for delete using (
    exists (
      select 1 from public.plan_roadmap_lanes l
      where l.id = plan_roadmap_items.lane_id
        and public.can_access_plan_view(l.plan_view_id)
    )
  );

create policy plan_roadmap_milestones_select on public.plan_roadmap_milestones
  for select using (public.can_access_plan_view(plan_view_id));

create policy plan_roadmap_milestones_insert on public.plan_roadmap_milestones
  for insert with check (public.can_access_plan_view(plan_view_id));

create policy plan_roadmap_milestones_update on public.plan_roadmap_milestones
  for update using (public.can_access_plan_view(plan_view_id));

create policy plan_roadmap_milestones_delete on public.plan_roadmap_milestones
  for delete using (public.can_access_plan_view(plan_view_id));

create policy plan_roadmap_matrix_cells_select on public.plan_roadmap_matrix_cells
  for select using (public.can_access_plan_view(plan_view_id));

create policy plan_roadmap_matrix_cells_insert on public.plan_roadmap_matrix_cells
  for insert with check (public.can_manage_plan_view(plan_view_id));

create policy plan_roadmap_matrix_cells_update on public.plan_roadmap_matrix_cells
  for update using (public.can_manage_plan_view(plan_view_id));

create policy plan_roadmap_matrix_cells_delete on public.plan_roadmap_matrix_cells
  for delete using (public.can_manage_plan_view(plan_view_id));

create or replace function public.get_workspace_plans(
  target_workspace_id uuid
)
returns table(id uuid, name text, description text, "position" integer, created_at timestamptz, views jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_access_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  return query
    select
      p.id,
      p.name,
      p.description,
      p.position,
      p.created_at,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', v.id,
          'view_type', v.view_type,
          'name', v.name,
          'position', v.position,
          'config_json', v.config_json
        ) order by v.position)
        from public.plan_views v
        where v.plan_id = p.id
      ), '[]'::jsonb) as views
    from public.workspace_plans p
    where p.workspace_id = target_workspace_id
    and p.deleted_at is null
    and p.archived_at is null
    order by p.position;
end;
$$;

create or replace function public.get_roadmap_data(
  target_plan_view_id uuid
)
returns table(lanes jsonb, items jsonb, milestones jsonb, cells jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace_id uuid;
begin
  select p.workspace_id into target_workspace_id
  from public.plan_views v
  join public.workspace_plans p on p.id = v.plan_id
  where v.id = target_plan_view_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  return query
    select
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', l.id,
          'title', l.title,
          'group', l."group",
          'group_type', l.group_type,
          'position', l.position,
          'color', l.color,
          'created_at', l.created_at
        ) order by l.position)
        from public.plan_roadmap_lanes l
        where l.plan_view_id = target_plan_view_id
      ), '[]'::jsonb) as lanes,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', i.id,
          'lane_id', i.lane_id,
          'label', i.label,
          'description', i.description,
          'start_period', i.start_period,
          'end_period', i.end_period,
          'color', i.color,
          'item_type', i.item_type,
          'initiative_id', i.initiative_id,
          'position', i.position
        ) order by i.position)
        from public.plan_roadmap_items i
        join public.plan_roadmap_lanes l on l.id = i.lane_id
        where l.plan_view_id = target_plan_view_id
      ), '[]'::jsonb) as items,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id,
          'lane_id', m.lane_id,
          'milestone_date', m.milestone_date,
          'label', m.label,
          'milestone_type', m.milestone_type,
          'color', m.color,
          'position', m.position
        ) order by m.milestone_date)
        from public.plan_roadmap_milestones m
        where m.plan_view_id = target_plan_view_id
      ), '[]'::jsonb) as milestones,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.id,
          'lane_id', c.lane_id,
          'period_key', c.period_key,
          'content_text', c.content_text
        ))
        from public.plan_roadmap_matrix_cells c
        where c.plan_view_id = target_plan_view_id
      ), '[]'::jsonb) as cells;
end;
$$;

create or replace function public.create_roadmap_lane(
  target_plan_view_id uuid,
  target_title text,
  target_group text default null,
  target_group_type text default 'custom',
  target_color text default null
)
returns table(id uuid, title text, "position" integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace_id uuid;
  next_position integer;
  new_lane_id uuid;
begin
  select p.workspace_id into target_workspace_id
  from public.plan_views v
  join public.workspace_plans p on p.id = v.plan_id
  where v.id = target_plan_view_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  select coalesce(max(l.position), -1) + 1 into next_position
  from public.plan_roadmap_lanes l
  where l.plan_view_id = target_plan_view_id;

  insert into public.plan_roadmap_lanes (plan_view_id, title, "group", group_type, position, color, created_by_user_id)
  values (target_plan_view_id, target_title, target_group, target_group_type, next_position, target_color, auth.uid())
  returning plan_roadmap_lanes.id into new_lane_id;

  return query select new_lane_id as id, target_title as title, next_position as position;
end;
$$;

create or replace function public.create_roadmap_item(
  target_lane_id uuid,
  target_label text,
  target_start_period date,
  target_end_period date,
  target_color text default null,
  target_item_type public.roadmap_item_type default 'bar',
  target_initiative_id uuid default null
)
returns table(id uuid, label text, "position" integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace_id uuid;
  next_position integer;
  new_item_id uuid;
begin
  select p.workspace_id into target_workspace_id
  from public.plan_roadmap_lanes l
  join public.plan_views v on v.id = l.plan_view_id
  join public.workspace_plans p on p.id = v.plan_id
  where l.id = target_lane_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  select coalesce(max(i.position), -1) + 1 into next_position
  from public.plan_roadmap_items i
  where i.lane_id = target_lane_id;

  insert into public.plan_roadmap_items (lane_id, label, start_period, end_period, color, item_type, initiative_id, position, created_by_user_id)
  values (target_lane_id, target_label, target_start_period, target_end_period, target_color, target_item_type, target_initiative_id, next_position, auth.uid())
  returning plan_roadmap_items.id into new_item_id;

  return query select new_item_id as id, target_label as label, next_position as position;
end;
$$;

create or replace function public.update_roadmap_item(
  target_item_id uuid,
  target_label text default null,
  target_start_period date default null,
  target_end_period date default null,
  target_color text default null,
  target_lane_id uuid default null,
  target_initiative_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace_id uuid;
begin
  select p.workspace_id into target_workspace_id
  from public.plan_roadmap_items i
  join public.plan_roadmap_lanes l on l.id = i.lane_id
  join public.plan_views v on v.id = l.plan_view_id
  join public.workspace_plans p on p.id = v.plan_id
  where i.id = target_item_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  update public.plan_roadmap_items set
    label = coalesce(target_label, label),
    start_period = coalesce(target_start_period, start_period),
    end_period = coalesce(target_end_period, end_period),
    color = coalesce(target_color, color),
    lane_id = coalesce(target_lane_id, lane_id),
    initiative_id = case when target_initiative_id is not null then target_initiative_id else initiative_id end,
    updated_at = timezone('utc', now())
  where id = target_item_id;
end;
$$;

create or replace function public.delete_roadmap_item(
  target_item_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace_id uuid;
begin
  select p.workspace_id into target_workspace_id
  from public.plan_roadmap_items i
  join public.plan_roadmap_lanes l on l.id = i.lane_id
  join public.plan_views v on v.id = l.plan_view_id
  join public.workspace_plans p on p.id = v.plan_id
  where i.id = target_item_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  delete from public.plan_roadmap_items where id = target_item_id;
end;
$$;

create or replace function public.create_roadmap_milestone(
  target_plan_view_id uuid,
  target_label text,
  target_date date,
  target_type public.roadmap_milestone_type default 'diamond',
  target_lane_id uuid default null,
  target_color text default null
)
returns table(id uuid, label text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace_id uuid;
  new_milestone_id uuid;
begin
  select p.workspace_id into target_workspace_id
  from public.plan_views v
  join public.workspace_plans p on p.id = v.plan_id
  where v.id = target_plan_view_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  insert into public.plan_roadmap_milestones (plan_view_id, lane_id, milestone_date, label, milestone_type, color, created_by_user_id)
  values (target_plan_view_id, target_lane_id, target_date, target_label, target_type, target_color, auth.uid())
  returning plan_roadmap_milestones.id into new_milestone_id;

  return query select new_milestone_id as id, target_label as label;
end;
$$;

create or replace function public.update_roadmap_milestone(
  target_milestone_id uuid,
  target_label text default null,
  target_date date default null,
  target_type public.roadmap_milestone_type default null,
  target_lane_id uuid default null,
  target_color text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace_id uuid;
begin
  select p.workspace_id into target_workspace_id
  from public.plan_roadmap_milestones m
  join public.plan_views v on v.id = m.plan_view_id
  join public.workspace_plans p on p.id = v.plan_id
  where m.id = target_milestone_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  update public.plan_roadmap_milestones set
    label = coalesce(target_label, label),
    milestone_date = coalesce(target_date, milestone_date),
    milestone_type = coalesce(target_type, milestone_type),
    lane_id = target_lane_id,
    color = coalesce(target_color, color),
    updated_at = timezone('utc', now())
  where id = target_milestone_id;
end;
$$;

create or replace function public.delete_roadmap_milestone(
  target_milestone_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace_id uuid;
begin
  select p.workspace_id into target_workspace_id
  from public.plan_roadmap_milestones m
  join public.plan_views v on v.id = m.plan_view_id
  join public.workspace_plans p on p.id = v.plan_id
  where m.id = target_milestone_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  delete from public.plan_roadmap_milestones where id = target_milestone_id;
end;
$$;

create or replace function public.update_roadmap_lane(
  target_lane_id uuid,
  target_title text default null,
  target_group text default null,
  target_color text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace_id uuid;
begin
  select p.workspace_id into target_workspace_id
  from public.plan_roadmap_lanes l
  join public.plan_views v on v.id = l.plan_view_id
  join public.workspace_plans p on p.id = v.plan_id
  where l.id = target_lane_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  update public.plan_roadmap_lanes set
    title = coalesce(target_title, title),
    "group" = coalesce(target_group, "group"),
    color = coalesce(target_color, color),
    updated_at = timezone('utc', now())
  where id = target_lane_id;
end;
$$;

create or replace function public.delete_roadmap_lane(
  target_lane_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace_id uuid;
begin
  select p.workspace_id into target_workspace_id
  from public.plan_roadmap_lanes l
  join public.plan_views v on v.id = l.plan_view_id
  join public.workspace_plans p on p.id = v.plan_id
  where l.id = target_lane_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  delete from public.plan_roadmap_lanes where id = target_lane_id;
end;
$$;

create or replace function public.upsert_roadmap_matrix_cell(
  target_plan_view_id uuid,
  target_lane_id uuid,
  target_period_key text,
  target_content_text text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace_id uuid;
begin
  select p.workspace_id into target_workspace_id
  from public.plan_views v
  join public.workspace_plans p on p.id = v.plan_id
  where v.id = target_plan_view_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  insert into public.plan_roadmap_matrix_cells (plan_view_id, lane_id, period_key, content_text)
  values (target_plan_view_id, target_lane_id, target_period_key, target_content_text)
  on conflict (plan_view_id, lane_id, period_key)
  do update set
    content_text = excluded.content_text,
    updated_at = timezone('utc', now());
end;
$$;

create or replace function public.update_plan_view_config(
  target_view_id uuid,
  target_config_json jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace_id uuid;
begin
  select p.workspace_id into target_workspace_id
  from public.plan_views v
  join public.workspace_plans p on p.id = v.plan_id
  where v.id = target_view_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  update public.plan_views
  set config_json = target_config_json, updated_at = timezone('utc', now())
  where id = target_view_id;
end;
$$;

create table public.plan_releases (
  id uuid primary key default gen_random_uuid(),
  plan_view_id uuid not null references public.plan_views (id) on delete cascade,
  name text not null,
  build_number text,
  status public.release_status not null default 'draft',
  health public.release_health not null default 'on_track',
  planned_date date,
  actual_date date,
  force_upgrade boolean not null default false,
  ab_variations text,
  release_notes text,
  retro_url text,
  retro_notes text,
  position integer not null default 0,
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  updated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz,
  constraint plan_releases_name_not_blank check (length(trim(name)) > 0)
);

create index plan_releases_view_idx
  on public.plan_releases (plan_view_id, position, created_at);

create trigger plan_releases_set_updated_at
before update on public.plan_releases
for each row execute function public.set_updated_at();

alter table public.plan_releases enable row level security;

create policy plan_releases_select on public.plan_releases
  for select using (public.can_access_plan_view(plan_view_id));

create policy plan_releases_insert on public.plan_releases
  for insert with check (public.can_manage_plan_view(plan_view_id));

create policy plan_releases_update on public.plan_releases
  for update using (public.can_manage_plan_view(plan_view_id));

create policy plan_releases_delete on public.plan_releases
  for delete using (public.can_manage_plan_view(plan_view_id));

-- Normalized release checklist items (replaces checklist_json)
create table public.plan_release_checklist_items (
  id text primary key,
  release_id uuid not null references public.plan_releases (id) on delete cascade,
  label text not null,
  checked boolean not null default false,
  checked_at timestamptz,
  checked_by_user_id uuid references auth.users (id) on delete set null,
  position integer not null default 0,
  constraint plan_release_checklist_items_label_not_blank check (length(trim(label)) > 0)
);

create index plan_release_checklist_items_release_idx
  on public.plan_release_checklist_items (release_id, position);

alter table public.plan_release_checklist_items enable row level security;

create policy plan_release_checklist_items_select on public.plan_release_checklist_items
  for select using (
    exists (select 1 from public.plan_releases r where r.id = plan_release_checklist_items.release_id and public.can_access_plan_view(r.plan_view_id))
  );

create policy plan_release_checklist_items_insert on public.plan_release_checklist_items
  for insert with check (
    exists (select 1 from public.plan_releases r where r.id = plan_release_checklist_items.release_id and public.can_manage_plan_view(r.plan_view_id))
  );

create policy plan_release_checklist_items_update on public.plan_release_checklist_items
  for update using (
    exists (select 1 from public.plan_releases r where r.id = plan_release_checklist_items.release_id and public.can_manage_plan_view(r.plan_view_id))
  );

create policy plan_release_checklist_items_delete on public.plan_release_checklist_items
  for delete using (
    exists (select 1 from public.plan_releases r where r.id = plan_release_checklist_items.release_id and public.can_manage_plan_view(r.plan_view_id))
  );

-- Normalized release note sections (replaces notes_json)
create table public.plan_release_note_sections (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.plan_releases (id) on delete cascade,
  label text not null,
  content jsonb not null default '{}'::jsonb,
  position integer not null default 0,
  constraint plan_release_note_sections_label_not_blank check (length(trim(label)) > 0)
);

create index plan_release_note_sections_release_idx
  on public.plan_release_note_sections (release_id, position);

alter table public.plan_release_note_sections enable row level security;

create policy plan_release_note_sections_select on public.plan_release_note_sections
  for select using (
    exists (select 1 from public.plan_releases r where r.id = plan_release_note_sections.release_id and public.can_access_plan_view(r.plan_view_id))
  );

create policy plan_release_note_sections_insert on public.plan_release_note_sections
  for insert with check (
    exists (select 1 from public.plan_releases r where r.id = plan_release_note_sections.release_id and public.can_manage_plan_view(r.plan_view_id))
  );

create policy plan_release_note_sections_update on public.plan_release_note_sections
  for update using (
    exists (select 1 from public.plan_releases r where r.id = plan_release_note_sections.release_id and public.can_manage_plan_view(r.plan_view_id))
  );

create policy plan_release_note_sections_delete on public.plan_release_note_sections
  for delete using (
    exists (select 1 from public.plan_releases r where r.id = plan_release_note_sections.release_id and public.can_manage_plan_view(r.plan_view_id))
  );

create or replace function public.get_releases_data(
  target_plan_view_id uuid
)
returns table(
  id uuid,
  plan_view_id uuid,
  name text,
  build_number text,
  status public.release_status,
  health public.release_health,
  planned_date date,
  actual_date date,
  force_upgrade boolean,
  ab_variations text,
  note_sections jsonb,
  release_notes text,
  retro_url text,
  retro_notes text,
  checklist_items jsonb,
  checklist_completed_count bigint,
  checklist_total_count bigint,
  "position" integer,
  created_at timestamptz,
  created_by_user_id uuid,
  updated_at timestamptz,
  drift integer,
  linked_card_count bigint,
  linked_sprint_count bigint,
  archived_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
begin
  select plan.workspace_id
    into target_workspace_id
  from public.plan_views plan_view
  join public.workspace_plans plan on plan.id = plan_view.plan_id
  where plan_view.id = target_plan_view_id
    and plan_view.view_type = 'releases';

  if target_workspace_id is null or not public.can_access_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  return query
    select
      r.id,
      r.plan_view_id,
      r.name,
      r.build_number,
      r.status,
      r.health,
      r.planned_date,
      r.actual_date,
      r.force_upgrade,
      r.ab_variations,
      coalesce(
        (select jsonb_agg(
          jsonb_build_object('label', ns.label, 'content', ns.content)
          order by ns.position
        ) from public.plan_release_note_sections ns where ns.release_id = r.id),
        '[]'::jsonb
      ) as note_sections,
      r.release_notes,
      r.retro_url,
      r.retro_notes,
      coalesce(
        (select jsonb_agg(
          jsonb_build_object(
            'id', ci.id,
            'checked', ci.checked,
            'checked_at', ci.checked_at,
            'checked_by_user_id', ci.checked_by_user_id,
            'checked_by_name', case
              when ci.checked_by_user_id is null then null
              else public.profile_display_name(ci.checked_by_user_id)
            end,
            'label', ci.label
          ) order by ci.position
        ) from public.plan_release_checklist_items ci where ci.release_id = r.id),
        '[]'::jsonb
      ) as checklist_items,
      (select count(*) from public.plan_release_checklist_items ci where ci.release_id = r.id and ci.checked) as checklist_completed_count,
      (select count(*) from public.plan_release_checklist_items ci where ci.release_id = r.id) as checklist_total_count,
      r.position,
      r.created_at,
      r.created_by_user_id,
      r.updated_at,
      case
        when r.planned_date is null or r.actual_date is null then null
        else (r.actual_date - r.planned_date)
      end as drift,
      (select count(*) from public.plan_release_cards lc where lc.release_id = r.id) as linked_card_count,
      (select count(*) from public.plan_release_sprints ls where ls.release_id = r.id) as linked_sprint_count,
      r.archived_at
    from public.plan_releases r
    where r.plan_view_id = target_plan_view_id
    order by r.position, r.created_at;
end;
$$;

create or replace function public.create_release(
  target_plan_view_id uuid,
  target_name text,
  target_status public.release_status default 'draft',
  target_planned_date date default null,
  target_build_number text default null
)
returns table(
  id uuid,
  plan_view_id uuid,
  name text,
  build_number text,
  status public.release_status,
  health public.release_health,
  planned_date date,
  actual_date date,
  force_upgrade boolean,
  ab_variations text,
  note_sections jsonb,
  release_notes text,
  retro_url text,
  retro_notes text,
  checklist_items jsonb,
  checklist_completed_count bigint,
  checklist_total_count bigint,
  "position" integer,
  created_at timestamptz,
  created_by_user_id uuid,
  updated_at timestamptz,
  drift integer,
  linked_card_count bigint,
  linked_sprint_count bigint,
  archived_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
  new_release_id uuid;
  normalized_name text := trim(target_name);
begin
  select plan.workspace_id
    into target_workspace_id
  from public.plan_views plan_view
  join public.workspace_plans plan on plan.id = plan_view.plan_id
  where plan_view.id = target_plan_view_id
    and plan_view.view_type = 'releases';

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  if normalized_name = '' then
    raise exception 'Release name is required.';
  end if;

  update public.plan_releases
  set
    position = plan_releases.position + 1,
    updated_by_user_id = auth.uid()
  where plan_releases.plan_view_id = target_plan_view_id;

  insert into public.plan_releases (
    plan_view_id,
    name,
    build_number,
    status,
    planned_date,
    actual_date,
    position,
    created_by_user_id,
    updated_by_user_id,
    archived_at
  )
  values (
    target_plan_view_id,
    normalized_name,
    nullif(trim(target_build_number), ''),
    target_status,
    target_planned_date,
    case
      when target_status = 'released' then current_date
      else null
    end,
    0,
    auth.uid(),
    auth.uid(),
    case
      when target_status = 'archived' then timezone('utc', now())
      else null
    end
  )
  returning plan_releases.id into new_release_id;

  return query
    select
      r.id,
      r.plan_view_id,
      r.name,
      r.build_number,
      r.status,
      r.health,
      r.planned_date,
      r.actual_date,
      r.force_upgrade,
      r.ab_variations,
      coalesce(
        (select jsonb_agg(jsonb_build_object('label', ns.label, 'content', ns.content) order by ns.position)
         from public.plan_release_note_sections ns where ns.release_id = r.id),
        '[]'::jsonb
      ) as note_sections,
      r.release_notes,
      r.retro_url,
      r.retro_notes,
      coalesce(
        (select jsonb_agg(jsonb_build_object(
          'id', ci.id, 'checked', ci.checked, 'checked_at', ci.checked_at,
          'checked_by_user_id', ci.checked_by_user_id,
          'checked_by_name', case when ci.checked_by_user_id is null then null else public.profile_display_name(ci.checked_by_user_id) end,
          'label', ci.label
        ) order by ci.position) from public.plan_release_checklist_items ci where ci.release_id = r.id),
        '[]'::jsonb
      ) as checklist_items,
      (select count(*) from public.plan_release_checklist_items ci where ci.release_id = r.id and ci.checked) as checklist_completed_count,
      (select count(*) from public.plan_release_checklist_items ci where ci.release_id = r.id) as checklist_total_count,
      r.position,
      r.created_at,
      r.created_by_user_id,
      r.updated_at,
      case when r.planned_date is null or r.actual_date is null then null else (r.actual_date - r.planned_date) end as drift,
      (select count(*) from public.plan_release_cards lc where lc.release_id = r.id) as linked_card_count,
      (select count(*) from public.plan_release_sprints ls where ls.release_id = r.id) as linked_sprint_count,
      r.archived_at
    from public.plan_releases r
    where r.id = new_release_id;
end;
$$;

create or replace function public.update_release(
  target_release_id uuid,
  target_name text default null,
  target_build_number text default null,
  target_planned_date date default null,
  target_actual_date date default null,
  target_force_upgrade boolean default null,
  target_ab_variations text default null,
  target_release_notes text default null,
  target_retro_url text default null,
  target_retro_notes text default null,
  target_clear_build_number boolean default false,
  target_clear_planned_date boolean default false,
  target_clear_actual_date boolean default false,
  target_clear_ab_variations boolean default false,
  target_clear_release_notes boolean default false,
  target_clear_retro_url boolean default false,
  target_clear_retro_notes boolean default false
)
returns table(
  id uuid,
  plan_view_id uuid,
  name text,
  build_number text,
  status public.release_status,
  health public.release_health,
  planned_date date,
  actual_date date,
  force_upgrade boolean,
  ab_variations text,
  note_sections jsonb,
  release_notes text,
  retro_url text,
  retro_notes text,
  checklist_items jsonb,
  checklist_completed_count bigint,
  checklist_total_count bigint,
  "position" integer,
  created_at timestamptz,
  created_by_user_id uuid,
  updated_at timestamptz,
  drift integer,
  linked_card_count bigint,
  linked_sprint_count bigint,
  archived_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
  normalized_name text := case when target_name is null then null else trim(target_name) end;
begin
  select plan.workspace_id
    into target_workspace_id
  from public.plan_releases release
  join public.plan_views plan_view on plan_view.id = release.plan_view_id
  join public.workspace_plans plan on plan.id = plan_view.plan_id
  where release.id = target_release_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  if target_name is not null and normalized_name = '' then
    raise exception 'Release name is required.';
  end if;

  update public.plan_releases
  set
    name = coalesce(normalized_name, plan_releases.name),
    build_number = case
      when target_clear_build_number then null
      when target_build_number is not null then nullif(trim(target_build_number), '')
      else plan_releases.build_number
    end,
    planned_date = case
      when target_clear_planned_date then null
      when target_planned_date is not null then target_planned_date
      else plan_releases.planned_date
    end,
    actual_date = case
      when target_clear_actual_date then null
      when target_actual_date is not null then target_actual_date
      else plan_releases.actual_date
    end,
    force_upgrade = coalesce(target_force_upgrade, plan_releases.force_upgrade),
    ab_variations = case
      when target_clear_ab_variations then null
      when target_ab_variations is not null then nullif(trim(target_ab_variations), '')
      else plan_releases.ab_variations
    end,
    release_notes = case
      when target_clear_release_notes then null
      when target_release_notes is not null then nullif(trim(target_release_notes), '')
      else plan_releases.release_notes
    end,
    retro_url = case
      when target_clear_retro_url then null
      when target_retro_url is not null then nullif(trim(target_retro_url), '')
      else plan_releases.retro_url
    end,
    retro_notes = case
      when target_clear_retro_notes then null
      when target_retro_notes is not null then nullif(trim(target_retro_notes), '')
      else plan_releases.retro_notes
    end,
    updated_by_user_id = auth.uid()
  where plan_releases.id = target_release_id;

  return query
    select
      r.id,
      r.plan_view_id,
      r.name,
      r.build_number,
      r.status,
      r.health,
      r.planned_date,
      r.actual_date,
      r.force_upgrade,
      r.ab_variations,
      coalesce(
        (select jsonb_agg(jsonb_build_object('label', ns.label, 'content', ns.content) order by ns.position)
         from public.plan_release_note_sections ns where ns.release_id = r.id),
        '[]'::jsonb
      ) as note_sections,
      r.release_notes,
      r.retro_url,
      r.retro_notes,
      coalesce(
        (select jsonb_agg(jsonb_build_object(
          'id', ci.id, 'checked', ci.checked, 'checked_at', ci.checked_at,
          'checked_by_user_id', ci.checked_by_user_id,
          'checked_by_name', case when ci.checked_by_user_id is null then null else public.profile_display_name(ci.checked_by_user_id) end,
          'label', ci.label
        ) order by ci.position) from public.plan_release_checklist_items ci where ci.release_id = r.id),
        '[]'::jsonb
      ) as checklist_items,
      (select count(*) from public.plan_release_checklist_items ci where ci.release_id = r.id and ci.checked) as checklist_completed_count,
      (select count(*) from public.plan_release_checklist_items ci where ci.release_id = r.id) as checklist_total_count,
      r.position,
      r.created_at,
      r.created_by_user_id,
      r.updated_at,
      case when r.planned_date is null or r.actual_date is null then null else (r.actual_date - r.planned_date) end as drift,
      (select count(*) from public.plan_release_cards lc where lc.release_id = r.id) as linked_card_count,
      (select count(*) from public.plan_release_sprints ls where ls.release_id = r.id) as linked_sprint_count,
      r.archived_at
    from public.plan_releases r
    where r.id = target_release_id;
end;
$$;

create or replace function public.update_release_status(
  target_release_id uuid,
  target_new_status public.release_status
)
returns table(
  id uuid,
  plan_view_id uuid,
  name text,
  build_number text,
  status public.release_status,
  health public.release_health,
  planned_date date,
  actual_date date,
  force_upgrade boolean,
  ab_variations text,
  note_sections jsonb,
  release_notes text,
  retro_url text,
  retro_notes text,
  checklist_items jsonb,
  checklist_completed_count bigint,
  checklist_total_count bigint,
  "position" integer,
  created_at timestamptz,
  created_by_user_id uuid,
  updated_at timestamptz,
  drift integer,
  linked_card_count bigint,
  linked_sprint_count bigint,
  archived_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
  current_status public.release_status;
  current_actual_date date;
  transition_allowed boolean := false;
begin
  select
    plan.workspace_id,
    release.status,
    release.actual_date
    into target_workspace_id, current_status, current_actual_date
  from public.plan_releases release
  join public.plan_views plan_view on plan_view.id = release.plan_view_id
  join public.workspace_plans plan on plan.id = plan_view.plan_id
  where release.id = target_release_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  if current_status <> target_new_status then
    transition_allowed := case current_status
      when 'draft' then target_new_status in ('planned', 'archived')
      when 'planned' then target_new_status in ('draft', 'in_progress', 'archived')
      when 'in_progress' then target_new_status in ('planned', 'released', 'archived')
      when 'released' then target_new_status in ('in_progress', 'archived')
      when 'archived' then target_new_status in ('draft', 'planned', 'in_progress', 'released')
      else false
    end;

    if not transition_allowed then
      raise exception 'Invalid release status transition.';
    end if;

    update public.plan_releases
    set
      status = target_new_status,
      actual_date = case
        when target_new_status = 'released' and current_actual_date is null then current_date
        else plan_releases.actual_date
      end,
      archived_at = case
        when target_new_status = 'archived' then timezone('utc', now())
        else null
      end,
      updated_by_user_id = auth.uid()
    where plan_releases.id = target_release_id;
  end if;

  return query
    select
      r.id,
      r.plan_view_id,
      r.name,
      r.build_number,
      r.status,
      r.health,
      r.planned_date,
      r.actual_date,
      r.force_upgrade,
      r.ab_variations,
      coalesce(
        (select jsonb_agg(jsonb_build_object('label', ns.label, 'content', ns.content) order by ns.position)
         from public.plan_release_note_sections ns where ns.release_id = r.id),
        '[]'::jsonb
      ) as note_sections,
      r.release_notes,
      r.retro_url,
      r.retro_notes,
      coalesce(
        (select jsonb_agg(jsonb_build_object(
          'id', ci.id, 'checked', ci.checked, 'checked_at', ci.checked_at,
          'checked_by_user_id', ci.checked_by_user_id,
          'checked_by_name', case when ci.checked_by_user_id is null then null else public.profile_display_name(ci.checked_by_user_id) end,
          'label', ci.label
        ) order by ci.position) from public.plan_release_checklist_items ci where ci.release_id = r.id),
        '[]'::jsonb
      ) as checklist_items,
      (select count(*) from public.plan_release_checklist_items ci where ci.release_id = r.id and ci.checked) as checklist_completed_count,
      (select count(*) from public.plan_release_checklist_items ci where ci.release_id = r.id) as checklist_total_count,
      r.position,
      r.created_at,
      r.created_by_user_id,
      r.updated_at,
      case when r.planned_date is null or r.actual_date is null then null else (r.actual_date - r.planned_date) end as drift,
      (select count(*) from public.plan_release_cards lc where lc.release_id = r.id) as linked_card_count,
      (select count(*) from public.plan_release_sprints ls where ls.release_id = r.id) as linked_sprint_count,
      r.archived_at
    from public.plan_releases r
    where r.id = target_release_id;
end;
$$;

create or replace function public.update_release_health(
  target_release_id uuid,
  target_new_health public.release_health
)
returns table(
  id uuid,
  plan_view_id uuid,
  name text,
  build_number text,
  status public.release_status,
  health public.release_health,
  planned_date date,
  actual_date date,
  force_upgrade boolean,
  ab_variations text,
  note_sections jsonb,
  release_notes text,
  retro_url text,
  retro_notes text,
  checklist_items jsonb,
  checklist_completed_count bigint,
  checklist_total_count bigint,
  "position" integer,
  created_at timestamptz,
  created_by_user_id uuid,
  updated_at timestamptz,
  drift integer,
  linked_card_count bigint,
  linked_sprint_count bigint,
  archived_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
begin
  select plan.workspace_id
    into target_workspace_id
  from public.plan_releases release
  join public.plan_views plan_view on plan_view.id = release.plan_view_id
  join public.workspace_plans plan on plan.id = plan_view.plan_id
  where release.id = target_release_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  update public.plan_releases
  set
    health = target_new_health,
    updated_by_user_id = auth.uid()
  where plan_releases.id = target_release_id;

  return query
    select
      r.id,
      r.plan_view_id,
      r.name,
      r.build_number,
      r.status,
      r.health,
      r.planned_date,
      r.actual_date,
      r.force_upgrade,
      r.ab_variations,
      coalesce(
        (select jsonb_agg(jsonb_build_object('label', ns.label, 'content', ns.content) order by ns.position)
         from public.plan_release_note_sections ns where ns.release_id = r.id),
        '[]'::jsonb
      ) as note_sections,
      r.release_notes,
      r.retro_url,
      r.retro_notes,
      coalesce(
        (select jsonb_agg(jsonb_build_object(
          'id', ci.id, 'checked', ci.checked, 'checked_at', ci.checked_at,
          'checked_by_user_id', ci.checked_by_user_id,
          'checked_by_name', case when ci.checked_by_user_id is null then null else public.profile_display_name(ci.checked_by_user_id) end,
          'label', ci.label
        ) order by ci.position) from public.plan_release_checklist_items ci where ci.release_id = r.id),
        '[]'::jsonb
      ) as checklist_items,
      (select count(*) from public.plan_release_checklist_items ci where ci.release_id = r.id and ci.checked) as checklist_completed_count,
      (select count(*) from public.plan_release_checklist_items ci where ci.release_id = r.id) as checklist_total_count,
      r.position,
      r.created_at,
      r.created_by_user_id,
      r.updated_at,
      case when r.planned_date is null or r.actual_date is null then null else (r.actual_date - r.planned_date) end as drift,
      (select count(*) from public.plan_release_cards lc where lc.release_id = r.id) as linked_card_count,
      (select count(*) from public.plan_release_sprints ls where ls.release_id = r.id) as linked_sprint_count,
      r.archived_at
    from public.plan_releases r
    where r.id = target_release_id;
end;
$$;

create or replace function public.reorder_release(
  target_release_id uuid,
  target_new_position integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_release public.plan_releases%rowtype;
  target_workspace_id uuid;
  old_position integer;
  max_position integer;
  resolved_new_position integer;
begin
  select release.*
    into current_release
  from public.plan_releases release
  where release.id = target_release_id;

  if current_release.id is null then
    raise exception 'Release not found.';
  end if;

  select plan.workspace_id
    into target_workspace_id
  from public.plan_views plan_view
  join public.workspace_plans plan on plan.id = plan_view.plan_id
  where plan_view.id = current_release.plan_view_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  select coalesce(max(release.position), 0)
    into max_position
  from public.plan_releases release
  where release.plan_view_id = current_release.plan_view_id;

  resolved_new_position := greatest(0, least(target_new_position, max_position));
  old_position := current_release.position;

  if resolved_new_position < old_position then
    update public.plan_releases
    set
      position = position + 1,
      updated_by_user_id = auth.uid()
    where plan_view_id = current_release.plan_view_id
      and position >= resolved_new_position
      and position < old_position
      and id <> target_release_id;
  elsif resolved_new_position > old_position then
    update public.plan_releases
    set
      position = position - 1,
      updated_by_user_id = auth.uid()
    where plan_view_id = current_release.plan_view_id
      and position > old_position
      and position <= resolved_new_position
      and id <> target_release_id;
  end if;

  update public.plan_releases
  set
    position = resolved_new_position,
    updated_by_user_id = auth.uid()
  where id = target_release_id;
end;
$$;

create or replace function public.delete_release(
  target_release_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_release public.plan_releases%rowtype;
  target_workspace_id uuid;
begin
  select release.*
    into current_release
  from public.plan_releases release
  where release.id = target_release_id;

  if current_release.id is null then
    raise exception 'Release not found.';
  end if;

  if current_release.status <> 'archived' then
    raise exception 'Only archived releases can be permanently deleted.';
  end if;

  select plan.workspace_id
    into target_workspace_id
  from public.plan_views plan_view
  join public.workspace_plans plan on plan.id = plan_view.plan_id
  where plan_view.id = current_release.plan_view_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  delete from public.plan_releases
  where id = target_release_id;

  update public.plan_releases
  set
    position = position - 1,
    updated_by_user_id = auth.uid()
  where plan_view_id = current_release.plan_view_id
    and position > current_release.position;
end;
$$;

revoke all on function public.get_releases_data(uuid) from public;

grant execute on function public.get_releases_data(uuid) to authenticated;

revoke all on function public.create_release(uuid, text, public.release_status, date, text) from public;

grant execute on function public.create_release(uuid, text, public.release_status, date, text) to authenticated;

revoke all on function public.update_release(uuid, text, text, date, date, boolean, text, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean) from public;

grant execute on function public.update_release(uuid, text, text, date, date, boolean, text, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;

revoke all on function public.update_release_status(uuid, public.release_status) from public;

grant execute on function public.update_release_status(uuid, public.release_status) to authenticated;

revoke all on function public.update_release_health(uuid, public.release_health) from public;

grant execute on function public.update_release_health(uuid, public.release_health) to authenticated;

revoke all on function public.reorder_release(uuid, integer) from public;

grant execute on function public.reorder_release(uuid, integer) to authenticated;

revoke all on function public.delete_release(uuid) from public;

grant execute on function public.delete_release(uuid) to authenticated;

create table public.plan_release_cards (
  release_id uuid not null references public.plan_releases (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  linked_at timestamptz not null default timezone('utc', now()),
  linked_by_user_id uuid not null references auth.users (id) on delete restrict,
  primary key (release_id, card_id)
);

create index plan_release_cards_release_idx on public.plan_release_cards (release_id, linked_at);

create index plan_release_cards_card_idx on public.plan_release_cards (card_id);

alter table public.plan_release_cards enable row level security;

create policy plan_release_cards_select on public.plan_release_cards
  for select using (
    exists (
      select 1 from public.plan_releases r
      where r.id = plan_release_cards.release_id
        and public.can_access_plan_view(r.plan_view_id)
    )
  );

create policy plan_release_cards_insert on public.plan_release_cards
  for insert with check (
    exists (
      select 1 from public.plan_releases r
      where r.id = plan_release_cards.release_id
        and public.can_manage_plan_view(r.plan_view_id)
    )
  );

create policy plan_release_cards_delete on public.plan_release_cards
  for delete using (
    exists (
      select 1 from public.plan_releases r
      where r.id = plan_release_cards.release_id
        and public.can_manage_plan_view(r.plan_view_id)
    )
  );

create table public.plan_release_sprints (
  release_id uuid not null references public.plan_releases (id) on delete cascade,
  sprint_id uuid not null references public.project_sprints (id) on delete cascade,
  linked_at timestamptz not null default timezone('utc', now()),
  linked_by_user_id uuid not null references auth.users (id) on delete restrict,
  primary key (release_id, sprint_id)
);

create index plan_release_sprints_release_idx on public.plan_release_sprints (release_id, linked_at);

create index plan_release_sprints_sprint_idx on public.plan_release_sprints (sprint_id);

alter table public.plan_release_sprints enable row level security;

create policy plan_release_sprints_select on public.plan_release_sprints
  for select using (
    exists (
      select 1 from public.plan_releases r
      where r.id = plan_release_sprints.release_id
        and public.can_access_plan_view(r.plan_view_id)
    )
  );

create policy plan_release_sprints_insert on public.plan_release_sprints
  for insert with check (
    exists (
      select 1 from public.plan_releases r
      where r.id = plan_release_sprints.release_id
        and public.can_manage_plan_view(r.plan_view_id)
    )
  );

create policy plan_release_sprints_delete on public.plan_release_sprints
  for delete using (
    exists (
      select 1 from public.plan_releases r
      where r.id = plan_release_sprints.release_id
        and public.can_manage_plan_view(r.plan_view_id)
    )
  );

create table public.plan_view_release_shares (
  id uuid primary key default gen_random_uuid(),
  plan_view_id uuid not null unique references public.plan_views (id) on delete cascade,
  share_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz
);

alter table public.plan_view_release_shares enable row level security;

create policy plan_view_release_shares_select on public.plan_view_release_shares
  for select using (public.can_manage_plan_view(plan_view_id));

create policy plan_view_release_shares_insert on public.plan_view_release_shares
  for insert with check (
    public.can_manage_plan_view(plan_view_id)
    and exists (
      select 1 from public.plan_views v
      where v.id = plan_view_release_shares.plan_view_id
        and v.view_type = 'releases'
    )
  );

create policy plan_view_release_shares_update on public.plan_view_release_shares
  for update using (public.can_manage_plan_view(plan_view_id));

create table public.plan_scorecard_items (
  id uuid primary key default gen_random_uuid(),
  plan_view_id uuid not null references public.plan_views (id) on delete cascade,
  title text not null,
  description text,
  scores_json jsonb not null default '{}'::jsonb,
  composite_score numeric not null default 0,
  tracked boolean not null default false,
  linked_release_id uuid references public.plan_releases (id) on delete set null,
  linked_roadmap_item_id uuid references public.plan_roadmap_items (id) on delete set null,
  position integer not null default 0,
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  updated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint plan_scorecard_items_title_not_blank check (length(trim(title)) > 0)
);

create index plan_scorecard_items_view_idx on public.plan_scorecard_items (plan_view_id, position, created_at);

create trigger plan_scorecard_items_set_updated_at
before update on public.plan_scorecard_items
for each row execute function public.set_updated_at();

alter table public.plan_scorecard_items enable row level security;

create policy plan_scorecard_items_select on public.plan_scorecard_items
  for select using (public.can_access_plan_view(plan_view_id));

create policy plan_scorecard_items_insert on public.plan_scorecard_items
  for insert with check (public.can_manage_plan_view(plan_view_id));

create policy plan_scorecard_items_update on public.plan_scorecard_items
  for update using (public.can_manage_plan_view(plan_view_id));

create policy plan_scorecard_items_delete on public.plan_scorecard_items
  for delete using (public.can_manage_plan_view(plan_view_id)
  );

create or replace function public.plan_release_payload(target_release_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', release.id,
    'planViewId', release.plan_view_id,
    'name', release.name,
    'buildNumber', release.build_number,
    'status', release.status,
    'health', release.health,
    'plannedDate', release.planned_date,
    'actualDate', release.actual_date,
    'forceUpgrade', release.force_upgrade,
    'abVariations', release.ab_variations,
    'noteSections', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('label', ns.label, 'content', ns.content)
          order by ns.position
        )
        from public.plan_release_note_sections ns
        where ns.release_id = release.id
      ),
      '[]'::jsonb
    ),
    'releaseNotes', release.release_notes,
    'retroUrl', release.retro_url,
    'retroNotes', release.retro_notes,
    'checklistItems', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', ci.id,
            'checked', ci.checked,
            'checkedAt', ci.checked_at,
            'checkedByUserId', ci.checked_by_user_id,
            'checkedByName', case
              when ci.checked_by_user_id is null then null
              else public.profile_display_name(ci.checked_by_user_id)
            end,
            'label', ci.label
          )
          order by ci.position
        )
        from public.plan_release_checklist_items ci
        where ci.release_id = release.id
      ),
      '[]'::jsonb
    ),
    'checklistCompletedCount', (
      select count(*)
      from public.plan_release_checklist_items ci
      where ci.release_id = release.id and ci.checked
    ),
    'checklistTotalCount', (
      select count(*)
      from public.plan_release_checklist_items ci
      where ci.release_id = release.id
    ),
    'position', release.position,
    'createdAt', release.created_at,
    'createdByUserId', release.created_by_user_id,
    'updatedAt', release.updated_at,
    'drift', case
      when release.planned_date is null or release.actual_date is null then null
      else (release.actual_date - release.planned_date)
    end,
    'linkedCardCount', (
      select count(*)
      from public.plan_release_cards linked_card
      where linked_card.release_id = release.id
    ),
    'linkedSprintCount', (
      select count(*)
      from public.plan_release_sprints linked_sprint
      where linked_sprint.release_id = release.id
    ),
    'archivedAt', release.archived_at
  )
  from public.plan_releases release
  where release.id = target_release_id;
$$;

revoke all on function public.plan_release_payload(uuid) from public;

revoke all on function public.plan_release_payload(uuid) from public;

create or replace function public.update_release_notes(
  target_release_id uuid,
  target_notes_json jsonb
)
returns table(
  id uuid,
  plan_view_id uuid,
  name text,
  build_number text,
  status public.release_status,
  health public.release_health,
  planned_date date,
  actual_date date,
  force_upgrade boolean,
  ab_variations text,
  note_sections jsonb,
  release_notes text,
  retro_url text,
  retro_notes text,
  checklist_items jsonb,
  checklist_completed_count bigint,
  checklist_total_count bigint,
  "position" integer,
  created_at timestamptz,
  created_by_user_id uuid,
  updated_at timestamptz,
  drift integer,
  linked_card_count bigint,
  linked_sprint_count bigint,
  archived_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
  sections jsonb := coalesce(target_notes_json->'sections', '[]'::jsonb);
  section_entry jsonb;
  seen_labels text[] := array[]::text[];
  normalized_label text;
begin
  select plan.workspace_id
    into target_workspace_id
  from public.plan_releases release
  join public.plan_views plan_view on plan_view.id = release.plan_view_id
  join public.workspace_plans plan on plan.id = plan_view.plan_id
  where release.id = target_release_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  if target_notes_json is null or jsonb_typeof(target_notes_json) <> 'object' then
    raise exception 'Release notes must be an object.';
  end if;

  if jsonb_typeof(sections) <> 'array' then
    raise exception 'Release note sections must be an array.';
  end if;

  if jsonb_array_length(sections) > 10 then
    raise exception 'A release can include at most 10 note sections.';
  end if;

  -- Validate labels before mutating
  for section_entry in
    select value
    from jsonb_array_elements(sections)
  loop
    normalized_label := trim(coalesce(section_entry->>'label', ''));

    if normalized_label = '' then
      raise exception 'Release note section labels cannot be blank.';
    end if;

    if normalized_label = any(seen_labels) then
      raise exception 'Release note section labels must be unique.';
    end if;

    seen_labels := array_append(seen_labels, normalized_label);
  end loop;

  -- Replace all sections atomically
  delete from public.plan_release_note_sections where plan_release_note_sections.release_id = target_release_id;

  insert into public.plan_release_note_sections (release_id, label, content, position)
  select
    target_release_id,
    trim(coalesce(section.value->>'label', '')),
    case
      when jsonb_typeof(section.value->'content') = 'object' then section.value->'content'
      when jsonb_typeof(section.value->'content') = 'string' then to_jsonb(section.value->>'content')
      else to_jsonb('')
    end,
    (section.ordinality - 1)::integer
  from jsonb_array_elements(sections) with ordinality as section(value, ordinality);

  update public.plan_releases
  set updated_by_user_id = auth.uid()
  where plan_releases.id = target_release_id;

  return query
    select
      r.id,
      r.plan_view_id,
      r.name,
      r.build_number,
      r.status,
      r.health,
      r.planned_date,
      r.actual_date,
      r.force_upgrade,
      r.ab_variations,
      coalesce(
        (select jsonb_agg(jsonb_build_object('label', ns.label, 'content', ns.content) order by ns.position)
         from public.plan_release_note_sections ns where ns.release_id = r.id),
        '[]'::jsonb
      ) as note_sections,
      r.release_notes,
      r.retro_url,
      r.retro_notes,
      coalesce(
        (select jsonb_agg(jsonb_build_object(
          'id', ci.id, 'checked', ci.checked, 'checked_at', ci.checked_at,
          'checked_by_user_id', ci.checked_by_user_id,
          'checked_by_name', case when ci.checked_by_user_id is null then null else public.profile_display_name(ci.checked_by_user_id) end,
          'label', ci.label
        ) order by ci.position) from public.plan_release_checklist_items ci where ci.release_id = r.id),
        '[]'::jsonb
      ) as checklist_items,
      (select count(*) from public.plan_release_checklist_items ci where ci.release_id = r.id and ci.checked) as checklist_completed_count,
      (select count(*) from public.plan_release_checklist_items ci where ci.release_id = r.id) as checklist_total_count,
      r.position,
      r.created_at,
      r.created_by_user_id,
      r.updated_at,
      case when r.planned_date is null or r.actual_date is null then null else (r.actual_date - r.planned_date) end as drift,
      (select count(*) from public.plan_release_cards lc where lc.release_id = r.id) as linked_card_count,
      (select count(*) from public.plan_release_sprints ls where ls.release_id = r.id) as linked_sprint_count,
      r.archived_at
    from public.plan_releases r
    where r.id = target_release_id;
end;
$$;

revoke all on function public.update_release_notes(uuid, jsonb) from public;

grant execute on function public.update_release_notes(uuid, jsonb) to authenticated;

create or replace function public.update_release_checklist(
  target_release_id uuid,
  target_checklist_json jsonb
)
returns table(
  id uuid,
  plan_view_id uuid,
  name text,
  build_number text,
  status public.release_status,
  health public.release_health,
  planned_date date,
  actual_date date,
  force_upgrade boolean,
  ab_variations text,
  note_sections jsonb,
  release_notes text,
  retro_url text,
  retro_notes text,
  checklist_items jsonb,
  checklist_completed_count bigint,
  checklist_total_count bigint,
  "position" integer,
  created_at timestamptz,
  created_by_user_id uuid,
  updated_at timestamptz,
  drift integer,
  linked_card_count bigint,
  linked_sprint_count bigint,
  archived_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
  items jsonb := coalesce(target_checklist_json->'items', '[]'::jsonb);
  item_entry jsonb;
  normalized_label text;
  item_index integer := 0;
begin
  select plan.workspace_id
    into target_workspace_id
  from public.plan_releases release
  join public.plan_views plan_view on plan_view.id = release.plan_view_id
  join public.workspace_plans plan on plan.id = plan_view.plan_id
  where release.id = target_release_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  if target_checklist_json is null or jsonb_typeof(target_checklist_json) <> 'object' then
    raise exception 'Checklist must be an object.';
  end if;

  if jsonb_typeof(items) <> 'array' then
    raise exception 'Checklist items must be an array.';
  end if;

  if jsonb_array_length(items) > 50 then
    raise exception 'A release checklist can include at most 50 items.';
  end if;

  -- Validate labels before mutating
  for item_entry in
    select value
    from jsonb_array_elements(items)
  loop
    item_index := item_index + 1;
    normalized_label := trim(coalesce(item_entry->>'label', ''));

    if normalized_label = '' then
      raise exception 'Checklist item labels cannot be blank.';
    end if;
  end loop;

  -- Snapshot existing checked items to preserve checked_by/checked_at
  create temp table _existing_checked on commit drop as
    select ci.id, ci.checked_by_user_id, ci.checked_at
    from public.plan_release_checklist_items ci
    where ci.release_id = target_release_id and ci.checked;

  -- Delete all existing items
  delete from public.plan_release_checklist_items where plan_release_checklist_items.release_id = target_release_id;

  -- Insert new items with smart merge of checked state
  insert into public.plan_release_checklist_items (id, release_id, label, checked, checked_at, checked_by_user_id, position)
  select
    coalesce(
      nullif(item.value->>'id', ''),
      md5(target_release_id::text || ':' || item.ordinality::text || ':' || trim(coalesce(item.value->>'label', '')))
    ),
    target_release_id,
    trim(coalesce(item.value->>'label', '')),
    coalesce((item.value->>'checked')::boolean, false),
    case
      when not coalesce((item.value->>'checked')::boolean, false) then null
      when ec.id is not null then ec.checked_at
      else timezone('utc', now())
    end,
    case
      when not coalesce((item.value->>'checked')::boolean, false) then null
      when ec.id is not null then ec.checked_by_user_id
      else auth.uid()
    end,
    (item.ordinality - 1)::integer
  from jsonb_array_elements(items) with ordinality as item(value, ordinality)
  left join _existing_checked ec on ec.id = coalesce(
    nullif(item.value->>'id', ''),
    md5(target_release_id::text || ':' || item.ordinality::text || ':' || trim(coalesce(item.value->>'label', '')))
  );

  update public.plan_releases
  set updated_by_user_id = auth.uid()
  where plan_releases.id = target_release_id;

  return query
    select
      r.id,
      r.plan_view_id,
      r.name,
      r.build_number,
      r.status,
      r.health,
      r.planned_date,
      r.actual_date,
      r.force_upgrade,
      r.ab_variations,
      coalesce(
        (select jsonb_agg(jsonb_build_object('label', ns.label, 'content', ns.content) order by ns.position)
         from public.plan_release_note_sections ns where ns.release_id = r.id),
        '[]'::jsonb
      ) as note_sections,
      r.release_notes,
      r.retro_url,
      r.retro_notes,
      coalesce(
        (select jsonb_agg(jsonb_build_object(
          'id', ci.id, 'checked', ci.checked, 'checked_at', ci.checked_at,
          'checked_by_user_id', ci.checked_by_user_id,
          'checked_by_name', case when ci.checked_by_user_id is null then null else public.profile_display_name(ci.checked_by_user_id) end,
          'label', ci.label
        ) order by ci.position) from public.plan_release_checklist_items ci where ci.release_id = r.id),
        '[]'::jsonb
      ) as checklist_items,
      (select count(*) from public.plan_release_checklist_items ci where ci.release_id = r.id and ci.checked) as checklist_completed_count,
      (select count(*) from public.plan_release_checklist_items ci where ci.release_id = r.id) as checklist_total_count,
      r.position,
      r.created_at,
      r.created_by_user_id,
      r.updated_at,
      case when r.planned_date is null or r.actual_date is null then null else (r.actual_date - r.planned_date) end as drift,
      (select count(*) from public.plan_release_cards lc where lc.release_id = r.id) as linked_card_count,
      (select count(*) from public.plan_release_sprints ls where ls.release_id = r.id) as linked_sprint_count,
      r.archived_at
    from public.plan_releases r
    where r.id = target_release_id;
end;
$$;

create or replace function public.get_release_linked_cards(
  target_release_id uuid
)
returns table(
  card_id uuid,
  title text,
  status_label text,
  status_category text,
  assignee_name text,
  project_id uuid,
  project_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
begin
  select plan.workspace_id
    into target_workspace_id
  from public.plan_releases release
  join public.plan_views plan_view on plan_view.id = release.plan_view_id
  join public.workspace_plans plan on plan.id = plan_view.plan_id
  where release.id = target_release_id;

  if target_workspace_id is null or not public.can_access_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  return query
    select
      card.id as card_id,
      card.title,
      coalesce(status_option.label, 'Unknown') as status_label,
      coalesce(status_option.category, 'not_started')::text as status_category,
      coalesce(profile.full_name, split_part(profile.email, '@', 1), 'Unassigned') as assignee_name,
      project.id as project_id,
      project.name as project_name
    from public.plan_release_cards linked_card
    join public.cards card on card.id = linked_card.card_id
    join public.projects project on project.id = card.project_id
    left join public.project_status_options status_option on status_option.id = card.status_option_id
    left join public.profiles profile on profile.user_id = card.assignee_user_id
    where linked_card.release_id = target_release_id
      and card.archived_at is null
      and card.deleted_at is null
      and project.archived_at is null
      and project.deleted_at is null
    order by project.name asc,
      case coalesce(status_option.category, 'not_started')
        when 'not_started' then 0
        when 'started' then 1
        when 'completed' then 2
        else 3
      end,
      card.position asc;
end;
$$;

create or replace function public.get_workspace_release_picker_cards(
  target_workspace_id uuid,
  target_release_id uuid
)
returns table(
  card_id uuid,
  title text,
  status_label text,
  status_category text,
  assignee_name text,
  project_id uuid,
  project_name text,
  linked boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  return query
    select
      card.id as card_id,
      card.title,
      coalesce(status_option.label, 'Unknown') as status_label,
      coalesce(status_option.category, 'not_started')::text as status_category,
      coalesce(profile.full_name, split_part(profile.email, '@', 1), 'Unassigned') as assignee_name,
      project.id as project_id,
      project.name as project_name,
      exists (
        select 1
        from public.plan_release_cards linked_card
        where linked_card.release_id = target_release_id
          and linked_card.card_id = card.id
      ) as linked
    from public.cards card
    join public.projects project on project.id = card.project_id
    left join public.project_status_options status_option on status_option.id = card.status_option_id
    left join public.profiles profile on profile.user_id = card.assignee_user_id
    where project.workspace_id = target_workspace_id
      and public.can_access_project(card.project_id)
      and card.archived_at is null
      and card.deleted_at is null
      and project.archived_at is null
      and project.deleted_at is null
    order by project.name asc,
      case coalesce(status_option.category, 'not_started')
        when 'not_started' then 0
        when 'started' then 1
        when 'completed' then 2
        else 3
      end,
      card.position asc;
end;
$$;

create or replace function public.link_cards_to_release(
  target_release_id uuid,
  target_card_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
  linked_card_id uuid;
begin
  select plan.workspace_id
    into target_workspace_id
  from public.plan_releases release
  join public.plan_views plan_view on plan_view.id = release.plan_view_id
  join public.workspace_plans plan on plan.id = plan_view.plan_id
  where release.id = target_release_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  foreach linked_card_id in array coalesce(target_card_ids, array[]::uuid[]) loop
    if not exists (
      select 1
      from public.cards card
      join public.projects project on project.id = card.project_id
      where card.id = linked_card_id
        and project.workspace_id = target_workspace_id
        and card.archived_at is null
        and card.deleted_at is null
        and project.archived_at is null
        and project.deleted_at is null
    ) then
      raise exception 'Cards must belong to the same workspace as the release.';
    end if;

    insert into public.plan_release_cards (release_id, card_id, linked_by_user_id)
    values (target_release_id, linked_card_id, auth.uid())
    on conflict do nothing;
  end loop;
end;
$$;

create or replace function public.unlink_card_from_release(
  target_release_id uuid,
  target_card_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
begin
  select plan.workspace_id
    into target_workspace_id
  from public.plan_releases release
  join public.plan_views plan_view on plan_view.id = release.plan_view_id
  join public.workspace_plans plan on plan.id = plan_view.plan_id
  where release.id = target_release_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  delete from public.plan_release_cards
  where release_id = target_release_id
    and card_id = target_card_id;
end;
$$;

create or replace function public.get_release_linked_sprints(
  target_release_id uuid
)
returns table(
  sprint_id uuid,
  name text,
  status text,
  start_date date,
  end_date date,
  project_id uuid,
  project_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
begin
  select plan.workspace_id
    into target_workspace_id
  from public.plan_releases release
  join public.plan_views plan_view on plan_view.id = release.plan_view_id
  join public.workspace_plans plan on plan.id = plan_view.plan_id
  where release.id = target_release_id;

  if target_workspace_id is null or not public.can_access_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  return query
    select
      sprint.id as sprint_id,
      sprint.name,
      sprint.status::text,
      sprint.start_date,
      sprint.end_date,
      project.id as project_id,
      project.name as project_name
    from public.plan_release_sprints linked_sprint
    join public.project_sprints sprint on sprint.id = linked_sprint.sprint_id
    join public.projects project on project.id = sprint.project_id
    where linked_sprint.release_id = target_release_id
      and project.archived_at is null
      and project.deleted_at is null
    order by project.name asc,
      case sprint.status
        when 'active' then 0
        when 'planned' then 1
        else 2
      end,
      sprint.position asc;
end;
$$;

create or replace function public.get_workspace_release_picker_sprints(
  target_workspace_id uuid,
  target_release_id uuid
)
returns table(
  sprint_id uuid,
  name text,
  status text,
  start_date date,
  end_date date,
  project_id uuid,
  project_name text,
  linked boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  return query
    select
      sprint.id as sprint_id,
      sprint.name,
      sprint.status::text,
      sprint.start_date,
      sprint.end_date,
      project.id as project_id,
      project.name as project_name,
      exists (
        select 1
        from public.plan_release_sprints linked_sprint
        where linked_sprint.release_id = target_release_id
          and linked_sprint.sprint_id = sprint.id
      ) as linked
    from public.project_sprints sprint
    join public.projects project on project.id = sprint.project_id
    where project.workspace_id = target_workspace_id
      and public.can_access_project(project.id)
      and project.archived_at is null
      and project.deleted_at is null
    order by project.name asc,
      case sprint.status
        when 'active' then 0
        when 'planned' then 1
        else 2
      end,
      sprint.position asc;
end;
$$;

create or replace function public.link_sprints_to_release(
  target_release_id uuid,
  target_sprint_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
  linked_sprint_id uuid;
begin
  select plan.workspace_id
    into target_workspace_id
  from public.plan_releases release
  join public.plan_views plan_view on plan_view.id = release.plan_view_id
  join public.workspace_plans plan on plan.id = plan_view.plan_id
  where release.id = target_release_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  foreach linked_sprint_id in array coalesce(target_sprint_ids, array[]::uuid[]) loop
    if not exists (
      select 1
      from public.project_sprints sprint
      join public.projects project on project.id = sprint.project_id
      where sprint.id = linked_sprint_id
        and project.workspace_id = target_workspace_id
        and project.archived_at is null
        and project.deleted_at is null
    ) then
      raise exception 'Sprints must belong to the same workspace as the release.';
    end if;

    insert into public.plan_release_sprints (release_id, sprint_id, linked_by_user_id)
    values (target_release_id, linked_sprint_id, auth.uid())
    on conflict do nothing;
  end loop;
end;
$$;

create or replace function public.unlink_sprint_from_release(
  target_release_id uuid,
  target_sprint_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
begin
  select plan.workspace_id
    into target_workspace_id
  from public.plan_releases release
  join public.plan_views plan_view on plan_view.id = release.plan_view_id
  join public.workspace_plans plan on plan.id = plan_view.plan_id
  where release.id = target_release_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  delete from public.plan_release_sprints
  where release_id = target_release_id
    and sprint_id = target_sprint_id;
end;
$$;

create or replace function public.get_release_share_snapshot(
  target_plan_view_id uuid
)
returns table(share_token text, created_at timestamptz, revoked_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
begin
  select plan.workspace_id
    into target_workspace_id
  from public.plan_views plan_view
  join public.workspace_plans plan on plan.id = plan_view.plan_id
  where plan_view.id = target_plan_view_id
    and plan_view.view_type = 'releases';

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  return query
    select
      share.share_token,
      share.created_at,
      share.revoked_at
    from public.plan_view_release_shares share
    where share.plan_view_id = target_plan_view_id
      and share.revoked_at is null;
end;
$$;

create or replace function public.create_release_share_link(
  target_plan_view_id uuid
)
returns table(share_token text, created_at timestamptz, revoked_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
  existing_share_id uuid;
begin
  select plan.workspace_id
    into target_workspace_id
  from public.plan_views plan_view
  join public.workspace_plans plan on plan.id = plan_view.plan_id
  where plan_view.id = target_plan_view_id
    and plan_view.view_type = 'releases';

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  select share.id
    into existing_share_id
  from public.plan_view_release_shares share
  where share.plan_view_id = target_plan_view_id
  limit 1;

  if existing_share_id is null then
    insert into public.plan_view_release_shares (plan_view_id, created_by_user_id)
    values (target_plan_view_id, auth.uid());
  else
    update public.plan_view_release_shares
    set
      share_token = replace(gen_random_uuid()::text, '-', ''),
      created_at = timezone('utc', now()),
      created_by_user_id = auth.uid(),
      revoked_at = null
    where plan_view_release_shares.id = existing_share_id;
  end if;

  return query
    select
      share.share_token,
      share.created_at,
      share.revoked_at
    from public.plan_view_release_shares share
    where share.plan_view_id = target_plan_view_id
      and share.revoked_at is null;
end;
$$;

create or replace function public.revoke_release_share_link(
  target_plan_view_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
begin
  select plan.workspace_id
    into target_workspace_id
  from public.plan_views plan_view
  join public.workspace_plans plan on plan.id = plan_view.plan_id
  where plan_view.id = target_plan_view_id
    and plan_view.view_type = 'releases';

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  update public.plan_view_release_shares
  set revoked_at = timezone('utc', now())
  where plan_view_id = target_plan_view_id
    and revoked_at is null;
end;
$$;

create or replace function public.get_public_release_share(
  target_share_token text
)
returns table(
  plan_id uuid,
  plan_name text,
  plan_view_id uuid,
  view_name text,
  workspace_name text,
  shared_at timestamptz,
  releases jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  found_plan_view_id uuid;
begin
  select plan_view.id
    into found_plan_view_id
  from public.plan_view_release_shares share
  join public.plan_views plan_view on plan_view.id = share.plan_view_id
  where share.share_token = trim(target_share_token)
    and share.revoked_at is null
    and plan_view.view_type = 'releases';

  if found_plan_view_id is null then
    raise exception 'Release share not found.';
  end if;

  return query
    select
      plan.id as plan_id,
      plan.name as plan_name,
      plan_view.id as plan_view_id,
      plan_view.name as view_name,
      workspace.name as workspace_name,
      share.created_at as shared_at,
      coalesce((
        select jsonb_agg(public.plan_release_payload(r.id) order by r.position, r.created_at)
        from public.plan_releases r
        where r.plan_view_id = plan_view.id
      ), '[]'::jsonb) as releases
    from public.plan_view_release_shares share
    join public.plan_views plan_view on plan_view.id = share.plan_view_id
    join public.workspace_plans plan on plan.id = plan_view.plan_id
    join public.workspaces workspace on workspace.id = plan.workspace_id
    where share.share_token = trim(target_share_token)
      and share.revoked_at is null
      and plan_view.view_type = 'releases';
end;
$$;

create or replace function public.plan_scorecard_item_payload(target_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', item.id,
    'planViewId', item.plan_view_id,
    'title', item.title,
    'description', item.description,
    'scores', item.scores_json,
    'compositeScore', item.composite_score,
    'tracked', item.tracked,
    'linkedReleaseId', item.linked_release_id,
    'linkedReleaseName', release.name,
    'linkedRoadmapItemId', item.linked_roadmap_item_id,
    'linkedRoadmapItemLabel', roadmap_item.label,
    'position', item.position,
    'createdAt', item.created_at,
    'updatedAt', item.updated_at
  )
  from public.plan_scorecard_items item
  left join public.plan_releases release on release.id = item.linked_release_id
  left join public.plan_roadmap_items roadmap_item on roadmap_item.id = item.linked_roadmap_item_id
  where item.id = target_item_id;
$$;

revoke all on function public.plan_scorecard_item_payload(uuid) from public;

create or replace function public.get_scorecard_data(
  target_plan_view_id uuid
)
returns table(
  id uuid,
  plan_view_id uuid,
  title text,
  description text,
  scores jsonb,
  composite_score numeric,
  tracked boolean,
  linked_release_id uuid,
  linked_release_name text,
  linked_roadmap_item_id uuid,
  linked_roadmap_item_label text,
  "position" integer,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
begin
  select plan.workspace_id
    into target_workspace_id
  from public.plan_views plan_view
  join public.workspace_plans plan on plan.id = plan_view.plan_id
  where plan_view.id = target_plan_view_id
    and plan_view.view_type = 'scorecard';

  if target_workspace_id is null or not public.can_access_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  return query
    select
      item.id,
      item.plan_view_id,
      item.title,
      item.description,
      item.scores_json as scores,
      item.composite_score,
      item.tracked,
      item.linked_release_id,
      release.name as linked_release_name,
      item.linked_roadmap_item_id,
      roadmap_item.label as linked_roadmap_item_label,
      item.position,
      item.created_at,
      item.updated_at
    from public.plan_scorecard_items item
    left join public.plan_releases release on release.id = item.linked_release_id
    left join public.plan_roadmap_items roadmap_item on roadmap_item.id = item.linked_roadmap_item_id
    where item.plan_view_id = target_plan_view_id
    order by item.position, item.created_at;
end;
$$;

create or replace function public.create_scorecard_item(
  target_plan_view_id uuid,
  target_title text default 'Untitled item'
)
returns table(
  id uuid,
  plan_view_id uuid,
  title text,
  description text,
  scores jsonb,
  composite_score numeric,
  tracked boolean,
  linked_release_id uuid,
  linked_release_name text,
  linked_roadmap_item_id uuid,
  linked_roadmap_item_label text,
  "position" integer,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
  normalized_title text := trim(target_title);
  new_item_id uuid;
begin
  select plan.workspace_id
    into target_workspace_id
  from public.plan_views plan_view
  join public.workspace_plans plan on plan.id = plan_view.plan_id
  where plan_view.id = target_plan_view_id
    and plan_view.view_type = 'scorecard';

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  if normalized_title = '' then
    raise exception 'Scorecard item title is required.';
  end if;

  update public.plan_scorecard_items
  set
    position = plan_scorecard_items.position + 1,
    updated_by_user_id = auth.uid()
  where plan_scorecard_items.plan_view_id = target_plan_view_id;

  insert into public.plan_scorecard_items (
    plan_view_id,
    title,
    position,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    target_plan_view_id,
    normalized_title,
    0,
    auth.uid(),
    auth.uid()
  )
  returning plan_scorecard_items.id into new_item_id;

  return query
    select
      item.id,
      item.plan_view_id,
      item.title,
      item.description,
      item.scores_json as scores,
      item.composite_score,
      item.tracked,
      item.linked_release_id,
      release.name as linked_release_name,
      item.linked_roadmap_item_id,
      roadmap_item.label as linked_roadmap_item_label,
      item.position,
      item.created_at,
      item.updated_at
    from public.plan_scorecard_items item
    left join public.plan_releases release on release.id = item.linked_release_id
    left join public.plan_roadmap_items roadmap_item on roadmap_item.id = item.linked_roadmap_item_id
    where item.id = new_item_id;
end;
$$;

create or replace function public.update_scorecard_item(
  target_item_id uuid,
  target_title text default null,
  target_description text default null,
  target_scores_json jsonb default null,
  target_composite_score numeric default null,
  target_tracked boolean default null,
  target_linked_release_id uuid default null,
  target_linked_roadmap_item_id uuid default null,
  target_clear_description boolean default false,
  target_clear_linked_release_id boolean default false,
  target_clear_linked_roadmap_item_id boolean default false
)
returns table(
  id uuid,
  plan_view_id uuid,
  title text,
  description text,
  scores jsonb,
  composite_score numeric,
  tracked boolean,
  linked_release_id uuid,
  linked_release_name text,
  linked_roadmap_item_id uuid,
  linked_roadmap_item_label text,
  "position" integer,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
  scorecard_plan_id uuid;
  normalized_title text := case when target_title is null then null else trim(target_title) end;
begin
  select
    plan.workspace_id,
    plan.id
    into target_workspace_id, scorecard_plan_id
  from public.plan_scorecard_items item
  join public.plan_views plan_view on plan_view.id = item.plan_view_id
  join public.workspace_plans plan on plan.id = plan_view.plan_id
  where item.id = target_item_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  if target_title is not null and normalized_title = '' then
    raise exception 'Scorecard item title is required.';
  end if;

  if target_linked_release_id is not null and not exists (
    select 1
    from public.plan_releases release
    join public.plan_views release_view on release_view.id = release.plan_view_id
    where release.id = target_linked_release_id
      and release_view.plan_id = scorecard_plan_id
  ) then
    raise exception 'Linked release must belong to the same plan.';
  end if;

  if target_linked_roadmap_item_id is not null and not exists (
    select 1
    from public.plan_roadmap_items roadmap_item
    join public.plan_roadmap_lanes lane on lane.id = roadmap_item.lane_id
    join public.plan_views roadmap_view on roadmap_view.id = lane.plan_view_id
    where roadmap_item.id = target_linked_roadmap_item_id
      and roadmap_view.plan_id = scorecard_plan_id
  ) then
    raise exception 'Linked roadmap item must belong to the same plan.';
  end if;

  update public.plan_scorecard_items
  set
    title = coalesce(normalized_title, plan_scorecard_items.title),
    description = case
      when target_clear_description then null
      when target_description is not null then nullif(trim(target_description), '')
      else plan_scorecard_items.description
    end,
    scores_json = coalesce(target_scores_json, plan_scorecard_items.scores_json),
    composite_score = coalesce(target_composite_score, plan_scorecard_items.composite_score),
    tracked = coalesce(target_tracked, plan_scorecard_items.tracked),
    linked_release_id = case
      when target_clear_linked_release_id then null
      when target_linked_release_id is not null then target_linked_release_id
      else plan_scorecard_items.linked_release_id
    end,
    linked_roadmap_item_id = case
      when target_clear_linked_roadmap_item_id then null
      when target_linked_roadmap_item_id is not null then target_linked_roadmap_item_id
      else plan_scorecard_items.linked_roadmap_item_id
    end,
    updated_by_user_id = auth.uid()
  where plan_scorecard_items.id = target_item_id;

  return query
    select
      item.id,
      item.plan_view_id,
      item.title,
      item.description,
      item.scores_json as scores,
      item.composite_score,
      item.tracked,
      item.linked_release_id,
      release.name as linked_release_name,
      item.linked_roadmap_item_id,
      roadmap_item.label as linked_roadmap_item_label,
      item.position,
      item.created_at,
      item.updated_at
    from public.plan_scorecard_items item
    left join public.plan_releases release on release.id = item.linked_release_id
    left join public.plan_roadmap_items roadmap_item on roadmap_item.id = item.linked_roadmap_item_id
    where item.id = target_item_id;
end;
$$;

create or replace function public.reorder_scorecard_item(
  target_item_id uuid,
  target_new_position integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_item public.plan_scorecard_items%rowtype;
  target_workspace_id uuid;
  max_position integer;
  resolved_new_position integer;
begin
  select item.*
    into current_item
  from public.plan_scorecard_items item
  where item.id = target_item_id;

  if current_item.id is null then
    raise exception 'Scorecard item not found.';
  end if;

  select plan.workspace_id
    into target_workspace_id
  from public.plan_views plan_view
  join public.workspace_plans plan on plan.id = plan_view.plan_id
  where plan_view.id = current_item.plan_view_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  select coalesce(max(position), 0)
    into max_position
  from public.plan_scorecard_items
  where plan_view_id = current_item.plan_view_id;

  resolved_new_position := greatest(0, least(target_new_position, max_position));

  if resolved_new_position = current_item.position then
    return;
  end if;

  if resolved_new_position > current_item.position then
    update public.plan_scorecard_items
    set
      position = position - 1,
      updated_by_user_id = auth.uid()
    where plan_view_id = current_item.plan_view_id
      and position > current_item.position
      and position <= resolved_new_position;
  else
    update public.plan_scorecard_items
    set
      position = position + 1,
      updated_by_user_id = auth.uid()
    where plan_view_id = current_item.plan_view_id
      and position >= resolved_new_position
      and position < current_item.position;
  end if;

  update public.plan_scorecard_items
  set
    position = resolved_new_position,
    updated_by_user_id = auth.uid()
  where id = target_item_id;
end;
$$;

create or replace function public.delete_scorecard_item(
  target_item_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_item public.plan_scorecard_items%rowtype;
  target_workspace_id uuid;
begin
  select item.*
    into current_item
  from public.plan_scorecard_items item
  where item.id = target_item_id;

  if current_item.id is null then
    raise exception 'Scorecard item not found.';
  end if;

  select plan.workspace_id
    into target_workspace_id
  from public.plan_views plan_view
  join public.workspace_plans plan on plan.id = plan_view.plan_id
  where plan_view.id = current_item.plan_view_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  delete from public.plan_scorecard_items
  where id = target_item_id;

  update public.plan_scorecard_items
  set
    position = position - 1,
    updated_by_user_id = auth.uid()
  where plan_view_id = current_item.plan_view_id
    and position > current_item.position;
end;
$$;

revoke all on function public.update_release_notes(uuid, jsonb) from public;

grant execute on function public.update_release_notes(uuid, jsonb) to authenticated;

revoke all on function public.update_release_checklist(uuid, jsonb) from public;

grant execute on function public.update_release_checklist(uuid, jsonb) to authenticated;

revoke all on function public.get_release_linked_cards(uuid) from public;

grant execute on function public.get_release_linked_cards(uuid) to authenticated;

revoke all on function public.get_workspace_release_picker_cards(uuid, uuid) from public;

grant execute on function public.get_workspace_release_picker_cards(uuid, uuid) to authenticated;

revoke all on function public.link_cards_to_release(uuid, uuid[]) from public;

grant execute on function public.link_cards_to_release(uuid, uuid[]) to authenticated;

revoke all on function public.unlink_card_from_release(uuid, uuid) from public;

grant execute on function public.unlink_card_from_release(uuid, uuid) to authenticated;

revoke all on function public.get_release_linked_sprints(uuid) from public;

grant execute on function public.get_release_linked_sprints(uuid) to authenticated;

revoke all on function public.get_workspace_release_picker_sprints(uuid, uuid) from public;

grant execute on function public.get_workspace_release_picker_sprints(uuid, uuid) to authenticated;

revoke all on function public.link_sprints_to_release(uuid, uuid[]) from public;

grant execute on function public.link_sprints_to_release(uuid, uuid[]) to authenticated;

revoke all on function public.unlink_sprint_from_release(uuid, uuid) from public;

grant execute on function public.unlink_sprint_from_release(uuid, uuid) to authenticated;

revoke all on function public.get_release_share_snapshot(uuid) from public;

grant execute on function public.get_release_share_snapshot(uuid) to authenticated;

revoke all on function public.create_release_share_link(uuid) from public;

grant execute on function public.create_release_share_link(uuid) to authenticated;

revoke all on function public.revoke_release_share_link(uuid) from public;

grant execute on function public.revoke_release_share_link(uuid) to authenticated;

revoke all on function public.get_public_release_share(text) from public;

grant execute on function public.get_public_release_share(text) to anon, authenticated;

revoke all on function public.get_scorecard_data(uuid) from public;

grant execute on function public.get_scorecard_data(uuid) to authenticated;

revoke all on function public.create_scorecard_item(uuid, text) from public;

grant execute on function public.create_scorecard_item(uuid, text) to authenticated;

revoke all on function public.update_scorecard_item(uuid, text, text, jsonb, numeric, boolean, uuid, uuid, boolean, boolean, boolean) from public;

grant execute on function public.update_scorecard_item(uuid, text, text, jsonb, numeric, boolean, uuid, uuid, boolean, boolean, boolean) to authenticated;

revoke all on function public.reorder_scorecard_item(uuid, integer) from public;

grant execute on function public.reorder_scorecard_item(uuid, integer) to authenticated;

revoke all on function public.delete_scorecard_item(uuid) from public;

grant execute on function public.delete_scorecard_item(uuid) to authenticated;

create or replace function public.create_workspace_plan(
  target_workspace_id uuid,
  target_name text,
  target_description text default null,
  target_view_types public.plan_view_type[] default array['roadmap'::public.plan_view_type]
)
returns table(id uuid, name text, description text, "position" integer, workspace_id uuid, created_at timestamptz, views jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_plan_id uuid;
  next_position integer;
  view_type_entry public.plan_view_type;
  view_position integer := 0;
begin
  if not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  select coalesce(max(wp.position), -1) + 1 into next_position
  from public.workspace_plans wp
  where wp.workspace_id = target_workspace_id
  and wp.deleted_at is null;

  insert into public.workspace_plans (workspace_id, name, description, position, created_by_user_id)
  values (target_workspace_id, trim(target_name), target_description, next_position, auth.uid())
  returning public.workspace_plans.id into new_plan_id;

  foreach view_type_entry in array target_view_types loop
    insert into public.plan_views (plan_id, workspace_id, view_type, name, position)
    values (
      new_plan_id,
      target_workspace_id,
      view_type_entry,
      case view_type_entry
        when 'roadmap' then 'Roadmap'
        when 'releases' then 'Releases'
        when 'scorecard' then 'Scorecard'
      end,
      view_position
    );
    view_position := view_position + 1;
  end loop;

  return query
    select
      p.id,
      p.name,
      p.description,
      p.position,
      p.workspace_id,
      p.created_at,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', v.id,
          'view_type', v.view_type,
          'name', v.name,
          'position', v.position
        ) order by v.position)
        from public.plan_views v
        where v.plan_id = p.id
      ), '[]'::jsonb) as views
    from public.workspace_plans p
    where p.id = new_plan_id;
end;
$$;

create or replace function public.delete_workspace_plan(
  target_plan_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace_id uuid;
begin
  select workspace_id into target_workspace_id
  from public.workspace_plans
  where id = target_plan_id;

  if target_workspace_id is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Permission denied';
  end if;

  update public.workspace_plans
  set deleted_at = timezone('utc', now())
  where id = target_plan_id;
end;
$$;

create or replace function public.rename_plan(
  target_plan_id uuid,
  target_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_workspace_id uuid;
begin
  select workspace_id into plan_workspace_id
  from public.workspace_plans
  where id = target_plan_id;

  if plan_workspace_id is null then
    raise exception 'Plan not found';
  end if;

  if not public.can_access_workspace(plan_workspace_id) then
    raise exception 'Cannot access workspace';
  end if;

  update public.workspace_plans
  set name = target_name
  where id = target_plan_id;
end;
$$;

create or replace function public.delete_plan(
  target_plan_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_workspace_id uuid;
begin
  select workspace_id into plan_workspace_id
  from public.workspace_plans
  where id = target_plan_id;

  if plan_workspace_id is null then
    raise exception 'Plan not found';
  end if;

  if not public.can_access_workspace(plan_workspace_id) then
    raise exception 'Cannot access workspace';
  end if;

  delete from public.workspace_plans
  where id = target_plan_id;
end;
$$;

grant execute on function public.rename_plan(uuid, text) to authenticated;
grant execute on function public.delete_plan(uuid) to authenticated;
