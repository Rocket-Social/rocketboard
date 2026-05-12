-- Track when a canceled subscription actually ends so the UI can show the effective-until date.
-- Populated by supabase/functions/stripe-webhook from Stripe's `cancel_at` (scheduled cancel)
-- or `current_period_end` (end-of-period cancel). Null means no cancellation scheduled.

alter table public.organizations
  add column if not exists plan_ends_at timestamptz null;

-- RPC signature changes: drop + recreate required (CREATE OR REPLACE can't alter return type).
drop function if exists public.get_org_billing_summary(uuid);

create or replace function public.get_org_billing_summary(p_org_id uuid)
returns table(
  plan text,
  plan_status text,
  billing_period text,
  plan_ends_at timestamptz,
  admin_grant_plan text,
  admin_grant_ends_at timestamptz,
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
      o.plan,
      o.plan_status,
      o.billing_period,
      o.plan_ends_at,
      o.admin_grant_plan,
      o.admin_grant_ends_at,
      o.limits,
      o.storage_used_bytes
    from public.organizations o
    where o.id = p_org_id;
end;
$$;

revoke all on function public.get_org_billing_summary(uuid) from public;
grant execute on function public.get_org_billing_summary(uuid) to authenticated;
