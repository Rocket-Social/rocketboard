-- Wiki revision history should capture meaningful edit sessions, not every autosave.
-- Keep frequent live autosaves, but coalesce same-author revision snapshots until
-- there has been a 10 minute quiet gap.

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
  normalized_title text;
  normalized_content_md text;
  revision_snapshot_window interval := interval '10 minutes';
begin
  -- Lock the page row.
  select * into page_record
  from public.wiki_pages
  where id = target_page_id
    and deleted_at is null
  for update;

  if page_record is null then
    raise exception 'Page not found.';
  end if;

  -- Auth check.
  if page_record.project_id is null then
    if not public.can_edit_organization(page_record.organization_id, current_user_id) then
      raise exception 'Not authorized to edit this page.';
    end if;
  else
    if not public.can_edit_project(page_record.project_id) then
      raise exception 'Not authorized to edit this page.';
    end if;
  end if;

  -- Version conflict check.
  if expected_version is not null and page_record.version != expected_version then
    raise exception 'WIKI_PAGE_CONFLICT';
  end if;

  new_version := page_record.version + 1;
  normalized_title := coalesce(target_title, page_record.title);
  normalized_content_md := coalesce(target_content_md, '');

  -- Scope validation: if reparenting, verify destination parent matches scope.
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

      -- Prevent cycles: target parent must not be a descendant of this page.
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

  -- Regenerate slug if title changed or parent changed.
  new_slug := page_record.slug;
  if target_title is not null and trim(target_title) != page_record.title then
    new_slug := public.generate_wiki_slug(
      coalesce(nullif(trim(target_title), ''), 'untitled'),
      page_record.organization_id,
      page_record.project_id,
      page_record.parent_page_id
    );
  end if;

  -- Update the live page on every save. This remains aggressive by design so
  -- users do not lose text, while the version entry below is conservative.
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

  -- Create or coalesce a durable revision entry only when content changed.
  if target_content_json is not null then
    select *
      into latest_version
    from public.wiki_page_versions
    where wiki_page_versions.page_id = target_page_id
    order by wiki_page_versions.version desc
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
      insert into public.wiki_page_versions (
        page_id, version, title, content_json, content_md, created_by_user_id
      ) values (
        target_page_id,
        new_version,
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
