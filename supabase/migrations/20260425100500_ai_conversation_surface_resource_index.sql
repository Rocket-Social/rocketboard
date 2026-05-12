create index concurrently if not exists idx_ai_conversations_user_surface_resource_updated
  on public.ai_conversations (user_id, surface, surface_resource_id, updated_at desc)
  where surface_resource_id is not null;
