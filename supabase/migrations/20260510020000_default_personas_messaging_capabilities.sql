-- Sprint Manager fixup — broaden the messaging-tool grant beyond Sara.
--
-- PR-C granted send_inbox_message + send_email to Sara only, on the
-- assumption that Sprint Manager would lock the persona pick. Founder
-- direction (2026-05-10) is to unlock the picker on monitor jobs so
-- users can pick any default persona to run the job. The prompt
-- expects those tools to be in the LLM's toolkit, so this migration
-- extends the grant to every factory persona (slug in the default set
-- seeded by seed_default_ai_personas).
--
-- Idempotent: array_agg(distinct) preserves any per-org customizations
-- and the WHERE clause is a no-op for personas that already have both
-- capabilities. User-created personas (custom slug) are NOT touched —
-- their capabilities are operator-controlled.

update public.ai_personas
set capabilities = (
  select array_agg(distinct cap)
  from unnest(capabilities || array['send_inbox_message', 'send_email']) as cap
)
where slug in ('buddy', 'claire', 'sara', 'andy', 'jk', 'chris')
  and not (capabilities @> array['send_inbox_message', 'send_email']);

-- Update seed_default_ai_personas so new orgs auto-grant the messaging
-- capabilities to every default persona (was Sara-only in PR-C).

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

  insert into public.ai_personas (organization_id, name, slug, accent_color, focus_area, system_prompt, is_default, capabilities)
  values
    (p_organization_id, 'Buddy', 'buddy', 'blue', 'CTO / Strategy',
     'You are Buddy, a seasoned Silicon Valley CTO. You think in systems, care about architecture, scalability, and technical strategy. You speak directly and challenge assumptions constructively.', true,
     array['add_comment', 'send_inbox_message', 'send_email']),
    (p_organization_id, 'Claire', 'claire', 'purple', 'PM',
     'You are Claire, an experienced Product Manager. You focus on user value, prioritization, roadmap clarity, and stakeholder communication. You ask clarifying questions before making recommendations.', true,
     array['add_comment', 'send_inbox_message', 'send_email']),
    (p_organization_id, 'Sara', 'sara', 'green', 'Scrum Master',
     'You are Sara, a pragmatic Scrum Master. You focus on sprint planning, retrospectives, process improvement, and team velocity. You value simplicity and sustainable pace.', true,
     array['add_comment', 'send_inbox_message', 'send_email']),
    (p_organization_id, 'Andy', 'andy', 'amber', 'Assistant',
     'You are Andy, a reliable and versatile Assistant. You help with organizing information, filing notes, creating task breakdowns, summarizing content. You execute tasks efficiently and confirm before making changes.', true,
     array['add_comment', 'send_inbox_message', 'send_email']),
    (p_organization_id, 'JK', 'jk', 'red', 'Strategist',
     'You are JK, a business strategist. You think about market positioning, competitive analysis, go-to-market strategy, and long-term vision.', true,
     array['add_comment', 'send_inbox_message', 'send_email']),
    (p_organization_id, 'Chris', 'chris', 'teal', 'Engineering Manager',
     'You are Chris, an experienced Engineering Manager. You focus on team health, delivery reliability, technical debt management, and engineering process. You balance speed with quality.', true,
     array['add_comment', 'send_inbox_message', 'send_email'])
  on conflict (organization_id, slug) do nothing;
end;
$$;

revoke all on function public.seed_default_ai_personas(uuid) from public;
grant execute on function public.seed_default_ai_personas(uuid) to authenticated;
