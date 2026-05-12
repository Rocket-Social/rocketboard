create or replace function public.update_canvas_elements(
  target_project_view_id uuid,
  target_updates jsonb
)
returns setof public.canvas_elements
language plpgsql
security definer
set search_path = public
as $$
declare
  max_batch_size constant integer := 250;
  target_project_view public.project_views%rowtype;
  update_payload jsonb;
  target_element_id uuid;
  target_canvas_element public.canvas_elements%rowtype;
  next_width float8;
  next_height float8;
  next_style jsonb;
  updated_element public.canvas_elements%rowtype;
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

  if target_updates is null or jsonb_typeof(target_updates) <> 'array' then
    raise exception 'Canvas element updates must be a JSON array.';
  end if;

  if jsonb_array_length(target_updates) > max_batch_size then
    raise exception 'CANVAS_ELEMENT_BATCH_TOO_LARGE';
  end if;

  for update_payload in
    select entry.value
    from jsonb_array_elements(target_updates) as entry(value)
  loop
    if jsonb_typeof(update_payload) <> 'object' then
      raise exception 'Canvas element updates must be JSON objects.';
    end if;

    begin
      target_element_id := nullif(update_payload->>'id', '')::uuid;
    exception
      when invalid_text_representation then
        raise exception 'CANVAS_ELEMENT_INVALID_UPDATE';
    end;

    if target_element_id is null then
      raise exception 'CANVAS_ELEMENT_NOT_FOUND';
    end if;

    select *
      into target_canvas_element
    from public.canvas_elements canvas_element
    where canvas_element.id = target_element_id
      and canvas_element.project_view_id = target_project_view_id;

    if target_canvas_element.id is null then
      raise exception 'CANVAS_ELEMENT_NOT_FOUND';
    end if;

    begin
      next_width := case
        when update_payload ? 'width' then (update_payload->>'width')::float8
        else target_canvas_element.width
      end;
      next_height := case
        when update_payload ? 'height' then (update_payload->>'height')::float8
        else target_canvas_element.height
      end;
    exception
      when invalid_text_representation or numeric_value_out_of_range or not_null_violation then
        raise exception 'CANVAS_ELEMENT_INVALID_UPDATE';
    end;
    next_style := case
      when update_payload ? 'style' then update_payload->'style'
      else target_canvas_element.style
    end;

    if next_width is null or next_height is null or next_width <= 0 or next_height <= 0 then
      raise exception 'Canvas elements must have positive dimensions.';
    end if;

    if next_style is null or jsonb_typeof(next_style) <> 'object' then
      raise exception 'Canvas style must be a JSON object.';
    end if;

    begin
      update public.canvas_elements
      set
        x = case when update_payload ? 'x' then (update_payload->>'x')::float8 else x end,
        y = case when update_payload ? 'y' then (update_payload->>'y')::float8 else y end,
        width = next_width,
        height = next_height,
        z_index = case when update_payload ? 'z_index' then (update_payload->>'z_index')::integer else z_index end,
        content = case when update_payload ? 'content' then update_payload->>'content' else content end,
        url = case when update_payload ? 'url' then update_payload->>'url' else url end,
        path_data = case when update_payload ? 'path_data' then update_payload->>'path_data' else path_data end,
        style = next_style,
        is_resolved = case when update_payload ? 'is_resolved' then (update_payload->>'is_resolved')::boolean else is_resolved end,
        updated_at = timezone('utc', now())
      where id = target_element_id
        and project_view_id = target_project_view_id
      returning * into updated_element;
    exception
      when invalid_text_representation or numeric_value_out_of_range or not_null_violation then
        raise exception 'CANVAS_ELEMENT_INVALID_UPDATE';
    end;

    return next updated_element;
  end loop;

  return;
end;
$$;

create or replace function public.delete_canvas_elements(
  target_project_view_id uuid,
  target_element_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  max_batch_size constant integer := 250;
  target_project_view public.project_views%rowtype;
  target_count integer;
  found_count integer;
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

  if cardinality(coalesce(target_element_ids, '{}'::uuid[])) > max_batch_size then
    raise exception 'CANVAS_ELEMENT_BATCH_TOO_LARGE';
  end if;

  with normalized_target_ids as (
    select distinct entry.element_id
    from unnest(coalesce(target_element_ids, '{}'::uuid[])) as entry(element_id)
    where entry.element_id is not null
  )
  select count(*)
    into target_count
  from normalized_target_ids;

  if target_count = 0 then
    return;
  end if;

  with normalized_target_ids as (
    select distinct entry.element_id
    from unnest(coalesce(target_element_ids, '{}'::uuid[])) as entry(element_id)
    where entry.element_id is not null
  )
  select count(*)
    into found_count
  from public.canvas_elements canvas_element
  join normalized_target_ids
    on normalized_target_ids.element_id = canvas_element.id
  where canvas_element.project_view_id = target_project_view_id;

  if found_count <> target_count then
    raise exception 'CANVAS_ELEMENT_NOT_FOUND';
  end if;

  with normalized_target_ids as (
    select distinct entry.element_id
    from unnest(coalesce(target_element_ids, '{}'::uuid[])) as entry(element_id)
    where entry.element_id is not null
  )
  delete from public.canvas_elements canvas_element
  using normalized_target_ids
  where canvas_element.id = normalized_target_ids.element_id
    and canvas_element.project_view_id = target_project_view_id;
end;
$$;

revoke all on function public.update_canvas_elements(uuid, jsonb) from public;

grant execute on function public.update_canvas_elements(uuid, jsonb) to authenticated;

revoke all on function public.delete_canvas_elements(uuid, uuid[]) from public;

grant execute on function public.delete_canvas_elements(uuid, uuid[]) to authenticated;
