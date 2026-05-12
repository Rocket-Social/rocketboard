-- Project views: view config, canvas elements, table/board/gantt/overview config RPCs, shell summary.
-- Canonical greenfield owner file. Modify in place.

create table public.canvas_elements (
  id uuid primary key default gen_random_uuid(),
  project_view_id uuid not null references public.project_views (id) on delete cascade,
  element_type text not null check (element_type in ('note', 'shape', 'drawing', 'image', 'comment', 'text')),
  x float8 not null default 0,
  y float8 not null default 0,
  width float8 not null default 200,
  height float8 not null default 150,
  z_index integer not null default 0,
  content text,
  url text,
  path_data text,
  style jsonb not null default '{}'::jsonb,
  is_resolved boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint canvas_elements_style_object check (jsonb_typeof(style) = 'object')
);

create index canvas_elements_view_id_idx on public.canvas_elements (project_view_id, z_index);

create trigger canvas_elements_set_updated_at
before update on public.canvas_elements
for each row execute function public.set_updated_at();

alter table public.canvas_elements enable row level security;

alter table public.canvas_elements replica identity full;

grant select on public.canvas_elements to authenticated;

create policy canvas_elements_select_for_members
on public.canvas_elements
for select
to authenticated
using (
  exists (
    select 1
    from public.project_views project_view
    where project_view.id = canvas_elements.project_view_id
      and project_view.view_type = 'canvas'
      and public.can_access_project(project_view.project_id)
  )
);

create policy canvas_elements_insert_for_members on public.canvas_elements
  for insert to authenticated with check (
    exists (
      select 1 from public.project_views pv
      where pv.id = canvas_elements.project_view_id
        and pv.view_type = 'canvas'
        and public.can_edit_project(pv.project_id)
    )
  );

create policy canvas_elements_update_for_members on public.canvas_elements
  for update to authenticated using (
    exists (
      select 1 from public.project_views pv
      where pv.id = canvas_elements.project_view_id
        and pv.view_type = 'canvas'
        and public.can_edit_project(pv.project_id)
    )
  );

create policy canvas_elements_delete_for_members on public.canvas_elements
  for delete to authenticated using (
    exists (
      select 1 from public.project_views pv
      where pv.id = canvas_elements.project_view_id
        and pv.view_type = 'canvas'
        and public.can_edit_project(pv.project_id)
    )
  );

create function public.project_route_payload(target_project_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'orgSlug',
    org.slug,
    'workspaceSlug',
    workspace.slug,
    'projectSlug',
    project.slug,
    'viewId',
    coalesce(
      (
        select project_view.id::text
        from public.project_views project_view
        where project_view.project_id = project.id
          and project_view.is_default
        order by project_view.position asc, project_view.created_at asc, project_view.id asc
        limit 1
      ),
      (
        select project_view.id::text
        from public.project_views project_view
        where project_view.project_id = project.id
        order by project_view.position asc, project_view.created_at asc, project_view.id asc
        limit 1
      ),
      'overview'
    )
  )
  from public.projects project
  join public.workspaces workspace
    on workspace.id = project.workspace_id
  join public.organizations org
    on org.id = workspace.organization_id
  where project.id = target_project_id;
$$;

revoke all on function public.project_route_payload(uuid) from public;

create function public.create_default_project_views(
  target_project_id uuid,
  target_user_id uuid default auth.uid(),
  target_starter_view_types public.project_view_type[] default null,
  target_default_starter_view_type public.project_view_type default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_view_types public.project_view_type[];
  normalized_default_view_type public.project_view_type;
begin
  select coalesce(
    array_agg(
      entry.view_type
      order by case entry.view_type
        when 'overview' then 0
        when 'table' then 1
        when 'kanban' then 2
        when 'gantt' then 3
        when 'document' then 4
        when 'github' then 5
        when 'canvas' then 6
      end asc
    ),
    array['overview'::public.project_view_type, 'table'::public.project_view_type, 'kanban'::public.project_view_type]
  )
    into normalized_view_types
  from (
    select
      normalized_entry.view_type,
      min(normalized_entry.ordinality) as first_ordinality
    from (
      select
        coalesce(source_entry.view_type, 'overview'::public.project_view_type) as view_type,
        source_entry.ordinality
      from unnest(
        case
          when target_starter_view_types is null or cardinality(target_starter_view_types) = 0 then
            array['overview'::public.project_view_type, 'table'::public.project_view_type, 'kanban'::public.project_view_type]
          else
            case
              when 'overview'::public.project_view_type = any(target_starter_view_types) then target_starter_view_types
              else array_prepend('overview'::public.project_view_type, target_starter_view_types)
            end
        end
      ) with ordinality as source_entry(view_type, ordinality)
    ) normalized_entry
    group by normalized_entry.view_type
  ) entry;

  normalized_default_view_type :=
    case
      when target_default_starter_view_type is not null
        and target_default_starter_view_type = any(normalized_view_types)
        then target_default_starter_view_type
      when cardinality(normalized_view_types) > 1
        and 'table'::public.project_view_type = any(normalized_view_types)
        then 'table'::public.project_view_type
      else normalized_view_types[1]
    end;

  with inserted_views as (
    insert into public.project_views (
      project_id,
      name,
      view_type,
      position,
      is_default,
      shared_config,
      created_by_user_id,
      updated_by_user_id
    )
    select
      target_project_id,
      case
        when entry.view_type = 'overview' then 'Overview'
        when entry.view_type = 'table' then 'Table'
        when entry.view_type = 'kanban' then 'Kanban'
        when entry.view_type = 'gantt' then 'Gantt'
        when entry.view_type = 'document' then 'Document'
        when entry.view_type = 'github' then 'GitHub'
        when entry.view_type = 'canvas' then 'Canvas'
      end,
      entry.view_type,
      entry.ordinality - 1,
      entry.view_type = normalized_default_view_type,
      case
        when entry.view_type = 'table' then public.default_table_shared_config()
        else '{}'::jsonb
      end,
      target_user_id,
      target_user_id
    from unnest(normalized_view_types) with ordinality as entry(view_type, ordinality)
    returning id, name, view_type
  ),
  inserted_documents as (
    insert into public.documents (
      project_id,
      project_view_id,
      title,
      content_md,
      created_by_user_id,
      updated_by_user_id
    )
    select
      target_project_id,
      inserted_view.id,
      inserted_view.name,
      '',
      target_user_id,
      target_user_id
    from inserted_views inserted_view
    where inserted_view.view_type = 'document'
    returning id, title
  )
  insert into public.document_versions (
    document_id,
    version,
    title,
    content_md,
    created_by_user_id
  )
  select
    inserted_document.id,
    1,
    inserted_document.title,
    '',
    target_user_id
  from inserted_documents inserted_document;
end;
$$;

revoke all on function public.create_default_project_views(uuid, uuid, public.project_view_type[], public.project_view_type) from public;

create or replace function public.project_view_payload(target_project_view_id uuid)
returns table (
  id uuid,
  name text,
  view_type text,
  is_default boolean,
  "position" integer,
  is_hidden boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    project_view.id,
    project_view.name,
    project_view.view_type::text,
    project_view.is_default,
    project_view.position,
    coalesce((project_view_user_config.config ->> 'hidden')::boolean, false) as is_hidden
  from public.project_views project_view
  left join public.project_view_user_configs project_view_user_config
    on project_view_user_config.project_view_id = project_view.id
   and project_view_user_config.user_id = auth.uid()
  where project_view.id = target_project_view_id;
$$;

create or replace function public.set_project_view_hidden(
  target_project_view_id uuid,
  target_hidden boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project_view public.project_views%rowtype;
begin
  select *
    into target_project_view
  from public.project_views project_view
  where project_view.id = target_project_view_id;

  if target_project_view.id is null or not public.can_edit_project(target_project_view.project_id, auth.uid()) then
    raise exception 'You do not have access to update this view.';
  end if;

  insert into public.project_view_user_configs (
    project_view_id,
    user_id,
    config,
    base_shared_version
  )
  values (
    target_project_view_id,
    auth.uid(),
    jsonb_build_object('hidden', target_hidden),
    target_project_view.version
  )
  on conflict on constraint project_view_user_configs_view_user_key
  do update
    set
      config = jsonb_set(
        coalesce(public.project_view_user_configs.config, '{}'::jsonb),
        '{hidden}',
        to_jsonb(target_hidden),
        true
      ),
      base_shared_version = coalesce(public.project_view_user_configs.base_shared_version, excluded.base_shared_version),
      updated_at = timezone('utc', now());
end;
$$;

create or replace function public.create_canvas_element(
  target_project_view_id uuid,
  target_element_type text,
  target_x float8 default 0,
  target_y float8 default 0,
  target_width float8 default 200,
  target_height float8 default 150,
  target_z_index integer default null,
  target_content text default null,
  target_url text default null,
  target_path_data text default null,
  target_style jsonb default '{}'::jsonb,
  target_is_resolved boolean default false
)
returns public.canvas_elements
language plpgsql
security definer
set search_path = public
as $$
declare
  created_element public.canvas_elements%rowtype;
  next_z_index integer;
  normalized_element_type text := lower(trim(coalesce(target_element_type, '')));
  target_project_view public.project_views%rowtype;
begin
  select *
    into target_project_view
  from public.project_views project_view
  where project_view.id = target_project_view_id;

  if target_project_view.id is null or target_project_view.view_type <> 'canvas' then
    raise exception 'CANVAS_VIEW_NOT_FOUND';
  end if;

  if not public.can_edit_project(target_project_view.project_id, auth.uid()) then
    raise exception 'You do not have permission to edit this canvas.';
  end if;

  if normalized_element_type not in ('note', 'shape', 'drawing', 'image', 'comment', 'text') then
    raise exception 'Canvas element type is invalid.';
  end if;

  if target_width <= 0 or target_height <= 0 then
    raise exception 'Canvas elements must have positive dimensions.';
  end if;

  if target_style is null or jsonb_typeof(target_style) <> 'object' then
    raise exception 'Canvas style must be a JSON object.';
  end if;

  select coalesce(max(canvas_element.z_index), -1) + 1
    into next_z_index
  from public.canvas_elements canvas_element
  where canvas_element.project_view_id = target_project_view_id;

  insert into public.canvas_elements (
    project_view_id,
    element_type,
    x,
    y,
    width,
    height,
    z_index,
    content,
    url,
    path_data,
    style,
    is_resolved,
    created_by
  )
  values (
    target_project_view_id,
    normalized_element_type,
    target_x,
    target_y,
    target_width,
    target_height,
    coalesce(target_z_index, next_z_index),
    target_content,
    target_url,
    target_path_data,
    target_style,
    coalesce(target_is_resolved, false),
    auth.uid()
  )
  returning * into created_element;

  return created_element;
end;
$$;

create or replace function public.update_canvas_element(
  target_element_id uuid,
  target_x float8 default null,
  target_y float8 default null,
  target_width float8 default null,
  target_height float8 default null,
  target_z_index integer default null,
  target_content text default null,
  target_url text default null,
  target_path_data text default null,
  target_style jsonb default null,
  target_is_resolved boolean default null
)
returns public.canvas_elements
language plpgsql
security definer
set search_path = public
as $$
declare
  target_canvas_element public.canvas_elements%rowtype;
  target_project_view public.project_views%rowtype;
  updated_element public.canvas_elements%rowtype;
begin
  select *
    into target_canvas_element
  from public.canvas_elements canvas_element
  where canvas_element.id = target_element_id;

  if target_canvas_element.id is null then
    raise exception 'CANVAS_ELEMENT_NOT_FOUND';
  end if;

  select *
    into target_project_view
  from public.project_views project_view
  where project_view.id = target_canvas_element.project_view_id;

  if target_project_view.id is null or target_project_view.view_type <> 'canvas' then
    raise exception 'CANVAS_VIEW_NOT_FOUND';
  end if;

  if not public.can_edit_project(target_project_view.project_id, auth.uid()) then
    raise exception 'You do not have permission to edit this canvas.';
  end if;

  if coalesce(target_width, target_canvas_element.width) <= 0 or coalesce(target_height, target_canvas_element.height) <= 0 then
    raise exception 'Canvas elements must have positive dimensions.';
  end if;

  if target_style is not null and jsonb_typeof(target_style) <> 'object' then
    raise exception 'Canvas style must be a JSON object.';
  end if;

  update public.canvas_elements
  set
    x = coalesce(target_x, x),
    y = coalesce(target_y, y),
    width = coalesce(target_width, width),
    height = coalesce(target_height, height),
    z_index = coalesce(target_z_index, z_index),
    content = coalesce(target_content, content),
    url = coalesce(target_url, url),
    path_data = coalesce(target_path_data, path_data),
    style = coalesce(target_style, style),
    is_resolved = coalesce(target_is_resolved, is_resolved),
    updated_at = timezone('utc', now())
  where id = target_element_id
  returning * into updated_element;

  return updated_element;
end;
$$;

create or replace function public.delete_canvas_element(target_element_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_canvas_element public.canvas_elements%rowtype;
  target_project_view public.project_views%rowtype;
begin
  select *
    into target_canvas_element
  from public.canvas_elements canvas_element
  where canvas_element.id = target_element_id;

  if target_canvas_element.id is null then
    raise exception 'CANVAS_ELEMENT_NOT_FOUND';
  end if;

  select *
    into target_project_view
  from public.project_views project_view
  where project_view.id = target_canvas_element.project_view_id;

  if target_project_view.id is null or target_project_view.view_type <> 'canvas' then
    raise exception 'CANVAS_VIEW_NOT_FOUND';
  end if;

  if not public.can_edit_project(target_project_view.project_id, auth.uid()) then
    raise exception 'You do not have permission to edit this canvas.';
  end if;

  delete from public.canvas_elements
  where id = target_element_id;

end;
$$;

create or replace function public.set_project_view_default(target_project_view_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project_view public.project_views%rowtype;
begin
  select *
    into target_project_view
  from public.project_views project_view
  where project_view.id = target_project_view_id;

  if target_project_view.id is null or not public.can_edit_project(target_project_view.project_id, auth.uid()) then
    raise exception 'You do not have permission to update this view.';
  end if;

  update public.project_views
  set
    is_default = false,
    updated_by_user_id = auth.uid(),
    updated_at = timezone('utc', now())
  where project_id = target_project_view.project_id
    and is_default
    and id <> target_project_view_id;

  update public.project_views
  set
    is_default = true,
    updated_by_user_id = auth.uid(),
    updated_at = timezone('utc', now())
  where id = target_project_view_id;

end;
$$;

create or replace function public.reorder_project_views(
  target_project_id uuid,
  target_view_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to update this project.';
  end if;

  with normalized_target_ids as (
    select
      entry.view_id,
      min(entry.ordinality) as first_ordinality
    from unnest(coalesce(target_view_ids, '{}'::uuid[])) with ordinality as entry(view_id, ordinality)
    join public.project_views project_view
      on project_view.id = entry.view_id
     and project_view.project_id = target_project_id
    group by entry.view_id
  ),
  final_order as (
    select
      project_view.id,
      coalesce(
        normalized_target_ids.first_ordinality,
        1000000 + row_number() over (order by project_view.position asc, project_view.created_at asc, project_view.id asc)
      ) as sort_key
    from public.project_views project_view
    left join normalized_target_ids
      on normalized_target_ids.view_id = project_view.id
    where project_view.project_id = target_project_id
  ),
  ranked_order as (
    select
      final_order.id,
      row_number() over (order by final_order.sort_key asc, final_order.id asc) - 1 as next_position
    from final_order
  )
  update public.project_views project_view
  set
    position = ranked_order.next_position,
    updated_by_user_id = auth.uid(),
    updated_at = timezone('utc', now())
  from ranked_order
  where project_view.id = ranked_order.id;

end;
$$;

revoke all on function public.project_route_payload(uuid) from public;

grant execute on function public.project_route_payload(uuid) to authenticated;

revoke all on function public.create_canvas_element(uuid, text, float8, float8, float8, float8, integer, text, text, text, jsonb, boolean) from public;

grant execute on function public.create_canvas_element(uuid, text, float8, float8, float8, float8, integer, text, text, text, jsonb, boolean) to authenticated;

revoke all on function public.update_canvas_element(uuid, float8, float8, float8, float8, integer, text, text, text, jsonb, boolean) from public;

grant execute on function public.update_canvas_element(uuid, float8, float8, float8, float8, integer, text, text, text, jsonb, boolean) to authenticated;

revoke all on function public.delete_canvas_element(uuid) from public;

grant execute on function public.delete_canvas_element(uuid) to authenticated;

revoke all on function public.set_project_view_default(uuid) from public;

grant execute on function public.set_project_view_default(uuid) to authenticated;

revoke all on function public.set_project_view_hidden(uuid, boolean) from public;

grant execute on function public.set_project_view_hidden(uuid, boolean) to authenticated;

revoke all on function public.reorder_project_views(uuid, uuid[]) from public;

grant execute on function public.reorder_project_views(uuid, uuid[]) to authenticated;

create or replace function public.default_table_visible_field_keys()
returns text[]
language sql
immutable
as $$
  select array['assignee', 'due_date', 'status', 'effort', 'priority']::text[];
$$;

create or replace function public.optional_table_field_keys()
returns text[]
language sql
immutable
as $$
  select array[
    'assignee',
    'start_date',
    'due_date',
    'group',
    'status',
    'priority',
    'effort',
    'tags'
  ]::text[];
$$;

create or replace function public.jsonb_text_array(target_value jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(
    (
      select array_agg(entry.value order by entry.ordinality)
      from jsonb_array_elements_text(
        case
          when jsonb_typeof(target_value) = 'array' then target_value
          else '[]'::jsonb
        end
      ) with ordinality as entry(value, ordinality)
    ),
    '{}'::text[]
  );
$$;

create or replace function public.normalize_table_visible_field_keys(
  target_project_id uuid,
  target_visible_field_keys text[]
)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  allowed_keys text[];
  normalized_keys text[];
begin
  allowed_keys := public.optional_table_field_keys()
    || coalesce(
      (
        select array_agg(field_definition.key order by field_definition.position asc, field_definition.created_at asc, field_definition.id asc)
        from public.field_definitions field_definition
        where field_definition.project_id = target_project_id
          and field_definition.archived_at is null
      ),
      '{}'::text[]
    );

  select coalesce(
    (
      select array_agg(entry.key order by entry.first_ordinality)
      from (
        select
          normalized_entry.key,
          min(normalized_entry.ordinality) as first_ordinality
        from (
          select
            lower(trim(field_key)) as key,
            ordinality
          from unnest(coalesce(target_visible_field_keys, '{}'::text[])) with ordinality as entry(field_key, ordinality)
          where length(trim(field_key)) > 0
            and lower(trim(field_key)) = any(allowed_keys)
        ) normalized_entry
        group by normalized_entry.key
      ) entry
    ),
    '{}'::text[]
  )
    into normalized_keys;

  if cardinality(normalized_keys) = 0 then
    return public.default_table_visible_field_keys();
  end if;

  return normalized_keys;
end;
$$;

create or replace function public.normalize_table_filters(target_filters jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  normalized_priority text[];
  normalized_status text[];
begin
  normalized_status := array_remove(array[
    case when exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(target_filters -> 'status') = 'array' then target_filters -> 'status' else '[]'::jsonb end) as entry(value) where entry.value = 'todo') then 'todo' end,
    case when exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(target_filters -> 'status') = 'array' then target_filters -> 'status' else '[]'::jsonb end) as entry(value) where entry.value = 'in_progress') then 'in_progress' end,
    case when exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(target_filters -> 'status') = 'array' then target_filters -> 'status' else '[]'::jsonb end) as entry(value) where entry.value = 'in_review') then 'in_review' end,
    case when exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(target_filters -> 'status') = 'array' then target_filters -> 'status' else '[]'::jsonb end) as entry(value) where entry.value = 'done') then 'done' end,
    case when exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(target_filters -> 'status') = 'array' then target_filters -> 'status' else '[]'::jsonb end) as entry(value) where entry.value = 'blocked') then 'blocked' end
  ], null);

  normalized_priority := coalesce(
    array(select entry.value from jsonb_array_elements_text(
      case when jsonb_typeof(target_filters -> 'priority') = 'array'
        then target_filters -> 'priority'
        else '[]'::jsonb
      end
    ) as entry(value)
    where length(trim(entry.value)) > 0),
    '{}'::text[]
  );

  return jsonb_build_object(
    'status', to_jsonb(coalesce(normalized_status, '{}'::text[])),
    'priority', to_jsonb(coalesce(normalized_priority, '{}'::text[]))
  );
end;
$$;

create or replace function public.normalize_table_sort(target_sort jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  normalized_direction text := lower(trim(coalesce(target_sort ->> 'direction', 'asc')));
  normalized_field_key text := lower(trim(coalesce(target_sort ->> 'fieldKey', '')));
begin
  if normalized_field_key = '' or not normalized_field_key = any(public.table_sort_field_keys()) then
    return null;
  end if;

  if normalized_direction not in ('asc', 'desc') then
    normalized_direction := 'asc';
  end if;

  return jsonb_build_object(
    'fieldKey', normalized_field_key,
    'direction', normalized_direction
  );
end;
$$;

create or replace function public.normalize_table_column_widths(
  target_project_id uuid,
  target_column_widths jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  allowed_keys text[];
begin
  allowed_keys := array['title']::text[]
    || public.optional_table_field_keys()
    || coalesce(
      (
        select array_agg(field_definition.key order by field_definition.position asc, field_definition.created_at asc, field_definition.id asc)
        from public.field_definitions field_definition
        where field_definition.project_id = target_project_id
          and field_definition.archived_at is null
      ),
      '{}'::text[]
    );

  return coalesce(
    (
      select jsonb_object_agg(entry.key, entry.width)
      from (
        select
          lower(trim(config_entry.key)) as key,
          greatest(96, least(config_entry.value::integer, 360)) as width
        from jsonb_each_text(
          case
            when jsonb_typeof(target_column_widths) = 'object' then target_column_widths
            else '{}'::jsonb
          end
        ) as config_entry(key, value)
        where lower(trim(config_entry.key)) = any(allowed_keys)
          and trim(config_entry.value) ~ '^[0-9]+$'
      ) entry
    ),
    '{}'::jsonb
  );
end;
$$;

create or replace function public.default_table_shared_config()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'groupBy', 'group',
    'sort', null,
    'filters', public.normalize_table_filters(null),
    'taskMode', 'standard',
    'visibleFieldKeys', to_jsonb(public.default_table_visible_field_keys()),
    'personFilterUserId', null
  );
$$;

create or replace function public.ensure_project_table_view(
  target_project_id uuid,
  target_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_view_id uuid;
begin
  if target_user_id is null then
    raise exception 'You must be signed in to access this view.';
  end if;

  if not public.can_edit_project(target_project_id, target_user_id) then
    raise exception 'You do not have access to update this view.';
  end if;

  select project_view.id
    into target_view_id
  from public.project_views project_view
  where project_view.project_id = target_project_id
    and project_view.view_type = 'table'
  order by project_view.position asc, project_view.created_at asc, project_view.id asc
  limit 1;

  if target_view_id is not null then
    return target_view_id;
  end if;

  insert into public.project_views (
    project_id,
    name,
    view_type,
    position,
    is_default,
    shared_config,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    target_project_id,
    'Table view',
    'table',
    coalesce(
      (
        select max(project_view.position) + 1
        from public.project_views project_view
        where project_view.project_id = target_project_id
      ),
      0
    ),
    false,
    public.default_table_shared_config(),
    target_user_id,
    target_user_id
  )
  returning id into target_view_id;

  return target_view_id;
end;
$$;

revoke all on function public.ensure_project_table_view(uuid, uuid) from public;

create function public.get_project_table_view_state(target_project_id uuid)
returns table (
  project_view_id uuid,
  shared_group_by text,
  shared_person_filter_user_id uuid,
  shared_sort jsonb,
  shared_filters jsonb,
  shared_visible_field_keys text[],
  shared_task_mode text,
  shared_version integer,
  personal_collapsed_groups text[],
  personal_column_widths jsonb,
  base_shared_version integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  with authorized as (
    select public.can_access_project(target_project_id, auth.uid()) as allowed
  ),
  target_view as (
    select
      project_view.id,
      project_view.shared_config,
      project_view.version as shared_version
    from public.project_views project_view
    where project_view.project_id = target_project_id
      and project_view.view_type = 'table'
    order by project_view.position asc, project_view.created_at asc, project_view.id asc
    limit 1
  ),
  normalized_shared as (
    select
      target_view.id,
      public.normalize_project_table_shared_config(
        target_project_id,
        target_view.shared_config ->> 'groupBy',
        target_view.shared_config -> 'sort',
        target_view.shared_config -> 'filters',
        public.jsonb_text_array(target_view.shared_config -> 'visibleFieldKeys'),
        target_view.shared_config ->> 'taskMode',
        (target_view.shared_config ->> 'personFilterUserId')::uuid
      ) as config,
      target_view.shared_version
    from target_view
  ),
  personal_layout as (
    select
      project_view_user_config.base_shared_version,
      coalesce(
        (
          select array_agg(entry.value order by entry.ordinality)
          from jsonb_array_elements_text(
            case
              when jsonb_typeof(project_view_user_config.config -> 'collapsedGroups') = 'array'
                then project_view_user_config.config -> 'collapsedGroups'
              else '[]'::jsonb
            end
          ) with ordinality as entry(value, ordinality)
        ),
        '{}'::text[]
      ) as collapsed_groups,
      public.normalize_table_column_widths(
        target_project_id,
        project_view_user_config.config -> 'columnWidths'
      ) as column_widths
    from public.project_view_user_configs project_view_user_config
    join target_view
      on target_view.id = project_view_user_config.project_view_id
    where project_view_user_config.user_id = auth.uid()
    limit 1
  )
  select
    normalized_shared.id as project_view_id,
    coalesce(normalized_shared.config ->> 'groupBy', 'group') as shared_group_by,
    (normalized_shared.config ->> 'personFilterUserId')::uuid as shared_person_filter_user_id,
    normalized_shared.config -> 'sort' as shared_sort,
    coalesce(normalized_shared.config -> 'filters', public.normalize_table_filters(null)) as shared_filters,
    public.jsonb_text_array(normalized_shared.config -> 'visibleFieldKeys') as shared_visible_field_keys,
    coalesce(normalized_shared.config ->> 'taskMode', 'standard') as shared_task_mode,
    coalesce(normalized_shared.shared_version, 1) as shared_version,
    coalesce(personal_layout.collapsed_groups, '{}'::text[]) as personal_collapsed_groups,
    coalesce(personal_layout.column_widths, '{}'::jsonb) as personal_column_widths,
    coalesce(personal_layout.base_shared_version, coalesce(normalized_shared.shared_version, 1)) as base_shared_version
  from authorized
  left join normalized_shared
    on authorized.allowed
  left join personal_layout
    on authorized.allowed
  where authorized.allowed;
end;
$$;

revoke all on function public.get_project_table_view_state(uuid) from public;

grant execute on function public.get_project_table_view_state(uuid) to authenticated;

create or replace function public.set_project_table_shared_config(
  target_project_id uuid,
  target_group_by text,
  target_sort jsonb default null,
  target_filters jsonb default null,
  target_visible_field_keys text[] default null,
  target_task_mode text default null
)
returns table (
  project_view_id uuid,
  shared_group_by text,
  shared_person_filter_user_id uuid,
  shared_sort jsonb,
  shared_filters jsonb,
  shared_visible_field_keys text[],
  shared_task_mode text,
  shared_version integer,
  personal_collapsed_groups text[],
  personal_column_widths jsonb,
  base_shared_version integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_config jsonb;
  target_view_id uuid;
  existing_person_filter_user_id uuid := null;
  existing_task_mode text := 'standard';
begin
  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'You do not have access to update this view.';
  end if;

  target_view_id := public.ensure_project_table_view(target_project_id, auth.uid());

  begin
    select nullif(trim(coalesce(project_view.shared_config ->> 'personFilterUserId', '')), '')::uuid
      into existing_person_filter_user_id
    from public.project_views project_view
    where project_view.id = target_view_id;
  exception when invalid_text_representation then
    existing_person_filter_user_id := null;
  end;

  select lower(trim(coalesce(project_view.shared_config ->> 'taskMode', 'standard')))
    into existing_task_mode
  from public.project_views project_view
  where project_view.id = target_view_id;

  normalized_config := public.normalize_project_table_shared_config(
    target_project_id,
    target_group_by,
    target_sort,
    target_filters,
    target_visible_field_keys,
    coalesce(target_task_mode, existing_task_mode),
    existing_person_filter_user_id
  );

  update public.project_views
  set
    shared_config = normalized_config,
    version = version + 1,
    updated_by_user_id = auth.uid(),
    updated_at = timezone('utc', now())
  where id = target_view_id;

  return query
  select *
  from public.get_project_table_view_state(target_project_id);
end;
$$;

create or replace function public.set_project_table_group_by(
  target_project_id uuid,
  target_group_by text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_state record;
begin
  select *
    into current_state
  from public.get_project_table_view_state(target_project_id)
  limit 1;

  return (
    select shared_group_by
    from public.set_project_table_shared_config(
      target_project_id,
      target_group_by,
      case when current_state.shared_sort is null then null else current_state.shared_sort end,
      case when current_state.shared_filters is null then null else current_state.shared_filters end,
      case
        when current_state.shared_visible_field_keys is null then null
        else current_state.shared_visible_field_keys
      end,
      current_state.shared_task_mode
    )
    limit 1
  );
end;
$$;

revoke all on function public.set_project_table_group_by(uuid, text) from public;

grant execute on function public.set_project_table_group_by(uuid, text) to authenticated;

create or replace function public.set_project_table_personal_layout(
  target_project_id uuid,
  target_collapsed_groups text[],
  target_column_widths jsonb default '{}'::jsonb
)
returns table (
  project_view_id uuid,
  shared_group_by text,
  shared_person_filter_user_id uuid,
  shared_sort jsonb,
  shared_filters jsonb,
  shared_visible_field_keys text[],
  shared_task_mode text,
  shared_version integer,
  personal_collapsed_groups text[],
  personal_column_widths jsonb,
  base_shared_version integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_view_id uuid;
  normalized_groups text[] := '{}'::text[];
  normalized_widths jsonb := '{}'::jsonb;
  current_shared_version integer := 1;
begin
  target_view_id := public.ensure_project_table_view(target_project_id, auth.uid());
  normalized_widths := public.normalize_table_column_widths(target_project_id, target_column_widths);

  select project_view.version
    into current_shared_version
  from public.project_views project_view
  where project_view.id = target_view_id;

  select coalesce(
    (
      select array_agg(entry.value order by entry.first_ordinality)
      from (
        select
          normalized_entry.value,
          min(normalized_entry.ordinality) as first_ordinality
        from (
          select
            lower(trim(group_id)) as value,
            ordinality
          from unnest(coalesce(target_collapsed_groups, '{}'::text[])) with ordinality as entry(group_id, ordinality)
          where length(trim(group_id)) > 0
        ) normalized_entry
        group by normalized_entry.value
      ) entry
    ),
    '{}'::text[]
  )
    into normalized_groups;

  if cardinality(normalized_groups) = 0 and normalized_widths = '{}'::jsonb then
    delete from public.project_view_user_configs project_view_user_config
    where project_view_user_config.project_view_id = target_view_id
      and project_view_user_config.user_id = auth.uid();
  else
    insert into public.project_view_user_configs (
      project_view_id,
      user_id,
      config,
      base_shared_version
    )
    values (
      target_view_id,
      auth.uid(),
      jsonb_build_object(
        'collapsedGroups', to_jsonb(normalized_groups),
        'columnWidths', normalized_widths
      ),
      current_shared_version
    )
    on conflict on constraint project_view_user_configs_view_user_key
    do update
      set
        config = excluded.config,
        base_shared_version = excluded.base_shared_version,
        updated_at = timezone('utc', now());
  end if;

  return query
  select *
  from public.get_project_table_view_state(target_project_id);
end;
$$;

revoke all on function public.default_table_visible_field_keys() from public;

revoke all on function public.optional_table_field_keys() from public;

revoke all on function public.jsonb_text_array(jsonb) from public;

revoke all on function public.normalize_table_visible_field_keys(uuid, text[]) from public;

revoke all on function public.normalize_table_filters(jsonb) from public;

revoke all on function public.normalize_table_sort(jsonb) from public;

revoke all on function public.normalize_table_column_widths(uuid, jsonb) from public;

revoke all on function public.default_table_shared_config() from public;

revoke all on function public.set_project_table_shared_config(uuid, text, jsonb, jsonb, text[], text) from public;

grant execute on function public.set_project_table_shared_config(uuid, text, jsonb, jsonb, text[], text) to authenticated;

revoke all on function public.get_project_table_view_state(uuid) from public;

grant execute on function public.get_project_table_view_state(uuid) to authenticated;

revoke all on function public.set_project_table_personal_layout(uuid, text[], jsonb) from public;

grant execute on function public.set_project_table_personal_layout(uuid, text[], jsonb) to authenticated;

revoke all on function public.set_project_table_group_by(uuid, text) from public;

grant execute on function public.set_project_table_group_by(uuid, text) to authenticated;

create or replace function public.table_sort_field_keys()
returns text[]
language sql
immutable
as $$
  select array[
    'title',
    'assignee',
    'due_date',
    'group',
    'effort',
    'priority',
    'start_date',
    'status',
    'tags'
  ]::text[];
$$;

revoke all on function public.table_sort_field_keys() from public;

create or replace function public.normalize_project_table_sort(
  target_project_id uuid,
  target_sort jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_direction text := lower(trim(coalesce(target_sort ->> 'direction', 'asc')));
  normalized_field_key text := lower(trim(coalesce(target_sort ->> 'fieldKey', '')));
  allowed_keys text[];
begin
  allowed_keys := public.table_sort_field_keys()
    || coalesce(
      (
        select array_agg(field_definition.key order by field_definition.position asc, field_definition.created_at asc, field_definition.id asc)
        from public.field_definitions field_definition
        where field_definition.project_id = target_project_id
          and field_definition.archived_at is null
      ),
      '{}'::text[]
    );

  if normalized_field_key = '' or not normalized_field_key = any(allowed_keys) then
    return null;
  end if;

  if normalized_direction not in ('asc', 'desc') then
    normalized_direction := 'asc';
  end if;

  return jsonb_build_object(
    'fieldKey', normalized_field_key,
    'direction', normalized_direction
  );
end;
$$;

revoke all on function public.normalize_project_table_sort(uuid, jsonb) from public;

create or replace function public.get_shell_summary_rows_v2()
returns table (
  workspace_id uuid,
  workspace_slug text,
  workspace_name text,
  workspace_color_token text,
  workspace_icon text,
  workspace_organization_id uuid,
  workspace_organization_name text,
  workspace_organization_slug text,
  workspace_timezone text,
  workspace_can_manage boolean,
  project_id uuid,
  project_slug text,
  project_key text,
  project_name text,
  project_icon text,
  project_access public.resource_access,
  project_builtin_field_labels jsonb,
  project_position integer,
  project_updated_at timestamptz,
  project_created_at timestamptz,
  member_count integer,
  task_count integer,
  default_project_view_id uuid,
  project_views jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    workspace.id as workspace_id,
    workspace.slug as workspace_slug,
    workspace.name as workspace_name,
    coalesce(workspace.color_token, 'slate') as workspace_color_token,
    workspace.icon as workspace_icon,
    workspace.organization_id as workspace_organization_id,
    org.name as workspace_organization_name,
    org.slug as workspace_organization_slug,
    workspace.timezone as workspace_timezone,
    (
      current_org_member.role = 'admin'
      or coalesce(current_workspace_member.role, 'guest'::public.scope_access_role) = 'admin'
    ) as workspace_can_manage,
    project.id as project_id,
    project.slug as project_slug,
    project.project_key as project_key,
    project.name as project_name,
    coalesce(project.icon, '📁') as project_icon,
    project.access as project_access,
    coalesce(project.builtin_field_labels, '{}'::jsonb) as project_builtin_field_labels,
    project.position as project_position,
    project.updated_at as project_updated_at,
    project.created_at as project_created_at,
    coalesce(project_membership.member_count, 0) as member_count,
    coalesce(project_cards.task_count, 0) as task_count,
    project_views_summary.default_project_view_id,
    project_views_summary.project_views
  from public.projects project
  join public.workspaces workspace
    on workspace.id = project.workspace_id
  join public.organizations org
    on org.id = workspace.organization_id
  join public.organization_members current_org_member
    on current_org_member.organization_id = workspace.organization_id
   and current_org_member.user_id = auth.uid()
  left join public.workspace_members current_workspace_member
    on current_workspace_member.workspace_id = workspace.id
   and current_workspace_member.user_id = auth.uid()
  left join public.project_members current_project_member
    on current_project_member.project_id = project.id
   and current_project_member.user_id = auth.uid()
  left join public.workspace_project_user_orders project_user_order
    on project_user_order.workspace_id = workspace.id
   and project_user_order.project_id = project.id
   and project_user_order.user_id = auth.uid()
  left join lateral (
    select count(*)::integer as member_count
    from public.organization_members org_member
    left join public.workspace_members workspace_member
      on workspace_member.workspace_id = workspace.id
     and workspace_member.user_id = org_member.user_id
    left join public.project_members project_member
      on project_member.project_id = project.id
     and project_member.user_id = org_member.user_id
    where org_member.organization_id = workspace.organization_id
      and org_member.role in ('admin', 'member')
      and (
        workspace.access = 'open'
        or workspace_member.user_id is not null
      )
      and (
        project.access = 'open'
        or project_member.user_id is not null
      )
  ) project_membership on true
  left join lateral (
    select count(*)::integer as task_count
    from public.cards card
    where card.project_id = project.id
      and card.archived_at is null
      and card.deleted_at is null
  ) project_cards on true
  left join lateral (
    select
      coalesce(
        (array_agg(project_view.id order by project_view.position asc, project_view.created_at asc, project_view.id asc)
          filter (where project_view.is_default))[1],
        (array_agg(project_view.id order by project_view.position asc, project_view.created_at asc, project_view.id asc))[1]
      ) as default_project_view_id,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', project_view.id,
            'name', project_view.name,
            'viewType', project_view.view_type,
            'isDefault', project_view.is_default,
            'position', project_view.position,
            'isHidden', coalesce((project_view_user_config.config ->> 'hidden')::boolean, false)
          )
          order by project_view.position asc, project_view.created_at asc, project_view.id asc
        ),
        '[]'::jsonb
      ) as project_views
    from public.project_views project_view
    left join public.project_view_user_configs project_view_user_config
      on project_view_user_config.project_view_id = project_view.id
     and project_view_user_config.user_id = auth.uid()
    where project_view.project_id = project.id
  ) project_views_summary on true
  where project.archived_at is null
    and project.deleted_at is null
    and (
      workspace.access = 'open'
      or current_workspace_member.user_id is not null
    )
    and (
      project.access = 'open'
      or current_project_member.user_id is not null
    )
  order by
    workspace.created_at asc,
    workspace.id asc,
    case when project_user_order.position is null then 1 else 0 end asc,
    project_user_order.position asc nulls last,
    project.position asc,
    project.created_at asc,
    project.id asc;
$$;

revoke all on function public.get_shell_summary_rows_v2() from public;

grant execute on function public.get_shell_summary_rows_v2() to authenticated;

create or replace function public.get_project_table_view_state_by_view_id(target_project_view_id uuid)
returns table (
  project_view_id uuid,
  shared_group_by text,
  shared_person_filter_user_id uuid,
  shared_sort jsonb,
  shared_filters jsonb,
  shared_visible_field_keys text[],
  shared_task_mode text,
  shared_version integer,
  personal_collapsed_groups text[],
  personal_column_widths jsonb,
  base_shared_version integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  with target_view as (
    select
      project_view.id,
      project_view.project_id,
      project_view.shared_config,
      project_view.version as shared_version
    from public.project_views project_view
    where project_view.id = target_project_view_id
      and project_view.view_type = 'table'
      and public.can_access_project(project_view.project_id, auth.uid())
  ),
  normalized_shared as (
    select
      target_view.id,
      target_view.project_id,
      public.normalize_project_table_shared_config(
        target_view.project_id,
        target_view.shared_config ->> 'groupBy',
        target_view.shared_config -> 'sort',
        target_view.shared_config -> 'filters',
        public.jsonb_text_array(target_view.shared_config -> 'visibleFieldKeys'),
        target_view.shared_config ->> 'taskMode',
        (target_view.shared_config ->> 'personFilterUserId')::uuid
      ) as config,
      target_view.shared_version
    from target_view
  )
  select
    normalized_shared.id as project_view_id,
    coalesce(normalized_shared.config ->> 'groupBy', 'group') as shared_group_by,
    (normalized_shared.config ->> 'personFilterUserId')::uuid as shared_person_filter_user_id,
    normalized_shared.config -> 'sort' as shared_sort,
    coalesce(normalized_shared.config -> 'filters', public.normalize_table_filters(null)) as shared_filters,
    public.jsonb_text_array(normalized_shared.config -> 'visibleFieldKeys') as shared_visible_field_keys,
    coalesce(normalized_shared.config ->> 'taskMode', 'standard') as shared_task_mode,
    coalesce(normalized_shared.shared_version, 1) as shared_version,
    coalesce(personal_layout.collapsed_groups, '{}'::text[]) as personal_collapsed_groups,
    coalesce(personal_layout.column_widths, '{}'::jsonb) as personal_column_widths,
    coalesce(personal_layout.base_shared_version, coalesce(normalized_shared.shared_version, 1)) as base_shared_version
  from normalized_shared
  left join lateral (
    select
      project_view_user_config.base_shared_version,
      coalesce(
        (
          select array_agg(entry.value order by entry.ordinality)
          from jsonb_array_elements_text(
            case
              when jsonb_typeof(project_view_user_config.config -> 'collapsedGroups') = 'array'
                then project_view_user_config.config -> 'collapsedGroups'
              else '[]'::jsonb
            end
          ) with ordinality as entry(value, ordinality)
        ),
        '{}'::text[]
      ) as collapsed_groups,
      public.normalize_table_column_widths(
        normalized_shared.project_id,
        project_view_user_config.config -> 'columnWidths'
      ) as column_widths
    from public.project_view_user_configs project_view_user_config
    where project_view_user_config.project_view_id = normalized_shared.id
      and project_view_user_config.user_id = auth.uid()
    limit 1
  ) personal_layout on true;
end;
$$;

create or replace function public.get_project_table_view_states(target_project_id uuid)
returns table (
  project_view_id uuid,
  shared_group_by text,
  shared_person_filter_user_id uuid,
  shared_sort jsonb,
  shared_filters jsonb,
  shared_visible_field_keys text[],
  shared_task_mode text,
  shared_version integer,
  personal_collapsed_groups text[],
  personal_column_widths jsonb,
  base_shared_version integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    table_view_state.project_view_id,
    table_view_state.shared_group_by,
    table_view_state.shared_person_filter_user_id,
    table_view_state.shared_sort,
    table_view_state.shared_filters,
    table_view_state.shared_visible_field_keys,
    table_view_state.shared_task_mode,
    table_view_state.shared_version,
    table_view_state.personal_collapsed_groups,
    table_view_state.personal_column_widths,
    table_view_state.base_shared_version
  from public.project_views project_view
  cross join lateral public.get_project_table_view_state_by_view_id(project_view.id) table_view_state
  where project_view.project_id = target_project_id
    and project_view.view_type = 'table'
  order by project_view.position asc, project_view.created_at asc, project_view.id asc;
$$;

create or replace function public.set_project_table_shared_config_by_view_id(
  target_project_view_id uuid,
  target_group_by text,
  target_sort jsonb default null,
  target_filters jsonb default null,
  target_visible_field_keys text[] default null,
  target_task_mode text default null,
  target_person_filter_user_id uuid default null
)
returns table (
  project_view_id uuid,
  shared_group_by text,
  shared_person_filter_user_id uuid,
  shared_sort jsonb,
  shared_filters jsonb,
  shared_visible_field_keys text[],
  shared_task_mode text,
  shared_version integer,
  personal_collapsed_groups text[],
  personal_column_widths jsonb,
  base_shared_version integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_view public.project_views%rowtype;
  normalized_config jsonb;
begin
  select *
    into target_view
  from public.project_views project_view
  where project_view.id = target_project_view_id
    and project_view.view_type = 'table';

  if target_view.id is null or not public.can_edit_project(target_view.project_id, auth.uid()) then
    raise exception 'You do not have access to update this view.';
  end if;

  normalized_config := public.normalize_project_table_shared_config(
    target_view.project_id,
    target_group_by,
    target_sort,
    target_filters,
    target_visible_field_keys,
    coalesce(target_task_mode, target_view.shared_config ->> 'taskMode'),
    target_person_filter_user_id
  );

  update public.project_views
  set
    shared_config = normalized_config,
    version = version + 1,
    updated_by_user_id = auth.uid(),
    updated_at = timezone('utc', now())
  where id = target_project_view_id;

  return query
  select *
  from public.get_project_table_view_state_by_view_id(target_project_view_id);
end;
$$;

create or replace function public.set_project_table_personal_layout_by_view_id(
  target_project_view_id uuid,
  target_collapsed_groups text[],
  target_column_widths jsonb default '{}'::jsonb
)
returns table (
  project_view_id uuid,
  shared_group_by text,
  shared_person_filter_user_id uuid,
  shared_sort jsonb,
  shared_filters jsonb,
  shared_visible_field_keys text[],
  shared_task_mode text,
  shared_version integer,
  personal_collapsed_groups text[],
  personal_column_widths jsonb,
  base_shared_version integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_view public.project_views%rowtype;
  normalized_groups text[] := '{}'::text[];
  normalized_widths jsonb := '{}'::jsonb;
  current_shared_version integer := 1;
begin
  select *
    into target_view
  from public.project_views project_view
  where project_view.id = target_project_view_id
    and project_view.view_type = 'table';

  if target_view.id is null or not public.can_edit_project(target_view.project_id, auth.uid()) then
    raise exception 'You do not have access to update this view.';
  end if;

  normalized_widths := public.normalize_table_column_widths(target_view.project_id, target_column_widths);

  current_shared_version := target_view.version;

  select coalesce(
    (
      select array_agg(entry.value order by entry.first_ordinality)
      from (
        select
          normalized_entry.value,
          min(normalized_entry.ordinality) as first_ordinality
        from (
          select
            lower(trim(group_id)) as value,
            ordinality
          from unnest(coalesce(target_collapsed_groups, '{}'::text[])) with ordinality as entry(group_id, ordinality)
          where length(trim(group_id)) > 0
        ) normalized_entry
        group by normalized_entry.value
      ) entry
    ),
    '{}'::text[]
  )
    into normalized_groups;

  if cardinality(normalized_groups) = 0 and normalized_widths = '{}'::jsonb then
    delete from public.project_view_user_configs project_view_user_config
    where project_view_user_config.project_view_id = target_project_view_id
      and project_view_user_config.user_id = auth.uid();
  else
    insert into public.project_view_user_configs (
      project_view_id,
      user_id,
      config,
      base_shared_version
    )
    values (
      target_project_view_id,
      auth.uid(),
      jsonb_build_object(
        'collapsedGroups', to_jsonb(normalized_groups),
        'columnWidths', normalized_widths
      ),
      current_shared_version
    )
    on conflict on constraint project_view_user_configs_view_user_key
    do update
      set
        config = excluded.config || jsonb_build_object(
          'hidden',
          coalesce((public.project_view_user_configs.config ->> 'hidden')::boolean, false)
        ),
        base_shared_version = excluded.base_shared_version,
        updated_at = timezone('utc', now());
  end if;

  return query
  select *
  from public.get_project_table_view_state_by_view_id(target_project_view_id);
end;
$$;

revoke all on function public.get_project_table_view_states(uuid) from public;

grant execute on function public.get_project_table_view_states(uuid) to authenticated;

revoke all on function public.get_project_table_view_state_by_view_id(uuid) from public;

grant execute on function public.get_project_table_view_state_by_view_id(uuid) to authenticated;

revoke all on function public.set_project_table_shared_config_by_view_id(uuid, text, jsonb, jsonb, text[], text, uuid) from public;

grant execute on function public.set_project_table_shared_config_by_view_id(uuid, text, jsonb, jsonb, text[], text, uuid) to authenticated;

revoke all on function public.set_project_table_personal_layout_by_view_id(uuid, text[], jsonb) from public;

grant execute on function public.set_project_table_personal_layout_by_view_id(uuid, text[], jsonb) to authenticated;

create or replace function public.get_overview_shared_config_by_view_id(target_project_view_id uuid)
returns table (shared_config jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select project_view.shared_config
  from public.project_views project_view
  where project_view.id = target_project_view_id
    and project_view.view_type = 'overview'
    and public.can_access_project(project_view.project_id, auth.uid())
  limit 1;
$$;

create or replace function public.set_overview_shared_config_by_view_id(
  target_project_view_id uuid,
  target_config jsonb
)
returns table (shared_config jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_view public.project_views%rowtype;
begin
  select *
    into target_view
  from public.project_views project_view
  where project_view.id = target_project_view_id
    and project_view.view_type = 'overview';

  if target_view.id is null or not public.can_access_project(target_view.project_id, auth.uid()) then
    raise exception 'You do not have access to update this view.';
  end if;

  update public.project_views
  set
    shared_config = coalesce(target_config, '{}'::jsonb),
    version = version + 1,
    updated_by_user_id = auth.uid(),
    updated_at = timezone('utc', now())
  where id = target_project_view_id;

  return query select coalesce(target_config, '{}'::jsonb) as shared_config;
end;
$$;

revoke all on function public.get_overview_shared_config_by_view_id(uuid) from public;

grant execute on function public.get_overview_shared_config_by_view_id(uuid) to authenticated;

revoke all on function public.set_overview_shared_config_by_view_id(uuid, jsonb) from public;

grant execute on function public.set_overview_shared_config_by_view_id(uuid, jsonb) to authenticated;

create or replace function public.normalize_project_table_shared_config(
  target_project_id uuid,
  target_group_by text,
  target_sort jsonb,
  target_filters jsonb,
  target_visible_field_keys text[],
  target_task_mode text default null,
  target_person_filter_user_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_group_by text := lower(trim(coalesce(target_group_by, 'group')));
  normalized_task_mode text := lower(trim(coalesce(target_task_mode, 'standard')));
begin
  if normalized_group_by not in ('group', 'status', 'priority', 'due_date', 'assignee', 'sprint') then
    normalized_group_by := 'group';
  end if;

  if normalized_task_mode not in ('standard', 'sprint') then
    normalized_task_mode := 'standard';
  end if;

  return jsonb_build_object(
    'groupBy', normalized_group_by,
    'sort', coalesce(public.normalize_project_table_sort(target_project_id, target_sort), 'null'::jsonb),
    'filters', public.normalize_table_filters(target_filters),
    'taskMode', normalized_task_mode,
    'visibleFieldKeys', to_jsonb(public.normalize_table_visible_field_keys(target_project_id, target_visible_field_keys)),
    'personFilterUserId', target_person_filter_user_id
  );
end;
$$;

revoke all on function public.normalize_project_table_shared_config(uuid, text, jsonb, jsonb, text[], text, uuid) from public;

create or replace function public.normalize_project_gantt_shared_config(
  target_project_id uuid,
  target_config jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_group_by text := lower(trim(coalesce(target_config ->> 'groupBy', 'group')));
  normalized_task_mode text := lower(trim(coalesce(target_config ->> 'taskMode', 'standard')));
  normalized_time_scale text := lower(trim(coalesce(target_config ->> 'timeScale', 'week')));
  normalized_person_filter_user_id uuid := null;
  raw_date_range jsonb := coalesce(target_config -> 'dateRange', '{}'::jsonb);
  normalized_preset text := lower(trim(coalesce(raw_date_range ->> 'preset', 'all_time')));
  normalized_start_date text := nullif(trim(coalesce(raw_date_range ->> 'startDate', '')), '');
  normalized_end_date text := nullif(trim(coalesce(raw_date_range ->> 'endDate', '')), '');
  swap_date text;
begin
  if normalized_group_by not in ('group', 'status', 'priority', 'due_date', 'assignee', 'sprint') then
    normalized_group_by := 'group';
  end if;

  if normalized_task_mode not in ('standard', 'sprint') then
    normalized_task_mode := 'standard';
  end if;

  if normalized_time_scale not in ('day', 'week', 'month') then
    normalized_time_scale := 'week';
  end if;

  if normalized_preset not in ('this_week', 'last_week', 'next_week', 'all_time', 'custom') then
    normalized_preset := 'all_time';
  end if;

  begin
    if nullif(trim(coalesce(target_config ->> 'personFilterUserId', '')), '') is not null then
      normalized_person_filter_user_id := (target_config ->> 'personFilterUserId')::uuid;
    end if;
  exception when invalid_text_representation then
    normalized_person_filter_user_id := null;
  end;

  begin
    if normalized_start_date is not null then
      perform normalized_start_date::date;
    end if;

    if normalized_end_date is not null then
      perform normalized_end_date::date;
    end if;
  exception when invalid_text_representation then
    normalized_preset := 'all_time';
    normalized_start_date := null;
    normalized_end_date := null;
  end;

  if normalized_preset = 'all_time' or normalized_start_date is null or normalized_end_date is null then
    normalized_preset := 'all_time';
    normalized_start_date := null;
    normalized_end_date := null;
  elsif normalized_end_date < normalized_start_date then
    swap_date := normalized_start_date;
    normalized_start_date := normalized_end_date;
    normalized_end_date := swap_date;
  end if;

  return jsonb_build_object(
    'dateRange', jsonb_build_object(
      'endDate', to_jsonb(normalized_end_date),
      'preset', normalized_preset,
      'startDate', to_jsonb(normalized_start_date)
    ),
    'filters', public.normalize_table_filters(target_config -> 'filters'),
    'groupBy', normalized_group_by,
    'personFilterUserId', normalized_person_filter_user_id,
    'sort', coalesce(public.normalize_project_table_sort(target_project_id, target_config -> 'sort'), 'null'::jsonb),
    'taskMode', normalized_task_mode,
    'timeScale', normalized_time_scale
  );
end;
$$;

revoke all on function public.normalize_project_gantt_shared_config(uuid, jsonb) from public;

create or replace function public.get_gantt_shared_config_by_view_id(target_project_view_id uuid)
returns table (shared_config jsonb)
language sql
stable
security definer
set search_path = public
as $$
  with target_view as (
    select
      project_view.project_id,
      project_view.shared_config
    from public.project_views project_view
    where project_view.id = target_project_view_id
      and project_view.view_type = 'gantt'
      and public.can_access_project(project_view.project_id, auth.uid())
    limit 1
  )
  select public.normalize_project_gantt_shared_config(target_view.project_id, target_view.shared_config) as shared_config
  from target_view;
$$;

revoke all on function public.get_gantt_shared_config_by_view_id(uuid) from public;

grant execute on function public.get_gantt_shared_config_by_view_id(uuid) to authenticated;

create or replace function public.set_gantt_shared_config_by_view_id(
  target_project_view_id uuid,
  target_config jsonb
)
returns table (shared_config jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_view public.project_views%rowtype;
  normalized_config jsonb;
begin
  select *
    into target_view
  from public.project_views project_view
  where project_view.id = target_project_view_id
    and project_view.view_type = 'gantt';

  if target_view.id is null or not public.can_access_project(target_view.project_id, auth.uid()) then
    raise exception 'You do not have access to update this view.';
  end if;

  normalized_config := public.normalize_project_gantt_shared_config(target_view.project_id, target_config);

  update public.project_views
  set
    shared_config = normalized_config,
    version = version + 1,
    updated_by_user_id = auth.uid(),
    updated_at = timezone('utc', now())
  where id = target_project_view_id;

  return query select normalized_config as shared_config;
end;
$$;

revoke all on function public.set_gantt_shared_config_by_view_id(uuid, jsonb) from public;

grant execute on function public.set_gantt_shared_config_by_view_id(uuid, jsonb) to authenticated;

revoke all on function public.normalize_project_gantt_shared_config(uuid, jsonb) from public;

revoke all on function public.get_gantt_shared_config_by_view_id(uuid) from public;

grant execute on function public.get_gantt_shared_config_by_view_id(uuid) to authenticated;

revoke all on function public.set_gantt_shared_config_by_view_id(uuid, jsonb) from public;

grant execute on function public.set_gantt_shared_config_by_view_id(uuid, jsonb) to authenticated;

create or replace function public.create_project_view(
  target_project_id uuid,
  target_view_type public.project_view_type,
  target_name text default null
)
returns table (
  id uuid,
  name text,
  view_type text,
  is_default boolean,
  "position" integer,
  is_hidden boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  target_project public.projects%rowtype;
  existing_singleton_view_id uuid;
  new_project_view_id uuid;
  normalized_name text := nullif(trim(target_name), '');
  next_position integer;
begin
  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to update this project.';
  end if;

  select *
    into target_project
  from public.projects project
  where project.id = target_project_id;

  if target_project.id is null then
    raise exception 'PROJECT_NOT_FOUND';
  end if;

  if target_view_type in ('document', 'github', 'canvas') then
    if (
      select count(*)::integer
      from public.project_views project_view
      where project_view.project_id = target_project_id
        and project_view.view_type = target_view_type
    ) >= 10 then
      case target_view_type
        when 'document' then
          raise exception 'Projects can include at most 10 document boards.';
        when 'github' then
          raise exception 'Projects can include at most 10 GitHub boards.';
        when 'canvas' then
          raise exception 'Projects can include at most 10 Canvas boards.';
        else
          null;
      end case;
    end if;
  else
    select project_view.id
      into existing_singleton_view_id
    from public.project_views project_view
    where project_view.project_id = target_project_id
      and project_view.view_type = target_view_type
    order by project_view.position asc, project_view.created_at asc, project_view.id asc
    limit 1;
  end if;

  if existing_singleton_view_id is not null then
    perform public.set_project_view_hidden(existing_singleton_view_id, false);
    return query select * from public.project_view_payload(existing_singleton_view_id);
  end if;

  select coalesce(
    (
      select min(project_view.position)
      from public.project_views project_view
      where project_view.project_id = target_project_id
        and (
          case project_view.view_type
            when 'overview' then 0
            when 'table' then 1
            when 'kanban' then 2
            when 'gantt' then 3
            when 'document' then 4
            when 'github' then 5
            when 'canvas' then 6
          end
        ) > (
          case target_view_type
            when 'overview' then 0
            when 'table' then 1
            when 'kanban' then 2
            when 'gantt' then 3
            when 'document' then 4
            when 'github' then 5
            when 'canvas' then 6
          end
        )
    ),
    (
      select max(project_view.position) + 1
      from public.project_views project_view
      where project_view.project_id = target_project_id
    ),
    0
  )
    into next_position;

  update public.project_views project_view
  set
    position = project_view.position + 1,
    updated_at = timezone('utc', now())
  where project_view.project_id = target_project_id
    and project_view.position >= next_position;

  insert into public.project_views as project_view (
    project_id,
    name,
    view_type,
    position,
    is_default,
    shared_config,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    target_project_id,
    coalesce(
      normalized_name,
      case
        when target_view_type = 'overview' then 'Overview'
        when target_view_type = 'kanban' then 'Kanban'
        when target_view_type = 'table' then 'Table'
        when target_view_type = 'gantt' then 'Gantt'
        when target_view_type = 'document' then 'Document'
        when target_view_type = 'github' then 'GitHub'
        when target_view_type = 'canvas' then 'Canvas'
      end
    ),
    target_view_type,
    next_position,
    false,
    case
      when target_view_type = 'table' then public.default_table_shared_config()
      else '{}'::jsonb
    end,
    auth.uid(),
    auth.uid()
  )
  returning project_view.id into new_project_view_id;

  if target_view_type = 'document' then
    insert into public.documents (
      project_id,
      project_view_id,
      title,
      content_md,
      created_by_user_id,
      updated_by_user_id
    )
    values (
      target_project_id,
      new_project_view_id,
      coalesce(normalized_name, 'Document'),
      '',
      auth.uid(),
      auth.uid()
    );

    insert into public.document_versions (
      document_id,
      version,
      title,
      content_md,
      created_by_user_id
    )
    select
      document.id,
      1,
      document.title,
      '',
      auth.uid()
    from public.documents document
    where document.project_view_id = new_project_view_id;
  end if;

  return query select * from public.project_view_payload(new_project_view_id);
end;
$$;

revoke all on function public.create_project_view(uuid, public.project_view_type, text) from public;

grant execute on function public.create_project_view(uuid, public.project_view_type, text) to authenticated;

create or replace function public.normalize_project_github_shared_config(
  target_project_id uuid,
  target_config jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_repo_mode text := lower(trim(coalesce(target_config ->> 'repoMode', '')));
  normalized_selected_repo_id uuid := null;
begin
  begin
    if nullif(trim(coalesce(target_config ->> 'selectedRepoId', '')), '') is not null then
      normalized_selected_repo_id := (target_config ->> 'selectedRepoId')::uuid;
    end if;
  exception when invalid_text_representation then
    normalized_selected_repo_id := null;
  end;

  if normalized_repo_mode = 'all' then
    return jsonb_build_object(
      'repoMode', 'all',
      'selectedRepoId', null
    );
  end if;

  if normalized_repo_mode = 'selected' and normalized_selected_repo_id is not null then
    return jsonb_build_object(
      'repoMode', 'selected',
      'selectedRepoId', normalized_selected_repo_id
    );
  end if;

  return jsonb_build_object(
    'repoMode', 'unconfigured',
    'selectedRepoId', null
  );
end;
$$;

create or replace function public.get_github_shared_config_by_view_id(target_project_view_id uuid)
returns table (shared_config jsonb)
language sql
stable
security definer
set search_path = public
as $$
  with target_view as (
    select
      project_view.project_id,
      project_view.shared_config
    from public.project_views project_view
    where project_view.id = target_project_view_id
      and project_view.view_type = 'github'
      and public.can_access_project(project_view.project_id, auth.uid())
    limit 1
  )
  select public.normalize_project_github_shared_config(target_view.project_id, target_view.shared_config) as shared_config
  from target_view;
$$;

create or replace function public.set_github_shared_config_by_view_id(
  target_project_view_id uuid,
  target_config jsonb
)
returns table (shared_config jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_view public.project_views%rowtype;
  normalized_config jsonb;
begin
  select *
    into target_view
  from public.project_views project_view
  where project_view.id = target_project_view_id
    and project_view.view_type = 'github';

  if target_view.id is null or not public.can_edit_project(target_view.project_id, auth.uid()) then
    raise exception 'You do not have access to update this view.';
  end if;

  normalized_config := public.normalize_project_github_shared_config(target_view.project_id, target_config);

  update public.project_views
  set
    shared_config = normalized_config,
    version = version + 1,
    updated_by_user_id = auth.uid(),
    updated_at = timezone('utc', now())
  where id = target_project_view_id;

  return query select normalized_config as shared_config;
end;
$$;

revoke all on function public.normalize_project_github_shared_config(uuid, jsonb) from public;

revoke all on function public.get_github_shared_config_by_view_id(uuid) from public;

grant execute on function public.get_github_shared_config_by_view_id(uuid) to authenticated;

revoke all on function public.set_github_shared_config_by_view_id(uuid, jsonb) from public;

grant execute on function public.set_github_shared_config_by_view_id(uuid, jsonb) to authenticated;

-- ============================================================================
-- Project-scoped task mode (consolidated from former patch migration, 2026-04).
-- Adds per-project task-mode column + per-view table/gantt shared-config helpers.
-- Lives in project_views.sql because it depends on normalize_table_filters and
-- other helpers defined above.
-- ============================================================================

alter table public.projects
  add column task_mode text not null default 'standard',
  add constraint projects_task_mode_check check (task_mode in ('standard', 'sprint'));

create or replace function public.get_project_task_mode(target_project_id uuid)
returns table (task_mode text)
language sql
stable
security definer
set search_path = public
as $$
  select project.task_mode
  from public.projects project
  where project.id = target_project_id
    and public.can_access_project(project.id, auth.uid())
  limit 1;
$$;

create or replace function public.set_project_task_mode(
  target_project_id uuid,
  target_task_mode text
)
returns table (task_mode text)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_task_mode text := lower(trim(coalesce(target_task_mode, '')));
begin
  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to update this project.';
  end if;

  if normalized_task_mode not in ('standard', 'sprint') then
    raise exception 'TASK_MODE_INVALID';
  end if;

  update public.projects
  set
    task_mode = normalized_task_mode,
    updated_at = timezone('utc', now()),
    updated_by_user_id = auth.uid()
  where id = target_project_id;

  return query
  select project.task_mode
  from public.projects project
  where project.id = target_project_id
  limit 1;
end;
$$;

revoke all on function public.get_project_task_mode(uuid) from public;

grant execute on function public.get_project_task_mode(uuid) to authenticated;

revoke all on function public.set_project_task_mode(uuid, text) from public;

grant execute on function public.set_project_task_mode(uuid, text) to authenticated;

create or replace function public.default_table_shared_config()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'groupBy', 'group',
    'sort', null,
    'filters', public.normalize_table_filters(null),
    'visibleFieldKeys', to_jsonb(public.default_table_visible_field_keys()),
    'personFilterUserId', null
  );
$$;

drop function if exists public.normalize_project_table_shared_config(uuid, text, jsonb, jsonb, text[], text, uuid);

create or replace function public.normalize_project_table_shared_config(
  target_project_id uuid,
  target_group_by text,
  target_sort jsonb,
  target_filters jsonb,
  target_visible_field_keys text[],
  target_person_filter_user_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_group_by text := lower(trim(coalesce(target_group_by, 'group')));
begin
  if normalized_group_by not in ('group', 'status', 'priority', 'due_date', 'assignee', 'sprint') then
    normalized_group_by := 'group';
  end if;

  return jsonb_build_object(
    'groupBy', normalized_group_by,
    'sort', coalesce(public.normalize_project_table_sort(target_project_id, target_sort), 'null'::jsonb),
    'filters', public.normalize_table_filters(target_filters),
    'visibleFieldKeys', to_jsonb(public.normalize_table_visible_field_keys(target_project_id, target_visible_field_keys)),
    'personFilterUserId', target_person_filter_user_id
  );
end;
$$;

revoke all on function public.normalize_project_table_shared_config(uuid, text, jsonb, jsonb, text[], uuid) from public;

create or replace function public.normalize_project_gantt_shared_config(
  target_project_id uuid,
  target_config jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_group_by text := lower(trim(coalesce(target_config ->> 'groupBy', 'group')));
  normalized_time_scale text := lower(trim(coalesce(target_config ->> 'timeScale', 'week')));
  normalized_person_filter_user_id uuid := null;
  raw_date_range jsonb := coalesce(target_config -> 'dateRange', '{}'::jsonb);
  normalized_preset text := lower(trim(coalesce(raw_date_range ->> 'preset', 'all_time')));
  normalized_start_date text := nullif(trim(coalesce(raw_date_range ->> 'startDate', '')), '');
  normalized_end_date text := nullif(trim(coalesce(raw_date_range ->> 'endDate', '')), '');
  swap_date text;
begin
  if normalized_group_by not in ('group', 'status', 'priority', 'due_date', 'assignee', 'sprint') then
    normalized_group_by := 'group';
  end if;

  if normalized_time_scale not in ('day', 'week', 'month') then
    normalized_time_scale := 'week';
  end if;

  if normalized_preset not in ('this_week', 'last_week', 'next_week', 'all_time', 'custom') then
    normalized_preset := 'all_time';
  end if;

  begin
    if nullif(trim(coalesce(target_config ->> 'personFilterUserId', '')), '') is not null then
      normalized_person_filter_user_id := (target_config ->> 'personFilterUserId')::uuid;
    end if;
  exception when invalid_text_representation then
    normalized_person_filter_user_id := null;
  end;

  begin
    if normalized_start_date is not null then
      perform normalized_start_date::date;
    end if;

    if normalized_end_date is not null then
      perform normalized_end_date::date;
    end if;
  exception when invalid_text_representation then
    normalized_preset := 'all_time';
    normalized_start_date := null;
    normalized_end_date := null;
  end;

  if normalized_preset = 'all_time' or normalized_start_date is null or normalized_end_date is null then
    normalized_preset := 'all_time';
    normalized_start_date := null;
    normalized_end_date := null;
  elsif normalized_end_date < normalized_start_date then
    swap_date := normalized_start_date;
    normalized_start_date := normalized_end_date;
    normalized_end_date := swap_date;
  end if;

  return jsonb_build_object(
    'dateRange', jsonb_build_object(
      'endDate', to_jsonb(normalized_end_date),
      'preset', normalized_preset,
      'startDate', to_jsonb(normalized_start_date)
    ),
    'filters', public.normalize_table_filters(target_config -> 'filters'),
    'groupBy', normalized_group_by,
    'personFilterUserId', normalized_person_filter_user_id,
    'sort', coalesce(public.normalize_project_table_sort(target_project_id, target_config -> 'sort'), 'null'::jsonb),
    'timeScale', normalized_time_scale
  );
end;
$$;

update public.project_views project_view
set
  shared_config = project_view.shared_config - 'taskMode',
  version = project_view.version + 1,
  updated_at = timezone('utc', now())
where project_view.view_type = 'table'
  and project_view.shared_config ? 'taskMode';

update public.project_views project_view
set
  shared_config = public.normalize_project_gantt_shared_config(project_view.project_id, project_view.shared_config),
  version = project_view.version + 1,
  updated_at = timezone('utc', now())
where project_view.view_type = 'gantt'
  and project_view.shared_config ? 'taskMode';

drop function if exists public.get_project_table_view_state(uuid);

drop function if exists public.set_project_table_shared_config(uuid, text, jsonb, jsonb, text[], text);

drop function if exists public.set_project_table_group_by(uuid, text);

drop function if exists public.set_project_table_personal_layout(uuid, text[], jsonb);

drop function if exists public.get_project_table_view_states(uuid);

drop function if exists public.get_project_table_view_state_by_view_id(uuid);

drop function if exists public.set_project_table_shared_config_by_view_id(uuid, text, jsonb, jsonb, text[], text, uuid);

drop function if exists public.set_project_table_personal_layout_by_view_id(uuid, text[], jsonb);

create function public.get_project_table_view_state_by_view_id(target_project_view_id uuid)
returns table (
  project_view_id uuid,
  shared_group_by text,
  shared_person_filter_user_id uuid,
  shared_sort jsonb,
  shared_filters jsonb,
  shared_visible_field_keys text[],
  shared_version integer,
  personal_collapsed_groups text[],
  personal_column_widths jsonb,
  base_shared_version integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  with target_view as (
    select
      project_view.id,
      project_view.project_id,
      project_view.shared_config,
      project_view.version as shared_version
    from public.project_views project_view
    where project_view.id = target_project_view_id
      and project_view.view_type = 'table'
      and public.can_access_project(project_view.project_id, auth.uid())
  ),
  normalized_shared as (
    select
      target_view.id,
      target_view.project_id,
      public.normalize_project_table_shared_config(
        target_view.project_id,
        target_view.shared_config ->> 'groupBy',
        target_view.shared_config -> 'sort',
        target_view.shared_config -> 'filters',
        public.jsonb_text_array(target_view.shared_config -> 'visibleFieldKeys'),
        (target_view.shared_config ->> 'personFilterUserId')::uuid
      ) as config,
      target_view.shared_version
    from target_view
  )
  select
    normalized_shared.id as project_view_id,
    coalesce(normalized_shared.config ->> 'groupBy', 'group') as shared_group_by,
    (normalized_shared.config ->> 'personFilterUserId')::uuid as shared_person_filter_user_id,
    normalized_shared.config -> 'sort' as shared_sort,
    coalesce(normalized_shared.config -> 'filters', public.normalize_table_filters(null)) as shared_filters,
    public.jsonb_text_array(normalized_shared.config -> 'visibleFieldKeys') as shared_visible_field_keys,
    coalesce(normalized_shared.shared_version, 1) as shared_version,
    coalesce(personal_layout.collapsed_groups, '{}'::text[]) as personal_collapsed_groups,
    coalesce(personal_layout.column_widths, '{}'::jsonb) as personal_column_widths,
    coalesce(personal_layout.base_shared_version, coalesce(normalized_shared.shared_version, 1)) as base_shared_version
  from normalized_shared
  left join lateral (
    select
      project_view_user_config.base_shared_version,
      coalesce(
        (
          select array_agg(entry.value order by entry.ordinality)
          from jsonb_array_elements_text(
            case
              when jsonb_typeof(project_view_user_config.config -> 'collapsedGroups') = 'array'
                then project_view_user_config.config -> 'collapsedGroups'
              else '[]'::jsonb
            end
          ) with ordinality as entry(value, ordinality)
        ),
        '{}'::text[]
      ) as collapsed_groups,
      public.normalize_table_column_widths(
        normalized_shared.project_id,
        project_view_user_config.config -> 'columnWidths'
      ) as column_widths
    from public.project_view_user_configs project_view_user_config
    where project_view_user_config.project_view_id = normalized_shared.id
      and project_view_user_config.user_id = auth.uid()
    limit 1
  ) personal_layout on true;
end;
$$;

create function public.get_project_table_view_states(target_project_id uuid)
returns table (
  project_view_id uuid,
  shared_group_by text,
  shared_person_filter_user_id uuid,
  shared_sort jsonb,
  shared_filters jsonb,
  shared_visible_field_keys text[],
  shared_version integer,
  personal_collapsed_groups text[],
  personal_column_widths jsonb,
  base_shared_version integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    table_view_state.project_view_id,
    table_view_state.shared_group_by,
    table_view_state.shared_person_filter_user_id,
    table_view_state.shared_sort,
    table_view_state.shared_filters,
    table_view_state.shared_visible_field_keys,
    table_view_state.shared_version,
    table_view_state.personal_collapsed_groups,
    table_view_state.personal_column_widths,
    table_view_state.base_shared_version
  from public.project_views project_view
  cross join lateral public.get_project_table_view_state_by_view_id(project_view.id) table_view_state
  where project_view.project_id = target_project_id
    and project_view.view_type = 'table'
  order by project_view.position asc, project_view.created_at asc, project_view.id asc;
$$;

create function public.get_project_table_view_state(target_project_id uuid)
returns table (
  project_view_id uuid,
  shared_group_by text,
  shared_person_filter_user_id uuid,
  shared_sort jsonb,
  shared_filters jsonb,
  shared_visible_field_keys text[],
  shared_version integer,
  personal_collapsed_groups text[],
  personal_column_widths jsonb,
  base_shared_version integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    table_view_state.project_view_id,
    table_view_state.shared_group_by,
    table_view_state.shared_person_filter_user_id,
    table_view_state.shared_sort,
    table_view_state.shared_filters,
    table_view_state.shared_visible_field_keys,
    table_view_state.shared_version,
    table_view_state.personal_collapsed_groups,
    table_view_state.personal_column_widths,
    table_view_state.base_shared_version
  from public.project_views project_view
  cross join lateral public.get_project_table_view_state_by_view_id(project_view.id) table_view_state
  where project_view.project_id = target_project_id
    and project_view.view_type = 'table'
  order by project_view.position asc, project_view.created_at asc, project_view.id asc
  limit 1;
$$;

create function public.set_project_table_shared_config_by_view_id(
  target_project_view_id uuid,
  target_group_by text,
  target_sort jsonb default null,
  target_filters jsonb default null,
  target_visible_field_keys text[] default null,
  target_person_filter_user_id uuid default null
)
returns table (
  project_view_id uuid,
  shared_group_by text,
  shared_person_filter_user_id uuid,
  shared_sort jsonb,
  shared_filters jsonb,
  shared_visible_field_keys text[],
  shared_version integer,
  personal_collapsed_groups text[],
  personal_column_widths jsonb,
  base_shared_version integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_view public.project_views%rowtype;
  normalized_config jsonb;
begin
  select *
    into target_view
  from public.project_views project_view
  where project_view.id = target_project_view_id
    and project_view.view_type = 'table';

  if target_view.id is null or not public.can_edit_project(target_view.project_id, auth.uid()) then
    raise exception 'You do not have access to update this view.';
  end if;

  normalized_config := public.normalize_project_table_shared_config(
    target_view.project_id,
    target_group_by,
    target_sort,
    target_filters,
    target_visible_field_keys,
    target_person_filter_user_id
  );

  update public.project_views
  set
    shared_config = normalized_config,
    version = version + 1,
    updated_by_user_id = auth.uid(),
    updated_at = timezone('utc', now())
  where id = target_project_view_id;

  return query
  select *
  from public.get_project_table_view_state_by_view_id(target_project_view_id);
end;
$$;

create function public.set_project_table_shared_config(
  target_project_id uuid,
  target_group_by text,
  target_sort jsonb default null,
  target_filters jsonb default null,
  target_visible_field_keys text[] default null,
  target_person_filter_user_id uuid default null
)
returns table (
  project_view_id uuid,
  shared_group_by text,
  shared_person_filter_user_id uuid,
  shared_sort jsonb,
  shared_filters jsonb,
  shared_visible_field_keys text[],
  shared_version integer,
  personal_collapsed_groups text[],
  personal_column_widths jsonb,
  base_shared_version integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_view_id uuid;
begin
  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'You do not have access to update this view.';
  end if;

  target_view_id := public.ensure_project_table_view(target_project_id, auth.uid());

  return query
  select *
  from public.set_project_table_shared_config_by_view_id(
    target_view_id,
    target_group_by,
    target_sort,
    target_filters,
    target_visible_field_keys,
    target_person_filter_user_id
  );
end;
$$;

create function public.set_project_table_group_by(
  target_project_id uuid,
  target_group_by text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_state record;
begin
  select *
    into current_state
  from public.get_project_table_view_state(target_project_id)
  limit 1;

  return (
    select shared_group_by
    from public.set_project_table_shared_config(
      target_project_id,
      target_group_by,
      case when current_state.shared_sort is null then null else current_state.shared_sort end,
      case when current_state.shared_filters is null then null else current_state.shared_filters end,
      case
        when current_state.shared_visible_field_keys is null then null
        else current_state.shared_visible_field_keys
      end,
      current_state.shared_person_filter_user_id
    )
    limit 1
  );
end;
$$;

create function public.set_project_table_personal_layout_by_view_id(
  target_project_view_id uuid,
  target_collapsed_groups text[],
  target_column_widths jsonb default '{}'::jsonb
)
returns table (
  project_view_id uuid,
  shared_group_by text,
  shared_person_filter_user_id uuid,
  shared_sort jsonb,
  shared_filters jsonb,
  shared_visible_field_keys text[],
  shared_version integer,
  personal_collapsed_groups text[],
  personal_column_widths jsonb,
  base_shared_version integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_view public.project_views%rowtype;
  normalized_groups text[] := '{}'::text[];
  normalized_widths jsonb := '{}'::jsonb;
  current_shared_version integer := 1;
begin
  select *
    into target_view
  from public.project_views project_view
  where project_view.id = target_project_view_id
    and project_view.view_type = 'table';

  if target_view.id is null or not public.can_edit_project(target_view.project_id, auth.uid()) then
    raise exception 'You do not have access to update this view.';
  end if;

  normalized_widths := public.normalize_table_column_widths(target_view.project_id, target_column_widths);
  current_shared_version := target_view.version;

  select coalesce(
    (
      select array_agg(entry.value order by entry.first_ordinality)
      from (
        select
          normalized_entry.value,
          min(normalized_entry.ordinality) as first_ordinality
        from (
          select
            lower(trim(group_id)) as value,
            ordinality
          from unnest(coalesce(target_collapsed_groups, '{}'::text[])) with ordinality as entry(group_id, ordinality)
          where length(trim(group_id)) > 0
        ) normalized_entry
        group by normalized_entry.value
      ) entry
    ),
    '{}'::text[]
  )
    into normalized_groups;

  if cardinality(normalized_groups) = 0 and normalized_widths = '{}'::jsonb then
    delete from public.project_view_user_configs project_view_user_config
    where project_view_user_config.project_view_id = target_project_view_id
      and project_view_user_config.user_id = auth.uid();
  else
    insert into public.project_view_user_configs (
      project_view_id,
      user_id,
      config,
      base_shared_version
    )
    values (
      target_project_view_id,
      auth.uid(),
      jsonb_build_object(
        'collapsedGroups', to_jsonb(normalized_groups),
        'columnWidths', normalized_widths
      ),
      current_shared_version
    )
    on conflict on constraint project_view_user_configs_view_user_key
    do update
      set
        config = excluded.config || jsonb_build_object(
          'hidden',
          coalesce((public.project_view_user_configs.config ->> 'hidden')::boolean, false)
        ),
        base_shared_version = excluded.base_shared_version,
        updated_at = timezone('utc', now());
  end if;

  return query
  select *
  from public.get_project_table_view_state_by_view_id(target_project_view_id);
end;
$$;

create function public.set_project_table_personal_layout(
  target_project_id uuid,
  target_collapsed_groups text[],
  target_column_widths jsonb default '{}'::jsonb
)
returns table (
  project_view_id uuid,
  shared_group_by text,
  shared_person_filter_user_id uuid,
  shared_sort jsonb,
  shared_filters jsonb,
  shared_visible_field_keys text[],
  shared_version integer,
  personal_collapsed_groups text[],
  personal_column_widths jsonb,
  base_shared_version integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_view_id uuid;
begin
  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'You do not have access to update this view.';
  end if;

  target_view_id := public.ensure_project_table_view(target_project_id, auth.uid());

  return query
  select *
  from public.set_project_table_personal_layout_by_view_id(
    target_view_id,
    target_collapsed_groups,
    target_column_widths
  );
end;
$$;

revoke all on function public.get_project_table_view_state(uuid) from public;

grant execute on function public.get_project_table_view_state(uuid) to authenticated;

revoke all on function public.get_project_table_view_state_by_view_id(uuid) from public;

grant execute on function public.get_project_table_view_state_by_view_id(uuid) to authenticated;

revoke all on function public.get_project_table_view_states(uuid) from public;

grant execute on function public.get_project_table_view_states(uuid) to authenticated;

revoke all on function public.set_project_table_shared_config(uuid, text, jsonb, jsonb, text[], uuid) from public;

grant execute on function public.set_project_table_shared_config(uuid, text, jsonb, jsonb, text[], uuid) to authenticated;

revoke all on function public.set_project_table_group_by(uuid, text) from public;

grant execute on function public.set_project_table_group_by(uuid, text) to authenticated;

revoke all on function public.set_project_table_personal_layout(uuid, text[], jsonb) from public;

grant execute on function public.set_project_table_personal_layout(uuid, text[], jsonb) to authenticated;

revoke all on function public.set_project_table_shared_config_by_view_id(uuid, text, jsonb, jsonb, text[], uuid) from public;

grant execute on function public.set_project_table_shared_config_by_view_id(uuid, text, jsonb, jsonb, text[], uuid) to authenticated;

revoke all on function public.set_project_table_personal_layout_by_view_id(uuid, text[], jsonb) from public;

grant execute on function public.set_project_table_personal_layout_by_view_id(uuid, text[], jsonb) to authenticated;

create or replace function public.get_gantt_shared_config_by_view_id(target_project_view_id uuid)
returns table (shared_config jsonb)
language sql
stable
security definer
set search_path = public
as $$
  with target_view as (
    select
      project_view.project_id,
      project_view.shared_config
    from public.project_views project_view
    where project_view.id = target_project_view_id
      and project_view.view_type = 'gantt'
      and public.can_access_project(project_view.project_id, auth.uid())
    limit 1
  )
  select public.normalize_project_gantt_shared_config(target_view.project_id, target_view.shared_config) as shared_config
  from target_view;
$$;

create or replace function public.set_gantt_shared_config_by_view_id(
  target_project_view_id uuid,
  target_config jsonb
)
returns table (shared_config jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_view public.project_views%rowtype;
  normalized_config jsonb;
begin
  select *
    into target_view
  from public.project_views project_view
  where project_view.id = target_project_view_id
    and project_view.view_type = 'gantt';

  if target_view.id is null or not public.can_edit_project(target_view.project_id, auth.uid()) then
    raise exception 'You do not have access to update this view.';
  end if;

  normalized_config := public.normalize_project_gantt_shared_config(target_view.project_id, target_config);

  update public.project_views
  set
    shared_config = normalized_config,
    version = version + 1,
    updated_by_user_id = auth.uid(),
    updated_at = timezone('utc', now())
  where id = target_project_view_id;

  return query select normalized_config as shared_config;
end;
$$;
