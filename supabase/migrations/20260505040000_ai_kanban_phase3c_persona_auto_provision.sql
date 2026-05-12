-- AI Kanban (Wave 2 F1) — Phase 3c persona auto-provision.
--
-- Per ~/.claude/plans/what-s-next-federated-cocke.md (design + eng review CLEAR
-- 2026-05-05). Phase 3 PR B's +New Task picker filters to
--   role IN ('assistant','monitor') AND agent_user_id IS NOT NULL
-- but the only existing populator (provision_agent_user) is service-role-only
-- and has no auto-fire path in production. Result: every existing factory
-- persona has agent_user_id = NULL and the picker is empty for everyone.
--
-- This migration closes both ends:
--   1. One-shot backfill — calls provision_agent_user(p.id) for every
--      assistant/monitor persona that is currently enabled but unprovisioned.
--   2. AFTER INSERT trigger — calls provision_agent_user(NEW.id) for every
--      new assistant/monitor row whose agent_user_id arrives NULL. Covers
--      seed_default_ai_personas (orgs created after this migration), the
--      "+ New agent" UI in AgentProfilesTab, and any future caller.
--
-- Trigger semantics (eng review locked: ship as-spec):
--   - SECURITY DEFINER + set search_path = public so the trigger fn can
--     write to auth.users + organization_members regardless of caller role.
--   - Synchronous: failure inside provision_agent_user (e.g. organization
--     missing, auth.users write blocked) propagates and rolls back the
--     ai_personas INSERT itself. No zombie personas with NULL agent_user_id.

-- ============================================================
-- 1. Backfill existing rows
-- ============================================================

do $$
declare
  persona_row record;
begin
  for persona_row in
    select id
    from public.ai_personas
    where agent_user_id is null
      and role in ('assistant', 'monitor')
      and is_enabled = true
    order by created_at
  loop
    perform public.provision_agent_user(persona_row.id);
  end loop;
end
$$;

-- ============================================================
-- 2. Trigger function — auto-provision on insert
-- ============================================================

create or replace function public.ai_personas_auto_provision_agent_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role in ('assistant', 'monitor') and new.agent_user_id is null then
    perform public.provision_agent_user(new.id);
  end if;
  return null;
end;
$$;

revoke all on function public.ai_personas_auto_provision_agent_fn() from public;
revoke all on function public.ai_personas_auto_provision_agent_fn() from anon, authenticated;
-- Trigger executes under the table owner regardless of grants; explicit
-- service_role grant keeps the principle-of-least-privilege audit clean.
grant execute on function public.ai_personas_auto_provision_agent_fn() to service_role;

-- ============================================================
-- 3. Trigger registration
-- ============================================================

drop trigger if exists ai_personas_auto_provision_agent on public.ai_personas;
create trigger ai_personas_auto_provision_agent
  after insert on public.ai_personas
  for each row
  execute function public.ai_personas_auto_provision_agent_fn();
