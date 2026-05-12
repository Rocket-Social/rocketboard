# Supabase Edge Functions

Rocketboard is RPC-first for core product CRUD, but this private repo includes Edge Functions for true server-side capabilities such as webhooks, outbound email, imports, billing, and AI request handling.

Use Postgres RPCs for ordinary product reads and writes. Add an Edge Function only when the app needs a true server-side
capability such as outbound HTTP, secret handling, or another external side effect that cannot live in SQL or the browser. The public release mirror strips hosted-only/private functions from this directory during export.
