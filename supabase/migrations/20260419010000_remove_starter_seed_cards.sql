-- Remove the three hardcoded seed cards that every new project got from
-- create_project_with_defaults. They read like internal dev TODOs rather than
-- helpful first-run cues, so brand-new users landed in a project that felt
-- templated instead of theirs. Empty-state guidance lives in the UI's
-- "Add task…" composer, which is sufficient.
--
-- This replaces the function definition on existing deploys (`supabase db push`
-- skips in-place edits to 00000000000000_core.sql).

create or replace function public.create_project_with_defaults(
  target_workspace_id uuid,
  target_name text,
  target_access public.resource_access default 'open',
  target_icon text default null,
  target_user_id uuid default auth.uid(),
  target_starter_view_types public.project_view_type[] default null,
  target_default_starter_view_type public.project_view_type default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_name text := nullif(trim(target_name), '');
  normalized_icon text := nullif(trim(target_icon), '');
  new_project_id uuid;
  next_position integer;
begin
  if normalized_name is null then
    raise exception 'PROJECT_NAME_REQUIRED';
  end if;

  -- Check project limit for the workspace's org
  declare
    ws_org_id uuid;
  begin
    select w.organization_id into ws_org_id
    from public.workspaces w where w.id = target_workspace_id;

    if ws_org_id is not null and not public.check_org_limit(ws_org_id, 'projects') then
      raise exception 'PROJECT_LIMIT_REACHED';
    end if;
  end;

  select coalesce(max(project.position) + 1, 0)
    into next_position
  from public.projects project
  where project.workspace_id = target_workspace_id;

  insert into public.projects (
    workspace_id,
    name,
    slug,
    project_key,
    access,
    icon,
    position,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    target_workspace_id,
    normalized_name,
    public.next_project_slug(target_workspace_id, normalized_name),
    public.next_project_key(normalized_name),
    target_access,
    coalesce(normalized_icon, public.default_project_icon()),
    next_position,
    target_user_id,
    target_user_id
  )
  returning id into new_project_id;

  insert into public.project_members (
    project_id,
    user_id,
    role
  )
  values (
    new_project_id,
    target_user_id,
    'admin'
  )
  on conflict (project_id, user_id)
  do update
    set role = 'admin';

  -- Seed default status options for the new project
  insert into public.project_status_options (project_id, label, key, category, position, is_default) values
    (new_project_id, 'To Do', 'todo', 'not_started', 0, true),
    (new_project_id, 'In Progress', 'in_progress', 'started', 0, false),
    (new_project_id, 'Done', 'done', 'completed', 0, false),
    (new_project_id, 'Blocked', 'blocked', 'not_started', 1, false);

  -- Seed default priority options for the new project
  insert into public.project_priority_options (project_id, label, key, sort_order, color, is_default) values
    (new_project_id, 'Urgent', 'urgent', 0, 'red', false),
    (new_project_id, 'High', 'high', 1, 'amber', false),
    (new_project_id, 'Medium', 'medium', 2, 'blue', true),
    (new_project_id, 'Low', 'low', 3, 'gray', false);

  perform public.create_default_project_views(
    new_project_id,
    target_user_id,
    target_starter_view_types,
    target_default_starter_view_type
  );

  return new_project_id;
end;
$$;
