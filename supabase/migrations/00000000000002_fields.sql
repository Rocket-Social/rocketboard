-- Custom fields: field definitions, field options.
-- Canonical greenfield owner file. Modify in place.

create table public.field_definitions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  key text not null,
  name text not null,
  field_type public.custom_field_type not null,
  position integer not null,
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  updated_by_user_id uuid not null references auth.users (id) on delete restrict,
  constraint field_definitions_project_key_key unique (project_id, key),
  constraint field_definitions_name_not_blank check (length(trim(name)) > 0),
  constraint field_definitions_key_not_blank check (length(trim(key)) > 0)
);

create table public.field_options (
  id uuid primary key default gen_random_uuid(),
  field_definition_id uuid not null references public.field_definitions (id) on delete cascade,
  label text not null,
  position integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  updated_by_user_id uuid not null references auth.users (id) on delete restrict,
  color text,
  constraint field_options_label_not_blank check (length(trim(label)) > 0)
);

create unique index field_options_definition_label_key
  on public.field_options (field_definition_id, lower(trim(label)));

-- card_field_values table removed: custom field values now stored as JSONB on cards.custom_data

create index field_definitions_project_id_idx on public.field_definitions (project_id, position, created_at);

create index field_options_definition_id_idx on public.field_options (field_definition_id, position, created_at);

create trigger field_definitions_set_updated_at
before update on public.field_definitions
for each row execute function public.set_updated_at();

create trigger field_definitions_auto_touch_project
  after insert or update or delete on public.field_definitions
  for each row execute function public.trigger_touch_project();

create trigger field_options_set_updated_at
before update on public.field_options
for each row execute function public.set_updated_at();

alter table public.field_definitions enable row level security;

alter table public.field_options enable row level security;

create policy field_definitions_select_for_members
on public.field_definitions
for select
to authenticated
using (public.can_access_project(project_id));

create policy field_options_select_for_members
on public.field_options
for select
to authenticated
using (
  exists (
    select 1
    from public.field_definitions field_definition
    where field_definition.id = field_options.field_definition_id
      and public.can_access_project(field_definition.project_id)
  )
);

-- ── Write RLS policies for fields domain ───────────────────────────

create policy field_definitions_insert_for_managers on public.field_definitions
  for insert to authenticated with check (public.can_edit_project(project_id));

create policy field_definitions_update_for_managers on public.field_definitions
  for update to authenticated using (public.can_edit_project(project_id));

create policy field_definitions_delete_for_managers on public.field_definitions
  for delete to authenticated using (public.can_edit_project(project_id));

create policy field_options_insert_for_managers on public.field_options
  for insert to authenticated with check (
    exists (
      select 1 from public.field_definitions fd
      where fd.id = field_options.field_definition_id
        and public.can_edit_project(fd.project_id)
    )
  );

create policy field_options_update_for_managers on public.field_options
  for update to authenticated using (
    exists (
      select 1 from public.field_definitions fd
      where fd.id = field_options.field_definition_id
        and public.can_edit_project(fd.project_id)
    )
  );

create policy field_options_delete_for_managers on public.field_options
  for delete to authenticated using (
    exists (
      select 1 from public.field_definitions fd
      where fd.id = field_options.field_definition_id
        and public.can_edit_project(fd.project_id)
    )
  );

create or replace function public.generate_field_key(
  target_project_id uuid,
  target_name text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base_key text;
  candidate_key text;
  suffix integer := 2;
begin
  base_key := regexp_replace(lower(trim(coalesce(target_name, ''))), '[^a-z0-9]+', '_', 'g');
  base_key := regexp_replace(base_key, '^_+|_+$', '', 'g');

  if base_key = '' then
    base_key := 'field';
  end if;

  candidate_key := base_key;

  while exists (
    select 1
    from public.field_definitions field_definition
    where field_definition.project_id = target_project_id
      and field_definition.key = candidate_key
  ) loop
    candidate_key := base_key || '_' || suffix::text;
    suffix := suffix + 1;
  end loop;

  return candidate_key;
end;
$$;

create or replace function public.get_project_custom_fields(target_project_id uuid)
returns table(
  id uuid,
  key text,
  name text,
  field_type public.custom_field_type,
  "position" integer,
  created_at timestamptz,
  options jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    field_definition.id,
    field_definition.key,
    field_definition.name,
    field_definition.field_type,
    field_definition.position,
    field_definition.created_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', field_option.id,
            'label', field_option.label,
            'color', field_option.color
          )
          order by field_option.position asc, field_option.created_at asc, field_option.id asc
        )
        from public.field_options field_option
        where field_option.field_definition_id = field_definition.id
      ),
      '[]'::jsonb
    ) as options
  from public.field_definitions field_definition
  where field_definition.project_id = target_project_id
    and field_definition.archived_at is null
    and public.can_access_project(target_project_id, auth.uid())
  order by field_definition.position asc, field_definition.created_at asc, field_definition.id asc;
$$;

-- get_card_custom_field_values now reads from cards.custom_data JSONB column
-- instead of the old card_field_values EAV table
create or replace function public.get_card_custom_field_values(target_card_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select card.custom_data from public.cards card where card.id = target_card_id),
    '{}'::jsonb
  );
$$;

create or replace function public.create_field_definition(
  target_project_id uuid,
  target_name text,
  target_field_type public.custom_field_type,
  target_options text[] default '{}'::text[]
)
returns table(
  id uuid,
  key text,
  name text,
  field_type public.custom_field_type,
  "position" integer,
  created_at timestamptz,
  options jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_field public.field_definitions%rowtype;
  next_position integer;
  normalized_name text := nullif(trim(target_name), '');
  normalized_options text[] := '{}'::text[];
begin
  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to edit fields on this project.';
  end if;

  if normalized_name is null then
    raise exception 'Field name is required.';
  end if;

  if target_field_type = 'single_select' then
    select coalesce(
      (
        select array_agg(entry.label order by entry.ordinality)
        from (
          select distinct on (lower(trim(option_label)))
            trim(option_label) as label,
            ordinality
          from unnest(coalesce(target_options, '{}'::text[])) with ordinality as option_entry(option_label, ordinality)
          where length(trim(option_label)) > 0
          order by lower(trim(option_label)), ordinality
        ) entry
      ),
      '{}'::text[]
    )
      into normalized_options;

    if cardinality(normalized_options) = 0 then
      raise exception 'Single-select fields require at least one option.';
    end if;
  end if;

  select coalesce(max(field_definition.position), -1) + 1
    into next_position
  from public.field_definitions field_definition
  where field_definition.project_id = target_project_id;

  insert into public.field_definitions (
    project_id,
    key,
    name,
    field_type,
    position,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    target_project_id,
    public.generate_field_key(target_project_id, normalized_name),
    normalized_name,
    target_field_type,
    next_position,
    auth.uid(),
    auth.uid()
  )
  returning * into created_field;

  if target_field_type = 'single_select' then
    insert into public.field_options (
      field_definition_id,
      label,
      position,
      created_by_user_id,
      updated_by_user_id
    )
    select
      created_field.id,
      option_label,
      ordinality - 1,
      auth.uid(),
      auth.uid()
    from unnest(normalized_options) with ordinality as entry(option_label, ordinality);
  end if;

  update public.project_views project_view
  set
    shared_config = public.normalize_project_table_shared_config(
      target_project_id,
      project_view.shared_config ->> 'groupBy',
      project_view.shared_config -> 'sort',
      project_view.shared_config -> 'filters',
      public.jsonb_text_array(project_view.shared_config -> 'visibleFieldKeys') || created_field.key
    ),
    version = version + 1,
    updated_by_user_id = auth.uid(),
    updated_at = timezone('utc', now())
  where project_view.project_id = target_project_id
    and project_view.view_type = 'table';

  return query
    select f.id, f.key, f.name, f.field_type, f.position, f.created_at, f.options
    from public.get_project_custom_fields(target_project_id) f
    where f.id = created_field.id
    limit 1;
end;
$$;

create or replace function public.add_field_option(
  target_field_definition_id uuid,
  target_label text
)
returns table(id uuid, label text, field_definition_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_field public.field_definitions%rowtype;
  next_position integer;
  normalized_label text := trim(target_label);
  created_option public.field_options%rowtype;
begin
  select *
    into target_field
  from public.field_definitions field_definition
  where field_definition.id = target_field_definition_id;

  if target_field.id is null then
    raise exception 'FIELD_NOT_FOUND';
  end if;

  if not public.can_edit_project(target_field.project_id, auth.uid()) then
    raise exception 'You do not have permission to modify this field.';
  end if;

  if target_field.field_type != 'single_select' then
    raise exception 'Options can only be added to single_select fields.';
  end if;

  if normalized_label is null or normalized_label = '' then
    raise exception 'Option label is required.';
  end if;

  select coalesce(max(field_option.position), -1) + 1
    into next_position
  from public.field_options field_option
  where field_option.field_definition_id = target_field_definition_id;

  insert into public.field_options (
    field_definition_id,
    label,
    position,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    target_field_definition_id,
    normalized_label,
    next_position,
    auth.uid(),
    auth.uid()
  )
  returning * into created_option;

  return query
    select
      created_option.id,
      created_option.label,
      target_field_definition_id as field_definition_id;
end;
$$;

revoke all on function public.add_field_option(uuid, text) from public;

grant execute on function public.add_field_option(uuid, text) to authenticated;

create or replace function public.rename_field_option(
  target_option_id uuid,
  target_label text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_option public.field_options%rowtype;
  target_field public.field_definitions%rowtype;
  normalized_label text := trim(target_label);
begin
  select *
    into target_option
  from public.field_options field_option
  where field_option.id = target_option_id;

  if target_option.id is null then
    raise exception 'OPTION_NOT_FOUND';
  end if;

  select *
    into target_field
  from public.field_definitions field_definition
  where field_definition.id = target_option.field_definition_id;

  if not public.can_edit_project(target_field.project_id, auth.uid()) then
    raise exception 'You do not have permission to modify this field.';
  end if;

  if normalized_label = '' then
    raise exception 'Label cannot be empty.';
  end if;

  update public.field_options
  set
    label = normalized_label,
    updated_at = timezone('utc', now()),
    updated_by_user_id = auth.uid()
  where id = target_option_id;
end;
$$;

revoke all on function public.rename_field_option(uuid, text) from public;

grant execute on function public.rename_field_option(uuid, text) to authenticated;

create or replace function public.delete_field_option(target_option_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_option public.field_options%rowtype;
  target_field public.field_definitions%rowtype;
begin
  select * into target_option
  from public.field_options where id = target_option_id;

  if target_option.id is null then
    raise exception 'OPTION_NOT_FOUND';
  end if;

  select * into target_field
  from public.field_definitions where id = target_option.field_definition_id;

  if not public.can_edit_project(target_field.project_id, auth.uid()) then
    raise exception 'You do not have permission to modify this field.';
  end if;

  -- Clear custom_data entries referencing this option from all cards in the project
  update public.cards card
  set custom_data = custom_data - target_field.key,
      updated_by_user_id = auth.uid()
  where card.project_id = target_field.project_id
    and card.custom_data ? target_field.key
    and card.custom_data -> target_field.key ->> 'optionId' = target_option_id::text;

  -- Delete the option
  delete from public.field_options where id = target_option_id;

end;
$$;

revoke all on function public.delete_field_option(uuid) from public;

grant execute on function public.delete_field_option(uuid) to authenticated;

create or replace function public.set_card_field_value(
  target_card_id uuid,
  target_field_definition_id uuid,
  target_text_value text default null,
  target_number_value numeric default null,
  target_date_value date default null,
  target_field_option_id uuid default null
)
returns table(card_id uuid, project_id uuid, field_key text, value jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_card public.cards%rowtype;
  field_definition public.field_definitions%rowtype;
  normalized_text text;
  field_value jsonb;
  is_clear boolean := false;
begin
  select *
    into current_card
  from public.cards card
  where card.id = target_card_id
    and public.can_edit_project(card.project_id, auth.uid());

  if current_card.id is null then
    raise exception 'CARD_NOT_FOUND';
  end if;

  select *
    into field_definition
  from public.field_definitions field_entry
  where field_entry.id = target_field_definition_id
    and field_entry.project_id = current_card.project_id
    and field_entry.archived_at is null;

  if field_definition.id is null then
    raise exception 'FIELD_NOT_FOUND';
  end if;

  normalized_text := nullif(trim(coalesce(target_text_value, '')), '');

  -- Build the value JSONB based on field type
  if field_definition.field_type = 'text' then
    if normalized_text is null then
      is_clear := true;
    else
      field_value := jsonb_strip_nulls(jsonb_build_object(
        'fieldDefinitionId', field_definition.id,
        'fieldKey', field_definition.key,
        'fieldType', field_definition.field_type,
        'textValue', normalized_text
      ));
    end if;
  elsif field_definition.field_type = 'number' then
    if target_number_value is null then
      is_clear := true;
    else
      field_value := jsonb_strip_nulls(jsonb_build_object(
        'fieldDefinitionId', field_definition.id,
        'fieldKey', field_definition.key,
        'fieldType', field_definition.field_type,
        'numberValue', target_number_value
      ));
    end if;
  elsif field_definition.field_type = 'date' then
    if target_date_value is null then
      is_clear := true;
    else
      field_value := jsonb_strip_nulls(jsonb_build_object(
        'fieldDefinitionId', field_definition.id,
        'fieldKey', field_definition.key,
        'fieldType', field_definition.field_type,
        'dateValue', target_date_value
      ));
    end if;
  else
    -- single_select: validate option exists
    if target_field_option_id is not null then
      if not exists (
        select 1 from public.field_options
        where id = target_field_option_id
          and field_definition_id = target_field_definition_id
      ) then
        is_clear := true;
      else
        field_value := jsonb_strip_nulls(jsonb_build_object(
          'fieldDefinitionId', field_definition.id,
          'fieldKey', field_definition.key,
          'fieldType', field_definition.field_type,
          'optionId', target_field_option_id
        ));
      end if;
    else
      is_clear := true;
    end if;
  end if;

  -- Apply to cards.custom_data
  if is_clear then
    update public.cards
    set custom_data = custom_data - field_definition.key,
        updated_by_user_id = auth.uid()
    where id = target_card_id;
  else
    update public.cards
    set custom_data = jsonb_set(
          coalesce(custom_data, '{}'::jsonb),
          array[field_definition.key],
          field_value
        ),
        updated_by_user_id = auth.uid()
    where id = target_card_id;
  end if;

  return query
    select
      current_card.id as card_id,
      current_card.project_id,
      field_definition.key as field_key,
      case when is_clear then null else field_value end as value;
end;
$$;

revoke all on function public.generate_field_key(uuid, text) from public;

revoke all on function public.get_card_custom_field_values(uuid) from public;

revoke all on function public.get_project_custom_fields(uuid) from public;

grant execute on function public.get_project_custom_fields(uuid) to authenticated;

revoke all on function public.create_field_definition(uuid, text, public.custom_field_type, text[]) from public;

grant execute on function public.create_field_definition(uuid, text, public.custom_field_type, text[]) to authenticated;

revoke all on function public.set_card_field_value(uuid, uuid, text, numeric, date, uuid) from public;

grant execute on function public.set_card_field_value(uuid, uuid, text, numeric, date, uuid) to authenticated;

create function public.rename_field_definition(
  target_field_definition_id uuid,
  target_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_field public.field_definitions%rowtype;
  normalized_name text := trim(target_name);
begin
  select *
    into target_field
  from public.field_definitions field_definition
  where field_definition.id = target_field_definition_id;

  if target_field.id is null then
    raise exception 'FIELD_NOT_FOUND';
  end if;

  if not public.can_edit_project(target_field.project_id, auth.uid()) then
    raise exception 'You do not have permission to rename this field.';
  end if;

  if target_field.archived_at is not null then
    raise exception 'ARCHIVED_FIELD';
  end if;

  if normalized_name is null or normalized_name = '' then
    raise exception 'Field name is required.';
  end if;

  if target_field.name = normalized_name then
    return;
  end if;

  update public.field_definitions
  set
    name = normalized_name,
    updated_by_user_id = auth.uid(),
    updated_at = timezone('utc', now())
  where id = target_field_definition_id;

end;
$$;

revoke all on function public.rename_field_definition(uuid, text) from public;

grant execute on function public.rename_field_definition(uuid, text) to authenticated;

create or replace function public.archive_field_definition(target_field_definition_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_field public.field_definitions%rowtype;
begin
  select *
    into target_field
  from public.field_definitions field_definition
  where field_definition.id = target_field_definition_id;

  if target_field.id is null then
    raise exception 'FIELD_NOT_FOUND';
  end if;

  if not public.can_edit_project(target_field.project_id, auth.uid()) then
    raise exception 'You do not have permission to archive this field.';
  end if;

  if target_field.archived_at is not null then
    return;
  end if;

  update public.field_definitions
  set
    archived_at = timezone('utc', now()),
    updated_by_user_id = auth.uid(),
    updated_at = timezone('utc', now())
  where id = target_field_definition_id;

  update public.project_views project_view
  set
    shared_config = public.normalize_project_table_shared_config(
      target_field.project_id,
      project_view.shared_config ->> 'groupBy',
      project_view.shared_config -> 'sort',
      project_view.shared_config -> 'filters',
      (
        select coalesce(
          array_agg(field_key order by ordinality),
          '{}'::text[]
        )
        from unnest(public.jsonb_text_array(project_view.shared_config -> 'visibleFieldKeys')) with ordinality as entry(field_key, ordinality)
        where field_key <> target_field.key
      )
    ),
    version = version + 1,
    updated_by_user_id = auth.uid(),
    updated_at = timezone('utc', now())
  where project_view.project_id = target_field.project_id
    and project_view.view_type = 'table';

end;
$$;

revoke all on function public.archive_field_definition(uuid) from public;

grant execute on function public.archive_field_definition(uuid) to authenticated;

create or replace function public.reorder_field_options(
  target_option_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.field_options field_option
    join public.field_definitions field_definition
      on field_definition.id = field_option.field_definition_id
    where field_option.id = any(coalesce(target_option_ids, '{}'::uuid[]))
      and not public.can_edit_project(field_definition.project_id, auth.uid())
  ) then
    raise exception 'You do not have permission to modify these field options.';
  end if;

  for i in 1..array_length(target_option_ids, 1) loop
    update public.field_options
    set position = i - 1,
        updated_at = timezone('utc', now()),
        updated_by_user_id = auth.uid()
    where id = target_option_ids[i];
  end loop;
end;
$$;

revoke all on function public.reorder_field_options(uuid[]) from public;

grant execute on function public.reorder_field_options(uuid[]) to authenticated;

create or replace function public.set_field_option_color(target_option_id uuid, target_color text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  target_option public.field_options%rowtype;
  target_field public.field_definitions%rowtype;
begin
  select * into target_option from public.field_options where id = target_option_id;
  if target_option.id is null then raise exception 'Field option not found.'; end if;
  select *
    into target_field
  from public.field_definitions
  where id = target_option.field_definition_id;
  if not public.can_edit_project(target_field.project_id, auth.uid()) then
    raise exception 'You do not have permission to modify this field.';
  end if;
  update public.field_options set color = nullif(trim(target_color), '') where id = target_option_id;
end;
$$;

revoke all on function public.set_field_option_color(uuid, text) from public;

grant execute on function public.set_field_option_color(uuid, text) to authenticated;
