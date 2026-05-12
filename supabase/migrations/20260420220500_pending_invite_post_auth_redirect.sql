create or replace function public.get_pending_invite_for_current_user()
returns table(
  accept_token text,
  resource_type text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_email text;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  current_email := lower(trim(coalesce(
    (select user_entry.email from auth.users user_entry where user_entry.id = current_user_id),
    ''
  )));

  if current_email = '' then
    return;
  end if;

  return query
    with pending_invites as (
      select
        invite.accept_token,
        invite.resource_type::text as resource_type,
        invite.created_at,
        case invite.resource_type
          when 'organization' then 0
          when 'workspace' then 1
          else 2
        end as priority
      from public.invitations invite
      where invite.email = current_email
        and invite.accepted_at is null
        and invite.revoked_at is null
        and (invite.expires_at is null or invite.expires_at >= timezone('utc', now()))

      union all

      select
        invite.accept_token,
        'project'::text as resource_type,
        invite.created_at,
        2 as priority
      from public.project_invites invite
      where invite.email = current_email
        and invite.accepted_at is null
        and invite.revoked_at is null
        and (invite.expires_at is null or invite.expires_at >= timezone('utc', now()))
    )
    select
      pending_invites.accept_token,
      pending_invites.resource_type,
      pending_invites.created_at
    from pending_invites
    order by pending_invites.priority asc, pending_invites.created_at asc, pending_invites.accept_token asc
    limit 1;
end;
$$;

revoke all on function public.get_pending_invite_for_current_user() from public;
grant execute on function public.get_pending_invite_for_current_user() to authenticated;

create index invitations_pending_email_idx
  on public.invitations (email, created_at asc, accept_token asc)
  where accepted_at is null and revoked_at is null;

create index project_invites_pending_email_idx
  on public.project_invites (email, created_at asc, accept_token asc)
  where accepted_at is null and revoked_at is null;
