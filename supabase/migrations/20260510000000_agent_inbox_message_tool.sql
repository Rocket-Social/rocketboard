-- Sprint Manager redesign — PR-B: send_inbox_message tool wiring.
--
-- Adds the runtime path for the new send_inbox_message LLM tool:
--   1. Extend notifications_kind_check enum to include
--      'agent_inbox_message' so the helper's insert succeeds.
--   2. agent_send_inbox_message — SECURITY DEFINER helper that the
--      central dispatcher calls when an approved tool_call has
--      name='send_inbox_message'. Validates persona, validates the
--      target user is a member of the run's organization, then
--      delegates to public.insert_notification (which handles dedup
--      and self-notify guards).
--   3. dispatch_agent_tool_call_internal — re-created with a new
--      `when 'send_inbox_message' then` branch. Existing branches
--      (set_card_status, agent_add_comment, etc.) are preserved
--      verbatim from 20260505030000_ai_kanban_phase2c_tools.sql.
--
-- send_email's runtime path is intentionally deferred to PR-C — it
-- needs an HTTP call out to a new send-agent-email edge function,
-- which lands together with the Sprint Manager prompt rewrite.

-- ---------------------------------------------------------------
-- 1. Extend notifications_kind_check
-- ---------------------------------------------------------------

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (
    kind in (
      'mention',
      'assignment',
      'comment_on_owned_card',
      'comment_on_followed_card',
      'drift_nudge',
      'run_completed',
      'run_awaiting_approval',
      'org_budget_warning',
      'org_budget_capped',
      'org_dispatch_quota_warning',
      'org_dispatch_quota_exceeded',
      'agent_inbox_message'
    )
  );

-- ---------------------------------------------------------------
-- 2. agent_send_inbox_message helper
-- ---------------------------------------------------------------

create or replace function public.agent_send_inbox_message(
  target_persona_id uuid,
  target_user_id uuid,
  target_organization_id uuid,
  target_title text,
  target_body_md text,
  target_link text default null,
  target_run_id uuid default null,
  target_project_id uuid default null,
  target_card_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  persona_row public.ai_personas%rowtype;
  is_org_member boolean;
  notification_id uuid;
begin
  if target_persona_id is null then
    raise exception 'agent_send_inbox_message: persona_id is required.';
  end if;
  if target_user_id is null then
    raise exception 'agent_send_inbox_message: target_user_id is required.';
  end if;
  if target_organization_id is null then
    raise exception 'agent_send_inbox_message: organization_id is required.';
  end if;
  if target_title is null or trim(target_title) = '' then
    raise exception 'agent_send_inbox_message: title is required.';
  end if;
  if length(target_title) > 200 then
    raise exception 'agent_send_inbox_message: title exceeds 200-char cap.';
  end if;
  if target_body_md is null or trim(target_body_md) = '' then
    raise exception 'agent_send_inbox_message: body is required.';
  end if;
  if length(target_body_md) > 2000 then
    raise exception 'agent_send_inbox_message: body exceeds 2000-char cap.';
  end if;
  if target_link is not null and length(target_link) > 2048 then
    raise exception 'agent_send_inbox_message: link exceeds 2048-char cap.';
  end if;

  -- Validate persona is dispatchable + matches the run's org. Reuses
  -- shape from agent_assert_persona_can_edit_project but skips the
  -- project-specific checks (this tool isn't card-scoped).
  select * into persona_row from public.ai_personas where id = target_persona_id;
  if persona_row.id is null then
    raise exception 'agent_send_inbox_message: persona % not found.', target_persona_id;
  end if;
  if persona_row.is_enabled = false then
    raise exception 'agent_send_inbox_message: persona % is disabled.', persona_row.slug;
  end if;
  if persona_row.role not in ('assistant','monitor') then
    raise exception 'agent_send_inbox_message: persona % role % is not dispatchable.',
      persona_row.slug, persona_row.role;
  end if;
  if persona_row.organization_id <> target_organization_id then
    raise exception 'agent_send_inbox_message: persona org % does not match run org %.',
      persona_row.organization_id, target_organization_id;
  end if;

  -- Safety: only address users who belong to the run's organization.
  -- Prevents an LLM from emitting an arbitrary uuid that pings someone
  -- in another org's inbox.
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization_id
      and user_id = target_user_id
  ) into is_org_member;

  if not is_org_member then
    raise exception 'agent_send_inbox_message: target user % is not a member of organization %.',
      target_user_id, target_organization_id;
  end if;

  notification_id := public.insert_notification(
    target_user_id := target_user_id,
    target_organization_id := target_organization_id,
    target_kind := 'agent_inbox_message',
    target_title := trim(target_title),
    target_body := trim(target_body_md),
    target_link := target_link,
    target_project_id := target_project_id,
    target_card_id := target_card_id,
    target_origin_user_id := persona_row.agent_user_id,
    target_origin_run_id := target_run_id,
    -- Tighter dedup: same agent + same target + same kind + same link
    -- inside 6h collapses. Sprint Manager fires once per day, so 6h
    -- still allows a same-day re-ping if (somehow) the link changes.
    target_dedup_window := interval '6 hours'
  );

  return notification_id;
end;
$$;

revoke all on function public.agent_send_inbox_message(uuid, uuid, uuid, text, text, text, uuid, uuid, uuid) from public;
revoke all on function public.agent_send_inbox_message(uuid, uuid, uuid, text, text, text, uuid, uuid, uuid) from anon;
grant execute on function public.agent_send_inbox_message(uuid, uuid, uuid, text, text, text, uuid, uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------
-- 3. dispatch_agent_tool_call_internal — add send_inbox_message branch
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
  tool_call jsonb;
  tool_name text;
  tool_args jsonb;
  result_payload jsonb := '{}'::jsonb;
  new_id uuid;
  notification_id uuid;
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
  -- Approval-time edits: prefer edited_args when present, fall back to args.
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
      -- add_comment is auto-applied by the worker (non-mutating) for
      -- task runs. Monitor runs route it through here. Allow it
      -- through the dispatcher anyway so tests + edge cases work.
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
      -- insert_notification returns null when self-notify or dedup
      -- collapses. Surface that as a non-error result.
      result_payload := jsonb_build_object(
        'notification_id', notification_id,
        'suppressed', notification_id is null
      );
    when 'fetch_url' then
      -- fetch_url cannot be re-executed from SQL — it's a worker-side
      -- HTTP call. Approving fetch_url is a contract error.
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
