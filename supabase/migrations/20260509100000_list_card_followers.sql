-- Follow-card v1.1 — list_card_followers RPC for the popover surface.
--
-- The Bell button on CardSheet evolves from "toggle my follow state"
-- into a popover that also shows everyone else following the card. The
-- card_followers RLS stays self-select only; a SECURITY DEFINER RPC
-- enforces the read-access gate (can_access_project) and joins to
-- profiles for display_name + avatar_url so the frontend gets a single
-- ready-to-render row shape.

set search_path = public;

create or replace function public.list_card_followers(target_card_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  source text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  card_row public.cards%rowtype;
begin
  if auth.uid() is null then
    raise exception 'list_card_followers: caller must be authenticated.';
  end if;

  select *
    into card_row
  from public.cards
  where id = target_card_id;

  if card_row.id is null then
    raise exception 'list_card_followers: card not found.';
  end if;

  if not public.can_access_project(card_row.project_id) then
    raise exception 'list_card_followers: caller cannot read this card.';
  end if;

  return query
  select
    f.user_id,
    coalesce(p.full_name, split_part(p.email, '@', 1), 'Unknown') as display_name,
    p.avatar_url,
    f.source,
    f.created_at
  from public.card_followers f
  left join public.profiles p on p.user_id = f.user_id
  where f.card_id = target_card_id
  order by f.created_at asc;
end;
$$;

revoke all on function public.list_card_followers(uuid) from public;
revoke all on function public.list_card_followers(uuid) from anon;
grant execute on function public.list_card_followers(uuid) to authenticated;

comment on function public.list_card_followers(uuid) is
  'Returns every follower of a card with display_name + avatar_url. SECURITY DEFINER + can_access_project gate so the frontend can render a popover roster without broadening the card_followers SELECT RLS.';
