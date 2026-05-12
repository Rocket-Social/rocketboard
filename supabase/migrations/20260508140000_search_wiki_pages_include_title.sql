-- search_wiki_pages: include `title` in the FTS so pages with empty bodies
-- (or titles that don't repeat in body) are still findable. Pre-existing
-- behavior only indexed content_md, so titles like "Employee Handbook"
-- with empty bodies returned 0 hits regardless of query.
--
-- Three changes:
-- 1. WHERE clause OR's title into the tsvector.
-- 2. ts_rank uses combined title+body tsvector.
-- 3. content_snippet falls back to the title when body is empty.
--
-- Function signature is unchanged; this is a CREATE OR REPLACE only.

create or replace function public.search_wiki_pages(
  target_org_id uuid,
  query_text text,
  max_results integer default 20
)
returns table(
  id uuid,
  title text,
  slug text,
  full_path text,
  parent_page_id uuid,
  project_id uuid,
  status text,
  content_snippet text,
  rank real,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  tsquery_val tsquery;
begin
  if not public.can_edit_organization(target_org_id, current_user_id) then
    raise exception 'Not authorized.';
  end if;

  tsquery_val := plainto_tsquery('english', query_text);

  return query
  with recursive search_hits as (
    select
      page.id,
      page.title,
      page.slug,
      page.parent_page_id,
      page.project_id,
      page.status,
      case
        when length(coalesce(page.content_md, '')) = 0 then page.title
        else ts_headline('english', page.content_md, tsquery_val,
          'MaxWords=30, MinWords=15, StartSel=' || chr(1) || ', StopSel=' || chr(2))
      end as content_snippet,
      ts_rank(
        to_tsvector('english', coalesce(page.title, '') || ' ' || coalesce(page.content_md, '')),
        tsquery_val
      ) as rank,
      page.updated_at
    from public.wiki_pages page
    where page.organization_id = target_org_id
      and page.deleted_at is null
      and to_tsvector('english', coalesce(page.title, '') || ' ' || coalesce(page.content_md, '')) @@ tsquery_val
      and (
        page.project_id is null
        or public.can_access_project(page.project_id)
      )
    order by rank desc
    limit max_results
  ),
  ancestors as (
    select
      sh.id as hit_id,
      wp.id as ancestor_id,
      wp.slug as ancestor_slug,
      wp.parent_page_id,
      1 as depth
    from search_hits sh
    join public.wiki_pages wp on wp.id = sh.id

    union all

    select
      a.hit_id,
      wp.id,
      wp.slug,
      wp.parent_page_id,
      a.depth + 1
    from ancestors a
    join public.wiki_pages wp on wp.id = a.parent_page_id
    where a.depth < 10
  ),
  full_paths as (
    select
      a.hit_id,
      string_agg(a.ancestor_slug, '/' order by a.depth desc) as full_path
    from ancestors a
    group by a.hit_id
  )
  select
    sh.id,
    sh.title,
    sh.slug,
    coalesce(fp.full_path, sh.slug) as full_path,
    sh.parent_page_id,
    sh.project_id,
    sh.status,
    sh.content_snippet,
    sh.rank,
    sh.updated_at
  from search_hits sh
  left join full_paths fp on fp.hit_id = sh.id
  order by sh.rank desc, sh.updated_at desc;
end;
$$;
