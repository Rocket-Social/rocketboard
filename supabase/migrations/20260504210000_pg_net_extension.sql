-- Enable the pg_net extension.
--
-- The drift-watcher cron schedule (20260504110000) calls `net.http_post` to
-- invoke the edge function every hour. `pg_net` is what provides the `net`
-- schema and that function. Local Supabase auto-installs pg_net for
-- developer convenience, but Supabase Cloud projects must enable it
-- explicitly — without this migration, every hourly tick errors with
-- `schema "net" does not exist` on a fresh project.
--
-- Caught 2026-05-04 during staging verification of the drift watcher
-- (PR #455 / #456 / #457). Staging needed a manual Studio toggle to get
-- past the verification curl; this migration lets prod land cleanly
-- without the same manual click and protects any future fresh tenant.
--
-- Idempotent — `if not exists` is a no-op when the extension is already
-- installed (which is the case on staging post-manual-toggle and on the
-- local Supabase stack).

create extension if not exists pg_net with schema extensions;
