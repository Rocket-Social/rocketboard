-- Consolidation cutover 2026-04-17
--
-- One-time pre-launch cleanup:
--   1. The 4 late migrations below were folded into their baselines and
--      deleted from source. Prod/staging had records of them in
--      supabase_migrations.schema_migrations; without stripping those,
--      `supabase db push` fails with "remote has migrations not in local".
--   2. billing_contacts and wiki_attachments were dropped from the
--      baselines because they had no readers/writers anywhere.
--
-- Designed to be safe as a permanent pre-`db push` hook on every deploy:
--   - On a brand-new DB (no schema_migrations table), skip cleanly.
--   - On a pre-cutover DB, strip records + drop tables.
--   - On an already-cutover DB, DELETE is 0 rows and DROP IF EXISTS is
--     a no-op. The script stays a no-op forever after.
--
-- No feature-presence checks — those would couple future deploys to the
-- current function text, which would break legitimate future edits.

do $$
declare
  late_present int;
  has_duplicate_cards boolean;
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'supabase_migrations'
      and table_name = 'schema_migrations'
  ) then
    -- Fresh DB — let the subsequent db push create everything.
    return;
  end if;

  select count(*) into late_present
  from supabase_migrations.schema_migrations
  where version in (
    '20260414212954',
    '20260417000000',
    '20260418000000',
    '20260418000001'
  );

  -- Lagging-DB guard (emits NOTICE, does not block): warn loudly if this
  -- looks like a long-lived DB that has baselines applied but never
  -- received the 4 folded migrations. That's the one scenario where
  -- stripping records alone leaves the schema missing features the app
  -- now expects. Operators see the NOTICE in the deploy log and can
  -- apply the folded SQL manually. We deliberately don't fail here —
  -- the probe can't be made forward-compatible with later legitimate
  -- edits to those functions (see PR #343 discussion for the tradeoff).
  select exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'duplicate_cards'
  ) into has_duplicate_cards;

  if late_present = 0 and not has_duplicate_cards then
    raise notice
      'Consolidation cutover ran on a DB with 0 late-migration records AND missing duplicate_cards. This DB may be lagging — the cutover will not restore the folded SQL. Apply the bodies from 00000000000001_cards.sql, 00000000000006_initiatives.sql, 00000000000012_wiki.sql manually if runtime errors follow.';
  end if;

  delete from supabase_migrations.schema_migrations
  where version in (
    '20260414212954',
    '20260417000000',
    '20260418000000',
    '20260418000001'
  );

  -- Dead tables: zero readers/writers anywhere in the codebase.
  drop table if exists public.billing_contacts cascade;

  -- wiki_attachments had 3 storage.objects policies that need to go
  -- before the table itself. Supabase blocks raw DELETE on storage,
  -- so the empty 'wiki-attachments' bucket is left behind (0 bytes).
  drop policy if exists wiki_attachments_storage_select on storage.objects;
  drop policy if exists wiki_attachments_storage_insert on storage.objects;
  drop policy if exists wiki_attachments_storage_delete on storage.objects;
  drop table if exists public.wiki_attachments cascade;
end $$;
