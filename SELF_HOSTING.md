# Self-Hosting Rocketboard

## Overview

Self-hosted Rocketboard includes all features with no usage limits. The billing UI and Stripe integration are only relevant to the hosted service at rocketboard.app.

## Prerequisites

- Node.js 20+
- A Supabase project (local or hosted)

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/Rocket-Social/rocketboard.git
   cd rocketboard
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment:
   ```bash
   cp .env.example .env.local
   ```

   Set these values in `.env.local`:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
   VITE_SELF_HOSTED=true
   ```

4. Apply the database schema:
   ```bash
   supabase db push
   ```

5. Build and deploy:
   ```bash
   npm run build
   # Deploy the `dist/` directory to your hosting provider
   ```

   Production builds now reject `VITE_SUPABASE_URL` values that point at `127.0.0.1` or `localhost` so a local `.env` file cannot be accidentally shipped to `rocketboard.app`. If you intentionally want a local-only bundle against a local Supabase instance, set `ROCKETBOARD_ALLOW_LOCAL_SUPABASE_BUILD=true` before `npm run build`.

## Self-Hosted Configuration

Setting `VITE_SELF_HOSTED=true` does two things:
- Hides the Billing and Invoices tabs from organization settings (they require Stripe, which is not included)
- Returns safe fallbacks for any billing API calls instead of failing

## Unlocking Unlimited Usage

By default, new organizations start on the free plan with usage caps. To remove all limits for your self-hosted installation, run this SQL against your Supabase database:

```sql
UPDATE organizations
SET plan = 'pro',
    limits = '{"members": -1, "projects": -1, "workspaces": -1, "storage_mb": -1}'::jsonb
WHERE id = 'YOUR_ORG_ID';
```

Replace `YOUR_ORG_ID` with your organization's UUID (visible in the URL when viewing org settings).

## Upgrading

To upgrade your self-hosted installation to a new release:

1. Pull the latest version:
   ```bash
   git pull origin main
   npm install
   ```

2. Apply any database schema changes:
   ```bash
   supabase db push
   ```

3. Rebuild and redeploy:
   ```bash
   npm run build
   # Redeploy the `dist/` directory
   ```

Check [CHANGELOG.md](./CHANGELOG.md) before upgrading for any breaking changes or manual migration steps. Rocketboard uses Supabase's migration system — `supabase db push` applies all pending migrations in order.

## Privacy

Self-hosted Rocketboard makes no network calls to rocketboard.app or any other external service. There is no telemetry, no analytics, and no phone-home behavior. All data stays within your Supabase project.

## What's Not Included

If you are self-hosting from the public release mirror, the following hosted-service pieces are excluded:

- **Stripe billing edge functions** (checkout, invoices, payment methods, webhooks)
- **Internal admin panel** (customer management, award grants)
- **Some admin-only database functions** (organization deletion, VIP grants)

These are not needed for self-hosted use. In this private repo they still exist for `rocketboard.app`, but self-hosted installs can ignore them. All core product features (Kanban, Gantt, Documents, GitHub integration, AI agents, etc.) work without them.

## Deploying Edge Functions

The self-hosting-relevant edge functions (GitHub integration, email invitations, imports, AI handlers) can be deployed with:

```bash
supabase functions deploy
```

Stripe-related edge functions are only needed for the hosted service and can be skipped for self-hosted installations.
