create or replace function public.deploy_healthcheck()
returns boolean
language sql
stable
set search_path = public
as $$
  select true;
$$;

revoke all on function public.deploy_healthcheck() from public;
revoke all on function public.deploy_healthcheck() from anon;
revoke all on function public.deploy_healthcheck() from authenticated;

grant execute on function public.deploy_healthcheck() to service_role;
