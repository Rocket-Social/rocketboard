-- Jira stats: board-level Jira project scope and atomic window replacement.

alter table public.project_jira_settings
  add column jira_project_key text;

alter table public.project_jira_settings
  add constraint project_jira_settings_project_key_check check (
    jira_project_key is null
    or jira_project_key ~ '^[A-Z][A-Z0-9_]{1,31}$'
  );

drop index if exists public.idx_jira_contributor_stats_project_source_account;

create unique index idx_jira_contributor_stats_project_source_window_account
  on public.jira_contributor_stats (
    project_id,
    connection_source_id,
    window_start_date,
    window_end_date,
    jira_account_id
  );

drop index if exists public.idx_jira_contributor_stats_project;

create index idx_jira_contributor_stats_project
  on public.jira_contributor_stats (project_id, window_start_date desc, window_end_date desc);

drop policy if exists project_jira_settings_insert on public.project_jira_settings;

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
          and source.status = 'active'
      )
    )
  );

drop policy if exists project_jira_settings_update on public.project_jira_settings;

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
          and source.status = 'active'
      )
    )
  );

drop function if exists public.set_project_jira_source(uuid, uuid);

create or replace function public.set_project_jira_source(
  target_project_id uuid,
  target_connection_source_id uuid,
  target_jira_project_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  source_org_id uuid;
  project_org_id uuid;
  normalized_project_key text;
begin
  if not public.can_manage_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to manage Jira settings for this project.';
  end if;

  normalized_project_key := upper(trim(coalesce(target_jira_project_key, '')));
  if normalized_project_key = '' then
    raise exception 'Jira project key is required.';
  end if;

  if normalized_project_key !~ '^[A-Z][A-Z0-9_]{1,31}$' then
    raise exception 'Jira project key must start with a letter and contain only letters, numbers, or underscores.';
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
    jira_project_key,
    configured_by,
    updated_at
  )
  values (
    target_project_id,
    target_connection_source_id,
    normalized_project_key,
    auth.uid(),
    now()
  )
  on conflict (project_id) do update set
    connection_source_id = excluded.connection_source_id,
    jira_project_key = excluded.jira_project_key,
    configured_by = excluded.configured_by,
    updated_at = now();

  return target_connection_source_id;
end;
$$;

create or replace function public.replace_project_jira_contributor_stats(
  target_project_id uuid,
  target_connection_source_id uuid,
  target_window_start_date date,
  target_window_end_date date,
  stats jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  if target_window_start_date > target_window_end_date then
    raise exception 'Jira stats window start date must be on or before end date.';
  end if;

  if jsonb_typeof(coalesce(stats, '[]'::jsonb)) <> 'array' then
    raise exception 'Jira stats payload must be an array.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      target_project_id::text
      || ':'
      || target_connection_source_id::text
      || ':'
      || target_window_start_date::text
      || ':'
      || target_window_end_date::text,
      0
    )
  );

  delete from public.jira_contributor_stats
  where project_id = target_project_id
    and connection_source_id = target_connection_source_id
    and window_start_date = target_window_start_date
    and window_end_date = target_window_end_date;

  insert into public.jira_contributor_stats (
    project_id,
    connection_source_id,
    jira_account_id,
    contributor_name,
    contributor_email,
    reopened_bugs,
    resolved_bugs,
    logged_seconds,
    window_start_date,
    window_end_date,
    computed_at,
    updated_at
  )
  select
    target_project_id,
    target_connection_source_id,
    row.jira_account_id,
    row.contributor_name,
    row.contributor_email,
    greatest(coalesce(row.reopened_bugs, 0), 0),
    greatest(coalesce(row.resolved_bugs, 0), 0),
    greatest(coalesce(row.logged_seconds, 0), 0),
    target_window_start_date,
    target_window_end_date,
    now(),
    now()
  from jsonb_to_recordset(coalesce(stats, '[]'::jsonb)) as row(
    jira_account_id text,
    contributor_name text,
    contributor_email text,
    reopened_bugs integer,
    resolved_bugs integer,
    logged_seconds integer
  )
  where row.jira_account_id is not null
    and btrim(row.jira_account_id) <> ''
    and row.contributor_name is not null
    and btrim(row.contributor_name) <> '';

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

grant execute on function public.set_project_jira_source(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.replace_project_jira_contributor_stats(uuid, uuid, date, date, jsonb) to service_role;
