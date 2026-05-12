-- AI Kanban (Wave 2 F1) — Phase 1 schema foundations + provisioning RPCs.
--
-- Per docs/AI_KANBAN_PRD_2026_05_03.md §7 + §19 Phase 1. Lays the schema
-- groundwork for personas as first-class assignees ("agent = app user")
-- without yet shipping any of the dispatch pipeline (Phase 2) or the UI
-- (Phase 3+). After this migration, factory personas can be lazily
-- promoted to bot users and added to projects via the standard
-- project_members flow.
--
-- Schema deltas:
--   1. ai_personas gains 6 columns (agent_user_id, capabilities,
--      autonomy_level, default_review_user_id, role, visibility)
--   2. organization_role enum gains 'agent' value
--   3. projects gains 2 columns (kind, agents_assignable)
--   4. card_comments gains is_streaming boolean + partial index
--   5. notifications.kind constraint extends to allow run_completed +
--      run_awaiting_approval (Wave 2 dispatch lifecycle notifications)
--
-- New SECURITY DEFINER RPCs (both idempotent):
--   - provision_agent_user(target_persona_id) — service_role only,
--     creates the auth.users + profiles + organization_members rows
--     for a persona on first call, returns the agent_user_id on
--     subsequent calls.
--   - provision_personal_ai_workspace(target_user_id, target_org_id)
--     — authenticated, lazily creates the per-(user,org) workspace +
--     project where free-form AI tasks live (Phase 3 surface).
--
-- Data backfill: existing factory personas get role assignments per
-- PRD §22.2. The Wave 1 drift-watcher persona becomes role='monitor'
-- so it does not appear in the upcoming AI Kanban assignee dropdown.

-- ============================================================
-- 1. ai_personas — 6 new columns
-- ============================================================

alter table public.ai_personas
  add column if not exists agent_user_id uuid references auth.users(id) on delete set null,
  add column if not exists capabilities text[] not null default array['add_comment'],
  add column if not exists autonomy_level text not null default 'manual'
    check (autonomy_level in ('manual', 'auto')),
  add column if not exists default_review_user_id uuid references auth.users(id) on delete set null,
  add column if not exists role text not null default 'assistant'
    check (role in ('chat', 'monitor', 'retro', 'assistant')),
  add column if not exists visibility text not null default 'org'
    check (visibility in ('org', 'creator_only'));

-- Lookup index: dispatch path resolves persona from agent_user_id when
-- a card's assignee_user_id changes to a bot user. Partial because most
-- personas will not have a bot user provisioned (chat-only personas
-- never need one).
create index if not exists ai_personas_agent_user_id_idx
  on public.ai_personas (agent_user_id)
  where agent_user_id is not null;

-- ============================================================
-- 2. organization_role gains 'agent'
-- ============================================================

-- Idempotent — `add value if not exists` is a no-op when the value already
-- exists, so re-applying this migration is safe.
alter type public.organization_role add value if not exists 'agent';

-- ============================================================
-- 3. projects — kind + agents_assignable
-- ============================================================

alter table public.projects
  add column if not exists kind text not null default 'standard'
    check (kind in ('standard', 'personal_ai_workspace')),
  add column if not exists agents_assignable boolean not null default true;

-- Per-(creator, org) Personal AI Workspace lookup. There must be at most
-- one personal_ai_workspace project per (creator, org) — enforced by a
-- partial unique index. Phase 3 UI relies on this invariant.
create unique index if not exists projects_personal_ai_workspace_unique
  on public.projects (created_by_user_id, workspace_id)
  where kind = 'personal_ai_workspace';

-- ============================================================
-- 4. card_comments.is_streaming
-- ============================================================

alter table public.card_comments
  add column if not exists is_streaming boolean not null default false;

-- Streaming-comment lookup index. Wave 2 Phase 4 has the worker stream
-- tokens into a single in-flight card_comments row per card; this index
-- makes the "find the streaming row for this card" query cheap.
create index if not exists card_comments_streaming_lookup_idx
  on public.card_comments (card_id)
  where is_streaming = true;

-- ============================================================
-- 5. notifications.kind constraint extends
-- ============================================================

-- The Wave 1 helper insert_notification (PR #454) hardcodes the allowed
-- kinds via the table's CHECK constraint. Extend the set so Wave 2's
-- dispatch lifecycle can emit run_completed (any terminal state) and
-- run_awaiting_approval (mutating tool call needs reviewer ack).
alter table public.notifications
  drop constraint if exists notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check check (
    kind in (
      'mention',
      'assignment',
      'comment_on_owned_card',
      'drift_nudge',
      'run_completed',
      'run_awaiting_approval'
    )
  );

-- ============================================================
-- 6. Factory persona role backfill
-- ============================================================

-- PRD §22.2 default role assignments. Drift-watcher persona (Wave 1) gets
-- role='monitor' so it does not surface in AI Kanban dispatch dropdowns.
-- Existing rows already exist with default role='assistant' from the
-- column add above; this UPDATE corrects the chat-only personas plus
-- the monitor persona.
update public.ai_personas
set role = 'chat'
where slug in ('buddy', 'claire', 'jk');

update public.ai_personas
set role = 'monitor'
where slug = 'drift-watcher';

-- Sara, Andy, Chris keep the default role='assistant' set by the column
-- add above. This is the AI Kanban-dispatchable cohort.

-- ============================================================
-- 7. RPC: provision_agent_user
-- ============================================================

create or replace function public.provision_agent_user(target_persona_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  persona_row public.ai_personas%rowtype;
  org_row public.organizations%rowtype;
  new_user_id uuid;
  synthetic_email text;
begin
  if target_persona_id is null then
    raise exception 'provision_agent_user: target_persona_id is required.';
  end if;

  select * into persona_row
  from public.ai_personas
  where id = target_persona_id;

  if persona_row.id is null then
    raise exception 'provision_agent_user: persona % not found.', target_persona_id;
  end if;

  -- Idempotent: already provisioned, return the existing user id.
  if persona_row.agent_user_id is not null then
    return persona_row.agent_user_id;
  end if;

  select * into org_row
  from public.organizations
  where id = persona_row.organization_id;

  if org_row.id is null then
    raise exception 'provision_agent_user: persona %s organization % missing.',
      persona_row.id, persona_row.organization_id;
  end if;

  -- Synthetic email is unique per (org, persona slug) because the
  -- ai_personas_slug_org_unique constraint already enforces that. The
  -- .rocketboard-agents.local TLD is reserved (RFC 6762) and cannot
  -- receive real mail, so there's no risk of collision with a real
  -- user signup.
  synthetic_email :=
    'agent+' || org_row.slug || '+' || persona_row.slug
    || '@rocketboard-agents.local';

  new_user_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, confirmation_token, recovery_token,
    email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, last_sign_in_at
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    new_user_id, 'authenticated', 'authenticated',
    synthetic_email, 'not-used',
    timezone('utc', now()), '', '', '', '',
    jsonb_build_object('provider', 'rocketboard_agent', 'persona_id', persona_row.id),
    jsonb_build_object('full_name', persona_row.name, 'is_agent', true),
    timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
  );

  insert into public.profiles (user_id, email, full_name)
  values (new_user_id, synthetic_email, persona_row.name);

  insert into public.organization_members (organization_id, user_id, role, seat_status)
  values (persona_row.organization_id, new_user_id, 'agent'::public.organization_role, 'free');

  update public.ai_personas
  set agent_user_id = new_user_id, updated_at = timezone('utc', now())
  where id = persona_row.id;

  return new_user_id;
end;
$$;

revoke all on function public.provision_agent_user(uuid) from public;
revoke all on function public.provision_agent_user(uuid) from anon, authenticated;
grant execute on function public.provision_agent_user(uuid) to service_role;

-- ============================================================
-- 8. RPC: provision_personal_ai_workspace
-- ============================================================

create or replace function public.provision_personal_ai_workspace(
  target_user_id uuid,
  target_org_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_project_id uuid;
  workspace_id uuid;
  project_id uuid;
  user_membership_role public.organization_role;
  workspace_slug text;
  project_slug text;
  project_key text;
  slug_suffix text;
begin
  if target_user_id is null or target_org_id is null then
    raise exception 'provision_personal_ai_workspace: target_user_id and target_org_id are required.';
  end if;

  -- Caller must be the user themselves; service_role can act on any user.
  if auth.uid() is not null and auth.uid() <> target_user_id then
    raise exception 'You can only provision your own Personal AI Workspace.';
  end if;

  -- Caller must be a member of the target org.
  select role into user_membership_role
  from public.organization_members
  where organization_id = target_org_id and user_id = target_user_id;

  if user_membership_role is null then
    raise exception 'provision_personal_ai_workspace: user % is not a member of org %.',
      target_user_id, target_org_id;
  end if;

  -- Idempotent: existing personal AI workspace project for this (user, org).
  select proj.id into existing_project_id
  from public.projects proj
  join public.workspaces ws on ws.id = proj.workspace_id
  where proj.kind = 'personal_ai_workspace'
    and proj.created_by_user_id = target_user_id
    and ws.organization_id = target_org_id
    and proj.deleted_at is null
  limit 1;

  if existing_project_id is not null then
    return existing_project_id;
  end if;

  -- Slug suffix keeps multi-org users' workspaces unique even though
  -- workspaces.slug has a global unique constraint. 8 hex chars from a
  -- fresh uuid is collision-resistant enough for human-readable slugs.
  slug_suffix := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  workspace_slug := 'personal-ai-' || slug_suffix;
  project_slug := 'my-ai-workspace-' || slug_suffix;
  -- project_key needs ^[A-Z][A-Z0-9]{1,7}$ — uppercase suffix.
  project_key := 'AI' || upper(substr(slug_suffix, 1, 6));

  insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
  values (gen_random_uuid(), target_org_id, 'Personal AI', workspace_slug, target_user_id)
  returning id into workspace_id;

  insert into public.projects (
    id, workspace_id, name, slug, project_key, kind, agents_assignable,
    created_by_user_id, updated_by_user_id
  )
  values (
    gen_random_uuid(), workspace_id, 'My AI Workspace', project_slug, project_key,
    'personal_ai_workspace', true,
    target_user_id, target_user_id
  )
  returning id into project_id;

  return project_id;
end;
$$;

revoke all on function public.provision_personal_ai_workspace(uuid, uuid) from public;
revoke all on function public.provision_personal_ai_workspace(uuid, uuid) from anon;
grant execute on function public.provision_personal_ai_workspace(uuid, uuid) to authenticated;
grant execute on function public.provision_personal_ai_workspace(uuid, uuid) to service_role;
