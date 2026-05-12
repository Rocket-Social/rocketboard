-- Wave 2 AI Kanban — Phase 4 PR 4-A
--
-- Extends `public.get_card_detail` so the CardSheet can render
-- streaming agent comments with their associated tool-call audit and
-- show a status pill above the title sourced from the latest run for
-- the card. Also enables Realtime for `card_comments` and
-- `ai_agent_runs` so the streaming → final transition animates without
-- manual reload (D15).
--
-- Decisions reflected here (from ~/.claude/plans/ai-kanban-phase-4-2026-05-05.md):
--   D3 — agent_run_context is a CASE-guarded inline join: the
--        ai_personas / ai_agent_runs lookup only fires when the
--        comment is authored by an agent's synthetic auth.users row,
--        so the common (human-authored) case stays a single table
--        scan.
--   D4 — agent_run_summary picks live runs first
--        (queued / running / awaiting_approval), then the latest
--        terminal run finished within the last 24h. Stale terminal
--        runs are intentionally suppressed so the pill doesn't lie.
--   D5 — Both extensions ship in PR 4-A so PR 4-B's frontend can
--        consume agent_run_summary without a sibling SQL change.
--   D13 — All new fields are optional/nullable so a frontend deploy
--         can lead the SQL deploy (and vice versa) without breakage.
--   D15 — Idempotent realtime publication add via pg_publication_tables
--         lookup. Without this the streaming UX no-ops silently.
--
-- The function returns a wider table (one new top-level column,
-- `agent_run_summary`), so we drop+create rather than `create or
-- replace`.

set search_path = public;

drop function if exists public.get_card_detail(uuid);

create function public.get_card_detail(target_card_id uuid)
returns table(
  id uuid,
  project_id uuid,
  project_key text,
  project_card_number integer,
  card_ref text,
  title text,
  body_md text,
  body_json jsonb,
  status_option_id uuid,
  priority_option_id uuid,
  assignee_name text,
  assignee_user_id uuid,
  start_at timestamptz,
  due_at timestamptz,
  effort numeric,
  group_id uuid,
  group_position integer,
  tags text[],
  status_position integer,
  sprint_id uuid,
  initiative_id uuid,
  created_at timestamptz,
  completed_at timestamptz,
  custom_field_values jsonb,
  comments jsonb,
  attachments jsonb,
  agent_run_summary jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    card.id,
    card.project_id,
    project.project_key,
    card.project_card_number,
    public.format_card_ref(project.project_key, card.project_card_number) as card_ref,
    card.title,
    coalesce(card.body_md, '') as body_md,
    public.coalesce_rich_text_document(card.body_json, card.body_md) as body_json,
    card.status_option_id,
    card.priority_option_id,
    coalesce(assignee.full_name, split_part(assignee.email, '@', 1), 'Unassigned') as assignee_name,
    card.assignee_user_id,
    card.start_at,
    card.due_at,
    card.effort,
    card.group_id,
    card.group_position,
    card.tags,
    card.position as status_position,
    card.sprint_id,
    card.initiative_id,
    card.created_at,
    card.completed_at,
    card.custom_data as custom_field_values,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', comment.id,
            'author_name', coalesce(author.full_name, split_part(author.email, '@', 1), 'Unknown'),
            'author_user_id', comment.created_by_user_id,
            'body_text', comment.body_text,
            'created_at', comment.created_at,
            'is_streaming', comment.is_streaming,
            'agent_run_context', case
              when exists (
                select 1
                from public.ai_personas guard
                where guard.agent_user_id = comment.created_by_user_id
              )
              then (
                select jsonb_build_object(
                  'run_id', run.id,
                  'persona_id', persona.id,
                  'persona_name', persona.name,
                  'persona_accent_color', persona.accent_color,
                  'status', run.status,
                  'tool_calls', coalesce(run.tool_calls, '[]'::jsonb)
                )
                from public.ai_agent_runs run
                left join public.ai_personas persona on persona.id = run.persona_id
                where run.result_comment_id = comment.id
                order by run.created_at desc
                limit 1
              )
              else null
            end
          )
          order by comment.created_at asc, comment.id asc
        )
        from public.card_comments comment
        left join public.profiles author
          on author.user_id = comment.created_by_user_id
        where comment.card_id = card.id
      ),
      '[]'::jsonb
    ) as comments,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', attachment.id,
            'file_name', attachment.file_name,
            'content_type', attachment.content_type,
            'size_bytes', attachment.size_bytes,
            'storage_path', attachment.storage_path,
            'created_at', attachment.created_at,
            'uploaded_by_name', coalesce(attachment_author.full_name, split_part(attachment_author.email, '@', 1), 'Unknown')
          )
          order by attachment.created_at desc, attachment.id desc
        )
        from public.attachments attachment
        left join public.profiles attachment_author
          on attachment_author.user_id = attachment.uploaded_by_user_id
        where attachment.card_id = card.id
      ),
      '[]'::jsonb
    ) as attachments,
    (
      select jsonb_build_object(
        'run_id', run.id,
        'status', run.status,
        'persona_id', persona.id,
        'persona_name', persona.name,
        'persona_accent_color', persona.accent_color
      )
      from public.ai_agent_runs run
      left join public.ai_personas persona on persona.id = run.persona_id
      where run.card_id = card.id
        and (
          run.status in ('queued', 'running', 'awaiting_approval')
          or run.finished_at > now() - interval '24 hours'
        )
      order by
        (run.status in ('queued', 'running', 'awaiting_approval')) desc,
        run.created_at desc
      limit 1
    ) as agent_run_summary
  from public.cards card
  join public.projects project
    on project.id = card.project_id
  left join public.profiles assignee
    on assignee.user_id = card.assignee_user_id
  where card.id = target_card_id
    and public.can_access_project(card.project_id, auth.uid());
$$;

revoke all on function public.get_card_detail(uuid) from public;
revoke all on function public.get_card_detail(uuid) from anon;
grant execute on function public.get_card_detail(uuid) to authenticated;

comment on function public.get_card_detail(uuid) is
  'Card detail RPC. Phase 4 (PR 4-A) extends the comments JSONB with author_user_id, is_streaming, and agent_run_context (CASE-guarded — only fires for agent-authored comments) and adds a top-level agent_run_summary picking the latest non-stale run for the card.';

-- Realtime publication: streaming UX needs subscriptions on
-- card_comments + ai_agent_runs. The clauses below are idempotent so
-- replay against an already-configured DB is a no-op.

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'card_comments'
  ) then
    alter publication supabase_realtime add table public.card_comments;
  end if;
end$$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ai_agent_runs'
  ) then
    alter publication supabase_realtime add table public.ai_agent_runs;
  end if;
end$$;
