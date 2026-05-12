-- Wiki page revision history: list, view, restore, and remove stored versions.

create or replace function public.list_wiki_page_versions(
  target_page_id uuid
)
returns table(
  id uuid,
  version integer,
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
  order by version_entry.version desc, version_entry.created_at desc;
$$;

revoke all on function public.list_wiki_page_versions(uuid) from public;
grant execute on function public.list_wiki_page_versions(uuid) to authenticated;

create or replace function public.get_wiki_page_version_content(
  target_page_id uuid,
  target_version_id uuid
)
returns table(
  id uuid,
  version integer,
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
    title,
    content_json,
    content_md,
    created_by_user_id
  )
  values (
    target_page_id,
    next_version,
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

create or replace function public.delete_wiki_page_version(
  target_page_id uuid,
  target_version_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  page_record public.wiki_pages%rowtype;
  target_version public.wiki_page_versions%rowtype;
begin
  select *
    into page_record
  from public.wiki_pages page
  where page.id = target_page_id
    and page.deleted_at is null;

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

  select *
    into target_version
  from public.wiki_page_versions version_entry
  where version_entry.id = target_version_id
    and version_entry.page_id = target_page_id;

  if target_version.id is null then
    raise exception 'WIKI_PAGE_VERSION_NOT_FOUND';
  end if;

  if target_version.version = page_record.version then
    raise exception 'Cannot delete the current version';
  end if;

  delete from public.wiki_page_versions
  where id = target_version_id;
end;
$$;

revoke all on function public.delete_wiki_page_version(uuid, uuid) from public;
grant execute on function public.delete_wiki_page_version(uuid, uuid) to authenticated;
