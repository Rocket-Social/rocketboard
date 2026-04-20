-- Documents: documents, versions, presence, comments, attachments, notes.
-- Canonical greenfield owner file. Modify in place.

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  project_view_id uuid not null unique references public.project_views (id) on delete cascade,
  title text not null,
  content_md text not null default '',
  version integer not null default 1,
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  updated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint documents_version_positive check (version >= 1)
);

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  version integer not null,
  title text not null,
  content_md text not null default '',
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  constraint document_versions_document_version_key unique (document_id, version),
  constraint document_versions_version_positive check (version >= 1)
);

create table public.document_comments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  body_text text not null,
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.document_presence (
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  state text not null default 'editing',
  last_seen_at timestamptz not null default timezone('utc', now()),
  primary key (document_id, user_id)
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  document_id uuid references public.documents (id) on delete cascade,
  card_id uuid references public.cards (id) on delete cascade,
  file_name text not null,
  content_type text,
  size_bytes bigint not null default 0,
  storage_path text not null unique,
  uploaded_by_user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  constraint attachments_size_nonnegative check (size_bytes >= 0),
  constraint attachments_single_parent check (((document_id is not null)::int + (card_id is not null)::int) = 1)
);

create index documents_project_id_idx on public.documents (project_id);

create index document_versions_document_id_idx on public.document_versions (document_id, version desc);

create index document_comments_document_id_idx on public.document_comments (document_id, created_at);

create index document_presence_document_id_idx on public.document_presence (document_id, last_seen_at desc);

create index attachments_project_id_idx on public.attachments (project_id, created_at desc);

create index attachments_document_id_idx on public.attachments (document_id, created_at desc);

create trigger documents_set_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

alter table public.documents enable row level security;

alter table public.document_versions enable row level security;

alter table public.document_comments enable row level security;

alter table public.document_presence enable row level security;

alter table public.attachments enable row level security;

alter table public.documents replica identity full;

alter table public.document_comments replica identity full;

alter table public.document_presence replica identity full;

alter table public.attachments replica identity full;

-- Storage tracking: update org storage_used_bytes on attachment insert/delete
create trigger attachments_update_org_storage
  after insert or delete on public.attachments
  for each row execute function public.update_org_storage_bytes();

-- ── Storage bucket for file attachments ───────────────────────────
insert into storage.buckets (id, name, public)
values ('project-attachments', 'project-attachments', false)
on conflict (id) do nothing;

drop policy if exists "project_attachments_select" on storage.objects;

create policy "project_attachments_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'project-attachments'
  and public.can_access_project(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "project_attachments_insert" on storage.objects;

create policy "project_attachments_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-attachments'
  and public.can_edit_project(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "project_attachments_delete" on storage.objects;

create policy "project_attachments_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-attachments'
  and public.can_edit_project(((storage.foldername(name))[1])::uuid)
);

create policy documents_select_for_members
on public.documents
for select
to authenticated
using (public.can_access_project(project_id));

create policy document_versions_select_for_members
on public.document_versions
for select
to authenticated
using (
  exists (
    select 1
    from public.documents document
    where document.id = document_versions.document_id
      and public.can_access_project(document.project_id)
  )
);

create policy document_comments_select_for_members
on public.document_comments
for select
to authenticated
using (
  exists (
    select 1
    from public.documents document
    where document.id = document_comments.document_id
      and public.can_access_project(document.project_id)
  )
);

create policy document_presence_select_for_members
on public.document_presence
for select
to authenticated
using (
  exists (
    select 1
    from public.documents document
    where document.id = document_presence.document_id
      and public.can_access_project(document.project_id)
  )
);

create policy attachments_select_for_members
on public.attachments
for select
to authenticated
using (public.can_access_project(project_id));

-- ── Write RLS policies for documents domain ────────────────────────

create policy documents_update_for_members on public.documents
  for update to authenticated using (public.can_edit_project(project_id));

create policy document_versions_insert_for_members on public.document_versions
  for insert to authenticated with check (
    exists (select 1 from public.documents d where d.id = document_versions.document_id and public.can_edit_project(d.project_id))
  );

create policy document_comments_insert_for_members on public.document_comments
  for insert to authenticated with check (
    exists (select 1 from public.documents d where d.id = document_comments.document_id and public.can_edit_project(d.project_id))
  );

create policy document_presence_insert_for_members on public.document_presence
  for insert to authenticated with check (user_id = auth.uid());

create policy document_presence_update_for_members on public.document_presence
  for update to authenticated using (user_id = auth.uid());

create policy document_presence_delete_for_members on public.document_presence
  for delete to authenticated using (user_id = auth.uid());

create policy attachments_insert_for_members on public.attachments
  for insert to authenticated with check (public.can_edit_project(project_id));

create policy attachments_delete_for_members on public.attachments
  for delete to authenticated using (public.can_edit_project(project_id));

create or replace function public.get_document_presence(target_document_id uuid)
returns table(
  user_id uuid,
  name text,
  state text,
  last_seen_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    presence.user_id,
    coalesce(profile.full_name, split_part(profile.email, '@', 1), 'Unknown') as name,
    presence.state,
    presence.last_seen_at
  from public.document_presence presence
  join public.documents document
    on document.id = presence.document_id
  left join public.profiles profile
    on profile.user_id = presence.user_id
  where presence.document_id = target_document_id
    and presence.last_seen_at >= timezone('utc', now()) - interval '2 minutes'
    and public.can_access_project(document.project_id, auth.uid())
  order by presence.last_seen_at desc, presence.user_id asc;
$$;

create or replace function public.get_card_detail(target_card_id uuid)
returns table(
  id uuid,
  project_id uuid,
  project_key text,
  project_card_number integer,
  card_ref text,
  title text,
  body_md text,
  body_json jsonb,
  status_option_id uuid,
  priority_option_id uuid,
  assignee_name text,
  assignee_user_id uuid,
  start_at timestamptz,
  due_at timestamptz,
  effort numeric,
  group_id uuid,
  group_position integer,
  tags text[],
  status_position integer,
  sprint_id uuid,
  initiative_id uuid,
  created_at timestamptz,
  completed_at timestamptz,
  custom_field_values jsonb,
  comments jsonb,
  attachments jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    card.id,
    card.project_id,
    project.project_key,
    card.project_card_number,
    public.format_card_ref(project.project_key, card.project_card_number) as card_ref,
    card.title,
    coalesce(card.body_md, '') as body_md,
    public.coalesce_rich_text_document(card.body_json, card.body_md) as body_json,
    card.status_option_id,
    card.priority_option_id,
    coalesce(assignee.full_name, split_part(assignee.email, '@', 1), 'Unassigned') as assignee_name,
    card.assignee_user_id,
    card.start_at,
    card.due_at,
    card.effort,
    card.group_id,
    card.group_position,
    card.tags,
    card.position as status_position,
    card.sprint_id,
    card.initiative_id,
    card.created_at,
    card.completed_at,
    card.custom_data as custom_field_values,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', comment.id,
            'author_name', coalesce(author.full_name, split_part(author.email, '@', 1), 'Unknown'),
            'body_text', comment.body_text,
            'created_at', comment.created_at
          )
          order by comment.created_at asc, comment.id asc
        )
        from public.card_comments comment
        left join public.profiles author
          on author.user_id = comment.created_by_user_id
        where comment.card_id = card.id
      ),
      '[]'::jsonb
    ) as comments,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', attachment.id,
            'file_name', attachment.file_name,
            'content_type', attachment.content_type,
            'size_bytes', attachment.size_bytes,
            'storage_path', attachment.storage_path,
            'created_at', attachment.created_at,
            'uploaded_by_name', coalesce(attachment_author.full_name, split_part(attachment_author.email, '@', 1), 'Unknown')
          )
          order by attachment.created_at desc, attachment.id desc
        )
        from public.attachments attachment
        left join public.profiles attachment_author
          on attachment_author.user_id = attachment.uploaded_by_user_id
        where attachment.card_id = card.id
      ),
      '[]'::jsonb
    ) as attachments
  from public.cards card
  join public.projects project
    on project.id = card.project_id
  left join public.profiles assignee
    on assignee.user_id = card.assignee_user_id
  where card.id = target_card_id
    and public.can_access_project(card.project_id, auth.uid());
$$;

revoke all on function public.get_card_detail(uuid) from public;

grant execute on function public.get_card_detail(uuid) to authenticated;

create or replace function public.upsert_document_presence(target_document_id uuid, target_state text default 'editing')
returns table(
  document_id uuid,
  user_id uuid,
  state text,
  last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project_id uuid;
  normalized_state text := trim(coalesce(target_state, 'editing'));
begin
  select document.project_id
    into target_project_id
  from public.documents document
  where document.id = target_document_id
    and public.can_access_project(document.project_id, auth.uid());

  if target_project_id is null then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;

  if normalized_state = '' then
    normalized_state := 'editing';
  end if;

  insert into public.document_presence (document_id, user_id, state, last_seen_at)
  values (target_document_id, auth.uid(), normalized_state, now())
  on conflict on constraint document_presence_pkey
  do update
    set
      state = excluded.state,
      last_seen_at = excluded.last_seen_at;

  return query select
    target_document_id as document_id,
    auth.uid() as user_id,
    normalized_state as state,
    now() as last_seen_at;
end;
$$;

create or replace function public.create_attachment(
  target_project_id uuid,
  target_document_id uuid,
  target_file_name text,
  target_storage_path text,
  target_content_type text default null,
  target_size_bytes bigint default 0
)
returns table(
  id uuid,
  file_name text,
  content_type text,
  size_bytes bigint,
  storage_path text,
  created_at timestamptz,
  uploaded_by_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_attachment public.attachments%rowtype;
  target_document public.documents%rowtype;
  normalized_file_name text := trim(coalesce(target_file_name, ''));
begin
  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'ATTACHMENT_ACCESS_DENIED';
  end if;

  if target_document_id is null then
    raise exception 'ATTACHMENT_DOCUMENT_REQUIRED';
  end if;

  select *
    into target_document
  from public.documents document
  where document.id = target_document_id
    and document.project_id = target_project_id;

  if target_document.id is null then
    raise exception 'ATTACHMENT_DOCUMENT_MISMATCH';
  end if;

  if normalized_file_name = '' then
    raise exception 'ATTACHMENT_FILE_NAME_REQUIRED';
  end if;

  if split_part(target_storage_path, '/', 1) <> target_project_id::text then
    raise exception 'ATTACHMENT_STORAGE_PATH_INVALID';
  end if;

  insert into public.attachments (
    project_id,
    document_id,
    file_name,
    content_type,
    size_bytes,
    storage_path,
    uploaded_by_user_id
  )
  values (
    target_project_id,
    target_document_id,
    normalized_file_name,
    nullif(trim(coalesce(target_content_type, '')), ''),
    greatest(target_size_bytes, 0),
    target_storage_path,
    auth.uid()
  )
  returning * into created_attachment;

  perform public.touch_project(target_project_id, auth.uid());

  return query select
    created_attachment.id,
    created_attachment.file_name,
    created_attachment.content_type,
    created_attachment.size_bytes,
    created_attachment.storage_path,
    created_attachment.created_at,
    (
      select coalesce(profile.full_name, split_part(profile.email, '@', 1), 'Unknown')
      from public.profiles profile
      where profile.user_id = created_attachment.uploaded_by_user_id
    ) as uploaded_by_name;
end;
$$;

revoke all on function public.get_document_presence(uuid) from public;

grant execute on function public.get_document_presence(uuid) to authenticated;

revoke all on function public.upsert_document_presence(uuid, text) from public;

grant execute on function public.upsert_document_presence(uuid, text) to authenticated;

revoke all on function public.create_attachment(uuid, uuid, text, text, text, bigint) from public;

grant execute on function public.create_attachment(uuid, uuid, text, text, text, bigint) to authenticated;

alter table public.documents
  add column if not exists content_json jsonb not null default public.empty_rich_text_document();

alter table public.document_versions
  add column if not exists content_json jsonb not null default public.empty_rich_text_document();

create or replace function public.sync_document_project_id()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  resolved_project_id uuid;
begin
  select project_view.project_id
    into resolved_project_id
  from public.project_views project_view
  where project_view.id = new.project_view_id;

  if resolved_project_id is null then
    raise exception 'PROJECT_VIEW_NOT_FOUND';
  end if;

  new.project_id := resolved_project_id;
  return new;
end;
$$;

revoke all on function public.sync_document_project_id() from public;

update public.documents document
set project_id = project_view.project_id
from public.project_views project_view
where project_view.id = document.project_view_id
  and document.project_id is distinct from project_view.project_id;

drop trigger if exists documents_sync_project_id on public.documents;

create trigger documents_sync_project_id
before insert or update of project_id, project_view_id on public.documents
for each row execute function public.sync_document_project_id();

create or replace function public.get_project_document_snapshot(target_project_view_id uuid)
returns table(
  id uuid,
  project_id uuid,
  project_key text,
  project_name text,
  project_slug text,
  project_view_id uuid,
  title text,
  content_md text,
  content_json jsonb,
  version integer,
  updated_at timestamptz,
  updated_by_name text,
  versions jsonb,
  comments jsonb,
  attachments jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    document.id,
    document.project_id,
    project.project_key,
    project.name as project_name,
    project.slug as project_slug,
    project_view.id as project_view_id,
    document.title,
    document.content_md,
    public.coalesce_rich_text_document(document.content_json, document.content_md) as content_json,
    document.version,
    document.updated_at,
    coalesce(updated_by.full_name, split_part(updated_by.email, '@', 1), 'Unknown') as updated_by_name,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', version_entry.id,
            'version', version_entry.version,
            'title', version_entry.title,
            'created_at', version_entry.created_at,
            'author_name', coalesce(version_author.full_name, split_part(version_author.email, '@', 1), 'Unknown')
          )
          order by version_entry.version desc, version_entry.created_at desc
        )
        from public.document_versions version_entry
        left join public.profiles version_author
          on version_author.user_id = version_entry.created_by_user_id
        where version_entry.document_id = document.id
      ),
      '[]'::jsonb
    ) as versions,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', comment.id,
            'body_text', comment.body_text,
            'created_at', comment.created_at,
            'author_name', coalesce(comment_author.full_name, split_part(comment_author.email, '@', 1), 'Unknown')
          )
          order by comment.created_at asc, comment.id asc
        )
        from public.document_comments comment
        left join public.profiles comment_author
          on comment_author.user_id = comment.created_by_user_id
        where comment.document_id = document.id
      ),
      '[]'::jsonb
    ) as comments,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', attachment.id,
            'file_name', attachment.file_name,
            'content_type', attachment.content_type,
            'size_bytes', attachment.size_bytes,
            'storage_path', attachment.storage_path,
            'created_at', attachment.created_at,
            'uploaded_by_name', coalesce(attachment_author.full_name, split_part(attachment_author.email, '@', 1), 'Unknown')
          )
          order by attachment.created_at desc, attachment.id desc
        )
        from public.attachments attachment
        left join public.profiles attachment_author
          on attachment_author.user_id = attachment.uploaded_by_user_id
        where attachment.document_id = document.id
      ),
      '[]'::jsonb
    ) as attachments
  from public.project_views project_view
  join public.projects project
    on project.id = project_view.project_id
  join public.documents document
    on document.project_view_id = project_view.id
  left join public.profiles updated_by
    on updated_by.user_id = document.updated_by_user_id
  where project_view.id = target_project_view_id
    and public.can_access_project(project_view.project_id, auth.uid())
  limit 1;
$$;

revoke all on function public.get_project_document_snapshot(uuid) from public;

grant execute on function public.get_project_document_snapshot(uuid) to authenticated;

create function public.save_document(
  target_document_id uuid,
  expected_version integer,
  target_title text,
  target_content_md text,
  target_content_json jsonb default null,
  target_create_version boolean default true
)
returns table(
  document_id uuid,
  document_version integer,
  document_title text,
  document_content_md text,
  document_content_json jsonb,
  document_project_id uuid,
  document_updated_at timestamptz,
  document_updated_by_name text,
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
  current_document public.documents%rowtype;
  created_version public.document_versions%rowtype;
  next_version integer;
  normalized_title text := trim(target_title);
  normalized_content_json jsonb := public.coalesce_rich_text_document(target_content_json, target_content_md);
  normalized_content_md text := coalesce(target_content_md, '');
begin
  select *
    into current_document
  from public.documents document
  where document.id = target_document_id
    and public.can_edit_project(document.project_id, auth.uid());

  if current_document.id is null then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;

  if normalized_title is null or normalized_title = '' then
    raise exception 'DOCUMENT_TITLE_REQUIRED';
  end if;

  if current_document.version <> expected_version then
    raise exception 'DOCUMENT_CONFLICT';
  end if;

  next_version := current_document.version + 1;

  update public.documents
  set
    title = normalized_title,
    content_md = normalized_content_md,
    content_json = normalized_content_json,
    version = next_version,
    updated_by_user_id = auth.uid()
  where id = target_document_id
    and version = current_document.version;

  if not found then
    raise exception 'DOCUMENT_CONFLICT';
  end if;

  if target_create_version then
    insert into public.document_versions (
      document_id,
      version,
      title,
      content_md,
      content_json,
      created_by_user_id
    )
    values (
      target_document_id,
      next_version,
      normalized_title,
      normalized_content_md,
      normalized_content_json,
      auth.uid()
    )
    returning * into created_version;
  end if;

  perform public.touch_project(current_document.project_id, auth.uid());

  return query select
    target_document_id as document_id,
    next_version as document_version,
    normalized_title as document_title,
    normalized_content_md as document_content_md,
    normalized_content_json as document_content_json,
    current_document.project_id as document_project_id,
    now() as document_updated_at,
    (
      select coalesce(profile.full_name, split_part(profile.email, '@', 1), 'Unknown')
      from public.profiles profile
      where profile.user_id = auth.uid()
    ) as document_updated_by_name,
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

revoke all on function public.save_document(uuid, integer, text, text, jsonb, boolean) from public;

grant execute on function public.save_document(uuid, integer, text, text, jsonb, boolean) to authenticated;

create or replace function public.restore_document_version(
  target_document_id uuid,
  target_version_id uuid,
  expected_version integer
)
returns table(
  document_id uuid,
  document_version integer,
  document_title text,
  document_content_md text,
  document_content_json jsonb,
  document_project_id uuid,
  document_updated_at timestamptz,
  document_updated_by_name text,
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
  current_document public.documents%rowtype;
  created_version public.document_versions%rowtype;
  source_version public.document_versions%rowtype;
  next_version integer;
begin
  select *
    into current_document
  from public.documents document
  where document.id = target_document_id
    and public.can_edit_project(document.project_id, auth.uid());

  if current_document.id is null then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;

  if current_document.version <> expected_version then
    raise exception 'DOCUMENT_CONFLICT';
  end if;

  select *
    into source_version
  from public.document_versions version_entry
  where version_entry.id = target_version_id
    and version_entry.document_id = target_document_id;

  if source_version.id is null then
    raise exception 'DOCUMENT_VERSION_NOT_FOUND';
  end if;

  next_version := current_document.version + 1;

  update public.documents
  set
    title = source_version.title,
    content_md = source_version.content_md,
    content_json = public.coalesce_rich_text_document(source_version.content_json, source_version.content_md),
    version = next_version,
    updated_by_user_id = auth.uid()
  where id = target_document_id
    and version = current_document.version;

  if not found then
    raise exception 'DOCUMENT_CONFLICT';
  end if;

  insert into public.document_versions (
    document_id,
    version,
    title,
    content_md,
    content_json,
    created_by_user_id
  )
  values (
    target_document_id,
    next_version,
    source_version.title,
    source_version.content_md,
    public.coalesce_rich_text_document(source_version.content_json, source_version.content_md),
    auth.uid()
  )
  returning * into created_version;

  perform public.touch_project(current_document.project_id, auth.uid());

  return query select
    target_document_id as document_id,
    next_version as document_version,
    source_version.title as document_title,
    source_version.content_md as document_content_md,
    public.coalesce_rich_text_document(source_version.content_json, source_version.content_md) as document_content_json,
    current_document.project_id as document_project_id,
    now() as document_updated_at,
    (
      select coalesce(profile.full_name, split_part(profile.email, '@', 1), 'Unknown')
      from public.profiles profile
      where profile.user_id = auth.uid()
    ) as document_updated_by_name,
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

revoke all on function public.restore_document_version(uuid, uuid, integer) from public;

grant execute on function public.restore_document_version(uuid, uuid, integer) to authenticated;

create or replace function public.delete_document_version(
  target_document_id uuid,
  target_version_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_document public.documents%rowtype;
  target_version public.document_versions%rowtype;
begin
  select * into current_document
  from public.documents document
  where document.id = target_document_id;

  if not found then
    raise exception 'Document not found';
  end if;

  if not public.can_edit_project(current_document.project_id, auth.uid()) then
    raise exception 'Access denied';
  end if;

  select * into target_version
  from public.document_versions version_entry
  where version_entry.id = target_version_id
    and version_entry.document_id = target_document_id;

  if not found then
    raise exception 'Version not found';
  end if;

  if target_version.version = current_document.version then
    raise exception 'Cannot delete the current version';
  end if;

  delete from public.document_versions
  where id = target_version_id;
end;
$$;

revoke all on function public.delete_document_version(uuid, uuid) from public;

grant execute on function public.delete_document_version(uuid, uuid) to authenticated;

create or replace function public.get_document_version_content(
  target_document_id uuid,
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
  from public.document_versions version_entry
  left join public.profiles author
    on author.user_id = version_entry.created_by_user_id
  where version_entry.id = target_version_id
    and version_entry.document_id = target_document_id
    and exists (
      select 1 from public.documents document
      inner join public.projects project on project.id = document.project_id
      where document.id = target_document_id
        and public.can_access_project(project.id, auth.uid())
    );
$$;

revoke all on function public.get_document_version_content(uuid, uuid) from public;

grant execute on function public.get_document_version_content(uuid, uuid) to authenticated;

alter table public.document_comments
  add column if not exists parent_comment_id uuid references public.document_comments (id) on delete cascade,
  add column if not exists reactions jsonb not null default '{}'::jsonb;

create or replace function public.toggle_comment_reaction(
  target_comment_id uuid,
  target_emoji text
)
returns table(
  reactions jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_comment public.document_comments%rowtype;
  current_user_id uuid := auth.uid();
  current_reactions jsonb;
  emoji_users jsonb;
  user_id_text text;
  updated_reactions jsonb;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select * into current_comment
  from public.document_comments c
  where c.id = target_comment_id;

  if not found then
    raise exception 'Comment not found';
  end if;

  if not exists (
    select 1 from public.documents doc
    where doc.id = current_comment.document_id
      and public.can_edit_project(doc.project_id, current_user_id)
  ) then
    raise exception 'Access denied';
  end if;

  current_reactions := coalesce(current_comment.reactions, '{}'::jsonb);
  emoji_users := coalesce(current_reactions->target_emoji, '[]'::jsonb);
  user_id_text := to_jsonb(current_user_id::text);

  if emoji_users ? current_user_id::text then
    emoji_users := (
      select coalesce(jsonb_agg(elem), '[]'::jsonb)
      from jsonb_array_elements(emoji_users) as elem
      where elem != user_id_text
    );
  else
    emoji_users := emoji_users || jsonb_build_array(current_user_id::text);
  end if;

  if jsonb_array_length(emoji_users) = 0 then
    updated_reactions := current_reactions - target_emoji;
  else
    updated_reactions := jsonb_set(current_reactions, array[target_emoji], emoji_users);
  end if;

  update public.document_comments
  set reactions = updated_reactions
  where id = target_comment_id;

  return query select updated_reactions as reactions;
end;
$$;

revoke all on function public.toggle_comment_reaction(uuid, text) from public;

grant execute on function public.toggle_comment_reaction(uuid, text) to authenticated;

create or replace function public.add_document_comment(
  target_document_id uuid,
  target_body_text text,
  target_parent_comment_id uuid default null
)
returns table(
  id uuid,
  body_text text,
  created_at timestamptz,
  author_name text,
  author_user_id uuid,
  parent_comment_id uuid,
  reactions jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  new_comment public.document_comments%rowtype;
  resolved_author_name text;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if not exists (
    select 1 from public.documents doc
    where doc.id = target_document_id
      and public.can_edit_project(doc.project_id, current_user_id)
  ) then
    raise exception 'Access denied';
  end if;

  if target_parent_comment_id is not null then
    if not exists (
      select 1 from public.document_comments pc
      where pc.id = target_parent_comment_id
        and pc.document_id = target_document_id
    ) then
      raise exception 'Parent comment not found';
    end if;
  end if;

  insert into public.document_comments (
    document_id,
    body_text,
    parent_comment_id,
    created_by_user_id
  )
  values (
    target_document_id,
    target_body_text,
    target_parent_comment_id,
    current_user_id
  )
  returning * into new_comment;

  select coalesce(profile.full_name, split_part(profile.email, '@', 1), 'Unknown')
    into resolved_author_name
  from public.profiles profile
  where profile.user_id = current_user_id;

  return query select
    new_comment.id,
    new_comment.body_text,
    new_comment.created_at,
    resolved_author_name as author_name,
    current_user_id as author_user_id,
    new_comment.parent_comment_id,
    new_comment.reactions;
end;
$$;

revoke all on function public.add_document_comment(uuid, text, uuid) from public;

grant execute on function public.add_document_comment(uuid, text, uuid) to authenticated;

create table public.note_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  parent_id uuid references public.note_folders (id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.note_import_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('granola', 'obsidian')),
  status text not null default 'disconnected' check (status in ('connected', 'disconnected', 'error', 'needs_reconnect')),
  mode text not null default 'capture' check (mode in ('mirror', 'capture')),
  auth_method text not null default 'api_key' check (auth_method in ('api_key', 'oauth', 'file_upload')),
  encrypted_access_token text,
  root_folder_id uuid references public.note_folders (id) on delete set null,
  backfill_cursor text,
  last_source_updated_at timestamptz,
  initial_import_completed_at timestamptz,
  last_sync_started_at timestamptz,
  last_sync_finished_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint note_import_connections_user_provider_key unique (user_id, provider)
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  folder_id uuid references public.note_folders (id) on delete set null,
  title text not null default 'New Note',
  content_json jsonb not null default '{"type":"doc","content":[]}',
  content_md text not null default '',
  preview_text text not null default '',
  source_provider text check (source_provider is null or source_provider in ('granola', 'obsidian')),
  source_id text,
  source_connection_id uuid references public.note_import_connections (id) on delete set null,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  source_metadata jsonb not null default '{}'::jsonb,
  source_detached boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint notes_source_identity_check check (
    (source_provider is null and source_id is null)
    or (source_provider is not null and source_id is not null)
  )
);

create index note_folders_user_id_idx on public.note_folders (user_id, position);

create index note_import_connections_user_id_idx on public.note_import_connections (user_id, provider);

create index notes_user_id_idx on public.notes (user_id, updated_at desc);

create index notes_folder_position_idx on public.notes (folder_id, position);

create index notes_folder_id_idx on public.notes (folder_id);

create index notes_source_connection_id_idx on public.notes (source_connection_id);

create unique index notes_import_identity_idx
  on public.notes (user_id, source_provider, source_id)
  where source_provider is not null and source_id is not null;

create trigger note_folders_set_updated_at
before update on public.note_folders
for each row execute function public.set_updated_at();

create trigger note_import_connections_set_updated_at
before update on public.note_import_connections
for each row execute function public.set_updated_at();

create trigger notes_set_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

create or replace function public.check_note_folder_depth()
returns trigger
language plpgsql
as $$
begin
  if new.parent_id is not null then
    if exists (
      select 1 from public.note_folders
      where id = new.parent_id and parent_id is not null
    ) then
      raise exception 'Note folders support at most 2 levels of nesting';
    end if;
  end if;
  return new;
end;
$$;

create trigger note_folders_check_depth
before insert or update on public.note_folders
for each row execute function public.check_note_folder_depth();

create or replace function public.check_note_folder_ownership()
returns trigger
language plpgsql
as $$
begin
  if new.folder_id is not null then
    if not exists (
      select 1 from public.note_folders
      where id = new.folder_id and user_id = new.user_id
    ) then
      raise exception 'Note folder does not belong to this user';
    end if;
  end if;
  return new;
end;
$$;

create trigger notes_check_folder_ownership
before insert or update on public.notes
for each row execute function public.check_note_folder_ownership();

alter table public.note_folders enable row level security;

alter table public.note_import_connections enable row level security;

alter table public.notes enable row level security;

create policy note_folders_user_policy on public.note_folders
  for all using (user_id = auth.uid());

create policy note_import_connections_user_policy on public.note_import_connections
  for all using (user_id = auth.uid());

create policy notes_user_policy on public.notes
  for all using (user_id = auth.uid());

grant all on public.note_folders to authenticated, service_role;

grant all on public.note_import_connections to authenticated, service_role;

grant all on public.notes to authenticated, service_role;

create or replace function public.initialize_user_notes(p_user_id uuid)
returns table(
  folder_id uuid,
  note_id uuid,
  created boolean
)
language plpgsql
security definer
as $$
declare
  v_folder_id uuid;
  v_note_id uuid;
  existing_folder_count integer;
begin
  -- Check if user already has folders
  select count(*) into existing_folder_count
  from public.note_folders
  where user_id = p_user_id;

  if existing_folder_count > 0 then
    -- Return first folder and first note
    select nf.id into v_folder_id
    from public.note_folders nf
    where nf.user_id = p_user_id
    order by nf.position, nf.created_at
    limit 1;

    select n.id into v_note_id
    from public.notes n
    where n.user_id = p_user_id and n.deleted_at is null
    order by n.updated_at desc
    limit 1;

    return query select v_folder_id as folder_id, v_note_id as note_id, false as created;
    return;
  end if;

  -- Create default folder
  insert into public.note_folders (user_id, name, position)
  values (p_user_id, 'Notes', 0)
  returning id into v_folder_id;

  -- Create default note in that folder
  insert into public.notes (user_id, folder_id, title)
  values (p_user_id, v_folder_id, 'New Note')
  returning id into v_note_id;

  return query select v_folder_id as folder_id, v_note_id as note_id, true as created;
end;
$$;

revoke all on function public.initialize_user_notes(uuid) from public;

grant execute on function public.initialize_user_notes(uuid) to authenticated;

create or replace function public.get_my_notes_startup_snapshot(
  target_note_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  resolved_note_id uuid;
  folders_snapshot jsonb := '[]'::jsonb;
  notes_snapshot jsonb := '[]'::jsonb;
  initial_note_snapshot jsonb := null;
begin
  if current_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select
    coalesce(
      (
        select note.id
        from public.notes note
        where note.user_id = current_user_id
          and note.deleted_at is null
          and target_note_id is not null
          and note.id = target_note_id
        limit 1
      ),
      (
        select note.id
        from public.notes note
        where note.user_id = current_user_id
          and note.deleted_at is null
        order by note.updated_at desc, note.created_at desc
        limit 1
      )
    )
  into resolved_note_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'createdAt', folder.created_at,
        'id', folder.id,
        'name', folder.name,
        'parentId', folder.parent_id,
        'position', folder.position,
        'updatedAt', folder.updated_at,
        'userId', folder.user_id
      )
      order by folder.position, folder.created_at
    ),
    '[]'::jsonb
  )
  into folders_snapshot
  from public.note_folders folder
  where folder.user_id = current_user_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'createdAt', note.created_at,
        'deletedAt', note.deleted_at,
        'displayTitle',
          case
            when char_length(trim(coalesce(note.title, ''))) > 0 and trim(note.title) <> 'New Note'
              then trim(note.title)
            when char_length(trim(coalesce(note.preview_text, ''))) > 0
              then trim(note.preview_text)
            when char_length(trim(coalesce(note.content_md, ''))) > 0
              then trim(split_part(note.content_md, E'\n', 1))
            else 'New Note'
          end,
        'folderId', note.folder_id,
        'id', note.id,
        'position', note.position,
        'previewText', note.preview_text,
        'sourceConnectionId', note.source_connection_id,
        'sourceCreatedAt', note.source_created_at,
        'sourceDetached', note.source_detached,
        'sourceId', note.source_id,
        'sourceMetadata', note.source_metadata,
        'sourceProvider', note.source_provider,
        'sourceUpdatedAt', note.source_updated_at,
        'title', note.title,
        'updatedAt', note.updated_at,
        'userId', note.user_id
      )
      order by note.updated_at desc, note.created_at desc
    ),
    '[]'::jsonb
  )
  into notes_snapshot
  from public.notes note
  where note.user_id = current_user_id
    and note.deleted_at is null;

  if resolved_note_id is not null then
    select jsonb_build_object(
      'contentJson', note.content_json,
      'contentMd', note.content_md,
      'createdAt', note.created_at,
      'deletedAt', note.deleted_at,
      'displayTitle',
        case
          when char_length(trim(coalesce(note.title, ''))) > 0 and trim(note.title) <> 'New Note'
            then trim(note.title)
          when char_length(trim(coalesce(note.preview_text, ''))) > 0
            then trim(note.preview_text)
          when char_length(trim(coalesce(note.content_md, ''))) > 0
            then trim(split_part(note.content_md, E'\n', 1))
          else 'New Note'
        end,
      'folderId', note.folder_id,
      'id', note.id,
      'position', note.position,
      'previewText', note.preview_text,
      'sourceConnectionId', note.source_connection_id,
      'sourceCreatedAt', note.source_created_at,
      'sourceDetached', note.source_detached,
      'sourceId', note.source_id,
      'sourceMetadata', note.source_metadata,
      'sourceProvider', note.source_provider,
      'sourceUpdatedAt', note.source_updated_at,
      'title', note.title,
      'updatedAt', note.updated_at,
      'userId', note.user_id
    )
    into initial_note_snapshot
    from public.notes note
    where note.id = resolved_note_id
      and note.user_id = current_user_id
      and note.deleted_at is null;
  end if;

  return jsonb_build_object(
    'folders', folders_snapshot,
    'initialNote', initial_note_snapshot,
    'notes', notes_snapshot,
    'resolvedNoteId', resolved_note_id
  );
end;
$$;

revoke all on function public.get_my_notes_startup_snapshot(uuid) from public;

grant execute on function public.get_my_notes_startup_snapshot(uuid) to authenticated;

create or replace function public.reorder_notes(updates jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
begin
  for item in select * from jsonb_array_elements(updates)
  loop
    update public.notes
    set folder_id = (item->>'folderId')::uuid,
        position = (item->>'position')::integer
    where id = (item->>'noteId')::uuid
      and user_id = auth.uid();
  end loop;
end;
$$;

revoke all on function public.reorder_notes(jsonb) from public;

grant execute on function public.reorder_notes(jsonb) to authenticated;

create or replace function public.reorder_note_folders(updates jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
begin
  for item in select * from jsonb_array_elements(updates)
  loop
    update public.note_folders
    set position = (item->>'position')::integer
    where id = (item->>'folderId')::uuid
      and user_id = auth.uid();
  end loop;
end;
$$;

revoke all on function public.reorder_note_folders(jsonb) from public;

grant execute on function public.reorder_note_folders(jsonb) to authenticated;

create index if not exists documents_search_document_idx
  on public.documents
  using gin (
    to_tsvector(
      'english',
      btrim(coalesce(title, '') || ' ' || coalesce(content_md, ''))
    )
  );

create index if not exists document_comments_search_document_idx
  on public.document_comments
  using gin (
    to_tsvector('english', coalesce(body_text, ''))
  );

create or replace function public.create_card_attachment(
  target_project_id uuid,
  target_card_id uuid,
  target_file_name text,
  target_storage_path text,
  target_content_type text default null,
  target_size_bytes bigint default 0
)
returns table(
  id uuid,
  card_id uuid,
  file_name text,
  content_type text,
  size_bytes bigint,
  storage_path text,
  created_at timestamptz,
  uploaded_by_user_id uuid,
  uploaded_by_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_attachment public.attachments%rowtype;
  target_card public.cards%rowtype;
  normalized_file_name text := trim(coalesce(target_file_name, ''));
begin
  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'ATTACHMENT_ACCESS_DENIED';
  end if;

  if target_card_id is null then
    raise exception 'ATTACHMENT_CARD_REQUIRED';
  end if;

  select *
    into target_card
  from public.cards card
  where card.id = target_card_id
    and card.project_id = target_project_id;

  if target_card.id is null then
    raise exception 'ATTACHMENT_CARD_MISMATCH';
  end if;

  if normalized_file_name = '' then
    raise exception 'ATTACHMENT_FILE_NAME_REQUIRED';
  end if;

  if split_part(target_storage_path, '/', 1) <> target_project_id::text then
    raise exception 'ATTACHMENT_STORAGE_PATH_INVALID';
  end if;

  insert into public.attachments (
    project_id,
    card_id,
    file_name,
    content_type,
    size_bytes,
    storage_path,
    uploaded_by_user_id
  )
  values (
    target_project_id,
    target_card_id,
    normalized_file_name,
    nullif(trim(coalesce(target_content_type, '')), ''),
    greatest(target_size_bytes, 0),
    target_storage_path,
    auth.uid()
  )
  returning * into created_attachment;

  return query
    select
      created_attachment.id,
      created_attachment.card_id,
      created_attachment.file_name,
      created_attachment.content_type,
      created_attachment.size_bytes,
      created_attachment.storage_path,
      created_attachment.created_at,
      created_attachment.uploaded_by_user_id,
      coalesce(profile.full_name, split_part(profile.email, '@', 1), 'Unknown') as uploaded_by_name
    from public.profiles profile
    where profile.user_id = created_attachment.uploaded_by_user_id;
end;
$$;

revoke all on function public.create_card_attachment(uuid, uuid, text, text, text, bigint) from public;

grant execute on function public.create_card_attachment(uuid, uuid, text, text, text, bigint) to authenticated;
