-- The Anthropic Sonnet model-id correction shipped during the pre-freeze
-- baseline era and was later folded into 00000000000014_ai_config.sql.
-- Existing databases that never applied that correction kept the old default
-- and any already-seeded personas stayed pinned to the invalid model id.
-- This dated repair makes the correction explicit and updates stale rows.

alter table public.ai_personas
  alter column model set default 'claude-sonnet-4-20250514';

update public.ai_personas
set model = 'claude-sonnet-4-20250514'
where provider = 'anthropic'
  and model = 'claude-sonnet-4-5-20250514';
