# Rocketboard

Rocketboard is a workspace-first collaboration app for projects, views, cards, documents, plans, and team workflows.

This repository is the public Fair Source Rocketboard codebase.

## Fair Source License

Rocketboard is source-available under the Functional Source License 1.1 (`FSL-1.1-ALv2`). You may use, modify, and redistribute it for any permitted purpose other than offering Rocketboard itself as a competing hosted service. Each release converts to Apache 2.0 two years after it is published.

See [LICENSE](./LICENSE) for the full license text and [CONTRIBUTING.md](./CONTRIBUTING.md) for DCO requirements.

## Quick Start

1. Install dependencies: `npm install`
2. Start Supabase locally: `supabase start`
3. Reset the local database: `supabase db reset`
4. Copy local env vars from `supabase status -o env` into `.env.local`
5. Start the app: `npm run dev`

Seeded local sign-in accounts:

- `demo@rocketboard.io / demo-password`
- `empty@rocketboard.io / demo-password`

## Current Product Slice

- Supabase Auth, Storage, Realtime, Postgres, and RPC-backed mutations
- onboarding into a first workspace and starter project
- project views: overview, table, kanban, gantt, document, github, canvas
- cards with comments, attachments, scheduling, assignees, and custom fields
- documents with autosave, versions, comments, attachments, and presence
- project sharing, invites, membership roles, project search, and workspace command search
- AI agents with BYOK API keys, default personas, and conversation history

## Runtime Shape

- one real backend: Supabase
- one frontend runtime: Supabase URL + publishable key
- one thin platform seam under `src/platform/`
- append-only SQL migration history under `supabase/migrations/`
- [docs/SQL_MIGRATIONS.md](./docs/SQL_MIGRATIONS.md) is the canonical SQL policy and verification guide

## Local Development

See [docs/SQL_MIGRATIONS.md](./docs/SQL_MIGRATIONS.md) for append-only migration rules and SQL verification commands.

`.env.local` values from `supabase status -o env` are for local development only. Do not use them for production builds.

## MCP Server

Rocketboard ships an MCP server that gives AI coding tools access to your workspaces, projects, cards, and sprints.

```bash
npm install
npm run mcp:setup
```

Then ask Claude Code: "List my Rocketboard workspaces."

For write access: `npm run mcp:setup -- --writes`

See [docs/MCP.md](./docs/MCP.md) for the full tool reference, architecture, CLI, and configuration.

## Self-Hosting

Rocketboard can be self-hosted with all features and no usage limits. Set `VITE_SELF_HOSTED=true` in your environment to enable self-hosted mode. See [SELF_HOSTING.md](./SELF_HOSTING.md) for the full deployment guide.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup details, verification expectations, and pull request guidance.

## What's Not In This Repo

This Fair Source mirror does not ship every component that powers the hosted Rocketboard service. The public release excludes:

- Stripe billing edge functions
- the internal super-admin surface
- hosted-service-only database functions and tables related to internal operations
- maintainer-only hosted deploy automation

## Docs

- [API Status](docs/API.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Design System](docs/DESIGN.md)
- [SQL Migrations](docs/SQL_MIGRATIONS.md)
- [MCP Server](docs/MCP.md)
- [GitHub Integration Setup](docs/GITHUB_SETUP.md)
- [Self-Hosting Guide](SELF_HOSTING.md)
- [Contributing](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)
- [Support](SUPPORT.md)
