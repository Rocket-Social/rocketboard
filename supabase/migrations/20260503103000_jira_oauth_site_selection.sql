-- Jira OAuth: explicit site selection for Atlassian accounts with multiple Jira sites.

create table public.jira_oauth_site_selections (
  state text primary key references public.jira_oauth_states(state) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  account_id text not null,
  account_email text,
  encrypted_access_token text not null,
  encrypted_refresh_token text not null,
  token_expires_at timestamptz not null,
  scopes text[] not null default '{}',
  resources jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint jira_oauth_site_selections_resources_check check (jsonb_typeof(resources) = 'array')
);

create index idx_jira_oauth_site_selections_org_expires
  on public.jira_oauth_site_selections (organization_id, expires_at desc);

create index idx_jira_oauth_site_selections_expires
  on public.jira_oauth_site_selections (expires_at);

alter table public.jira_oauth_site_selections enable row level security;

revoke all privileges on public.jira_oauth_site_selections from anon, authenticated;
grant all on public.jira_oauth_site_selections to service_role;

create or replace function public.complete_jira_oauth_site_selection(
  target_state text,
  target_requested_by uuid,
  target_organization_id uuid,
  target_cloud_id text
)
returns table (
  source_id uuid,
  cloud_id text,
  site_name text,
  site_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_choice jsonb;
  selection public.jira_oauth_site_selections%rowtype;
  saved_source public.jira_connection_sources%rowtype;
begin
  if not public.can_manage_organization(target_organization_id, target_requested_by) then
    raise exception 'Only org admins can finish Jira connections.'
      using errcode = '42501';
  end if;

  delete from public.jira_oauth_site_selections pending
  where pending.state = target_state
    and pending.requested_by = target_requested_by
    and pending.organization_id = target_organization_id
    and pending.expires_at >= now()
    and pending.resources @> jsonb_build_array(jsonb_build_object('cloud_id', target_cloud_id))
  returning pending.*
    into selection;

  if not found then
    return;
  end if;

  select value
    into selected_choice
  from jsonb_array_elements(selection.resources) as value
  where value->>'cloud_id' = target_cloud_id
  limit 1;

  if selected_choice is null
    or selected_choice->>'site_name' is null
    or selected_choice->>'site_url' is null then
    raise exception 'Selected Jira site payload is invalid.';
  end if;

  insert into public.jira_connection_sources (
    account_email,
    account_id,
    cloud_id,
    encrypted_access_token,
    encrypted_refresh_token,
    organization_id,
    scopes,
    site_name,
    site_url,
    status,
    token_expires_at,
    updated_at,
    created_by
  )
  values (
    selection.account_email,
    selection.account_id,
    target_cloud_id,
    selection.encrypted_access_token,
    selection.encrypted_refresh_token,
    selection.organization_id,
    selection.scopes,
    selected_choice->>'site_name',
    selected_choice->>'site_url',
    'active',
    selection.token_expires_at,
    now(),
    selection.requested_by
  )
  on conflict (organization_id, cloud_id) do update set
    account_email = excluded.account_email,
    account_id = excluded.account_id,
    encrypted_access_token = excluded.encrypted_access_token,
    encrypted_refresh_token = excluded.encrypted_refresh_token,
    scopes = excluded.scopes,
    site_name = excluded.site_name,
    site_url = excluded.site_url,
    status = excluded.status,
    token_expires_at = excluded.token_expires_at,
    updated_at = now(),
    created_by = excluded.created_by
  returning *
    into saved_source;

  source_id := saved_source.id;
  cloud_id := saved_source.cloud_id;
  site_name := saved_source.site_name;
  site_url := saved_source.site_url;
  return next;
end;
$$;

create or replace function public.cancel_jira_oauth_site_selection(
  target_state text,
  target_requested_by uuid,
  target_organization_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  if not public.can_manage_organization(target_organization_id, target_requested_by) then
    raise exception 'Only org admins can cancel Jira connections.'
      using errcode = '42501';
  end if;

  delete from public.jira_oauth_site_selections pending
  where pending.state = target_state
    and pending.requested_by = target_requested_by
    and pending.organization_id = target_organization_id
    and pending.expires_at >= now();

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.complete_jira_oauth_site_selection(text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_jira_oauth_site_selection(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_jira_oauth_site_selection(text, uuid, uuid, text) to service_role;
grant execute on function public.cancel_jira_oauth_site_selection(text, uuid, uuid) to service_role;
