-- Sprint Manager fixup — make the full default persona roster dispatchable.
--
-- Wave 1 PRD §22.2 marked Buddy / Claire / JK as `role='chat'` so they
-- only appeared in the chat surface, not in the AI Kanban dispatch
-- picker. Founder direction (2026-05-10) is to drop that distinction:
-- the user wants to pick any of the seeded personas for a Sprint
-- Manager schedule. This migration:
--
--   1. Flips Buddy / Claire / JK from role='chat' to role='assistant'
--      so they pass the `role in ('assistant','monitor')` filter in
--      listAssignablePersonas + agent_assert_persona_can_edit_project.
--   2. Provisions their agent_user_id via provision_agent_user (the
--      phase-3c trigger only auto-provisioned on insert; existing
--      chat-role rows were skipped, so we backfill now).
--   3. Updates seed_default_ai_personas to keep new orgs aligned —
--      all default personas now seed as role='assistant' so the
--      INSERT trigger provisions their bot users automatically.

-- ---------------------------------------------------------------
-- 1. Flip the three chat-only personas
-- ---------------------------------------------------------------

update public.ai_personas
set role = 'assistant', updated_at = timezone('utc', now())
where slug in ('buddy', 'claire', 'jk')
  and role = 'chat';

-- ---------------------------------------------------------------
-- 2. Backfill agent_user_id for the newly-dispatchable personas
-- ---------------------------------------------------------------

do $$
declare
  persona_row record;
begin
  for persona_row in
    select id
    from public.ai_personas
    where slug in ('buddy', 'claire', 'jk')
      and agent_user_id is null
      and is_enabled = true
      and role in ('assistant', 'monitor')
    order by created_at
  loop
    perform public.provision_agent_user(persona_row.id);
  end loop;
end
$$;

-- ---------------------------------------------------------------
-- 3. Keep seed_default_ai_personas aligned (role=assistant for all)
-- ---------------------------------------------------------------
--
-- The previous seed function did not set `role` explicitly — it relied
-- on the column default `'assistant'`. The 20260505000000 migration
-- then UPDATE'd Buddy/Claire/JK to 'chat'. After this migration, new
-- orgs should seed all defaults as 'assistant' and skip the back-flip.
-- We replace the seed function to make that explicit (no functional
-- change for the role behavior, but documents the intent and avoids
-- depending on a UPDATE elsewhere).

create or replace function public.seed_default_ai_personas(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id and user_id = auth.uid()
  ) then
    raise exception 'Not a member of this organization';
  end if;

  insert into public.ai_personas (organization_id, name, slug, accent_color, focus_area, system_prompt, is_default, capabilities, role)
  values
    (p_organization_id, 'Buddy', 'buddy', 'blue', 'CTO / Strategy',
     'You are Buddy, a seasoned Silicon Valley CTO. You think in systems, care about architecture, scalability, and technical strategy. You speak directly and challenge assumptions constructively.', true,
     array['add_comment', 'send_inbox_message', 'send_email'], 'assistant'),
    (p_organization_id, 'Claire', 'claire', 'purple', 'PM',
     'You are Claire, an experienced Product Manager. You focus on user value, prioritization, roadmap clarity, and stakeholder communication. You ask clarifying questions before making recommendations.', true,
     array['add_comment', 'send_inbox_message', 'send_email'], 'assistant'),
    (p_organization_id, 'Sara', 'sara', 'green', 'Scrum Master',
     'You are Sara, a pragmatic Scrum Master. You focus on sprint planning, retrospectives, process improvement, and team velocity. You value simplicity and sustainable pace.', true,
     array['add_comment', 'send_inbox_message', 'send_email'], 'assistant'),
    (p_organization_id, 'Andy', 'andy', 'amber', 'Assistant',
     'You are Andy, a reliable and versatile Assistant. You help with organizing information, filing notes, creating task breakdowns, summarizing content. You execute tasks efficiently and confirm before making changes.', true,
     array['add_comment', 'send_inbox_message', 'send_email'], 'assistant'),
    (p_organization_id, 'JK', 'jk', 'red', 'Strategist',
     'You are JK, a business strategist. You think about market positioning, competitive analysis, go-to-market strategy, and long-term vision.', true,
     array['add_comment', 'send_inbox_message', 'send_email'], 'assistant'),
    (p_organization_id, 'Chris', 'chris', 'teal', 'Engineering Manager',
     'You are Chris, an experienced Engineering Manager. You focus on team health, delivery reliability, technical debt management, and engineering process. You balance speed with quality.', true,
     array['add_comment', 'send_inbox_message', 'send_email'], 'assistant')
  on conflict (organization_id, slug) do nothing;
end;
$$;

revoke all on function public.seed_default_ai_personas(uuid) from public;
grant execute on function public.seed_default_ai_personas(uuid) to authenticated;
