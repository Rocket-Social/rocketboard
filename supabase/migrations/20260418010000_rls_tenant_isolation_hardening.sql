-- RLS tenant-isolation hardening
-- Findings from the pre-launch RLS audit (docs/RLS_AUDIT_FINDINGS.md).
--
-- F1 [P0] — public.invitations had `USING(true)` for SELECT and FOR ALL.
-- This let any authenticated user UPDATE an invitation's `email` to their own
-- address, then call accept_invite() → full org/workspace takeover, because
-- accept_invite checks `current_email = inv_record.email` at call time and the
-- attacker had just rewritten inv_record.email. It also leaked every pending
-- invitation (email, role, accept_token) across all orgs system-wide.
--
-- F2 [P1] — public.project_github_settings INSERT/UPDATE only verified the
-- user could edit the project, not that the referenced connection_source
-- belonged to the same organization. Combined with the github_connection_sources
-- SELECT policy's `exists (... project_github_settings ... can_access_project)`
-- clause, this allowed a project admin to link an arbitrary connection source
-- and then read its account_login / github_app metadata. The set_project_github_source
-- RPC does verify this correctly, so the gap was only exploitable via direct
-- PostgREST INSERT — but that's a valid attack path since Supabase authenticated
-- clients can hit .from('project_github_settings').insert() freely.
--
-- F3 [P2] — public.document_presence INSERT only checked user_id = auth.uid(),
-- not that the target document was accessible. Harmless read-wise (SELECT was
-- already gated) but allowed presence spoofing in other users' docs.
--
-- F4 [P2] — public.ai_api_keys SELECT exposed org-scoped rows to all members
-- including `guest` role. Keys are encrypted, but last_four/provider/set_by
-- are still informative. Restrict to admin + member.

-- ── F1: invitations ─────────────────────────────────────────────────────

drop policy if exists invitations_select_for_authenticated on public.invitations;
drop policy if exists invitations_manage_for_authenticated on public.invitations;

create policy invitations_select_for_admins
on public.invitations
for select
to authenticated
using (
  (resource_type = 'organization' and public.can_manage_organization(resource_id, auth.uid()))
  or (resource_type = 'workspace' and public.can_manage_workspace(resource_id, auth.uid()))
);

create policy invitations_manage_for_admins
on public.invitations
for all
to authenticated
using (
  (resource_type = 'organization' and public.can_manage_organization(resource_id, auth.uid()))
  or (resource_type = 'workspace' and public.can_manage_workspace(resource_id, auth.uid()))
)
with check (
  (resource_type = 'organization' and public.can_manage_organization(resource_id, auth.uid()))
  or (resource_type = 'workspace' and public.can_manage_workspace(resource_id, auth.uid()))
);

-- accept_invite and get_invite_snapshot are SECURITY DEFINER and look up the
-- row by accept_token independent of RLS, so invitees who don't yet belong
-- to the org can still accept. The new policies only restrict direct
-- PostgREST access.

-- ── F2: project_github_settings ─────────────────────────────────────────
--
-- The tenant gate (can the caller edit this project?) stays in WITH CHECK.
-- The source-scope gate (does this connection_source belong to the project's
-- org, or is it a personal source the caller owns?) moves to a trigger that
-- only fires when connection_source_id actually changes.
--
-- Why split: pure WITH CHECK would fire on every analytics/auto_transitions
-- UPDATE regardless of whether the source column was touched. That breaks
-- two legitimate paths:
--   (a) Project admin Bob toggles auto_transitions on a project whose source
--       was configured by admin Alice as a PERSONAL PAT. Under pure-WITH CHECK,
--       Bob's UPDATE fails because source.owner_user_id = Alice, not Bob.
--   (b) When a github_connection_source is deleted, the FK flips connection_source_id
--       to NULL (on delete set null). Any subsequent UPDATE fails because
--       `source.id = NULL` matches zero rows in the EXISTS subquery.

drop policy if exists "project github settings insert" on public.project_github_settings;
drop policy if exists "project github settings update" on public.project_github_settings;

create policy "project github settings insert"
on public.project_github_settings
for insert
to authenticated
with check (public.can_edit_project(project_id));

create policy "project github settings update"
on public.project_github_settings
for update
to authenticated
using (public.can_edit_project(project_id))
with check (public.can_edit_project(project_id));

create or replace function public.validate_project_github_settings_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org_id uuid;
begin
  -- UPDATE that doesn't change the source column: nothing to validate.
  if tg_op = 'UPDATE' and new.connection_source_id is not distinct from old.connection_source_id then
    return new;
  end if;

  -- NULL source is always permitted (post-deletion state via ON DELETE SET NULL).
  if new.connection_source_id is null then
    return new;
  end if;

  select workspace.organization_id
    into target_org_id
  from public.projects project
  join public.workspaces workspace on workspace.id = project.workspace_id
  where project.id = new.project_id;

  if not exists (
    select 1
    from public.github_connection_sources source
    where source.id = new.connection_source_id
      and (
        (source.scope_type = 'organization' and source.organization_id = target_org_id)
        or (source.scope_type = 'personal' and source.owner_user_id = auth.uid())
      )
  ) then
    raise exception 'Connection source does not belong to this project''s organization (or is not a personal source you own).';
  end if;

  return new;
end;
$$;

drop trigger if exists project_github_settings_validate_source on public.project_github_settings;

create trigger project_github_settings_validate_source
before insert or update of connection_source_id on public.project_github_settings
for each row execute function public.validate_project_github_settings_source();

-- ── F3: document_presence ───────────────────────────────────────────────

drop policy if exists document_presence_insert_for_members on public.document_presence;

create policy document_presence_insert_for_members
on public.document_presence
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.documents document
    where document.id = document_presence.document_id
      and public.can_access_project(document.project_id)
  )
);

-- ── F4: ai_api_keys — exclude guests from org-scoped key visibility ─────

drop policy if exists ai_api_keys_select on public.ai_api_keys;

create policy ai_api_keys_select
on public.ai_api_keys
for select
to authenticated
using (
  user_id = auth.uid()
  or organization_id in (
    select om.organization_id
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.role in ('admin', 'member')
  )
);
