# Rocketboard

Rocketboard is a workspace-first collaboration app for projects, views, cards, and documents.

This repository is the canonical Rocketboard codebase.

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

1. Start Supabase locally.
2. Run `supabase db reset`.
3. Copy env vars from `supabase status -o env` into `.env.local`.
4. Run the app with `npm run dev`.

See [docs/SQL_MIGRATIONS.md](./docs/SQL_MIGRATIONS.md) for append-only migration rules and SQL verification commands.

`.env.local` values from `supabase status -o env` are for local development only. Do not use them for production builds or Cloudflare Pages deploys.

Seeded local sign-in accounts:

- `demo@rocketboard.io / demo-password`
- `empty@rocketboard.io / demo-password`
- `admin@rocketboard.dev / demo-password` (internal admin)

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

## License

Rocketboard is released under the Functional Source License, Version 1.1, with an Apache 2.0 Future License (`FSL-1.1-Apache-2.0`). See [LICENSE](./LICENSE) for the full text.

Under FSL you may use, modify, and redistribute Rocketboard for any purpose *other than* offering it as a competing hosted service. Two years after each version is released, that version automatically converts to Apache 2.0.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup details, verification expectations, and pull request guidance.

Contributor-built workflow dashboards and native clients should use the public workflow operator contract documented in [docs/WORKFLOW_OPERATOR_API.md](./docs/WORKFLOW_OPERATOR_API.md).

## Docs

- [API Status](docs/API.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Design System](docs/DESIGN.md)
- [SQL Migrations](docs/SQL_MIGRATIONS.md)
- [MCP Server](docs/MCP.md)
- [GitHub Integration Setup](docs/GITHUB_SETUP.md)
- [Workflow Operator API](docs/WORKFLOW_OPERATOR_API.md)
- [AI Agents](docs/AI_AGENTS.md)
- [Self-Hosting Guide](SELF_HOSTING.md)
- [Contributing](CONTRIBUTING.md)
