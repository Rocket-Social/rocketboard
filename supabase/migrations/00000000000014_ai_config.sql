-- AI Agents: API key storage, personas, conversations, messages.
-- Keys stored in dedicated table with RLS read-only for authenticated users.
-- All writes go through edge function using service_role client.

-- ============================================================
-- AI API Keys
-- ============================================================

create table public.ai_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('openai', 'anthropic', 'google')),
  credential_kind text not null default 'api_key'
    check (credential_kind in ('api_key', 'subscription')),
  encrypted_key text not null,
  encrypted_refresh_token text,
  expires_at timestamptz,
  last_four varchar(4),
  set_by uuid not null references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ai_api_keys_scope_check check (
    (user_id is not null and organization_id is null)
    or (user_id is null and organization_id is not null)
  ),
  constraint ai_api_keys_user_provider_credential_unique unique (user_id, provider, credential_kind),
  constraint ai_api_keys_org_provider_credential_unique unique (organization_id, provider, credential_kind)
);

create trigger set_ai_api_keys_updated_at
  before update on public.ai_api_keys
  for each row execute function public.set_updated_at();

alter table public.ai_api_keys enable row level security;

create policy ai_api_keys_select on public.ai_api_keys
  for select to authenticated
  using (
    user_id = auth.uid()
    or organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE for authenticated. Edge function writes via service_role.

create table if not exists public.ai_provider_oauth_states (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('anthropic')),
  state text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  return_path text not null,
  code_verifier text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_ai_provider_oauth_states_provider_expires
  on public.ai_provider_oauth_states (provider, expires_at desc);

alter table public.ai_provider_oauth_states enable row level security;

-- ============================================================
-- AI Personas
-- ============================================================

create table public.ai_personas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  avatar_url text,
  accent_color text,
  system_prompt text not null,
  focus_area text,
  provider text not null default 'anthropic',
  model text not null default 'claude-sonnet-4-20250514',
  primary_credential_kind text not null default 'api_key'
    check (primary_credential_kind in ('api_key', 'subscription')),
  fallback_provider text
    check (fallback_provider in ('anthropic', 'openai', 'google')),
  fallback_model text,
  fallback_credential_kind text
    check (fallback_credential_kind in ('api_key', 'subscription')),
  is_default boolean not null default false,
  is_enabled boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ai_personas_slug_org_unique unique (organization_id, slug)
);

create trigger set_ai_personas_updated_at
  before update on public.ai_personas
  for each row execute function public.set_updated_at();

alter table public.ai_personas enable row level security;

create policy ai_personas_select on public.ai_personas
  for select to authenticated
  using (exists (
    select 1 from public.organization_members om
    where om.organization_id = ai_personas.organization_id
      and om.user_id = auth.uid()
  ));

create policy ai_personas_manage on public.ai_personas
  for all to authenticated
  using (exists (
    select 1 from public.organization_members om
    where om.organization_id = ai_personas.organization_id
      and om.user_id = auth.uid()
      and om.role = 'admin'
  ));

-- ============================================================
-- Conversations & Messages
-- ============================================================

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  persona_id uuid not null references public.ai_personas(id) on delete cascade,
  surface text not null check (surface in ('notes', 'project', 'wiki', 'card', 'global')),
  surface_resource_id text,
  title text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger set_ai_conversations_updated_at
  before update on public.ai_conversations
  for each row execute function public.set_updated_at();

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  tool_calls jsonb default '[]'::jsonb,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_ai_messages_conversation on public.ai_messages(conversation_id, created_at);
create index idx_ai_conversations_user_surface on public.ai_conversations(user_id, surface);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

create policy ai_conversations_user on public.ai_conversations
  for all using (user_id = auth.uid());

create policy ai_messages_user on public.ai_messages
  for all using (exists (
    select 1 from public.ai_conversations c
    where c.id = ai_messages.conversation_id and c.user_id = auth.uid()
  ));

-- ============================================================
-- Seed default personas (called from frontend on first visit)
-- ============================================================

create or replace function public.seed_default_ai_personas(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id and user_id = auth.uid()
  ) then
    raise exception 'Not a member of this organization';
  end if;

  insert into public.ai_personas (organization_id, name, slug, accent_color, focus_area, system_prompt, is_default)
  values
    (p_organization_id, 'Buddy', 'buddy', 'blue', 'CTO / Strategy',
     'You are Buddy, a seasoned Silicon Valley CTO. You think in systems, care about architecture, scalability, and technical strategy. You speak directly and challenge assumptions constructively.', true),
    (p_organization_id, 'Claire', 'claire', 'purple', 'PM',
     'You are Claire, an experienced Product Manager. You focus on user value, prioritization, roadmap clarity, and stakeholder communication. You ask clarifying questions before making recommendations.', true),
    (p_organization_id, 'Sara', 'sara', 'green', 'Scrum Master',
     'You are Sara, a pragmatic Scrum Master. You focus on sprint planning, retrospectives, process improvement, and team velocity. You value simplicity and sustainable pace.', true),
    (p_organization_id, 'Andy', 'andy', 'amber', 'Assistant',
     'You are Andy, a reliable and versatile Assistant. You help with organizing information, filing notes, creating task breakdowns, summarizing content. You execute tasks efficiently and confirm before making changes.', true),
    (p_organization_id, 'JK', 'jk', 'red', 'Strategist',
     'You are JK, a business strategist. You think about market positioning, competitive analysis, go-to-market strategy, and long-term vision.', true),
    (p_organization_id, 'Chris', 'chris', 'teal', 'Engineering Manager',
     'You are Chris, an experienced Engineering Manager. You focus on team health, delivery reliability, technical debt management, and engineering process. You balance speed with quality.', true)
  on conflict (organization_id, slug) do nothing;
end;
$$;

revoke all on function public.seed_default_ai_personas(uuid) from public;
grant execute on function public.seed_default_ai_personas(uuid) to authenticated;
