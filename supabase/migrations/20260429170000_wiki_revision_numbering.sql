-- Stable per-page revision label for wiki version history.
-- Until now the label rendered wiki_page_versions.version, which mirrors
-- wiki_pages.version (a monotonic save counter that includes every autosave).
-- The 10-min same-author coalescing path UPDATES the existing snapshot row
-- and bumps its version to match the live page, so a brand-new page that has
-- only ever produced one stored snapshot can show "v3" the first time the
-- user opens version history. Add revision_number, sequenced 1..N per page in
-- snapshot-insertion order, and surface it as the display label.

alter table public.wiki_page_versions
  add column if not exists revision_number integer;

update public.wiki_page_versions wpv
set revision_number = sub.rn
from (
  select id, row_number() over (
    partition by page_id
    order by created_at, version
  ) as rn
  from public.wiki_page_versions
) sub
where wpv.id = sub.id
  and wpv.revision_number is null;

alter table public.wiki_page_versions
  alter column revision_number set not null;

alter table public.wiki_page_versions
  drop constraint if exists wiki_page_versions_page_revision_key;

alter table public.wiki_page_versions
  add constraint wiki_page_versions_page_revision_key
  unique (page_id, revision_number);

create index if not exists wiki_page_versions_page_revision_idx
  on public.wiki_page_versions (page_id, revision_number desc);

-- update_wiki_page: assign a fresh revision_number on the insert path; keep
-- the existing one on the coalesce update path. The live wiki_pages.version
-- semantics are unchanged.
create or replace function public.update_wiki_page(
  target_page_id uuid,
  target_title text default null,
  target_content_json jsonb default null,
  target_content_md text default null,
  target_status text default null,
  target_parent_page_id uuid default null,
  target_position integer default null,
  target_icon text default null,
  expected_version integer default null
)
returns table(
  page_id uuid,
  page_title text,
  page_slug text,
  page_status text,
  page_version integer,
  page_updated_at timestamptz,
  version_entry_id uuid,
  version_entry_version integer,
  version_entry_created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  page_record public.wiki_pages%rowtype;
  new_version integer;
  new_slug text;
  version_id uuid;
  version_ts timestamptz;
  latest_version public.wiki_page_versions%rowtype;
  next_revision_number integer;
  normalized_title text;
  normalized_content_md text;
  revision_snapshot_window interval := interval '10 minutes';
begin
  select * into page_record
  from public.wiki_pages
  where id = target_page_id
    and deleted_at is null
  for update;

  if page_record is null then
    raise exception 'Page not found.';
  end if;

  if page_record.project_id is null then
    if not public.can_edit_organization(page_record.organization_id, current_user_id) then
      raise exception 'Not authorized to edit this page.';
    end if;
  else
    if not public.can_edit_project(page_record.project_id) then
      raise exception 'Not authorized to edit this page.';
    end if;
  end if;

  if expected_version is not null and page_record.version != expected_version then
    raise exception 'WIKI_PAGE_CONFLICT';
  end if;

  new_version := page_record.version + 1;
  normalized_title := coalesce(target_title, page_record.title);
  normalized_content_md := coalesce(target_content_md, '');

  if target_parent_page_id is not null and target_parent_page_id is distinct from page_record.parent_page_id then
    declare
      dest_parent public.wiki_pages%rowtype;
    begin
      select * into dest_parent
      from public.wiki_pages
      where id = target_parent_page_id and deleted_at is null;

      if dest_parent is null then
        raise exception 'Target parent page not found.';
      end if;

      if dest_parent.organization_id != page_record.organization_id
         or dest_parent.project_id is distinct from page_record.project_id then
        raise exception 'Cannot move page to a different scope.';
      end if;

      if exists (
        with recursive ancestors as (
          select dest_parent.parent_page_id as ancestor_id
          union all
          select wp.parent_page_id from public.wiki_pages wp
          join ancestors a on wp.id = a.ancestor_id
          where wp.parent_page_id is not null
        )
        select 1 from ancestors where ancestor_id = target_page_id
      ) then
        raise exception 'Cannot move page under its own descendant.';
      end if;
    end;
  end if;

  new_slug := page_record.slug;
  if target_title is not null and trim(target_title) != page_record.title then
    new_slug := public.generate_wiki_slug(
      coalesce(nullif(trim(target_title), ''), 'untitled'),
      page_record.organization_id,
      page_record.project_id,
      page_record.parent_page_id
    );
  end if;

  update public.wiki_pages set
    title = coalesce(target_title, title),
    slug = new_slug,
    content_json = coalesce(target_content_json, content_json),
    content_md = coalesce(target_content_md, content_md),
    status = coalesce(target_status, status),
    parent_page_id = coalesce(target_parent_page_id, parent_page_id),
    position = coalesce(target_position, position),
    icon = coalesce(target_icon, icon),
    version = new_version,
    updated_by_user_id = current_user_id
  where id = target_page_id;

  if target_content_json is not null then
    select *
      into latest_version
    from public.wiki_page_versions
    where wiki_page_versions.page_id = target_page_id
    order by wiki_page_versions.revision_number desc
    limit 1
    for update;

    if latest_version.id is not null
       and latest_version.created_by_user_id is not distinct from current_user_id
       and latest_version.created_at > now() - revision_snapshot_window then
      update public.wiki_page_versions set
        version = new_version,
        title = normalized_title,
        content_json = target_content_json,
        content_md = normalized_content_md,
        created_at = now(),
        created_by_user_id = current_user_id
      where id = latest_version.id
      returning wiki_page_versions.id, wiki_page_versions.version, wiki_page_versions.created_at
      into version_id, new_version, version_ts;
    else
      next_revision_number := coalesce(latest_version.revision_number, 0) + 1;
      insert into public.wiki_page_versions (
        page_id, version, revision_number, title, content_json, content_md, created_by_user_id
      ) values (
        target_page_id,
        new_version,
        next_revision_number,
        normalized_title,
        target_content_json,
        normalized_content_md,
        current_user_id
      )
      returning wiki_page_versions.id, wiki_page_versions.version, wiki_page_versions.created_at
      into version_id, new_version, version_ts;
    end if;
  end if;

  return query
  select
    target_page_id as page_id,
    normalized_title as page_title,
    new_slug as page_slug,
    coalesce(target_status, page_record.status) as page_status,
    new_version as page_version,
    now() as page_updated_at,
    version_id as version_entry_id,
    new_version as version_entry_version,
    coalesce(version_ts, now()) as version_entry_created_at;
end;
$$;

revoke all on function public.update_wiki_page(uuid, text, jsonb, text, text, uuid, integer, text, integer) from public;
grant execute on function public.update_wiki_page(uuid, text, jsonb, text, text, uuid, integer, text, integer) to authenticated;

-- list_wiki_page_versions: surface revision_number so the UI can render a
-- stable per-page label. Drop first because the return shape changes.
drop function if exists public.list_wiki_page_versions(uuid);
create or replace function public.list_wiki_page_versions(
  target_page_id uuid
)
returns table(
  id uuid,
  version integer,
  revision_number integer,
  title text,
  created_at timestamptz,
  author_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    version_entry.id,
    version_entry.version,
    version_entry.revision_number,
    version_entry.title,
    version_entry.created_at,
    coalesce(author.full_name, split_part(author.email, '@', 1), 'Unknown') as author_name
  from public.wiki_page_versions version_entry
  join public.wiki_pages page
    on page.id = version_entry.page_id
  left join public.profiles author
    on author.user_id = version_entry.created_by_user_id
  where version_entry.page_id = target_page_id
    and page.deleted_at is null
    and (
      (page.project_id is null and public.can_edit_organization(page.organization_id, auth.uid()))
      or
      (page.project_id is not null and public.can_access_project(page.project_id, auth.uid()))
    )
  order by version_entry.revision_number desc, version_entry.created_at desc;
$$;

revoke all on function public.list_wiki_page_versions(uuid) from public;
grant execute on function public.list_wiki_page_versions(uuid) to authenticated;

drop function if exists public.get_wiki_page_version_content(uuid, uuid);
create or replace function public.get_wiki_page_version_content(
  target_page_id uuid,
  target_version_id uuid
)
returns table(
  id uuid,
  version integer,
  revision_number integer,
  title text,
  content_md text,
  content_json jsonb,
  created_at timestamptz,
  author_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    version_entry.id,
    version_entry.version,
    version_entry.revision_number,
    version_entry.title,
    version_entry.content_md,
    public.coalesce_rich_text_document(version_entry.content_json, version_entry.content_md) as content_json,
    version_entry.created_at,
    coalesce(author.full_name, split_part(author.email, '@', 1), 'Unknown') as author_name
  from public.wiki_page_versions version_entry
  join public.wiki_pages page
    on page.id = version_entry.page_id
  left join public.profiles author
    on author.user_id = version_entry.created_by_user_id
  where version_entry.id = target_version_id
    and version_entry.page_id = target_page_id
    and page.deleted_at is null
    and (
      (page.project_id is null and public.can_edit_organization(page.organization_id, auth.uid()))
      or
      (page.project_id is not null and public.can_access_project(page.project_id, auth.uid()))
    );
$$;

revoke all on function public.get_wiki_page_version_content(uuid, uuid) from public;
grant execute on function public.get_wiki_page_version_content(uuid, uuid) to authenticated;

-- restore_wiki_page_version: the new snapshot it inserts gets a fresh
-- revision_number so it appears as the next stable label.
create or replace function public.restore_wiki_page_version(
  target_page_id uuid,
  target_version_id uuid,
  expected_version integer
)
returns table(
  page_id uuid,
  page_title text,
  page_slug text,
  page_status text,
  page_version integer,
  page_updated_at timestamptz,
  content_md text,
  content_json jsonb,
  version_entry_id uuid,
  version_entry_version integer,
  version_entry_title text,
  version_entry_created_at timestamptz,
  version_entry_author_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  page_record public.wiki_pages%rowtype;
  source_version public.wiki_page_versions%rowtype;
  created_version public.wiki_page_versions%rowtype;
  normalized_content_json jsonb;
  next_version integer;
  next_revision_number integer;
  base_slug text;
  final_slug text;
  counter integer := 1;
begin
  select *
    into page_record
  from public.wiki_pages page
  where page.id = target_page_id
    and page.deleted_at is null
  for update;

  if page_record.id is null then
    raise exception 'WIKI_PAGE_NOT_FOUND';
  end if;

  if page_record.project_id is null then
    if not public.can_edit_organization(page_record.organization_id, current_user_id) then
      raise exception 'WIKI_PAGE_ACCESS_DENIED';
    end if;
  else
    if not public.can_edit_project(page_record.project_id, current_user_id) then
      raise exception 'WIKI_PAGE_ACCESS_DENIED';
    end if;
  end if;

  if page_record.version <> expected_version then
    raise exception 'WIKI_PAGE_CONFLICT';
  end if;

  select *
    into source_version
  from public.wiki_page_versions version_entry
  where version_entry.id = target_version_id
    and version_entry.page_id = target_page_id;

  if source_version.id is null then
    raise exception 'WIKI_PAGE_VERSION_NOT_FOUND';
  end if;

  next_version := page_record.version + 1;
  normalized_content_json := public.coalesce_rich_text_document(source_version.content_json, source_version.content_md);

  select coalesce(max(revision_number), 0) + 1
    into next_revision_number
  from public.wiki_page_versions
  where page_id = target_page_id;

  base_slug := lower(trim(source_version.title));
  base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
  base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');

  if base_slug = '' or base_slug is null then
    base_slug := 'untitled';
  end if;

  base_slug := left(base_slug, 80);
  final_slug := base_slug;

  while exists (
    select 1
    from public.wiki_pages page
    where page.id <> target_page_id
      and page.organization_id = page_record.organization_id
      and page.project_id is not distinct from page_record.project_id
      and page.parent_page_id is not distinct from page_record.parent_page_id
      and page.slug = final_slug
  ) loop
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  end loop;

  update public.wiki_pages
  set
    title = source_version.title,
    slug = final_slug,
    content_md = source_version.content_md,
    content_json = normalized_content_json,
    version = next_version,
    updated_by_user_id = current_user_id
  where id = target_page_id
    and version = page_record.version;

  if not found then
    raise exception 'WIKI_PAGE_CONFLICT';
  end if;

  insert into public.wiki_page_versions (
    page_id,
    version,
    revision_number,
    title,
    content_json,
    content_md,
    created_by_user_id
  )
  values (
    target_page_id,
    next_version,
    next_revision_number,
    source_version.title,
    normalized_content_json,
    source_version.content_md,
    current_user_id
  )
  returning * into created_version;

  return query select
    target_page_id as page_id,
    source_version.title as page_title,
    final_slug as page_slug,
    page_record.status as page_status,
    next_version as page_version,
    timezone('utc', now()) as page_updated_at,
    source_version.content_md as content_md,
    normalized_content_json as content_json,
    created_version.id as version_entry_id,
    created_version.version as version_entry_version,
    created_version.title as version_entry_title,
    created_version.created_at as version_entry_created_at,
    (
      select coalesce(profile.full_name, split_part(profile.email, '@', 1), 'Unknown')
      from public.profiles profile
      where profile.user_id = created_version.created_by_user_id
    ) as version_entry_author_name;
end;
$$;

revoke all on function public.restore_wiki_page_version(uuid, uuid, integer) from public;
grant execute on function public.restore_wiki_page_version(uuid, uuid, integer) to authenticated;
