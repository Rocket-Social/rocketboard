-- GitHub: installations, sources, repos, PRs, events, analytics.
-- Canonical greenfield owner file. Modify in place.

create table public.github_installations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  installation_id bigint not null,
  account_login text not null,
  account_type text not null,
  account_avatar_url text,
  permissions jsonb not null default '{}'::jsonb,
  events jsonb not null default '[]'::jsonb,
  installed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint github_installations_workspace_installation_key unique (workspace_id, installation_id)
);

create table public.github_connection_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete cascade,
  scope_type text not null,
  auth_type text not null,
  installation_id bigint not null default 0,
  account_login text not null,
  account_type text not null,
  account_avatar_url text,
  permissions jsonb not null default '{}'::jsonb,
  events jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  installed_by uuid references auth.users(id) on delete set null,
  last_validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint github_connection_sources_scope_check check (scope_type in ('organization', 'personal')),
  constraint github_connection_sources_auth_check check (auth_type in ('pat', 'github_app')),
  constraint github_connection_sources_status_check check (status in ('active', 'error', 'revoked')),
  constraint github_connection_sources_scope_owner_check check (
    (
      scope_type = 'organization'
      and organization_id is not null
      and owner_user_id is null
    )
    or (
      scope_type = 'personal'
      and organization_id is null
      and owner_user_id is not null
    )
  )
);

create table public.github_connection_allowed_repositories (
  id uuid primary key default gen_random_uuid(),
  connection_source_id uuid not null references public.github_connection_sources(id) on delete cascade,
  github_repo_id bigint not null,
  full_name text not null,
  name text not null,
  default_branch text not null default 'main',
  is_private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint github_connection_allowed_repositories_source_repo_key unique (connection_source_id, github_repo_id)
);

create table public.project_github_settings (
  project_id uuid primary key references public.projects(id) on delete cascade,
  connection_source_id uuid references public.github_connection_sources(id) on delete set null,
  auto_transitions_enabled boolean not null default true,
  configured_by uuid references auth.users(id) on delete set null,
  analytics_sprint_length_weeks smallint check (analytics_sprint_length_weeks is null or (analytics_sprint_length_weeks >= 1 and analytics_sprint_length_weeks <= 52)),
  analytics_last_sprint_end_date date,
  analytics_timezone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.github_connection_install_states (
  state text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  return_path text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

alter table public.github_connection_install_states enable row level security;

create policy github_install_states_select_for_requester
on public.github_connection_install_states
for select
to authenticated
using (requested_by = auth.uid());

create policy github_install_states_insert_for_org_admins
on public.github_connection_install_states
for insert
to authenticated
with check (
  requested_by = auth.uid()
  and exists (
    select 1 from public.organization_members om
    where om.organization_id = github_connection_install_states.organization_id
      and om.user_id = auth.uid()
      and om.role = 'admin'
  )
);

create policy github_install_states_update_for_requester
on public.github_connection_install_states
for update
to authenticated
using (requested_by = auth.uid());

create table public.github_repositories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  connection_source_id uuid not null references public.github_connection_sources(id) on delete cascade,
  installation_id uuid references public.github_installations(id) on delete set null,
  github_repo_id bigint not null,
  full_name text not null,
  name text not null,
  default_branch text not null default 'main',
  is_private boolean not null default false,
  color_index smallint not null default 0,
  history_backfilled_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  constraint github_repositories_project_repo_key unique (project_id, github_repo_id),
  constraint github_repositories_color_index_range check (color_index >= 0 and color_index <= 5)
);

create table public.github_commit_daily_rollups (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public.github_repositories(id) on delete cascade,
  activity_date date not null,
  commit_count integer not null default 0,
  computed_timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (repo_id, activity_date)
);

create index idx_github_commit_daily_rollups_repo_date
  on public.github_commit_daily_rollups (repo_id, activity_date);

create table public.github_pull_requests (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public.github_repositories(id) on delete cascade,
  github_pr_id bigint not null,
  number integer not null,
  title text not null,
  body text,
  state text not null default 'open',
  draft boolean not null default false,
  author_login text,
  author_avatar_url text,
  head_ref text,
  base_ref text,
  additions integer not null default 0,
  deletions integer not null default 0,
  review_state text,
  reviewers jsonb not null default '[]'::jsonb,
  checks_status text,
  html_url text not null,
  first_review_submitted_at timestamptz,
  last_review_submitted_at timestamptz,
  review_count integer not null default 0,
  approval_count integer not null default 0,
  changes_requested_count integer not null default 0,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  merged_at timestamptz,
  closed_at timestamptz,
  synced_at timestamptz not null default now(),
  constraint github_prs_repo_pr_key unique (repo_id, github_pr_id),
  constraint github_prs_state_check check (state in ('open', 'closed', 'merged'))
);

create table public.card_github_links (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  pull_request_id uuid not null references public.github_pull_requests(id) on delete cascade,
  link_type text not null default 'auto',
  created_at timestamptz not null default now(),
  constraint card_github_links_card_pr_key unique (card_id, pull_request_id),
  constraint card_github_links_type_check check (link_type in ('auto', 'manual'))
);

create table public.github_events (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public.github_repositories(id) on delete cascade,
  event_type text not null,
  actor_login text,
  actor_avatar_url text,
  pull_request_id uuid references public.github_pull_requests(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  github_created_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index idx_github_installations_workspace
  on public.github_installations (workspace_id);

create unique index idx_github_connection_sources_installation
  on public.github_connection_sources (installation_id)
  where installation_id > 0;

create unique index idx_github_connection_sources_org_auth_account
  on public.github_connection_sources (organization_id, auth_type, account_login)
  where organization_id is not null;

create unique index idx_github_connection_sources_personal_auth_account
  on public.github_connection_sources (owner_user_id, auth_type, account_login)
  where owner_user_id is not null;

create index idx_github_connection_allowed_repositories_source
  on public.github_connection_allowed_repositories (connection_source_id);

create index idx_project_github_settings_source
  on public.project_github_settings (connection_source_id);

create index idx_github_connection_install_states_org
  on public.github_connection_install_states (organization_id);

create index idx_github_repositories_project
  on public.github_repositories (project_id);

create index idx_github_repositories_installation
  on public.github_repositories (installation_id);

create index idx_github_repositories_connection_source
  on public.github_repositories (connection_source_id);

create index idx_github_prs_repo_state
  on public.github_pull_requests (repo_id, state);

create index idx_github_prs_head_ref
  on public.github_pull_requests (head_ref)
  where head_ref is not null;

create index idx_github_prs_synced
  on public.github_pull_requests (repo_id, synced_at);

create index idx_github_prs_repo_created
  on public.github_pull_requests (repo_id, created_at desc);

create index idx_github_prs_repo_merged
  on public.github_pull_requests (repo_id, merged_at desc)
  where merged_at is not null;

create index idx_github_prs_author_login
  on public.github_pull_requests (author_login)
  where author_login is not null;

create index idx_card_github_links_card
  on public.card_github_links (card_id);

create index idx_card_github_links_pr
  on public.card_github_links (pull_request_id);

create index idx_github_events_repo_created
  on public.github_events (repo_id, github_created_at desc);

create index idx_github_events_pr
  on public.github_events (pull_request_id)
  where pull_request_id is not null;

alter table public.github_installations enable row level security;

alter table public.github_connection_sources enable row level security;

alter table public.github_connection_allowed_repositories enable row level security;

alter table public.project_github_settings enable row level security;

alter table public.github_repositories enable row level security;

alter table public.github_pull_requests enable row level security;

alter table public.card_github_links enable row level security;

create policy "project members can view card links"
  on public.card_github_links for select
  using (
    exists (
      select 1 from public.cards c
      where c.id = card_id
        and public.can_access_project(c.project_id)
    )
  );

create policy "project members can insert card links"
  on public.card_github_links for insert
  with check (
    exists (
      select 1 from public.cards c
      where c.id = card_id
        and public.can_edit_project(c.project_id)
    )
  );

create policy "project members can delete card links"
  on public.card_github_links for delete
  using (
    exists (
      select 1 from public.cards c
      where c.id = card_id
        and public.can_edit_project(c.project_id)
    )
  );

alter table public.github_events enable row level security;

alter table public.github_commit_daily_rollups enable row level security;

create policy "workspace members can view installations"
  on public.github_installations for select
  using (public.can_access_workspace(workspace_id));

create policy "workspace admins can insert installations"
  on public.github_installations for insert
  with check (public.can_manage_workspace(workspace_id));

create policy "workspace admins can update installations"
  on public.github_installations for update
  using (public.can_manage_workspace(workspace_id));

create policy "workspace admins can delete installations"
  on public.github_installations for delete
  using (public.can_manage_workspace(workspace_id));

create policy "github sources select"
  on public.github_connection_sources for select
  using (
    (
      scope_type = 'organization'
      and public.can_access_organization(organization_id)
    )
    or (
      scope_type = 'personal'
      and owner_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.project_github_settings project_github_setting
      where project_github_setting.connection_source_id = github_connection_sources.id
        and public.can_access_project(project_github_setting.project_id)
    )
  );

create policy "github sources insert"
  on public.github_connection_sources for insert
  with check (
    (
      scope_type = 'organization'
      and public.can_manage_organization(organization_id)
    )
    or (
      scope_type = 'personal'
      and owner_user_id = auth.uid()
    )
  );

create policy "github sources update"
  on public.github_connection_sources for update
  using (
    (
      scope_type = 'organization'
      and public.can_manage_organization(organization_id)
    )
    or (
      scope_type = 'personal'
      and owner_user_id = auth.uid()
    )
  );

create policy "github sources delete"
  on public.github_connection_sources for delete
  using (
    (
      scope_type = 'organization'
      and public.can_manage_organization(organization_id)
    )
    or (
      scope_type = 'personal'
      and owner_user_id = auth.uid()
    )
  );

create policy "github allowed repositories select"
  on public.github_connection_allowed_repositories for select
  using (
    exists (
      select 1
      from public.github_connection_sources github_connection_source
      where github_connection_source.id = github_connection_allowed_repositories.connection_source_id
        and (
          (
            github_connection_source.scope_type = 'organization'
            and public.can_access_organization(github_connection_source.organization_id)
          )
          or (
            github_connection_source.scope_type = 'personal'
            and github_connection_source.owner_user_id = auth.uid()
          )
          or exists (
            select 1
            from public.project_github_settings project_github_setting
            where project_github_setting.connection_source_id = github_connection_source.id
              and public.can_access_project(project_github_setting.project_id)
          )
        )
    )
  );

create policy "github allowed repositories insert"
  on public.github_connection_allowed_repositories for insert
  with check (
    exists (
      select 1
      from public.github_connection_sources github_connection_source
      where github_connection_source.id = github_connection_allowed_repositories.connection_source_id
        and (
          (
            github_connection_source.scope_type = 'organization'
            and public.can_manage_organization(github_connection_source.organization_id)
          )
          or (
            github_connection_source.scope_type = 'personal'
            and github_connection_source.owner_user_id = auth.uid()
          )
        )
    )
  );

create policy "github allowed repositories update"
  on public.github_connection_allowed_repositories for update
  using (
    exists (
      select 1
      from public.github_connection_sources github_connection_source
      where github_connection_source.id = github_connection_allowed_repositories.connection_source_id
        and (
          (
            github_connection_source.scope_type = 'organization'
            and public.can_manage_organization(github_connection_source.organization_id)
          )
          or (
            github_connection_source.scope_type = 'personal'
            and github_connection_source.owner_user_id = auth.uid()
          )
        )
    )
  );

create policy "github allowed repositories delete"
  on public.github_connection_allowed_repositories for delete
  using (
    exists (
      select 1
      from public.github_connection_sources github_connection_source
      where github_connection_source.id = github_connection_allowed_repositories.connection_source_id
        and (
          (
            github_connection_source.scope_type = 'organization'
            and public.can_manage_organization(github_connection_source.organization_id)
          )
          or (
            github_connection_source.scope_type = 'personal'
            and github_connection_source.owner_user_id = auth.uid()
          )
        )
    )
  );

create policy "project github settings select"
  on public.project_github_settings for select
  using (public.can_access_project(project_id));

create policy "project github settings insert"
  on public.project_github_settings for insert
  with check (public.can_edit_project(project_id));

create policy "project github settings update"
  on public.project_github_settings for update
  using (public.can_edit_project(project_id));

create policy "project github settings delete"
  on public.project_github_settings for delete
  using (public.can_edit_project(project_id));

create policy "project members can view repositories"
  on public.github_repositories for select
  using (public.can_access_project(project_id));

create policy "project admins can insert repositories"
  on public.github_repositories for insert
  with check (public.can_edit_project(project_id));

create policy "project admins can update repositories"
  on public.github_repositories for update
  using (public.can_edit_project(project_id));

create policy "project admins can delete repositories"
  on public.github_repositories for delete
  using (public.can_edit_project(project_id));

create policy "project members can view pull requests"
  on public.github_pull_requests for select
  using (
    exists (
      select 1 from public.github_repositories gr
      where gr.id = repo_id
        and public.can_access_project(gr.project_id)
    )
  );

create policy "project members can view events"
  on public.github_events for select
  using (
    exists (
      select 1 from public.github_repositories gr
      where gr.id = repo_id
        and public.can_access_project(gr.project_id)
    )
  );

create policy "project members can view commit rollups"
  on public.github_commit_daily_rollups for select
  using (
    exists (
      select 1 from public.github_repositories gr
      where gr.id = repo_id
        and public.can_access_project(gr.project_id)
    )
  );

create policy "service role can manage commit rollups"
  on public.github_commit_daily_rollups for all
  to service_role
  using (true)
  with check (true);

create or replace function public.validate_github_repository_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  project_source_id uuid;
  source_scope text;
begin
  select project_github_settings.connection_source_id
  into project_source_id
  from public.project_github_settings
  where project_github_settings.project_id = new.project_id;

  if project_source_id is null then
    raise exception 'Project GitHub source is not configured.';
  end if;

  if new.connection_source_id <> project_source_id then
    raise exception 'Repository must use the project''s configured GitHub source.';
  end if;

  select github_connection_source.scope_type
  into source_scope
  from public.github_connection_sources github_connection_source
  where github_connection_source.id = new.connection_source_id;

  if source_scope = 'organization' then
    if not exists (
      select 1
      from public.github_connection_allowed_repositories allowed_repository
      where allowed_repository.connection_source_id = new.connection_source_id
        and allowed_repository.github_repo_id = new.github_repo_id
    ) then
      raise exception 'Repository is not allowlisted for this organization source.';
    end if;
  end if;

  return new;
end;
$$;

create trigger validate_github_repository_source_trigger
before insert or update on public.github_repositories
for each row
execute function public.validate_github_repository_source();

create or replace function public.get_project_github_pull_requests(target_project_id uuid)
returns table (
  id uuid,
  repo_id uuid,
  github_pr_id bigint,
  number integer,
  title text,
  body text,
  state text,
  draft boolean,
  author_login text,
  author_avatar_url text,
  head_ref text,
  base_ref text,
  additions integer,
  deletions integer,
  review_state text,
  reviewers jsonb,
  checks_status text,
  html_url text,
  created_at timestamptz,
  updated_at timestamptz,
  merged_at timestamptz,
  closed_at timestamptz,
  first_review_submitted_at timestamptz,
  last_review_submitted_at timestamptz,
  review_count integer,
  approval_count integer,
  changes_requested_count integer,
  synced_at timestamptz,
  linked_cards jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pr.id,
    pr.repo_id,
    pr.github_pr_id,
    pr.number,
    pr.title,
    pr.body,
    pr.state,
    pr.draft,
    pr.author_login,
    pr.author_avatar_url,
    pr.head_ref,
    pr.base_ref,
    pr.additions,
    pr.deletions,
    pr.review_state,
    pr.reviewers,
    pr.checks_status,
    pr.html_url,
    pr.created_at,
    pr.updated_at,
    pr.merged_at,
    pr.closed_at,
    pr.first_review_submitted_at,
    pr.last_review_submitted_at,
    pr.review_count,
    pr.approval_count,
    pr.changes_requested_count,
    pr.synced_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', card.id,
            'link_type', card_github_link.link_type,
            'project_card_number', nullif(to_jsonb(card)->>'project_card_number', '')::integer,
            'title', card.title
          )
          order by nullif(to_jsonb(card)->>'project_card_number', '')::integer nulls last, card.created_at, card.id
        )
        from public.card_github_links card_github_link
        join public.cards card
          on card.id = card_github_link.card_id
        where card_github_link.pull_request_id = pr.id
          and card.project_id = target_project_id
      ),
      '[]'::jsonb
    ) as linked_cards
  from public.github_pull_requests pr
  join public.github_repositories gr
    on gr.id = pr.repo_id
  where public.can_access_project(target_project_id, auth.uid())
    and gr.project_id = target_project_id
  order by pr.updated_at desc, pr.created_at desc;
$$;

create or replace function public.get_project_github_cards(target_project_id uuid)
returns table (
  id uuid,
  title text,
  project_card_number integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    card.id,
    card.title,
    nullif(to_jsonb(card)->>'project_card_number', '')::integer as project_card_number
  from public.cards card
  where public.can_access_project(target_project_id, auth.uid())
    and card.project_id = target_project_id
  order by
    nullif(to_jsonb(card)->>'project_card_number', '')::integer nulls last,
    card.created_at asc,
    card.id asc;
$$;

create or replace function public.get_project_github_summary(target_project_id uuid)
returns table (
  open_count bigint,
  needs_review_count bigint,
  stale_count bigint,
  merged_this_week bigint,
  avg_review_hours numeric
)
language sql
stable
as $$
  select
    count(*) filter (where pr.state = 'open') as open_count,
    count(*) filter (where pr.state = 'open' and pr.review_state = 'review_requested') as needs_review_count,
    count(*) filter (where pr.state = 'open' and pr.updated_at < now() - interval '3 days') as stale_count,
    count(*) filter (where pr.merged_at is not null and pr.merged_at >= date_trunc('week', now())) as merged_this_week,
    coalesce(
      round(
        avg(
          extract(epoch from (pr.first_review_submitted_at - pr.created_at)) / 3600.0
        ) filter (
          where pr.first_review_submitted_at is not null
            and pr.created_at >= now() - interval '30 days'
        ),
        1
      ),
      0
    ) as avg_review_hours
  from public.github_pull_requests pr
  join public.github_repositories gr on gr.id = pr.repo_id
  where gr.project_id = target_project_id;
$$;

create or replace function public.auto_link_pr_to_cards(
  target_pr_id uuid,
  target_head_ref text,
  target_body text,
  target_project_id uuid
)
returns setof uuid
language plpgsql
as $$
declare
  combined_text text;
  project_rec record;
  match_pattern text;
  card_number_match text;
  found_card_id uuid;
begin
  select project_key into project_rec
  from public.projects
  where id = target_project_id;

  if project_rec.project_key is null then
    return;
  end if;

  combined_text := coalesce(target_head_ref, '') || ' ' || coalesce(target_body, '');
  match_pattern := '(?i)' || project_rec.project_key || '-(\d+)';

  for card_number_match in
    select (regexp_matches(combined_text, match_pattern, 'gi'))[1]
  loop
    select c.id into found_card_id
    from public.cards c
    where c.project_id = target_project_id
      and c.project_card_number = card_number_match::integer;

    if found_card_id is not null then
      insert into public.card_github_links (card_id, pull_request_id, link_type)
      values (found_card_id, target_pr_id, 'auto')
      on conflict (card_id, pull_request_id) do nothing;

      return next found_card_id;
    end if;
  end loop;
end;
$$;

create or replace function public.link_card_to_pr(
  target_card_id uuid,
  target_pr_id uuid
)
returns uuid
language plpgsql
as $$
declare
  link_id uuid;
begin
  if not exists (
    select 1 from public.cards c
    where c.id = target_card_id
      and public.can_edit_project(c.project_id)
  ) then
    raise exception 'Access denied';
  end if;

  insert into public.card_github_links (card_id, pull_request_id, link_type)
  values (target_card_id, target_pr_id, 'manual')
  on conflict (card_id, pull_request_id) do update set link_type = 'manual'
  returning id into link_id;

  return link_id;
end;
$$;

create or replace function public.unlink_card_from_pr(
  target_card_id uuid,
  target_pr_id uuid
)
returns void
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.cards c
    where c.id = target_card_id
      and public.can_edit_project(c.project_id)
  ) then
    raise exception 'Access denied';
  end if;

  delete from public.card_github_links
  where card_id = target_card_id
    and pull_request_id = target_pr_id;
end;
$$;

create or replace function public.set_project_github_source(
  target_project_id uuid,
  target_connection_source_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  source_rec record;
begin
  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'Access denied';
  end if;

  select *
  into source_rec
  from public.github_connection_sources github_connection_source
  where github_connection_source.id = target_connection_source_id;

  if source_rec.id is null then
    raise exception 'GitHub source not found.';
  end if;

  if source_rec.scope_type = 'organization' and not public.can_access_organization(source_rec.organization_id, auth.uid()) then
    raise exception 'Access denied';
  end if;

  if source_rec.scope_type = 'personal' and source_rec.owner_user_id <> auth.uid() then
    raise exception 'Only the personal connection owner can bind this source.';
  end if;

  if exists (
    select 1
    from public.project_github_settings project_github_setting
    where project_github_setting.project_id = target_project_id
      and project_github_setting.connection_source_id is distinct from target_connection_source_id
  ) then
    delete from public.github_repositories
    where project_id = target_project_id;
  end if;

  insert into public.project_github_settings (
    project_id,
    connection_source_id,
    configured_by,
    created_at,
    updated_at
  )
  values (
    target_project_id,
    target_connection_source_id,
    auth.uid(),
    now(),
    now()
  )
  on conflict (project_id) do update
  set
    connection_source_id = excluded.connection_source_id,
    configured_by = excluded.configured_by,
    updated_at = excluded.updated_at;

  return target_connection_source_id;
end;
$$;

create or replace function public.clear_project_github_source(
  target_project_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_edit_project(target_project_id, auth.uid()) then
    raise exception 'Access denied';
  end if;

  delete from public.github_repositories
  where project_id = target_project_id;

  delete from public.project_github_settings
  where project_id = target_project_id;
end;
$$;

create or replace function public.get_organization_github_identity_candidates(target_org_id uuid)
returns table (
  github_login text,
  last_seen_at timestamptz,
  pr_count bigint,
  review_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with org_repositories as (
    select github_repository.id
    from public.github_repositories github_repository
    join public.projects project
      on project.id = github_repository.project_id
    join public.workspaces workspace
      on workspace.id = project.workspace_id
    where workspace.organization_id = target_org_id
  ),
  author_candidates as (
    select
      lower(trim(github_pull_request.author_login)) as github_login,
      max(coalesce(github_pull_request.last_review_submitted_at, github_pull_request.updated_at, github_pull_request.created_at)) as last_seen_at,
      count(*) as pr_count,
      0::bigint as review_count
    from public.github_pull_requests github_pull_request
    join org_repositories org_repository
      on org_repository.id = github_pull_request.repo_id
    where github_pull_request.author_login is not null
      and lower(trim(github_pull_request.author_login)) !~ '\\[bot\\]$'
    group by lower(trim(github_pull_request.author_login))
  ),
  reviewer_candidates as (
    select
      lower(trim(github_event.actor_login)) as github_login,
      max(github_event.github_created_at) as last_seen_at,
      0::bigint as pr_count,
      count(*) as review_count
    from public.github_events github_event
    join org_repositories org_repository
      on org_repository.id = github_event.repo_id
    where github_event.event_type = 'review_submitted'
      and github_event.actor_login is not null
      and lower(trim(github_event.actor_login)) !~ '\\[bot\\]$'
    group by lower(trim(github_event.actor_login))
  ),
  combined as (
    select
      candidate.github_login,
      max(candidate.last_seen_at) as last_seen_at,
      sum(candidate.pr_count) as pr_count,
      sum(candidate.review_count) as review_count
    from (
      select * from author_candidates
      union all
      select * from reviewer_candidates
    ) candidate
    group by candidate.github_login
  )
  select
    combined.github_login,
    combined.last_seen_at,
    combined.pr_count,
    combined.review_count
  from combined
  left join public.profiles profile
    on lower(profile.github_login) = combined.github_login
  where public.can_manage_organization(target_org_id, auth.uid())
    and profile.user_id is null
  order by combined.last_seen_at desc nulls last, combined.github_login asc;
$$;

revoke all on function public.get_organization_github_identity_candidates(uuid) from public;

grant execute on function public.get_organization_github_identity_candidates(uuid) to authenticated;

create or replace function public.get_project_github_analytics_pull_requests(
  target_project_id uuid,
  target_from timestamptz default null,
  target_to timestamptz default null
)
returns table (
  id uuid,
  repo_id uuid,
  github_pr_id bigint,
  number integer,
  title text,
  state text,
  draft boolean,
  author_login text,
  html_url text,
  created_at timestamptz,
  updated_at timestamptz,
  merged_at timestamptz,
  closed_at timestamptz,
  review_state text,
  first_review_submitted_at timestamptz,
  last_review_submitted_at timestamptz,
  review_count integer,
  approval_count integer,
  changes_requested_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pr.id,
    pr.repo_id,
    pr.github_pr_id,
    pr.number,
    pr.title,
    pr.state,
    pr.draft,
    pr.author_login,
    pr.html_url,
    pr.created_at,
    pr.updated_at,
    pr.merged_at,
    pr.closed_at,
    pr.review_state,
    pr.first_review_submitted_at,
    pr.last_review_submitted_at,
    pr.review_count,
    pr.approval_count,
    pr.changes_requested_count
  from public.github_pull_requests pr
  join public.github_repositories gr
    on gr.id = pr.repo_id
  where public.can_access_project(target_project_id, auth.uid())
    and gr.project_id = target_project_id
    and (
      target_from is null
      or (
        pr.created_at >= target_from
        or coalesce(pr.merged_at, pr.closed_at) >= target_from
        or (pr.state = 'open' and pr.updated_at >= target_from)
      )
    )
    and (
      target_to is null
      or (
        pr.created_at < target_to
        or coalesce(pr.merged_at, pr.closed_at) < target_to
        or (pr.state = 'open' and pr.updated_at < target_to)
      )
    )
  order by pr.updated_at desc, pr.created_at desc;
$$;

revoke all on function public.get_project_github_analytics_pull_requests(uuid, timestamptz, timestamptz) from public;

grant execute on function public.get_project_github_analytics_pull_requests(uuid, timestamptz, timestamptz) to authenticated;

create or replace function public.get_project_github_review_events(
  target_project_id uuid,
  target_from timestamptz default null,
  target_to timestamptz default null
)
returns table (
  id uuid,
  repo_id uuid,
  actor_login text,
  actor_avatar_url text,
  pull_request_id uuid,
  payload jsonb,
  github_created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    github_event.id,
    github_event.repo_id,
    github_event.actor_login,
    github_event.actor_avatar_url,
    github_event.pull_request_id,
    github_event.payload,
    github_event.github_created_at
  from public.github_events github_event
  join public.github_repositories github_repository
    on github_repository.id = github_event.repo_id
  where public.can_access_project(target_project_id, auth.uid())
    and github_repository.project_id = target_project_id
    and github_event.event_type = 'review_submitted'
    and (target_from is null or github_event.github_created_at >= target_from)
    and (target_to is null or github_event.github_created_at < target_to)
  order by github_event.github_created_at desc, github_event.id desc;
$$;

revoke all on function public.get_project_github_review_events(uuid, timestamptz, timestamptz) from public;

grant execute on function public.get_project_github_review_events(uuid, timestamptz, timestamptz) to authenticated;

revoke all on function public.get_project_github_pull_requests(uuid) from public;

grant execute on function public.get_project_github_pull_requests(uuid) to authenticated;

revoke all on function public.get_project_github_cards(uuid) from public;

grant execute on function public.get_project_github_cards(uuid) to authenticated;

create or replace function public.upsert_commit_daily_rollup(
  target_repo_id uuid,
  target_activity_date date,
  target_commit_count integer
)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.github_commit_daily_rollups (repo_id, activity_date, commit_count, computed_timezone)
  values (target_repo_id, target_activity_date, target_commit_count, 'UTC')
  on conflict (repo_id, activity_date) do update
    set commit_count = github_commit_daily_rollups.commit_count + excluded.commit_count,
        updated_at = now();
end;
$$;

revoke all on function public.upsert_commit_daily_rollup(uuid, date, integer) from public;

grant execute on function public.upsert_commit_daily_rollup(uuid, date, integer) to service_role;

grant all on public.github_installations to authenticated, service_role;

grant all on public.github_connection_sources to authenticated, service_role;

grant all on public.github_connection_allowed_repositories to authenticated, service_role;

grant all on public.project_github_settings to authenticated, service_role;

grant all on public.github_connection_install_states to authenticated, service_role;

grant all on public.github_repositories to authenticated, service_role;

grant all on public.github_pull_requests to authenticated, service_role;

grant all on public.card_github_links to authenticated, service_role;

grant all on public.github_events to authenticated, service_role;

grant all on public.github_commit_daily_rollups to authenticated, service_role;

grant execute on function public.set_project_github_source(uuid, uuid) to authenticated, service_role;

grant execute on function public.clear_project_github_source(uuid) to authenticated, service_role;

grant execute on function public.validate_github_repository_source() to authenticated, service_role;
