-- Wave 1 Batch 2 PR B — `/inbox` surface enablement.
--
-- 1) Enroll `public.notifications` in the `supabase_realtime` publication
--    so the inbox + sidebar badge can react to INSERT/UPDATE/DELETE without
--    polling. Idempotent guard so the migration is replay-safe.
--
-- 2) Tighten authenticated write surface: the existing
--    `notifications_update_self` RLS policy lets a user PostgREST-update
--    any column on their own row (kind, link, body, organization_id, etc.).
--    The inbox UI only flips read_at + archived_at, so revoke the broad
--    UPDATE grant and re-issue a column-level UPDATE on (read_at,
--    archived_at) only. PostgREST honors column-level GRANTs and returns
--    a 403 on attempts to mutate other columns. Smaller diff than wrapping
--    each mutation in a SECURITY DEFINER RPC and matches the policy-first
--    pattern Wave 2 uses for similar tables.

-- ---------------------------------------------------------------
-- 1. Realtime publication
-- ---------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end$$;

-- ---------------------------------------------------------------
-- 2. Column-level write grant
-- ---------------------------------------------------------------

revoke update on table public.notifications from authenticated;
grant select on table public.notifications to authenticated;
grant update (read_at, archived_at) on table public.notifications
  to authenticated;
