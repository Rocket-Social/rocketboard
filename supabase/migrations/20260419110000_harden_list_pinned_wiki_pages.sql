create or replace function public.list_pinned_pages_with_metadata(
  target_user_id uuid
)
returns table (
  page_id uuid,
  title text,
  slug text,
  full_path text,
  icon text,
  pin_position integer
)
language sql
stable
security definer
set search_path = public
as $$
  with recursive pinned as (
    select p.page_id, p.position
    from public.wiki_page_user_pins p
    where p.user_id = target_user_id
      and target_user_id = auth.uid()
  ),
  pinned_pages as (
    select
      wp.id,
      wp.title,
      wp.slug,
      wp.icon,
      wp.parent_page_id,
      pin.position as pin_position
    from pinned pin
    join public.wiki_pages wp on wp.id = pin.page_id
    where wp.deleted_at is null
      and (
        (wp.project_id is null and public.can_edit_organization(wp.organization_id, auth.uid()))
        or
        (wp.project_id is not null and public.can_access_project(wp.project_id))
      )
  ),
  ancestors as (
    select
      pp.id as pin_id,
      wp.id as ancestor_id,
      wp.slug as ancestor_slug,
      wp.parent_page_id,
      1 as depth
    from pinned_pages pp
    join public.wiki_pages wp on wp.id = pp.id
    where wp.deleted_at is null

    union all

    select
      a.pin_id,
      wp.id,
      wp.slug,
      wp.parent_page_id,
      a.depth + 1
    from ancestors a
    join public.wiki_pages wp on wp.id = a.parent_page_id
    where wp.deleted_at is null
      and a.depth < 10
  ),
  full_paths as (
    select
      a.pin_id,
      string_agg(a.ancestor_slug, '/' order by a.depth desc) as full_path
    from ancestors a
    group by a.pin_id
  )
  select
    pp.id as page_id,
    pp.title,
    pp.slug,
    coalesce(fp.full_path, pp.slug) as full_path,
    pp.icon,
    pp.pin_position
  from pinned_pages pp
  left join full_paths fp on fp.pin_id = pp.id
  order by pp.pin_position asc;
$$;
