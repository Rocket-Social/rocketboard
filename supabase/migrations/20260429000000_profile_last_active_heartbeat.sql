-- Track real "last active" via per-request heartbeat from authenticated clients.
-- Replaces the broken proxy of auth.users.last_sign_in_at (only updated on a
-- fresh login, not on session refresh) used by get_organization_members.

create table if not exists public.user_activity (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_active_at timestamptz not null default timezone('utc', now())
);

alter table public.user_activity enable row level security;

drop policy if exists user_activity_select_own on public.user_activity;
create policy user_activity_select_own
  on public.user_activity
  for select
  to authenticated
  using (user_id = auth.uid());

revoke all on table public.user_activity from public, anon, authenticated;

create or replace function public.touch_user_active()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  effective_now timestamptz := timezone('utc', now());
  resolved_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  insert into public.user_activity (user_id, last_active_at)
  values (current_user_id, effective_now)
  on conflict (user_id) do update
    set last_active_at = excluded.last_active_at
  returning last_active_at into resolved_at;

  return resolved_at;
end;
$$;

revoke all on function public.touch_user_active() from public;
grant execute on function public.touch_user_active() to authenticated;

-- Re-create get_organization_members to read from user_activity, falling back
-- to auth.users.last_sign_in_at for users who haven't fired a heartbeat yet.
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
          'last_active_at', coalesce(ua.last_active_at, auth_user_record.last_sign_in_at),
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
      left join public.user_activity ua on ua.user_id = om.user_id
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
