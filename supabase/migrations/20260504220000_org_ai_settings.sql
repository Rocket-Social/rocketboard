-- Org Settings UI for AI agents (Wave 1 Phase 5b — UI portion).
--
-- The Drift Watcher backend (PR #455) defaults `drift_watcher_enabled = false`
-- on every org and only scans orgs that have flipped the toggle. PR #453
-- added the column but no UI binds to it; this migration unblocks the UI by
-- (a) returning both AI fields from the canonical org snapshot and (b)
-- providing an admin-only RPC to update them.
--
--   1. `get_organization_members` re-creation — appends `drift_watcher_enabled`
--      and `ai_workspace_guidance` to the `organization` JSON. No other shape
--      change; existing callers ignore unknown keys.
--   2. `set_organization_ai_settings(target_org_id, target_drift_watcher_enabled,
--      target_workspace_guidance)` — admin-only, updates both columns
--      atomically. Mirrors the access pattern of `set_organization_timezone`.

-- ============================================================
-- 1. get_organization_members — surface AI settings in the snapshot
-- ============================================================

create or replace function public.get_organization_members(target_org_id uuid)
returns table(members jsonb, invitations jsonb, can_manage boolean, organization jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      (select jsonb_agg(
        jsonb_build_object(
          'created_at', om.created_at,
          'email', p.email,
          'github_login', p.github_login,
          'invited_by_name', coalesce(inviter_profile.full_name, inviter_profile.email),
          'last_active_at', coalesce(ua.last_active_at, auth_user_record.last_sign_in_at),
          'name', coalesce(p.full_name, split_part(p.email, '@', 1), 'Unknown'),
          'role', om.role,
          'seat_status', om.seat_status,
          'user_id', om.user_id
        )
        order by
          case om.role when 'admin' then 0 when 'member' then 1 else 2 end,
          coalesce(p.full_name, p.email) asc
      )
      from public.organization_members om
      join public.profiles p on p.user_id = om.user_id
      left join auth.users auth_user_record on auth_user_record.id = om.user_id
      left join public.profiles inviter_profile on inviter_profile.user_id = om.invited_by
      left join public.user_activity ua on ua.user_id = om.user_id
      where om.organization_id = target_org_id),
      '[]'::jsonb
    ) as members,
    coalesce(
      (select jsonb_agg(
        jsonb_build_object(
          'id', inv.id,
          'email', inv.email,
          'role', inv.role,
          'created_at', inv.created_at,
          'email_sent_at', inv.email_sent_at
        )
        order by inv.created_at desc
      )
      from public.invitations inv
      where inv.resource_type = 'organization'
        and inv.resource_id = target_org_id
        and inv.accepted_at is null
        and inv.revoked_at is null),
      '[]'::jsonb
    ) as invitations,
    exists (
      select 1 from public.organization_members
      where organization_id = target_org_id
        and user_id = auth.uid()
        and role = 'admin'
    ) as can_manage,
    (
      select jsonb_build_object(
        'id', o.id,
        'name', o.name,
        'slug', o.slug,
        'icon', o.icon,
        'allowed_domains', o.allowed_domains,
        'invite_link_token', o.invite_link_token,
        'invite_link_enabled', o.invite_link_enabled,
        'plan', o.plan,
        'timezone', o.timezone,
        'drift_watcher_enabled', o.drift_watcher_enabled,
        'ai_workspace_guidance', o.ai_workspace_guidance
      )
      from public.organizations o
      where o.id = target_org_id
    ) as organization
  where exists (
    select 1 from public.organization_members
    where organization_id = target_org_id
      and user_id = auth.uid()
  );
$$;

-- ============================================================
-- 2. set_organization_ai_settings — admin-only writer
-- ============================================================

create or replace function public.set_organization_ai_settings(
  target_org_id uuid,
  target_drift_watcher_enabled boolean,
  target_workspace_guidance text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_guidance text;
begin
  if target_org_id is null then
    raise exception 'set_organization_ai_settings: target_org_id is required.';
  end if;
  if target_drift_watcher_enabled is null then
    raise exception 'set_organization_ai_settings: target_drift_watcher_enabled is required.';
  end if;

  if not exists (
    select 1 from public.organization_members
    where organization_id = target_org_id
      and user_id = auth.uid()
      and role = 'admin'
  ) then
    raise exception 'You do not have permission to manage this organization AI settings.';
  end if;

  -- Empty/whitespace-only guidance collapses to NULL so the column reflects
  -- "no guidance set" rather than "set to empty string".
  normalized_guidance := nullif(trim(coalesce(target_workspace_guidance, '')), '');

  update public.organizations
  set
    drift_watcher_enabled = target_drift_watcher_enabled,
    ai_workspace_guidance = normalized_guidance,
    updated_at = timezone('utc', now())
  where id = target_org_id;
end;
$$;

revoke all on function public.set_organization_ai_settings(uuid, boolean, text) from public;
revoke all on function public.set_organization_ai_settings(uuid, boolean, text) from anon;
grant execute on function public.set_organization_ai_settings(uuid, boolean, text) to authenticated;
