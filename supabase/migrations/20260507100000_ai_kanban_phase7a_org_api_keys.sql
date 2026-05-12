-- Wave 2 AI Kanban Phase 7-A — org-scoped API key visibility hardening (D7-4).
--
-- Per Phase 7 plan ~/.claude/plans/ai-kanban-phase-7-2026-05-07.md §1.1.
--
-- Context: the existing `ai-key-manage` edge function already supports saving
-- and clearing org-scoped Anthropic / OpenAI / Google keys (with admin-role
-- enforcement on writes). The `ai_api_keys` table also already has the unique
-- constraints + scope-check needed by the upsert flow. The unfinished piece is
-- READ-side admin gating: today the `ai_api_keys_select` RLS policy lets any
-- org member SELECT org-scoped rows, which lets non-admins infer "is an
-- Anthropic key configured?" via direct PostgREST queries (codex C4).
--
-- D7-4 lock: only admins should know whether org keys exist. This migration
-- splits the SELECT policy so:
--   - personal rows: visible to the owning user (unchanged)
--   - org-scoped rows: visible only to admins of that org
--
-- The edge function's `get_status` action is tightened separately (frontend
-- side) to mirror this for defense in depth.

-- ── ai_api_keys SELECT policy: admin-only for org-scoped rows ─────────────

drop policy if exists ai_api_keys_select on public.ai_api_keys;

create policy ai_api_keys_select
on public.ai_api_keys
for select
to authenticated
using (
  user_id = auth.uid()
  or organization_id in (
    select om.organization_id
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.role = 'admin'
  )
);
