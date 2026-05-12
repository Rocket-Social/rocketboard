# Supabase

This directory contains Rocketboard's local Supabase config, executable SQL history, archive metadata, edge functions, and local seed data.

The canonical SQL policy lives in [docs/SQL_MIGRATIONS.md](../docs/SQL_MIGRATIONS.md).

## Active Migration History

`supabase/migrations/` is the append-only executable migration history.

- The current `00000000000000_*` through `00000000000014_*` files are the frozen baseline.
- New schema changes add timestamped files named `YYYYMMDDHHMMSS_slug.sql`, and each new version must be newer than the current active head.
- Run `npm run check:migrations`, `npm run sql:verify:reset`, and `npm run sql:verify:upgrade -- --from-ref origin/main` before merging SQL changes.

The frozen baseline files are:

1. `00000000000000_core.sql`
2. `00000000000001_cards.sql`
3. `00000000000002_fields.sql`
4. `00000000000003_project_views.sql`
5. `00000000000004_documents.sql`
6. `00000000000005_automations.sql`
7. `00000000000006_initiatives.sql`
8. `00000000000007_plans.sql`
9. `00000000000008_github.sql`
10. `00000000000009_search.sql`
11. `00000000000010_activity.sql`
12. `00000000000012_wiki.sql`
13. `00000000000014_ai_config.sql`

Ownership:

- `00000000000000_core.sql`: profiles, organizations, workspaces, projects, invites, memberships, settings, bootstrap helpers
- `00000000000001_cards.sql`: cards, comments, statuses, priorities, groups, sprints, card RPCs
- `00000000000002_fields.sql`: field definitions, field options, custom-field RPCs
- `00000000000003_project_views.sql`: project views, canvas, shared/personal view state, shell summary RPCs
- `00000000000004_documents.sql`: documents, versions, comments, presence, attachments, notes
- `00000000000005_automations.sql`: automation rules, runs, evaluation engine
- `00000000000006_initiatives.sql`: initiatives, updates, card linking
- `00000000000007_plans.sql`: plans, roadmap, releases, scorecards
- `00000000000008_github.sql`: GitHub installations, repositories, PRs, events, analytics
- `00000000000009_search.sql`: full-text search indexes and search RPCs
- `00000000000010_activity.sql`: activity events and activity RPCs
- `00000000000012_wiki.sql`: wiki pages, versions, comments, shares, pins, attachments, and wiki RPCs
- `00000000000014_ai_config.sql`: AI API keys, personas, conversations, messages, and persona seeding RPCs

## Local Reset

Use:

```bash
supabase db reset
```

Seeded local sign-in accounts:

- `demo@rocketboard.io / demo-password`
- `empty@rocketboard.io / demo-password`
- `admin@rocketboard.dev / demo-password` (internal admin)

The local seed also includes:

- one open workspace
- two projects
- starter views
- a small set of cards, comments, documents, versions, invites, and attachments

Use `supabase status -o env` to copy local env vars into `.env.local` for local development only. Those localhost values are not valid production deploy config.

## Edge Functions

Rocketboard stays RPC-first for product CRUD and aggregate reads. This private repo also includes app-owned Edge Functions for server-only capabilities such as GitHub callbacks, email invites, imports, billing, and AI handling.
