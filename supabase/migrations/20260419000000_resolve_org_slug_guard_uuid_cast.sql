-- P1 fix for #352: the previous `resolve_organization_slug` rewrite guarded
-- the ::uuid cast with a regex check across AND operands:
--
--     where ... or (regex ~ input and org.id = input::uuid)
--
-- Postgres does NOT guarantee short-circuit evaluation of AND. The planner
-- is free to evaluate the cast before it has proved the regex false, which
-- raises `invalid input syntax for type uuid` on every slug call (e.g.
-- "main-workspace"). Today's plan happens to short-circuit correctly, but
-- any plan change from new stats/indexes would break every slug lookup —
-- meaning every signed-in org route, not just billing.
--
-- Fix: move the cast inside a CASE expression, which evaluates THEN lazily
-- per SQL standard. Same semantics, guaranteed safe.
--
-- The canonical `core.sql` has been updated in place; this migration
-- replays the safe definition so existing databases pick it up via
-- `supabase db push`. `create or replace function` is idempotent.

create or replace function public.resolve_organization_slug(target_org_slug text)
returns table (
  id uuid,
  name text,
  slug text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    org.id,
    org.name,
    org.slug
  from public.organizations org
  join public.organization_members organization_member
    on organization_member.organization_id = org.id
   and organization_member.user_id = auth.uid()
  where (
    org.slug = nullif(trim(target_org_slug), '')
    or org.id = case
      when nullif(trim(target_org_slug), '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then nullif(trim(target_org_slug), '')::uuid
      else null
    end
  )
  limit 1;
$$;
