-- Wiki: pages, versions, comments, pins, attachments, RPCs.
-- Canonical greenfield owner file. Modify in place.

-- ── Helper: can_edit_organization (admin + member, excludes guests) ──

create or replace function public.can_edit_organization(
  target_org_id uuid,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members organization_member
    where organization_member.organization_id = target_org_id
      and organization_member.user_id = target_user_id
      and organization_member.role in ('admin', 'member')
  );
$$;

grant execute on function public.can_edit_organization(uuid, uuid) to authenticated, service_role;

-- ── Tables ──────────────────────────────────────────────────────────

create table public.wiki_pages (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  project_id          uuid references public.projects (id) on delete cascade,
  parent_page_id      uuid references public.wiki_pages (id) on delete cascade,
  title               text not null default '',
  slug                text not null,
  icon                text,
  content_json        jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  content_md          text not null default '',
  status              text not null default 'draft'
                      check (status in ('draft', 'published', 'needs_review', 'archived')),
  verified_at         timestamptz,
  verified_by_user_id uuid references auth.users (id) on delete set null,
  owner_user_id       uuid references auth.users (id) on delete set null,
  position            integer not null default 0,
  version             integer not null default 1,
  created_by_user_id  uuid not null references auth.users (id) on delete restrict,
  updated_by_user_id  uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default timezone('utc', now()),
  updated_at          timestamptz not null default timezone('utc', now()),
  deleted_at          timestamptz,
  deleted_batch_id    uuid,
  constraint wiki_pages_version_positive check (version >= 1)
);

create table public.wiki_page_versions (
  id                  uuid primary key default gen_random_uuid(),
  page_id             uuid not null references public.wiki_pages (id) on delete cascade,
  version             integer not null,
  title               text not null,
  content_json        jsonb not null,
  content_md          text not null default '',
  created_by_user_id  uuid not null references auth.users (id) on delete restrict,
  created_at          timestamptz not null default timezone('utc', now()),
  constraint wiki_page_versions_page_version_key unique (page_id, version)
);

create table public.wiki_page_comments (
  id                  uuid primary key default gen_random_uuid(),
  page_id             uuid not null references public.wiki_pages (id) on delete cascade,
  body_text           text not null,
  created_by_user_id  uuid not null references auth.users (id) on delete restrict,
  created_at          timestamptz not null default timezone('utc', now())
);

create table public.wiki_page_user_pins (
  page_id             uuid not null references public.wiki_pages (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  position            integer not null default 0,
  created_at          timestamptz not null default timezone('utc', now()),
  primary key (page_id, user_id),
  constraint wiki_page_user_pins_position_range
    check (position >= 0 and position < 5)
);

create table public.wiki_page_shares (
  id                  uuid primary key default gen_random_uuid(),
  page_id             uuid not null unique references public.wiki_pages (id) on delete cascade,
  share_token         text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_by_user_id  uuid not null references auth.users (id) on delete restrict,
  created_at          timestamptz not null default timezone('utc', now()),
  revoked_at          timestamptz
);

-- ── Indexes ─────────────────────────────────────────────────────────

create index wiki_pages_org_tree_idx
  on public.wiki_pages (organization_id, parent_page_id, position)
  where deleted_at is null;

create unique index wiki_pages_slug_unique
  on public.wiki_pages (organization_id, project_id, parent_page_id, slug)
  nulls not distinct
  where deleted_at is null;

create index wiki_pages_project_idx
  on public.wiki_pages (project_id, parent_page_id, position)
  where project_id is not null and deleted_at is null;

create index wiki_pages_content_search_idx
  on public.wiki_pages using gin (to_tsvector('english', content_md));

create index wiki_page_versions_page_id_idx
  on public.wiki_page_versions (page_id, version desc);

create index wiki_page_comments_page_id_idx
  on public.wiki_page_comments (page_id, created_at);

create index wiki_page_user_pins_user_id_idx
  on public.wiki_page_user_pins (user_id, position);

create index wiki_page_shares_token_active_idx
  on public.wiki_page_shares (share_token)
  where revoked_at is null;

-- ── Triggers ────────────────────────────────────────────────────────

create trigger wiki_pages_set_updated_at
  before update on public.wiki_pages
  for each row execute function public.set_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────

alter table public.wiki_pages enable row level security;
alter table public.wiki_page_versions enable row level security;
alter table public.wiki_page_comments enable row level security;
alter table public.wiki_page_user_pins enable row level security;
alter table public.wiki_page_shares enable row level security;

alter table public.wiki_pages replica identity full;
alter table public.wiki_page_comments replica identity full;

-- Wiki pages: org wiki = admin+member only, project pages = project access
create policy wiki_pages_select on public.wiki_pages
  for select to authenticated
  using (
    (project_id is null and can_edit_organization(organization_id))
    or
    (project_id is not null and can_access_project(project_id))
  );

create policy wiki_pages_insert on public.wiki_pages
  for insert to authenticated
  with check (
    (project_id is null and can_edit_organization(organization_id))
    or
    (project_id is not null and can_edit_project(project_id))
  );

create policy wiki_pages_update on public.wiki_pages
  for update to authenticated
  using (
    (project_id is null and can_edit_organization(organization_id))
    or
    (project_id is not null and can_edit_project(project_id))
  );

-- Soft-delete is the path for standalone wiki-page deletes (via
-- delete_wiki_page RPC). Raw deletes are allowed only for project-scoped
-- pages by someone who can edit the project — this is exactly the case
-- hit when delete_project cascades via FK. Org-scoped wiki pages
-- (project_id is null) still have no raw-delete path.
create policy wiki_pages_delete on public.wiki_pages
  for delete to authenticated
  using (
    project_id is not null and public.can_edit_project(project_id)
  );

-- Versions: follow parent page access
create policy wiki_page_versions_select on public.wiki_page_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.wiki_pages page
      where page.id = wiki_page_versions.page_id
        and (
          (page.project_id is null and can_edit_organization(page.organization_id))
          or
          (page.project_id is not null and can_access_project(page.project_id))
        )
    )
  );

create policy wiki_page_versions_insert on public.wiki_page_versions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.wiki_pages page
      where page.id = wiki_page_versions.page_id
        and (
          (page.project_id is null and can_edit_organization(page.organization_id))
          or
          (page.project_id is not null and can_edit_project(page.project_id))
        )
    )
  );

-- Comments: follow parent page access
create policy wiki_page_comments_select on public.wiki_page_comments
  for select to authenticated
  using (
    exists (
      select 1 from public.wiki_pages page
      where page.id = wiki_page_comments.page_id
        and (
          (page.project_id is null and can_edit_organization(page.organization_id))
          or
          (page.project_id is not null and can_access_project(page.project_id))
        )
    )
  );

create policy wiki_page_comments_insert on public.wiki_page_comments
  for insert to authenticated
  with check (
    exists (
      select 1 from public.wiki_pages page
      where page.id = wiki_page_comments.page_id
        and (
          (page.project_id is null and can_edit_organization(page.organization_id))
          or
          (page.project_id is not null and can_access_project(page.project_id))
        )
    )
  );

-- Pins: user can manage their own pins for pages they can access
create policy wiki_page_user_pins_select on public.wiki_page_user_pins
  for select to authenticated
  using (user_id = auth.uid());

create policy wiki_page_user_pins_insert on public.wiki_page_user_pins
  for insert to authenticated
  with check (user_id = auth.uid());

create policy wiki_page_user_pins_delete on public.wiki_page_user_pins
  for delete to authenticated
  using (user_id = auth.uid());

create policy wiki_page_shares_select on public.wiki_page_shares
  for select to authenticated
  using (
    exists (
      select 1 from public.wiki_pages page
      where page.id = wiki_page_shares.page_id
        and (
          (page.project_id is null and can_edit_organization(page.organization_id))
          or
          (page.project_id is not null and can_access_project(page.project_id))
        )
    )
  );

create policy wiki_page_shares_insert on public.wiki_page_shares
  for insert to authenticated
  with check (
    exists (
      select 1 from public.wiki_pages page
      where page.id = wiki_page_shares.page_id
        and (
          (page.project_id is null and can_edit_organization(page.organization_id))
          or
          (page.project_id is not null and can_edit_project(page.project_id))
        )
    )
  );

create policy wiki_page_shares_update on public.wiki_page_shares
  for update to authenticated
  using (
    exists (
      select 1 from public.wiki_pages page
      where page.id = wiki_page_shares.page_id
        and (
          (page.project_id is null and can_edit_organization(page.organization_id))
          or
          (page.project_id is not null and can_edit_project(page.project_id))
        )
    )
  );

-- ── Slug helper ─────────────────────────────────────────────────────

create or replace function public.generate_wiki_slug(
  target_title text,
  target_org_id uuid,
  target_project_id uuid,
  target_parent_id uuid
)
returns text
language plpgsql
as $$
declare
  base_slug text;
  final_slug text;
  counter integer := 1;
begin
  -- Convert title to slug: lowercase, replace non-alphanumeric with hyphens, trim
  base_slug := lower(trim(target_title));
  base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
  base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');

  if base_slug = '' or base_slug is null then
    base_slug := 'untitled';
  end if;

  -- Truncate to 80 chars
  base_slug := left(base_slug, 80);

  final_slug := base_slug;

  -- Check uniqueness within (org, project, parent) scope, append counter if needed.
  -- Deleted pages still retain their slug via the table-level unique constraint, so
  -- generation must consider soft-deleted rows too or inserts can hit a 409 conflict.
  while exists (
    select 1 from public.wiki_pages
    where organization_id = target_org_id
      and project_id is not distinct from target_project_id
      and parent_page_id is not distinct from target_parent_id
      and slug = final_slug
  ) loop
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  end loop;

  return final_slug;
end;
$$;

-- ── RPCs ────────────────────────────────────────────────────────────

-- Create a new wiki page
create or replace function public.create_wiki_page(
  target_org_id uuid,
  target_project_id uuid default null,
  target_parent_page_id uuid default null,
  target_title text default ''
)
returns table(
  id uuid,
  organization_id uuid,
  project_id uuid,
  parent_page_id uuid,
  title text,
  slug text,
  icon text,
  status text,
  "position" integer,
  version integer,
  owner_user_id uuid,
  created_by_user_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  generated_slug text;
  new_position integer;
  parent_org_id uuid;
  parent_project_id uuid;
begin
  -- Auth: must be admin or member
  if not public.can_edit_organization(target_org_id, current_user_id) then
    raise exception 'Not authorized to create wiki pages in this organization.';
  end if;

  -- Integrity: if project_id provided, verify it belongs to the org
  if target_project_id is not null then
    if not exists (
      select 1 from public.projects p
      join public.workspaces w on w.id = p.workspace_id
      where p.id = target_project_id
        and w.organization_id = target_org_id
    ) then
      raise exception 'Project does not belong to this organization.';
    end if;

    -- Project pages also require project edit access
    if not public.can_edit_project(target_project_id, current_user_id) then
      raise exception 'Not authorized to create pages in this project.';
    end if;
  end if;

  -- Integrity: if parent provided, verify scope match
  if target_parent_page_id is not null then
    select wp.organization_id, wp.project_id
    into parent_org_id, parent_project_id
    from public.wiki_pages wp
    where wp.id = target_parent_page_id
      and wp.deleted_at is null;

    if parent_org_id is null then
      raise exception 'Parent page not found.';
    end if;

    if parent_org_id != target_org_id then
      raise exception 'Parent page belongs to a different organization.';
    end if;

    if parent_project_id is distinct from target_project_id then
      raise exception 'Parent page scope does not match.';
    end if;
  end if;

  -- Generate slug
  generated_slug := public.generate_wiki_slug(
    coalesce(nullif(trim(target_title), ''), 'untitled'),
    target_org_id,
    target_project_id,
    target_parent_page_id
  );

  -- Calculate position (append to end)
  select coalesce(max(wp.position), -1) + 1
  into new_position
  from public.wiki_pages wp
  where wp.organization_id = target_org_id
    and wp.project_id is not distinct from target_project_id
    and wp.parent_page_id is not distinct from target_parent_page_id
    and wp.deleted_at is null;

  return query
  insert into public.wiki_pages (
    organization_id,
    project_id,
    parent_page_id,
    title,
    slug,
    position,
    owner_user_id,
    created_by_user_id,
    updated_by_user_id
  ) values (
    target_org_id,
    target_project_id,
    target_parent_page_id,
    coalesce(nullif(trim(target_title), ''), ''),
    generated_slug,
    new_position,
    current_user_id,
    current_user_id,
    current_user_id
  )
  returning
    wiki_pages.id,
    wiki_pages.organization_id,
    wiki_pages.project_id,
    wiki_pages.parent_page_id,
    wiki_pages.title,
    wiki_pages.slug,
    wiki_pages.icon,
    wiki_pages.status,
    wiki_pages.position,
    wiki_pages.version,
    wiki_pages.owner_user_id,
    wiki_pages.created_by_user_id,
    wiki_pages.created_at,
    wiki_pages.updated_at;
end;
$$;

-- Update a wiki page (content, title, status, position, parent)
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
  page_record public.wiki_pages;
  new_version integer;
  new_slug text;
  version_id uuid;
  version_ts timestamptz;
begin
  -- Lock the page row
  select * into page_record
  from public.wiki_pages
  where id = target_page_id
    and deleted_at is null
  for update;

  if page_record is null then
    raise exception 'Page not found.';
  end if;

  -- Auth check
  if page_record.project_id is null then
    if not public.can_edit_organization(page_record.organization_id, current_user_id) then
      raise exception 'Not authorized to edit this page.';
    end if;
  else
    if not public.can_edit_project(page_record.project_id, current_user_id) then
      raise exception 'Not authorized to edit this page.';
    end if;
  end if;

  -- Version conflict check
  if expected_version is not null and page_record.version != expected_version then
    raise exception 'WIKI_PAGE_CONFLICT';
  end if;

  new_version := page_record.version + 1;

  -- Scope validation: if reparenting, verify destination parent matches scope
  if target_parent_page_id is not null and target_parent_page_id is distinct from page_record.parent_page_id then
    declare
      dest_parent public.wiki_pages;
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

      -- Prevent cycles: target parent must not be a descendant of this page
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

  -- Regenerate slug if title changed or parent changed
  new_slug := page_record.slug;
  if target_title is not null and trim(target_title) != page_record.title then
    new_slug := public.generate_wiki_slug(
      coalesce(nullif(trim(target_title), ''), 'untitled'),
      page_record.organization_id,
      page_record.project_id,
      page_record.parent_page_id
    );
  end if;

  -- Update the page
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

  -- Create version entry (only if content changed)
  if target_content_json is not null then
    insert into public.wiki_page_versions (
      page_id, version, title, content_json, content_md,  created_by_user_id
    ) values (
      target_page_id,
      new_version,
      coalesce(target_title, page_record.title),
      target_content_json,
      coalesce(target_content_md, ''),
      current_user_id
    )
    returning wiki_page_versions.id, wiki_page_versions.version, wiki_page_versions.created_at
    into version_id, new_version, version_ts;
  end if;

  return query
  select
    target_page_id as page_id,
    coalesce(target_title, page_record.title) as page_title,
    new_slug as page_slug,
    coalesce(target_status, page_record.status) as page_status,
    new_version as page_version,
    now() as page_updated_at,
    version_id as version_entry_id,
    new_version as version_entry_version,
    coalesce(version_ts, now()) as version_entry_created_at;
end;
$$;

-- Soft-delete a wiki page with cascade to children
create or replace function public.delete_wiki_page(
  target_page_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  page_record public.wiki_pages;
  batch_id uuid := gen_random_uuid();
  now_ts timestamptz := timezone('utc', now());
begin
  select * into page_record
  from public.wiki_pages
  where id = target_page_id
    and deleted_at is null;

  if page_record is null then
    raise exception 'Page not found.';
  end if;

  -- Auth check
  if page_record.project_id is null then
    if not public.can_edit_organization(page_record.organization_id, current_user_id) then
      raise exception 'Not authorized to delete this page.';
    end if;
  else
    if not public.can_edit_project(page_record.project_id, current_user_id) then
      raise exception 'Not authorized to delete this page.';
    end if;
  end if;

  -- Cascade soft-delete: page + all descendants (cycle-safe)
  with recursive descendants as (
    select id, 1 as depth from public.wiki_pages where id = target_page_id and deleted_at is null
    union all
    select child.id, parent.depth + 1 from public.wiki_pages child
    join descendants parent on child.parent_page_id = parent.id
    where child.deleted_at is null and parent.depth < 100
  )
  update public.wiki_pages
  set deleted_at = now_ts,
      deleted_batch_id = batch_id
  where id in (select id from descendants);
end;
$$;

-- Restore a soft-deleted wiki page and its cascade-deleted children
create or replace function public.restore_wiki_page(
  target_page_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  page_record public.wiki_pages;
  restore_row record;
begin
  select * into page_record
  from public.wiki_pages
  where id = target_page_id
    and deleted_at is not null;

  if page_record is null then
    raise exception 'Page not found or not deleted.';
  end if;

  -- Auth check
  if page_record.project_id is null then
    if not public.can_edit_organization(page_record.organization_id, current_user_id) then
      raise exception 'Not authorized to restore this page.';
    end if;
  else
    if not public.can_edit_project(page_record.project_id, current_user_id) then
      raise exception 'Not authorized to restore this page.';
    end if;
  end if;

  -- Restore page + all children with same batch ID
  if page_record.deleted_batch_id is not null then
    for restore_row in
      with recursive descendants as (
        select wp.id, 1 as depth
        from public.wiki_pages wp
        where wp.id = target_page_id

        union all

        select child.id, parent.depth + 1
        from public.wiki_pages child
        join descendants parent on child.parent_page_id = parent.id
        where child.deleted_batch_id = page_record.deleted_batch_id
          and child.deleted_at is not null
          and parent.depth < 100
      )
      select
        wp.id,
        wp.organization_id,
        wp.project_id,
        wp.parent_page_id,
        wp.slug
      from descendants
      join public.wiki_pages wp on wp.id = descendants.id
      where wp.deleted_at is not null
      order by descendants.depth asc, wp.position asc, wp.created_at asc
    loop
      update public.wiki_pages
      set deleted_at = null,
          deleted_batch_id = null,
          slug = public.generate_wiki_slug(
            coalesce(nullif(trim(restore_row.slug), ''), 'untitled'),
            restore_row.organization_id,
            restore_row.project_id,
            restore_row.parent_page_id
          )
      where id = restore_row.id;
    end loop;
  else
    -- Single page delete (no batch)
    update public.wiki_pages
    set deleted_at = null,
        deleted_batch_id = null,
        slug = public.generate_wiki_slug(
          coalesce(nullif(trim(page_record.slug), ''), 'untitled'),
          page_record.organization_id,
          page_record.project_id,
          page_record.parent_page_id
        )
    where id = target_page_id;
  end if;
end;
$$;

create or replace function public.get_wiki_share_snapshot(
  target_page_id uuid
)
returns table(share_token text, created_at timestamptz, revoked_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  page_record public.wiki_pages;
begin
  select * into page_record
  from public.wiki_pages
  where id = target_page_id
    and deleted_at is null;

  if page_record is null then
    raise exception 'Page not found.';
  end if;

  if page_record.project_id is null then
    if not public.can_edit_organization(page_record.organization_id) then
      raise exception 'Permission denied.';
    end if;
  else
    if not public.can_access_project(page_record.project_id) then
      raise exception 'Permission denied.';
    end if;
  end if;

  return query
    select
      share.share_token,
      share.created_at,
      share.revoked_at
    from public.wiki_page_shares share
    where share.page_id = target_page_id
      and share.revoked_at is null;
end;
$$;

create or replace function public.create_wiki_share_link(
  target_page_id uuid
)
returns table(share_token text, created_at timestamptz, revoked_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  page_record public.wiki_pages;
begin
  select * into page_record
  from public.wiki_pages
  where id = target_page_id
    and deleted_at is null;

  if page_record is null then
    raise exception 'Page not found.';
  end if;

  if page_record.project_id is null then
    if not public.can_edit_organization(page_record.organization_id, current_user_id) then
      raise exception 'Permission denied.';
    end if;
  else
    if not public.can_edit_project(page_record.project_id, current_user_id) then
      raise exception 'Permission denied.';
    end if;
  end if;

  insert into public.wiki_page_shares (page_id, created_by_user_id)
  values (target_page_id, current_user_id)
  on conflict (page_id) do update set
    share_token = replace(gen_random_uuid()::text, '-', ''),
    created_at = timezone('utc', now()),
    created_by_user_id = current_user_id,
    revoked_at = null;

  return query
    select
      share.share_token,
      share.created_at,
      share.revoked_at
    from public.wiki_page_shares share
    where share.page_id = target_page_id;
end;
$$;

create or replace function public.revoke_wiki_share_link(
  target_page_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  page_record public.wiki_pages;
begin
  select * into page_record
  from public.wiki_pages
  where id = target_page_id
    and deleted_at is null;

  if page_record is null then
    raise exception 'Page not found.';
  end if;

  if page_record.project_id is null then
    if not public.can_edit_organization(page_record.organization_id, current_user_id) then
      raise exception 'Permission denied.';
    end if;
  else
    if not public.can_edit_project(page_record.project_id, current_user_id) then
      raise exception 'Permission denied.';
    end if;
  end if;

  update public.wiki_page_shares
  set revoked_at = timezone('utc', now())
  where page_id = target_page_id
    and revoked_at is null;
end;
$$;

create or replace function public.get_public_wiki_page(
  target_share_token text
)
returns table(
  title text,
  icon text,
  content_json jsonb,
  content_md text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      page.title,
      page.icon,
      page.content_json,
      page.content_md,
      page.updated_at
    from public.wiki_page_shares share
    join public.wiki_pages page on page.id = share.page_id
    where share.share_token = trim(target_share_token)
      and share.revoked_at is null
      and page.deleted_at is null;
end;
$$;

create or replace function public.revoke_wiki_shares_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.deleted_at is not null and OLD.deleted_at is null then
    update public.wiki_page_shares
    set revoked_at = NEW.deleted_at
    where page_id = NEW.id
      and revoked_at is null;
  end if;

  return NEW;
end;
$$;

create trigger wiki_pages_revoke_shares_on_delete
  after update of deleted_at on public.wiki_pages
  for each row
  when (NEW.deleted_at is not null and OLD.deleted_at is null)
  execute function public.revoke_wiki_shares_on_delete();

-- Reorder wiki pages (batch position + parent updates for drag-and-drop)
create or replace function public.reorder_wiki_pages(
  updates jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  current_user_id uuid := auth.uid();
  page_record public.wiki_pages;
  target_parent public.wiki_pages;
begin
  for item in select * from jsonb_array_elements(updates)
  loop
    -- Fetch full page record for auth + scope check
    select * into page_record
    from public.wiki_pages
    where id = (item->>'pageId')::uuid
      and deleted_at is null;

    if page_record is null then
      continue;
    end if;

    -- Auth: org wiki pages need org edit, project pages need project edit
    if page_record.project_id is null then
      if not public.can_edit_organization(page_record.organization_id, current_user_id) then
        raise exception 'Not authorized to reorder pages.';
      end if;
    else
      if not public.can_edit_project(page_record.project_id, current_user_id) then
        raise exception 'Not authorized to reorder pages.';
      end if;
    end if;

    -- Scope validation: if reparenting, verify destination parent matches scope
    if (item->>'parentPageId') is not null then
      select * into target_parent
      from public.wiki_pages
      where id = (item->>'parentPageId')::uuid
        and deleted_at is null;

      if target_parent is null then
        raise exception 'Target parent page not found.';
      end if;

      if target_parent.organization_id != page_record.organization_id
         or target_parent.project_id is distinct from page_record.project_id then
        raise exception 'Cannot move page to a different scope.';
      end if;
    end if;

    update public.wiki_pages
    set parent_page_id = (item->>'parentPageId')::uuid,
        position = (item->>'position')::integer
    where id = (item->>'pageId')::uuid;
  end loop;
end;
$$;

-- Pin a wiki page for the current user
create or replace function public.pin_wiki_page(
  target_page_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  pin_count integer;
  new_position integer;
begin
  -- Check page exists and user can access it
  if not exists (
    select 1 from public.wiki_pages page
    where page.id = target_page_id
      and page.deleted_at is null
      and (
        (page.project_id is null and can_edit_organization(page.organization_id, current_user_id))
        or
        (page.project_id is not null and can_access_project(page.project_id))
      )
  ) then
    raise exception 'Page not found.';
  end if;

  -- Check pin limit
  select count(*) into pin_count
  from public.wiki_page_user_pins
  where user_id = current_user_id;

  if pin_count >= 5 then
    raise exception 'Maximum 5 pinned pages.';
  end if;

  -- Calculate next position
  select coalesce(max(position), -1) + 1 into new_position
  from public.wiki_page_user_pins
  where user_id = current_user_id;

  insert into public.wiki_page_user_pins (page_id, user_id, position)
  values (target_page_id, current_user_id, new_position)
  on conflict (page_id, user_id) do nothing;
end;
$$;

-- Unpin a wiki page for the current user
create or replace function public.unpin_wiki_page(
  target_page_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.wiki_page_user_pins
  where page_id = target_page_id
    and user_id = auth.uid();
end;
$$;

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

-- Add a comment to a wiki page
create or replace function public.add_wiki_page_comment(
  target_page_id uuid,
  target_body_text text
)
returns table(
  id uuid,
  page_id uuid,
  body_text text,
  author_name text,
  author_user_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  page_record public.wiki_pages;
  resolved_author_name text;
begin
  select * into page_record
  from public.wiki_pages
  where wiki_pages.id = target_page_id
    and deleted_at is null;

  if page_record is null then
    raise exception 'Page not found.';
  end if;

  -- Auth check (same as page access)
  if page_record.project_id is null then
    if not public.can_edit_organization(page_record.organization_id, current_user_id) then
      raise exception 'Not authorized to comment on this page.';
    end if;
  else
    if not public.can_access_project(page_record.project_id) then
      raise exception 'Not authorized to comment on this page.';
    end if;
  end if;

  select coalesce(p.full_name, p.email, 'Unknown') into resolved_author_name
  from public.profiles p
  where p.user_id = current_user_id;

  return query
  insert into public.wiki_page_comments (page_id, body_text, created_by_user_id)
  values (target_page_id, target_body_text, current_user_id)
  returning
    wiki_page_comments.id,
    wiki_page_comments.page_id,
    wiki_page_comments.body_text,
    resolved_author_name as author_name,
    current_user_id as author_user_id,
    wiki_page_comments.created_at;
end;
$$;

-- Search wiki pages (full-text)
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
      ts_headline('english', page.content_md, tsquery_val,
        'MaxWords=30, MinWords=15, StartSel=' || chr(1) || ', StopSel=' || chr(2)) as content_snippet,
      ts_rank(to_tsvector('english', page.content_md), tsquery_val) as rank,
      page.updated_at
    from public.wiki_pages page
    where page.organization_id = target_org_id
      and page.deleted_at is null
      and to_tsvector('english', page.content_md) @@ tsquery_val
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

-- ── Grant table access to authenticated ─────────────────────────────

grant select, insert, update on public.wiki_pages to authenticated;
grant select, insert on public.wiki_page_versions to authenticated;
grant select, insert on public.wiki_page_comments to authenticated;
grant select, insert, delete on public.wiki_page_user_pins to authenticated;
grant select, insert, update on public.wiki_page_shares to authenticated;

-- ── Grant RPCs to authenticated ─────────────────────────────────────

revoke all on function public.create_wiki_page(uuid, uuid, uuid, text) from public;
grant execute on function public.create_wiki_page(uuid, uuid, uuid, text) to authenticated;

revoke all on function public.update_wiki_page(uuid, text, jsonb, text, text, uuid, integer, text, integer) from public;
grant execute on function public.update_wiki_page(uuid, text, jsonb, text, text, uuid, integer, text, integer) to authenticated;

revoke all on function public.delete_wiki_page(uuid) from public;
grant execute on function public.delete_wiki_page(uuid) to authenticated;

revoke all on function public.restore_wiki_page(uuid) from public;
grant execute on function public.restore_wiki_page(uuid) to authenticated;

revoke all on function public.reorder_wiki_pages(jsonb) from public;
grant execute on function public.reorder_wiki_pages(jsonb) to authenticated;

revoke all on function public.pin_wiki_page(uuid) from public;
grant execute on function public.pin_wiki_page(uuid) to authenticated;

revoke all on function public.unpin_wiki_page(uuid) from public;
grant execute on function public.unpin_wiki_page(uuid) to authenticated;

revoke all on function public.list_pinned_pages_with_metadata(uuid) from public;
grant execute on function public.list_pinned_pages_with_metadata(uuid) to authenticated;

revoke all on function public.add_wiki_page_comment(uuid, text) from public;
grant execute on function public.add_wiki_page_comment(uuid, text) to authenticated;

create or replace function public.list_wiki_page_comments(target_page_id uuid)
returns table(
  id uuid,
  page_id uuid,
  body_text text,
  author_user_id uuid,
  author_name text,
  author_avatar_url text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    comment.id,
    comment.page_id,
    comment.body_text,
    comment.created_by_user_id as author_user_id,
    coalesce(profile.full_name, split_part(profile.email, '@', 1), 'Unknown') as author_name,
    profile.avatar_url as author_avatar_url,
    comment.created_at
  from public.wiki_page_comments comment
  join public.profiles profile
    on profile.user_id = comment.created_by_user_id
  where comment.page_id = target_page_id
  order by comment.created_at asc;
$$;

revoke all on function public.list_wiki_page_comments(uuid) from public;
grant execute on function public.list_wiki_page_comments(uuid) to authenticated;

revoke all on function public.search_wiki_pages(uuid, text, integer) from public;
grant execute on function public.search_wiki_pages(uuid, text, integer) to authenticated;

revoke all on function public.get_org_wiki_startup_snapshot(text, text) from public;
grant execute on function public.get_org_wiki_startup_snapshot(text, text) to authenticated;

revoke all on function public.get_wiki_share_snapshot(uuid) from public;
grant execute on function public.get_wiki_share_snapshot(uuid) to authenticated;

revoke all on function public.create_wiki_share_link(uuid) from public;
grant execute on function public.create_wiki_share_link(uuid) to authenticated;

revoke all on function public.revoke_wiki_share_link(uuid) from public;
grant execute on function public.revoke_wiki_share_link(uuid) to authenticated;

revoke all on function public.get_public_wiki_page(text) from public;
grant execute on function public.get_public_wiki_page(text) to anon, authenticated;
