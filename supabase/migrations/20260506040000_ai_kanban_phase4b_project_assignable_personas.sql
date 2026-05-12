-- Wave 2 AI Kanban — Phase 4 PR 4-B (2/2): list_project_assignable_personas RPC.
--
-- Powers the in-project assignee picker (CardSheet dropdown,
-- BoardView groupBy='assignee' columns) by returning the personas
-- that can be assigned to cards in a given project.
--
-- D11 — Permission gating: tightened to `can_edit_project` so
--       read-only viewers can't enumerate which agents are
--       provisioned in projects they can only view. The picker
--       is hidden for them anyway, but the RPC's auth boundary
--       must hold even if the UI gate is bypassed.

set search_path = public;

create or replace function public.list_project_assignable_personas(target_project_id uuid)
returns table(
  id uuid,
  name text,
  slug text,
  accent_color text,
  avatar_url text,
  role text,
  agent_user_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  -- `projects` has `workspace_id`, not `organization_id` directly —
  -- so we resolve org via the workspace (mirroring dispatch_agent_run).
  select
    persona.id,
    persona.name,
    persona.slug,
    persona.accent_color,
    persona.avatar_url,
    persona.role::text,
    persona.agent_user_id
  from public.projects project
  join public.workspaces workspace
    on workspace.id = project.workspace_id
  join public.ai_personas persona
    on persona.organization_id = workspace.organization_id
  where project.id = target_project_id
    and project.agents_assignable = true
    and persona.is_enabled = true
    and persona.role in ('assistant', 'monitor')
    and persona.agent_user_id is not null
    and public.can_edit_project(target_project_id, auth.uid())
  order by persona.name asc;
$$;

revoke all on function public.list_project_assignable_personas(uuid) from public;
revoke all on function public.list_project_assignable_personas(uuid) from anon;
grant execute on function public.list_project_assignable_personas(uuid) to authenticated, service_role;

comment on function public.list_project_assignable_personas(uuid) is
  'Phase 4-B (PR 4-B) RPC powering the in-project assignee picker. Returns enabled assistant/monitor personas with provisioned bot users for the project''s organization. SECURITY DEFINER + can_edit_project gate prevents viewers from enumerating agents in projects they only have read access to (D11).';
