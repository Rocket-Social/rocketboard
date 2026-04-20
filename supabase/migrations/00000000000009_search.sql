-- Search: full-text search indexes and RPCs, realtime publication.
-- Canonical greenfield owner file. Modify in place.

create or replace function public.card_search_text(
  target_title text,
  target_body_text text,
  target_tags text[]
)
returns text
language sql
immutable
as $$
  select btrim(
    coalesce(target_title, '')
    || ' ' || coalesce(target_body_text, '')
    || ' ' || coalesce(array_to_string(target_tags, ' '), '')
  );
$$;

create or replace function public.note_search_text(
  target_title text,
  target_content_md text
)
returns text
language sql
immutable
as $$
  select btrim(
    coalesce(target_title, '')
    || ' ' || coalesce(target_content_md, '')
  );
$$;

create or replace function public.note_display_title(
  target_title text,
  target_content_md text
)
returns text
language sql
immutable
as $$
  with normalized as (
    select
      btrim(coalesce(target_title, '')) as normalized_title,
      btrim(split_part(coalesce(target_content_md, ''), E'\n', 1)) as first_line
  )
  select
    case
      when normalized_title <> '' and normalized_title <> 'New Note' then normalized_title
      when first_line = '' then 'New Note'
      when char_length(first_line) > 50 then left(first_line, 50) || '...'
      else first_line
    end
  from normalized;
$$;

create index if not exists cards_search_document_idx
  on public.cards
  using gin (
    to_tsvector(
      'english',
      public.card_search_text(title, body_md, tags)
    )
  );

create index if not exists notes_search_document_idx
  on public.notes
  using gin (
    to_tsvector(
      'english',
      public.note_search_text(title, content_md)
    )
  );

create or replace function public.search_project_content(
  target_project_id uuid,
  target_query text
)
returns table(cards jsonb, documents jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_query text := nullif(trim(coalesce(target_query, '')), '');
  search_terms tsquery;
  ref_match text[];
  ref_key text;
  ref_number int;
begin
  if not public.can_access_project(target_project_id, auth.uid()) then
    raise exception 'You do not have access to search this project.';
  end if;

  if normalized_query is null then
    return query select '[]'::jsonb, '[]'::jsonb;
    return;
  end if;

  -- Card reference fast path: exact match (e.g., "PROJ-123")
  ref_match := regexp_match(normalized_query, '^([A-Za-z]+)-([0-9]+)$');
  if ref_match is not null then
    ref_key := upper(ref_match[1]);
    ref_number := ref_match[2]::int;
    return query
      select
        coalesce(
          (
            select jsonb_agg(jsonb_build_object(
              'card_id', card.id,
              'project_id', project.id,
              'project_key', project.project_key,
              'project_card_number', card.project_card_number,
              'card_ref', public.format_card_ref(project.project_key, card.project_card_number),
              'priority_option_id', card.priority_option_id,
              'rank', 1.0,
              'snippet', card.title,
              'status_option_id', card.status_option_id,
              'title', card.title
            ))
            from public.cards card
            join public.projects project on project.id = card.project_id
            where card.project_id = target_project_id
              and upper(project.project_key) = ref_key
              and card.project_card_number = ref_number
          ),
          '[]'::jsonb
        ),
        '[]'::jsonb;
    return;
  end if;

  -- Card reference fast path: partial match (e.g., "PROJ-")
  ref_match := regexp_match(normalized_query, '^([A-Za-z]+)-$');
  if ref_match is not null then
    ref_key := upper(ref_match[1]);
    return query
      select
        coalesce(
          (
            select jsonb_agg(row_payload order by row_updated desc, row_id asc)
            from (
              select
                jsonb_build_object(
                  'card_id', card.id,
                  'project_id', project.id,
                  'project_key', project.project_key,
                  'project_card_number', card.project_card_number,
                  'card_ref', public.format_card_ref(project.project_key, card.project_card_number),
                  'priority_option_id', card.priority_option_id,
                  'rank', 0.5,
                  'snippet', card.title,
                  'status_option_id', card.status_option_id,
                  'title', card.title
                ) as row_payload,
                card.updated_at as row_updated,
                card.id as row_id
              from public.cards card
              join public.projects project on project.id = card.project_id
              where card.project_id = target_project_id
                and upper(project.project_key) = ref_key
              order by card.updated_at desc, card.id asc
              limit 20
            ) sub
          ),
          '[]'::jsonb
        ),
        '[]'::jsonb;
    return;
  end if;

  search_terms := plainto_tsquery('english', normalized_query);

  return query
    with card_matches as (
      select
        jsonb_build_object(
          'card_id', card.id,
          'project_id', project.id,
          'project_key', project.project_key,
          'project_card_number', card.project_card_number,
          'card_ref', public.format_card_ref(project.project_key, card.project_card_number),
          'priority_option_id', card.priority_option_id,
          'rank', ts_rank_cd(
            to_tsvector(
              'english',
              public.card_search_text(card.title, card.body_md, card.tags)
            ),
            search_terms
          ),
          'snippet',
          coalesce(
            nullif(
              ts_headline(
                'english',
                public.card_search_text(card.title, card.body_md, card.tags),
                search_terms,
                'MaxWords=18, MinWords=8, MaxFragments=1, FragmentDelimiter=" … ", StartSel="«", StopSel="»"'
              ),
              ''
            ),
            card.title
          ),
          'status_option_id', card.status_option_id,
          'title', card.title
        ) as payload,
        card.id,
        card.updated_at,
        ts_rank_cd(
          to_tsvector(
            'english',
            public.card_search_text(card.title, card.body_md, card.tags)
          ),
          search_terms
        ) as rank
      from public.cards card
      join public.projects project
        on project.id = card.project_id
      where card.project_id = target_project_id
        and (
          to_tsvector(
            'english',
            public.card_search_text(card.title, card.body_md, card.tags)
          ) @@ search_terms
          or exists (
            select 1
            from unnest(card.tags) tag
            where lower(tag) like '%' || normalized_query || '%'
          )
        )
      order by rank desc, card.updated_at desc, card.id asc
      limit 20
    ),
    document_matches as (
      select
        jsonb_build_object(
          'document_id', document_hit.document_id,
          'project_id', document_hit.project_id,
          'project_key', document_hit.project_key,
          'project_name', document_hit.project_name,
          'project_slug', document_hit.project_slug,
          'project_view_id', document_hit.project_view_id,
          'rank', document_hit.rank,
          'snippet',
          coalesce(
            nullif(
              ts_headline(
                'english',
                document_hit.search_text,
                search_terms,
                'MaxWords=24, MinWords=8, MaxFragments=1, FragmentDelimiter=" … ", StartSel="«", StopSel="»"'
              ),
              ''
            ),
            document_hit.title
          ),
          'source', document_hit.source,
          'title', document_hit.title
        ) as payload,
        document_hit.document_id,
        document_hit.sort_time,
        document_hit.rank,
        document_hit.source
      from (
        select
          document.id as document_id,
          project.id as project_id,
          project.project_key,
          project.name as project_name,
          project.slug as project_slug,
          coalesce(
            document.project_view_id,
            (
              select project_view.id
              from public.project_views project_view
              where project_view.project_id = document.project_id
                and project_view.view_type = 'overview'
              order by project_view.position asc, project_view.created_at asc, project_view.id asc
              limit 1
            )
          ) as project_view_id,
          document.title,
          document.content_md as search_text,
          document.updated_at as sort_time,
          'document'::text as source,
          ts_rank_cd(
            to_tsvector(
              'english',
              btrim(coalesce(document.title, '') || ' ' || coalesce(document.content_md, ''))
            ),
            search_terms
          ) as rank
        from public.documents document
        join public.projects project
          on project.id = document.project_id
        where document.project_id = target_project_id
          and to_tsvector(
            'english',
            btrim(coalesce(document.title, '') || ' ' || coalesce(document.content_md, ''))
          ) @@ search_terms

        union all

        select
          document.id as document_id,
          project.id as project_id,
          project.project_key,
          project.name as project_name,
          project.slug as project_slug,
          coalesce(
            document.project_view_id,
            (
              select project_view.id
              from public.project_views project_view
              where project_view.project_id = document.project_id
                and project_view.view_type = 'overview'
              order by project_view.position asc, project_view.created_at asc, project_view.id asc
              limit 1
            )
          ) as project_view_id,
          document.title,
          document_comment.body_text as search_text,
          document_comment.created_at as sort_time,
          'comment'::text as source,
          ts_rank_cd(
            to_tsvector('english', coalesce(document_comment.body_text, '')),
            search_terms
          ) as rank
        from public.document_comments document_comment
        join public.documents document
          on document.id = document_comment.document_id
        join public.projects project
          on project.id = document.project_id
        where document.project_id = target_project_id
          and to_tsvector('english', coalesce(document_comment.body_text, '')) @@ search_terms
      ) document_hit
      order by document_hit.rank desc, document_hit.sort_time desc, document_hit.document_id asc
      limit 20
    )
    select
      coalesce(
        (
          select jsonb_agg(card_match.payload order by card_match.rank desc, card_match.updated_at desc, card_match.id asc)
          from card_matches card_match
        ),
        '[]'::jsonb
      ),
      coalesce(
        (
          select jsonb_agg(document_match.payload order by document_match.rank desc, document_match.sort_time desc, document_match.source asc)
          from document_matches document_match
        ),
        '[]'::jsonb
      );
end;
$$;

revoke all on function public.search_project_content(uuid, text) from public;

grant execute on function public.search_project_content(uuid, text) to authenticated;

create or replace function public.search_workspace_content(
  target_workspace_id uuid,
  target_query text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_query text := nullif(trim(coalesce(target_query, '')), '');
  search_terms tsquery;
  ref_match text[];
  ref_key text;
  ref_number int;
begin
  if not public.can_access_workspace(target_workspace_id, auth.uid()) then
    raise exception 'You do not have access to search this workspace.';
  end if;

  if normalized_query is null then
    return jsonb_build_object(
      'cards', '[]'::jsonb,
      'documents', '[]'::jsonb
    );
  end if;

  -- Card reference fast path: exact match (e.g., "PROJ-123")
  ref_match := regexp_match(normalized_query, '^([A-Za-z]+)-([0-9]+)$');
  if ref_match is not null then
    ref_key := upper(ref_match[1]);
    ref_number := ref_match[2]::int;
    return jsonb_build_object(
      'cards',
      coalesce(
        (
          select jsonb_agg(jsonb_build_object(
            'cardId', card.id,
            'priorityOptionId', card.priority_option_id,
            'projectId', project.id,
            'projectKey', project.project_key,
            'projectCardNumber', card.project_card_number,
            'cardRef', public.format_card_ref(project.project_key, card.project_card_number),
            'projectName', project.name,
            'projectSlug', project.slug,
            'rank', 1.0,
            'snippet', card.title,
            'statusOptionId', card.status_option_id,
            'title', card.title
          ))
          from public.cards card
          join public.projects project on project.id = card.project_id
          where project.workspace_id = target_workspace_id
            and upper(project.project_key) = ref_key
            and card.project_card_number = ref_number
        ),
        '[]'::jsonb
      ),
      'documents', '[]'::jsonb
    );
  end if;

  -- Card reference fast path: partial match (e.g., "PROJ-")
  ref_match := regexp_match(normalized_query, '^([A-Za-z]+)-$');
  if ref_match is not null then
    ref_key := upper(ref_match[1]);
    return jsonb_build_object(
      'cards',
      coalesce(
        (
          select jsonb_agg(row_payload order by row_updated desc, row_id asc)
          from (
            select
              jsonb_build_object(
                'cardId', card.id,
                'priorityOptionId', card.priority_option_id,
                'projectId', project.id,
                'projectKey', project.project_key,
                'projectCardNumber', card.project_card_number,
                'cardRef', public.format_card_ref(project.project_key, card.project_card_number),
                'projectName', project.name,
                'projectSlug', project.slug,
                'rank', 0.5,
                'snippet', card.title,
                'statusOptionId', card.status_option_id,
                'title', card.title
              ) as row_payload,
              card.updated_at as row_updated,
              card.id as row_id
            from public.cards card
            join public.projects project on project.id = card.project_id
            where project.workspace_id = target_workspace_id
              and upper(project.project_key) = ref_key
            order by card.updated_at desc, card.id asc
            limit 20
          ) sub
        ),
        '[]'::jsonb
      ),
      'documents', '[]'::jsonb
    );
  end if;

  search_terms := plainto_tsquery('english', normalized_query);

  return (
    with workspace_projects as (
      select
        project.id,
        project.name,
        project.slug,
        project.project_key
      from public.projects project
      where project.workspace_id = target_workspace_id
    ),
    card_matches as (
      select
        jsonb_build_object(
          'cardId', card.id,
          'priorityOptionId', card.priority_option_id,
          'projectId', workspace_project.id,
          'projectKey', workspace_project.project_key,
          'projectCardNumber', card.project_card_number,
          'cardRef', public.format_card_ref(workspace_project.project_key, card.project_card_number),
          'projectName', workspace_project.name,
          'projectSlug', workspace_project.slug,
          'rank',
          ts_rank_cd(
            to_tsvector(
              'english',
              public.card_search_text(card.title, card.body_md, card.tags)
            ),
            search_terms
          ),
          'snippet',
          coalesce(
            nullif(
              ts_headline(
                'english',
                public.card_search_text(card.title, card.body_md, card.tags),
                search_terms,
                'MaxWords=18, MinWords=8, MaxFragments=1, FragmentDelimiter=" … ", StartSel="«", StopSel="»"'
              ),
              ''
            ),
            card.title
          ),
          'statusOptionId', card.status_option_id,
          'title', card.title
        ) as payload,
        card.id,
        card.updated_at,
        ts_rank_cd(
          to_tsvector(
            'english',
            public.card_search_text(card.title, card.body_md, card.tags)
          ),
          search_terms
        ) as rank
      from public.cards card
      join workspace_projects workspace_project
        on workspace_project.id = card.project_id
      where
        to_tsvector(
          'english',
          public.card_search_text(card.title, card.body_md, card.tags)
        ) @@ search_terms
        or exists (
          select 1
          from unnest(card.tags) tag
          where lower(tag) like '%' || normalized_query || '%'
        )
      order by rank desc, card.updated_at desc, card.id asc
      limit 24
    ),
    document_matches as (
      select
        jsonb_build_object(
          'documentId', document_hit.document_id,
          'projectId', document_hit.project_id,
          'projectKey', document_hit.project_key,
          'projectName', document_hit.project_name,
          'projectSlug', document_hit.project_slug,
          'projectViewId', document_hit.project_view_id,
          'rank', document_hit.rank,
          'snippet',
          coalesce(
            nullif(
              ts_headline(
                'english',
                document_hit.search_text,
                search_terms,
                'MaxWords=24, MinWords=8, MaxFragments=1, FragmentDelimiter=" … ", StartSel="«", StopSel="»"'
              ),
              ''
            ),
            document_hit.title
          ),
          'source', document_hit.source,
          'title', document_hit.title
        ) as payload,
        document_hit.document_id,
        document_hit.rank,
        document_hit.sort_time,
        document_hit.source
      from (
        select
          document.id as document_id,
          workspace_project.id as project_id,
          workspace_project.project_key,
          workspace_project.name as project_name,
          workspace_project.slug as project_slug,
          document.project_view_id as project_view_id,
          document.title,
          document.content_md as search_text,
          document.updated_at as sort_time,
          'document'::text as source,
          ts_rank_cd(
            to_tsvector(
              'english',
              btrim(coalesce(document.title, '') || ' ' || coalesce(document.content_md, ''))
            ),
            search_terms
          ) as rank
        from public.documents document
        join workspace_projects workspace_project
          on workspace_project.id = document.project_id
        where to_tsvector(
          'english',
          btrim(coalesce(document.title, '') || ' ' || coalesce(document.content_md, ''))
        ) @@ search_terms

        union all

        select
          document.id as document_id,
          workspace_project.id as project_id,
          workspace_project.project_key,
          workspace_project.name as project_name,
          workspace_project.slug as project_slug,
          document.project_view_id as project_view_id,
          document.title,
          document_comment.body_text as search_text,
          document_comment.created_at as sort_time,
          'comment'::text as source,
          ts_rank_cd(
            to_tsvector('english', coalesce(document_comment.body_text, '')),
            search_terms
          ) as rank
        from public.document_comments document_comment
        join public.documents document
          on document.id = document_comment.document_id
        join workspace_projects workspace_project
          on workspace_project.id = document.project_id
        where to_tsvector('english', coalesce(document_comment.body_text, '')) @@ search_terms
      ) document_hit
      order by document_hit.rank desc, document_hit.sort_time desc, document_hit.document_id asc
      limit 24
    )
    select jsonb_build_object(
      'cards',
      coalesce(
        (
          select jsonb_agg(card_match.payload order by card_match.rank desc, card_match.updated_at desc, card_match.id asc)
          from card_matches card_match
        ),
        '[]'::jsonb
      ),
      'documents',
      coalesce(
        (
          select jsonb_agg(
            document_match.payload
            order by document_match.rank desc, document_match.sort_time desc, document_match.source asc
          )
          from document_matches document_match
        ),
        '[]'::jsonb
      )
    )
  );
end;
$$;

revoke all on function public.search_workspace_content(uuid, text) from public;

grant execute on function public.search_workspace_content(uuid, text) to authenticated;

create or replace function public.search_accessible_content(target_query text)
returns table(cards jsonb, documents jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_query text := nullif(trim(coalesce(target_query, '')), '');
  search_terms tsquery;
  ref_match text[];
  ref_key text;
  ref_number int;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to search Rocketboard.';
  end if;

  if normalized_query is null then
    return query select '[]'::jsonb, '[]'::jsonb;
    return;
  end if;

  -- Card reference fast path: exact match (e.g., "PROJ-123")
  ref_match := regexp_match(normalized_query, '^([A-Za-z]+)-([0-9]+)$');
  if ref_match is not null then
    ref_key := upper(ref_match[1]);
    ref_number := ref_match[2]::int;
    return query
      select
        coalesce(
          (
            select jsonb_agg(jsonb_build_object(
              'card_id', card.id,
              'priority_option_id', card.priority_option_id,
              'org_slug', org.slug,
              'project_id', project.id,
              'project_key', project.project_key,
              'project_card_number', card.project_card_number,
              'card_ref', public.format_card_ref(project.project_key, card.project_card_number),
              'project_name', project.name,
              'project_slug', project.slug,
              'rank', 1.0,
              'snippet', card.title,
              'status_option_id', card.status_option_id,
              'title', card.title,
              'workspace_id', workspace.id,
              'workspace_name', workspace.name,
              'workspace_slug', workspace.slug
            ))
            from public.cards card
            join public.projects project on project.id = card.project_id
            join public.workspaces workspace on workspace.id = project.workspace_id
            join public.organizations org on org.id = workspace.organization_id
            where public.can_access_project(project.id, auth.uid())
              and upper(project.project_key) = ref_key
              and card.project_card_number = ref_number
          ),
          '[]'::jsonb
        ),
        '[]'::jsonb;
    return;
  end if;

  -- Card reference fast path: partial match (e.g., "PROJ-")
  ref_match := regexp_match(normalized_query, '^([A-Za-z]+)-$');
  if ref_match is not null then
    ref_key := upper(ref_match[1]);
    return query
      select
        coalesce(
          (
            select jsonb_agg(row_payload order by row_updated desc, row_id asc)
            from (
              select
                jsonb_build_object(
                  'card_id', card.id,
                  'priority_option_id', card.priority_option_id,
                  'org_slug', org.slug,
                  'project_id', project.id,
                  'project_key', project.project_key,
                  'project_card_number', card.project_card_number,
                  'card_ref', public.format_card_ref(project.project_key, card.project_card_number),
                  'project_name', project.name,
                  'project_slug', project.slug,
                  'rank', 0.5,
                  'snippet', card.title,
                  'status_option_id', card.status_option_id,
                  'title', card.title,
                  'workspace_id', workspace.id,
                  'workspace_name', workspace.name,
                  'workspace_slug', workspace.slug
                ) as row_payload,
                card.updated_at as row_updated,
                card.id as row_id
              from public.cards card
              join public.projects project on project.id = card.project_id
              join public.workspaces workspace on workspace.id = project.workspace_id
              join public.organizations org on org.id = workspace.organization_id
              where public.can_access_project(project.id, auth.uid())
                and upper(project.project_key) = ref_key
              order by card.updated_at desc, card.id asc
              limit 20
            ) sub
          ),
          '[]'::jsonb
        ),
        '[]'::jsonb;
    return;
  end if;

  search_terms := plainto_tsquery('english', normalized_query);

  return query
    with accessible_projects as (
      select
        project.id,
        project.name,
        project.slug,
        project.project_key,
        workspace.id as workspace_id,
        workspace.name as workspace_name,
        workspace.slug as workspace_slug,
        org.slug as org_slug
      from public.projects project
      join public.workspaces workspace
        on workspace.id = project.workspace_id
      join public.organizations org
        on org.id = workspace.organization_id
      where public.can_access_project(project.id, auth.uid())
    ),
    card_matches as (
      select
        jsonb_build_object(
          'card_id', card.id,
          'priority_option_id', card.priority_option_id,
          'org_slug', accessible_project.org_slug,
          'project_id', accessible_project.id,
          'project_key', accessible_project.project_key,
          'project_card_number', card.project_card_number,
          'card_ref', public.format_card_ref(accessible_project.project_key, card.project_card_number),
          'project_name', accessible_project.name,
          'project_slug', accessible_project.slug,
          'rank',
          ts_rank_cd(
            to_tsvector(
              'english',
              public.card_search_text(card.title, card.body_md, card.tags)
            ),
            search_terms
          ),
          'snippet',
          coalesce(
            nullif(
              ts_headline(
                'english',
                public.card_search_text(card.title, card.body_md, card.tags),
                search_terms,
                'MaxWords=18, MinWords=8, MaxFragments=1, FragmentDelimiter=" … ", StartSel="«", StopSel="»"'
              ),
              ''
            ),
            card.title
          ),
          'status_option_id', card.status_option_id,
          'title', card.title,
          'workspace_id', accessible_project.workspace_id,
          'workspace_name', accessible_project.workspace_name,
          'workspace_slug', accessible_project.workspace_slug
        ) as payload,
        card.id,
        card.updated_at,
        ts_rank_cd(
          to_tsvector(
            'english',
            public.card_search_text(card.title, card.body_md, card.tags)
          ),
          search_terms
        ) as rank
      from public.cards card
      join accessible_projects accessible_project
        on accessible_project.id = card.project_id
      where
        to_tsvector(
          'english',
          public.card_search_text(card.title, card.body_md, card.tags)
        ) @@ search_terms
        or exists (
          select 1
          from unnest(card.tags) tag
          where lower(tag) like '%' || normalized_query || '%'
        )
      order by rank desc, card.updated_at desc, card.id asc
      limit 30
    ),
    document_matches as (
      select
        jsonb_build_object(
          'document_id', document_hit.document_id,
          'org_slug', document_hit.org_slug,
          'project_id', document_hit.project_id,
          'project_key', document_hit.project_key,
          'project_name', document_hit.project_name,
          'project_slug', document_hit.project_slug,
          'project_view_id', document_hit.project_view_id,
          'rank', document_hit.rank,
          'snippet',
          coalesce(
            nullif(
              ts_headline(
                'english',
                document_hit.search_text,
                search_terms,
                'MaxWords=24, MinWords=8, MaxFragments=1, FragmentDelimiter=" … ", StartSel="«", StopSel="»"'
              ),
              ''
            ),
            document_hit.title
          ),
          'source', document_hit.source,
          'title', document_hit.title,
          'workspace_id', document_hit.workspace_id,
          'workspace_name', document_hit.workspace_name,
          'workspace_slug', document_hit.workspace_slug
        ) as payload,
        document_hit.document_id,
        document_hit.rank,
        document_hit.sort_time,
        document_hit.source
      from (
        select
          document.id as document_id,
          accessible_project.org_slug,
          accessible_project.id as project_id,
          accessible_project.project_key,
          accessible_project.name as project_name,
          accessible_project.slug as project_slug,
          document.project_view_id as project_view_id,
          accessible_project.workspace_id,
          accessible_project.workspace_name,
          accessible_project.workspace_slug,
          document.title,
          document.content_md as search_text,
          document.updated_at as sort_time,
          'document'::text as source,
          ts_rank_cd(
            to_tsvector(
              'english',
              btrim(coalesce(document.title, '') || ' ' || coalesce(document.content_md, ''))
            ),
            search_terms
          ) as rank
        from public.documents document
        join accessible_projects accessible_project
          on accessible_project.id = document.project_id
        where to_tsvector(
          'english',
          btrim(coalesce(document.title, '') || ' ' || coalesce(document.content_md, ''))
        ) @@ search_terms

        union all

        select
          document.id as document_id,
          accessible_project.org_slug,
          accessible_project.id as project_id,
          accessible_project.project_key,
          accessible_project.name as project_name,
          accessible_project.slug as project_slug,
          document.project_view_id as project_view_id,
          accessible_project.workspace_id,
          accessible_project.workspace_name,
          accessible_project.workspace_slug,
          document.title,
          document_comment.body_text as search_text,
          document_comment.created_at as sort_time,
          'comment'::text as source,
          ts_rank_cd(
            to_tsvector('english', coalesce(document_comment.body_text, '')),
            search_terms
          ) as rank
        from public.document_comments document_comment
        join public.documents document
          on document.id = document_comment.document_id
        join accessible_projects accessible_project
          on accessible_project.id = document.project_id
        where to_tsvector('english', coalesce(document_comment.body_text, '')) @@ search_terms
      ) document_hit
      order by document_hit.rank desc, document_hit.sort_time desc, document_hit.document_id asc
      limit 30
    )
    select
      coalesce(
        (
          select jsonb_agg(card_match.payload order by card_match.rank desc, card_match.updated_at desc, card_match.id asc)
          from card_matches card_match
        ),
        '[]'::jsonb
      ),
      coalesce(
        (
          select jsonb_agg(
            document_match.payload
            order by document_match.rank desc, document_match.sort_time desc, document_match.source asc
          )
          from document_matches document_match
        ),
        '[]'::jsonb
      );
end;
$$;

revoke all on function public.search_accessible_content(text) from public;

grant execute on function public.search_accessible_content(text) to authenticated;

create or replace function public.search_my_notes(target_query text)
returns table(notes jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_query text := nullif(trim(coalesce(target_query, '')), '');
  search_terms tsquery;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to search your notes.';
  end if;

  if normalized_query is null then
    return query select '[]'::jsonb;
    return;
  end if;

  search_terms := plainto_tsquery('english', normalized_query);

  return query
    with note_matches as (
      select
        jsonb_build_object(
          'note_id', note.id,
          'folder_id', note.folder_id,
          'folder_name', coalesce(folder.name, 'Unfiled'),
          'rank', note_match.rank,
          'snippet',
          coalesce(
            nullif(
              ts_headline(
                'english',
                note_match.snippet_source,
                search_terms,
                'MaxWords=24, MinWords=8, MaxFragments=1, FragmentDelimiter=" … ", StartSel="«", StopSel="»"'
              ),
              ''
            ),
            public.note_display_title(note.title, note.content_md)
          ),
          'title', public.note_display_title(note.title, note.content_md),
          'updated_at', coalesce(note.source_updated_at, note.updated_at)
        ) as payload,
        note.id,
        coalesce(note.source_updated_at, note.updated_at) as updated_at,
        note_match.rank
      from public.notes note
      left join public.note_folders folder
        on folder.id = note.folder_id
        and folder.user_id = note.user_id
      cross join lateral (
        select
          greatest(
            ts_rank_cd(
              to_tsvector(
                'english',
                public.note_search_text(note.title, note.content_md)
              ),
              search_terms
            ),
            ts_rank_cd(
              to_tsvector('english', coalesce(folder.name, '')),
              search_terms
            )
          ) as rank,
          case
            when to_tsvector('english', coalesce(folder.name, '')) @@ search_terms
              and not (
                to_tsvector(
                  'english',
                  public.note_search_text(note.title, note.content_md)
                ) @@ search_terms
              )
            then coalesce(folder.name, 'Unfiled')
            else public.note_search_text(note.title, note.content_md)
          end as snippet_source
      ) note_match
      where note.user_id = auth.uid()
        and note.deleted_at is null
        and (
          to_tsvector(
            'english',
            public.note_search_text(note.title, note.content_md)
          ) @@ search_terms
          or to_tsvector('english', coalesce(folder.name, '')) @@ search_terms
        )
      order by note_match.rank desc, coalesce(note.source_updated_at, note.updated_at) desc, note.id asc
      limit 24
    )
    select
      coalesce(
        (
          select jsonb_agg(
            note_match.payload
            order by note_match.rank desc, note_match.updated_at desc, note_match.id asc
          )
          from note_matches note_match
        ),
        '[]'::jsonb
      );
end;
$$;

revoke all on function public.search_my_notes(text) from public;

grant execute on function public.search_my_notes(text) to authenticated;
