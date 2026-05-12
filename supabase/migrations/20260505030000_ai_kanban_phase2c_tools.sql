-- AI Kanban (Wave 2 F1) — Phase 2c tool execution layer.
--
-- Per docs/AI_KANBAN_PRD_2026_05_03.md §10 + §22.1 + §19 Phase 2.
--
-- Phase 2a delivered the dispatch backbone (trigger + dispatch RPC).
-- Phase 2b delivered the lifecycle RPCs (approve/reject/retry/update,
-- clone_template_to_card, ai_agent_schedules_tick) with approve_tool_call
-- stubbing the actual tool execution. Phase 2c plugs in the real
-- execution layer:
--
--   1. Six SECURITY DEFINER agent_* tool wrappers that perform the
--      mutating actions while attributing the work to the persona's
--      bot user (created_by/updated_by) and validating that the
--      persona is dispatchable + bot is a project member.
--   2. dispatch_agent_tool_call_internal — central dispatcher that
--      reads ai_agent_runs.tool_calls[idx] JSONB, parses name+args,
--      and delegates to the matching agent_* wrapper. Used by both
--      approve_tool_call (mutating, post-approval) and the worker
--      (non-mutating, immediate auto-apply).
--   3. Replaces approve_tool_call to call the dispatcher (the Phase 2b
--      stub `raise notice` is gone) — JSONB transitions stay atomic
--      with execution.
--   4. organizations.ai_run_budget_usd_monthly_cap — per-org budget
--      ceiling enforced by the worker.
--   5. organization_ai_fetch_allowlist — per-org domain patterns the
--      worker accepts for fetch_url.
--   6. ai-agent-run pull-fallback cron (every 30s) — picks up runs
--      that the pg_notify channel missed (worker offline, retry, etc.).
--
-- The Phase 2c edge function (supabase/functions/ai-agent-run) ships
-- alongside this migration.

-- ============================================================
-- 0. Schema prerequisites
-- ============================================================

-- attach_subtask requires a self-referencing parent_card_id on cards.
-- There's no existing subtask UI in v1; this column lands now so the
-- worker's attach_subtask tool has a real FK to set. Index supports
-- "list children of card X" lookups (Phase 4+ surfaces them).
alter table public.cards
  add column if not exists parent_card_id uuid references public.cards (id) on delete set null;

create index if not exists cards_parent_card_id_idx
  on public.cards (parent_card_id)
  where parent_card_id is not null;

-- ============================================================
-- 1. Tool execution wrappers — agent_* family
-- ============================================================

-- All six follow the same pattern:
--   - SECURITY DEFINER, service_role + authenticated callable
--     (authenticated reaches them via approve_tool_call → dispatcher,
--     which is itself permission-checked at the run level).
--   - Loaded persona row validates: exists, is_enabled, role in
--     ('assistant','monitor'), agent_user_id provisioned, organization
--     matches the target card/project.
--   - Mutations stamp updated_by_user_id = persona.agent_user_id (the
--     audit trail says "the bot did this", not "service_role did this").
--   - The bot is auto-added as a project_member 'member' if missing —
--     same invariant clone_template_to_card enforces, repeated here
--     because the worker may invoke a tool on a card the bot was added
--     to outside of the schedule path.

create or replace function public.agent_assert_persona_can_edit_project(
  target_persona_id uuid,
  target_project_id uuid
)
returns public.ai_personas
language plpgsql
security definer
set search_path = public
as $$
declare
  persona_row public.ai_personas%rowtype;
  project_row public.projects%rowtype;
  workspace_org_id uuid;
begin
  if target_persona_id is null then
    raise exception 'agent_assert_persona_can_edit_project: persona_id is required.';
  end if;
  if target_project_id is null then
    raise exception 'agent_assert_persona_can_edit_project: project_id is required.';
  end if;

  select * into persona_row from public.ai_personas where id = target_persona_id;
  if persona_row.id is null then
    raise exception 'agent: persona % not found.', target_persona_id;
  end if;
  if persona_row.is_enabled = false then
    raise exception 'agent: persona % is disabled.', persona_row.slug;
  end if;
  if persona_row.role not in ('assistant','monitor') then
    raise exception 'agent: persona % role % is not dispatchable.', persona_row.slug, persona_row.role;
  end if;
  if persona_row.agent_user_id is null then
    raise exception 'agent: persona % has no provisioned bot user.', persona_row.slug;
  end if;

  select * into project_row from public.projects where id = target_project_id;
  if project_row.id is null then
    raise exception 'agent: project % not found.', target_project_id;
  end if;
  if project_row.agents_assignable = false then
    raise exception 'agent: project % has agents_assignable=false.', project_row.slug;
  end if;

  select w.organization_id into workspace_org_id
  from public.workspaces w where w.id = project_row.workspace_id;
  if workspace_org_id is null or workspace_org_id <> persona_row.organization_id then
    raise exception 'agent: persona org % does not match project org %.',
      persona_row.organization_id, workspace_org_id;
  end if;

  -- Idempotent project membership.
  insert into public.project_members (project_id, user_id, role)
  values (target_project_id, persona_row.agent_user_id, 'member'::public.scope_access_role)
  on conflict (project_id, user_id) do nothing;

  return persona_row;
end;
$$;

revoke all on function public.agent_assert_persona_can_edit_project(uuid, uuid) from public;
revoke all on function public.agent_assert_persona_can_edit_project(uuid, uuid) from anon;
grant execute on function public.agent_assert_persona_can_edit_project(uuid, uuid) to authenticated, service_role;

-- 1.1 add_comment (non-mutating — auto-applies in the worker)
create or replace function public.agent_add_comment(
  target_persona_id uuid,
  target_card_id uuid,
  target_body_md text,
  target_mention_user_ids uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  card_row public.cards%rowtype;
  persona_row public.ai_personas%rowtype;
  inserted_comment_id uuid;
begin
  if target_card_id is null then
    raise exception 'agent_add_comment: target_card_id is required.';
  end if;
  if target_body_md is null or trim(target_body_md) = '' then
    raise exception 'agent_add_comment: body is required.';
  end if;
  if length(target_body_md) > 5000 then
    raise exception 'agent_add_comment: body exceeds 5000-char cap.';
  end if;

  select * into card_row from public.cards where id = target_card_id;
  if card_row.id is null then
    raise exception 'agent_add_comment: card % not found.', target_card_id;
  end if;

  persona_row := public.agent_assert_persona_can_edit_project(target_persona_id, card_row.project_id);

  insert into public.card_comments (card_id, body_text, created_by_user_id)
  values (target_card_id, trim(target_body_md), persona_row.agent_user_id)
  returning id into inserted_comment_id;

  return inserted_comment_id;
end;
$$;

revoke all on function public.agent_add_comment(uuid, uuid, text, uuid[]) from public;
revoke all on function public.agent_add_comment(uuid, uuid, text, uuid[]) from anon;
grant execute on function public.agent_add_comment(uuid, uuid, text, uuid[]) to authenticated, service_role;

-- 1.2 set_card_status
create or replace function public.agent_set_card_status(
  target_persona_id uuid,
  target_card_id uuid,
  target_status_option_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  card_row public.cards%rowtype;
  persona_row public.ai_personas%rowtype;
  status_opt_row public.project_status_options%rowtype;
begin
  if target_card_id is null or target_status_option_id is null then
    raise exception 'agent_set_card_status: card and status are required.';
  end if;

  select * into card_row from public.cards where id = target_card_id;
  if card_row.id is null then
    raise exception 'agent_set_card_status: card % not found.', target_card_id;
  end if;

  select * into status_opt_row from public.project_status_options
  where id = target_status_option_id and project_id = card_row.project_id;
  if status_opt_row.id is null then
    raise exception 'agent_set_card_status: status option % not in project.', target_status_option_id;
  end if;

  persona_row := public.agent_assert_persona_can_edit_project(target_persona_id, card_row.project_id);

  update public.cards
  set status_option_id = target_status_option_id,
      updated_by_user_id = persona_row.agent_user_id
  where id = target_card_id;
end;
$$;

revoke all on function public.agent_set_card_status(uuid, uuid, uuid) from public;
revoke all on function public.agent_set_card_status(uuid, uuid, uuid) from anon;
grant execute on function public.agent_set_card_status(uuid, uuid, uuid) to authenticated, service_role;

-- 1.3 set_card_priority
create or replace function public.agent_set_card_priority(
  target_persona_id uuid,
  target_card_id uuid,
  target_priority_option_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  card_row public.cards%rowtype;
  persona_row public.ai_personas%rowtype;
  priority_opt_row public.project_priority_options%rowtype;
begin
  if target_card_id is null or target_priority_option_id is null then
    raise exception 'agent_set_card_priority: card and priority are required.';
  end if;

  select * into card_row from public.cards where id = target_card_id;
  if card_row.id is null then
    raise exception 'agent_set_card_priority: card % not found.', target_card_id;
  end if;

  select * into priority_opt_row from public.project_priority_options
  where id = target_priority_option_id and project_id = card_row.project_id;
  if priority_opt_row.id is null then
    raise exception 'agent_set_card_priority: priority option % not in project.', target_priority_option_id;
  end if;

  persona_row := public.agent_assert_persona_can_edit_project(target_persona_id, card_row.project_id);

  update public.cards
  set priority_option_id = target_priority_option_id,
      updated_by_user_id = persona_row.agent_user_id
  where id = target_card_id;
end;
$$;

revoke all on function public.agent_set_card_priority(uuid, uuid, uuid) from public;
revoke all on function public.agent_set_card_priority(uuid, uuid, uuid) from anon;
grant execute on function public.agent_set_card_priority(uuid, uuid, uuid) to authenticated, service_role;

-- 1.4 set_card_assignee (with loop guard)
--
-- PRD §10.6 loop guard: refuse when the new assignee is another bot user.
-- v1 hard-refuses rather than the "set but suppress trigger" path the PRD
-- mentions — the trigger lives outside this function's reach (firing it
-- and then race-deleting the queued run is a worse failure mode than a
-- clean refusal). Humans that the calling agent re-assigns to are fine.
create or replace function public.agent_set_card_assignee(
  target_persona_id uuid,
  target_card_id uuid,
  target_assignee_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  card_row public.cards%rowtype;
  persona_row public.ai_personas%rowtype;
  assignee_is_bot boolean;
begin
  if target_card_id is null then
    raise exception 'agent_set_card_assignee: card is required.';
  end if;

  select * into card_row from public.cards where id = target_card_id;
  if card_row.id is null then
    raise exception 'agent_set_card_assignee: card % not found.', target_card_id;
  end if;

  persona_row := public.agent_assert_persona_can_edit_project(target_persona_id, card_row.project_id);

  if target_assignee_user_id is not null then
    select exists(
      select 1 from public.ai_personas where agent_user_id = target_assignee_user_id
    ) into assignee_is_bot;
    if assignee_is_bot then
      raise exception 'agent_set_card_assignee: refusing bot-to-bot reassignment (loop guard).';
    end if;
  end if;

  update public.cards
  set assignee_user_id = target_assignee_user_id,
      updated_by_user_id = persona_row.agent_user_id
  where id = target_card_id;
end;
$$;

revoke all on function public.agent_set_card_assignee(uuid, uuid, uuid) from public;
revoke all on function public.agent_set_card_assignee(uuid, uuid, uuid) from anon;
grant execute on function public.agent_set_card_assignee(uuid, uuid, uuid) to authenticated, service_role;

-- 1.5 attach_subtask — creates a CHILD card under parent_card_id
create or replace function public.agent_attach_subtask(
  target_persona_id uuid,
  target_parent_card_id uuid,
  target_title text,
  target_body_md text default null,
  target_assignee_user_id uuid default null,
  target_priority_option_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_card public.cards%rowtype;
  persona_row public.ai_personas%rowtype;
  allocated_card_number integer;
  new_card_id uuid;
  trimmed_title text := trim(coalesce(target_title, ''));
begin
  if target_parent_card_id is null then
    raise exception 'agent_attach_subtask: parent_card_id is required.';
  end if;
  if trimmed_title = '' then
    raise exception 'agent_attach_subtask: title is required.';
  end if;
  if length(trimmed_title) > 500 then
    raise exception 'agent_attach_subtask: title exceeds 500-char cap.';
  end if;
  if target_body_md is not null and length(target_body_md) > 10000 then
    raise exception 'agent_attach_subtask: body exceeds 10000-char cap.';
  end if;

  select * into parent_card from public.cards where id = target_parent_card_id;
  if parent_card.id is null then
    raise exception 'agent_attach_subtask: parent card % not found.', target_parent_card_id;
  end if;

  persona_row := public.agent_assert_persona_can_edit_project(target_persona_id, parent_card.project_id);

  update public.projects
  set next_card_number = next_card_number + 1
  where id = parent_card.project_id
  returning next_card_number - 1 into allocated_card_number;

  insert into public.cards (
    project_id,
    project_card_number,
    title,
    body_md,
    parent_card_id,
    assignee_user_id,
    priority_option_id,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    parent_card.project_id,
    allocated_card_number,
    trimmed_title,
    target_body_md,
    target_parent_card_id,
    target_assignee_user_id,
    target_priority_option_id,
    persona_row.agent_user_id,
    persona_row.agent_user_id
  )
  returning id into new_card_id;

  return new_card_id;
end;
$$;

revoke all on function public.agent_attach_subtask(uuid, uuid, text, text, uuid, uuid) from public;
revoke all on function public.agent_attach_subtask(uuid, uuid, text, text, uuid, uuid) from anon;
grant execute on function public.agent_attach_subtask(uuid, uuid, text, text, uuid, uuid) to authenticated, service_role;

-- 1.6 create_card_in_project — creates a SIBLING card (no parent)
create or replace function public.agent_create_card_in_project(
  target_persona_id uuid,
  target_project_id uuid,
  target_title text,
  target_body_md text default null,
  target_assignee_user_id uuid default null,
  target_priority_option_id uuid default null,
  target_status_option_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  persona_row public.ai_personas%rowtype;
  allocated_card_number integer;
  new_card_id uuid;
  trimmed_title text := trim(coalesce(target_title, ''));
begin
  if trimmed_title = '' then
    raise exception 'agent_create_card_in_project: title is required.';
  end if;
  if length(trimmed_title) > 500 then
    raise exception 'agent_create_card_in_project: title exceeds 500-char cap.';
  end if;
  if target_body_md is not null and length(target_body_md) > 10000 then
    raise exception 'agent_create_card_in_project: body exceeds 10000-char cap.';
  end if;

  persona_row := public.agent_assert_persona_can_edit_project(target_persona_id, target_project_id);

  update public.projects
  set next_card_number = next_card_number + 1
  where id = target_project_id
  returning next_card_number - 1 into allocated_card_number;

  insert into public.cards (
    project_id,
    project_card_number,
    title,
    body_md,
    assignee_user_id,
    priority_option_id,
    status_option_id,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    target_project_id,
    allocated_card_number,
    trimmed_title,
    target_body_md,
    target_assignee_user_id,
    target_priority_option_id,
    target_status_option_id,
    persona_row.agent_user_id,
    persona_row.agent_user_id
  )
  returning id into new_card_id;

  return new_card_id;
end;
$$;

revoke all on function public.agent_create_card_in_project(uuid, uuid, text, text, uuid, uuid, uuid) from public;
revoke all on function public.agent_create_card_in_project(uuid, uuid, text, text, uuid, uuid, uuid) from anon;
grant execute on function public.agent_create_card_in_project(uuid, uuid, text, text, uuid, uuid, uuid) to authenticated, service_role;

-- ============================================================
-- 2. dispatch_agent_tool_call_internal — central dispatcher
-- ============================================================

-- Reads ai_agent_runs.tool_calls[idx], parses name+args, calls the
-- matching agent_* wrapper. Returns a JSONB result envelope that
-- approve_tool_call merges into the tool_call audit entry.
--
-- Tools handled here are ALL mutating ones (set_card_status,
-- set_card_priority, set_card_assignee, attach_subtask,
-- create_card_in_project). Non-mutating tools (add_comment, fetch_url)
-- are auto-applied by the worker and never go through the approve path,
-- so they're not handled here.
--
-- fetch_url is intentionally not in the dispatcher — it's a HTTP fetch
-- that the worker runs in-band; the result is captured in the JSONB at
-- the moment of execution, not deferred for approval.
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
      -- add_comment is auto-applied by the worker (non-mutating). Allow
      -- it through the dispatcher anyway so tests + edge cases work.
      new_id := public.agent_add_comment(
        run_row.persona_id,
        (tool_args->>'card_id')::uuid,
        tool_args->>'body_md',
        null
      );
      result_payload := jsonb_build_object('comment_id', new_id);
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

-- ============================================================
-- 3. Replace approve_tool_call to use the dispatcher
-- ============================================================

-- Phase 2b's approve_tool_call stubbed execution with a notice. Phase 2c
-- swaps in the real path: lock + verify + dispatch + transition JSONB.
-- The transaction wrapping all three remains intact — if dispatch fails,
-- the JSONB does not transition and the action bar re-shows.
create or replace function public.approve_tool_call(
  run_id uuid,
  tool_call_index integer,
  edited_args jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  run_row public.ai_agent_runs%rowtype;
  tool_call jsonb;
  tool_call_status text;
  tool_call_name text;
  caller_user_id uuid;
  caller_can_approve boolean := false;
  dispatch_result jsonb;
begin
  if run_id is null then
    raise exception 'approve_tool_call: run_id is required.';
  end if;
  if tool_call_index is null or tool_call_index < 0 then
    raise exception 'approve_tool_call: tool_call_index must be >= 0.';
  end if;

  caller_user_id := auth.uid();

  select * into run_row
  from public.ai_agent_runs
  where id = run_id
  for update;

  if run_row.id is null then
    raise exception 'approve_tool_call: run % not found.', run_id;
  end if;

  if caller_user_id is null then
    caller_can_approve := true;
  elsif run_row.created_by_user_id = caller_user_id then
    caller_can_approve := true;
  elsif run_row.project_id is not null
        and public.can_edit_project(run_row.project_id, caller_user_id) then
    caller_can_approve := true;
  end if;

  if not caller_can_approve then
    raise exception 'You do not have permission to approve tool calls on this run.';
  end if;

  if jsonb_typeof(run_row.tool_calls) <> 'array' then
    raise exception 'approve_tool_call: run % has no tool_calls array.', run_id;
  end if;

  tool_call := run_row.tool_calls -> tool_call_index;
  if tool_call is null then
    raise exception 'approve_tool_call: tool_call index % out of range for run %.',
      tool_call_index, run_id;
  end if;

  tool_call_status := tool_call ->> 'status';
  tool_call_name := tool_call ->> 'name';

  if tool_call_status = 'executed' then
    return;
  end if;

  if tool_call_status in ('rejected', 'expired') then
    raise exception 'tool_call_no_longer_pending'
      using detail = format(
        'tool call %s on run %s is in terminal state %s', tool_call_index, run_id, tool_call_status
      );
  end if;

  if tool_call_status <> 'awaiting_approval' then
    raise exception 'approve_tool_call: tool call % on run % has unexpected status %.',
      tool_call_index, run_id, coalesce(tool_call_status, 'null');
  end if;

  -- Persist edited_args FIRST so the dispatcher reads them. If the
  -- dispatcher fails, the surrounding statement rolls back and the JSONB
  -- reverts.
  if edited_args is not null then
    update public.ai_agent_runs
    set tool_calls = jsonb_set(
          tool_calls,
          array[tool_call_index::text, 'edited_args'],
          edited_args
        )
    where id = run_id;
  end if;

  dispatch_result := public.dispatch_agent_tool_call_internal(run_id, tool_call_index);

  -- Transition the JSONB. Dispatcher already executed; this just
  -- stamps the audit fields.
  update public.ai_agent_runs
  set tool_calls = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              tool_calls,
              array[tool_call_index::text, 'status'],
              to_jsonb('executed'::text)
            ),
            array[tool_call_index::text, 'executed_at'],
            to_jsonb(timezone('utc', now()))
          ),
          array[tool_call_index::text, 'approved_by_user_id'],
          case
            when caller_user_id is null then 'null'::jsonb
            else to_jsonb(caller_user_id)
          end
        ),
        array[tool_call_index::text, 'result'],
        coalesce(dispatch_result, '{}'::jsonb)
      )
  where id = run_id;
end;
$$;

revoke all on function public.approve_tool_call(uuid, integer, jsonb) from public;
revoke all on function public.approve_tool_call(uuid, integer, jsonb) from anon;
grant execute on function public.approve_tool_call(uuid, integer, jsonb) to authenticated, service_role;

-- ============================================================
-- 3.1. start_agent_run — atomic queued → running transition
-- ============================================================

-- The worker calls this before doing any LLM work. It's a single-statement
-- atomic transition that returns true when the worker won the race, false
-- when another worker (or a previous tick) already moved the row out of
-- queued. The pull-fallback cron + push-via-pg_notify path can both
-- hammer the same run without producing duplicate work.
create or replace function public.start_agent_run(target_run_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  rows_affected integer;
begin
  if target_run_id is null then
    raise exception 'start_agent_run: target_run_id is required.';
  end if;

  update public.ai_agent_runs
  set status = 'running',
      started_at = timezone('utc', now())
  where id = target_run_id
    and status = 'queued';

  get diagnostics rows_affected = row_count;
  return rows_affected > 0;
end;
$$;

revoke all on function public.start_agent_run(uuid) from public;
revoke all on function public.start_agent_run(uuid) from anon;
revoke all on function public.start_agent_run(uuid) from authenticated;
grant execute on function public.start_agent_run(uuid) to service_role;

-- ============================================================
-- 4. organizations.ai_run_budget_usd_monthly_cap
-- ============================================================

-- Soft monthly cap on cumulative ai_agent_runs.token_cost_usd per
-- organization. The worker checks this before each LLM call and
-- aborts the run with status='failed', error_text='budget_cap_reached'
-- when crossed. Default null = no cap (existing behaviour).
alter table public.organizations
  add column if not exists ai_run_budget_usd_monthly_cap numeric(10,2);

comment on column public.organizations.ai_run_budget_usd_monthly_cap is
  'Soft monthly USD cap on cumulative AI agent run cost. Null = no cap. Worker aborts new runs once the rolling-30d sum of ai_agent_runs.token_cost_usd crosses this value.';

-- ============================================================
-- 5. organization_ai_fetch_allowlist
-- ============================================================

-- Per-org domain allowlist for the worker's fetch_url tool. Patterns
-- are simple host-suffix matches (`crash.lila.com`, `*.zendesk.com`).
-- The worker rejects fetches whose URL host does not match any pattern.
create table if not exists public.organization_ai_fetch_allowlist (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  domain_pattern text not null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  constraint org_ai_fetch_allowlist_domain_nonblank check (length(trim(domain_pattern)) > 0),
  constraint org_ai_fetch_allowlist_unique unique (organization_id, domain_pattern)
);

create index if not exists org_ai_fetch_allowlist_org_idx
  on public.organization_ai_fetch_allowlist (organization_id);

alter table public.organization_ai_fetch_allowlist enable row level security;

create policy organization_ai_fetch_allowlist_select on public.organization_ai_fetch_allowlist
  for select
  to authenticated
  using (
    public.can_access_organization(organization_id, auth.uid())
  );

create policy organization_ai_fetch_allowlist_insert on public.organization_ai_fetch_allowlist
  for insert
  to authenticated
  with check (
    created_by_user_id = auth.uid()
    and exists(
      select 1 from public.organization_members om
      where om.organization_id = organization_ai_fetch_allowlist.organization_id
        and om.user_id = auth.uid()
        and om.role = 'admin'::public.organization_role
    )
  );

create policy organization_ai_fetch_allowlist_delete on public.organization_ai_fetch_allowlist
  for delete
  to authenticated
  using (
    exists(
      select 1 from public.organization_members om
      where om.organization_id = organization_ai_fetch_allowlist.organization_id
        and om.user_id = auth.uid()
        and om.role = 'admin'::public.organization_role
    )
  );

revoke all privileges on public.organization_ai_fetch_allowlist from anon, authenticated;
grant select, insert, delete on public.organization_ai_fetch_allowlist to authenticated;
grant all on public.organization_ai_fetch_allowlist to service_role;

-- ============================================================
-- 6. ai-agent-run pull-fallback cron
-- ============================================================

-- The pg_notify channel from Phase 2a delivers runs to the worker as
-- they're queued. The worker may be offline or the notify may be
-- dropped (no durability guarantee), so a 30s pull-fallback cron
-- catches stuck queued runs older than 60s and pokes the worker. The
-- worker's lifecycle code is idempotent on (run_id, status='queued'),
-- so duplicate pokes are safe.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'ai-agent-run-pull-fallback') then
    perform cron.unschedule('ai-agent-run-pull-fallback');
  end if;
end
$$;

select cron.schedule(
  'ai-agent-run-pull-fallback',
  '30 seconds',
  $cron$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'project_url'
      limit 1
    ) || '/functions/v1/ai-agent-run',
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
    body := jsonb_build_object('mode', 'pull_fallback')
  )
  where exists (
    select 1 from public.ai_agent_runs
    where status = 'queued'
      and created_at < timezone('utc', now()) - interval '60 seconds'
  );
  $cron$
);
