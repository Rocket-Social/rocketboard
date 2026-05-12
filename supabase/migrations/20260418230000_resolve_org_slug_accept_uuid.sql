-- resolve_organization_slug: accept either a slug or a UUID.
--
-- Stripe Checkout and the Customer Portal capture their return URLs at
-- session-creation time. If we built those URLs with the mutable slug, an
-- org rename during the checkout window would land the customer on a dead
-- path (see the follow-up to PR #349). The edge functions now pass the
-- stable org UUID in the return URL; the app router resolves UUID paths
-- via this RPC and redirects to the canonical slug.
--
-- The canonical `core.sql` was updated in place for greenfield deploys —
-- this file replays the same definition so existing databases pick it up
-- through `supabase db push`. Identical `create or replace` body, idempotent.

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
    or (
      nullif(trim(target_org_slug), '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and org.id = nullif(trim(target_org_slug), '')::uuid
    )
  )
  limit 1;
$$;
