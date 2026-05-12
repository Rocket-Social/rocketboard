-- Member-side "request an invite" flow + admin approval.
-- Members hit a dead-end on the org Access tab today (the invite form is
-- gated by canManage). This adds an active path: members file a request,
-- admins approve or decline from a Pending Requests sub-panel.
-- See docs/INVITE_UX_FIX_PLAN.md for the full plan.

create table public.invite_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  requested_role public.organization_role not null default 'member',
  requested_by_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  decline_reason text,
  decided_at timestamptz,
  decided_by_user_id uuid references auth.users(id) on delete set null,
  created_invitation_id uuid references public.invitations(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default timezone('utc', now()) + interval '7 days',
  constraint invite_requests_status_check
    check (status in ('pending', 'approved', 'declined', 'expired'))
);

-- Partial unique index: only one OPEN request per (org, email).
-- Declined / approved / expired rows do not block re-request.
create unique index invite_requests_pending_unique
  on public.invite_requests (organization_id, lower(email))
  where status = 'pending';

create index invite_requests_org_status_idx
  on public.invite_requests (organization_id, status, expires_at);

create index invite_requests_requester_idx
  on public.invite_requests (requested_by_user_id, created_at desc);

alter table public.invite_requests enable row level security;

create policy invite_requests_select_own_or_admin
  on public.invite_requests
  for select
  to authenticated
  using (
    requested_by_user_id = auth.uid()
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = invite_requests.organization_id
        and om.user_id = auth.uid()
        and om.role = 'admin'
    )
  );

create policy invite_requests_insert_own
  on public.invite_requests
  for insert
  to authenticated
  with check (
    requested_by_user_id = auth.uid()
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = invite_requests.organization_id
        and om.user_id = auth.uid()
    )
  );

revoke all on table public.invite_requests from public;
grant select, insert on table public.invite_requests to authenticated;

-- ─── create_invite_request ────────────────────────────────────────────────
create or replace function public.create_invite_request(
  target_org_id uuid,
  target_email text,
  target_role public.organization_role default 'member'
)
returns table(id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_email text := lower(trim(target_email));
  recent_request_count integer;
  created_request public.invite_requests%rowtype;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if normalized_email is null or normalized_email = '' then
    raise exception 'Email is required.';
  end if;

  -- Caller must be a member of the org (any role).
  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = target_org_id
      and om.user_id = current_user_id
  ) then
    raise exception 'You must be a member of this organization to request invites.';
  end if;

  -- Throttle: max 5 requests per requester per org per hour.
  select count(*) into recent_request_count
  from public.invite_requests
  where requested_by_user_id = current_user_id
    and organization_id = target_org_id
    and created_at > timezone('utc', now()) - interval '1 hour';

  if recent_request_count >= 5 then
    raise exception 'INVITE_REQUEST_RATE_LIMIT';
  end if;

  -- Already a member?
  if exists (
    select 1 from public.organization_members om
    join public.profiles p on p.user_id = om.user_id
    where om.organization_id = target_org_id
      and lower(p.email) = normalized_email
  ) then
    raise exception 'This person is already an organization member.';
  end if;

  -- Already has a pending org invitation?
  if exists (
    select 1 from public.invitations inv
    where inv.resource_type = 'organization'
      and inv.resource_id = target_org_id
      and lower(inv.email) = normalized_email
      and inv.accepted_at is null
      and inv.revoked_at is null
  ) then
    raise exception 'INVITE_ALREADY_PENDING';
  end if;

  insert into public.invite_requests (
    organization_id,
    email,
    requested_role,
    requested_by_user_id,
    status
  )
  values (
    target_org_id,
    normalized_email,
    target_role,
    current_user_id,
    'pending'
  )
  returning * into created_request;

  return query select created_request.id, created_request.status;
exception
  when unique_violation then
    raise exception 'INVITE_REQUEST_ALREADY_PENDING';
end;
$$;

revoke all on function public.create_invite_request(uuid, text, public.organization_role) from public;
grant execute on function public.create_invite_request(uuid, text, public.organization_role) to authenticated;

-- ─── list_invite_requests ─────────────────────────────────────────────────
create or replace function public.list_invite_requests(target_org_id uuid)
returns table(
  id uuid,
  email text,
  requested_role public.organization_role,
  requested_by_user_id uuid,
  requested_by_name text,
  requested_by_email text,
  status text,
  decline_reason text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    request.id,
    request.email,
    request.requested_role,
    request.requested_by_user_id,
    coalesce(requester.full_name, split_part(requester.email, '@', 1), 'Unknown') as requested_by_name,
    requester.email as requested_by_email,
    request.status,
    request.decline_reason,
    request.created_at,
    request.expires_at
  from public.invite_requests request
  left join public.profiles requester on requester.user_id = request.requested_by_user_id
  where request.organization_id = target_org_id
    and request.status = 'pending'
    and request.expires_at > timezone('utc', now())
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = target_org_id
        and om.user_id = auth.uid()
        and om.role = 'admin'
    )
  order by request.created_at desc;
$$;

revoke all on function public.list_invite_requests(uuid) from public;
grant execute on function public.list_invite_requests(uuid) to authenticated;

-- ─── approve_invite_request ───────────────────────────────────────────────
create or replace function public.approve_invite_request(target_request_id uuid)
returns table(invitation_id uuid, accept_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  request_row public.invite_requests%rowtype;
  v_invitation_id uuid;
  v_accept_token text;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select * into request_row
  from public.invite_requests
  where id = target_request_id
  for update;

  if request_row.id is null then
    raise exception 'INVITE_REQUEST_NOT_FOUND';
  end if;

  if request_row.status <> 'pending' then
    raise exception 'INVITE_REQUEST_NOT_PENDING';
  end if;

  if request_row.expires_at <= timezone('utc', now()) then
    raise exception 'INVITE_REQUEST_EXPIRED';
  end if;

  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = request_row.organization_id
      and om.user_id = current_user_id
      and om.role = 'admin'
  ) then
    raise exception 'Only organization admins can approve invite requests.';
  end if;

  -- Compose create_organization_invite for the actual seat/policy enforcement.
  select created_invite.id, created_invite.accept_token
    into v_invitation_id, v_accept_token
  from public.create_organization_invite(
    request_row.organization_id,
    request_row.email,
    request_row.requested_role,
    null
  ) created_invite;

  update public.invite_requests
  set status = 'approved',
      decided_at = timezone('utc', now()),
      decided_by_user_id = current_user_id,
      created_invitation_id = v_invitation_id
  where id = target_request_id;

  return query select v_invitation_id, v_accept_token;
end;
$$;

revoke all on function public.approve_invite_request(uuid) from public;
grant execute on function public.approve_invite_request(uuid) to authenticated;

-- ─── decline_invite_request ───────────────────────────────────────────────
create or replace function public.decline_invite_request(
  target_request_id uuid,
  target_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  request_row public.invite_requests%rowtype;
  trimmed_reason text := nullif(trim(coalesce(target_reason, '')), '');
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select * into request_row
  from public.invite_requests
  where id = target_request_id
  for update;

  if request_row.id is null then
    raise exception 'INVITE_REQUEST_NOT_FOUND';
  end if;

  if request_row.status <> 'pending' then
    raise exception 'INVITE_REQUEST_NOT_PENDING';
  end if;

  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = request_row.organization_id
      and om.user_id = current_user_id
      and om.role = 'admin'
  ) then
    raise exception 'Only organization admins can decline invite requests.';
  end if;

  update public.invite_requests
  set status = 'declined',
      decline_reason = trimmed_reason,
      decided_at = timezone('utc', now()),
      decided_by_user_id = current_user_id
  where id = target_request_id;
end;
$$;

revoke all on function public.decline_invite_request(uuid, text) from public;
grant execute on function public.decline_invite_request(uuid, text) to authenticated;
