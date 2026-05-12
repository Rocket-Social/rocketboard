-- Inbox foundation: per-user notifications + per-user inbox preferences.
-- The `notifications` table is the data backbone for an upcoming Inbox surface
-- and for AI-agent run completions, drift nudges, mentions, assignments, and
-- comment-on-owned-card alerts. All inserts route through service_role / RPCs
-- (added in a follow-up) to enforce dedup + self-notify prevention; clients
-- read their own rows and toggle read_at / archived_at.

-- ============================================================
-- notifications
-- ============================================================

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  card_id uuid references public.cards(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  origin_user_id uuid references auth.users(id) on delete set null,
  origin_run_id uuid,
  read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint notifications_kind_check check (
    kind in (
      'mention',
      'assignment',
      'comment_on_owned_card',
      'drift_nudge',
      'run_completed',
      'run_awaiting_approval'
    )
  )
);

-- Inbox query: list a user's notifications newest-first, with unread surfaced
-- by the read_at column. The composite index covers the canonical
-- "where user_id = $1 order by created_at desc" query and supports
-- "and read_at is null" filtering without a second scan.
create index notifications_user_read_created_idx
  on public.notifications (user_id, read_at, created_at desc);

-- Dedup probe: the insert RPC (follow-up migration) checks for a recent
-- (user_id, kind, link) tuple within a rolling window. This composite
-- index makes that probe O(log n) per insert.
create index notifications_dedup_probe_idx
  on public.notifications (user_id, kind, link, created_at desc);

-- Optional drilldowns by org / project / card. Lightweight; matches the
-- expected access patterns for "all notifications about card X" or for
-- org-scoped admin tooling later.
create index notifications_org_created_idx
  on public.notifications (organization_id, created_at desc);

create index notifications_card_created_idx
  on public.notifications (card_id, created_at desc)
  where card_id is not null;

alter table public.notifications enable row level security;

-- Authenticated users see only their own notifications.
create policy notifications_select_self on public.notifications
  for select
  to authenticated
  using (user_id = auth.uid());

-- Authenticated users can mark their own notifications read or archived.
-- Other column edits are rejected by the WITH CHECK clause (user_id stays
-- self) and by the lack of an INSERT policy (creation is service-role only).
create policy notifications_update_self on public.notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No INSERT policy for authenticated. Inserts come from the upcoming
-- public.insert_notification RPC running as service_role.

revoke all on table public.notifications from public;
grant select, update on table public.notifications to authenticated;

-- ============================================================
-- inbox_preferences
-- ============================================================

create table public.inbox_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_kinds text[] not null default '{}',
  push_kinds text[] not null default '{}',
  digest_frequency text not null default 'never',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint inbox_preferences_digest_frequency_check
    check (digest_frequency in ('never', 'daily', 'weekly'))
);

create trigger set_inbox_preferences_updated_at
  before update on public.inbox_preferences
  for each row execute function public.set_updated_at();

alter table public.inbox_preferences enable row level security;

create policy inbox_preferences_select_self on public.inbox_preferences
  for select
  to authenticated
  using (user_id = auth.uid());

create policy inbox_preferences_insert_self on public.inbox_preferences
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy inbox_preferences_update_self on public.inbox_preferences
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy inbox_preferences_delete_self on public.inbox_preferences
  for delete
  to authenticated
  using (user_id = auth.uid());

revoke all on table public.inbox_preferences from public;
grant select, insert, update, delete on table public.inbox_preferences to authenticated;
