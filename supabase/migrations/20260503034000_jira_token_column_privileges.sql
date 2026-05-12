-- Jira OAuth token columns are service-only. Client reads only safe source metadata.

revoke all privileges on public.jira_connection_sources from authenticated;

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
