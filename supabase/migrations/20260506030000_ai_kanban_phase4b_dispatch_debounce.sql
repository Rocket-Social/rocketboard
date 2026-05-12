-- Wave 2 AI Kanban — Phase 4 PR 4-B (1/2): dispatch trigger upgrades.
--
-- Decisions reflected here:
--   D2  — 60s debounce on the `cards_after_assignee_change_dispatch`
--         trigger so the rapid drop-wrong-then-correct flow doesn't
--         double-dispatch (and burn 2x tokens). When the same
--         (card_id, persona_id) already has a non-terminal run created
--         in the last 60 seconds, the trigger no-ops.
--   D14 — Cancel-on-reassign: when the assignee is being moved AWAY
--         from a persona's bot user (and the new value is either null
--         or a different agent / human), cancel any non-terminal run
--         on the OLD `(card, persona)` pair before dispatching the
--         new one. Keeps a single agent active per card during a
--         Sara → Andy flip.
--
-- The trigger remains AFTER UPDATE OF assignee_user_id; only the
-- function body changes. Idempotent via `create or replace`.

set search_path = public;

create or replace function public.cards_after_assignee_change_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matching_persona public.ai_personas%rowtype;
  prior_persona public.ai_personas%rowtype;
  recent_run_id uuid;
begin
  -- No-op when the column didn't actually change.
  if old.assignee_user_id is not distinct from new.assignee_user_id then
    return null;
  end if;

  -- D14 cancel-on-reassign: if the OLD assignee was a persona's bot
  -- user, cancel any non-terminal runs for that persona on this card
  -- before dispatching whatever the NEW assignee triggers. Keeps the
  -- "one active agent per card" invariant during a Sara → Andy flip
  -- AND during a Sara → human-or-null reassignment.
  if old.assignee_user_id is not null then
    select * into prior_persona
    from public.ai_personas
    where agent_user_id = old.assignee_user_id
    limit 1;

    if prior_persona.id is not null then
      for recent_run_id in
        select run.id
        from public.ai_agent_runs run
        where run.card_id = new.id
          and run.persona_id = prior_persona.id
          and run.status in ('queued', 'running', 'awaiting_approval')
      loop
        begin
          perform public.cancel_agent_run(recent_run_id, 'reassigned');
        exception
          when others then
            -- Swallow inside the trigger so a card update doesn't fail
            -- because cancel raised. The new dispatch still proceeds.
            raise warning 'cards_after_assignee_change_dispatch: cancel failed for run %: %',
              recent_run_id, sqlerrm;
        end;
      end loop;
    end if;
  end if;

  -- No-op when assignee was cleared (after handling the cancel above).
  if new.assignee_user_id is null then
    return null;
  end if;

  -- Resolve the NEW assignee → persona via the agent_user_id column.
  -- Non-agent assignees produce no row here (REG-2 invariant).
  select * into matching_persona
  from public.ai_personas
  where agent_user_id = new.assignee_user_id
  limit 1;

  if matching_persona.id is null then
    return null;
  end if;

  -- D2 60s debounce: if the same (card, persona) already has a
  -- non-terminal run created within the last 60 seconds, treat this
  -- update as a re-dispatch and skip. The user can still force a
  -- re-run via retry_agent_run from the UI.
  if exists (
    select 1
    from public.ai_agent_runs run
    where run.card_id = new.id
      and run.persona_id = matching_persona.id
      and run.status in ('queued', 'running', 'awaiting_approval')
      and run.created_at > now() - interval '60 seconds'
  ) then
    return null;
  end if;

  begin
    perform public.dispatch_agent_run(
      target_card_id => new.id,
      target_persona_id => matching_persona.id,
      target_dispatch_reason => 'assignee_changed'
    );
  exception
    when others then
      raise warning 'cards_after_assignee_change_dispatch: dispatch failed for card % persona %: %',
        new.id, matching_persona.id, sqlerrm;
  end;

  return null;
end;
$$;

-- The trigger registration is unchanged (still AFTER UPDATE OF
-- assignee_user_id). Re-create-if-missing for fresh-DB safety.
drop trigger if exists cards_assignee_dispatch on public.cards;
create trigger cards_assignee_dispatch
  after update of assignee_user_id on public.cards
  for each row
  execute function public.cards_after_assignee_change_dispatch();
