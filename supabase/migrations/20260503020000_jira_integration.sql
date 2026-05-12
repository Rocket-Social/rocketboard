-- Jira/Atlassian: org OAuth sources and project contributor stats.

create table public.jira_connection_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cloud_id text not null,
  site_url text not null,
  site_name text not null,
  account_id text not null,
  account_email text,
  encrypted_access_token text not null,
  encrypted_refresh_token text not null,
  token_expires_at timestamptz not null,
  scopes text[] not null default '{}',
  status text not null default 'active',
  last_synced_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jira_connection_sources_status_check check (status in ('active', 'error', 'revoked')),
  constraint jira_connection_sources_site_url_check check (site_url ~ '^https://[a-zA-Z0-9][a-zA-Z0-9.-]*\.atlassian\.net/?$')
);

create unique index idx_jira_connection_sources_org_cloud
  on public.jira_connection_sources (organization_id, cloud_id);

create index idx_jira_connection_sources_org
  on public.jira_connection_sources (organization_id, updated_at desc);

create table public.jira_oauth_states (
  state text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  return_path text not null default '/',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index idx_jira_oauth_states_org_expires
  on public.jira_oauth_states (organization_id, expires_at desc);

create table public.project_jira_settings (
  project_id uuid primary key references public.projects(id) on delete cascade,
  connection_source_id uuid references public.jira_connection_sources(id) on delete set null,
  configured_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_project_jira_settings_source
  on public.project_jira_settings (connection_source_id);

create table public.jira_contributor_stats (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  connection_source_id uuid not null references public.jira_connection_sources(id) on delete cascade,
  jira_account_id text not null,
  contributor_name text not null,
  contributor_email text,
  reopened_bugs integer not null default 0,
  resolved_bugs integer not null default 0,
  logged_seconds integer not null default 0,
  window_start_date date not null,
  window_end_date date not null,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jira_contributor_stats_counts_check check (
    reopened_bugs >= 0
    and resolved_bugs >= 0
    and logged_seconds >= 0
  ),
  constraint jira_contributor_stats_window_check check (window_start_date <= window_end_date)
);

create unique index idx_jira_contributor_stats_project_source_account
  on public.jira_contributor_stats (project_id, connection_source_id, jira_account_id);

create index idx_jira_contributor_stats_project
  on public.jira_contributor_stats (project_id, computed_at desc);

alter table public.jira_connection_sources enable row level security;
alter table public.jira_oauth_states enable row level security;
alter table public.project_jira_settings enable row level security;
alter table public.jira_contributor_stats enable row level security;

create policy jira_connection_sources_select
  on public.jira_connection_sources for select
  using (public.can_access_organization(organization_id));

create policy jira_connection_sources_insert
  on public.jira_connection_sources for insert
  with check (public.can_manage_organization(organization_id));

create policy jira_connection_sources_update
  on public.jira_connection_sources for update
  using (public.can_manage_organization(organization_id))
  with check (public.can_manage_organization(organization_id));

create policy jira_connection_sources_delete
  on public.jira_connection_sources for delete
  using (public.can_manage_organization(organization_id));

create policy jira_oauth_states_select_own
  on public.jira_oauth_states for select
  using (requested_by = auth.uid());

create policy project_jira_settings_select
  on public.project_jira_settings for select
  using (public.can_access_project(project_id));

create policy project_jira_settings_insert
  on public.project_jira_settings for insert
  with check (
    public.can_manage_project(project_id)
    and (
      connection_source_id is null
      or exists (
        select 1
        from public.jira_connection_sources source
        join public.projects project on project.id = project_jira_settings.project_id
        join public.workspaces workspace on workspace.id = project.workspace_id
        where source.id = project_jira_settings.connection_source_id
          and source.organization_id = workspace.organization_id
      )
    )
  );

create policy project_jira_settings_update
  on public.project_jira_settings for update
  using (public.can_manage_project(project_id))
  with check (
    public.can_manage_project(project_id)
    and (
      connection_source_id is null
      or exists (
        select 1
        from public.jira_connection_sources source
        join public.projects project on project.id = project_jira_settings.project_id
        join public.workspaces workspace on workspace.id = project.workspace_id
        where source.id = project_jira_settings.connection_source_id
          and source.organization_id = workspace.organization_id
      )
    )
  );

create policy project_jira_settings_delete
  on public.project_jira_settings for delete
  using (public.can_manage_project(project_id));

create policy jira_contributor_stats_select
  on public.jira_contributor_stats for select
  using (public.can_access_project(project_id));

create or replace function public.set_project_jira_source(
  target_project_id uuid,
  target_connection_source_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  source_org_id uuid;
  project_org_id uuid;
begin
  if not public.can_manage_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to manage Jira settings for this project.';
  end if;

  select workspace.organization_id
    into project_org_id
  from public.projects project
  join public.workspaces workspace on workspace.id = project.workspace_id
  where project.id = target_project_id;

  select source.organization_id
    into source_org_id
  from public.jira_connection_sources source
  where source.id = target_connection_source_id
    and source.status = 'active';

  if source_org_id is null then
    raise exception 'Jira source not found.';
  end if;

  if source_org_id <> project_org_id then
    raise exception 'Jira source does not belong to this project organization.';
  end if;

  insert into public.project_jira_settings (
    project_id,
    connection_source_id,
    configured_by,
    updated_at
  )
  values (
    target_project_id,
    target_connection_source_id,
    auth.uid(),
    now()
  )
  on conflict (project_id) do update set
    connection_source_id = excluded.connection_source_id,
    configured_by = excluded.configured_by,
    updated_at = now();

  return target_connection_source_id;
end;
$$;

create or replace function public.clear_project_jira_source(target_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to manage Jira settings for this project.';
  end if;

  delete from public.project_jira_settings
  where project_id = target_project_id;
end;
$$;

grant all on public.jira_connection_sources to service_role;
grant select (
  id,
  organization_id,
  cloud_id,
  site_url,
  site_name,
  account_id,
  account_email,
  scopes,
  status,
  last_synced_at,
  created_at,
  updated_at
) on public.jira_connection_sources to authenticated;

grant all on public.jira_oauth_states to service_role;
grant select on public.jira_oauth_states to authenticated;

grant all on public.project_jira_settings to authenticated, service_role;
grant all on public.jira_contributor_stats to authenticated, service_role;
grant execute on function public.set_project_jira_source(uuid, uuid) to authenticated, service_role;
grant execute on function public.clear_project_jira_source(uuid) to authenticated, service_role;
