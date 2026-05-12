-- get_org_wiki_startup_snapshot was added via in-place edit to
-- 00000000000012_wiki.sql in PR #241 (commit 73cbeaf, 2026-04-11).
-- Baseline migrations are skipped by `supabase db push` on existing databases,
-- so prod never installed this RPC. The org wiki warmup path calls it first and
-- silently falls back to slower client-side hydration when the function is
-- missing, which keeps the regression easy to miss.
-- This dated migration installs the exact mainline definition so existing
-- databases converge with the frozen baseline.

create or replace function public.get_org_wiki_startup_snapshot(
  target_org_slug text,
  target_page_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_page_path text := nullif(regexp_replace(trim(coalesce(target_page_path, '')), '^/+|/+$', '', 'g'), '');
  resolved_page_id uuid;
  resolved_page_snapshot jsonb := null;
  organization_snapshot jsonb;
  pages_snapshot jsonb := '[]'::jsonb;
  recent_pages_snapshot jsonb := '[]'::jsonb;
  pinned_pages_snapshot jsonb := '[]'::jsonb;
  target_org public.organizations%rowtype;
begin
  if current_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select org.*
  into target_org
  from public.organizations org
  where org.slug = target_org_slug
    and public.can_edit_organization(org.id, current_user_id)
  limit 1;

  if target_org.id is null then
    return null;
  end if;

  organization_snapshot := jsonb_build_object(
    'id', target_org.id,
    'name', target_org.name,
    'slug', target_org.slug
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'createdAt', page.created_at,
        'createdByUserId', page.created_by_user_id,
        'deletedAt', page.deleted_at,
        'icon', page.icon,
        'id', page.id,
        'organizationId', page.organization_id,
        'ownerUserId', page.owner_user_id,
        'parentPageId', page.parent_page_id,
        'position', page.position,
        'projectId', page.project_id,
        'slug', page.slug,
        'status', page.status,
        'title', page.title,
        'updatedAt', page.updated_at,
        'updatedByUserId', page.updated_by_user_id,
        'verifiedAt', page.verified_at,
        'verifiedByUserId', page.verified_by_user_id,
        'version', page.version
      )
      order by page.position, page.created_at
    ),
    '[]'::jsonb
  )
  into pages_snapshot
  from public.wiki_pages page
  where page.organization_id = target_org.id
    and page.project_id is null
    and page.deleted_at is null;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'createdAt', page.created_at,
        'createdByUserId', page.created_by_user_id,
        'deletedAt', page.deleted_at,
        'icon', page.icon,
        'id', page.id,
        'organizationId', page.organization_id,
        'ownerUserId', page.owner_user_id,
        'parentPageId', page.parent_page_id,
        'position', page.position,
        'projectId', page.project_id,
        'slug', page.slug,
        'status', page.status,
        'title', page.title,
        'updatedAt', page.updated_at,
        'updatedByUserId', page.updated_by_user_id,
        'verifiedAt', page.verified_at,
        'verifiedByUserId', page.verified_by_user_id,
        'version', page.version
      )
      order by page.updated_at desc, page.created_at desc
    ),
    '[]'::jsonb
  )
  into recent_pages_snapshot
  from (
    select *
    from public.wiki_pages page
    where page.organization_id = target_org.id
      and page.project_id is null
      and page.deleted_at is null
    order by page.updated_at desc, page.created_at desc
    limit 15
  ) page;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'fullPath', pin.full_path,
        'icon', pin.icon,
        'pageId', pin.page_id,
        'pinPosition', pin.pin_position,
        'slug', pin.slug,
        'title', pin.title
      )
      order by pin.pin_position
    ),
    '[]'::jsonb
  )
  into pinned_pages_snapshot
  from public.list_pinned_pages_with_metadata(current_user_id) pin;

  if normalized_page_path is not null then
    with recursive page_paths as (
      select
        page.id,
        page.parent_page_id,
        page.slug,
        page.slug::text as full_path
      from public.wiki_pages page
      where page.organization_id = target_org.id
        and page.project_id is null
        and page.deleted_at is null
        and page.parent_page_id is null

      union all

      select
        child.id,
        child.parent_page_id,
        child.slug,
        page_paths.full_path || '/' || child.slug
      from public.wiki_pages child
      join page_paths on page_paths.id = child.parent_page_id
      where child.organization_id = target_org.id
        and child.project_id is null
        and child.deleted_at is null
    )
    select page_paths.id
    into resolved_page_id
    from page_paths
    where page_paths.full_path = normalized_page_path
    limit 1;
  end if;

  if resolved_page_id is not null then
    select jsonb_build_object(
      'contentJson', page.content_json,
      'contentMd', page.content_md,
      'createdAt', page.created_at,
      'createdByUserId', page.created_by_user_id,
      'deletedAt', page.deleted_at,
      'icon', page.icon,
      'id', page.id,
      'organizationId', page.organization_id,
      'ownerUserId', page.owner_user_id,
      'parentPageId', page.parent_page_id,
      'position', page.position,
      'projectId', page.project_id,
      'slug', page.slug,
      'status', page.status,
      'title', page.title,
      'updatedAt', page.updated_at,
      'updatedByUserId', page.updated_by_user_id,
      'verifiedAt', page.verified_at,
      'verifiedByUserId', page.verified_by_user_id,
      'version', page.version
    )
    into resolved_page_snapshot
    from public.wiki_pages page
    where page.id = resolved_page_id
      and page.deleted_at is null;
  end if;

  return jsonb_build_object(
    'organization', organization_snapshot,
    'page', resolved_page_snapshot,
    'pageFound', normalized_page_path is null or resolved_page_id is not null,
    'pages', pages_snapshot,
    'pinnedPages', pinned_pages_snapshot,
    'recentPages', recent_pages_snapshot,
    'resolvedPageId', resolved_page_id
  );
end;
$$;

revoke all on function public.get_org_wiki_startup_snapshot(text, text) from public;

grant execute on function public.get_org_wiki_startup_snapshot(text, text) to authenticated;
