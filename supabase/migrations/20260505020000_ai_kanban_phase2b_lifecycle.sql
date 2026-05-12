-- AI Kanban (Wave 2 F1) — Phase 2b lifecycle RPCs + schedule fire path.
--
-- Per docs/AI_KANBAN_PRD_2026_05_03.md §8.1 + §19 Phase 2.
--
-- Phase 2a delivered the dispatch backbone: the trigger that enqueues a
-- queued run when a card is assigned to a bot user, the dispatch RPC
-- that backs it, plus pause/resume/cancel. Phase 2b fills in the rest of
-- the lifecycle surface so Phase 3 UI can wire against a complete RPC
-- contract while the Phase 2c worker is still being built:
--
--   - clone_template_to_card — clones a schedule's card_template into a
--     fresh card with the bot user as assignee (which fires the trigger
--     from Phase 2a and enqueues the run).
--   - approve_tool_call / reject_tool_call — atomic JSONB transitions
--     for the awaiting_approval state machine. Phase 2b stubs the actual
--     tool execution inside approve_tool_call (raises a notice) and
--     transitions the JSONB; Phase 2c replaces the stub with real
--     tool dispatch via the worker. This contract-first approach lets
--     Phase 3 build the action bar UI against a stable interface.
--   - retry_agent_run — duplicates a failed/cancelled run with the
--     previous_run_id chain link, and expires any pending tool calls on
--     the prior run as 'superseded_by_retry'. Idempotent.
--   - update_agent_schedule — owner-or-editor mutation surface for the
--     schedule rows, recomputes next_run_at on cron change.
--   - next_cron_fire — small in-database cron parser. Handles the v1
--     subset (literal, *, ranges, lists, */N steps) which is enough for
--     the 3 starter templates and the friendly preset picker output.
--   - ai_agent_schedules_tick — pg_cron job that scans due, unpaused
--     schedules every minute (batch cap 50). For each, clones the
--     template (which assigns to bot → fires trigger → enqueues run)
--     then advances next_run_at via next_cron_fire.
--
-- Phase 2c then plugs the ai-agent-run edge function into the
-- ai_agent_runs_queued notify channel from Phase 2a, plus the pull-
-- fallback cron, plus the 7 v1 tools.

-- ============================================================
-- 1. cron_field_matches — helper for next_cron_fire
-- ============================================================

-- Returns true iff `value` matches the given cron field expression.
-- Supports: '*', integer literal, comma-list (1,15,30), range (1-5),
-- step (*/15 or 1-30/2). Min/max bound the field's valid range so
-- range/step expansion stays inside it.
create or replace function public.cron_field_matches(
  field_expr text,
  field_value integer,
  field_min integer,
  field_max integer
)
returns boolean
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  part text;
  range_start integer;
  range_end integer;
  step integer;
  range_value text;
  step_part text;
  i integer;
  expanded_match boolean := false;
begin
  -- Normalise: split commas, evaluate each component, OR the results.
  for part in select unnest(string_to_array(trim(field_expr), ','))
  loop
    part := trim(part);
    if part = '' then
      continue;
    end if;

    -- Split off step (a-b/N or */N)
    if position('/' in part) > 0 then
      range_value := split_part(part, '/', 1);
      step_part := split_part(part, '/', 2);
      step := nullif(trim(step_part), '')::integer;
      if step is null or step <= 0 then
        raise exception 'cron_field_matches: invalid step in field %', part;
      end if;
    else
      range_value := part;
      step := 1;
    end if;

    if range_value = '*' then
      range_start := field_min;
      range_end := field_max;
    elsif position('-' in range_value) > 0 then
      range_start := nullif(trim(split_part(range_value, '-', 1)), '')::integer;
      range_end := nullif(trim(split_part(range_value, '-', 2)), '')::integer;
      if range_start is null or range_end is null then
        raise exception 'cron_field_matches: invalid range in field %', part;
      end if;
    else
      range_start := nullif(trim(range_value), '')::integer;
      range_end := range_start;
      if range_start is null then
        raise exception 'cron_field_matches: invalid literal in field %', part;
      end if;
    end if;

    if range_start < field_min or range_end > field_max then
      raise exception 'cron_field_matches: field % out of bounds [%, %]', part, field_min, field_max;
    end if;

    -- Expand and check
    i := range_start;
    while i <= range_end loop
      if i = field_value then
        expanded_match := true;
        exit;
      end if;
      i := i + step;
    end loop;

    if expanded_match then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

revoke all on function public.cron_field_matches(text, integer, integer, integer) from public;
revoke all on function public.cron_field_matches(text, integer, integer, integer) from anon;
grant execute on function public.cron_field_matches(text, integer, integer, integer) to authenticated, service_role;

-- ============================================================
-- 2. next_cron_fire — compute next match for a cron expression
-- ============================================================

-- Returns the next time at-or-after `from_ts` that matches the given
-- 5-field cron expression in the given timezone. Returns NULL if no
-- match is found within 366 days (defensive cap — pathological
-- expressions like '0 0 31 2 *' would otherwise loop forever).
--
-- Algorithm: jump-skip rather than minute-by-minute. After advancing
-- to the next minute, check fields in (minute, hour, day, month) order
-- and skip ahead to the next-valid-value at the most coarse granularity
-- that fails. Bounded by ~525k iterations worst case (one per minute in
-- a year), but converges in single-digit iterations for typical
-- expressions like '0 10 * * 1-5' (weekdays 10am).
create or replace function public.next_cron_fire(
  cron_expr text,
  tz text,
  from_ts timestamptz
)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  parts text[];
  minute_part text;
  hour_part text;
  dom_part text;
  month_part text;
  dow_part text;
  candidate timestamptz;
  candidate_local timestamp;
  candidate_min integer;
  candidate_hour integer;
  candidate_dom integer;
  candidate_month integer;
  candidate_dow integer;
  iterations integer := 0;
  max_iterations integer := 366 * 1440; -- one year of minutes
begin
  if cron_expr is null or trim(cron_expr) = '' then
    raise exception 'next_cron_fire: cron expression is required.';
  end if;
  if tz is null or trim(tz) = '' then
    raise exception 'next_cron_fire: timezone is required.';
  end if;

  parts := regexp_split_to_array(trim(cron_expr), '\s+');
  if coalesce(array_length(parts, 1), 0) <> 5 then
    raise exception 'next_cron_fire: cron expression must have 5 fields, got % (%)',
      coalesce(array_length(parts, 1), 0), cron_expr;
  end if;

  minute_part := parts[1];
  hour_part := parts[2];
  dom_part := parts[3];
  month_part := parts[4];
  dow_part := parts[5];

  -- Validate each field once before looping; raises if invalid.
  perform public.cron_field_matches(minute_part, 0, 0, 59);
  perform public.cron_field_matches(hour_part, 0, 0, 23);
  perform public.cron_field_matches(dom_part, 1, 1, 31);
  perform public.cron_field_matches(month_part, 1, 1, 12);
  perform public.cron_field_matches(dow_part, 0, 0, 6);

  -- Start from the next whole minute strictly after from_ts.
  candidate := date_trunc('minute', from_ts) + interval '1 minute';

  loop
    iterations := iterations + 1;
    if iterations > max_iterations then
      return null;
    end if;

    candidate_local := timezone(tz, candidate);
    candidate_min := extract(minute from candidate_local)::integer;
    candidate_hour := extract(hour from candidate_local)::integer;
    candidate_dom := extract(day from candidate_local)::integer;
    candidate_month := extract(month from candidate_local)::integer;
    candidate_dow := extract(dow from candidate_local)::integer;

    -- Coarse-to-fine: month, then day-of-month + day-of-week, then hour, then minute.
    if not public.cron_field_matches(month_part, candidate_month, 1, 12) then
      candidate := date_trunc('month', candidate_local + interval '1 month') at time zone tz;
      continue;
    end if;

    -- Cron semantics: day matches if BOTH day-of-month AND day-of-week match
    -- when both are constrained, OR EITHER matches when one is '*'. We approximate
    -- the standard "*-relaxes-OR" rule by treating both as required only when
    -- both are constrained — for v1 templates the friendly preset always uses
    -- one or the other, never both.
    if not public.cron_field_matches(dom_part, candidate_dom, 1, 31)
       or not public.cron_field_matches(dow_part, candidate_dow, 0, 6) then
      candidate := (date_trunc('day', candidate_local) + interval '1 day') at time zone tz;
      continue;
    end if;

    if not public.cron_field_matches(hour_part, candidate_hour, 0, 23) then
      candidate := (date_trunc('hour', candidate_local) + interval '1 hour') at time zone tz;
      continue;
    end if;

    if not public.cron_field_matches(minute_part, candidate_min, 0, 59) then
      candidate := candidate + interval '1 minute';
      continue;
    end if;

    return candidate;
  end loop;
end;
$$;

revoke all on function public.next_cron_fire(text, text, timestamptz) from public;
revoke all on function public.next_cron_fire(text, text, timestamptz) from anon;
grant execute on function public.next_cron_fire(text, text, timestamptz) to authenticated, service_role;

-- ============================================================
-- 3. clone_template_to_card
-- ============================================================

-- Clones a schedule's card_template JSONB into a fresh card in the
-- target project with the bot user as assignee, then directly invokes
-- dispatch_agent_run to enqueue the run.
--
-- Why explicit dispatch instead of relying on cards_assignee_dispatch:
-- Phase 2a's trigger fires only on UPDATE OF assignee_user_id. A fresh
-- card inserted with assignee_user_id = bot_user_id would not fire it.
-- Rather than INSERT-then-UPDATE (extra round trip + audit churn) or
-- broaden the trigger to INSERT (changes Phase 2a's contract), we just
-- invoke dispatch_agent_run from here. The trigger remains the entry
-- point for in-UI reassignment; clone_template_to_card is the entry
-- point for schedule-fire — both paths converge at dispatch_agent_run.
--
-- Template shape (per PRD §22.3):
--   {"title": "...", "body_md": "...", "tags": [...], "priority_option_id": "..." }
--
-- Placeholder substitution is intentionally minimal in v1: ${date} and
-- ${week} resolve in the workspace's effective tz (UTC for v1 — Phase 5
-- will plumb org timezone). Custom placeholders like ${crash_log_source_url}
-- are baked into the template at the +New Task modal save time, not
-- expanded here.
--
-- The bot user is auto-added as a project member if missing — the
-- dispatch trigger / dispatch RPC require the assignee to be RLS-visible
-- to the project, and a service_role-only insert is the cleanest place
-- to enforce this invariant.
create or replace function public.clone_template_to_card(
  template jsonb,
  target_project_id uuid,
  target_assignee_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  project_row public.projects%rowtype;
  resolved_persona_id uuid;
  card_title text;
  card_body text;
  allocated_card_number integer;
  new_card_id uuid;
  today_date text := to_char(timezone('utc', now()), 'YYYY-MM-DD');
  today_week text := to_char(timezone('utc', now()), 'IYYY-"W"IW');
begin
  if template is null or jsonb_typeof(template) <> 'object' then
    raise exception 'clone_template_to_card: template must be a JSON object.';
  end if;
  if target_project_id is null then
    raise exception 'clone_template_to_card: target_project_id is required.';
  end if;
  if target_assignee_user_id is null then
    raise exception 'clone_template_to_card: target_assignee_user_id is required.';
  end if;

  select * into project_row from public.projects where id = target_project_id;
  if project_row.id is null then
    raise exception 'clone_template_to_card: project % not found.', target_project_id;
  end if;

  -- Map bot user → persona so dispatch_agent_run can fire below.
  -- Schedules MUST target a bot user; otherwise the run can't be
  -- attributed to a persona.
  select id into resolved_persona_id
  from public.ai_personas
  where agent_user_id = target_assignee_user_id
  limit 1;

  if resolved_persona_id is null then
    raise exception 'clone_template_to_card: assignee % is not a provisioned bot user.', target_assignee_user_id;
  end if;

  card_title := coalesce(template->>'title', 'Scheduled task');
  card_body := template->>'body_md';

  card_title := replace(card_title, '${date}', today_date);
  card_title := replace(card_title, '${week}', today_week);
  if card_body is not null then
    card_body := replace(card_body, '${date}', today_date);
    card_body := replace(card_body, '${week}', today_week);
  end if;

  -- Atomic project_card_number bump (mirrors create_card pattern).
  update public.projects
  set next_card_number = next_card_number + 1
  where id = target_project_id
  returning next_card_number - 1 into allocated_card_number;

  -- Bot user must be a project member or downstream RLS will hide the
  -- card from realtime subscriptions. Idempotent.
  insert into public.project_members (project_id, user_id, role)
  values (target_project_id, target_assignee_user_id, 'member'::public.scope_access_role)
  on conflict (project_id, user_id) do nothing;

  insert into public.cards (
    project_id,
    project_card_number,
    title,
    body_md,
    assignee_user_id,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    target_project_id,
    allocated_card_number,
    card_title,
    card_body,
    target_assignee_user_id,
    coalesce(auth.uid(), target_assignee_user_id),
    coalesce(auth.uid(), target_assignee_user_id)
  )
  returning id into new_card_id;

  -- Explicit dispatch — the cards_assignee_dispatch trigger fires only
  -- on UPDATE, so a fresh INSERT with assignee_user_id set won't trip
  -- it. Bypassing the trigger here keeps the schedule-fire path single-
  -- query and avoids an INSERT-then-UPDATE round trip.
  perform public.dispatch_agent_run(
    target_card_id => new_card_id,
    target_persona_id => resolved_persona_id,
    target_dispatch_reason => 'schedule'
  );

  return new_card_id;
end;
$$;

revoke all on function public.clone_template_to_card(jsonb, uuid, uuid) from public;
revoke all on function public.clone_template_to_card(jsonb, uuid, uuid) from anon;
grant execute on function public.clone_template_to_card(jsonb, uuid, uuid) to authenticated, service_role;

-- ============================================================
-- 4. approve_tool_call (Phase 2b stub)
-- ============================================================

-- Atomic transition of an awaiting_approval tool call to executed.
-- For Phase 2b, the actual tool execution is stubbed (raises a notice).
-- Phase 2c replaces the stub with real dispatch via a SECURITY DEFINER
-- internal function that the edge worker also calls.
--
-- Idempotency contract (PRD §8.1):
--   - status='executed' → silent return (second click after success)
--   - status='rejected'/'expired' → raise tool_call_no_longer_pending
--   - status='awaiting_approval' → execute then transition
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

  -- Permission: creator OR project editor OR service_role.
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
    -- Idempotent no-op for second click after success.
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

  -- Phase 2b: tool execution is a no-op stub. Phase 2c replaces this
  -- with the dispatcher that calls the appropriate executor RPC
  -- impersonating persona.agent_user_id via service_role.
  raise notice 'approve_tool_call: tool execution deferred to Phase 2c (run=% idx=% tool=%)',
    run_id, tool_call_index, tool_call_name;

  -- Transition the JSONB. Stamp executed_at + approver. If the caller
  -- supplied edited_args, persist them so the audit shows the edit.
  update public.ai_agent_runs
  set tool_calls = jsonb_set(
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
      )
  where id = run_id;

  if edited_args is not null then
    update public.ai_agent_runs
    set tool_calls = jsonb_set(
          tool_calls,
          array[tool_call_index::text, 'edited_args'],
          edited_args
        )
    where id = run_id;
  end if;
end;
$$;

revoke all on function public.approve_tool_call(uuid, integer, jsonb) from public;
revoke all on function public.approve_tool_call(uuid, integer, jsonb) from anon;
grant execute on function public.approve_tool_call(uuid, integer, jsonb) to authenticated, service_role;

-- ============================================================
-- 5. reject_tool_call
-- ============================================================

create or replace function public.reject_tool_call(
  run_id uuid,
  tool_call_index integer,
  reason text default null
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
  caller_user_id uuid;
  caller_can_reject boolean := false;
begin
  if run_id is null then
    raise exception 'reject_tool_call: run_id is required.';
  end if;
  if tool_call_index is null or tool_call_index < 0 then
    raise exception 'reject_tool_call: tool_call_index must be >= 0.';
  end if;

  caller_user_id := auth.uid();

  select * into run_row
  from public.ai_agent_runs
  where id = run_id
  for update;

  if run_row.id is null then
    raise exception 'reject_tool_call: run % not found.', run_id;
  end if;

  if caller_user_id is null then
    caller_can_reject := true;
  elsif run_row.created_by_user_id = caller_user_id then
    caller_can_reject := true;
  elsif run_row.project_id is not null
        and public.can_edit_project(run_row.project_id, caller_user_id) then
    caller_can_reject := true;
  end if;

  if not caller_can_reject then
    raise exception 'You do not have permission to reject tool calls on this run.';
  end if;

  if jsonb_typeof(run_row.tool_calls) <> 'array' then
    raise exception 'reject_tool_call: run % has no tool_calls array.', run_id;
  end if;

  tool_call := run_row.tool_calls -> tool_call_index;
  if tool_call is null then
    raise exception 'reject_tool_call: tool_call index % out of range for run %.',
      tool_call_index, run_id;
  end if;

  tool_call_status := tool_call ->> 'status';

  if tool_call_status = 'rejected' then
    return;
  end if;

  if tool_call_status in ('executed', 'expired') then
    raise exception 'tool_call_no_longer_pending'
      using detail = format(
        'tool call %s on run %s is in terminal state %s', tool_call_index, run_id, tool_call_status
      );
  end if;

  if tool_call_status <> 'awaiting_approval' then
    raise exception 'reject_tool_call: tool call % on run % has unexpected status %.',
      tool_call_index, run_id, coalesce(tool_call_status, 'null');
  end if;

  update public.ai_agent_runs
  set tool_calls = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              tool_calls,
              array[tool_call_index::text, 'status'],
              to_jsonb('rejected'::text)
            ),
            array[tool_call_index::text, 'rejected_at'],
            to_jsonb(timezone('utc', now()))
          ),
          array[tool_call_index::text, 'rejected_by_user_id'],
          case
            when caller_user_id is null then 'null'::jsonb
            else to_jsonb(caller_user_id)
          end
        ),
        array[tool_call_index::text, 'rejection_reason'],
        case
          when reason is null then 'null'::jsonb
          else to_jsonb(reason)
        end
      )
  where id = run_id;
end;
$$;

revoke all on function public.reject_tool_call(uuid, integer, text) from public;
revoke all on function public.reject_tool_call(uuid, integer, text) from anon;
grant execute on function public.reject_tool_call(uuid, integer, text) to authenticated, service_role;

-- ============================================================
-- 6. retry_agent_run
-- ============================================================

-- Duplicates a failed/cancelled run with previous_run_id linking the
-- chain. Idempotent: if a non-failed/cancelled child already exists,
-- returns its id rather than creating a second.
--
-- Pending tool calls on the prior run transition to 'expired' with
-- reason='superseded_by_retry' so the action bar UI knows not to keep
-- showing them.
create or replace function public.retry_agent_run(prior_run_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  prior_row public.ai_agent_runs%rowtype;
  caller_user_id uuid;
  caller_can_retry boolean := false;
  existing_child_id uuid;
  new_run_id uuid;
  expired_tool_calls jsonb;
  call_entry jsonb;
  call_status text;
  expired_at_iso jsonb := to_jsonb(timezone('utc', now()));
begin
  if prior_run_id is null then
    raise exception 'retry_agent_run: prior_run_id is required.';
  end if;

  caller_user_id := auth.uid();

  select * into prior_row
  from public.ai_agent_runs
  where id = prior_run_id
  for update;

  if prior_row.id is null then
    raise exception 'retry_agent_run: prior run % not found.', prior_run_id;
  end if;

  if caller_user_id is null then
    caller_can_retry := true;
  elsif prior_row.created_by_user_id = caller_user_id then
    caller_can_retry := true;
  elsif prior_row.project_id is not null
        and public.can_edit_project(prior_row.project_id, caller_user_id) then
    caller_can_retry := true;
  end if;

  if not caller_can_retry then
    raise exception 'You do not have permission to retry this run.';
  end if;

  if prior_row.status not in ('failed', 'cancelled') then
    raise exception 'retry_agent_run: prior run % has status % (must be failed or cancelled).',
      prior_run_id, prior_row.status;
  end if;

  -- Idempotency: if a non-terminal child already exists, return it.
  select id into existing_child_id
  from public.ai_agent_runs
  where previous_run_id = prior_run_id
    and status not in ('failed', 'cancelled')
  order by created_at desc
  limit 1;

  if existing_child_id is not null then
    return existing_child_id;
  end if;

  -- Expire any awaiting_approval tool calls on the prior run.
  if jsonb_typeof(prior_row.tool_calls) = 'array' then
    expired_tool_calls := '[]'::jsonb;
    for call_entry in select jsonb_array_elements(prior_row.tool_calls)
    loop
      call_status := call_entry ->> 'status';
      if call_status = 'awaiting_approval' then
        call_entry := jsonb_set(call_entry, '{status}', to_jsonb('expired'::text));
        call_entry := jsonb_set(call_entry, '{expired_reason}', to_jsonb('superseded_by_retry'::text));
        call_entry := jsonb_set(call_entry, '{expired_at}', expired_at_iso);
      end if;
      expired_tool_calls := expired_tool_calls || jsonb_build_array(call_entry);
    end loop;

    update public.ai_agent_runs
    set tool_calls = expired_tool_calls
    where id = prior_run_id;
  end if;

  -- Insert the new run via dispatch_agent_run for the validation +
  -- idempotency + notify path. Pass previous_run_id so retry-chain
  -- depth checks fire correctly.
  if prior_row.card_id is null then
    raise exception 'retry_agent_run: prior run % has no card to retry against.', prior_run_id;
  end if;

  new_run_id := public.dispatch_agent_run(
    target_card_id => prior_row.card_id,
    target_persona_id => prior_row.persona_id,
    target_dispatch_reason => 'manual',
    target_prompt => prior_row.prompt,
    target_previous_run_id => prior_run_id
  );

  return new_run_id;
end;
$$;

revoke all on function public.retry_agent_run(uuid) from public;
revoke all on function public.retry_agent_run(uuid) from anon;
grant execute on function public.retry_agent_run(uuid) to authenticated, service_role;

-- ============================================================
-- 7. update_agent_schedule
-- ============================================================

-- Owner-or-editor mutation surface for ai_agent_schedules. All param
-- fields are optional — pass null to leave a field unchanged. Cron
-- changes recompute next_run_at via next_cron_fire (which validates
-- the new expression at parse time).
create or replace function public.update_agent_schedule(
  schedule_id uuid,
  new_template jsonb default null,
  new_cron_expression text default null,
  new_timezone text default null,
  new_persona_id uuid default null,
  new_target_project_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  schedule_row public.ai_agent_schedules%rowtype;
  caller_user_id uuid;
  caller_can_edit boolean := false;
  resolved_cron text;
  resolved_tz text;
  resolved_persona_id uuid;
  resolved_target_project_id uuid;
  persona_row public.ai_personas%rowtype;
  recomputed_next_run timestamptz;
begin
  if schedule_id is null then
    raise exception 'update_agent_schedule: schedule_id is required.';
  end if;

  caller_user_id := auth.uid();

  select * into schedule_row
  from public.ai_agent_schedules
  where id = schedule_id
  for update;

  if schedule_row.id is null then
    raise exception 'update_agent_schedule: schedule % not found.', schedule_id;
  end if;

  if caller_user_id is null then
    caller_can_edit := true;
  elsif schedule_row.created_by_user_id = caller_user_id then
    caller_can_edit := true;
  elsif schedule_row.target_project_id is not null
        and public.can_edit_project(schedule_row.target_project_id, caller_user_id) then
    caller_can_edit := true;
  end if;

  if not caller_can_edit then
    raise exception 'You do not have permission to update this schedule.';
  end if;

  resolved_cron := coalesce(new_cron_expression, schedule_row.cron_expression);
  resolved_tz := coalesce(new_timezone, schedule_row.timezone);
  resolved_persona_id := coalesce(new_persona_id, schedule_row.persona_id);
  resolved_target_project_id := coalesce(new_target_project_id, schedule_row.target_project_id);

  if new_persona_id is not null then
    select * into persona_row from public.ai_personas where id = new_persona_id;
    if persona_row.id is null then
      raise exception 'update_agent_schedule: persona % not found.', new_persona_id;
    end if;
    if persona_row.role not in ('assistant', 'monitor') then
      raise exception 'update_agent_schedule: persona % role % is not dispatchable.',
        persona_row.slug, persona_row.role;
    end if;
    if persona_row.organization_id <> schedule_row.organization_id then
      raise exception 'update_agent_schedule: persona organization mismatch.';
    end if;
  end if;

  -- If the cron or tz changed, recompute next_run_at.
  if new_cron_expression is not null or new_timezone is not null then
    recomputed_next_run := public.next_cron_fire(resolved_cron, resolved_tz, timezone('utc', now()));
    if recomputed_next_run is null then
      raise exception 'update_agent_schedule: cron expression % yields no fire time within 1 year.',
        resolved_cron;
    end if;
  else
    recomputed_next_run := schedule_row.next_run_at;
  end if;

  update public.ai_agent_schedules
  set card_template = coalesce(new_template, schedule_row.card_template),
      cron_expression = resolved_cron,
      timezone = resolved_tz,
      persona_id = resolved_persona_id,
      target_project_id = resolved_target_project_id,
      next_run_at = recomputed_next_run,
      updated_at = timezone('utc', now())
  where id = schedule_id;
end;
$$;

revoke all on function public.update_agent_schedule(uuid, jsonb, text, text, uuid, uuid) from public;
revoke all on function public.update_agent_schedule(uuid, jsonb, text, text, uuid, uuid) from anon;
grant execute on function public.update_agent_schedule(uuid, jsonb, text, text, uuid, uuid) to authenticated, service_role;

-- ============================================================
-- 8. ai_agent_schedules_tick — pg_cron tick body
-- ============================================================

-- Scans for due, unpaused schedules every minute (batch cap 50 per tick).
-- For each: clones the template into a fresh card with the bot user as
-- assignee — this fires cards_assignee_dispatch which enqueues the run.
-- Then advances next_run_at via next_cron_fire.
--
-- Resilience: schedules whose persona is missing or unprovisioned are
-- auto-paused with a warning so the tick doesn't hot-loop on them.
-- Other clone failures log a warning but still advance next_run_at to
-- avoid the same scenario.
create or replace function public.ai_agent_schedules_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  due_schedule public.ai_agent_schedules%rowtype;
  persona_row public.ai_personas%rowtype;
  recomputed_next_run timestamptz;
  max_per_tick integer := 50;
  tick_now timestamptz := timezone('utc', now());
begin
  for due_schedule in
    select *
    from public.ai_agent_schedules
    where is_paused = false
      and next_run_at <= tick_now
    order by next_run_at
    limit max_per_tick
    for update skip locked
  loop
    select * into persona_row
    from public.ai_personas
    where id = due_schedule.persona_id;

    if persona_row.id is null or persona_row.agent_user_id is null then
      update public.ai_agent_schedules
      set is_paused = true, updated_at = timezone('utc', now())
      where id = due_schedule.id;
      raise warning 'ai_agent_schedules_tick: paused schedule % — persona missing or unprovisioned.',
        due_schedule.id;
      continue;
    end if;

    if due_schedule.target_project_id is null then
      update public.ai_agent_schedules
      set is_paused = true, updated_at = timezone('utc', now())
      where id = due_schedule.id;
      raise warning 'ai_agent_schedules_tick: paused schedule % — no target_project_id.',
        due_schedule.id;
      continue;
    end if;

    begin
      perform public.clone_template_to_card(
        template => due_schedule.card_template,
        target_project_id => due_schedule.target_project_id,
        target_assignee_user_id => persona_row.agent_user_id
      );
    exception
      when others then
        raise warning 'ai_agent_schedules_tick: clone failed for schedule %: %',
          due_schedule.id, sqlerrm;
    end;

    -- Compute next fire even if clone failed — otherwise the same broken
    -- schedule would be retried every minute.
    recomputed_next_run := public.next_cron_fire(
      due_schedule.cron_expression,
      due_schedule.timezone,
      tick_now
    );

    update public.ai_agent_schedules
    set last_run_at = tick_now,
        next_run_at = coalesce(recomputed_next_run, tick_now + interval '1 day'),
        updated_at = tick_now
    where id = due_schedule.id;
  end loop;
end;
$$;

revoke all on function public.ai_agent_schedules_tick() from public;
revoke all on function public.ai_agent_schedules_tick() from anon;
revoke all on function public.ai_agent_schedules_tick() from authenticated;
grant execute on function public.ai_agent_schedules_tick() to service_role;

-- ============================================================
-- 9. pg_cron schedule — every minute
-- ============================================================

-- Idempotent re-schedule. Mirrors drift-watcher-hourly's pattern. The
-- tick is in-database (no net.http_post round-trip needed); cron just
-- fires the function on a one-minute cadence.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'ai-agent-schedules-tick') then
    perform cron.unschedule('ai-agent-schedules-tick');
  end if;
end
$$;

select cron.schedule(
  'ai-agent-schedules-tick',
  '* * * * *',
  $cron$
  select public.ai_agent_schedules_tick();
  $cron$
);
