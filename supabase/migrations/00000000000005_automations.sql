-- Automations: project automation rules, runs, evaluation engine.
-- Canonical greenfield owner file. Modify in place.

create or replace function public.current_automation_metadata()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when nullif(current_setting('rocketboard.automation_id', true), '') is null then '{}'::jsonb
    else jsonb_strip_nulls(
      jsonb_build_object(
        'source', 'automation',
        'automationId', nullif(current_setting('rocketboard.automation_id', true), '')::uuid,
        'automationRunId', nullif(current_setting('rocketboard.automation_run_id', true), '')::uuid
      )
    )
  end;
$$;

create or replace function public.automation_status_label(target_status_option_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select project_status_option.label
      from public.project_status_options project_status_option
      where project_status_option.id = target_status_option_id
      limit 1
    ),
    ''
  );
$$;

create or replace function public.automation_priority_label(target_priority_option_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select project_priority_option.label
      from public.project_priority_options project_priority_option
      where project_priority_option.id = target_priority_option_id
      limit 1
    ),
    ''
  );
$$;

create or replace function public.automation_group_label(target_group_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select project_group.label
      from public.project_groups project_group
      where project_group.id = target_group_id
      limit 1
    ),
    ''
  );
$$;

create table if not exists public.project_automations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  position integer not null,
  status text not null default 'active',
  trigger_type text not null,
  trigger_config jsonb not null default '{}'::jsonb,
  condition_clauses jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  created_by_user_id uuid references auth.users (id) on delete set null,
  updated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint project_automations_project_position_key unique (project_id, position) deferrable initially immediate,
  constraint project_automations_status_check check (status in ('active', 'paused')),
  constraint project_automations_trigger_type_check check (
    trigger_type in ('card_created', 'status_changed', 'assignee_changed', 'priority_changed', 'card_completed')
  ),
  constraint project_automations_trigger_config_object_check check (jsonb_typeof(trigger_config) = 'object'),
  constraint project_automations_condition_clauses_array_check check (jsonb_typeof(condition_clauses) = 'array'),
  constraint project_automations_actions_array_check check (jsonb_typeof(actions) = 'array')
);

create index if not exists project_automations_project_status_idx
  on public.project_automations (project_id, status, position, created_at);

create trigger project_automations_set_updated_at
before update on public.project_automations
for each row execute function public.set_updated_at();

create table if not exists public.project_automation_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  automation_id uuid references public.project_automations (id) on delete set null,
  card_id uuid references public.cards (id) on delete set null,
  trigger_type text not null,
  outcome text not null,
  reason_code text not null,
  actions_executed jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint project_automation_runs_outcome_check check (outcome in ('applied', 'skipped', 'failed')),
  constraint project_automation_runs_actions_array_check check (jsonb_typeof(actions_executed) = 'array'),
  constraint project_automation_runs_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists project_automation_runs_project_created_idx
  on public.project_automation_runs (project_id, created_at desc, id desc);

create index if not exists project_automation_runs_automation_created_idx
  on public.project_automation_runs (automation_id, created_at desc, id desc);

alter table public.project_automations enable row level security;

alter table public.project_automation_runs enable row level security;

create policy project_automations_select_for_managers
on public.project_automations
for select
to authenticated
using (public.can_edit_project(project_id, auth.uid()));

create policy project_automation_runs_select_for_managers
on public.project_automation_runs
for select
to authenticated
using (public.can_edit_project(project_id, auth.uid()));

-- ── Write RLS policies for automations domain ──────────────────────

create policy project_automations_insert_for_managers on public.project_automations
  for insert to authenticated with check (public.can_edit_project(project_id));

create policy project_automations_update_for_managers on public.project_automations
  for update to authenticated using (public.can_edit_project(project_id));

create policy project_automations_delete_for_managers on public.project_automations
  for delete to authenticated using (public.can_edit_project(project_id));

create policy project_automation_runs_insert on public.project_automation_runs
  for insert to authenticated with check (public.can_edit_project(project_id));

create or replace function public.automation_set_execution_context(
  target_automation_id uuid,
  target_run_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('rocketboard.automation_suppressed', '1', true);
  perform set_config('rocketboard.automation_id', target_automation_id::text, true);
  perform set_config('rocketboard.automation_run_id', target_run_id::text, true);
end;
$$;

create or replace function public.automation_clear_execution_context()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('rocketboard.automation_suppressed', '', true);
  perform set_config('rocketboard.automation_id', '', true);
  perform set_config('rocketboard.automation_run_id', '', true);
end;
$$;

create or replace function public.automation_build_card_snapshot(target_card public.cards)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'cardId', target_card.id,
    'projectId', target_card.project_id,
    'title', target_card.title,
    'bodyText', coalesce(target_card.body_md, ''),
    'statusOptionId', target_card.status_option_id,
    'priorityOptionId', target_card.priority_option_id,
    'assigneeUserId', target_card.assignee_user_id,
    'groupId', target_card.group_id,
    'tags', to_jsonb(coalesce(target_card.tags, '{}'::text[])),
    'createdByUserId', target_card.created_by_user_id,
    'customFieldValues', coalesce(target_card.custom_data, '{}'::jsonb)
  );
$$;

create or replace function public.automation_custom_field_value(
  target_card_snapshot jsonb,
  target_field_definition_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select entry.value
      from jsonb_each(coalesce(target_card_snapshot -> 'customFieldValues', '{}'::jsonb)) entry
      where entry.value ->> 'fieldDefinitionId' = target_field_definition_id::text
      limit 1
    ),
    'null'::jsonb
  );
$$;

create or replace function public.automation_condition_matches(
  target_project_id uuid,
  target_condition jsonb,
  target_card_snapshot jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  condition_field text := lower(trim(coalesce(target_condition ->> 'field', '')));
  condition_operator text := lower(trim(coalesce(target_condition ->> 'operator', '')));
  condition_value text := nullif(trim(coalesce(target_condition ->> 'value', '')), '');
  condition_field_definition_id uuid := nullif(target_condition ->> 'fieldDefinitionId', '')::uuid;
  scalar_value text;
  tag_values text[] := '{}'::text[];
  custom_value jsonb;
begin
  if condition_operator not in ('is', 'is_not', 'is_empty', 'is_not_empty') then
    return false;
  end if;

  if condition_field = 'tags' then
    select coalesce(array_agg(value), '{}'::text[])
      into tag_values
    from jsonb_array_elements_text(coalesce(target_card_snapshot -> 'tags', '[]'::jsonb));

    case condition_operator
      when 'is' then
        return condition_value is not null and condition_value = any(tag_values);
      when 'is_not' then
        return condition_value is not null and not (condition_value = any(tag_values));
      when 'is_empty' then
        return cardinality(tag_values) = 0;
      when 'is_not_empty' then
        return cardinality(tag_values) > 0;
      else
        return false;
    end case;
  end if;

  if condition_field = 'custom_field' then
    custom_value := public.automation_custom_field_value(target_card_snapshot, condition_field_definition_id);
    scalar_value := nullif(custom_value ->> 'optionId', '');
  else
    case condition_field
      when 'status' then scalar_value := nullif(target_card_snapshot ->> 'statusOptionId', '');
      when 'priority' then scalar_value := nullif(target_card_snapshot ->> 'priorityOptionId', '');
      when 'assignee' then scalar_value := nullif(target_card_snapshot ->> 'assigneeUserId', '');
      when 'group' then scalar_value := nullif(target_card_snapshot ->> 'groupId', '');
      else return false;
    end case;
  end if;

  case condition_operator
    when 'is' then
      return condition_value is not null and scalar_value is not null and scalar_value = condition_value;
    when 'is_not' then
      return condition_value is not null and (scalar_value is null or scalar_value <> condition_value);
    when 'is_empty' then
      return scalar_value is null;
    when 'is_not_empty' then
      return scalar_value is not null;
    else
      return false;
  end case;
end;
$$;

create or replace function public.automation_conditions_match(
  target_project_id uuid,
  target_conditions jsonb,
  target_card_snapshot jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  condition_entry jsonb;
begin
  if coalesce(jsonb_typeof(target_conditions), 'array') <> 'array' then
    return false;
  end if;

  for condition_entry in
    select value
    from jsonb_array_elements(coalesce(target_conditions, '[]'::jsonb))
  loop
    if not public.automation_condition_matches(target_project_id, condition_entry, target_card_snapshot) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.automation_trigger_matches(
  target_trigger_type text,
  target_trigger_config jsonb,
  target_event_snapshot jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  trigger_type text := lower(trim(coalesce(target_trigger_type, '')));
begin
  case trigger_type
    when 'card_created' then
      return (target_event_snapshot ->> 'operation') = 'INSERT'
        and (
          nullif(trim(coalesce(target_trigger_config ->> 'creationSource', '')), '') is null
          or target_trigger_config ->> 'creationSource' = target_event_snapshot ->> 'creationSource'
        );
    when 'status_changed' then
      return coalesce((target_event_snapshot ->> 'statusChanged')::boolean, false)
        and (
          nullif(target_trigger_config ->> 'fromStatusOptionId', '') is null
          or target_trigger_config ->> 'fromStatusOptionId' = target_event_snapshot ->> 'oldStatusOptionId'
        )
        and (
          nullif(target_trigger_config ->> 'toStatusOptionId', '') is null
          or target_trigger_config ->> 'toStatusOptionId' = target_event_snapshot ->> 'newStatusOptionId'
        );
    when 'assignee_changed' then
      return coalesce((target_event_snapshot ->> 'assigneeChanged')::boolean, false)
        and (
          nullif(target_trigger_config ->> 'fromUserId', '') is null
          or target_trigger_config ->> 'fromUserId' = target_event_snapshot ->> 'oldAssigneeUserId'
        )
        and (
          nullif(target_trigger_config ->> 'toUserId', '') is null
          or target_trigger_config ->> 'toUserId' = target_event_snapshot ->> 'newAssigneeUserId'
        );
    when 'priority_changed' then
      return coalesce((target_event_snapshot ->> 'priorityChanged')::boolean, false)
        and (
          nullif(target_trigger_config ->> 'fromPriorityOptionId', '') is null
          or target_trigger_config ->> 'fromPriorityOptionId' = target_event_snapshot ->> 'oldPriorityOptionId'
        )
        and (
          nullif(target_trigger_config ->> 'toPriorityOptionId', '') is null
          or target_trigger_config ->> 'toPriorityOptionId' = target_event_snapshot ->> 'newPriorityOptionId'
        );
    when 'card_completed' then
      return coalesce((target_event_snapshot ->> 'statusChanged')::boolean, false)
        and coalesce(target_event_snapshot ->> 'newStatusCategory', '') = 'completed'
        and coalesce(target_event_snapshot ->> 'oldStatusCategory', '') <> 'completed';
    else
      return false;
  end case;
end;
$$;

create or replace function public.automation_interpolate_text(
  target_template text,
  target_event_snapshot jsonb,
  target_card_snapshot jsonb
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  resolved_template text := coalesce(target_template, '');
  actor_user_id uuid := nullif(target_event_snapshot ->> 'actorUserId', '')::uuid;
  card_status_option_id uuid := nullif(target_card_snapshot ->> 'statusOptionId', '')::uuid;
  card_priority_option_id uuid := nullif(target_card_snapshot ->> 'priorityOptionId', '')::uuid;
  card_assignee_user_id uuid := nullif(target_card_snapshot ->> 'assigneeUserId', '')::uuid;
  card_group_id uuid := nullif(target_card_snapshot ->> 'groupId', '')::uuid;
begin
  resolved_template := replace(resolved_template, '{{card.title}}', coalesce(target_card_snapshot ->> 'title', ''));
  resolved_template := replace(resolved_template, '{{card.status}}', public.automation_status_label(card_status_option_id));
  resolved_template := replace(resolved_template, '{{card.priority}}', public.automation_priority_label(card_priority_option_id));
  resolved_template := replace(resolved_template, '{{card.assignee}}', public.profile_display_name(card_assignee_user_id));
  resolved_template := replace(resolved_template, '{{card.group}}', public.automation_group_label(card_group_id));
  resolved_template := replace(resolved_template, '{{actor.name}}', public.profile_display_name(actor_user_id));
  return resolved_template;
end;
$$;

create or replace function public.automation_validate_definition(
  target_project_id uuid,
  target_trigger_type text,
  target_trigger_config jsonb,
  target_condition_clauses jsonb,
  target_actions jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_trigger_type text := lower(trim(coalesce(target_trigger_type, '')));
  condition_entry jsonb;
  action_entry jsonb;
  condition_field text;
  condition_operator text;
  referenced_value text;
  referenced_field_definition_id uuid;
  action_type text;
  action_config jsonb;
begin
  if not public.project_is_active(target_project_id) then
    raise exception 'Project not found.';
  end if;

  if normalized_trigger_type not in ('card_created', 'status_changed', 'assignee_changed', 'priority_changed', 'card_completed') then
    raise exception 'Unsupported trigger type.';
  end if;

  if jsonb_typeof(coalesce(target_trigger_config, '{}'::jsonb)) <> 'object' then
    raise exception 'Trigger config must be an object.';
  end if;

  if jsonb_typeof(coalesce(target_condition_clauses, '[]'::jsonb)) <> 'array' then
    raise exception 'Condition clauses must be an array.';
  end if;

  if jsonb_typeof(target_actions) <> 'array' or jsonb_array_length(target_actions) = 0 then
    raise exception 'At least one action is required.';
  end if;

  if normalized_trigger_type = 'status_changed' then
    if nullif(target_trigger_config ->> 'fromStatusOptionId', '') is not null and not exists (
      select 1
      from public.project_status_options project_status_option
      where project_status_option.id = (target_trigger_config ->> 'fromStatusOptionId')::uuid
        and project_status_option.project_id = target_project_id
    ) then
      raise exception 'Trigger from-status option is invalid.';
    end if;

    if nullif(target_trigger_config ->> 'toStatusOptionId', '') is not null and not exists (
      select 1
      from public.project_status_options project_status_option
      where project_status_option.id = (target_trigger_config ->> 'toStatusOptionId')::uuid
        and project_status_option.project_id = target_project_id
    ) then
      raise exception 'Trigger to-status option is invalid.';
    end if;
  elsif normalized_trigger_type = 'assignee_changed' then
    if nullif(target_trigger_config ->> 'fromUserId', '') is not null and not public.can_access_project(target_project_id, (target_trigger_config ->> 'fromUserId')::uuid) then
      raise exception 'Trigger from-user is invalid.';
    end if;

    if nullif(target_trigger_config ->> 'toUserId', '') is not null and not public.can_access_project(target_project_id, (target_trigger_config ->> 'toUserId')::uuid) then
      raise exception 'Trigger to-user is invalid.';
    end if;
  elsif normalized_trigger_type = 'priority_changed' then
    if nullif(target_trigger_config ->> 'fromPriorityOptionId', '') is not null and not exists (
      select 1
      from public.project_priority_options project_priority_option
      where project_priority_option.id = (target_trigger_config ->> 'fromPriorityOptionId')::uuid
        and project_priority_option.project_id = target_project_id
    ) then
      raise exception 'Trigger from-priority option is invalid.';
    end if;

    if nullif(target_trigger_config ->> 'toPriorityOptionId', '') is not null and not exists (
      select 1
      from public.project_priority_options project_priority_option
      where project_priority_option.id = (target_trigger_config ->> 'toPriorityOptionId')::uuid
        and project_priority_option.project_id = target_project_id
    ) then
      raise exception 'Trigger to-priority option is invalid.';
    end if;
  end if;

  for condition_entry in
    select value
    from jsonb_array_elements(coalesce(target_condition_clauses, '[]'::jsonb))
  loop
    if jsonb_typeof(condition_entry) <> 'object' then
      raise exception 'Condition clauses must contain objects.';
    end if;

    condition_field := lower(trim(coalesce(condition_entry ->> 'field', '')));
    condition_operator := lower(trim(coalesce(condition_entry ->> 'operator', '')));
    referenced_value := nullif(trim(coalesce(condition_entry ->> 'value', '')), '');
    referenced_field_definition_id := nullif(condition_entry ->> 'fieldDefinitionId', '')::uuid;

    if condition_field not in ('status', 'priority', 'assignee', 'group', 'tags', 'custom_field') then
      raise exception 'Unsupported condition field.';
    end if;

    if condition_operator not in ('is', 'is_not', 'is_empty', 'is_not_empty') then
      raise exception 'Unsupported condition operator.';
    end if;

    if condition_field = 'status' and condition_operator in ('is', 'is_not') and (
      referenced_value is null
      or not exists (
        select 1
        from public.project_status_options project_status_option
        where project_status_option.id = referenced_value::uuid
          and project_status_option.project_id = target_project_id
      )
    ) then
      raise exception 'Condition status option is invalid.';
    end if;

    if condition_field = 'priority' and condition_operator in ('is', 'is_not') and (
      referenced_value is null
      or not exists (
        select 1
        from public.project_priority_options project_priority_option
        where project_priority_option.id = referenced_value::uuid
          and project_priority_option.project_id = target_project_id
      )
    ) then
      raise exception 'Condition priority option is invalid.';
    end if;

    if condition_field = 'assignee' and condition_operator in ('is', 'is_not') and (
      referenced_value is null
      or not public.can_access_project(target_project_id, referenced_value::uuid)
    ) then
      raise exception 'Condition assignee is invalid.';
    end if;

    if condition_field = 'group' and condition_operator in ('is', 'is_not') and (
      referenced_value is null
      or not exists (
        select 1
        from public.project_groups project_group
        where project_group.id = referenced_value::uuid
          and project_group.project_id = target_project_id
      )
    ) then
      raise exception 'Condition group is invalid.';
    end if;

    if condition_field = 'tags' and condition_operator in ('is', 'is_not') and referenced_value is null then
      raise exception 'Tag conditions require a tag value.';
    end if;

    if condition_field = 'custom_field' then
      if referenced_field_definition_id is null then
        raise exception 'Custom field conditions require a fieldDefinitionId.';
      end if;

      if not exists (
        select 1
        from public.field_definitions field_definition
        where field_definition.id = referenced_field_definition_id
          and field_definition.project_id = target_project_id
          and field_definition.archived_at is null
          and field_definition.field_type = 'single_select'
      ) then
        raise exception 'Condition custom field must reference an active single-select field in this project.';
      end if;

      if condition_operator in ('is', 'is_not') and (
        referenced_value is null
        or not exists (
          select 1
          from public.field_options field_option
          where field_option.id = referenced_value::uuid
            and field_option.field_definition_id = referenced_field_definition_id
        )
      ) then
        raise exception 'Condition custom field option is invalid.';
      end if;
    end if;
  end loop;

  for action_entry in
    select value
    from jsonb_array_elements(target_actions)
  loop
    if jsonb_typeof(action_entry) <> 'object' then
      raise exception 'Actions must contain objects.';
    end if;

    action_type := lower(trim(coalesce(action_entry ->> 'actionType', '')));
    action_config := coalesce(action_entry -> 'actionConfig', '{}'::jsonb);

    if jsonb_typeof(action_config) <> 'object' then
      raise exception 'Action config must be an object.';
    end if;

    case action_type
      when 'set_assignee' then
        referenced_value := nullif(trim(coalesce(action_config ->> 'userId', '')), '');

        if referenced_value is null then
          raise exception 'Set assignee actions require a userId.';
        end if;

        if referenced_value <> '__creator__' and not public.can_access_project(target_project_id, referenced_value::uuid) then
          raise exception 'Action assignee is invalid.';
        end if;
      when 'set_status' then
        referenced_value := nullif(action_config ->> 'statusOptionId', '');

        if referenced_value is null or not exists (
          select 1
          from public.project_status_options project_status_option
          where project_status_option.id = referenced_value::uuid
            and project_status_option.project_id = target_project_id
        ) then
          raise exception 'Action status option is invalid.';
        end if;
      when 'set_priority' then
        referenced_value := nullif(action_config ->> 'priorityOptionId', '');

        if referenced_value is null or not exists (
          select 1
          from public.project_priority_options project_priority_option
          where project_priority_option.id = referenced_value::uuid
            and project_priority_option.project_id = target_project_id
        ) then
          raise exception 'Action priority option is invalid.';
        end if;
      when 'add_comment' then
        if nullif(trim(coalesce(action_config ->> 'bodyTemplate', '')), '') is null then
          raise exception 'Add comment actions require a body template.';
        end if;
      when 'move_to_group' then
        referenced_value := nullif(action_config ->> 'groupId', '');

        if referenced_value is null or not exists (
          select 1
          from public.project_groups project_group
          where project_group.id = referenced_value::uuid
            and project_group.project_id = target_project_id
        ) then
          raise exception 'Action group is invalid.';
        end if;
      else
        raise exception 'Unsupported action type.';
    end case;
  end loop;
end;
$$;

create or replace function public.project_automation_broken_reason(
  target_project_id uuid,
  target_trigger_type text,
  target_trigger_config jsonb,
  target_condition_clauses jsonb,
  target_actions jsonb
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.automation_validate_definition(
    target_project_id,
    target_trigger_type,
    target_trigger_config,
    target_condition_clauses,
    target_actions
  );

  return null;
exception
  when others then
    return SQLERRM;
end;
$$;

create or replace function public.project_automation_payload(target_automation public.project_automations)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  broken_reason text := public.project_automation_broken_reason(
    target_automation.project_id,
    target_automation.trigger_type,
    target_automation.trigger_config,
    target_automation.condition_clauses,
    target_automation.actions
  );
begin
  return jsonb_build_object(
    'id', target_automation.id,
    'projectId', target_automation.project_id,
    'position', target_automation.position,
    'status', target_automation.status,
    'triggerType', target_automation.trigger_type,
    'triggerConfig', target_automation.trigger_config,
    'conditionClauses', target_automation.condition_clauses,
    'actions', target_automation.actions,
    'createdByUserId', target_automation.created_by_user_id,
    'updatedByUserId', target_automation.updated_by_user_id,
    'createdAt', target_automation.created_at,
    'updatedAt', target_automation.updated_at,
    'isBroken', broken_reason is not null,
    'brokenReason', broken_reason
  );
end;
$$;

create or replace function public.enforce_project_automation_limit(
  target_project_id uuid,
  target_excluded_automation_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  active_rule_count integer;
begin
  select count(*)
    into active_rule_count
  from public.project_automations project_automation
  where project_automation.project_id = target_project_id
    and project_automation.status = 'active'
    and project_automation.id is distinct from target_excluded_automation_id;

  if active_rule_count >= 20 then
    raise exception 'Projects can have at most 20 active automations.';
  end if;
end;
$$;

create or replace function public.automation_move_card_status(
  target_card_id uuid,
  target_status_option_id uuid,
  target_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_card public.cards%rowtype;
  normalized_target_position integer;
  target_count integer;
  resolved_actor_user_id uuid;
begin
  select *
    into current_card
  from public.cards card
  where card.id = target_card_id;

  if current_card.id is null then
    raise exception 'Card not found.';
  end if;

  if not exists (
    select 1
    from public.project_status_options project_status_option
    where project_status_option.id = target_status_option_id
      and project_status_option.project_id = current_card.project_id
  ) then
    raise exception 'Automation status target is invalid.';
  end if;

  if current_card.status_option_id is not distinct from target_status_option_id then
    return;
  end if;

  resolved_actor_user_id := coalesce(target_actor_user_id, current_card.updated_by_user_id, current_card.created_by_user_id);

  if resolved_actor_user_id is null then
    raise exception 'Automation actor is required.';
  end if;

  select count(*)
    into target_count
  from public.cards card
  where card.project_id = current_card.project_id
    and card.status_option_id is not distinct from target_status_option_id
    and card.id <> target_card_id;

  normalized_target_position := greatest(0, target_count);

  update public.cards as card
  set position = card.position - 1
  where card.project_id = current_card.project_id
    and card.status_option_id is not distinct from current_card.status_option_id
    and card.position > current_card.position;

  update public.cards as card
  set position = card.position + 1
  where card.project_id = current_card.project_id
    and card.status_option_id is not distinct from target_status_option_id
    and card.position >= normalized_target_position;

  update public.cards as card
  set
    status_option_id = target_status_option_id,
    position = normalized_target_position,
    start_at = case
      when (select category from public.project_status_options where id = target_status_option_id) = 'started'
        and coalesce((select category from public.project_status_options where id = current_card.status_option_id), '') <> 'started'
        and card.start_at is null
        then current_date
      else card.start_at
    end,
    completed_at = case
      when (select category from public.project_status_options where id = target_status_option_id) = 'completed'
        and coalesce((select category from public.project_status_options where id = current_card.status_option_id), '') <> 'completed'
        then timezone('utc', now())
      when coalesce((select category from public.project_status_options where id = target_status_option_id), '') <> 'completed'
        then null
      else card.completed_at
    end,
    updated_by_user_id = resolved_actor_user_id
  where card.id = current_card.id;

  perform public.touch_project(current_card.project_id, resolved_actor_user_id);
end;
$$;

create or replace function public.automation_set_card_priority(
  target_card_id uuid,
  target_priority_option_id uuid,
  target_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_card public.cards%rowtype;
  resolved_actor_user_id uuid;
begin
  select *
    into current_card
  from public.cards card
  where card.id = target_card_id;

  if current_card.id is null then
    raise exception 'Card not found.';
  end if;

  if not exists (
    select 1
    from public.project_priority_options project_priority_option
    where project_priority_option.id = target_priority_option_id
      and project_priority_option.project_id = current_card.project_id
  ) then
    raise exception 'Automation priority target is invalid.';
  end if;

  if current_card.priority_option_id is not distinct from target_priority_option_id then
    return;
  end if;

  resolved_actor_user_id := coalesce(target_actor_user_id, current_card.updated_by_user_id, current_card.created_by_user_id);

  if resolved_actor_user_id is null then
    raise exception 'Automation actor is required.';
  end if;

  update public.cards
  set
    priority_option_id = target_priority_option_id,
    updated_by_user_id = resolved_actor_user_id
  where id = current_card.id;

  perform public.touch_project(current_card.project_id, resolved_actor_user_id);
end;
$$;

create or replace function public.automation_set_card_assignee(
  target_card_id uuid,
  target_assignee_user_id uuid,
  target_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_card public.cards%rowtype;
  resolved_actor_user_id uuid;
begin
  select *
    into current_card
  from public.cards card
  where card.id = target_card_id;

  if current_card.id is null then
    raise exception 'Card not found.';
  end if;

  if target_assignee_user_id is not null and not public.can_edit_project(current_card.project_id, target_assignee_user_id) then
    raise exception 'Automation assignee target is invalid.';
  end if;

  if current_card.assignee_user_id is not distinct from target_assignee_user_id then
    return;
  end if;

  resolved_actor_user_id := coalesce(target_actor_user_id, current_card.updated_by_user_id, current_card.created_by_user_id);

  if resolved_actor_user_id is null then
    raise exception 'Automation actor is required.';
  end if;

  update public.cards
  set
    assignee_user_id = target_assignee_user_id,
    updated_by_user_id = resolved_actor_user_id
  where id = current_card.id;

  perform public.touch_project(current_card.project_id, resolved_actor_user_id);
end;
$$;

create or replace function public.automation_move_card_group(
  target_card_id uuid,
  target_group_id uuid,
  target_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_card public.cards%rowtype;
  normalized_target_position integer;
  target_count integer;
  resolved_actor_user_id uuid;
begin
  select *
    into current_card
  from public.cards card
  where card.id = target_card_id;

  if current_card.id is null then
    raise exception 'Card not found.';
  end if;

  if not exists (
    select 1
    from public.project_groups project_group
    where project_group.id = target_group_id
      and project_group.project_id = current_card.project_id
  ) then
    raise exception 'Automation group target is invalid.';
  end if;

  if current_card.group_id is not distinct from target_group_id then
    return;
  end if;

  resolved_actor_user_id := coalesce(target_actor_user_id, current_card.updated_by_user_id, current_card.created_by_user_id);

  if resolved_actor_user_id is null then
    raise exception 'Automation actor is required.';
  end if;

  select count(*)
    into target_count
  from public.cards card
  where card.project_id = current_card.project_id
    and card.group_id is not distinct from target_group_id
    and card.id <> target_card_id;

  normalized_target_position := greatest(0, target_count);

  update public.cards as card
  set group_position = card.group_position - 1
  where card.project_id = current_card.project_id
    and card.group_id is not distinct from current_card.group_id
    and card.group_position > current_card.group_position;

  update public.cards as card
  set group_position = card.group_position + 1
  where card.project_id = current_card.project_id
    and card.group_id is not distinct from target_group_id
    and card.group_position >= normalized_target_position;

  update public.cards as card
  set
    group_id = target_group_id,
    group_position = normalized_target_position,
    updated_by_user_id = resolved_actor_user_id
  where card.id = current_card.id;

  perform public.touch_project(current_card.project_id, resolved_actor_user_id);
end;
$$;

create or replace function public.automation_add_card_comment(
  target_card_id uuid,
  target_body_text text,
  target_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_card public.cards%rowtype;
  normalized_body text := trim(coalesce(target_body_text, ''));
  resolved_actor_user_id uuid;
begin
  select *
    into current_card
  from public.cards card
  where card.id = target_card_id;

  if current_card.id is null then
    raise exception 'Card not found.';
  end if;

  if normalized_body = '' then
    raise exception 'Automation comments require body text.';
  end if;

  resolved_actor_user_id := coalesce(target_actor_user_id, current_card.updated_by_user_id, current_card.created_by_user_id);

  if resolved_actor_user_id is null then
    raise exception 'Automation actor is required.';
  end if;

  insert into public.card_comments (
    card_id,
    body_text,
    created_by_user_id,
    metadata
  )
  values (
    target_card_id,
    normalized_body,
    resolved_actor_user_id,
    public.current_automation_metadata()
  );

  perform public.touch_project(current_card.project_id, resolved_actor_user_id);
end;
$$;

create or replace function public.evaluate_project_automations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  automation_rule public.project_automations%rowtype;
  actor_user_id uuid;
  current_run_id uuid;
  event_snapshot jsonb;
  card_snapshot jsonb;
  action_entry jsonb;
  actions_executed jsonb;
  action_type text;
  broken_reason text;
  resolved_assignee_user_id uuid;
  interpolated_comment text;
  creation_source text := coalesce(nullif(current_setting('rocketboard.card_creation_source', true), ''), 'app');
begin
  if coalesce(nullif(current_setting('rocketboard.automation_suppressed', true), ''), '0') = '1' then
    return NEW;
  end if;

  actor_user_id := coalesce(
    auth.uid(),
    NEW.updated_by_user_id,
    NEW.created_by_user_id,
    case when TG_OP = 'UPDATE' then OLD.updated_by_user_id else null end,
    case when TG_OP = 'UPDATE' then OLD.created_by_user_id else null end
  );

  event_snapshot := jsonb_build_object(
    'operation', TG_OP,
    'projectId', NEW.project_id,
    'cardId', NEW.id,
    'actorUserId', actor_user_id,
    'creationSource', case when TG_OP = 'INSERT' then creation_source else null end,
    'statusChanged', case when TG_OP = 'UPDATE' then OLD.status_option_id is distinct from NEW.status_option_id else false end,
    'priorityChanged', case when TG_OP = 'UPDATE' then OLD.priority_option_id is distinct from NEW.priority_option_id else false end,
    'assigneeChanged', case when TG_OP = 'UPDATE' then OLD.assignee_user_id is distinct from NEW.assignee_user_id else false end,
    'oldStatusOptionId', case when TG_OP = 'UPDATE' then OLD.status_option_id else null end,
    'newStatusOptionId', NEW.status_option_id,
    'oldPriorityOptionId', case when TG_OP = 'UPDATE' then OLD.priority_option_id else null end,
    'newPriorityOptionId', NEW.priority_option_id,
    'oldAssigneeUserId', case when TG_OP = 'UPDATE' then OLD.assignee_user_id else null end,
    'newAssigneeUserId', NEW.assignee_user_id,
    'oldStatusCategory', case when TG_OP = 'UPDATE' then (select category from public.project_status_options where id = OLD.status_option_id) else null end,
    'newStatusCategory', (select category from public.project_status_options where id = NEW.status_option_id)
  );
  card_snapshot := public.automation_build_card_snapshot(NEW);

  for automation_rule in
    select *
    from public.project_automations project_automation
    where project_automation.project_id = NEW.project_id
      and project_automation.status = 'active'
    order by project_automation.position asc, project_automation.created_at asc, project_automation.id asc
  loop
    if not public.automation_trigger_matches(
      automation_rule.trigger_type,
      automation_rule.trigger_config,
      event_snapshot
    ) then
      continue;
    end if;

    broken_reason := public.project_automation_broken_reason(
      automation_rule.project_id,
      automation_rule.trigger_type,
      automation_rule.trigger_config,
      automation_rule.condition_clauses,
      automation_rule.actions
    );

    if broken_reason is not null then
      insert into public.project_automation_runs (
        project_id,
        automation_id,
        card_id,
        trigger_type,
        outcome,
        reason_code,
        actions_executed,
        metadata
      )
      values (
        NEW.project_id,
        automation_rule.id,
        NEW.id,
        automation_rule.trigger_type,
        'failed',
        'invalid_rule_config',
        '[]'::jsonb,
        jsonb_build_object('brokenReason', broken_reason, 'event', event_snapshot)
      );
      continue;
    end if;

    if not public.automation_conditions_match(
      NEW.project_id,
      automation_rule.condition_clauses,
      card_snapshot
    ) then
      insert into public.project_automation_runs (
        project_id,
        automation_id,
        card_id,
        trigger_type,
        outcome,
        reason_code,
        actions_executed,
        metadata
      )
      values (
        NEW.project_id,
        automation_rule.id,
        NEW.id,
        automation_rule.trigger_type,
        'skipped',
        'conditions_not_met',
        '[]'::jsonb,
        jsonb_build_object('event', event_snapshot)
      );
      continue;
    end if;

    current_run_id := gen_random_uuid();
    actions_executed := '[]'::jsonb;

    begin
      perform public.automation_set_execution_context(automation_rule.id, current_run_id);

      for action_entry in
        select value
        from jsonb_array_elements(automation_rule.actions)
      loop
        action_type := lower(trim(coalesce(action_entry ->> 'actionType', '')));

        case action_type
          when 'set_assignee' then
            resolved_assignee_user_id := case
              when action_entry -> 'actionConfig' ->> 'userId' = '__creator__' then NEW.created_by_user_id
              else (action_entry -> 'actionConfig' ->> 'userId')::uuid
            end;

            perform public.automation_set_card_assignee(
              NEW.id,
              resolved_assignee_user_id,
              actor_user_id
            );

            actions_executed := actions_executed || jsonb_build_array(
              jsonb_build_object(
                'actionType',
                'set_assignee',
                'assigneeUserId',
                resolved_assignee_user_id
              )
            );
          when 'set_status' then
            perform public.automation_move_card_status(
              NEW.id,
              (action_entry -> 'actionConfig' ->> 'statusOptionId')::uuid,
              actor_user_id
            );

            actions_executed := actions_executed || jsonb_build_array(
              jsonb_build_object(
                'actionType',
                'set_status',
                'statusOptionId',
                (action_entry -> 'actionConfig' ->> 'statusOptionId')::uuid
              )
            );
          when 'set_priority' then
            perform public.automation_set_card_priority(
              NEW.id,
              (action_entry -> 'actionConfig' ->> 'priorityOptionId')::uuid,
              actor_user_id
            );

            actions_executed := actions_executed || jsonb_build_array(
              jsonb_build_object(
                'actionType',
                'set_priority',
                'priorityOptionId',
                (action_entry -> 'actionConfig' ->> 'priorityOptionId')::uuid
              )
            );
          when 'move_to_group' then
            perform public.automation_move_card_group(
              NEW.id,
              (action_entry -> 'actionConfig' ->> 'groupId')::uuid,
              actor_user_id
            );

            actions_executed := actions_executed || jsonb_build_array(
              jsonb_build_object(
                'actionType',
                'move_to_group',
                'groupId',
                (action_entry -> 'actionConfig' ->> 'groupId')::uuid
              )
            );
          when 'add_comment' then
            interpolated_comment := public.automation_interpolate_text(
              action_entry -> 'actionConfig' ->> 'bodyTemplate',
              event_snapshot,
              card_snapshot
            );

            perform public.automation_add_card_comment(
              NEW.id,
              interpolated_comment,
              actor_user_id
            );

            actions_executed := actions_executed || jsonb_build_array(
              jsonb_build_object(
                'actionType',
                'add_comment',
                'bodyText',
                interpolated_comment
              )
            );
          else
            raise exception 'Unsupported action type.';
        end case;
      end loop;

      perform public.automation_clear_execution_context();

      insert into public.project_automation_runs (
        id,
        project_id,
        automation_id,
        card_id,
        trigger_type,
        outcome,
        reason_code,
        actions_executed,
        metadata
      )
      values (
        current_run_id,
        NEW.project_id,
        automation_rule.id,
        NEW.id,
        automation_rule.trigger_type,
        'applied',
        'actions_applied',
        actions_executed,
        jsonb_build_object('event', event_snapshot)
      );
    exception
      when others then
        perform public.automation_clear_execution_context();

        insert into public.project_automation_runs (
          id,
          project_id,
          automation_id,
          card_id,
          trigger_type,
          outcome,
          reason_code,
          actions_executed,
          metadata
        )
        values (
          current_run_id,
          NEW.project_id,
          automation_rule.id,
          NEW.id,
          automation_rule.trigger_type,
          'failed',
          'action_failed',
          '[]'::jsonb,
          jsonb_build_object(
            'error',
            SQLERRM,
            'event',
            event_snapshot
          )
        );
    end;
  end loop;

  return NEW;
end;
$$;

create or replace function public.list_project_automations(target_project_id uuid)
returns table(
  id uuid,
  project_id uuid,
  "position" integer,
  status text,
  trigger_type text,
  trigger_config jsonb,
  condition_clauses jsonb,
  actions jsonb,
  created_by_user_id uuid,
  updated_by_user_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  is_broken boolean,
  broken_reason text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pa.id,
    pa.project_id,
    pa.position,
    pa.status,
    pa.trigger_type,
    pa.trigger_config,
    pa.condition_clauses,
    pa.actions,
    pa.created_by_user_id,
    pa.updated_by_user_id,
    pa.created_at,
    pa.updated_at,
    public.project_automation_broken_reason(
      pa.project_id, pa.trigger_type, pa.trigger_config,
      pa.condition_clauses, pa.actions
    ) is not null as is_broken,
    public.project_automation_broken_reason(
      pa.project_id, pa.trigger_type, pa.trigger_config,
      pa.condition_clauses, pa.actions
    ) as broken_reason
  from public.project_automations pa
  where pa.project_id = target_project_id
    and public.can_edit_project(target_project_id, auth.uid())
  order by pa.position asc, pa.created_at asc;
$$;

create or replace function public.list_project_automation_runs(
  target_project_id uuid,
  target_limit integer default 25,
  target_cursor timestamptz default null
)
returns table(
  id uuid,
  project_id uuid,
  automation_id uuid,
  card_id uuid,
  card_title text,
  trigger_type text,
  outcome text,
  reason_code text,
  actions_executed jsonb,
  metadata jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    automation_run.id,
    automation_run.project_id,
    automation_run.automation_id,
    automation_run.card_id,
    card.title as card_title,
    automation_run.trigger_type,
    automation_run.outcome,
    automation_run.reason_code,
    automation_run.actions_executed,
    automation_run.metadata,
    automation_run.created_at
  from (
    select *
    from public.project_automation_runs project_automation_run
    where project_automation_run.project_id = target_project_id
      and public.can_edit_project(target_project_id, auth.uid())
      and (target_cursor is null or project_automation_run.created_at < target_cursor)
    order by project_automation_run.created_at desc, project_automation_run.id desc
    limit greatest(1, least(coalesce(target_limit, 25), 100))
  ) automation_run
  left join public.cards card
    on card.id = automation_run.card_id
  order by automation_run.created_at desc, automation_run.id desc;
$$;

create or replace function public.create_project_automation(
  target_project_id uuid,
  target_trigger_type text,
  target_trigger_config jsonb default '{}'::jsonb,
  target_condition_clauses jsonb default '[]'::jsonb,
  target_actions jsonb default '[]'::jsonb,
  target_status text default 'active'
)
returns table(
  id uuid,
  project_id uuid,
  "position" integer,
  status text,
  trigger_type text,
  trigger_config jsonb,
  condition_clauses jsonb,
  actions jsonb,
  created_by_user_id uuid,
  updated_by_user_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  is_broken boolean,
  broken_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_automation public.project_automations%rowtype;
  next_position integer;
  normalized_status text := lower(trim(coalesce(target_status, 'active')));
  v_broken_reason text;
begin
  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to manage automations on this project.';
  end if;

  if normalized_status not in ('active', 'paused') then
    raise exception 'Automation status must be active or paused.';
  end if;

  perform public.automation_validate_definition(
    target_project_id,
    target_trigger_type,
    target_trigger_config,
    target_condition_clauses,
    target_actions
  );

  if normalized_status = 'active' then
    perform public.enforce_project_automation_limit(target_project_id);
  end if;

  select coalesce(max(project_automation.position), -1) + 1
    into next_position
  from public.project_automations project_automation
  where project_automation.project_id = target_project_id;

  insert into public.project_automations (
    project_id,
    position,
    status,
    trigger_type,
    trigger_config,
    condition_clauses,
    actions,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    target_project_id,
    next_position,
    normalized_status,
    lower(trim(target_trigger_type)),
    coalesce(target_trigger_config, '{}'::jsonb),
    coalesce(target_condition_clauses, '[]'::jsonb),
    target_actions,
    auth.uid(),
    auth.uid()
  )
  returning * into created_automation;

  perform public.touch_project(target_project_id, auth.uid());

  v_broken_reason := public.project_automation_broken_reason(
    created_automation.project_id,
    created_automation.trigger_type,
    created_automation.trigger_config,
    created_automation.condition_clauses,
    created_automation.actions
  );

  return query
    select
      created_automation.id,
      created_automation.project_id,
      created_automation.position,
      created_automation.status,
      created_automation.trigger_type,
      created_automation.trigger_config,
      created_automation.condition_clauses,
      created_automation.actions,
      created_automation.created_by_user_id,
      created_automation.updated_by_user_id,
      created_automation.created_at,
      created_automation.updated_at,
      v_broken_reason is not null as is_broken,
      v_broken_reason as broken_reason;
end;
$$;

create or replace function public.update_project_automation(
  target_automation_id uuid,
  target_trigger_type text default null,
  target_trigger_config jsonb default null,
  target_condition_clauses jsonb default null,
  target_actions jsonb default null,
  target_status text default null
)
returns table(
  id uuid,
  project_id uuid,
  "position" integer,
  status text,
  trigger_type text,
  trigger_config jsonb,
  condition_clauses jsonb,
  actions jsonb,
  created_by_user_id uuid,
  updated_by_user_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  is_broken boolean,
  broken_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_automation public.project_automations%rowtype;
  next_trigger_type text;
  next_trigger_config jsonb;
  next_condition_clauses jsonb;
  next_actions jsonb;
  next_status text;
  v_broken_reason text;
begin
  select *
    into current_automation
  from public.project_automations project_automation
  where project_automation.id = target_automation_id;

  if current_automation.id is null then
    raise exception 'Automation not found.';
  end if;

  if not public.can_edit_project(current_automation.project_id, auth.uid()) then
    raise exception 'You do not have permission to manage automations on this project.';
  end if;

  next_trigger_type := lower(trim(coalesce(target_trigger_type, current_automation.trigger_type)));
  next_trigger_config := coalesce(target_trigger_config, current_automation.trigger_config);
  next_condition_clauses := coalesce(target_condition_clauses, current_automation.condition_clauses);
  next_actions := coalesce(target_actions, current_automation.actions);
  next_status := lower(trim(coalesce(target_status, current_automation.status)));

  if next_status not in ('active', 'paused') then
    raise exception 'Automation status must be active or paused.';
  end if;

  perform public.automation_validate_definition(
    current_automation.project_id,
    next_trigger_type,
    next_trigger_config,
    next_condition_clauses,
    next_actions
  );

  if current_automation.status = 'paused' and next_status = 'active' then
    perform public.enforce_project_automation_limit(current_automation.project_id, current_automation.id);
  end if;

  update public.project_automations project_automation
  set
    trigger_type = next_trigger_type,
    trigger_config = next_trigger_config,
    condition_clauses = next_condition_clauses,
    actions = next_actions,
    status = next_status,
    updated_by_user_id = auth.uid(),
    updated_at = timezone('utc', now())
  where project_automation.id = current_automation.id
  returning * into current_automation;

  perform public.touch_project(current_automation.project_id, auth.uid());

  v_broken_reason := public.project_automation_broken_reason(
    current_automation.project_id,
    current_automation.trigger_type,
    current_automation.trigger_config,
    current_automation.condition_clauses,
    current_automation.actions
  );

  return query
    select
      current_automation.id,
      current_automation.project_id,
      current_automation.position,
      current_automation.status,
      current_automation.trigger_type,
      current_automation.trigger_config,
      current_automation.condition_clauses,
      current_automation.actions,
      current_automation.created_by_user_id,
      current_automation.updated_by_user_id,
      current_automation.created_at,
      current_automation.updated_at,
      v_broken_reason is not null as is_broken,
      v_broken_reason as broken_reason;
end;
$$;

create or replace function public.pause_project_automation(target_automation_id uuid)
returns table(
  id uuid,
  project_id uuid,
  "position" integer,
  status text,
  trigger_type text,
  trigger_config jsonb,
  condition_clauses jsonb,
  actions jsonb,
  created_by_user_id uuid,
  updated_by_user_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  is_broken boolean,
  broken_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_automation public.project_automations%rowtype;
  v_broken_reason text;
begin
  select *
    into current_automation
  from public.project_automations project_automation
  where project_automation.id = target_automation_id;

  if current_automation.id is null then
    raise exception 'Automation not found.';
  end if;

  if not public.can_edit_project(current_automation.project_id, auth.uid()) then
    raise exception 'You do not have permission to manage automations on this project.';
  end if;

  update public.project_automations project_automation
  set
    status = 'paused',
    updated_by_user_id = auth.uid(),
    updated_at = timezone('utc', now())
  where project_automation.id = current_automation.id
  returning * into current_automation;

  perform public.touch_project(current_automation.project_id, auth.uid());

  v_broken_reason := public.project_automation_broken_reason(
    current_automation.project_id,
    current_automation.trigger_type,
    current_automation.trigger_config,
    current_automation.condition_clauses,
    current_automation.actions
  );

  return query
    select
      current_automation.id,
      current_automation.project_id,
      current_automation.position,
      current_automation.status,
      current_automation.trigger_type,
      current_automation.trigger_config,
      current_automation.condition_clauses,
      current_automation.actions,
      current_automation.created_by_user_id,
      current_automation.updated_by_user_id,
      current_automation.created_at,
      current_automation.updated_at,
      v_broken_reason is not null as is_broken,
      v_broken_reason as broken_reason;
end;
$$;

create or replace function public.resume_project_automation(target_automation_id uuid)
returns table(
  id uuid,
  project_id uuid,
  "position" integer,
  status text,
  trigger_type text,
  trigger_config jsonb,
  condition_clauses jsonb,
  actions jsonb,
  created_by_user_id uuid,
  updated_by_user_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  is_broken boolean,
  broken_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_automation public.project_automations%rowtype;
  v_broken_reason text;
begin
  select *
    into current_automation
  from public.project_automations project_automation
  where project_automation.id = target_automation_id;

  if current_automation.id is null then
    raise exception 'Automation not found.';
  end if;

  if not public.can_edit_project(current_automation.project_id, auth.uid()) then
    raise exception 'You do not have permission to manage automations on this project.';
  end if;

  perform public.automation_validate_definition(
    current_automation.project_id,
    current_automation.trigger_type,
    current_automation.trigger_config,
    current_automation.condition_clauses,
    current_automation.actions
  );
  perform public.enforce_project_automation_limit(current_automation.project_id, current_automation.id);

  update public.project_automations project_automation
  set
    status = 'active',
    updated_by_user_id = auth.uid(),
    updated_at = timezone('utc', now())
  where project_automation.id = current_automation.id
  returning * into current_automation;

  perform public.touch_project(current_automation.project_id, auth.uid());

  v_broken_reason := public.project_automation_broken_reason(
    current_automation.project_id,
    current_automation.trigger_type,
    current_automation.trigger_config,
    current_automation.condition_clauses,
    current_automation.actions
  );

  return query
    select
      current_automation.id,
      current_automation.project_id,
      current_automation.position,
      current_automation.status,
      current_automation.trigger_type,
      current_automation.trigger_config,
      current_automation.condition_clauses,
      current_automation.actions,
      current_automation.created_by_user_id,
      current_automation.updated_by_user_id,
      current_automation.created_at,
      current_automation.updated_at,
      v_broken_reason is not null as is_broken,
      v_broken_reason as broken_reason;
end;
$$;

create or replace function public.reorder_project_automations(
  target_project_id uuid,
  target_automation_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_rule_count integer;
begin
  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'You do not have permission to manage automations on this project.';
  end if;

  if coalesce(cardinality(target_automation_ids), 0) = 0 then
    raise exception 'Automation reorder payload cannot be empty.';
  end if;

  select count(*)
    into expected_rule_count
  from public.project_automations project_automation
  where project_automation.project_id = target_project_id;

  if expected_rule_count <> cardinality(target_automation_ids) then
    raise exception 'Automation reorder payload must include every automation in the project exactly once.';
  end if;

  if exists (
    select 1
    from unnest(target_automation_ids) reordered_id
    where not exists (
      select 1
      from public.project_automations project_automation
      where project_automation.id = reordered_id
        and project_automation.project_id = target_project_id
    )
  ) then
    raise exception 'Automation reorder payload contains an invalid automation id.';
  end if;

  set constraints project_automations_project_position_key deferred;

  update public.project_automations project_automation
  set
    position = reordered.ordinality - 1,
    updated_by_user_id = auth.uid(),
    updated_at = timezone('utc', now())
  from unnest(target_automation_ids) with ordinality as reordered(automation_id, ordinality)
  where project_automation.id = reordered.automation_id
    and project_automation.project_id = target_project_id;

  perform public.touch_project(target_project_id, auth.uid());
end;
$$;

revoke all on function public.list_project_automations(uuid) from public;

grant execute on function public.list_project_automations(uuid) to authenticated;

revoke all on function public.list_project_automation_runs(uuid, integer, timestamptz) from public;

grant execute on function public.list_project_automation_runs(uuid, integer, timestamptz) to authenticated;

revoke all on function public.create_project_automation(uuid, text, jsonb, jsonb, jsonb, text) from public;

grant execute on function public.create_project_automation(uuid, text, jsonb, jsonb, jsonb, text) to authenticated;

revoke all on function public.update_project_automation(uuid, text, jsonb, jsonb, jsonb, text) from public;

grant execute on function public.update_project_automation(uuid, text, jsonb, jsonb, jsonb, text) to authenticated;

revoke all on function public.pause_project_automation(uuid) from public;

grant execute on function public.pause_project_automation(uuid) to authenticated;

revoke all on function public.resume_project_automation(uuid) from public;

grant execute on function public.resume_project_automation(uuid) to authenticated;

revoke all on function public.reorder_project_automations(uuid, uuid[]) from public;

grant execute on function public.reorder_project_automations(uuid, uuid[]) to authenticated;

revoke all on function public.current_automation_metadata() from public;

revoke all on function public.automation_status_label(uuid) from public;

revoke all on function public.automation_priority_label(uuid) from public;

revoke all on function public.automation_group_label(uuid) from public;

revoke all on function public.automation_set_execution_context(uuid, uuid) from public;

revoke all on function public.automation_clear_execution_context() from public;

revoke all on function public.automation_custom_field_value(jsonb, uuid) from public;

revoke all on function public.automation_condition_matches(uuid, jsonb, jsonb) from public;

revoke all on function public.automation_conditions_match(uuid, jsonb, jsonb) from public;

revoke all on function public.automation_trigger_matches(text, jsonb, jsonb) from public;

revoke all on function public.automation_interpolate_text(text, jsonb, jsonb) from public;

revoke all on function public.automation_validate_definition(uuid, text, jsonb, jsonb, jsonb) from public;

revoke all on function public.project_automation_broken_reason(uuid, text, jsonb, jsonb, jsonb) from public;

revoke all on function public.project_automation_payload(public.project_automations) from public;

revoke all on function public.enforce_project_automation_limit(uuid, uuid) from public;

revoke all on function public.automation_move_card_status(uuid, uuid, uuid) from public;

revoke all on function public.automation_set_card_priority(uuid, uuid, uuid) from public;

revoke all on function public.automation_set_card_assignee(uuid, uuid, uuid) from public;

revoke all on function public.automation_move_card_group(uuid, uuid, uuid) from public;

revoke all on function public.automation_add_card_comment(uuid, text, uuid) from public;

revoke all on function public.evaluate_project_automations() from public;

create trigger trg_card_automation_evaluator
after insert or update on public.cards
for each row execute function public.evaluate_project_automations();

revoke all on function public.automation_build_card_snapshot(public.cards) from public;

create or replace function public.delete_project_automation(target_automation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_automation public.project_automations%rowtype;
begin
  select *
    into current_automation
  from public.project_automations project_automation
  where project_automation.id = target_automation_id;

  if current_automation.id is null then
    raise exception 'Automation not found.';
  end if;

  if not public.can_edit_project(current_automation.project_id, auth.uid()) then
    raise exception 'You do not have permission to manage automations on this project.';
  end if;

  delete from public.project_automations project_automation
  where project_automation.id = current_automation.id;

  update public.project_automations project_automation
  set
    position = reordered.position,
    updated_by_user_id = auth.uid(),
    updated_at = timezone('utc', now())
  from (
    select project_automation.id, row_number() over (order by project_automation.position asc, project_automation.created_at asc, project_automation.id asc) - 1 as position
    from public.project_automations project_automation
    where project_automation.project_id = current_automation.project_id
  ) reordered
  where project_automation.id = reordered.id;

  perform public.touch_project(current_automation.project_id, auth.uid());
end;
$$;

revoke all on function public.delete_project_automation(uuid) from public;

grant execute on function public.delete_project_automation(uuid) to authenticated;
