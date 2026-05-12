drop function if exists public.super_admin_get_customers(text, int, int);
drop function if exists public.super_admin_get_customers(text, text, int, int);
drop function if exists public.super_admin_get_customers(text, text, int, int, boolean);

create or replace function public.super_admin_get_customers(
  p_search text default null,
  p_plan text default null,
  p_limit int default 50,
  p_offset int default 0,
  p_include_internal_admins boolean default false
)
returns table(
  user_id uuid,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz,
  org_count bigint,
  is_internal_admin boolean,
  memberships jsonb,
  days_inactive int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_internal_admin();

  return query
    with clock as (
      select timezone('utc', now()) as now_at
    ),
    -- profiles
    --   -> search match + membership-aware tier filter
    --   -> page users
    --   -> hydrate ordered memberships for just that page
    paged_users as (
      select
        p.user_id,
        p.email,
        p.full_name,
        p.avatar_url,
        p.created_at,
        p.updated_at,
        coalesce(p.is_internal_admin, false) as is_internal_admin,
        clock.now_at
      from public.profiles p
      cross join clock
      where (p_include_internal_admins or not coalesce(p.is_internal_admin, false))
      and (
        p_search is null
        or p.email ilike '%' || p_search || '%'
        or p.full_name ilike '%' || p_search || '%'
      )
      and (
        p_plan is null
        or (
          p_plan = 'free'
          and not exists (
            select 1
            from public.organization_members om
            where om.user_id = p.user_id
          )
        )
        or exists (
          select 1
          from public.organization_members om
          join public.organizations o on o.id = om.organization_id
          join lateral public.get_org_effective_entitlements(o.id) ent on true
          where om.user_id = p.user_id
            and (
              case
                when ent.admin_grant_plan is not null
                  and ent.admin_grant_ends_at is null
                  and (
                    ent.admin_grant_is_active
                    or (
                      ent.plan in ('pro', 'enterprise')
                      and ent.plan_status in ('active', 'past_due')
                    )
                    or (
                      ent.plan in ('pro', 'enterprise')
                      and ent.plan_status = 'canceled'
                      and ent.plan_ends_at is not null
                      and ent.plan_ends_at > clock.now_at
                    )
                    or (
                      ent.admin_grant_starts_at is not null
                      and ent.admin_grant_starts_at > clock.now_at
                    )
                  )
                then 'vip'
                when ent.admin_grant_plan is not null
                  and ent.admin_grant_ends_at is not null
                  and ent.admin_grant_is_active
                then 'award'
                when ent.effective_plan in ('pro', 'enterprise')
                then 'pro'
                else 'free'
              end = p_plan
            )
        )
      )
      order by p.created_at desc
      limit p_limit offset p_offset
    ),
    membership_rows as (
      select
        paged_users.user_id,
        om.created_at as membership_created_at,
        o.created_at as org_created_at,
        o.id as org_id,
        jsonb_build_object(
          'org_id', o.id,
          'org_name', o.name,
          'org_slug', o.slug,
          'plan', ent.plan,
          'plan_status', ent.plan_status,
          'plan_ends_at', ent.plan_ends_at,
          'admin_grant_plan', ent.admin_grant_plan,
          'admin_grant_starts_at', ent.admin_grant_starts_at,
          'admin_grant_ends_at', ent.admin_grant_ends_at
        ) as membership
      from paged_users
      join public.organization_members om on om.user_id = paged_users.user_id
      join public.organizations o on o.id = om.organization_id
      join lateral public.get_org_effective_entitlements(o.id) ent on true
    )
    select
      paged_users.user_id,
      paged_users.email,
      paged_users.full_name,
      paged_users.avatar_url,
      paged_users.created_at,
      (select count(*) from public.organization_members om where om.user_id = paged_users.user_id),
      paged_users.is_internal_admin,
      coalesce(
        (
          select jsonb_agg(
            membership_rows.membership
            order by membership_rows.membership_created_at asc, membership_rows.org_created_at asc, membership_rows.org_id asc
          )
          from membership_rows
          where membership_rows.user_id = paged_users.user_id
        ),
        '[]'::jsonb
      ),
      extract(day from paged_users.now_at - paged_users.updated_at)::int
    from paged_users
    order by paged_users.created_at desc;
end;
$$;

revoke all on function public.super_admin_get_customers(text, text, int, int, boolean) from public;
grant execute on function public.super_admin_get_customers(text, text, int, int, boolean) to authenticated;
