alter table public.github_pull_requests
  add column if not exists changed_files integer not null default 0,
  add column if not exists comment_count integer not null default 0;

alter table public.github_repositories
  add column if not exists pr_stats_backfill_requested_at timestamptz;

update public.github_repositories
set pr_stats_backfill_requested_at = now()
where exists (
  select 1
  from public.github_pull_requests pr
  where pr.repo_id = github_repositories.id
);

drop function if exists public.get_project_github_pull_requests(uuid);

create function public.get_project_github_pull_requests(target_project_id uuid)
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
  changed_files integer,
  comment_count integer,
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
    pr.changed_files,
    pr.comment_count,
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

revoke all on function public.get_project_github_pull_requests(uuid) from public;
grant execute on function public.get_project_github_pull_requests(uuid) to authenticated;
