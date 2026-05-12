-- Sprint Manager redesign — PR-C: send_email dispatcher + Sara capabilities.
--
-- Wires the previously-defined send_email tool into the runtime:
--   1. Re-create dispatch_agent_tool_call_internal with a new
--      `when 'send_email' then` branch that calls
--      net.http_post → /functions/v1/send-agent-email (fire-and-forget).
--      The vault entries `project_url` + `service_role_key` are
--      already populated for the worker pull-fallback cron path
--      (see 20260505030000_ai_kanban_phase2c_tools.sql), so we reuse
--      the same lookup pattern here.
--   2. Backfill existing Sara personas with the two new capabilities
--      (send_inbox_message, send_email) so the Sprint Manager
--      prompt can actually call them.
--   3. Update seed_default_ai_personas so future orgs auto-grant
--      these capabilities to the Sara persona.

-- ---------------------------------------------------------------
-- 1. dispatch_agent_tool_call_internal — add send_email branch
-- ---------------------------------------------------------------

create or replace function public.dispatch_agent_tool_call_internal(
  target_run_id uuid,
  tool_call_index integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  run_row public.ai_agent_runs%rowtype;
  persona_row public.ai_personas%rowtype;
  tool_call jsonb;
  tool_name text;
  tool_args jsonb;
  result_payload jsonb := '{}'::jsonb;
  new_id uuid;
  notification_id uuid;
  email_request_id bigint;
begin
  if target_run_id is null or tool_call_index is null then
    raise exception 'dispatch_agent_tool_call_internal: run_id and tool_call_index are required.';
  end if;

  select * into run_row from public.ai_agent_runs where id = target_run_id;
  if run_row.id is null then
    raise exception 'dispatch_agent_tool_call_internal: run % not found.', target_run_id;
  end if;
  if run_row.persona_id is null then
    raise exception 'dispatch_agent_tool_call_internal: run % has no persona.', target_run_id;
  end if;

  if jsonb_typeof(run_row.tool_calls) <> 'array' then
    raise exception 'dispatch_agent_tool_call_internal: run % has no tool_calls array.', target_run_id;
  end if;

  tool_call := run_row.tool_calls -> tool_call_index;
  if tool_call is null then
    raise exception 'dispatch_agent_tool_call_internal: tool_call index % out of range.', tool_call_index;
  end if;

  tool_name := tool_call ->> 'name';
  tool_args := coalesce(tool_call -> 'edited_args', tool_call -> 'args');
  if tool_args is null or jsonb_typeof(tool_args) <> 'object' then
    raise exception 'dispatch_agent_tool_call_internal: tool_call % has no args object.', tool_call_index;
  end if;

  case tool_name
    when 'set_card_status' then
      perform public.agent_set_card_status(
        run_row.persona_id,
        (tool_args->>'card_id')::uuid,
        (tool_args->>'status_option_id')::uuid
      );
    when 'set_card_priority' then
      perform public.agent_set_card_priority(
        run_row.persona_id,
        (tool_args->>'card_id')::uuid,
        (tool_args->>'priority_option_id')::uuid
      );
    when 'set_card_assignee' then
      perform public.agent_set_card_assignee(
        run_row.persona_id,
        (tool_args->>'card_id')::uuid,
        nullif(tool_args->>'assignee_user_id', '')::uuid
      );
    when 'attach_subtask' then
      new_id := public.agent_attach_subtask(
        run_row.persona_id,
        (tool_args->>'parent_card_id')::uuid,
        tool_args->>'title',
        tool_args->>'body_md',
        nullif(tool_args->>'assignee_user_id', '')::uuid,
        nullif(tool_args->>'priority_option_id', '')::uuid
      );
      result_payload := jsonb_build_object('created_card_id', new_id);
    when 'create_card_in_project' then
      new_id := public.agent_create_card_in_project(
        run_row.persona_id,
        (tool_args->>'target_project_id')::uuid,
        tool_args->>'title',
        tool_args->>'body_md',
        nullif(tool_args->>'assignee_user_id', '')::uuid,
        nullif(tool_args->>'priority_option_id', '')::uuid,
        nullif(tool_args->>'status_option_id', '')::uuid
      );
      result_payload := jsonb_build_object('created_card_id', new_id);
    when 'add_comment' then
      new_id := public.agent_add_comment(
        run_row.persona_id,
        (tool_args->>'card_id')::uuid,
        tool_args->>'body_md',
        null
      );
      result_payload := jsonb_build_object('comment_id', new_id);
    when 'send_inbox_message' then
      notification_id := public.agent_send_inbox_message(
        run_row.persona_id,
        (tool_args->>'target_user_id')::uuid,
        run_row.organization_id,
        tool_args->>'title',
        tool_args->>'body_md',
        nullif(tool_args->>'link', ''),
        run_row.id,
        run_row.project_id,
        run_row.card_id
      );
      result_payload := jsonb_build_object(
        'notification_id', notification_id,
        'suppressed', notification_id is null
      );
    when 'send_email' then
      -- Validate the persona is dispatchable + matches the run's org.
      -- send-agent-email re-validates server-side, but failing fast
      -- here keeps a misconfigured run from spamming pg_net requests.
      select * into persona_row from public.ai_personas where id = run_row.persona_id;
      if persona_row.id is null then
        raise exception 'dispatch_agent_tool_call_internal: persona % not found for send_email.', run_row.persona_id;
      end if;
      if persona_row.is_enabled = false then
        raise exception 'dispatch_agent_tool_call_internal: persona % disabled.', persona_row.slug;
      end if;
      if persona_row.organization_id <> run_row.organization_id then
        raise exception 'dispatch_agent_tool_call_internal: persona org mismatch on send_email.';
      end if;

      -- Fire-and-forget. pg_net is async — request_id is the queue id,
      -- not a delivery confirmation. Failures land in the
      -- send-agent-email function logs (Resend errors, missing email,
      -- user opt-out). v1 acceptable: the user approved the email,
      -- they'll see if it doesn't arrive.
      select net.http_post(
        url := (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'project_url'
          limit 1
        ) || '/functions/v1/send-agent-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization',
          'Bearer ' || (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'service_role_key'
            limit 1
          )
        ),
        body := jsonb_build_object(
          'run_id', run_row.id,
          'tool_call_index', tool_call_index,
          'target_user_id', tool_args->>'target_user_id',
          'organization_id', run_row.organization_id,
          'persona_agent_user_id', persona_row.agent_user_id,
          'subject', tool_args->>'subject',
          'sections', tool_args->'sections'
        )
      ) into email_request_id;

      result_payload := jsonb_build_object(
        'email_request_id', email_request_id,
        'queued', true
      );
    when 'fetch_url' then
      raise exception 'dispatch_agent_tool_call_internal: fetch_url cannot be approved post-hoc; it auto-applies in the worker.';
    else
      raise exception 'dispatch_agent_tool_call_internal: unknown tool %', tool_name;
  end case;

  return result_payload;
end;
$$;

revoke all on function public.dispatch_agent_tool_call_internal(uuid, integer) from public;
revoke all on function public.dispatch_agent_tool_call_internal(uuid, integer) from anon;
grant execute on function public.dispatch_agent_tool_call_internal(uuid, integer) to authenticated, service_role;

-- ---------------------------------------------------------------
-- 2. Backfill existing Sara personas with new capabilities
-- ---------------------------------------------------------------

-- Idempotent: only adds the capabilities that aren't already present.
-- Using array concatenation rather than overwrite preserves any
-- per-org customizations (e.g., orgs that hand-extended capabilities).
update public.ai_personas
set capabilities = (
  select array_agg(distinct cap)
  from unnest(capabilities || array['send_inbox_message', 'send_email']) as cap
)
where slug = 'sara'
  and not (capabilities @> array['send_inbox_message', 'send_email']);

-- ---------------------------------------------------------------
-- 3. seed_default_ai_personas — set Sara's capabilities on insert
-- ---------------------------------------------------------------

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
     array['add_comment']),
    (p_organization_id, 'Claire', 'claire', 'purple', 'PM',
     'You are Claire, an experienced Product Manager. You focus on user value, prioritization, roadmap clarity, and stakeholder communication. You ask clarifying questions before making recommendations.', true,
     array['add_comment']),
    (p_organization_id, 'Sara', 'sara', 'green', 'Scrum Master',
     'You are Sara, a pragmatic Scrum Master. You focus on sprint planning, retrospectives, process improvement, and team velocity. You value simplicity and sustainable pace.', true,
     array['add_comment', 'send_inbox_message', 'send_email']),
    (p_organization_id, 'Andy', 'andy', 'amber', 'Assistant',
     'You are Andy, a reliable and versatile Assistant. You help with organizing information, filing notes, creating task breakdowns, summarizing content. You execute tasks efficiently and confirm before making changes.', true,
     array['add_comment']),
    (p_organization_id, 'JK', 'jk', 'red', 'Strategist',
     'You are JK, a business strategist. You think about market positioning, competitive analysis, go-to-market strategy, and long-term vision.', true,
     array['add_comment']),
    (p_organization_id, 'Chris', 'chris', 'teal', 'Engineering Manager',
     'You are Chris, an experienced Engineering Manager. You focus on team health, delivery reliability, technical debt management, and engineering process. You balance speed with quality.', true,
     array['add_comment'])
  on conflict (organization_id, slug) do nothing;
end;
$$;

revoke all on function public.seed_default_ai_personas(uuid) from public;
grant execute on function public.seed_default_ai_personas(uuid) to authenticated;
