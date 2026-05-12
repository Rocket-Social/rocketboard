-- get_my_notes_startup_snapshot was added via in-place edit to
-- 00000000000004_documents.sql in PR #241 (commit 73cbeaf, 2026-04-11).
-- Baseline migrations are skipped by `supabase db push` on existing databases,
-- so prod (and any environment past day 1) never installed this function.
-- Frontend warmup calls it and gets 404 Not Found on every signed-in mount;
-- the error is swallowed and a legacy fallback path runs instead.
-- This dated migration installs the function body so the RPC actually resolves.

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
