drop function if exists public.complete_sprint(uuid, text, uuid);
drop function if exists public.complete_sprint(uuid, text, uuid, text, date, date, text);

create function public.complete_sprint(
  target_sprint_id uuid,
  target_action text,
  target_next_sprint_id uuid default null,
  target_next_sprint_name text default null,
  target_next_sprint_start_date date default null,
  target_next_sprint_end_date date default null,
  target_next_sprint_goal text default null
)
returns table (
  id uuid,
  project_id uuid,
  name text,
  goal text,
  start_date date,
  end_date date,
  status public.sprint_status,
  "position" integer,
  created_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_next_sprint public.project_sprints%rowtype;
  effective_next_sprint_id uuid := target_next_sprint_id;
  next_position integer;
  normalized_action text := lower(trim(target_action));
  normalized_next_sprint_name text := nullif(trim(coalesce(target_next_sprint_name, '')), '');
  target_sprint public.project_sprints%rowtype;
begin
  select *
    into target_sprint
  from public.project_sprints sprint
  where sprint.id = target_sprint_id;

  if target_sprint.id is null then
    raise exception 'Sprint not found.';
  end if;

  if not public.can_edit_project(target_sprint.project_id, auth.uid()) then
    raise exception 'You do not have permission to manage sprints on this project.';
  end if;

  if target_sprint.status = 'completed' then
    raise exception 'Sprint is already completed.';
  end if;

  if normalized_action not in ('move_to_next', 'return_to_backlog', 'keep') then
    raise exception 'Action must be one of "move_to_next", "return_to_backlog", or "keep".';
  end if;

  if normalized_action = 'move_to_next' then
    if effective_next_sprint_id is null then
      if normalized_next_sprint_name is null then
        raise exception 'Next sprint is required when moving incomplete cards.';
      end if;

      select coalesce(max(sprint.position), -1) + 1
        into next_position
      from public.project_sprints sprint
      where sprint.project_id = target_sprint.project_id;

      insert into public.project_sprints (
        project_id,
        name,
        goal,
        start_date,
        end_date,
        position,
        created_by_user_id,
        updated_by_user_id
      )
      values (
        target_sprint.project_id,
        normalized_next_sprint_name,
        nullif(trim(coalesce(target_next_sprint_goal, '')), ''),
        target_next_sprint_start_date,
        target_next_sprint_end_date,
        next_position,
        auth.uid(),
        auth.uid()
      )
      returning * into created_next_sprint;

      effective_next_sprint_id := created_next_sprint.id;
    end if;

    if effective_next_sprint_id = target_sprint_id then
      raise exception 'Next sprint must be different from the sprint being completed.';
    end if;

    if not exists (
      select 1
      from public.project_sprints sprint
      where sprint.id = effective_next_sprint_id
        and sprint.project_id = target_sprint.project_id
        and sprint.status <> 'completed'
    ) then
      raise exception 'Next sprint not found or already completed.';
    end if;

    update public.cards card
    set
      sprint_id = effective_next_sprint_id,
      updated_by_user_id = auth.uid()
    where card.sprint_id = target_sprint_id
      and card.archived_at is null
      and card.deleted_at is null
      and (
        card.status_option_id is null
        or (select pso.category from public.project_status_options pso where pso.id = card.status_option_id) <> 'completed'
      );
  elsif normalized_action = 'return_to_backlog' then
    update public.cards card
    set
      sprint_id = null,
      updated_by_user_id = auth.uid()
    where card.sprint_id = target_sprint_id
      and card.archived_at is null
      and card.deleted_at is null
      and (
        card.status_option_id is null
        or (select pso.category from public.project_status_options pso where pso.id = card.status_option_id) <> 'completed'
      );
  end if;

  update public.project_sprints
  set
    status = 'completed',
    completed_at = timezone('utc', now()),
    updated_by_user_id = auth.uid()
  where id = target_sprint_id;

  if created_next_sprint.id is not null then
    return query
    select *
    from public.get_project_sprints(target_sprint.project_id)
    where get_project_sprints.id = created_next_sprint.id;
  end if;
end;
$$;

revoke all on function public.complete_sprint(uuid, text, uuid, text, date, date, text) from public;

grant execute on function public.complete_sprint(uuid, text, uuid, text, date, date, text) to authenticated;
