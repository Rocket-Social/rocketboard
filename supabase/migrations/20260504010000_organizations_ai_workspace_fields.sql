-- Org-level AI controls. Two new columns on `organizations`:
--
-- - `ai_workspace_guidance` is free-form text that surfaces to every
--   AI persona acting on behalf of the org. Mirrors Linear's workspace
--   agent guidance — admins write a paragraph (e.g. "we ship daily; never
--   schedule cards >2 days out") that the dispatch path injects into the
--   system prompt for every run in this org.
-- - `drift_watcher_enabled` is the single org-level toggle for the
--   upcoming Quality Drift Watcher background agent. Off by default; flips
--   on from Org Settings to start the hourly scan that posts drift_nudge
--   notifications to card owners.

alter table public.organizations
  add column if not exists ai_workspace_guidance text,
  add column if not exists drift_watcher_enabled boolean not null default false;
