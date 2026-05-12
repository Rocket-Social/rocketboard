-- HOTFIX — exclude AI agents from `get_organization_members` and from
-- the seat-count surfaces consuming it.
--
-- Bug observed 2026-05-07: AI agent users (organization_role='agent',
-- provisioned by `provision_agent_user` for assistant/monitor personas)
-- were appearing in the org Settings → Access table as if they were
-- humans, AND were being counted toward the displayed billing seat
-- count ("$7/user/mo · 4 seats · $28/mo" with 3 of those seats being
-- agents). Two side effects compounded the visual bug:
--
--   1. The Access table renders a `<select value={member.role}>` whose
--      <option> list is `['admin', 'member', 'guest']`. When `member.role
--      === 'agent'` the value doesn't match any option and the browser
--      default-selects the first one ("Admin"), making it look like every
--      agent is a workspace admin.
--
--   2. `getOrgAccessMetrics` derives `memberSeatCount = peopleCount -
--      guestCount` — agents fall into the "people" bucket and are
--      counted as billable seats in the BillingTab line ($X/mo display).
--
--   3. The `billing-checkout` edge function counted org members for the
--      Stripe `quantity` parameter using `.neq('role', 'guest')`, which
--      did NOT exclude agents. Existing subscriptions created with
--      agents present were charged for those phantom seats. Operators
--      can adjust historical Stripe quantities via the customer portal;
--      this migration prevents NEW checkouts from miscounting.
--
-- Fix: re-create `get_organization_members` to filter out
-- `om.role = 'agent'` rows from the members aggregate. The `can_manage`
-- check is unchanged (`role = 'admin'` only matches humans anyway), and
-- the `where exists` access gate at the bottom only checks membership,
-- not role, so this fn still returns a snapshot to org admins regardless
-- of whether agents are present.
--
-- The agents themselves are NOT removed from `organization_members` —
-- they're still needed for `can_edit_project` checks via
-- `set_card_assignee_allow_agents` and the dispatch trigger path. We
-- only hide them from the human-facing snapshot.

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
      where om.organization_id = target_org_id
        and om.role <> 'agent'),
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
