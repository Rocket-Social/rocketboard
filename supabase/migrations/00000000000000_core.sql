-- Core schema: profiles, organizations, workspaces, projects, members, access helpers, invites, settings.
-- Canonical greenfield owner file. Modify in place.

create extension if not exists pgcrypto with schema extensions;

create type public.organization_role as enum ('admin', 'member', 'guest');

create type public.scope_access_role as enum ('admin', 'member', 'guest');

create type public.resource_access as enum ('open', 'private');

create type public.project_view_type as enum ('overview', 'table', 'kanban', 'gantt', 'document', 'github', 'canvas');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  github_login text,
  week_starts_on text,
  is_internal_admin boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_week_starts_on_check
    check (week_starts_on is null or week_starts_on in ('sunday', 'monday'))
);

create unique index idx_profiles_github_login_unique
  on public.profiles (lower(github_login))
  where github_login is not null;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint organizations_slug_key unique (slug)
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  slug text not null,
  access public.resource_access not null default 'open',
  color_token text,
  timezone text,
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workspaces_slug_key unique (slug),
  constraint workspaces_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.scope_access_role not null default 'member',
  created_at timestamptz not null default timezone('utc', now()),
  primary key (workspace_id, user_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  slug text not null,
  project_key text not null,
  description text,
  access public.resource_access not null default 'open',
  icon text,
  next_card_number integer not null default 1,
  position integer not null default 0,
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  updated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz,
  archived_by_user_id uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by_user_id uuid references auth.users (id) on delete set null,
  constraint projects_project_key_key unique (project_key),
  constraint projects_project_key_format check (project_key ~ '^[A-Z][A-Z0-9]{1,7}$'),
  constraint projects_next_card_number_positive check (next_card_number >= 1),
  constraint projects_workspace_slug_key unique (workspace_id, slug),
  constraint projects_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint projects_lifecycle_mutex check (not (archived_at is not null and deleted_at is not null))
);

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.scope_access_role not null default 'member',
  created_at timestamptz not null default timezone('utc', now()),
  primary key (project_id, user_id)
);

create table public.project_views (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  view_type public.project_view_type not null,
  position integer not null default 0,
  is_default boolean not null default false,
  shared_config jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  updated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint project_views_shared_config_object check (jsonb_typeof(shared_config) = 'object'),
  constraint project_views_version_positive check (version >= 1)
);

create unique index project_views_one_default_per_project
  on public.project_views (project_id)
  where is_default;

create unique index project_views_singleton_view_types_per_project
  on public.project_views (project_id, view_type)
  where view_type <> 'document' and view_type <> 'github' and view_type <> 'canvas';

create table public.project_view_user_configs (
  id uuid primary key default gen_random_uuid(),
  project_view_id uuid not null references public.project_views (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  base_shared_version integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint project_view_user_configs_view_user_key unique (project_view_id, user_id),
  constraint project_view_user_configs_config_object check (jsonb_typeof(config) = 'object'),
  constraint project_view_user_configs_base_version_positive check (base_shared_version >= 1)
);

create unique index projects_workspace_id_id_key
  on public.projects (workspace_id, id);

create table public.workspace_project_user_orders (
  workspace_id uuid not null,
  project_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  position integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, workspace_id, project_id),
  constraint workspace_project_user_orders_position_nonnegative check (position >= 0),
  constraint workspace_project_user_orders_workspace_project_fkey
    foreign key (workspace_id, project_id)
    references public.projects (workspace_id, id)
    on delete cascade
);

create index workspace_members_user_id_idx on public.workspace_members (user_id);

create index projects_workspace_id_idx on public.projects (workspace_id, position);

create index project_members_user_id_idx on public.project_members (user_id);

create index project_views_project_id_idx on public.project_views (project_id, position);

create index project_view_user_configs_user_id_idx on public.project_view_user_configs (user_id);

create index workspace_project_user_orders_user_workspace_position_idx
  on public.workspace_project_user_orders (user_id, workspace_id, position, project_id);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create trigger project_views_set_updated_at
before update on public.project_views
for each row execute function public.set_updated_at();

create trigger project_view_user_configs_set_updated_at
before update on public.project_view_user_configs
for each row execute function public.set_updated_at();

create trigger workspace_project_user_orders_set_updated_at
before update on public.workspace_project_user_orders
for each row execute function public.set_updated_at();

create table public.workspace_sidebar_item_orders (
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  item_type text not null check (item_type in ('project', 'plan', 'initiative')),
  item_id uuid not null,
  position integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, workspace_id, item_type, item_id),
  constraint workspace_sidebar_item_orders_position_nonnegative check (position >= 0)
);

create index workspace_sidebar_item_orders_user_workspace_position_idx
  on public.workspace_sidebar_item_orders (user_id, workspace_id, position, item_type, item_id);

create trigger workspace_sidebar_item_orders_set_updated_at
before update on public.workspace_sidebar_item_orders
for each row execute function public.set_updated_at();

create or replace function public.can_access_workspace(target_workspace_id uuid, target_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.workspaces workspace
    join public.organization_members org_member
      on org_member.organization_id = workspace.organization_id
     and org_member.user_id = target_user_id
    left join public.workspace_members workspace_member
      on workspace_member.workspace_id = workspace.id
     and workspace_member.user_id = target_user_id
    where workspace.id = target_workspace_id
      and (
        org_member.role = 'admin'
        or workspace.access = 'open'
        or workspace_member.user_id is not null
      )
  );
end;
$$;

create or replace function public.can_edit_workspace(target_workspace_id uuid, target_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.workspaces workspace
    join public.organization_members org_member
      on org_member.organization_id = workspace.organization_id
     and org_member.user_id = target_user_id
    left join public.workspace_members workspace_member
      on workspace_member.workspace_id = workspace.id
     and workspace_member.user_id = target_user_id
    where workspace.id = target_workspace_id
      and (
        org_member.role = 'admin'
        or (
          org_member.role = 'member'
          and (
            workspace.access = 'open'
            or workspace_member.user_id is not null
          )
        )
      )
  );
end;
$$;

create or replace function public.can_manage_workspace(target_workspace_id uuid, target_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.workspaces workspace
    join public.organization_members org_member
      on org_member.organization_id = workspace.organization_id
     and org_member.user_id = target_user_id
    left join public.workspace_members workspace_member
      on workspace_member.workspace_id = workspace.id
     and workspace_member.user_id = target_user_id
    where workspace.id = target_workspace_id
      and (
        org_member.role = 'admin'
        or (
          org_member.role = 'member'
          and workspace_member.role = 'admin'
        )
      )
  );
end;
$$;

create or replace function public.can_access_project(target_project_id uuid, target_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.projects project
    join public.workspaces workspace
      on workspace.id = project.workspace_id
    join public.organization_members org_member
      on org_member.organization_id = workspace.organization_id
     and org_member.user_id = target_user_id
    left join public.project_members project_member
      on project_member.project_id = project.id
     and project_member.user_id = target_user_id
    where project.id = target_project_id
      and public.can_access_workspace(project.workspace_id, target_user_id)
      and (
        org_member.role = 'admin'
        or
        project.access = 'open'
        or project_member.user_id is not null
        or public.can_manage_workspace(project.workspace_id, target_user_id)
      )
  );
end;
$$;

create or replace function public.can_edit_project(target_project_id uuid, target_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.projects project
    join public.workspaces workspace
      on workspace.id = project.workspace_id
    join public.organization_members org_member
      on org_member.organization_id = workspace.organization_id
     and org_member.user_id = target_user_id
    left join public.project_members project_member
      on project_member.project_id = project.id
     and project_member.user_id = target_user_id
    where project.id = target_project_id
      and public.can_access_project(project.id, target_user_id)
      and (
        org_member.role = 'admin'
        or org_member.role = 'member'
      )
  );
end;
$$;

create or replace function public.project_is_active(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.projects
    where id = target_project_id
      and archived_at is null
      and deleted_at is null
  );
$$;

alter table public.profiles enable row level security;

alter table public.workspaces enable row level security;

alter table public.workspace_members enable row level security;

alter table public.projects enable row level security;

alter table public.project_members enable row level security;

alter table public.project_views enable row level security;

alter table public.project_view_user_configs enable row level security;

alter table public.workspace_project_user_orders enable row level security;

alter table public.workspaces
  add column icon text not null default 'W';

create policy workspaces_select_for_members
on public.workspaces
for select
to authenticated
using (public.can_access_workspace(id));

create policy workspace_members_select_for_members
on public.workspace_members
for select
to authenticated
using (public.can_access_workspace(workspace_id));

create policy projects_select_active
on public.projects
for select
to authenticated
using (
  public.can_access_project(id)
  and archived_at is null
  and deleted_at is null
);

create policy project_members_select_for_members
on public.project_members
for select
to authenticated
using (public.can_access_project(project_id));

create policy project_views_select_for_members
on public.project_views
for select
to authenticated
using (public.can_access_project(project_id));

grant select on public.project_views to authenticated;

create or replace function public.can_manage_project(target_project_id uuid, target_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.projects project
    join public.workspaces workspace
      on workspace.id = project.workspace_id
    join public.organization_members org_member
      on org_member.organization_id = workspace.organization_id
     and org_member.user_id = target_user_id
    left join public.project_members project_member
      on project_member.project_id = project.id
     and project_member.user_id = target_user_id
    where project.id = target_project_id
      and public.can_access_workspace(project.workspace_id, target_user_id)
      and (
        org_member.role = 'admin'
        or (
          org_member.role = 'member'
          and (
            project_member.role = 'admin'
            or public.can_manage_workspace(project.workspace_id, target_user_id)
          )
        )
      )
  );
end;
$$;

-- ── Write RLS policies (enable Tier 1 direct PostgREST mutations) ────────

create policy profiles_update_own on public.profiles
  for update to authenticated using (user_id = auth.uid());

create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (user_id = auth.uid());

-- Prevent privilege escalation: block PostgREST from modifying is_internal_admin
create or replace function public.protect_admin_flag()
returns trigger
language plpgsql
as $$
begin
  if NEW.is_internal_admin is distinct from OLD.is_internal_admin then
    raise exception 'Cannot modify is_internal_admin via client';
  end if;
  return NEW;
end;
$$;

create trigger profiles_protect_admin_flag
  before update on public.profiles
  for each row execute function public.protect_admin_flag();

create policy projects_update_for_managers on public.projects
  for update to authenticated using (public.can_edit_project(id));

create policy project_views_insert_for_managers on public.project_views
  for insert to authenticated with check (public.can_edit_project(project_id));

create policy project_views_update_for_managers on public.project_views
  for update to authenticated using (public.can_edit_project(project_id));

create policy project_views_delete_for_managers on public.project_views
  for delete to authenticated using (public.can_edit_project(project_id));

create policy project_view_user_configs_insert_for_members on public.project_view_user_configs
  for insert to authenticated with check (user_id = auth.uid());

create policy project_view_user_configs_update_for_members on public.project_view_user_configs
  for update to authenticated using (user_id = auth.uid());

create policy workspace_project_user_orders_select_for_members on public.workspace_project_user_orders
  for select to authenticated using (
    user_id = auth.uid()
    and public.can_access_project(project_id)
  );

create policy workspace_project_user_orders_insert_for_members on public.workspace_project_user_orders
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.can_access_project(project_id)
  );

create policy workspace_project_user_orders_update_for_members on public.workspace_project_user_orders
  for update to authenticated
  using (
    user_id = auth.uid()
    and public.can_access_project(project_id)
  )
  with check (
    user_id = auth.uid()
    and public.can_access_project(project_id)
  );

create policy workspace_project_user_orders_delete_for_members on public.workspace_project_user_orders
  for delete to authenticated using (
    user_id = auth.uid()
    and public.can_access_project(project_id)
  );

alter table public.workspace_sidebar_item_orders enable row level security;

create policy workspace_sidebar_item_orders_select_for_members
  on public.workspace_sidebar_item_orders
  for select to authenticated
  using (user_id = auth.uid() and public.can_access_workspace(workspace_id));

create policy workspace_sidebar_item_orders_insert_for_members
  on public.workspace_sidebar_item_orders
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_workspace(workspace_id));

create policy workspace_sidebar_item_orders_update_for_members
  on public.workspace_sidebar_item_orders
  for update to authenticated
  using (user_id = auth.uid() and public.can_access_workspace(workspace_id))
  with check (user_id = auth.uid() and public.can_access_workspace(workspace_id));

create policy workspace_sidebar_item_orders_delete_for_members
  on public.workspace_sidebar_item_orders
  for delete to authenticated
  using (user_id = auth.uid() and public.can_access_workspace(workspace_id));

create or replace function public.touch_project(target_project_id uuid, target_user_id uuid default auth.uid())
returns void
language sql
security definer
set search_path = public
as $$
  update public.projects
  set
    updated_at = timezone('utc', now()),
    updated_by_user_id = target_user_id
  where id = target_project_id;
$$;

create or replace function public.reorder_workspace_sidebar_projects(
  target_workspace_id uuid,
  ordered_project_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_access_workspace(target_workspace_id, auth.uid()) then
    raise exception 'You do not have access to update this workspace.';
  end if;

  with visible_projects as (
    select project.id
    from public.projects project
    where project.workspace_id = target_workspace_id
      and project.archived_at is null
      and project.deleted_at is null
      and public.can_access_project(project.id, auth.uid())
  ),
  normalized_target_ids as (
    select
      entry.project_id,
      min(entry.ordinality) as first_ordinality
    from unnest(coalesce(ordered_project_ids, '{}'::uuid[])) with ordinality as entry(project_id, ordinality)
    join visible_projects
      on visible_projects.id = entry.project_id
    group by entry.project_id
  )
  insert into public.workspace_project_user_orders (
    workspace_id,
    project_id,
    user_id,
    position
  )
  select
    target_workspace_id,
    normalized_target_ids.project_id,
    auth.uid(),
    normalized_target_ids.first_ordinality - 1
  from normalized_target_ids
  on conflict (user_id, workspace_id, project_id)
  do update
    set
      position = excluded.position,
      updated_at = timezone('utc', now());

  with visible_projects as (
    select project.id
    from public.projects project
    where project.workspace_id = target_workspace_id
      and project.archived_at is null
      and project.deleted_at is null
      and public.can_access_project(project.id, auth.uid())
  ),
  normalized_target_ids as (
    select
      entry.project_id,
      min(entry.ordinality) as first_ordinality
    from unnest(coalesce(ordered_project_ids, '{}'::uuid[])) with ordinality as entry(project_id, ordinality)
    join visible_projects
      on visible_projects.id = entry.project_id
    group by entry.project_id
  )
  delete from public.workspace_project_user_orders workspace_project_user_order
  using visible_projects
  where workspace_project_user_order.user_id = auth.uid()
    and workspace_project_user_order.workspace_id = target_workspace_id
    and workspace_project_user_order.project_id = visible_projects.id
    and not exists (
      select 1
      from normalized_target_ids
      where normalized_target_ids.project_id = workspace_project_user_order.project_id
    );
end;
$$;

revoke all on function public.can_edit_project(uuid, uuid) from public;

revoke all on function public.touch_project(uuid, uuid) from public;

revoke all on function public.reorder_workspace_sidebar_projects(uuid, uuid[]) from public;

grant execute on function public.reorder_workspace_sidebar_projects(uuid, uuid[]) to authenticated;

create or replace function public.reorder_workspace_sidebar_items(
  target_workspace_id uuid,
  ordered_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if not public.can_access_workspace(target_workspace_id, current_user_id) then
    raise exception 'Cannot access workspace';
  end if;

  delete from public.workspace_sidebar_item_orders
  where user_id = current_user_id
    and workspace_id = target_workspace_id;

  insert into public.workspace_sidebar_item_orders (
    user_id,
    workspace_id,
    item_type,
    item_id,
    position
  )
  select
    current_user_id,
    target_workspace_id,
    (entry.value ->> 'type')::text,
    (entry.value ->> 'id')::uuid,
    entry.ordinality - 1
  from jsonb_array_elements(ordered_items) with ordinality as entry(value, ordinality);
end;
$$;

create or replace function public.get_workspace_sidebar_item_orders(
  target_workspace_id uuid
)
returns table (
  out_item_type text,
  out_item_id uuid,
  out_position integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    sio.item_type,
    sio.item_id,
    sio.position
  from public.workspace_sidebar_item_orders sio
  where sio.user_id = auth.uid()
    and sio.workspace_id = target_workspace_id
  order by sio.position asc;
$$;

grant execute on function public.reorder_workspace_sidebar_items(uuid, jsonb) to authenticated;
grant execute on function public.get_workspace_sidebar_item_orders(uuid) to authenticated;

-- Auto-touch trigger: updates project.updated_at when child rows change.
-- Replaces manual `perform public.touch_project()` calls in RPCs for these tables.
create or replace function public.trigger_touch_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.projects
  set updated_at = timezone('utc', now()),
      updated_by_user_id = auth.uid()
  where id = coalesce(new.project_id, old.project_id);
  return coalesce(new, old);
end;
$$;

create trigger project_views_auto_touch_project
  after insert or update or delete on public.project_views
  for each row execute function public.trigger_touch_project();

create or replace function public.slugify_identifier(input text)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(both '-' from regexp_replace(lower(trim(coalesce(input, ''))), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.project_ref_key_seed(target_name text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  normalized_name text := trim(coalesce(target_name, ''));
  normalized_slug text := public.slugify_identifier(normalized_name);
  slug_parts text[];
  token text;
  initials text := '';
  alphanumeric text := upper(regexp_replace(normalized_name, '[^A-Za-z0-9]+', '', 'g'));
begin
  if normalized_slug <> '' then
    slug_parts := regexp_split_to_array(normalized_slug, '-+');

    foreach token in array slug_parts loop
      if token <> '' then
        initials := initials || upper(left(token, 1));
      end if;
    end loop;
  end if;

  if length(initials) >= 2 then
    return left(initials, 8);
  end if;

  if alphanumeric = '' then
    return 'PRJ';
  end if;

  if length(alphanumeric) >= 3 then
    return left(alphanumeric, 3);
  end if;

  return rpad(alphanumeric, 3, 'X');
end;
$$;

create or replace function public.next_project_key(target_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base_key text := public.project_ref_key_seed(target_name);
  candidate_key text;
  suffix_counter integer := 1;
  suffix_text text;
begin
  if base_key = '' then
    base_key := 'PRJ';
  end if;

  candidate_key := base_key;

  while exists (
    select 1
    from public.projects project_entry
    where project_entry.project_key = candidate_key
  ) loop
    suffix_text := suffix_counter::text;
    candidate_key := left(base_key, greatest(1, 8 - char_length(suffix_text))) || suffix_text;
    suffix_counter := suffix_counter + 1;
  end loop;

  return candidate_key;
end;
$$;

create or replace function public.format_card_ref(target_project_key text, target_project_card_number integer)
returns text
language sql
immutable
set search_path = public
as $$
  select
    case
      when nullif(trim(coalesce(target_project_key, '')), '') is null or target_project_card_number is null then null
      else upper(trim(target_project_key)) || '-' || target_project_card_number::text
    end;
$$;

create or replace function public.set_project_member_role(
  target_project_id uuid,
  target_user_id uuid,
  target_role public.scope_access_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_member_role public.scope_access_role;
  target_org_role public.organization_role;
begin
  if not public.can_manage_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to manage members on this project.';
  end if;

  select project_member.role
    into existing_member_role
  from public.project_members project_member
  where project_member.project_id = target_project_id
    and project_member.user_id = target_user_id;

  if existing_member_role is null then
    raise exception 'PROJECT_MEMBER_NOT_FOUND';
  end if;

  if existing_member_role = target_role then
    return;
  end if;

  if target_role = 'admin' then
    select org_member.role
      into target_org_role
    from public.projects project
    join public.workspaces workspace
      on workspace.id = project.workspace_id
    join public.organization_members org_member
      on org_member.organization_id = workspace.organization_id
     and org_member.user_id = target_user_id
    where project.id = target_project_id;

    if target_org_role <> 'member' and target_org_role <> 'admin' then
      raise exception 'Only organization members can receive project admin access.';
    end if;
  end if;

  update public.project_members
  set role = target_role
  where project_id = target_project_id
    and user_id = target_user_id;

  perform public.touch_project(target_project_id, auth.uid());
end;
$$;

revoke all on function public.set_project_member_role(uuid, uuid, public.scope_access_role) from public;

grant execute on function public.set_project_member_role(uuid, uuid, public.scope_access_role) to authenticated;

create table public.project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  email text not null,
  role public.scope_access_role not null default 'member',
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint project_invites_project_email_key unique (project_id, email),
  constraint project_invites_email_normalized check (email = lower(trim(email)))
);

create index project_invites_project_id_idx on public.project_invites (project_id, created_at desc);

create trigger project_invites_set_updated_at
before update on public.project_invites
for each row execute function public.set_updated_at();

alter table public.project_invites enable row level security;

alter table public.project_invites
  add column accept_token text,
  add column accepted_at timestamptz,
  add column accepted_by_user_id uuid references auth.users (id) on delete set null,
  add column revoked_at timestamptz,
  add column revoked_by_user_id uuid references auth.users (id) on delete set null;

alter table public.project_invites
  alter column accept_token set not null;

create unique index project_invites_accept_token_key on public.project_invites (accept_token);

create index project_invites_pending_project_id_idx
  on public.project_invites (project_id, created_at desc)
  where accepted_at is null and revoked_at is null;

create or replace function public.default_workspace_icon(target_name text)
returns text
language sql
immutable
as $$
  select coalesce(nullif(upper(left(trim(coalesce(target_name, '')), 1)), ''), 'W');
$$;

create or replace function public.default_project_icon()
returns text
language sql
immutable
as $$
  select '📋';
$$;

create or replace function public.normalize_workspace_color_token(target_color_token text)
returns text
language sql
immutable
as $$
  select
    case lower(trim(coalesce(target_color_token, '')))
      when 'amber' then 'amber'
      when 'blue' then 'blue'
      when 'emerald' then 'emerald'
      when 'indigo' then 'indigo'
      when 'rose' then 'rose'
      when 'slate' then 'slate'
      else null
    end;
$$;

create or replace function public.normalize_week_starts_on(target_week_starts_on text)
returns text
language sql
immutable
as $$
  select
    case lower(trim(coalesce(target_week_starts_on, '')))
      when 'sunday' then 'sunday'
      when 'monday' then 'monday'
      else null
    end;
$$;

create or replace function public.normalize_timezone(target_timezone text)
returns text
language sql
stable
set search_path = public, pg_catalog
as $$
  select
    case
      when nullif(trim(coalesce(target_timezone, '')), '') is null then null
      when exists (
        select 1
        from pg_catalog.pg_timezone_names timezone_name
        where timezone_name.name = trim(target_timezone)
      ) then trim(target_timezone)
      else null
    end;
$$;

create or replace function public.next_workspace_slug(target_workspace_scope uuid, target_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base_slug text := public.slugify_identifier(target_name);
  candidate_slug text;
  suffix_counter integer := 1;
begin
  perform target_workspace_scope;

  if base_slug = '' then
    base_slug := 'workspace';
  end if;

  candidate_slug := base_slug;

  while exists (
    select 1
    from public.workspaces workspace_entry
    where workspace_entry.slug = candidate_slug
  ) loop
    candidate_slug := base_slug || '-' || suffix_counter::text;
    suffix_counter := suffix_counter + 1;
  end loop;

  return candidate_slug;
end;
$$;

create or replace function public.next_organization_slug(target_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base_slug text := public.slugify_identifier(target_name);
  candidate_slug text;
  suffix_counter integer := 1;
begin
  if base_slug = '' then
    base_slug := 'organization';
  end if;

  candidate_slug := base_slug;

  while exists (
    select 1
    from public.organizations organization_entry
    where organization_entry.slug = candidate_slug
  ) loop
    candidate_slug := base_slug || '-' || suffix_counter::text;
    suffix_counter := suffix_counter + 1;
  end loop;

  return candidate_slug;
end;
$$;

create or replace function public.next_project_slug(target_workspace_id uuid, target_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base_slug text := public.slugify_identifier(target_name);
  candidate_slug text;
  suffix_counter integer := 1;
begin
  if base_slug = '' then
    base_slug := 'project';
  end if;

  candidate_slug := base_slug;

  while exists (
    select 1
    from public.projects project_entry
    where project_entry.workspace_id = target_workspace_id
      and project_entry.slug = candidate_slug
  ) loop
    candidate_slug := base_slug || '-' || suffix_counter::text;
    suffix_counter := suffix_counter + 1;
  end loop;

  return candidate_slug;
end;
$$;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update
set public = excluded.public;

create policy avatars_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and ((storage.foldername(name))[1]) = auth.uid()::text
);

create policy avatars_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and ((storage.foldername(name))[1]) = auth.uid()::text
);

create or replace function public.upsert_current_profile(
  target_full_name text default null,
  target_github_login text default '__keep__',
  target_avatar_url text default '__keep__'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  auth_user_record auth.users%rowtype;
  normalized_full_name text := nullif(trim(target_full_name), '');
  derived_full_name text;
  normalized_github_login text := case
    when target_github_login = '__keep__' then null
    else nullif(lower(trim(target_github_login)), '')
  end;
  normalized_avatar_url text := case
    when target_avatar_url = '__keep__' then null
    else nullif(trim(target_avatar_url), '')
  end;
begin
  select *
    into auth_user_record
  from auth.users user_entry
  where user_entry.id = auth.uid();

  if auth_user_record.id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  derived_full_name := coalesce(
    normalized_full_name,
    nullif(trim(coalesce(auth_user_record.raw_user_meta_data ->> 'full_name', auth_user_record.raw_user_meta_data ->> 'name')), ''),
    split_part(coalesce(auth_user_record.email, 'rocketboard-user'), '@', 1)
  );

  insert into public.profiles (
    user_id,
    email,
    full_name,
    github_login,
    avatar_url
  )
  values (
    auth_user_record.id,
    nullif(lower(trim(coalesce(auth_user_record.email, ''))), ''),
    derived_full_name,
    normalized_github_login,
    normalized_avatar_url
  )
  on conflict (user_id)
  do update
    set
      email = excluded.email,
      full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
      github_login = case
        when target_github_login = '__keep__' then public.profiles.github_login
        else excluded.github_login
      end,
      avatar_url = case
        when target_avatar_url = '__keep__' then public.profiles.avatar_url
        else excluded.avatar_url
      end,
      updated_at = timezone('utc', now());
end;
$$;

create or replace function public.get_current_profile_summary()
returns table(email text, full_name text, github_login text)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(profile.email, nullif(lower(trim(coalesce(auth_user_record.email, ''))), '')) as email,
    coalesce(profile.full_name, nullif(trim(coalesce(auth_user_record.raw_user_meta_data ->> 'full_name', auth_user_record.raw_user_meta_data ->> 'name')), ''), split_part(coalesce(auth_user_record.email, 'rocketboard-user'), '@', 1)) as full_name,
    profile.github_login as github_login
  from auth.users auth_user_record
  left join public.profiles profile
    on profile.user_id = auth_user_record.id
  where auth_user_record.id = auth.uid();
$$;

revoke all on function public.get_current_profile_summary() from public;

grant execute on function public.get_current_profile_summary() to authenticated;

create or replace function public.get_current_profile_settings()
returns table(email text, full_name text, github_login text, avatar_url text, week_starts_on text)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(profile.email, nullif(lower(trim(coalesce(auth_user_record.email, ''))), '')) as email,
    coalesce(profile.full_name, nullif(trim(coalesce(auth_user_record.raw_user_meta_data ->> 'full_name', auth_user_record.raw_user_meta_data ->> 'name')), ''), split_part(coalesce(auth_user_record.email, 'rocketboard-user'), '@', 1)) as full_name,
    profile.github_login as github_login,
    coalesce(profile.avatar_url, nullif(trim(auth_user_record.raw_user_meta_data ->> 'avatar_url'), '')) as avatar_url,
    profile.week_starts_on as week_starts_on
  from auth.users auth_user_record
  left join public.profiles profile
    on profile.user_id = auth_user_record.id
  where auth_user_record.id = auth.uid();
$$;

revoke all on function public.get_current_profile_settings() from public;

grant execute on function public.get_current_profile_settings() to authenticated;

create or replace function public.set_current_week_start(target_week_starts_on text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_week_start text := public.normalize_week_starts_on(target_week_starts_on);
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if normalized_week_start is null then
    raise exception 'Choose Sunday or Monday for the week start.';
  end if;

  perform public.upsert_current_profile(null);

  update public.profiles
  set
    week_starts_on = normalized_week_start,
    updated_at = timezone('utc', now())
  where user_id = auth.uid();
end;
$$;

revoke all on function public.set_current_week_start(text) from public;

grant execute on function public.set_current_week_start(text) to authenticated;

create or replace function public.get_project_access_snapshot(target_project_id uuid)
returns table(
  current_org_role public.organization_role,
  can_edit_project boolean,
  can_manage_project boolean,
  workspace_access public.resource_access,
  project_access public.resource_access,
  direct_access jsonb,
  collaborators jsonb,
  pending_org_invites jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    null::public.organization_role as current_org_role,
    false as can_edit_project,
    false as can_manage_project,
    'private'::public.resource_access as workspace_access,
    'private'::public.resource_access as project_access,
    '[]'::jsonb as direct_access,
    '[]'::jsonb as collaborators,
    '[]'::jsonb as pending_org_invites
  where false;
$$;

create or replace function public.create_project_invite(
  target_project_id uuid,
  target_email text,
  target_role public.scope_access_role default 'member'
)
returns table(accept_token text, created_at timestamptz, email text, id uuid, role public.scope_access_role)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  created_invite public.project_invites%rowtype;
  generated_accept_token text := replace(gen_random_uuid()::text, '-', '');
  normalized_email text := lower(trim(target_email));
  target_org_role public.organization_role;
begin
  if not public.can_manage_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to invite people to this project.';
  end if;

  if normalized_email is null or normalized_email = '' then
    raise exception 'Invite email is required.';
  end if;

  select org_member.role
    into target_org_role
  from public.projects project
  join public.workspaces workspace
    on workspace.id = project.workspace_id
  join public.organization_members org_member
    on org_member.organization_id = workspace.organization_id
  join public.profiles profile
    on profile.user_id = org_member.user_id
  where project.id = target_project_id
    and lower(coalesce(profile.email, '')) = normalized_email
  limit 1;

  if target_org_role is null then
    raise exception 'ORG_INVITE_REQUIRED';
  end if;

  if target_role = 'admin' and target_org_role <> 'member' and target_org_role <> 'admin' then
    raise exception 'Only organization members can receive project admin access.';
  end if;

  insert into public.project_invites (
    project_id,
    email,
    role,
    accept_token,
    created_by_user_id
  )
  values (
    target_project_id,
    normalized_email,
    target_role,
    generated_accept_token,
    auth.uid()
  )
  on conflict (project_id, email)
  do update
    set
      role = excluded.role,
      accept_token = excluded.accept_token,
      expires_at = timezone('utc', now()) + interval '7 days',
      email_sent_at = null,
      accepted_at = null,
      accepted_by_user_id = null,
      revoked_at = null,
      revoked_by_user_id = null,
      created_by_user_id = excluded.created_by_user_id,
      created_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  returning * into created_invite;

  perform public.touch_project(target_project_id, auth.uid());

  return query select
    created_invite.accept_token,
    created_invite.created_at,
    created_invite.email,
    created_invite.id,
    created_invite.role;
end;
$$;

create or replace function public.mark_project_invite_email_sent(
  target_accept_token text,
  target_sent_at timestamptz default timezone('utc', now())
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_token text := trim(coalesce(target_accept_token, ''));
  effective_sent_at timestamptz := coalesce(target_sent_at, timezone('utc', now()));
  updated_invite_id uuid;
begin
  if clean_token = '' then
    raise exception 'Accept token is required.';
  end if;

  update public.project_invites
  set
    email_sent_at = effective_sent_at,
    updated_at = effective_sent_at
  where accept_token = clean_token
    and accepted_at is null
    and revoked_at is null
  returning id into updated_invite_id;

  return updated_invite_id;
end;
$$;

create or replace function public.get_project_invite_snapshot(target_accept_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return (
    select jsonb_build_object(
      'email', invite.email,
      'inviterName', coalesce(inviter.full_name, split_part(inviter.email, '@', 1), 'Rocketboard'),
      'role', invite.role,
      'route', public.project_route_payload(project.id),
      'status', case
        when invite.revoked_at is not null then 'revoked'
        when invite.accepted_at is not null then 'accepted'
        when invite.expires_at is not null and invite.expires_at < timezone('utc', now()) then 'expired'
        else 'pending'
      end,
      'project', jsonb_build_object(
        'icon', coalesce(project.icon, public.default_project_icon()),
        'name', project.name
      ),
      'workspace', jsonb_build_object(
        'icon', workspace.icon,
        'name', workspace.name
      )
    )
    from public.project_invites invite
    join public.projects project
      on project.id = invite.project_id
    join public.workspaces workspace
      on workspace.id = project.workspace_id
    left join public.profiles inviter
      on inviter.user_id = invite.created_by_user_id
    where invite.accept_token = trim(target_accept_token)
    order by invite.created_at desc, invite.id desc
    limit 1
  );
end;
$$;

create or replace function public.accept_project_invite(target_accept_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_email text;
  auth_user_record auth.users%rowtype;
  invite_record public.project_invites%rowtype;
  project_record public.projects%rowtype;
  workspace_record public.workspaces%rowtype;
  current_org_role public.organization_role;
begin
  select *
    into auth_user_record
  from auth.users user_entry
  where user_entry.id = auth.uid();

  if auth_user_record.id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select *
    into invite_record
  from public.project_invites invite
  where invite.accept_token = trim(target_accept_token);

  if invite_record.id is null then
    raise exception 'INVITE_NOT_FOUND';
  end if;

  if invite_record.revoked_at is not null then
    raise exception 'INVITE_REVOKED';
  end if;

  if invite_record.accepted_at is not null then
    if invite_record.accepted_by_user_id = auth_user_record.id then
      return public.project_route_payload(invite_record.project_id);
    end if;

    raise exception 'INVITE_ALREADY_ACCEPTED';
  end if;

  if invite_record.expires_at is not null and invite_record.expires_at < timezone('utc', now()) then
    raise exception 'INVITE_EXPIRED';
  end if;

  current_email := lower(trim(coalesce(auth_user_record.email, '')));

  if current_email = '' or current_email <> invite_record.email then
    raise exception 'INVITE_EMAIL_MISMATCH';
  end if;

  select *
    into project_record
  from public.projects project
  where project.id = invite_record.project_id;

  if project_record.id is null then
    raise exception 'PROJECT_NOT_FOUND';
  end if;

  select *
    into workspace_record
  from public.workspaces workspace
  where workspace.id = project_record.workspace_id;

  if workspace_record.id is null then
    raise exception 'WORKSPACE_NOT_FOUND';
  end if;

  perform public.upsert_current_profile(null);

  select org_member.role
    into current_org_role
  from public.organization_members org_member
  where org_member.organization_id = workspace_record.organization_id
    and org_member.user_id = auth_user_record.id;

  if current_org_role is null then
    raise exception 'ORG_INVITE_REQUIRED';
  end if;

  if invite_record.role = 'admin' and current_org_role <> 'member' and current_org_role <> 'admin' then
    raise exception 'Only organization members can receive project admin access.';
  end if;

  insert into public.workspace_members (
    workspace_id,
    user_id,
    role
  )
  values (
    workspace_record.id,
    auth_user_record.id,
    'access'
  )
  on conflict (workspace_id, user_id)
  do nothing;

  insert into public.project_members (
    project_id,
    user_id,
    role
  )
  values (
    project_record.id,
    auth_user_record.id,
    invite_record.role
  )
  on conflict (project_id, user_id)
  do update
    set role = case
      when public.project_members.role = 'admin' then 'admin'
      else excluded.role
    end;

  update public.project_invites
  set
    accepted_at = timezone('utc', now()),
    accepted_by_user_id = auth_user_record.id,
    updated_at = timezone('utc', now())
  where id = invite_record.id
    and accepted_at is null
    and revoked_at is null;

  if not found then
    raise exception 'INVITE_ALREADY_ACCEPTED';
  end if;

  perform public.touch_project(project_record.id, auth_user_record.id);

  return public.project_route_payload(project_record.id);
end;
$$;

create or replace function public.revoke_project_invite(target_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_record public.project_invites%rowtype;
begin
  select *
    into invite_record
  from public.project_invites invite
  where invite.id = target_invite_id
    and invite.accepted_at is null
    and invite.revoked_at is null;

  if invite_record.id is null then
    raise exception 'INVITE_NOT_FOUND';
  end if;

  if not public.can_manage_project(invite_record.project_id, auth.uid()) then
    raise exception 'You do not have permission to revoke this invite.';
  end if;

  update public.project_invites
  set
    revoked_at = timezone('utc', now()),
    revoked_by_user_id = auth.uid(),
    updated_at = timezone('utc', now())
  where id = invite_record.id
    and accepted_at is null
    and revoked_at is null;

  perform public.touch_project(invite_record.project_id, auth.uid());
end;
$$;

create or replace function public.remove_project_member(
  target_project_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_member_role public.scope_access_role;
begin
  if not public.can_manage_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to remove members from this project.';
  end if;

  select project_member.role
    into existing_member_role
  from public.project_members project_member
  where project_member.project_id = target_project_id
    and project_member.user_id = target_user_id;

  if existing_member_role is null then
    raise exception 'PROJECT_MEMBER_NOT_FOUND';
  end if;

  delete from public.project_members
  where project_id = target_project_id
    and user_id = target_user_id;

  perform public.touch_project(target_project_id, auth.uid());
end;
$$;

revoke all on function public.default_workspace_icon(text) from public;

revoke all on function public.default_project_icon() from public;

revoke all on function public.next_workspace_slug(uuid, text) from public;

revoke all on function public.next_organization_slug(text) from public;

revoke all on function public.next_project_slug(uuid, text) from public;

revoke all on function public.upsert_current_profile(text, text, text) from public;

grant execute on function public.upsert_current_profile(text, text, text) to authenticated;

revoke all on function public.get_project_access_snapshot(uuid) from public;

grant execute on function public.get_project_access_snapshot(uuid) to authenticated;

revoke all on function public.create_project_invite(uuid, text, public.scope_access_role) from public;

grant execute on function public.create_project_invite(uuid, text, public.scope_access_role) to authenticated;

revoke all on function public.mark_project_invite_email_sent(text, timestamptz) from public;

grant execute on function public.mark_project_invite_email_sent(text, timestamptz) to service_role;

revoke all on function public.get_project_invite_snapshot(text) from public;

grant execute on function public.get_project_invite_snapshot(text) to anon, authenticated;

revoke all on function public.accept_project_invite(text) from public;

grant execute on function public.accept_project_invite(text) to authenticated;

revoke all on function public.revoke_project_invite(uuid) from public;

grant execute on function public.revoke_project_invite(uuid) to authenticated;

revoke all on function public.remove_project_member(uuid, uuid) from public;

grant execute on function public.remove_project_member(uuid, uuid) to authenticated;

create function public.create_project_with_defaults(
  target_workspace_id uuid,
  target_name text,
  target_access public.resource_access default 'open',
  target_icon text default null,
  target_user_id uuid default auth.uid(),
  target_starter_view_types public.project_view_type[] default null,
  target_default_starter_view_type public.project_view_type default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_name text := nullif(trim(target_name), '');
  normalized_icon text := nullif(trim(target_icon), '');
  new_project_id uuid;
  next_position integer;
  should_seed_table_starters boolean :=
    (
      target_starter_view_types is null
      or cardinality(target_starter_view_types) = 0
      or 'table'::public.project_view_type = any(target_starter_view_types)
    );
begin
  if normalized_name is null then
    raise exception 'PROJECT_NAME_REQUIRED';
  end if;

  -- Check project limit for the workspace's org
  declare
    ws_org_id uuid;
  begin
    select w.organization_id into ws_org_id
    from public.workspaces w where w.id = target_workspace_id;

    if ws_org_id is not null and not public.check_org_limit(ws_org_id, 'projects') then
      raise exception 'PROJECT_LIMIT_REACHED';
    end if;
  end;

  select coalesce(max(project.position) + 1, 0)
    into next_position
  from public.projects project
  where project.workspace_id = target_workspace_id;

  insert into public.projects (
    workspace_id,
    name,
    slug,
    project_key,
    access,
    icon,
    position,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    target_workspace_id,
    normalized_name,
    public.next_project_slug(target_workspace_id, normalized_name),
    public.next_project_key(normalized_name),
    target_access,
    coalesce(normalized_icon, public.default_project_icon()),
    next_position,
    target_user_id,
    target_user_id
  )
  returning id into new_project_id;

  insert into public.project_members (
    project_id,
    user_id,
    role
  )
  values (
    new_project_id,
    target_user_id,
    'admin'
  )
  on conflict (project_id, user_id)
  do update
    set role = 'admin';

  -- Seed default status options for the new project
  insert into public.project_status_options (project_id, label, key, category, position, is_default) values
    (new_project_id, 'To Do', 'todo', 'not_started', 0, true),
    (new_project_id, 'In Progress', 'in_progress', 'started', 0, false),
    (new_project_id, 'Done', 'done', 'completed', 0, false),
    (new_project_id, 'Blocked', 'blocked', 'not_started', 1, false);

  -- Seed default priority options for the new project
  insert into public.project_priority_options (project_id, label, key, sort_order, color, is_default) values
    (new_project_id, 'Urgent', 'urgent', 0, 'red', false),
    (new_project_id, 'High', 'high', 1, 'amber', false),
    (new_project_id, 'Medium', 'medium', 2, 'blue', true),
    (new_project_id, 'Low', 'low', 3, 'gray', false);

  perform public.create_default_project_views(
    new_project_id,
    target_user_id,
    target_starter_view_types,
    target_default_starter_view_type
  );

  if should_seed_table_starters then
    perform public.create_card(new_project_id, 'Plan sprint tasks'::text);
    perform public.create_card(new_project_id, 'Determine what groups to add to this board'::text);
    perform public.create_card(new_project_id, 'Create a shared and personal view'::text);
  end if;

  return new_project_id;
end;
$$;

revoke all on function public.create_project_with_defaults(uuid, text, public.resource_access, text, uuid, public.project_view_type[], public.project_view_type) from public;

create function public.create_project(
  target_workspace_id uuid,
  target_name text,
  target_access public.resource_access default 'open',
  target_icon text default null,
  target_starter_view_types public.project_view_type[] default null,
  target_default_starter_view_type public.project_view_type default null
)
returns table(route jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  new_project_id uuid;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if not public.can_manage_workspace(target_workspace_id, current_user_id) then
    raise exception 'You do not have permission to create projects in this workspace.';
  end if;

  new_project_id := public.create_project_with_defaults(
    target_workspace_id,
    target_name,
    target_access,
    target_icon,
    current_user_id,
    target_starter_view_types,
    target_default_starter_view_type
  );

  return query select public.project_route_payload(new_project_id);
end;
$$;

create or replace function public.rename_project_view(
  target_project_view_id uuid,
  target_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project_view public.project_views%rowtype;
  normalized_name text := nullif(trim(target_name), '');
begin
  if normalized_name is null then
    raise exception 'VIEW_NAME_REQUIRED';
  end if;

  select *
    into target_project_view
  from public.project_views project_view
  where project_view.id = target_project_view_id;

  if target_project_view.id is null or not public.can_edit_project(target_project_view.project_id, auth.uid()) then
    raise exception 'You do not have permission to update this view.';
  end if;

  update public.project_views
  set
    name = normalized_name,
    updated_by_user_id = auth.uid(),
    updated_at = timezone('utc', now())
  where id = target_project_view_id;

  perform public.touch_project(target_project_view.project_id, auth.uid());
end;
$$;

revoke all on function public.create_project(uuid, text, public.resource_access, text, public.project_view_type[], public.project_view_type) from public;

grant execute on function public.create_project(uuid, text, public.resource_access, text, public.project_view_type[], public.project_view_type) to authenticated;

revoke all on function public.rename_project_view(uuid, text) from public;

grant execute on function public.rename_project_view(uuid, text) to authenticated;

create or replace function public.rename_project(
  target_project_id uuid,
  target_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_name text := trim(target_name);
begin
  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to rename this project.';
  end if;

  if normalized_name = '' then
    raise exception 'Project name cannot be empty.';
  end if;

  update public.projects
  set
    name = normalized_name,
    updated_at = timezone('utc', now()),
    updated_by_user_id = auth.uid()
  where id = target_project_id;
end;
$$;

revoke all on function public.rename_project(uuid, text) from public;

grant execute on function public.rename_project(uuid, text) to authenticated;

create or replace function public.archive_project(target_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to archive this project.';
  end if;

  update public.projects
  set archived_at = timezone('utc', now()),
      archived_by_user_id = auth.uid(),
      updated_at = timezone('utc', now())
  where id = target_project_id
    and archived_at is null
    and deleted_at is null;
end;
$$;

revoke all on function public.archive_project(uuid) from public;

grant execute on function public.archive_project(uuid) to authenticated;

create or replace function public.unarchive_project(target_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to unarchive this project.';
  end if;

  update public.projects
  set archived_at = null,
      archived_by_user_id = null,
      updated_at = timezone('utc', now())
  where id = target_project_id
    and archived_at is not null;
end;
$$;

revoke all on function public.unarchive_project(uuid) from public;

grant execute on function public.unarchive_project(uuid) to authenticated;

create or replace function public.trash_project(target_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to trash this project.';
  end if;

  update public.projects
  set archived_at = null,
      archived_by_user_id = null,
      deleted_at = timezone('utc', now()),
      deleted_by_user_id = auth.uid(),
      updated_at = timezone('utc', now())
  where id = target_project_id
    and deleted_at is null;
end;
$$;

revoke all on function public.trash_project(uuid) from public;

grant execute on function public.trash_project(uuid) to authenticated;

create or replace function public.restore_project(target_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to restore this project.';
  end if;

  update public.projects
  set deleted_at = null,
      deleted_by_user_id = null,
      updated_at = timezone('utc', now())
  where id = target_project_id
    and deleted_at is not null;
end;
$$;

revoke all on function public.restore_project(uuid) from public;

grant execute on function public.restore_project(uuid) to authenticated;

create or replace function public.delete_project(target_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to delete this project.';
  end if;

  delete from public.projects where id = target_project_id;
end;
$$;

revoke all on function public.delete_project(uuid) from public;

grant execute on function public.delete_project(uuid) to authenticated;

create or replace function public.search_workspace_members(
  target_workspace_id uuid,
  target_query text default '',
  target_exclude_project_id uuid default null
)
returns table(user_id uuid, name text, email text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
    select
      org_member.user_id as user_id,
      coalesce(p.full_name, split_part(p.email, '@', 1), 'Unknown') as name,
      p.email as email
    from public.workspaces workspace
    join public.organization_members org_member
      on org_member.organization_id = workspace.organization_id
    join public.profiles p
      on p.user_id = org_member.user_id
    where workspace.id = target_workspace_id
      and public.can_access_workspace(target_workspace_id, auth.uid())
      and (
        target_exclude_project_id is null
        or not exists (
          select 1 from public.project_members pm
          where pm.project_id = target_exclude_project_id
            and pm.user_id = org_member.user_id
        )
      )
      and (
        trim(target_query) = ''
        or coalesce(p.full_name, '') ilike '%' || trim(target_query) || '%'
        or p.email ilike '%' || trim(target_query) || '%'
      )
    order by coalesce(p.full_name, p.email) asc;
end;
$$;

revoke all on function public.search_workspace_members(uuid, text, uuid) from public;

grant execute on function public.search_workspace_members(uuid, text, uuid) to authenticated;

create or replace function public.add_workspace_member(
  target_workspace_id uuid,
  target_user_id uuid,
  target_role public.scope_access_role default 'member'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org_role public.organization_role;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if not public.can_manage_workspace(target_workspace_id, auth.uid()) then
    raise exception 'You do not have permission to manage this workspace.';
  end if;

  select org_member.role
    into target_org_role
  from public.workspaces workspace
  join public.organization_members org_member
    on org_member.organization_id = workspace.organization_id
   and org_member.user_id = target_user_id
  where workspace.id = target_workspace_id;

  if target_org_role is null then
    raise exception 'ORG_INVITE_REQUIRED';
  end if;

  if target_role = 'admin' and target_org_role <> 'member' and target_org_role <> 'admin' then
    raise exception 'Only organization members can receive workspace admin access.';
  end if;

  insert into public.workspace_members (
    workspace_id,
    user_id,
    role
  )
  values (
    target_workspace_id,
    target_user_id,
    target_role
  )
  on conflict (workspace_id, user_id)
  do update
    set role = excluded.role;
end;
$$;

revoke all on function public.add_workspace_member(uuid, uuid, public.scope_access_role) from public;

grant execute on function public.add_workspace_member(uuid, uuid, public.scope_access_role) to authenticated;

create or replace function public.add_project_member(
  target_project_id uuid,
  target_user_id uuid,
  target_role public.scope_access_role default 'member'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  project_workspace_id uuid;
  target_org_role public.organization_role;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select workspace_id into project_workspace_id
  from public.projects
  where id = target_project_id;

  if project_workspace_id is null then
    raise exception 'Project not found';
  end if;

  if not public.can_manage_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to manage this project';
  end if;

  select org_member.role
    into target_org_role
  from public.projects project
  join public.workspaces workspace
    on workspace.id = project.workspace_id
  join public.organization_members org_member
    on org_member.organization_id = workspace.organization_id
   and org_member.user_id = target_user_id
  where project.id = target_project_id;

  if target_org_role is null then
    raise exception 'ORG_INVITE_REQUIRED';
  end if;

  if target_role = 'admin' and target_org_role <> 'member' and target_org_role <> 'admin' then
    raise exception 'Only organization members can receive project admin access.';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (project_workspace_id, target_user_id, 'member')
  on conflict (workspace_id, user_id)
  do nothing;

  insert into public.project_members (project_id, user_id, role)
  values (target_project_id, target_user_id, target_role)
  on conflict (project_id, user_id)
  do update set role = target_role;
end;
$$;

revoke all on function public.add_project_member(uuid, uuid, public.scope_access_role) from public;

grant execute on function public.add_project_member(uuid, uuid, public.scope_access_role) to authenticated;

alter table public.organizations
  add column icon text not null default '',
  add column allowed_domains text[] not null default '{}',
  add column billing_email text,
  add column plan text not null default 'free'
    check (plan in ('free', 'pro', 'enterprise')),
  add column plan_status text not null default 'active'
    check (plan_status in ('active', 'past_due', 'canceled')),
  add column billing_period text not null default 'monthly'
    check (billing_period in ('monthly', 'yearly')),
  add column stripe_customer_id text,
  add column stripe_subscription_id text,
  add column admin_grant_plan text
    check (admin_grant_plan is null or admin_grant_plan in ('pro', 'enterprise')),
  add column admin_grant_ends_at timestamptz,
  add column limits jsonb not null default '{"members":5,"projects":10,"workspaces":1,"storage_mb":1024}',
  add column storage_used_bytes bigint not null default 0,
  add column invite_link_token text not null default replace(gen_random_uuid()::text, '-', ''),
  add column invite_link_enabled boolean not null default false,
  add column timezone text;

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.organization_role not null default 'member',
  seat_status text not null default 'paid'
    check (seat_status in ('paid', 'free')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (organization_id, user_id)
);

create index organization_members_user_id_idx
  on public.organization_members (user_id);

alter table public.organization_members enable row level security;

create policy organization_members_select_for_members
on public.organization_members
for select
to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = organization_members.organization_id
      and om.user_id = auth.uid()
  )
);

create policy organization_members_manage_for_admins
on public.organization_members
for all
to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = organization_members.organization_id
      and om.user_id = auth.uid()
      and om.role = 'admin'
  )
);

-- Organizations RLS (placed after organization_members table exists)
alter table public.organizations enable row level security;

create policy organizations_select_for_members
on public.organizations
for select
to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = id
      and om.user_id = auth.uid()
  )
);

create policy organizations_update_for_admins
on public.organizations
for update
to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = id
      and om.user_id = auth.uid()
      and om.role = 'admin'
  )
);

revoke select (billing_email, stripe_customer_id, stripe_subscription_id)
on public.organizations
from authenticated;

create or replace function public.can_access_organization(
  target_org_id uuid,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members organization_member
    where organization_member.organization_id = target_org_id
      and organization_member.user_id = target_user_id
  );
$$;

create or replace function public.can_manage_organization(
  target_org_id uuid,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members organization_member
    where organization_member.organization_id = target_org_id
      and organization_member.user_id = target_user_id
      and organization_member.role = 'admin'
  );
$$;

grant execute on function public.can_access_organization(uuid, uuid) to authenticated, service_role;

grant execute on function public.can_manage_organization(uuid, uuid) to authenticated, service_role;

create or replace function public.set_profile_github_login(
  target_org_id uuid,
  target_user_id uuid,
  target_github_login text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_github_login text := nullif(lower(trim(target_github_login)), '');
begin
  if not public.can_manage_organization(target_org_id, auth.uid()) then
    raise exception 'You do not have permission to manage GitHub identity mappings for this organization.';
  end if;

  if not exists (
    select 1
    from public.organization_members organization_member
    where organization_member.organization_id = target_org_id
      and organization_member.user_id = target_user_id
  ) then
    raise exception 'The selected user is not a member of this organization.';
  end if;

  update public.profiles
  set
    github_login = normalized_github_login,
    updated_at = timezone('utc', now())
  where user_id = target_user_id;

  if not found then
    raise exception 'Profile not found for the selected user.';
  end if;
end;
$$;

revoke all on function public.set_profile_github_login(uuid, uuid, text) from public;

grant execute on function public.set_profile_github_login(uuid, uuid, text) to authenticated;

alter table public.project_invites
  add column message text,
  add column expires_at timestamptz default timezone('utc', now()) + interval '7 days',
  add column email_sent_at timestamptz;

drop function if exists public.bootstrap_workspace(text, text, text, text, public.resource_access);

create or replace function public.bootstrap_workspace(
  target_workspace_name text,
  target_project_name text default 'Getting Started',
  target_color_token text default 'blue',
  target_icon text default null,
  target_workspace_access public.resource_access default 'open',
  target_timezone text default null
)
returns table(route jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  new_organization_id uuid;
  new_workspace_id uuid;
  new_project_id uuid;
  normalized_timezone text := coalesce(public.normalize_timezone(target_timezone), 'UTC');
  normalized_workspace_name text := nullif(trim(target_workspace_name), '');
  normalized_project_name text;
  workspace_slug text;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if normalized_workspace_name is null then
    raise exception 'WORKSPACE_NAME_REQUIRED';
  end if;

  -- Only block if user has a routable workspace (projects + organization),
  -- matching get_shell_summary_rows join logic.
  if exists (
    select 1
    from public.projects project
    join public.workspaces workspace on workspace.id = project.workspace_id
    join public.organizations org on org.id = workspace.organization_id
    where public.can_access_project(project.id, current_user_id)
  ) then
    raise exception 'ONBOARDING_ALREADY_COMPLETED';
  end if;

  normalized_project_name := coalesce(
    nullif(trim(target_project_name), ''),
    normalized_workspace_name || ' Board'
  );

  perform public.upsert_current_profile(null);

  workspace_slug := public.next_workspace_slug(null, normalized_workspace_name);

  insert into public.organizations (name, slug, created_by_user_id)
  values (normalized_workspace_name, public.next_organization_slug(normalized_workspace_name), current_user_id)
  returning id into new_organization_id;

  -- Create organization membership for the creator
  insert into public.organization_members (organization_id, user_id, role, invited_by)
  values (new_organization_id, current_user_id, 'admin', current_user_id)
  on conflict (organization_id, user_id) do update set role = 'admin';

  insert into public.workspaces (
    name,
    slug,
    color_token,
    icon,
    access,
    timezone,
    created_by_user_id,
    organization_id
  )
  values (
    normalized_workspace_name,
    workspace_slug,
    public.normalize_workspace_color_token(target_color_token),
    coalesce(nullif(trim(target_icon), ''), public.default_workspace_icon(normalized_workspace_name)),
    target_workspace_access,
    normalized_timezone,
    current_user_id,
    new_organization_id
  )
  returning id into new_workspace_id;

  insert into public.workspace_members (
    workspace_id,
    user_id,
    role
  )
  values (
    new_workspace_id,
    current_user_id,
    'admin'
  )
  on conflict (workspace_id, user_id)
  do update
    set role = 'admin';

  new_project_id := public.create_project_with_defaults(
    new_workspace_id,
    normalized_project_name,
    'open',
    null,
    current_user_id,
    null,
    null
  );

  return query select public.project_route_payload(new_project_id);
end;
$$;

revoke all on function public.bootstrap_workspace(text, text, text, text, public.resource_access, text) from public;

grant execute on function public.bootstrap_workspace(text, text, text, text, public.resource_access, text) to authenticated;

drop function if exists public.create_workspace(text, text, text, text, public.resource_access);
drop function if exists public.create_workspace(text, text, text, text, public.resource_access, uuid);

create or replace function public.create_workspace(
  target_workspace_name text,
  target_project_name text default 'Getting Started',
  target_color_token text default null,
  target_icon text default null,
  target_workspace_access public.resource_access default 'open',
  target_org_id uuid default null,
  target_timezone text default null
)
returns table(route jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  resolved_org_id uuid;
  new_workspace_id uuid;
  new_project_id uuid;
  normalized_timezone text := coalesce(public.normalize_timezone(target_timezone), 'UTC');
  normalized_workspace_name text := nullif(trim(target_workspace_name), '');
  normalized_project_name text;
  workspace_slug text;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if normalized_workspace_name is null then
    raise exception 'WORKSPACE_NAME_REQUIRED';
  end if;

  normalized_project_name := coalesce(
    nullif(trim(target_project_name), ''),
    normalized_workspace_name || ' Board'
  );

  perform public.upsert_current_profile(null);

  -- Resolve organization: use provided org_id or create a new one
  if target_org_id is not null then
    -- Adding workspace to existing org — check access and workspace limit
    if not public.can_manage_organization(target_org_id) then
      raise exception 'ORGANIZATION_ADMIN_REQUIRED';
    end if;

    if not public.check_org_limit(target_org_id, 'workspaces') then
      raise exception 'WORKSPACE_LIMIT_REACHED';
    end if;

    resolved_org_id := target_org_id;
  else
    -- Create new org (bootstrap / first workspace)
    insert into public.organizations (name, slug, created_by_user_id)
    values (normalized_workspace_name, public.next_organization_slug(normalized_workspace_name), current_user_id)
    returning id into resolved_org_id;

    insert into public.organization_members (organization_id, user_id, role, invited_by)
    values (resolved_org_id, current_user_id, 'admin', current_user_id)
    on conflict (organization_id, user_id) do update set role = 'admin';
  end if;

  workspace_slug := public.next_workspace_slug(null, normalized_workspace_name);

  insert into public.workspaces (
    name,
    slug,
    color_token,
    icon,
    access,
    timezone,
    created_by_user_id,
    organization_id
  )
  values (
    normalized_workspace_name,
    workspace_slug,
    coalesce(public.normalize_workspace_color_token(target_color_token), 'blue'),
    coalesce(nullif(trim(target_icon), ''), public.default_workspace_icon(normalized_workspace_name)),
    target_workspace_access,
    normalized_timezone,
    current_user_id,
    resolved_org_id
  )
  returning id into new_workspace_id;

  insert into public.workspace_members (
    workspace_id,
    user_id,
    role
  )
  values (
    new_workspace_id,
    current_user_id,
    'admin'
  )
  on conflict (workspace_id, user_id)
  do update
    set role = 'admin';

  new_project_id := public.create_project_with_defaults(
    new_workspace_id,
    normalized_project_name,
    'open',
    null,
    current_user_id,
    null,
    null
  );

  return query select public.project_route_payload(new_project_id);
end;
$$;

revoke all on function public.create_workspace(text, text, text, text, public.resource_access, uuid, text) from public;

grant execute on function public.create_workspace(text, text, text, text, public.resource_access, uuid, text) to authenticated;

create or replace function public.get_workspace_access_snapshot(target_workspace_id uuid)
returns table(
  current_org_role public.organization_role,
  can_edit_workspace boolean,
  can_manage_workspace boolean,
  workspace_access public.resource_access,
  direct_access jsonb,
  collaborators jsonb,
  pending_org_invites jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    null::public.organization_role as current_org_role,
    false as can_edit_workspace,
    false as can_manage_workspace,
    'private'::public.resource_access as workspace_access,
    '[]'::jsonb as direct_access,
    '[]'::jsonb as collaborators,
    '[]'::jsonb as pending_org_invites
  where false;
$$;

revoke all on function public.get_workspace_access_snapshot(uuid) from public;

grant execute on function public.get_workspace_access_snapshot(uuid) to authenticated;

create or replace function public.list_workspace_members(target_workspace_id uuid)
returns table(user_id uuid, name text, email text, role public.scope_access_role)
language sql
stable
security definer
set search_path = public
as $$
  select
    wm.user_id as user_id,
    coalesce(p.full_name, split_part(p.email, '@', 1), 'Unknown') as name,
    p.email as email,
    wm.role as role
  from public.workspace_members wm
  join public.profiles p on p.user_id = wm.user_id
  where wm.workspace_id = target_workspace_id
    and public.can_access_workspace(target_workspace_id, auth.uid())
  order by
    case when wm.role = 'admin' then 0 else 1 end,
    coalesce(p.full_name, p.email) asc;
$$;

revoke all on function public.list_workspace_members(uuid) from public;

grant execute on function public.list_workspace_members(uuid) to authenticated;

create or replace function public.remove_workspace_member(
  target_workspace_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_role public.scope_access_role;
begin
  if not public.can_manage_workspace(target_workspace_id, auth.uid()) then
    raise exception 'You do not have permission to remove members from this workspace.';
  end if;

  select role into existing_role
  from public.workspace_members
  where workspace_id = target_workspace_id
    and user_id = target_user_id;

  if existing_role is null then
    raise exception 'WORKSPACE_MEMBER_NOT_FOUND';
  end if;

  delete from public.workspace_members
  where workspace_id = target_workspace_id
    and user_id = target_user_id;
end;
$$;

revoke all on function public.remove_workspace_member(uuid, uuid) from public;

grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;

create or replace function public.set_workspace_member_role(
  target_workspace_id uuid,
  target_user_id uuid,
  target_role public.scope_access_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_role public.scope_access_role;
  target_org_role public.organization_role;
begin
  if not public.can_manage_workspace(target_workspace_id, auth.uid()) then
    raise exception 'You do not have permission to manage workspace members.';
  end if;

  select role into existing_role
  from public.workspace_members
  where workspace_id = target_workspace_id
    and user_id = target_user_id;

  if existing_role is null then
    raise exception 'WORKSPACE_MEMBER_NOT_FOUND';
  end if;

  if existing_role = target_role then return; end if;

  if target_role = 'admin' then
    select org_member.role
      into target_org_role
    from public.workspaces workspace
    join public.organization_members org_member
      on org_member.organization_id = workspace.organization_id
     and org_member.user_id = target_user_id
    where workspace.id = target_workspace_id;

    if target_org_role <> 'member' and target_org_role <> 'admin' then
      raise exception 'Only organization members can receive workspace admin access.';
    end if;
  end if;

  update public.workspace_members
  set role = target_role
  where workspace_id = target_workspace_id
    and user_id = target_user_id;
end;
$$;

revoke all on function public.set_workspace_member_role(uuid, uuid, public.scope_access_role) from public;

grant execute on function public.set_workspace_member_role(uuid, uuid, public.scope_access_role) to authenticated;

create or replace function public.set_workspace_timezone(
  target_workspace_id uuid,
  target_timezone text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_timezone text := public.normalize_timezone(target_timezone);
begin
  if not public.can_manage_workspace(target_workspace_id, auth.uid()) then
    raise exception 'You do not have permission to manage this workspace timezone.';
  end if;

  if normalized_timezone is null then
    raise exception 'Choose a valid timezone.';
  end if;

  update public.workspaces
  set
    timezone = normalized_timezone,
    updated_at = timezone('utc', now())
  where id = target_workspace_id;
end;
$$;

revoke all on function public.set_workspace_timezone(uuid, text) from public;

grant execute on function public.set_workspace_timezone(uuid, text) to authenticated;

create or replace function public.set_organization_timezone(
  target_org_id uuid,
  target_timezone text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_timezone text := public.normalize_timezone(target_timezone);
begin
  if not exists (
    select 1 from public.organization_members
    where organization_id = target_org_id
      and user_id = auth.uid()
      and role = 'admin'
  ) then
    raise exception 'You do not have permission to manage this organization timezone.';
  end if;

  if normalized_timezone is null then
    raise exception 'Choose a valid timezone.';
  end if;

  update public.organizations
  set
    timezone = normalized_timezone,
    updated_at = timezone('utc', now())
  where id = target_org_id;
end;
$$;

revoke all on function public.set_organization_timezone(uuid, text) from public;

grant execute on function public.set_organization_timezone(uuid, text) to authenticated;

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in ('organization', 'workspace')),
  resource_id uuid not null,
  email text not null,
  role text not null default 'member',
  message text,
  accept_token text not null default replace(gen_random_uuid()::text, '-', ''),
  expires_at timestamptz default timezone('utc', now()) + interval '7 days',
  email_sent_at timestamptz,
  accepted_at timestamptz,
  accepted_by_user_id uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  revoked_by_user_id uuid references auth.users (id) on delete set null,
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint invitations_resource_email_key unique (resource_type, resource_id, email),
  constraint invitations_email_normalized check (email = lower(trim(email)))
);

create unique index invitations_accept_token_key on public.invitations (accept_token);

create index invitations_resource_idx on public.invitations (resource_type, resource_id);

alter table public.invitations enable row level security;

create policy invitations_select_for_authenticated
on public.invitations for select to authenticated
using (true);

create policy invitations_manage_for_authenticated
on public.invitations for all to authenticated
using (true);

create or replace function public.get_invite_snapshot(target_accept_token text)
returns table(
  resource_type text,
  email text,
  inviter_name text,
  role text,
  status text,
  organization jsonb,
  workspace jsonb,
  project jsonb,
  route jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  clean_token text := trim(target_accept_token);
  found_row boolean := false;
begin
  -- Check invitations table (org/workspace invites)
  return query
    select
      inv.resource_type as resource_type,
      inv.email as email,
      coalesce(inviter.full_name, split_part(inviter.email, '@', 1), 'Rocketboard') as inviter_name,
      inv.role as role,
      case
        when inv.revoked_at is not null then 'revoked'
        when inv.accepted_at is not null then 'accepted'
        when inv.expires_at is not null and inv.expires_at < timezone('utc', now()) then 'expired'
        else 'pending'
      end as status,
      case
        when inv.resource_type = 'organization' then
          jsonb_build_object('name', org.name, 'icon', coalesce(nullif(org.icon, ''), 'O'))
        when inv.resource_type = 'workspace' then
          (select jsonb_build_object('name', o.name, 'icon', coalesce(nullif(o.icon, ''), 'O'))
           from public.organizations o
           join public.workspaces w on w.organization_id = o.id
           where w.id = inv.resource_id)
        else null
      end as organization,
      case
        when inv.resource_type = 'workspace' then
          (select jsonb_build_object('name', w.name, 'icon', w.icon)
           from public.workspaces w where w.id = inv.resource_id)
        else null
      end as workspace,
      null::jsonb as project,
      null::jsonb as route
    from public.invitations inv
    left join public.profiles inviter on inviter.user_id = inv.created_by_user_id
    left join public.organizations org on inv.resource_type = 'organization' and org.id = inv.resource_id
    where inv.accept_token = clean_token
    limit 1;

  if found then
    return;
  end if;

  -- Fall back to project_invites
  return query
    select
      'project'::text as resource_type,
      invite.email as email,
      coalesce(inviter.full_name, split_part(inviter.email, '@', 1), 'Rocketboard') as inviter_name,
      invite.role::text as role,
      case
        when invite.revoked_at is not null then 'revoked'
        when invite.accepted_at is not null then 'accepted'
        when invite.expires_at is not null and invite.expires_at < timezone('utc', now()) then 'expired'
        else 'pending'
      end as status,
      null::jsonb as organization,
      jsonb_build_object('icon', ws.icon, 'name', ws.name) as workspace,
      jsonb_build_object(
        'icon', coalesce(proj.icon, public.default_project_icon()),
        'name', proj.name
      ) as project,
      public.project_route_payload(proj.id) as route
    from public.project_invites invite
    join public.projects proj on proj.id = invite.project_id
    join public.workspaces ws on ws.id = proj.workspace_id
    left join public.profiles inviter on inviter.user_id = invite.created_by_user_id
    where invite.accept_token = clean_token
    limit 1;
end;
$$;

revoke all on function public.get_invite_snapshot(text) from public;

grant execute on function public.get_invite_snapshot(text) to authenticated, anon;

create or replace function public.accept_invite(target_accept_token text)
returns table(
  resource_type text,
  route jsonb,
  organization_name text,
  workspace_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  inv_record public.invitations%rowtype;
  proj_invite public.project_invites%rowtype;
  target_org_id uuid;
  target_workspace_id uuid;
  default_route jsonb;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  current_email := lower(trim(coalesce(
    (select u.email from auth.users u where u.id = current_user_id), ''
  )));

  -- Try invitations table first (org/workspace)
  select * into inv_record
  from public.invitations
  where accept_token = trim(target_accept_token);

  if inv_record.id is not null then
    if inv_record.revoked_at is not null then
      raise exception 'INVITE_REVOKED';
    end if;
    if inv_record.accepted_at is not null then
      -- Already accepted by this user — return a route
      if inv_record.resource_type = 'organization' then
        select public.project_route_payload(p.id) into default_route
        from public.workspaces w
        join public.projects p on p.workspace_id = w.id
        where w.organization_id = inv_record.resource_id
        limit 1;
        return query select
          inv_record.resource_type,
          coalesce(default_route, '{}'::jsonb),
          null::text,
          null::bigint;
        return;
      elsif inv_record.resource_type = 'workspace' then
        select public.project_route_payload(p.id) into default_route
        from public.projects p
        where p.workspace_id = inv_record.resource_id
        limit 1;
        return query select
          inv_record.resource_type,
          coalesce(default_route, '{}'::jsonb),
          null::text,
          null::bigint;
        return;
      end if;
    end if;
    if inv_record.expires_at is not null and inv_record.expires_at < timezone('utc', now()) then
      raise exception 'INVITE_EXPIRED';
    end if;
    if current_email = '' or current_email <> inv_record.email then
      raise exception 'INVITE_EMAIL_MISMATCH';
    end if;

    perform public.upsert_current_profile(null);

    if inv_record.resource_type = 'organization' then
      target_org_id := inv_record.resource_id;

      -- Check member limit before accepting
      if not public.check_org_limit(target_org_id, 'members') then
        -- Check if user is already a member (limit check should not block re-joins)
        if not exists (
          select 1 from public.organization_members om
          where om.organization_id = target_org_id and om.user_id = current_user_id
        ) then
          raise exception 'MEMBER_LIMIT_REACHED';
        end if;
      end if;

      -- Add to organization_members only. Open workspaces/projects are
      -- reachable through org membership, private scopes require direct access rows.
      insert into public.organization_members (organization_id, user_id, role, invited_by)
      values (target_org_id, current_user_id, inv_record.role::public.organization_role, inv_record.created_by_user_id)
      on conflict (organization_id, user_id) do nothing;

      -- Mark accepted
      update public.invitations
      set accepted_at = timezone('utc', now()),
          accepted_by_user_id = current_user_id,
          updated_at = timezone('utc', now())
      where id = inv_record.id and accepted_at is null and revoked_at is null;

      -- Return default project route
      select public.project_route_payload(p.id) into default_route
      from public.workspaces w
      join public.projects p on p.workspace_id = w.id
      where w.organization_id = target_org_id
      order by w.created_at asc, p.created_at asc
      limit 1;

      return query select
        'organization'::text,
        default_route,
        (select o.name from public.organizations o where o.id = target_org_id),
        (select count(*) from public.workspaces ws where ws.organization_id = target_org_id and ws.access = 'open');
      return;

    elsif inv_record.resource_type = 'workspace' then
      target_workspace_id := inv_record.resource_id;

      if not exists (
        select 1
        from public.workspaces w
        join public.organization_members om
          on om.organization_id = w.organization_id
         and om.user_id = current_user_id
        where w.id = target_workspace_id
      ) then
        raise exception 'ORG_INVITE_REQUIRED';
      end if;

      -- Add to workspace_members
      insert into public.workspace_members (workspace_id, user_id, role)
      values (target_workspace_id, current_user_id, inv_record.role::public.scope_access_role)
      on conflict (workspace_id, user_id) do nothing;

      -- Mark accepted
      update public.invitations
      set accepted_at = timezone('utc', now()),
          accepted_by_user_id = current_user_id,
          updated_at = timezone('utc', now())
      where id = inv_record.id and accepted_at is null and revoked_at is null;

      -- Return first project route
      select public.project_route_payload(p.id) into default_route
      from public.projects p
      where p.workspace_id = target_workspace_id
      order by p.created_at asc
      limit 1;

      return query select
        'workspace'::text,
        default_route,
        null::text,
        null::bigint;
      return;
    end if;
  end if;

  -- Fall back to project_invites
  select * into proj_invite
  from public.project_invites
  where accept_token = trim(target_accept_token);

  if proj_invite.id is null then
    raise exception 'INVITE_NOT_FOUND';
  end if;

  -- Delegate to existing accept_project_invite
  return query select
    'project'::text,
    public.accept_project_invite(target_accept_token),
    null::text,
    null::bigint;
end;
$$;

revoke all on function public.accept_invite(text) from public;

grant execute on function public.accept_invite(text) to authenticated;

create or replace function public.create_organization_invite(
  target_org_id uuid,
  target_email text,
  target_role public.organization_role default 'member',
  target_message text default null
)
returns table(id uuid, email text, role public.organization_role, accept_token text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  created_invite public.invitations%rowtype;
  normalized_email text := lower(trim(target_email));
  generated_token text := replace(gen_random_uuid()::text, '-', '');
begin
  if not exists (
    select 1 from public.organization_members
    where organization_id = target_org_id
      and user_id = auth.uid()
      and role = 'admin'
  ) then
    raise exception 'Only organization admins can invite members.';
  end if;

  if normalized_email is null or normalized_email = '' then
    raise exception 'Email is required.';
  end if;

  if exists (
    select 1 from public.organization_members om
    join public.profiles p on p.user_id = om.user_id
    where om.organization_id = target_org_id
      and lower(p.email) = normalized_email
  ) then
    raise exception 'This person is already an organization member.';
  end if;

  insert into public.invitations (
    resource_type, resource_id, email, role, message,
    accept_token, created_by_user_id
  )
  values (
    'organization', target_org_id, normalized_email, target_role, target_message,
    generated_token, auth.uid()
  )
  on conflict (resource_type, resource_id, email)
  do update set
    role = excluded.role,
    message = excluded.message,
    accept_token = excluded.accept_token,
    expires_at = timezone('utc', now()) + interval '7 days',
    email_sent_at = null,
    accepted_at = null,
    accepted_by_user_id = null,
    revoked_at = null,
    revoked_by_user_id = null,
    created_by_user_id = excluded.created_by_user_id,
    created_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  returning * into created_invite;

  return query select
    created_invite.id,
    created_invite.email,
    created_invite.role::public.organization_role,
    created_invite.accept_token,
    created_invite.created_at;
end;
$$;

revoke all on function public.create_organization_invite(uuid, text, public.organization_role, text) from public;

grant execute on function public.create_organization_invite(uuid, text, public.organization_role, text) to authenticated;

create or replace function public.mark_invitation_email_sent(
  target_accept_token text,
  target_sent_at timestamptz default timezone('utc', now())
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_token text := trim(coalesce(target_accept_token, ''));
  effective_sent_at timestamptz := coalesce(target_sent_at, timezone('utc', now()));
  updated_invite_id uuid;
begin
  if clean_token = '' then
    raise exception 'Accept token is required.';
  end if;

  update public.invitations
  set
    email_sent_at = effective_sent_at,
    updated_at = effective_sent_at
  where accept_token = clean_token
    and accepted_at is null
    and revoked_at is null
  returning id into updated_invite_id;

  return updated_invite_id;
end;
$$;

revoke all on function public.mark_invitation_email_sent(text, timestamptz) from public;

grant execute on function public.mark_invitation_email_sent(text, timestamptz) to service_role;

create or replace function public.revoke_invitation(target_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv_record public.invitations%rowtype;
begin
  select * into inv_record
  from public.invitations
  where id = target_invite_id
    and accepted_at is null
    and revoked_at is null;

  if inv_record.id is null then
    raise exception 'INVITE_NOT_FOUND';
  end if;

  -- Check permission based on resource type
  if inv_record.resource_type = 'organization' then
    if not exists (
      select 1 from public.organization_members
      where organization_id = inv_record.resource_id
        and user_id = auth.uid()
        and role = 'admin'
    ) then
      raise exception 'Only organization admins can revoke invitations.';
    end if;
  elsif inv_record.resource_type = 'workspace' then
    if not public.can_manage_workspace(inv_record.resource_id, auth.uid()) then
      raise exception 'Only workspace admins can revoke invitations.';
    end if;
  end if;

  update public.invitations
  set revoked_at = timezone('utc', now()),
      revoked_by_user_id = auth.uid(),
      updated_at = timezone('utc', now())
  where id = inv_record.id
    and accepted_at is null
    and revoked_at is null;
end;
$$;

revoke all on function public.revoke_invitation(uuid) from public;

grant execute on function public.revoke_invitation(uuid) to authenticated;

create or replace function public.get_organization_members(target_org_id uuid)
returns table(members jsonb, invitations jsonb, can_manage boolean, organization jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      (select jsonb_agg(
        jsonb_build_object(
          'created_at', om.created_at,
          'email', p.email,
          'github_login', p.github_login,
          'invited_by_name', coalesce(inviter_profile.full_name, inviter_profile.email),
          'last_active_at', auth_user_record.last_sign_in_at,
          'name', coalesce(p.full_name, split_part(p.email, '@', 1), 'Unknown'),
          'role', om.role,
          'seat_status', om.seat_status,
          'user_id', om.user_id
        )
        order by
          case om.role when 'admin' then 0 when 'member' then 1 else 2 end,
          coalesce(p.full_name, p.email) asc
      )
      from public.organization_members om
      join public.profiles p on p.user_id = om.user_id
      left join auth.users auth_user_record on auth_user_record.id = om.user_id
      left join public.profiles inviter_profile on inviter_profile.user_id = om.invited_by
      where om.organization_id = target_org_id),
      '[]'::jsonb
    ) as members,
    coalesce(
      (select jsonb_agg(
        jsonb_build_object(
          'id', inv.id,
          'email', inv.email,
          'role', inv.role,
          'created_at', inv.created_at,
          'email_sent_at', inv.email_sent_at
        )
        order by inv.created_at desc
      )
      from public.invitations inv
      where inv.resource_type = 'organization'
        and inv.resource_id = target_org_id
        and inv.accepted_at is null
        and inv.revoked_at is null),
      '[]'::jsonb
    ) as invitations,
    exists (
      select 1 from public.organization_members
      where organization_id = target_org_id
        and user_id = auth.uid()
        and role = 'admin'
    ) as can_manage,
    (
      select jsonb_build_object(
        'id', o.id,
        'name', o.name,
        'slug', o.slug,
        'icon', o.icon,
        'allowed_domains', o.allowed_domains,
        'invite_link_token', o.invite_link_token,
        'invite_link_enabled', o.invite_link_enabled,
        'plan', o.plan,
        'timezone', o.timezone
      )
      from public.organizations o
      where o.id = target_org_id
    ) as organization
  where exists (
    select 1 from public.organization_members
    where organization_id = target_org_id
      and user_id = auth.uid()
  );
$$;

revoke all on function public.get_organization_members(uuid) from public;

grant execute on function public.get_organization_members(uuid) to authenticated;

create or replace function public.get_project_access_snapshot(target_project_id uuid)
returns table(
  current_org_role public.organization_role,
  can_edit_project boolean,
  can_manage_project boolean,
  workspace_access public.resource_access,
  project_access public.resource_access,
  direct_access jsonb,
  collaborators jsonb,
  pending_org_invites jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with target_project as (
    select
      project.id as project_id,
      project.access as project_access,
      workspace.id as workspace_id,
      workspace.access as workspace_access,
      workspace.organization_id as organization_id
    from public.projects project
    join public.workspaces workspace
      on workspace.id = project.workspace_id
    where project.id = target_project_id
  )
  select
    current_member.role as current_org_role,
    public.can_edit_project(target_project_id, auth.uid()) as can_edit_project,
    public.can_manage_project(target_project_id, auth.uid()) as can_manage_project,
    target_project.workspace_access,
    target_project.project_access,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'email', profile.email,
            'github_login', profile.github_login,
            'id', profile.user_id,
            'name', coalesce(profile.full_name, split_part(profile.email, '@', 1), 'Unknown'),
            'org_role', org_member.role,
            'scope_role', project_member.role,
            'effective_role', case
              when org_member.role = 'admin' then 'admin'
              when org_member.role = 'member'
                and (
                  project_member.role = 'admin'
                  or coalesce(workspace_member.role, 'member'::public.scope_access_role) = 'admin'
                ) then 'admin'
              else org_member.role::text
            end,
            'can_edit', case
              when org_member.role = 'admin' then true
              when org_member.role = 'member' then true
              else false
            end,
            'can_manage', case
              when org_member.role = 'admin' then true
              when org_member.role = 'member'
                and (
                  project_member.role = 'admin'
                  or coalesce(workspace_member.role, 'member'::public.scope_access_role) = 'admin'
                ) then true
              else false
            end
          )
          order by
            case
              when org_member.role = 'admin' then 0
              when org_member.role = 'member'
                and (
                  project_member.role = 'admin'
                  or coalesce(workspace_member.role, 'member'::public.scope_access_role) = 'admin'
                ) then 1
              when org_member.role = 'member' then 2
              else 3
            end,
            coalesce(profile.full_name, profile.email) asc,
            profile.user_id asc
        )
        from public.project_members project_member
        join target_project
          on target_project.project_id = project_member.project_id
        join public.organization_members org_member
          on org_member.organization_id = target_project.organization_id
         and org_member.user_id = project_member.user_id
        left join public.workspace_members workspace_member
          on workspace_member.workspace_id = target_project.workspace_id
         and workspace_member.user_id = project_member.user_id
        join public.profiles profile
          on profile.user_id = project_member.user_id
        where project_member.project_id = target_project.project_id
      ),
      '[]'::jsonb
    ) as direct_access,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'email', profile.email,
            'github_login', profile.github_login,
            'id', org_member.user_id,
            'name', coalesce(profile.full_name, split_part(profile.email, '@', 1), 'Unknown'),
            'org_role', org_member.role,
            'workspace_role', workspace_member.role,
            'project_role', project_member.role,
            'effective_role', case
              when org_member.role = 'admin' then 'admin'
              when org_member.role = 'member'
                and (
                  coalesce(workspace_member.role, 'member'::public.scope_access_role) = 'admin'
                  or coalesce(project_member.role, 'member'::public.scope_access_role) = 'admin'
                ) then 'admin'
              else org_member.role::text
            end,
            'can_edit', case
              when org_member.role = 'admin' then true
              when org_member.role = 'member' then true
              else false
            end,
            'can_manage', case
              when org_member.role = 'admin' then true
              when org_member.role = 'member'
                and (
                  coalesce(workspace_member.role, 'member'::public.scope_access_role) = 'admin'
                  or coalesce(project_member.role, 'member'::public.scope_access_role) = 'admin'
                ) then true
              else false
            end,
            'access_source', case
              when project_member.user_id is not null then 'project'
              when workspace_member.user_id is not null then 'workspace'
              else 'organization'
            end
          )
          order by
            case
              when org_member.role = 'admin' then 0
              when org_member.role = 'member'
                and (
                  coalesce(workspace_member.role, 'member'::public.scope_access_role) = 'admin'
                  or coalesce(project_member.role, 'member'::public.scope_access_role) = 'admin'
                ) then 1
              when org_member.role = 'member' then 2
              else 3
            end,
            coalesce(profile.full_name, profile.email) asc,
            profile.user_id asc
        )
        from target_project
        join public.organization_members org_member
          on org_member.organization_id = target_project.organization_id
        left join public.workspace_members workspace_member
          on workspace_member.workspace_id = target_project.workspace_id
         and workspace_member.user_id = org_member.user_id
        left join public.project_members project_member
          on project_member.project_id = target_project.project_id
         and project_member.user_id = org_member.user_id
        join public.profiles profile
          on profile.user_id = org_member.user_id
        where (
          org_member.role = 'admin'
          or target_project.workspace_access = 'open'
          or workspace_member.user_id is not null
        )
          and (
            org_member.role = 'admin'
            or target_project.project_access = 'open'
            or project_member.user_id is not null
            or (
              org_member.role = 'member'
              and coalesce(workspace_member.role, 'member'::public.scope_access_role) = 'admin'
            )
          )
      ),
      '[]'::jsonb
    ) as collaborators,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', invite.id,
            'email', invite.email,
            'role', invite.role,
            'created_at', invite.created_at,
            'email_sent_at', invite.email_sent_at
          )
          order by invite.created_at desc, invite.id desc
        )
        from target_project
        join public.invitations invite
          on invite.resource_type = 'organization'
         and invite.resource_id = target_project.organization_id
        where invite.accepted_at is null
          and invite.revoked_at is null
      ),
      '[]'::jsonb
    ) as pending_org_invites
  from target_project
  join public.organization_members current_member
    on current_member.organization_id = target_project.organization_id
   and current_member.user_id = auth.uid()
  where public.can_access_project(target_project_id, auth.uid());
$$;

create or replace function public.get_workspace_access_snapshot(target_workspace_id uuid)
returns table(
  current_org_role public.organization_role,
  can_edit_workspace boolean,
  can_manage_workspace boolean,
  workspace_access public.resource_access,
  direct_access jsonb,
  collaborators jsonb,
  pending_org_invites jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with target_workspace as (
    select
      workspace.id as workspace_id,
      workspace.access as workspace_access,
      workspace.organization_id as organization_id
    from public.workspaces workspace
    where workspace.id = target_workspace_id
  )
  select
    current_member.role as current_org_role,
    public.can_edit_workspace(target_workspace_id, auth.uid()) as can_edit_workspace,
    public.can_manage_workspace(target_workspace_id, auth.uid()) as can_manage_workspace,
    target_workspace.workspace_access,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'email', profile.email,
            'github_login', profile.github_login,
            'id', profile.user_id,
            'name', coalesce(profile.full_name, split_part(profile.email, '@', 1), 'Unknown'),
            'org_role', org_member.role,
            'scope_role', workspace_member.role,
            'effective_role', case
              when org_member.role = 'admin' then 'admin'
              when org_member.role = 'member' and workspace_member.role = 'admin' then 'admin'
              else org_member.role::text
            end,
            'can_edit', case
              when org_member.role = 'admin' then true
              when org_member.role = 'member' then true
              else false
            end,
            'can_manage', case
              when org_member.role = 'admin' then true
              when org_member.role = 'member' and workspace_member.role = 'admin' then true
              else false
            end
          )
          order by
            case
              when org_member.role = 'admin' then 0
              when org_member.role = 'member' and workspace_member.role = 'admin' then 1
              when org_member.role = 'member' then 2
              else 3
            end,
            coalesce(profile.full_name, profile.email) asc,
            profile.user_id asc
        )
        from public.workspace_members workspace_member
        join target_workspace
          on target_workspace.workspace_id = workspace_member.workspace_id
        join public.organization_members org_member
          on org_member.organization_id = target_workspace.organization_id
         and org_member.user_id = workspace_member.user_id
        join public.profiles profile
          on profile.user_id = workspace_member.user_id
        where workspace_member.workspace_id = target_workspace.workspace_id
      ),
      '[]'::jsonb
    ) as direct_access,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'email', profile.email,
            'github_login', profile.github_login,
            'id', org_member.user_id,
            'name', coalesce(profile.full_name, split_part(profile.email, '@', 1), 'Unknown'),
            'org_role', org_member.role,
            'workspace_role', workspace_member.role,
            'effective_role', case
              when org_member.role = 'admin' then 'admin'
              when org_member.role = 'member'
                and coalesce(workspace_member.role, 'member'::public.scope_access_role) = 'admin' then 'admin'
              else org_member.role::text
            end,
            'can_edit', case
              when org_member.role = 'admin' then true
              when org_member.role = 'member' then true
              else false
            end,
            'can_manage', case
              when org_member.role = 'admin' then true
              when org_member.role = 'member'
                and coalesce(workspace_member.role, 'member'::public.scope_access_role) = 'admin' then true
              else false
            end,
            'access_source', case
              when workspace_member.user_id is not null then 'workspace'
              else 'organization'
            end
          )
          order by
            case
              when org_member.role = 'admin' then 0
              when org_member.role = 'member'
                and coalesce(workspace_member.role, 'member'::public.scope_access_role) = 'admin' then 1
              when org_member.role = 'member' then 2
              else 3
            end,
            coalesce(profile.full_name, profile.email) asc,
            profile.user_id asc
        )
        from target_workspace
        join public.organization_members org_member
          on org_member.organization_id = target_workspace.organization_id
        left join public.workspace_members workspace_member
          on workspace_member.workspace_id = target_workspace.workspace_id
         and workspace_member.user_id = org_member.user_id
        join public.profiles profile
          on profile.user_id = org_member.user_id
        where org_member.role = 'admin'
          or target_workspace.workspace_access = 'open'
          or workspace_member.user_id is not null
      ),
      '[]'::jsonb
    ) as collaborators,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', invite.id,
            'email', invite.email,
            'role', invite.role,
            'created_at', invite.created_at,
            'email_sent_at', invite.email_sent_at
          )
          order by invite.created_at desc, invite.id desc
        )
        from target_workspace
        join public.invitations invite
          on invite.resource_type = 'organization'
         and invite.resource_id = target_workspace.organization_id
        where invite.accepted_at is null
          and invite.revoked_at is null
      ),
      '[]'::jsonb
    ) as pending_org_invites
  from target_workspace
  join public.organization_members current_member
    on current_member.organization_id = target_workspace.organization_id
   and current_member.user_id = auth.uid()
  where public.can_access_workspace(target_workspace_id, auth.uid());
$$;

create or replace function public.remove_organization_member(
  target_org_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.organization_members
    where organization_id = target_org_id
      and user_id = auth.uid()
      and role = 'admin'
  ) then
    raise exception 'Only organization admins can remove members.';
  end if;

  if not exists (
    select 1 from public.organization_members
    where organization_id = target_org_id
      and user_id = target_user_id
  ) then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  -- Prevent removing the last admin
  if (select role from public.organization_members
      where organization_id = target_org_id and user_id = target_user_id) = 'admin'
     and not exists (
       select 1 from public.organization_members
       where organization_id = target_org_id
         and role = 'admin'
         and user_id <> target_user_id
     ) then
    raise exception 'ORG_ADMIN_REQUIRED';
  end if;

  -- Remove from all workspaces in this org
  delete from public.workspace_members
  where user_id = target_user_id
    and workspace_id in (
      select id from public.workspaces where organization_id = target_org_id
    );

  -- Remove from all projects in this org
  delete from public.project_members
  where user_id = target_user_id
    and project_id in (
      select p.id from public.projects p
      join public.workspaces w on w.id = p.workspace_id
      where w.organization_id = target_org_id
    );

  -- Remove org membership
  delete from public.organization_members
  where organization_id = target_org_id
    and user_id = target_user_id;
end;
$$;

revoke all on function public.remove_organization_member(uuid, uuid) from public;

grant execute on function public.remove_organization_member(uuid, uuid) to authenticated;

create or replace function public.set_organization_member_role(
  target_org_id uuid,
  target_user_id uuid,
  target_role public.organization_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_role public.organization_role;
begin
  if not exists (
    select 1 from public.organization_members
    where organization_id = target_org_id
      and user_id = auth.uid()
      and role = 'admin'
  ) then
    raise exception 'Only organization admins can change roles.';
  end if;

  select role into existing_role
  from public.organization_members
  where organization_id = target_org_id
    and user_id = target_user_id;

  if existing_role is null then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  if existing_role = target_role then return; end if;

  -- Prevent demoting the last admin
  if existing_role = 'admin' and target_role <> 'admin'
     and not exists (
       select 1 from public.organization_members
       where organization_id = target_org_id
         and role = 'admin'
         and user_id <> target_user_id
     ) then
    raise exception 'ORG_ADMIN_REQUIRED';
  end if;

  update public.organization_members
  set role = target_role
  where organization_id = target_org_id
    and user_id = target_user_id;
end;
$$;

revoke all on function public.set_organization_member_role(uuid, uuid, public.organization_role) from public;

grant execute on function public.set_organization_member_role(uuid, uuid, public.organization_role) to authenticated;

create or replace function public.create_workspace_invite(
  target_workspace_id uuid,
  target_email text,
  target_role public.scope_access_role default 'member',
  target_message text default null
)
returns table(id uuid, email text, role text, accept_token text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  created_invite public.invitations%rowtype;
  normalized_email text := lower(trim(target_email));
  generated_token text := replace(gen_random_uuid()::text, '-', '');
  target_org_role public.organization_role;
begin
  if not public.can_manage_workspace(target_workspace_id, auth.uid()) then
    raise exception 'Only workspace admins can invite members.';
  end if;

  if normalized_email is null or normalized_email = '' then
    raise exception 'Email is required.';
  end if;

  select org_member.role
    into target_org_role
  from public.workspaces workspace
  join public.organization_members org_member
    on org_member.organization_id = workspace.organization_id
  join public.profiles profile
    on profile.user_id = org_member.user_id
  where workspace.id = target_workspace_id
    and lower(coalesce(profile.email, '')) = normalized_email
  limit 1;

  if target_org_role is null then
    raise exception 'ORG_INVITE_REQUIRED';
  end if;

  if target_role = 'admin' and target_org_role <> 'member' and target_org_role <> 'admin' then
    raise exception 'Only organization members can receive workspace admin access.';
  end if;

  insert into public.invitations (
    resource_type, resource_id, email, role, message,
    accept_token, created_by_user_id
  )
  values (
    'workspace', target_workspace_id, normalized_email, target_role, target_message,
    generated_token, auth.uid()
  )
  on conflict (resource_type, resource_id, email)
  do update set
    role = excluded.role,
    message = excluded.message,
    accept_token = excluded.accept_token,
    expires_at = timezone('utc', now()) + interval '7 days',
    email_sent_at = null,
    accepted_at = null,
    accepted_by_user_id = null,
    revoked_at = null,
    revoked_by_user_id = null,
    created_by_user_id = excluded.created_by_user_id,
    created_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  returning * into created_invite;

  return query select
    created_invite.id,
    created_invite.email,
    created_invite.role,
    created_invite.accept_token,
    created_invite.created_at;
end;
$$;

revoke all on function public.create_workspace_invite(uuid, text, public.scope_access_role, text) from public;

grant execute on function public.create_workspace_invite(uuid, text, public.scope_access_role, text) to authenticated;

create or replace function public.set_organization_allowed_domains(
  target_org_id uuid,
  target_domains text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.organization_members
    where organization_id = target_org_id
      and user_id = auth.uid()
      and role = 'admin'
  ) then
    raise exception 'Only organization admins can manage allowed domains.';
  end if;

  update public.organizations
  set allowed_domains = target_domains
  where id = target_org_id;
end;
$$;

revoke all on function public.set_organization_allowed_domains(uuid, text[]) from public;

grant execute on function public.set_organization_allowed_domains(uuid, text[]) to authenticated;

create or replace function public.update_organization(
  target_org_id uuid,
  target_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_name text := nullif(trim(target_name), '');
  new_slug text;
begin
  if normalized_name is null then
    raise exception 'ORGANIZATION_NAME_REQUIRED';
  end if;

  if not exists (
    select 1 from public.organization_members
    where organization_id = target_org_id
      and user_id = auth.uid()
      and role = 'admin'
  ) then
    raise exception 'Only organization admins can update organization details.';
  end if;

  new_slug := public.slugify_identifier(normalized_name);
  if exists (select 1 from public.organizations where slug = new_slug and id != target_org_id) then
    new_slug := new_slug || '-' || substr(gen_random_uuid()::text, 1, 8);
  end if;

  update public.organizations
  set name = normalized_name, slug = new_slug
  where id = target_org_id;
end;
$$;

revoke all on function public.update_organization(uuid, text) from public;

grant execute on function public.update_organization(uuid, text) to authenticated;

create or replace function public.delete_organization(target_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_organization(target_org_id, auth.uid()) then
    raise exception 'You do not have permission to delete this organization.';
  end if;

  delete from public.organizations where id = target_org_id;
end;
$$;

revoke all on function public.delete_organization(uuid) from public;

grant execute on function public.delete_organization(uuid) to authenticated;

create or replace function public.get_workspace_organization(target_workspace_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'slug', o.slug
  )
  from public.workspaces w
  join public.organizations o on o.id = w.organization_id
  where w.id = target_workspace_id
    and public.can_access_workspace(target_workspace_id, auth.uid());
$$;

revoke all on function public.get_workspace_organization(uuid) from public;

grant execute on function public.get_workspace_organization(uuid) to authenticated;

create or replace function public.resolve_organization_slug(target_org_slug text)
returns table (
  id uuid,
  name text,
  slug text
)
language sql
stable
security definer
set search_path = public
as $$
  -- Accept either an organization slug or an organization UUID. External
  -- redirects (e.g. Stripe Checkout return URLs) must be keyed by a stable
  -- identifier, so they pass the UUID; the router then redirects to the
  -- canonical slug path. Membership check via auth.uid() still applies.
  select
    org.id,
    org.name,
    org.slug
  from public.organizations org
  join public.organization_members organization_member
    on organization_member.organization_id = org.id
   and organization_member.user_id = auth.uid()
  -- Guard the ::uuid cast inside a CASE expression. Postgres does NOT
  -- guarantee short-circuit evaluation of AND, so splitting the regex
  -- check and the cast across AND operands can let the planner evaluate
  -- the cast against non-UUID slugs and raise "invalid input syntax".
  -- CASE only evaluates the THEN branch when WHEN is true, which is the
  -- documented lazy-evaluation guarantee.
  where (
    org.slug = nullif(trim(target_org_slug), '')
    or org.id = case
      when nullif(trim(target_org_slug), '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then nullif(trim(target_org_slug), '')::uuid
      else null
    end
  )
  limit 1;
$$;

revoke all on function public.resolve_organization_slug(text) from public;

grant execute on function public.resolve_organization_slug(text) to authenticated;


create policy "internal_admins_read_audit" on public.admin_audit_log
  for select to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and is_internal_admin = true));

create table if not exists public.app_feature_flags (
  key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references auth.users(id)
);

alter table public.app_feature_flags enable row level security;

insert into public.app_feature_flags (key, enabled)
values ('anthropic_subscription_auth_enabled', false)
on conflict (key) do nothing;


create or replace function public.rename_workspace(
  target_workspace_id uuid,
  target_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_name text := trim(target_name);
begin
  if not public.can_manage_workspace(target_workspace_id, auth.uid()) then
    raise exception 'You do not have permission to rename this workspace.';
  end if;

  if normalized_name is null or normalized_name = '' then
    raise exception 'Workspace name is required.';
  end if;

  update public.workspaces
  set name = normalized_name, updated_at = timezone('utc', now())
  where id = target_workspace_id;
end;
$$;

revoke all on function public.rename_workspace(uuid, text) from public;

grant execute on function public.rename_workspace(uuid, text) to authenticated;

create or replace function public.delete_workspace(target_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_workspace(target_workspace_id, auth.uid()) then
    raise exception 'You do not have permission to delete this workspace.';
  end if;

  -- Cascade will delete projects, cards, etc.
  delete from public.workspaces where id = target_workspace_id;
end;
$$;

revoke all on function public.delete_workspace(uuid) from public;

grant execute on function public.delete_workspace(uuid) to authenticated;


create type public.initiative_status as enum ('planned', 'active', 'completed', 'paused', 'cancelled');

create type public.initiative_health as enum ('on_track', 'at_risk', 'off_track');


    create type public.custom_field_type as enum ('text', 'number', 'date', 'single_select');

create type public.sprint_status as enum ('planned', 'active', 'completed');

alter table public.projects
  add column if not exists builtin_field_labels jsonb not null default '{}'::jsonb;

alter table public.projects
  drop constraint if exists projects_builtin_field_labels_is_object;

alter table public.projects
  add constraint projects_builtin_field_labels_is_object
  check (jsonb_typeof(builtin_field_labels) = 'object');

create type public.plan_view_type as enum ('roadmap', 'releases', 'scorecard');

create type public.roadmap_item_type as enum ('bar', 'phase');

create type public.roadmap_milestone_type as enum ('diamond', 'circle', 'flag');

create extension if not exists pg_cron with schema extensions;

create type public.release_status as enum ('draft', 'planned', 'in_progress', 'released', 'archived');

create type public.release_health as enum ('on_track', 'at_risk', 'blocked');

-- ============================================================
-- Billing: tables, RPCs, limit enforcement, storage tracking
-- ============================================================

create table public.billing_webhook_events (
  stripe_event_id text primary key,
  organization_id uuid references public.organizations (id) on delete cascade,
  stripe_customer_id text,
  event_type text not null,
  event_created_at timestamptz not null,
  processing_result text not null
    check (processing_result in ('processing', 'applied', 'ignored_stale', 'ignored_unmatched', 'ignored_unhandled')),
  event_payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default timezone('utc', now())
);

create index billing_webhook_events_org_created_idx
  on public.billing_webhook_events (organization_id, event_created_at desc)
  where organization_id is not null;

alter table public.billing_webhook_events enable row level security;


create index award_invites_token_idx on public.award_invites (accept_token);
create index award_invites_email_idx on public.award_invites (recipient_email);


create policy award_invites_admin_read on public.award_invites
  for select to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and is_internal_admin = true));

create policy award_invites_admin_manage on public.award_invites
  for all to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and is_internal_admin = true));

-- ============================================================
-- Effective plan resolution (considers admin grants)
-- ============================================================

create or replace function public.get_effective_plan(target_org_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when o.admin_grant_plan is not null
      and (o.admin_grant_ends_at is null or o.admin_grant_ends_at > timezone('utc', now()))
    then o.admin_grant_plan
    else o.plan
  end
  from public.organizations o
  where o.id = target_org_id;
$$;

-- ============================================================
-- Org usage counts
-- ============================================================

create or replace function public.get_org_usage(p_org_id uuid)
returns table(
  member_count bigint,
  project_count bigint,
  workspace_count bigint,
  storage_used_bytes bigint,
  effective_plan text,
  limits jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_access_organization(p_org_id) then
    raise exception 'Organization access required';
  end if;

  return query
    select
      (select count(*) from public.organization_members om where om.organization_id = p_org_id),
      (select count(*)
       from public.projects p
       join public.workspaces w on w.id = p.workspace_id
       where w.organization_id = p_org_id
         and p.archived_at is null
         and p.deleted_at is null),
      (select count(*) from public.workspaces w where w.organization_id = p_org_id),
      o.storage_used_bytes,
      public.get_effective_plan(p_org_id),
      o.limits
    from public.organizations o
    where o.id = p_org_id;
end;
$$;

revoke all on function public.get_org_usage(uuid) from public;
grant execute on function public.get_org_usage(uuid) to authenticated;

create or replace function public.get_org_billing_summary(p_org_id uuid)
returns table(
  plan text,
  plan_status text,
  billing_period text,
  admin_grant_plan text,
  admin_grant_ends_at timestamptz,
  limits jsonb,
  storage_used_bytes bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_access_organization(p_org_id) then
    raise exception 'Organization access required';
  end if;

  return query
    select
      o.plan,
      o.plan_status,
      o.billing_period,
      o.admin_grant_plan,
      o.admin_grant_ends_at,
      o.limits,
      o.storage_used_bytes
    from public.organizations o
    where o.id = p_org_id;
end;
$$;

revoke all on function public.get_org_billing_summary(uuid) from public;
grant execute on function public.get_org_billing_summary(uuid) to authenticated;

create or replace function public.get_org_billing_admin_snapshot(p_org_id uuid)
returns table(
  has_billing_customer boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_manage_organization(p_org_id) then
    raise exception 'Organization admin access required';
  end if;

  return query
    select (o.stripe_customer_id is not null) as has_billing_customer
    from public.organizations o
    where o.id = p_org_id;
end;
$$;

revoke all on function public.get_org_billing_admin_snapshot(uuid) from public;
grant execute on function public.get_org_billing_admin_snapshot(uuid) to authenticated;

-- ============================================================
-- Limit checking
-- ============================================================

create or replace function public.check_org_limit(
  p_org_id uuid,
  p_limit_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  org_record record;
  effective text;
  max_val int;
  current_val bigint;
begin
  select o.limits, o.plan, o.admin_grant_plan, o.admin_grant_ends_at
  into org_record
  from public.organizations o
  where o.id = p_org_id;

  if org_record is null then
    return false;
  end if;

  -- Pro/enterprise or active grant = unlimited
  effective := public.get_effective_plan(p_org_id);
  if effective in ('pro', 'enterprise') then
    return true;
  end if;

  max_val := (org_record.limits ->> p_limit_key)::int;
  if max_val is null or max_val = -1 then
    return true; -- unlimited
  end if;

  case p_limit_key
    when 'members' then
      select count(*) into current_val from public.organization_members om where om.organization_id = p_org_id;
    when 'projects' then
      select count(*) into current_val
      from public.projects p
      join public.workspaces w on w.id = p.workspace_id
      where w.organization_id = p_org_id and p.archived_at is null and p.deleted_at is null;
    when 'workspaces' then
      select count(*) into current_val from public.workspaces w where w.organization_id = p_org_id;
    when 'storage_mb' then
      select coalesce(o.storage_used_bytes / (1024 * 1024), 0) into current_val
      from public.organizations o where o.id = p_org_id;
    else
      return true; -- unknown key, fail open
  end case;

  return current_val < max_val;
end;
$$;

revoke all on function public.check_org_limit(uuid, text) from public;
grant execute on function public.check_org_limit(uuid, text) to authenticated;

-- ============================================================
-- Storage tracking trigger
-- ============================================================

create or replace function public.update_org_storage_bytes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org_id uuid;
  delta_bytes bigint;
begin
  if TG_OP = 'INSERT' then
    select w.organization_id into target_org_id
    from public.projects p
    join public.workspaces w on w.id = p.workspace_id
    where p.id = NEW.project_id;

    if target_org_id is not null then
      update public.organizations
      set storage_used_bytes = storage_used_bytes + coalesce(NEW.size_bytes, 0)
      where id = target_org_id;
    end if;
    return NEW;

  elsif TG_OP = 'DELETE' then
    select w.organization_id into target_org_id
    from public.projects p
    join public.workspaces w on w.id = p.workspace_id
    where p.id = OLD.project_id;

    if target_org_id is not null then
      update public.organizations
      set storage_used_bytes = greatest(0, storage_used_bytes - coalesce(OLD.size_bytes, 0))
      where id = target_org_id;
    end if;
    return OLD;
  end if;

  return null;
end;
$$;

-- ============================================================
-- Super admin: award grant/revoke
-- ============================================================


-- ============================================================
-- Super admin: award invites CRUD
-- ============================================================


-- Public: lookup award invite by token (for accept page)
create or replace function public.get_award_invite_by_token(p_token text)
returns table(
  id uuid, status text, award_type text, recipient_email text,
  plan text, credit_months int, reason text, custom_message text, expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select ai.id, ai.status, ai.award_type, ai.recipient_email,
         ai.plan, ai.credit_months, ai.reason, ai.custom_message, ai.expires_at
  from public.award_invites ai
  where ai.accept_token = trim(p_token);
$$;

revoke all on function public.get_award_invite_by_token(text) from public;
grant execute on function public.get_award_invite_by_token(text) to authenticated;

-- Accept award invite
create or replace function public.accept_award_invite(
  p_token text,
  p_target_org_id uuid default null
)
returns table(success boolean, error_message text, target_org_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  inv record;
  resolved_org_id uuid;
begin
  if current_user_id is null then
    return query select false, 'Authentication required'::text, null::uuid;
    return;
  end if;

  select * into inv from public.award_invites where accept_token = trim(p_token);

  if inv.id is null then
    return query select false, 'Invitation not found'::text, null::uuid;
    return;
  end if;
  if inv.status != 'pending' then
    return query select false, ('Invitation is ' || inv.status)::text, null::uuid;
    return;
  end if;
  if inv.expires_at < timezone('utc', now()) then
    update public.award_invites set status = 'expired', updated_at = timezone('utc', now()) where id = inv.id;
    return query select false, 'Invitation has expired'::text, null::uuid;
    return;
  end if;

  -- Resolve target org
  if p_target_org_id is not null then
    if not public.can_manage_organization(p_target_org_id) then
      return query select false, 'You must be an admin of the target organization'::text, null::uuid;
      return;
    end if;
    resolved_org_id := p_target_org_id;
  else
    -- Default to user's first org where they are admin
    select om.organization_id into resolved_org_id
    from public.organization_members om
    where om.user_id = current_user_id and om.role = 'admin'
    order by om.created_at asc
    limit 1;

    if resolved_org_id is null then
      return query select false, 'You need an organization to apply this award to'::text, null::uuid;
      return;
    end if;
  end if;

  -- Apply the grant
  if inv.award_type = 'org_vip_grant' then
    update public.organizations
    set admin_grant_plan = 'pro',
        admin_grant_ends_at = null,
        limits = '{"members":-1,"projects":-1,"workspaces":-1,"storage_mb":-1}'::jsonb,
        updated_at = timezone('utc', now())
    where id = resolved_org_id;
  elsif inv.award_type = 'org_plan_credit' then
    update public.organizations
    set admin_grant_plan = 'pro',
        admin_grant_ends_at = timezone('utc', now()) + (coalesce(inv.credit_months, 1) || ' months')::interval,
        limits = '{"members":-1,"projects":-1,"workspaces":-1,"storage_mb":-1}'::jsonb,
        updated_at = timezone('utc', now())
    where id = resolved_org_id;
  end if;

  -- Mark accepted
  update public.award_invites
  set status = 'accepted',
      accepted_by_user_id = current_user_id,
      accepted_at = timezone('utc', now()),
      target_org_id = resolved_org_id,
      updated_at = timezone('utc', now())
  where id = inv.id;

  insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, details)
  values (current_user_id, 'accept_award', 'award_invite', inv.id::text,
          jsonb_build_object('org_id', resolved_org_id, 'award_type', inv.award_type));

  return query select true, null::text, resolved_org_id;
end;
$$;

revoke all on function public.accept_award_invite(text, uuid) from public;
grant execute on function public.accept_award_invite(text, uuid) to authenticated;

-- Decline award invite
create or replace function public.decline_award_invite(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.award_invites
  set status = 'declined', updated_at = timezone('utc', now())
  where accept_token = trim(p_token) and status = 'pending';
  return found;
end;
$$;

revoke all on function public.decline_award_invite(text) from public;
grant execute on function public.decline_award_invite(text) to authenticated;

-- ============================================================
-- ============================================================


-- ============================================================
-- ============================================================


-- ============================================================================
-- Access model (consolidated from former patch migrations, 2026-04).
--
-- Background: between 2026-04-13 and 2026-04-14 we shipped the access model
-- as four patch migrations (phase1, followups, workspace_add_guard,
-- admin_floor_guard). Pre-launch we folded them back into core so the file is
-- canonical: scope_access_role starts at its final form, member defaults are
-- correct from row zero, and every access function below represents the
-- latest shipped semantics. The definitions above are preserved so that RLS
-- policies defined earlier in this file have valid function signatures to
-- reference; this block overrides them with the authoritative bodies.
-- Each function is dropped first (return types may differ from the initial
-- create) and then recreated in its final form.
-- ============================================================================

create or replace function public.accept_invite(target_accept_token text)
returns table(
  resource_type text,
  route jsonb,
  organization_name text,
  workspace_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  accepted_workspace_role public.scope_access_role;
  current_user_id uuid := auth.uid();
  current_email text;
  inv_record public.invitations%rowtype;
  proj_invite public.project_invites%rowtype;
  target_org_id uuid;
  target_workspace_id uuid;
  default_route jsonb;
  current_org_role public.organization_role;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  current_email := lower(trim(coalesce(
    (select u.email from auth.users u where u.id = current_user_id), ''
  )));

  select * into inv_record
  from public.invitations
  where accept_token = trim(target_accept_token);

  if inv_record.id is not null then
    if inv_record.revoked_at is not null then
      raise exception 'INVITE_REVOKED';
    end if;
    if inv_record.accepted_at is not null then
      if inv_record.resource_type = 'organization' then
        select public.project_route_payload(p.id) into default_route
        from public.workspaces w
        join public.projects p on p.workspace_id = w.id
        where w.organization_id = inv_record.resource_id
        limit 1;
        return query select
          inv_record.resource_type,
          coalesce(default_route, '{}'::jsonb),
          null::text,
          null::bigint;
        return;
      elsif inv_record.resource_type = 'workspace' then
        select public.project_route_payload(p.id) into default_route
        from public.projects p
        where p.workspace_id = inv_record.resource_id
        limit 1;
        return query select
          inv_record.resource_type,
          coalesce(default_route, '{}'::jsonb),
          null::text,
          null::bigint;
        return;
      end if;
    end if;
    if inv_record.expires_at is not null and inv_record.expires_at < timezone('utc', now()) then
      raise exception 'INVITE_EXPIRED';
    end if;
    if current_email = '' or current_email <> inv_record.email then
      raise exception 'INVITE_EMAIL_MISMATCH';
    end if;

    perform public.upsert_current_profile(null);

    if inv_record.resource_type = 'organization' then
      target_org_id := inv_record.resource_id;

      if inv_record.role <> 'guest' and not public.check_org_limit(target_org_id, 'members') then
        if not exists (
          select 1 from public.organization_members om
          where om.organization_id = target_org_id and om.user_id = current_user_id
        ) then
          raise exception 'MEMBER_LIMIT_REACHED';
        end if;
      end if;

      insert into public.organization_members (
        organization_id,
        user_id,
        role,
        seat_status,
        invited_by
      )
      values (
        target_org_id,
        current_user_id,
        inv_record.role::public.organization_role,
        case when inv_record.role = 'guest' then 'free' else 'paid' end,
        inv_record.created_by_user_id
      )
      on conflict (organization_id, user_id)
      do update
        set
          role = excluded.role,
          seat_status = excluded.seat_status;

      update public.invitations
      set accepted_at = timezone('utc', now()),
          accepted_by_user_id = current_user_id,
          updated_at = timezone('utc', now())
      where id = inv_record.id and accepted_at is null and revoked_at is null;

      select public.project_route_payload(p.id) into default_route
      from public.workspaces w
      join public.projects p on p.workspace_id = w.id
      where w.organization_id = target_org_id
      order by w.created_at asc, p.created_at asc
      limit 1;

      return query select
        'organization'::text,
        default_route,
        (select o.name from public.organizations o where o.id = target_org_id),
        (select count(*) from public.workspaces ws where ws.organization_id = target_org_id and ws.access = 'open');
      return;

    elsif inv_record.resource_type = 'workspace' then
      target_workspace_id := inv_record.resource_id;
      target_org_id := (
        select workspace.organization_id
        from public.workspaces workspace
        where workspace.id = target_workspace_id
      );

      if target_org_id is null then
        raise exception 'WORKSPACE_NOT_FOUND';
      end if;

      select org_member.role
        into current_org_role
      from public.organization_members org_member
      where org_member.organization_id = target_org_id
        and org_member.user_id = current_user_id;

      if current_org_role is null then
        insert into public.organization_members (
          organization_id,
          user_id,
          role,
          seat_status,
          invited_by
        )
        values (
          target_org_id,
          current_user_id,
          'guest',
          'free',
          inv_record.created_by_user_id
        )
        on conflict (organization_id, user_id)
        do nothing;

        current_org_role := 'guest';
      end if;

      if current_org_role = 'guest' and inv_record.role <> 'guest' then
        raise exception 'Organization guests can only receive guest workspace access.';
      end if;

      accepted_workspace_role := case
        when current_org_role = 'guest' then inv_record.role::public.scope_access_role
        when inv_record.role::public.scope_access_role = 'guest' then 'member'::public.scope_access_role
        else inv_record.role::public.scope_access_role
      end;

      insert into public.workspace_members (workspace_id, user_id, role)
      values (target_workspace_id, current_user_id, accepted_workspace_role)
      on conflict (workspace_id, user_id)
      do update
        set role = case
          when public.workspace_members.role = 'admin' then 'admin'
          when excluded.role = 'admin' then 'admin'
          when public.workspace_members.role = 'member' and excluded.role = 'guest' then 'member'
          when public.workspace_members.role = 'guest' and excluded.role = 'member' then 'member'
          else excluded.role
        end;

      update public.invitations
      set accepted_at = timezone('utc', now()),
          accepted_by_user_id = current_user_id,
          updated_at = timezone('utc', now())
      where id = inv_record.id and accepted_at is null and revoked_at is null;

      select public.project_route_payload(p.id) into default_route
      from public.projects p
      where p.workspace_id = target_workspace_id
      order by p.created_at asc
      limit 1;

      return query select
        'workspace'::text,
        default_route,
        null::text,
        null::bigint;
      return;
    end if;
  end if;

  select * into proj_invite
  from public.project_invites
  where accept_token = trim(target_accept_token);

  if proj_invite.id is null then
    raise exception 'INVITE_NOT_FOUND';
  end if;

  return query select
    'project'::text,
    public.accept_project_invite(target_accept_token),
    null::text,
    null::bigint;
end;
$$;

create or replace function public.accept_project_invite(target_accept_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  accepted_project_role public.scope_access_role;
  current_email text;
  auth_user_record auth.users%rowtype;
  invite_record public.project_invites%rowtype;
  project_record public.projects%rowtype;
  workspace_record public.workspaces%rowtype;
  current_org_role public.organization_role;
  workspace_role public.scope_access_role;
begin
  select *
    into auth_user_record
  from auth.users user_entry
  where user_entry.id = auth.uid();

  if auth_user_record.id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select *
    into invite_record
  from public.project_invites invite
  where invite.accept_token = trim(target_accept_token);

  if invite_record.id is null then
    raise exception 'INVITE_NOT_FOUND';
  end if;

  if invite_record.revoked_at is not null then
    raise exception 'INVITE_REVOKED';
  end if;

  if invite_record.accepted_at is not null then
    if invite_record.accepted_by_user_id = auth_user_record.id then
      return public.project_route_payload(invite_record.project_id);
    end if;

    raise exception 'INVITE_ALREADY_ACCEPTED';
  end if;

  if invite_record.expires_at is not null and invite_record.expires_at < timezone('utc', now()) then
    raise exception 'INVITE_EXPIRED';
  end if;

  current_email := lower(trim(coalesce(auth_user_record.email, '')));

  if current_email = '' or current_email <> invite_record.email then
    raise exception 'INVITE_EMAIL_MISMATCH';
  end if;

  select *
    into project_record
  from public.projects project
  where project.id = invite_record.project_id;

  if project_record.id is null then
    raise exception 'PROJECT_NOT_FOUND';
  end if;

  select *
    into workspace_record
  from public.workspaces workspace
  where workspace.id = project_record.workspace_id;

  if workspace_record.id is null then
    raise exception 'WORKSPACE_NOT_FOUND';
  end if;

  perform public.upsert_current_profile(null);

  select org_member.role
    into current_org_role
  from public.organization_members org_member
  where org_member.organization_id = workspace_record.organization_id
    and org_member.user_id = auth_user_record.id;

  if current_org_role is null then
    insert into public.organization_members (
      organization_id,
      user_id,
      role,
      seat_status,
      invited_by
    )
    values (
      workspace_record.organization_id,
      auth_user_record.id,
      'guest',
      'free',
      invite_record.created_by_user_id
    )
    on conflict (organization_id, user_id)
    do nothing;

    current_org_role := 'guest';
  end if;

  if current_org_role = 'guest' and invite_record.role <> 'guest' then
    raise exception 'Organization guests can only receive guest project access.';
  end if;

  accepted_project_role := case
    when current_org_role = 'guest' then invite_record.role
    when invite_record.role = 'guest' then 'member'::public.scope_access_role
    else invite_record.role
  end;

  workspace_role := public.default_scope_role_for_org_role(current_org_role);

  if workspace_record.access = 'private' then
    insert into public.workspace_members (
      workspace_id,
      user_id,
      role
    )
    values (
      workspace_record.id,
      auth_user_record.id,
      workspace_role
    )
    on conflict (workspace_id, user_id)
    do update
      set role = case
        when public.workspace_members.role = 'admin' then 'admin'
        when excluded.role = 'admin' then 'admin'
        when public.workspace_members.role = 'member' and excluded.role = 'guest' then 'member'
        when public.workspace_members.role = 'guest' and excluded.role = 'member' then 'member'
        else excluded.role
      end;
  end if;

  insert into public.project_members (
    project_id,
    user_id,
    role
  )
  values (
    project_record.id,
    auth_user_record.id,
    accepted_project_role
  )
  on conflict (project_id, user_id)
  do update
    set role = case
      when public.project_members.role = 'admin' then 'admin'
      when excluded.role = 'admin' then 'admin'
      when public.project_members.role = 'member' and excluded.role = 'guest' then 'member'
      when public.project_members.role = 'guest' and excluded.role = 'member' then 'member'
      else excluded.role
    end;

  update public.project_invites
  set
    accepted_at = timezone('utc', now()),
    accepted_by_user_id = auth_user_record.id,
    updated_at = timezone('utc', now())
  where id = invite_record.id
    and accepted_at is null
    and revoked_at is null;

  perform public.touch_project(project_record.id, auth.uid());

  return public.project_route_payload(project_record.id);
end;
$$;

create or replace function public.add_project_member(
  target_project_id uuid,
  target_user_id uuid,
  target_role public.scope_access_role default 'member'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  project_workspace_access public.resource_access;
  project_workspace_id uuid;
  current_org_role public.organization_role;
  existing_member_role public.scope_access_role;
  target_org_role public.organization_role;
  workspace_role public.scope_access_role;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select project.workspace_id, workspace.access, current_org_member.role
    into project_workspace_id, project_workspace_access, current_org_role
  from public.projects project
  join public.workspaces workspace
    on workspace.id = project.workspace_id
  join public.organization_members current_org_member
    on current_org_member.organization_id = workspace.organization_id
   and current_org_member.user_id = auth.uid()
  where project.id = target_project_id;

  if project_workspace_id is null then
    raise exception 'Project not found';
  end if;

  if not (
    public.can_edit_project(target_project_id, auth.uid())
    or public.can_manage_project(target_project_id, auth.uid())
  ) then
    raise exception 'You do not have permission to invite people to this project.';
  end if;

  select org_member.role, project_member.role
    into target_org_role, existing_member_role
  from public.projects project
  join public.workspaces workspace
    on workspace.id = project.workspace_id
  join public.organization_members org_member
    on org_member.organization_id = workspace.organization_id
   and org_member.user_id = target_user_id
  left join public.project_members project_member
    on project_member.project_id = project.id
   and project_member.user_id = target_user_id
  where project.id = target_project_id;

  if target_org_role is null then
    raise exception 'ORG_INVITE_REQUIRED';
  end if;

  if existing_member_role is not null then
    if existing_member_role = target_role then
      return;
    end if;

    if not public.can_manage_project(target_project_id, auth.uid()) then
      raise exception 'You do not have permission to manage this project.';
    end if;
  else
    if current_org_role = 'guest' and target_role <> 'guest' then
      raise exception 'Project guests can only invite guest collaborators.';
    end if;

    if target_role = 'admin' and not public.can_manage_project(target_project_id, auth.uid()) then
      raise exception 'Only project, workspace, and organization admins can grant project admin access.';
    end if;
  end if;

  if target_org_role = 'guest' then
    if target_role <> 'guest' then
      raise exception 'Organization guests can only receive guest project access.';
    end if;
  elsif target_role = 'guest' then
    raise exception 'Organization members and admins can only receive member or admin project access.';
  end if;

  if existing_member_role = 'admin'
     and target_role <> 'admin'
     and not exists (
       select 1
       from public.project_members other_member
       where other_member.project_id = target_project_id
         and other_member.role = 'admin'
         and other_member.user_id <> target_user_id
     ) then
    raise exception 'PROJECT_ADMIN_REQUIRED';
  end if;

  workspace_role := public.default_scope_role_for_org_role(target_org_role);

  if project_workspace_access = 'private' then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (project_workspace_id, target_user_id, workspace_role)
    on conflict (workspace_id, user_id)
    do update
      set role = case
        when public.workspace_members.role = 'admin' then 'admin'
        when excluded.role = 'admin' then 'admin'
        when public.workspace_members.role = 'member' and excluded.role = 'guest' then 'member'
        when public.workspace_members.role = 'guest' and excluded.role = 'member' then 'member'
        else excluded.role
      end;
  end if;

  insert into public.project_members (project_id, user_id, role)
  values (target_project_id, target_user_id, target_role)
  on conflict (project_id, user_id)
  do update
    set role = excluded.role;

  perform public.touch_project(target_project_id, auth.uid());
end;
$$;

create or replace function public.add_workspace_member(
  target_workspace_id uuid,
  target_user_id uuid,
  target_role public.scope_access_role default 'member'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_member_role public.scope_access_role;
  target_org_role public.organization_role;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select org_member.role, workspace_member.role
    into target_org_role, existing_member_role
  from public.workspaces workspace
  join public.organization_members org_member
    on org_member.organization_id = workspace.organization_id
   and org_member.user_id = target_user_id
  left join public.workspace_members workspace_member
    on workspace_member.workspace_id = workspace.id
   and workspace_member.user_id = target_user_id
  where workspace.id = target_workspace_id;

  if target_org_role is null then
    raise exception 'ORG_INVITE_REQUIRED';
  end if;

  if existing_member_role is not null then
    if existing_member_role = target_role then
      return;
    end if;

    if not public.can_manage_workspace(target_workspace_id, auth.uid()) then
      raise exception 'You do not have permission to manage this workspace.';
    end if;
  elsif target_role = 'admin' then
    if not public.can_manage_workspace(target_workspace_id, auth.uid()) then
      raise exception 'You do not have permission to manage this workspace.';
    end if;
  elsif not (
    public.can_manage_workspace(target_workspace_id, auth.uid())
    or public.can_edit_workspace(target_workspace_id, auth.uid())
  ) then
    raise exception 'You do not have permission to invite people to this workspace.';
  end if;

  if target_org_role = 'guest' then
    if target_role <> 'guest' then
      raise exception 'Organization guests can only receive guest workspace access.';
    end if;
  elsif target_role = 'guest' then
    raise exception 'Organization members and admins can only receive member or admin workspace access.';
  end if;

  if existing_member_role = 'admin'
     and target_role <> 'admin'
     and not exists (
       select 1
       from public.workspace_members other_member
       where other_member.workspace_id = target_workspace_id
         and other_member.role = 'admin'
         and other_member.user_id <> target_user_id
     ) then
    raise exception 'WORKSPACE_ADMIN_REQUIRED';
  end if;

  insert into public.workspace_members (
    workspace_id,
    user_id,
    role
  )
  values (
    target_workspace_id,
    target_user_id,
    target_role
  )
  on conflict (workspace_id, user_id)
  do update
    set role = excluded.role;
end;
$$;

create or replace function public.create_project_invite(
  target_project_id uuid,
  target_email text,
  target_role public.scope_access_role default 'member'
)
returns table(accept_token text, created_at timestamptz, email text, id uuid, role public.scope_access_role)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  created_invite public.project_invites%rowtype;
  existing_member_role public.scope_access_role;
  generated_accept_token text := replace(gen_random_uuid()::text, '-', '');
  normalized_email text := lower(trim(target_email));
  current_org_role public.organization_role;
  target_org_role public.organization_role;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if not (
    public.can_edit_project(target_project_id, auth.uid())
    or public.can_manage_project(target_project_id, auth.uid())
  ) then
    raise exception 'You do not have permission to invite people to this project.';
  end if;

  if normalized_email is null or normalized_email = '' then
    raise exception 'Invite email is required.';
  end if;

  if target_role = 'admin' then
    raise exception 'Project admin access is granted after acceptance by a project admin.';
  end if;

  select org_member.role
    into current_org_role
  from public.projects project
  join public.workspaces workspace
    on workspace.id = project.workspace_id
  join public.organization_members org_member
    on org_member.organization_id = workspace.organization_id
   and org_member.user_id = auth.uid()
  where project.id = target_project_id;

  if current_org_role = 'guest' and target_role <> 'guest' then
    raise exception 'Project guests can only invite guest collaborators.';
  end if;

  select org_member.role
    into target_org_role
  from public.projects project
  join public.workspaces workspace
    on workspace.id = project.workspace_id
  join public.organization_members org_member
    on org_member.organization_id = workspace.organization_id
  join public.profiles profile
    on profile.user_id = org_member.user_id
  where project.id = target_project_id
    and lower(coalesce(profile.email, '')) = normalized_email
  limit 1;

  if target_org_role is null and target_role <> 'guest' then
    raise exception 'External project invites can only create guest access.';
  end if;

  if target_org_role = 'guest' and target_role <> 'guest' then
    raise exception 'Organization guests can only receive guest project access.';
  end if;

  if target_org_role in ('admin', 'member') and target_role = 'guest' then
    raise exception 'Organization members and admins can only receive member or admin project access.';
  end if;

  select project_member.role
    into existing_member_role
  from public.projects project
  join public.workspaces workspace
    on workspace.id = project.workspace_id
  join public.organization_members org_member
    on org_member.organization_id = workspace.organization_id
  join public.profiles profile
    on profile.user_id = org_member.user_id
  join public.project_members project_member
    on project_member.project_id = project.id
   and project_member.user_id = org_member.user_id
  where project.id = target_project_id
    and lower(coalesce(profile.email, '')) = normalized_email
  limit 1;

  if existing_member_role is not null then
    raise exception 'PROJECT_MEMBER_ALREADY_EXISTS';
  end if;

  insert into public.project_invites (
    project_id,
    email,
    role,
    accept_token,
    created_by_user_id
  )
  values (
    target_project_id,
    normalized_email,
    target_role,
    generated_accept_token,
    auth.uid()
  )
  on conflict (project_id, email)
  do update
    set
      role = excluded.role,
      accept_token = excluded.accept_token,
      expires_at = timezone('utc', now()) + interval '7 days',
      email_sent_at = null,
      accepted_at = null,
      accepted_by_user_id = null,
      revoked_at = null,
      revoked_by_user_id = null,
      created_by_user_id = excluded.created_by_user_id,
      created_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  returning * into created_invite;

  perform public.touch_project(target_project_id, auth.uid());

  return query select
    created_invite.accept_token,
    created_invite.created_at,
    created_invite.email,
    created_invite.id,
    created_invite.role;
end;
$$;

create or replace function public.create_workspace_invite(
  target_workspace_id uuid,
  target_email text,
  target_role public.scope_access_role default 'member',
  target_message text default null
)
returns table(id uuid, email text, role text, accept_token text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  created_invite public.invitations%rowtype;
  existing_member_role public.scope_access_role;
  normalized_email text := lower(trim(target_email));
  generated_token text := replace(gen_random_uuid()::text, '-', '');
  current_org_role public.organization_role;
  target_org_role public.organization_role;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if target_role = 'admin' then
    raise exception 'Workspace admin access is granted after acceptance by a workspace admin.';
  end if;

  if not (
    public.can_manage_workspace(target_workspace_id, auth.uid())
    or public.can_edit_workspace(target_workspace_id, auth.uid())
  ) then
    raise exception 'Only workspace members and admins can invite people.';
  end if;

  if normalized_email is null or normalized_email = '' then
    raise exception 'Email is required.';
  end if;

  select org_member.role
    into current_org_role
  from public.workspaces workspace
  join public.organization_members org_member
    on org_member.organization_id = workspace.organization_id
   and org_member.user_id = auth.uid()
  where workspace.id = target_workspace_id;

  if current_org_role = 'guest' then
    raise exception 'Workspace guests cannot invite people.';
  end if;

  select org_member.role
    into target_org_role
  from public.workspaces workspace
  join public.organization_members org_member
    on org_member.organization_id = workspace.organization_id
  join public.profiles profile
    on profile.user_id = org_member.user_id
  where workspace.id = target_workspace_id
    and lower(coalesce(profile.email, '')) = normalized_email
  limit 1;

  if target_org_role is null and target_role <> 'guest' then
    raise exception 'External workspace invites can only create guest access.';
  end if;

  if target_org_role = 'guest' and target_role <> 'guest' then
    raise exception 'Organization guests can only receive guest workspace access.';
  end if;

  if target_org_role in ('admin', 'member') and target_role = 'guest' then
    raise exception 'Organization members and admins can only receive member or admin workspace access.';
  end if;

  select workspace_member.role
    into existing_member_role
  from public.workspaces workspace
  join public.organization_members org_member
    on org_member.organization_id = workspace.organization_id
  join public.profiles profile
    on profile.user_id = org_member.user_id
  join public.workspace_members workspace_member
    on workspace_member.workspace_id = workspace.id
   and workspace_member.user_id = org_member.user_id
  where workspace.id = target_workspace_id
    and lower(coalesce(profile.email, '')) = normalized_email
  limit 1;

  if existing_member_role is not null then
    raise exception 'WORKSPACE_MEMBER_ALREADY_EXISTS';
  end if;

  insert into public.invitations (
    resource_type, resource_id, email, role, message,
    accept_token, created_by_user_id
  )
  values (
    'workspace', target_workspace_id, normalized_email, target_role::text, target_message,
    generated_token, auth.uid()
  )
  on conflict (resource_type, resource_id, email)
  do update set
    role = excluded.role,
    message = excluded.message,
    accept_token = excluded.accept_token,
    expires_at = timezone('utc', now()) + interval '7 days',
    email_sent_at = null,
    accepted_at = null,
    accepted_by_user_id = null,
    revoked_at = null,
    revoked_by_user_id = null,
    created_by_user_id = excluded.created_by_user_id,
    created_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  returning * into created_invite;

  return query select
    created_invite.id,
    created_invite.email,
    created_invite.role,
    created_invite.accept_token,
    created_invite.created_at;
end;
$$;

create or replace function public.remove_project_member(
  target_project_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_member_role public.scope_access_role;
begin
  if not public.can_manage_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to remove members from this project.';
  end if;

  select project_member.role
    into existing_member_role
  from public.project_members project_member
  where project_member.project_id = target_project_id
    and project_member.user_id = target_user_id;

  if existing_member_role is null then
    raise exception 'PROJECT_MEMBER_NOT_FOUND';
  end if;

  if existing_member_role = 'admin'
     and not exists (
       select 1
       from public.project_members other_member
       where other_member.project_id = target_project_id
         and other_member.role = 'admin'
         and other_member.user_id <> target_user_id
     ) then
    raise exception 'PROJECT_ADMIN_REQUIRED';
  end if;

  delete from public.project_members
  where project_id = target_project_id
    and user_id = target_user_id;

  perform public.touch_project(target_project_id, auth.uid());
end;
$$;

create or replace function public.remove_workspace_member(
  target_workspace_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_role public.scope_access_role;
  workspace_access public.resource_access;
begin
  if not public.can_manage_workspace(target_workspace_id, auth.uid()) then
    raise exception 'You do not have permission to remove members from this workspace.';
  end if;

  select workspace_member.role, workspace.access
    into existing_role, workspace_access
  from public.workspace_members workspace_member
  join public.workspaces workspace
    on workspace.id = workspace_member.workspace_id
  where workspace_member.workspace_id = target_workspace_id
    and workspace_member.user_id = target_user_id;

  if existing_role is null then
    raise exception 'WORKSPACE_MEMBER_NOT_FOUND';
  end if;

  if existing_role = 'admin'
     and not exists (
       select 1
       from public.workspace_members other_member
       where other_member.workspace_id = target_workspace_id
         and other_member.role = 'admin'
         and other_member.user_id <> target_user_id
     ) then
    raise exception 'WORKSPACE_ADMIN_REQUIRED';
  end if;

  if workspace_access = 'private' then
    delete from public.project_members
    where user_id = target_user_id
      and project_id in (
        select project.id
        from public.projects project
        where project.workspace_id = target_workspace_id
      );
  end if;

  delete from public.workspace_members
  where workspace_id = target_workspace_id
    and user_id = target_user_id;
end;
$$;

create or replace function public.set_project_member_role(
  target_project_id uuid,
  target_user_id uuid,
  target_role public.scope_access_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_member_role public.scope_access_role;
  target_org_role public.organization_role;
begin
  if not public.can_manage_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to manage members on this project.';
  end if;

  select project_member.role
    into existing_member_role
  from public.project_members project_member
  where project_member.project_id = target_project_id
    and project_member.user_id = target_user_id;

  if existing_member_role is null then
    raise exception 'PROJECT_MEMBER_NOT_FOUND';
  end if;

  if existing_member_role = target_role then
    return;
  end if;

  select org_member.role
    into target_org_role
  from public.projects project
  join public.workspaces workspace
    on workspace.id = project.workspace_id
  join public.organization_members org_member
    on org_member.organization_id = workspace.organization_id
   and org_member.user_id = target_user_id
  where project.id = target_project_id;

  if target_org_role = 'guest' then
    if target_role <> 'guest' then
      raise exception 'Organization guests can only receive guest project access.';
    end if;
  elsif target_role = 'guest' then
    raise exception 'Organization members and admins can only receive member or admin project access.';
  end if;

  if existing_member_role = 'admin'
     and target_role <> 'admin'
     and not exists (
       select 1
       from public.project_members other_member
       where other_member.project_id = target_project_id
         and other_member.role = 'admin'
         and other_member.user_id <> target_user_id
     ) then
    raise exception 'PROJECT_ADMIN_REQUIRED';
  end if;

  update public.project_members
  set role = target_role
  where project_id = target_project_id
    and user_id = target_user_id;

  perform public.touch_project(target_project_id, auth.uid());
end;
$$;

create or replace function public.set_workspace_member_role(
  target_workspace_id uuid,
  target_user_id uuid,
  target_role public.scope_access_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_role public.scope_access_role;
  target_org_role public.organization_role;
begin
  if not public.can_manage_workspace(target_workspace_id, auth.uid()) then
    raise exception 'You do not have permission to manage workspace members.';
  end if;

  select role
    into existing_role
  from public.workspace_members
  where workspace_id = target_workspace_id
    and user_id = target_user_id;

  if existing_role is null then
    raise exception 'WORKSPACE_MEMBER_NOT_FOUND';
  end if;

  if existing_role = target_role then
    return;
  end if;

  select org_member.role
    into target_org_role
  from public.workspaces workspace
  join public.organization_members org_member
    on org_member.organization_id = workspace.organization_id
   and org_member.user_id = target_user_id
  where workspace.id = target_workspace_id;

  if target_org_role = 'guest' then
    if target_role <> 'guest' then
      raise exception 'Organization guests can only receive guest workspace access.';
    end if;
  elsif target_role = 'guest' then
    raise exception 'Organization members and admins can only receive member or admin workspace access.';
  end if;

  if existing_role = 'admin'
     and target_role <> 'admin'
     and not exists (
       select 1
       from public.workspace_members other_member
       where other_member.workspace_id = target_workspace_id
         and other_member.role = 'admin'
         and other_member.user_id <> target_user_id
     ) then
    raise exception 'WORKSPACE_ADMIN_REQUIRED';
  end if;

  update public.workspace_members
  set role = target_role
  where workspace_id = target_workspace_id
    and user_id = target_user_id;
end;
$$;

create or replace function public.can_access_project(target_project_id uuid, target_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.projects project
    left join public.project_members project_member
      on project_member.project_id = project.id
     and project_member.user_id = target_user_id
    where project.id = target_project_id
      and public.can_access_workspace(project.workspace_id, target_user_id)
      and (
        project.access = 'open'
        or project_member.user_id is not null
      )
  );
end;
$$;

create or replace function public.can_access_workspace(target_workspace_id uuid, target_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.workspaces workspace
    join public.organization_members org_member
      on org_member.organization_id = workspace.organization_id
     and org_member.user_id = target_user_id
    left join public.workspace_members workspace_member
      on workspace_member.workspace_id = workspace.id
     and workspace_member.user_id = target_user_id
    where workspace.id = target_workspace_id
      and (
        workspace.access = 'open'
        or workspace_member.user_id is not null
      )
  );
end;
$$;

create or replace function public.can_edit_project(target_project_id uuid, target_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.projects project
    join public.workspaces workspace
      on workspace.id = project.workspace_id
    join public.organization_members org_member
      on org_member.organization_id = workspace.organization_id
     and org_member.user_id = target_user_id
    where project.id = target_project_id
      and public.can_access_project(project.id, target_user_id)
      and org_member.role in ('admin', 'member')
  );
end;
$$;

create or replace function public.can_edit_workspace(target_workspace_id uuid, target_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.workspaces workspace
    join public.organization_members org_member
      on org_member.organization_id = workspace.organization_id
     and org_member.user_id = target_user_id
    left join public.workspace_members workspace_member
      on workspace_member.workspace_id = workspace.id
     and workspace_member.user_id = target_user_id
    where workspace.id = target_workspace_id
      and org_member.role in ('admin', 'member')
      and (
        workspace.access = 'open'
        or workspace_member.user_id is not null
      )
  );
end;
$$;

create or replace function public.can_manage_project(target_project_id uuid, target_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.projects project
    join public.workspaces workspace
      on workspace.id = project.workspace_id
    join public.organization_members org_member
      on org_member.organization_id = workspace.organization_id
     and org_member.user_id = target_user_id
    left join public.workspace_members workspace_member
      on workspace_member.workspace_id = workspace.id
     and workspace_member.user_id = target_user_id
    left join public.project_members project_member
      on project_member.project_id = project.id
     and project_member.user_id = target_user_id
    where project.id = target_project_id
      and (
        org_member.role = 'admin'
        or (
          org_member.role = 'member'
          and (
            workspace_member.role = 'admin'
            or project_member.role = 'admin'
          )
        )
      )
  );
end;
$$;

create or replace function public.can_manage_workspace(target_workspace_id uuid, target_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.workspaces workspace
    join public.organization_members org_member
      on org_member.organization_id = workspace.organization_id
     and org_member.user_id = target_user_id
    left join public.workspace_members workspace_member
      on workspace_member.workspace_id = workspace.id
     and workspace_member.user_id = target_user_id
    where workspace.id = target_workspace_id
      and (
        org_member.role = 'admin'
        or (
          org_member.role = 'member'
          and workspace_member.role = 'admin'
        )
      )
  );
end;
$$;

create or replace function public.default_scope_role_for_org_role(target_org_role public.organization_role)
returns public.scope_access_role
language sql
immutable
as $$
  select case
    when target_org_role = 'guest' then 'guest'::public.scope_access_role
    else 'member'::public.scope_access_role
  end;
$$;

create or replace function public.get_project_access_route_context(
  target_org_slug text,
  target_workspace_slug text,
  target_project_slug text
)
returns table(
  project_id uuid,
  project_name text,
  project_slug text,
  project_access public.resource_access,
  workspace_id uuid,
  workspace_name text,
  workspace_slug text,
  workspace_access public.resource_access,
  organization_id uuid,
  organization_name text,
  organization_slug text,
  can_access_project boolean,
  can_manage_project boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    project.id as project_id,
    project.name as project_name,
    project.slug as project_slug,
    project.access as project_access,
    workspace.id as workspace_id,
    workspace.name as workspace_name,
    workspace.slug as workspace_slug,
    workspace.access as workspace_access,
    organization.id as organization_id,
    organization.name as organization_name,
    organization.slug as organization_slug,
    public.can_access_project(project.id, auth.uid()) as can_access_project,
    public.can_manage_project(project.id, auth.uid()) as can_manage_project
  from public.projects project
  join public.workspaces workspace
    on workspace.id = project.workspace_id
  join public.organizations organization
    on organization.id = workspace.organization_id
  where organization.slug = trim(target_org_slug)
    and workspace.slug = trim(target_workspace_slug)
    and project.slug = trim(target_project_slug)
    and project.archived_at is null
    and project.deleted_at is null
    and (
      public.can_access_project(project.id, auth.uid())
      or public.can_manage_project(project.id, auth.uid())
    );
$$;

drop function if exists public.get_project_access_snapshot(uuid);

create or replace function public.get_project_access_snapshot(target_project_id uuid)
returns table(
  current_org_role public.organization_role,
  can_edit_project boolean,
  can_manage_project boolean,
  workspace_access public.resource_access,
  project_access public.resource_access,
  direct_access jsonb,
  collaborators jsonb,
  pending_invites jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with target_project as (
    select
      project.id as project_id,
      project.access as project_access,
      workspace.id as workspace_id,
      workspace.access as workspace_access,
      workspace.organization_id as organization_id
    from public.projects project
    join public.workspaces workspace
      on workspace.id = project.workspace_id
    where project.id = target_project_id
  )
  select
    current_member.role as current_org_role,
    public.can_edit_project(target_project_id, auth.uid()) as can_edit_project,
    public.can_manage_project(target_project_id, auth.uid()) as can_manage_project,
    target_project.workspace_access,
    target_project.project_access,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'email', profile.email,
            'github_login', profile.github_login,
            'id', profile.user_id,
            'name', coalesce(profile.full_name, split_part(profile.email, '@', 1), 'Unknown'),
            'org_role', org_member.role,
            'scope_role', project_member.role,
            'effective_role', case
              when org_member.role = 'admin' then 'admin'
              when org_member.role = 'member'
                and (
                  project_member.role = 'admin'
                  or coalesce(workspace_member.role, 'guest'::public.scope_access_role) = 'admin'
                ) then 'admin'
              else org_member.role::text
            end,
            'can_edit', org_member.role in ('admin', 'member'),
            'can_manage', case
              when org_member.role = 'admin' then true
              when org_member.role = 'member'
                and (
                  project_member.role = 'admin'
                  or coalesce(workspace_member.role, 'guest'::public.scope_access_role) = 'admin'
                ) then true
              else false
            end
          )
          order by
            case
              when org_member.role = 'admin' then 0
              when org_member.role = 'member'
                and (
                  project_member.role = 'admin'
                  or coalesce(workspace_member.role, 'guest'::public.scope_access_role) = 'admin'
                ) then 1
              when org_member.role = 'member' and project_member.role = 'member' then 2
              else 3
            end,
            coalesce(profile.full_name, profile.email) asc,
            profile.user_id asc
        )
        from public.project_members project_member
        join target_project
          on target_project.project_id = project_member.project_id
        join public.organization_members org_member
          on org_member.organization_id = target_project.organization_id
         and org_member.user_id = project_member.user_id
        left join public.workspace_members workspace_member
          on workspace_member.workspace_id = target_project.workspace_id
         and workspace_member.user_id = project_member.user_id
        join public.profiles profile
          on profile.user_id = project_member.user_id
      ),
      '[]'::jsonb
    ) as direct_access,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'email', profile.email,
            'github_login', profile.github_login,
            'id', org_member.user_id,
            'name', coalesce(profile.full_name, split_part(profile.email, '@', 1), 'Unknown'),
            'org_role', org_member.role,
            'workspace_role', workspace_member.role,
            'project_role', project_member.role,
            'effective_role', case
              when org_member.role = 'admin' then 'admin'
              when org_member.role = 'member'
                and (
                  coalesce(workspace_member.role, 'guest'::public.scope_access_role) = 'admin'
                  or coalesce(project_member.role, 'guest'::public.scope_access_role) = 'admin'
                ) then 'admin'
              else org_member.role::text
            end,
            'can_edit', org_member.role in ('admin', 'member'),
            'can_manage', case
              when org_member.role = 'admin' then true
              when org_member.role = 'member'
                and (
                  coalesce(workspace_member.role, 'guest'::public.scope_access_role) = 'admin'
                  or coalesce(project_member.role, 'guest'::public.scope_access_role) = 'admin'
                ) then true
              else false
            end,
            'access_source', case
              when project_member.user_id is not null then 'project'
              when workspace_member.user_id is not null then 'workspace'
              else 'organization'
            end
          )
          order by
            case
              when org_member.role = 'admin' then 0
              when org_member.role = 'member'
                and (
                  coalesce(workspace_member.role, 'guest'::public.scope_access_role) = 'admin'
                  or coalesce(project_member.role, 'guest'::public.scope_access_role) = 'admin'
                ) then 1
              when org_member.role = 'member' then 2
              else 3
            end,
            coalesce(profile.full_name, profile.email) asc,
            profile.user_id asc
        )
        from target_project
        join public.organization_members org_member
          on org_member.organization_id = target_project.organization_id
        left join public.workspace_members workspace_member
          on workspace_member.workspace_id = target_project.workspace_id
         and workspace_member.user_id = org_member.user_id
        left join public.project_members project_member
          on project_member.project_id = target_project.project_id
         and project_member.user_id = org_member.user_id
        join public.profiles profile
          on profile.user_id = org_member.user_id
        where (
          target_project.workspace_access = 'open'
          or workspace_member.user_id is not null
        )
          and (
            target_project.project_access = 'open'
            or project_member.user_id is not null
          )
      ),
      '[]'::jsonb
    ) as collaborators,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', invite.id,
            'email', invite.email,
            'role', invite.role,
            'created_at', invite.created_at,
            'email_sent_at', invite.email_sent_at
          )
          order by invite.created_at desc, invite.id desc
        )
        from public.project_invites invite
        where invite.project_id = target_project.project_id
          and invite.accepted_at is null
          and invite.revoked_at is null
      ),
      '[]'::jsonb
    ) as pending_invites
  from target_project
  join public.organization_members current_member
    on current_member.organization_id = target_project.organization_id
   and current_member.user_id = auth.uid()
  where public.can_access_project(target_project_id, auth.uid())
     or public.can_manage_project(target_project_id, auth.uid());
$$;

create or replace function public.get_workspace_access_route_context(
  target_org_slug text,
  target_workspace_slug text
)
returns table(
  workspace_id uuid,
  workspace_name text,
  workspace_slug text,
  workspace_access public.resource_access,
  organization_id uuid,
  organization_name text,
  organization_slug text,
  can_access_workspace boolean,
  can_manage_workspace boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    workspace.id as workspace_id,
    workspace.name as workspace_name,
    workspace.slug as workspace_slug,
    workspace.access as workspace_access,
    organization.id as organization_id,
    organization.name as organization_name,
    organization.slug as organization_slug,
    public.can_access_workspace(workspace.id, auth.uid()) as can_access_workspace,
    public.can_manage_workspace(workspace.id, auth.uid()) as can_manage_workspace
  from public.workspaces workspace
  join public.organizations organization
    on organization.id = workspace.organization_id
  where organization.slug = trim(target_org_slug)
    and workspace.slug = trim(target_workspace_slug)
    and (
      public.can_access_workspace(workspace.id, auth.uid())
      or public.can_manage_workspace(workspace.id, auth.uid())
    );
$$;

drop function if exists public.get_workspace_access_snapshot(uuid);

create or replace function public.get_workspace_access_snapshot(target_workspace_id uuid)
returns table(
  current_org_role public.organization_role,
  can_edit_workspace boolean,
  can_manage_workspace boolean,
  workspace_access public.resource_access,
  direct_access jsonb,
  collaborators jsonb,
  pending_invites jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with target_workspace as (
    select
      workspace.id as workspace_id,
      workspace.access as workspace_access,
      workspace.organization_id as organization_id
    from public.workspaces workspace
    where workspace.id = target_workspace_id
  )
  select
    current_member.role as current_org_role,
    public.can_edit_workspace(target_workspace_id, auth.uid()) as can_edit_workspace,
    public.can_manage_workspace(target_workspace_id, auth.uid()) as can_manage_workspace,
    target_workspace.workspace_access,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'email', profile.email,
            'github_login', profile.github_login,
            'id', profile.user_id,
            'name', coalesce(profile.full_name, split_part(profile.email, '@', 1), 'Unknown'),
            'org_role', org_member.role,
            'scope_role', workspace_member.role,
            'effective_role', case
              when org_member.role = 'admin' then 'admin'
              when org_member.role = 'member' and workspace_member.role = 'admin' then 'admin'
              else org_member.role::text
            end,
            'can_edit', org_member.role in ('admin', 'member'),
            'can_manage', case
              when org_member.role = 'admin' then true
              when org_member.role = 'member' and workspace_member.role = 'admin' then true
              else false
            end
          )
          order by
            case
              when org_member.role = 'admin' then 0
              when org_member.role = 'member' and workspace_member.role = 'admin' then 1
              when org_member.role = 'member' and workspace_member.role = 'member' then 2
              else 3
            end,
            coalesce(profile.full_name, profile.email) asc,
            profile.user_id asc
        )
        from public.workspace_members workspace_member
        join target_workspace
          on target_workspace.workspace_id = workspace_member.workspace_id
        join public.organization_members org_member
          on org_member.organization_id = target_workspace.organization_id
         and org_member.user_id = workspace_member.user_id
        join public.profiles profile
          on profile.user_id = workspace_member.user_id
      ),
      '[]'::jsonb
    ) as direct_access,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'email', profile.email,
            'github_login', profile.github_login,
            'id', org_member.user_id,
            'name', coalesce(profile.full_name, split_part(profile.email, '@', 1), 'Unknown'),
            'org_role', org_member.role,
            'workspace_role', workspace_member.role,
            'effective_role', case
              when org_member.role = 'admin' then 'admin'
              when org_member.role = 'member' and workspace_member.role = 'admin' then 'admin'
              else org_member.role::text
            end,
            'can_edit', org_member.role in ('admin', 'member'),
            'can_manage', case
              when org_member.role = 'admin' then true
              when org_member.role = 'member' and workspace_member.role = 'admin' then true
              else false
            end,
            'access_source', case
              when workspace_member.user_id is not null then 'workspace'
              else 'organization'
            end
          )
          order by
            case
              when org_member.role = 'admin' then 0
              when org_member.role = 'member' and workspace_member.role = 'admin' then 1
              when org_member.role = 'member' then 2
              else 3
            end,
            coalesce(profile.full_name, profile.email) asc,
            profile.user_id asc
        )
        from target_workspace
        join public.organization_members org_member
          on org_member.organization_id = target_workspace.organization_id
        left join public.workspace_members workspace_member
          on workspace_member.workspace_id = target_workspace.workspace_id
         and workspace_member.user_id = org_member.user_id
        join public.profiles profile
          on profile.user_id = org_member.user_id
        where target_workspace.workspace_access = 'open'
          or workspace_member.user_id is not null
      ),
      '[]'::jsonb
    ) as collaborators,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', invite.id,
            'email', invite.email,
            'role', invite.role,
            'created_at', invite.created_at,
            'email_sent_at', invite.email_sent_at
          )
          order by invite.created_at desc, invite.id desc
        )
        from public.invitations invite
        where invite.resource_type = 'workspace'
          and invite.resource_id = target_workspace.workspace_id
          and invite.accepted_at is null
          and invite.revoked_at is null
      ),
      '[]'::jsonb
    ) as pending_invites
  from target_workspace
  join public.organization_members current_member
    on current_member.organization_id = target_workspace.organization_id
   and current_member.user_id = auth.uid()
  where public.can_access_workspace(target_workspace_id, auth.uid())
     or public.can_manage_workspace(target_workspace_id, auth.uid());
$$;

create or replace function public.list_workspace_access_projects(target_workspace_id uuid)
returns table(
  project_id uuid,
  project_name text,
  project_slug text,
  project_access public.resource_access,
  can_access_project boolean,
  can_manage_project boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    project.id as project_id,
    project.name as project_name,
    project.slug as project_slug,
    project.access as project_access,
    public.can_access_project(project.id, auth.uid()) as can_access_project,
    public.can_manage_project(project.id, auth.uid()) as can_manage_project
  from public.projects project
  where project.workspace_id = target_workspace_id
    and project.archived_at is null
    and project.deleted_at is null
    and (
      public.can_access_workspace(target_workspace_id, auth.uid())
      or public.can_manage_workspace(target_workspace_id, auth.uid())
    )
    and public.can_manage_project(project.id, auth.uid())
  order by project.position asc, project.created_at asc, project.id asc;
$$;

drop function if exists public.list_workspace_members(uuid);

create or replace function public.list_workspace_members(target_workspace_id uuid)
returns table(user_id uuid, name text, email text, role public.scope_access_role)
language sql
stable
security definer
set search_path = public
as $$
  select
    wm.user_id as user_id,
    coalesce(p.full_name, split_part(p.email, '@', 1), 'Unknown') as name,
    p.email as email,
    wm.role as role
  from public.workspace_members wm
  join public.profiles p
    on p.user_id = wm.user_id
  where wm.workspace_id = target_workspace_id
    and public.can_access_workspace(target_workspace_id, auth.uid())
  order by
    case
      when wm.role = 'admin' then 0
      when wm.role = 'member' then 1
      else 2
    end,
    coalesce(p.full_name, p.email) asc;
$$;

drop function if exists public.search_workspace_members(uuid, text, uuid);

create or replace function public.search_workspace_members(
  target_workspace_id uuid,
  target_query text default '',
  target_exclude_project_id uuid default null
)
returns table(user_id uuid, name text, email text, org_role public.organization_role)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
    select
      org_member.user_id as user_id,
      coalesce(p.full_name, split_part(p.email, '@', 1), 'Unknown') as name,
      p.email as email,
      org_member.role as org_role
    from public.workspaces workspace
    join public.organization_members org_member
      on org_member.organization_id = workspace.organization_id
    join public.profiles p
      on p.user_id = org_member.user_id
    where workspace.id = target_workspace_id
      and (
        public.can_access_workspace(target_workspace_id, auth.uid())
        or public.can_manage_workspace(target_workspace_id, auth.uid())
      )
      and (
        target_exclude_project_id is null
        or not exists (
          select 1 from public.project_members pm
          where pm.project_id = target_exclude_project_id
            and pm.user_id = org_member.user_id
        )
      )
      and (
        trim(target_query) = ''
        or coalesce(p.full_name, '') ilike '%' || trim(target_query) || '%'
        or p.email ilike '%' || trim(target_query) || '%'
      )
    order by
      case org_member.role when 'admin' then 0 when 'member' then 1 else 2 end,
      coalesce(p.full_name, p.email) asc;
end;
$$;

create or replace function public.set_organization_member_role(
  target_org_id uuid,
  target_user_id uuid,
  target_role public.organization_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_role public.organization_role;
begin
  if not exists (
    select 1 from public.organization_members
    where organization_id = target_org_id
      and user_id = auth.uid()
      and role = 'admin'
  ) then
    raise exception 'Only organization admins can change roles.';
  end if;

  select role into existing_role
  from public.organization_members
  where organization_id = target_org_id
    and user_id = target_user_id;

  if existing_role is null then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  if existing_role = target_role then
    return;
  end if;

  if existing_role = 'admin' and target_role <> 'admin'
     and not exists (
       select 1 from public.organization_members
       where organization_id = target_org_id
         and role = 'admin'
         and user_id <> target_user_id
     ) then
    raise exception 'ORG_ADMIN_REQUIRED';
  end if;

  update public.organization_members
  set
    role = target_role,
    seat_status = case when target_role = 'guest' then 'free' else 'paid' end
  where organization_id = target_org_id
    and user_id = target_user_id;

  if target_role = 'guest' then
    update public.workspace_members workspace_member
    set role = 'guest'
    where workspace_member.user_id = target_user_id
      and workspace_member.workspace_id in (
        select workspace.id
        from public.workspaces workspace
        where workspace.organization_id = target_org_id
      )
      and workspace_member.role <> 'guest';

    update public.project_members project_member
    set role = 'guest'
    where project_member.user_id = target_user_id
      and project_member.project_id in (
        select project.id
        from public.projects project
        join public.workspaces workspace
          on workspace.id = project.workspace_id
        where workspace.organization_id = target_org_id
      )
      and project_member.role <> 'guest';
  end if;
end;
$$;

create or replace function public.set_project_access(
  target_project_id uuid,
  target_access public.resource_access
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_access public.resource_access;
  project_workspace_id uuid;
begin
  if not public.can_manage_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to change project visibility.';
  end if;

  select project.access, project.workspace_id
    into current_access, project_workspace_id
  from public.projects project
  where project.id = target_project_id;

  if current_access is null then
    raise exception 'PROJECT_NOT_FOUND';
  end if;

  if current_access = target_access then
    return;
  end if;

  if target_access = 'private' then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (project_workspace_id, auth.uid(), 'admin')
    on conflict (workspace_id, user_id)
    do update
      set role = 'admin';

    insert into public.project_members (project_id, user_id, role)
    values (target_project_id, auth.uid(), 'admin')
    on conflict (project_id, user_id)
    do update
      set role = 'admin';
  end if;

  update public.projects
  set
    access = target_access,
    updated_at = timezone('utc', now()),
    updated_by_user_id = auth.uid()
  where id = target_project_id;

  perform public.touch_project(target_project_id, auth.uid());
end;
$$;

create or replace function public.set_workspace_access(
  target_workspace_id uuid,
  target_access public.resource_access
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_access public.resource_access;
begin
  if not public.can_manage_workspace(target_workspace_id, auth.uid()) then
    raise exception 'You do not have permission to change workspace visibility.';
  end if;

  select workspace.access
    into current_access
  from public.workspaces workspace
  where workspace.id = target_workspace_id;

  if current_access is null then
    raise exception 'WORKSPACE_NOT_FOUND';
  end if;

  if current_access = target_access then
    return;
  end if;

  if target_access = 'private' then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (target_workspace_id, auth.uid(), 'admin')
    on conflict (workspace_id, user_id)
    do update
      set role = 'admin';
  end if;

  update public.workspaces
  set
    access = target_access,
    updated_at = timezone('utc', now())
  where id = target_workspace_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Organization members RLS refinement.
-- The membership table cannot evaluate membership through its own RLS path.
-- ----------------------------------------------------------------------------

drop policy if exists organization_members_select_for_members
on public.organization_members;

drop policy if exists organization_members_manage_for_admins
on public.organization_members;

create policy organization_members_select_for_members
on public.organization_members
for select
to authenticated
using (
  public.can_access_organization(organization_id, auth.uid())
);

create policy organization_members_manage_for_admins
on public.organization_members
for all
to authenticated
using (
  public.can_manage_organization(organization_id, auth.uid())
)
with check (
  public.can_manage_organization(organization_id, auth.uid())
);
