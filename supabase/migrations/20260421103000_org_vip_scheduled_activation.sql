alter table public.organizations
  add column if not exists admin_grant_starts_at timestamptz null,
  add column if not exists vip_cancellation_managed boolean not null default false,
  add column if not exists vip_canceled_subscription_id text null;

alter table public.organizations
  drop constraint if exists organizations_admin_grant_schedule_check;

alter table public.organizations
  add constraint organizations_admin_grant_schedule_check
  check (
    admin_grant_starts_at is null
    or (
      admin_grant_plan is not null
      and admin_grant_ends_at is null
    )
  );

delete from public.award_invites
where award_type = 'org_vip_grant';

alter table public.award_invites
  drop constraint if exists award_invites_award_type_check;

alter table public.award_invites
  add constraint award_invites_award_type_check
  check (award_type in ('org_plan_credit'));

create or replace function public.get_plan_limits(p_plan text)
returns jsonb
language sql
stable
set search_path = public
as $$
  select case coalesce(p_plan, 'free')
    when 'pro' then '{"members":-1,"projects":-1,"workspaces":-1,"storage_mb":-1}'::jsonb
    when 'enterprise' then '{"members":-1,"projects":-1,"workspaces":-1,"storage_mb":-1}'::jsonb
    else '{"members":5,"projects":10,"workspaces":1,"storage_mb":1024}'::jsonb
  end;
$$;

revoke all on function public.get_plan_limits(text) from public;
grant execute on function public.get_plan_limits(text) to authenticated;

-- Grant activation flow:
-- paid + renewing
--   -> pending VIP (starts_at = plan_ends_at)
--   -> active VIP only after the paid term actually ends
--   -> revoke falls back to base billing truth
create or replace function public.get_org_effective_entitlements(p_org_id uuid)
returns table(
  plan text,
  plan_status text,
  billing_period text,
  plan_ends_at timestamptz,
  admin_grant_plan text,
  admin_grant_starts_at timestamptz,
  admin_grant_ends_at timestamptz,
  vip_cancellation_managed boolean,
  vip_canceled_subscription_id text,
  effective_plan text,
  effective_limits jsonb,
  admin_grant_is_active boolean,
  admin_grant_is_scheduled boolean,
  base_paid_term_active boolean,
  storage_used_bytes bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with clock as (
    select timezone('utc', now()) as now_at
  ),
  org as (
    select
      o.plan,
      o.plan_status,
      o.billing_period,
      o.plan_ends_at,
      o.admin_grant_plan,
      o.admin_grant_starts_at,
      o.admin_grant_ends_at,
      o.vip_cancellation_managed,
      o.vip_canceled_subscription_id,
      o.storage_used_bytes,
      clock.now_at
    from public.organizations o
    cross join clock
    where o.id = p_org_id
  ),
  evaluated as (
    select
      org.*,
      (
        org.plan in ('pro', 'enterprise')
        and org.plan_status in ('active', 'past_due')
      ) as base_paid_term_is_renewing,
      (
        org.plan in ('pro', 'enterprise')
        and (
          (
            org.plan_status in ('active', 'past_due')
          )
          or (
            org.plan_status = 'canceled'
            and org.plan_ends_at is not null
            and org.plan_ends_at > org.now_at
          )
        )
      ) as base_paid_term_active,
      (
        org.admin_grant_plan is not null
        and (org.admin_grant_starts_at is null or org.admin_grant_starts_at <= org.now_at)
        and (org.admin_grant_ends_at is null or org.admin_grant_ends_at > org.now_at)
      ) as admin_grant_window_open
    from org
  )
  select
    evaluated.plan,
    evaluated.plan_status,
    evaluated.billing_period,
    evaluated.plan_ends_at,
    evaluated.admin_grant_plan,
    evaluated.admin_grant_starts_at,
    evaluated.admin_grant_ends_at,
    coalesce(evaluated.vip_cancellation_managed, false) as vip_cancellation_managed,
    evaluated.vip_canceled_subscription_id,
    case
      when evaluated.admin_grant_plan is not null
        and evaluated.admin_grant_window_open
        and not (evaluated.admin_grant_starts_at is not null and evaluated.base_paid_term_active)
      then evaluated.admin_grant_plan
      else evaluated.plan
    end as effective_plan,
    case
      when evaluated.admin_grant_plan is not null
        and evaluated.admin_grant_window_open
        and not (evaluated.admin_grant_starts_at is not null and evaluated.base_paid_term_active)
      then public.get_plan_limits(evaluated.admin_grant_plan)
      else public.get_plan_limits(evaluated.plan)
    end as effective_limits,
    (
      evaluated.admin_grant_plan is not null
      and evaluated.admin_grant_window_open
      and not (evaluated.admin_grant_starts_at is not null and evaluated.base_paid_term_active)
    ) as admin_grant_is_active,
    (
      evaluated.admin_grant_plan is not null
      and evaluated.admin_grant_starts_at is not null
      and evaluated.admin_grant_starts_at > evaluated.now_at
      and (evaluated.admin_grant_ends_at is null or evaluated.admin_grant_ends_at > evaluated.now_at)
      and not evaluated.base_paid_term_is_renewing
    ) as admin_grant_is_scheduled,
    evaluated.base_paid_term_active,
    evaluated.storage_used_bytes
  from evaluated;
$$;

revoke all on function public.get_org_effective_entitlements(uuid) from public;
revoke all on function public.get_org_effective_entitlements(uuid) from authenticated;

create or replace function public.get_effective_plan(target_org_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select ent.effective_plan
  from public.get_org_effective_entitlements(target_org_id) ent;
$$;

revoke all on function public.get_effective_plan(uuid) from public;
revoke all on function public.get_effective_plan(uuid) from anon;
revoke all on function public.get_effective_plan(uuid) from authenticated;

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
      ent.storage_used_bytes,
      ent.effective_plan,
      ent.effective_limits
    from public.get_org_effective_entitlements(p_org_id) ent;
end;
$$;

revoke all on function public.get_org_usage(uuid) from public;
grant execute on function public.get_org_usage(uuid) to authenticated;

drop function if exists public.get_org_billing_summary(uuid);

create or replace function public.get_org_billing_summary(p_org_id uuid)
returns table(
  plan text,
  plan_status text,
  billing_period text,
  plan_ends_at timestamptz,
  admin_grant_plan text,
  admin_grant_ends_at timestamptz,
  effective_plan text,
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
      ent.plan,
      ent.plan_status,
      ent.billing_period,
      ent.plan_ends_at,
      ent.admin_grant_plan,
      ent.admin_grant_ends_at,
      ent.effective_plan,
      ent.effective_limits,
      ent.storage_used_bytes
    from public.get_org_effective_entitlements(p_org_id) ent;
end;
$$;

revoke all on function public.get_org_billing_summary(uuid) from public;
grant execute on function public.get_org_billing_summary(uuid) to authenticated;

drop function if exists public.get_org_billing_admin_snapshot(uuid);

create or replace function public.get_org_billing_admin_snapshot(p_org_id uuid)
returns table(
  has_billing_customer boolean,
  admin_grant_starts_at timestamptz,
  vip_cancellation_managed boolean,
  vip_canceled_subscription_id text
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
    select
      (o.stripe_customer_id is not null) as has_billing_customer,
      o.admin_grant_starts_at,
      coalesce(o.vip_cancellation_managed, false) as vip_cancellation_managed,
      o.vip_canceled_subscription_id
    from public.organizations o
    where o.id = p_org_id;
end;
$$;

revoke all on function public.get_org_billing_admin_snapshot(uuid) from public;
grant execute on function public.get_org_billing_admin_snapshot(uuid) to authenticated;

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
      return true;
  end case;

  return current_val < max_val;
end;
$$;

revoke all on function public.check_org_limit(uuid, text) from public;
grant execute on function public.check_org_limit(uuid, text) to authenticated;

create or replace function public.super_admin_grant_org_award(
  p_org_id uuid,
  p_months int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_internal_admin();

  update public.organizations
  set admin_grant_plan = 'pro',
      admin_grant_starts_at = null,
      admin_grant_ends_at = timezone('utc', now()) + (p_months || ' months')::interval,
      vip_cancellation_managed = false,
      vip_canceled_subscription_id = null,
      updated_at = timezone('utc', now())
  where id = p_org_id;

  insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, details)
  values (
    auth.uid(),
    'grant_award',
    'organization',
    p_org_id::text,
    jsonb_build_object('months', p_months)
  );

  return true;
end;
$$;

revoke all on function public.super_admin_grant_org_award(uuid, int) from public;
grant execute on function public.super_admin_grant_org_award(uuid, int) to authenticated;

create or replace function public.super_admin_grant_org_vip(p_org_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_internal_admin();

  raise exception 'VIP grants must be scheduled through the super-admin-org-vip edge function';
end;
$$;

revoke all on function public.super_admin_grant_org_vip(uuid) from public;
revoke all on function public.super_admin_grant_org_vip(uuid) from authenticated;

create or replace function public.super_admin_revoke_org_grant(p_org_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_grant_ends_at timestamptz;
  current_grant_plan text;
begin
  perform public.assert_internal_admin();

  select o.admin_grant_plan, o.admin_grant_ends_at
  into current_grant_plan, current_grant_ends_at
  from public.organizations o
  where o.id = p_org_id
  for update;

  if not found then
    raise exception 'Organization not found';
  end if;

  if current_grant_plan is not null and current_grant_ends_at is null then
    raise exception 'VIP grants must be revoked through the VIP admin flow';
  end if;

  update public.organizations
  set admin_grant_plan = null,
      admin_grant_starts_at = null,
      admin_grant_ends_at = null,
      vip_cancellation_managed = false,
      vip_canceled_subscription_id = null,
      updated_at = timezone('utc', now())
  where id = p_org_id;

  insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, details)
  values (auth.uid(), 'revoke_grant', 'organization', p_org_id::text, '{}'::jsonb);

  return true;
end;
$$;

revoke all on function public.super_admin_revoke_org_grant(uuid) from public;
grant execute on function public.super_admin_revoke_org_grant(uuid) to authenticated;

create or replace function public.super_admin_create_award_invite(
  p_award_type text,
  p_recipient_email text,
  p_plan text,
  p_credit_months int default null,
  p_reason text default '',
  p_custom_message text default null
)
returns table(invite_id uuid, token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  new_token text;
begin
  perform public.assert_internal_admin();

  if trim(coalesce(p_award_type, '')) <> 'org_plan_credit' then
    raise exception 'Only org_plan_credit invites are supported';
  end if;

  insert into public.award_invites (
    award_type,
    recipient_email,
    plan,
    credit_months,
    reason,
    custom_message,
    created_by_user_id
  )
  values (
    'org_plan_credit',
    lower(trim(p_recipient_email)),
    p_plan,
    p_credit_months,
    p_reason,
    p_custom_message,
    auth.uid()
  )
  returning id, accept_token into new_id, new_token;

  insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, details)
  values (
    auth.uid(),
    'create_award_invite',
    'award_invite',
    new_id::text,
    jsonb_build_object('award_type', 'org_plan_credit', 'recipient_email', p_recipient_email, 'plan', p_plan)
  );

  return query select new_id, new_token;
end;
$$;

revoke all on function public.super_admin_create_award_invite(text, text, text, int, text, text) from public;
grant execute on function public.super_admin_create_award_invite(text, text, text, int, text, text) to authenticated;

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

  if inv.award_type <> 'org_plan_credit' then
    return query select false, 'This invite type is no longer supported'::text, null::uuid;
    return;
  end if;

  if p_target_org_id is not null then
    if not public.can_manage_organization(p_target_org_id) then
      return query select false, 'You must be an admin of the target organization'::text, null::uuid;
      return;
    end if;
    resolved_org_id := p_target_org_id;
  else
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

  update public.organizations
  set admin_grant_plan = 'pro',
      admin_grant_starts_at = null,
      admin_grant_ends_at = timezone('utc', now()) + (coalesce(inv.credit_months, 1) || ' months')::interval,
      vip_cancellation_managed = false,
      vip_canceled_subscription_id = null,
      updated_at = timezone('utc', now())
  where id = resolved_org_id;

  update public.award_invites
  set status = 'accepted',
      accepted_by_user_id = current_user_id,
      accepted_at = timezone('utc', now()),
      target_org_id = resolved_org_id,
      updated_at = timezone('utc', now())
  where id = inv.id;

  insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, details)
  values (
    current_user_id,
    'accept_award',
    'award_invite',
    inv.id::text,
    jsonb_build_object('org_id', resolved_org_id, 'award_type', inv.award_type)
  );

  return query select true, null::text, resolved_org_id;
end;
$$;

revoke all on function public.accept_award_invite(text, uuid) from public;
grant execute on function public.accept_award_invite(text, uuid) to authenticated;

drop function if exists public.internal_admin_set_org_vip_grant(uuid, uuid, timestamptz, boolean, text);
drop function if exists public.internal_admin_set_org_vip_grant(uuid, uuid, timestamptz, boolean, text, boolean, text, text, text, timestamptz, text, text);

create or replace function public.internal_admin_set_org_vip_grant(
  p_org_id uuid,
  p_admin_user_id uuid,
  p_starts_at timestamptz default null,
  p_cancellation_managed boolean default false,
  p_canceled_subscription_id text default null,
  p_apply_billing_projection boolean default false,
  p_base_plan text default null,
  p_base_plan_status text default null,
  p_base_billing_period text default null,
  p_base_plan_ends_at timestamptz default null,
  p_base_stripe_customer_id text default null,
  p_base_stripe_subscription_id text default null
)
returns table(
  org_id uuid,
  admin_grant_starts_at timestamptz,
  cancellation_managed boolean,
  canceled_subscription_id text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_apply_billing_projection and (p_base_plan is null or p_base_plan_status is null) then
    raise exception 'Billing projection requires base plan and base plan status';
  end if;

  update public.organizations
  set admin_grant_plan = 'pro',
      admin_grant_starts_at = p_starts_at,
      admin_grant_ends_at = null,
      vip_cancellation_managed = coalesce(p_cancellation_managed, false),
      vip_canceled_subscription_id = p_canceled_subscription_id,
      plan = case
        when p_apply_billing_projection then p_base_plan
        else plan
      end,
      plan_status = case
        when p_apply_billing_projection then p_base_plan_status
        else plan_status
      end,
      billing_period = case
        when p_apply_billing_projection and p_base_billing_period is not null then p_base_billing_period
        else billing_period
      end,
      plan_ends_at = case
        when p_apply_billing_projection then p_base_plan_ends_at
        else plan_ends_at
      end,
      limits = case
        when p_apply_billing_projection then public.get_plan_limits(p_base_plan)
        else limits
      end,
      stripe_customer_id = case
        when p_apply_billing_projection and p_base_stripe_customer_id is not null then p_base_stripe_customer_id
        else stripe_customer_id
      end,
      stripe_subscription_id = case
        when p_apply_billing_projection then coalesce(p_base_stripe_subscription_id, stripe_subscription_id)
        else stripe_subscription_id
      end,
      updated_at = timezone('utc', now())
  where id = p_org_id;

  if not found then
    raise exception 'Organization not found';
  end if;

  insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, details)
  values (
    p_admin_user_id,
    'grant_vip',
    'organization',
    p_org_id::text,
    jsonb_build_object(
      'starts_at', p_starts_at,
      'cancellation_managed', coalesce(p_cancellation_managed, false),
      'canceled_subscription_id', p_canceled_subscription_id,
      'billing_projection_applied', p_apply_billing_projection,
      'base_plan', p_base_plan,
      'base_plan_status', p_base_plan_status,
      'base_plan_ends_at', p_base_plan_ends_at
    )
  );

  return query
    select
      o.id,
      o.admin_grant_starts_at,
      o.vip_cancellation_managed,
      o.vip_canceled_subscription_id
    from public.organizations o
    where o.id = p_org_id;
end;
$$;

revoke all on function public.internal_admin_set_org_vip_grant(uuid, uuid, timestamptz, boolean, text, boolean, text, text, text, timestamptz, text, text) from public;

drop function if exists public.internal_admin_revoke_org_vip_grant(uuid, uuid);
drop function if exists public.internal_admin_revoke_org_vip_grant(uuid, uuid, boolean, text, text, text, timestamptz, text, text);

create or replace function public.internal_admin_revoke_org_vip_grant(
  p_org_id uuid,
  p_admin_user_id uuid,
  p_apply_billing_projection boolean default false,
  p_base_plan text default null,
  p_base_plan_status text default null,
  p_base_billing_period text default null,
  p_base_plan_ends_at timestamptz default null,
  p_base_stripe_customer_id text default null,
  p_base_stripe_subscription_id text default null
)
returns table(
  org_id uuid,
  admin_grant_plan text,
  admin_grant_starts_at timestamptz,
  cancellation_managed boolean,
  canceled_subscription_id text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_apply_billing_projection and (p_base_plan is null or p_base_plan_status is null) then
    raise exception 'Billing projection requires base plan and base plan status';
  end if;

  update public.organizations
  set admin_grant_plan = null,
      admin_grant_starts_at = null,
      admin_grant_ends_at = null,
      vip_cancellation_managed = false,
      vip_canceled_subscription_id = null,
      plan = case
        when p_apply_billing_projection then p_base_plan
        else plan
      end,
      plan_status = case
        when p_apply_billing_projection then p_base_plan_status
        else plan_status
      end,
      billing_period = case
        when p_apply_billing_projection and p_base_billing_period is not null then p_base_billing_period
        else billing_period
      end,
      plan_ends_at = case
        when p_apply_billing_projection then p_base_plan_ends_at
        else plan_ends_at
      end,
      limits = case
        when p_apply_billing_projection then public.get_plan_limits(p_base_plan)
        else limits
      end,
      stripe_customer_id = case
        when p_apply_billing_projection and p_base_stripe_customer_id is not null then p_base_stripe_customer_id
        else stripe_customer_id
      end,
      stripe_subscription_id = case
        when p_apply_billing_projection then coalesce(p_base_stripe_subscription_id, stripe_subscription_id)
        else stripe_subscription_id
      end,
      updated_at = timezone('utc', now())
  where id = p_org_id;

  if not found then
    raise exception 'Organization not found';
  end if;

  insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, details)
  values (
    p_admin_user_id,
    'revoke_grant',
    'organization',
    p_org_id::text,
    jsonb_build_object(
      'grant_type', 'vip',
      'billing_projection_applied', p_apply_billing_projection,
      'base_plan', p_base_plan,
      'base_plan_status', p_base_plan_status,
      'base_plan_ends_at', p_base_plan_ends_at
    )
  );

  return query
    select
      o.id,
      o.admin_grant_plan,
      o.admin_grant_starts_at,
      o.vip_cancellation_managed,
      o.vip_canceled_subscription_id
    from public.organizations o
    where o.id = p_org_id;
end;
$$;

revoke all on function public.internal_admin_revoke_org_vip_grant(uuid, uuid, boolean, text, text, text, timestamptz, text, text) from public;

drop function if exists public.super_admin_get_organizations(text, int, int);

create or replace function public.super_admin_get_organizations(
  p_search text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table(
  org_id uuid,
  org_name text,
  org_slug text,
  member_count bigint,
  guest_count bigint,
  workspace_count bigint,
  plan text,
  plan_status text,
  plan_ends_at timestamptz,
  effective_plan text,
  admin_grant_plan text,
  admin_grant_starts_at timestamptz,
  admin_grant_ends_at timestamptz,
  admin_grant_is_active boolean,
  admin_grant_is_scheduled boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_internal_admin();

  return query
    select
      o.id,
      o.name,
      o.slug,
      (
        select count(*)
        from public.organization_members om
        where om.organization_id = o.id
          and om.role <> 'guest'
      ),
      (
        select count(*)
        from public.organization_members om
        where om.organization_id = o.id
          and om.role = 'guest'
      ),
      (select count(*) from public.workspaces w where w.organization_id = o.id),
      ent.plan,
      ent.plan_status,
      ent.plan_ends_at,
      ent.effective_plan,
      ent.admin_grant_plan,
      ent.admin_grant_starts_at,
      ent.admin_grant_ends_at,
      ent.admin_grant_is_active,
      ent.admin_grant_is_scheduled,
      o.created_at
    from public.organizations o
    join lateral public.get_org_effective_entitlements(o.id) ent on true
    where (
      p_search is null
      or o.name ilike '%' || p_search || '%'
      or o.slug ilike '%' || p_search || '%'
    )
    order by o.created_at desc
    limit p_limit offset p_offset;
end;
$$;

revoke all on function public.super_admin_get_organizations(text, int, int) from public;
grant execute on function public.super_admin_get_organizations(text, int, int) to authenticated;
