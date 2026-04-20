# Contributing to Rocketboard

## Getting Started

1. Fork this repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/rocketboard.git`
3. Install dependencies: `npm install`
4. Copy environment config: `cp .env.example .env.local`
5. Start development: `npm run dev`

## Development Setup

Rocketboard uses:
- **React 19** + **Vite 7** for the frontend
- **TanStack Router** + **TanStack Query** for routing and data
- **Supabase** for the backend (Postgres, Auth, Edge Functions, Realtime)
- **Tailwind CSS** for styling

### Local Supabase (recommended)

```bash
supabase start
# Copy the anon key and URL from `supabase status` into .env.local
```

Those `.env.local` values point at your local Supabase instance. They are correct for `npm run dev`, but they must not be used for production builds or deploy jobs.

### Verification

Before submitting a PR, run:
```bash
npm run typecheck
npm run build
```

Run `npm run test` when your change affects application behavior, data flow, or migrations.

## Submitting Changes

1. Keep each pull request focused on one logical change.
2. Verify your work before opening the PR.
3. Use a descriptive commit history and PR title.
4. Open the pull request against `main`.

Well-scoped PRs are easier to review, test, and port between repositories.

## Contribution Workflow

Rocketboard is published as a Fair Source mirror. When you submit a PR:

1. The maintainer reviews and merges your PR in this public repo
2. Changes are then ported into the maintainer's development repo
3. The next release includes your contribution

This means your PR may take slightly longer to appear in production, but all contributions are valued and credited.

## Developer Certificate of Origin (DCO)

All contributions require a `Signed-off-by` line in each commit message, certifying that you have the right to submit the code under the project's license. This is the [Developer Certificate of Origin](https://developercertificate.org/).

Add it automatically with:
```bash
git commit -s -m "Your commit message"
```

Or configure git to always sign off:
```bash
git config --global format.signoff true
```

Commits without a `Signed-off-by` line cannot be merged.

## Code Conventions

- Feature code lives in `src/features/{feature-name}/`
- Only `src/platform/` imports Supabase directly
- TypeScript strict mode is enforced
- No default exports (named exports only)

## What's Not in This Repo

The hosted Rocketboard service includes additional infrastructure not present here:
- Stripe billing integration (edge functions)
- Internal admin panel
- Some database functions specific to the hosted service

Self-hosted installations work with all features and no usage limits. See [SELF_HOSTING.md](./SELF_HOSTING.md).
