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
      (
        select count(*)
        from public.organization_members om
        where om.organization_id = p_org_id
          and om.role <> 'guest'
      ),
      (select count(*)
       from public.projects p
       join public.workspaces w on w.id = p.workspace_id
       where w.organization_id = p_org_id
         and p.archived_at is null
         and p.deleted_at is null),
      (select count(*) from public.workspaces w where w.organization_id = p_org_id),
      ent.storage_used_bytes,
      ent.effective_plan,
      ent.effective_limits
    from public.get_org_effective_entitlements(p_org_id) ent;
end;
$$;

revoke all on function public.get_org_usage(uuid) from public;
grant execute on function public.get_org_usage(uuid) to authenticated;

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
  effective text;
  effective_limits jsonb;
  max_val int;
  current_val bigint;
begin
  select ent.effective_plan, ent.effective_limits
  into effective, effective_limits
  from public.get_org_effective_entitlements(p_org_id) ent;

  if effective is null then
    return false;
  end if;

  if effective in ('pro', 'enterprise') then
    return true;
  end if;

  max_val := (effective_limits ->> p_limit_key)::int;
  if max_val is null or max_val = -1 then
    return true;
  end if;

  case p_limit_key
    when 'members' then
      select count(*) into current_val
      from public.organization_members om
      where om.organization_id = p_org_id
        and om.role <> 'guest';
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
      return true;
  end case;

  return current_val < max_val;
end;
$$;

revoke all on function public.check_org_limit(uuid, text) from public;
grant execute on function public.check_org_limit(uuid, text) to authenticated;

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
  effective_target_role public.organization_role := target_role;
  member_limit_message text := 'This organization has reached its member limit. Upgrade to Pro or free a member slot before granting member access.';
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

  if effective_target_role = 'member' and not public.check_org_limit(target_org_id, 'members') then
    effective_target_role := 'guest';
  elsif effective_target_role = 'admin' and not public.check_org_limit(target_org_id, 'members') then
    raise exception '%', member_limit_message;
  end if;

  insert into public.invitations (
    resource_type, resource_id, email, role, message,
    accept_token, created_by_user_id
  )
  values (
    'organization', target_org_id, normalized_email, effective_target_role, target_message,
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
  effective_org_role public.organization_role;
  member_limit_message text := 'This organization has reached its member limit. Upgrade to Pro or free a member slot before granting member access.';
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  current_email := lower(trim(coalesce(
    (select u.email from auth.users u where u.id = current_user_id),
    ''
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
      effective_org_role := inv_record.role::public.organization_role;

      perform 1
      from public.organizations o
      where o.id = target_org_id
      for update;

      select org_member.role
        into current_org_role
      from public.organization_members org_member
      where org_member.organization_id = target_org_id
        and org_member.user_id = current_user_id;

      if current_org_role is null then
        if effective_org_role = 'member' and not public.check_org_limit(target_org_id, 'members') then
          effective_org_role := 'guest';
        elsif effective_org_role = 'admin' and not public.check_org_limit(target_org_id, 'members') then
          raise exception '%', member_limit_message;
        end if;
      elsif current_org_role = 'admin' then
        effective_org_role := 'admin';
      elsif current_org_role = 'member' then
        if effective_org_role = 'admin' then
          effective_org_role := 'admin';
        else
          effective_org_role := 'member';
        end if;
      elsif effective_org_role <> 'guest' then
        if not public.check_org_limit(target_org_id, 'members') then
          raise exception '%', member_limit_message;
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
        effective_org_role,
        case when effective_org_role = 'guest' then 'free' else 'paid' end,
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
          role = effective_org_role::text,
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

revoke all on function public.accept_invite(text) from public;
grant execute on function public.accept_invite(text) to authenticated;

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
  member_limit_message text := 'This organization has reached its member limit. Upgrade to Pro or free a member slot before granting member access.';
begin
  if not exists (
    select 1 from public.organization_members
    where organization_id = target_org_id
      and user_id = auth.uid()
      and role = 'admin'
  ) then
    raise exception 'Only organization admins can change roles.';
  end if;

  perform 1
  from public.organizations o
  where o.id = target_org_id
  for update;

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

  if existing_role = 'guest'
     and target_role <> 'guest'
     and not public.check_org_limit(target_org_id, 'members') then
    raise exception '%', member_limit_message;
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

revoke all on function public.set_organization_member_role(uuid, uuid, public.organization_role) from public;
grant execute on function public.set_organization_member_role(uuid, uuid, public.organization_role) to authenticated;
