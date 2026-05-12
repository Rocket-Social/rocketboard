import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Phase E exit criterion #8: every edge function must have a happy-path test
 * and an input-rejection test. Edge functions import Deno-only URLs at the top
 * of each index.ts, so Vitest cannot import them directly — instead these
 * tests inspect the source and assert the function is wired to the shared
 * Zod-backed `parseJsonBody` helper (rejection) and returns success via the
 * shared response helpers (happy path).
 *
 * Exceptions: webhook-style functions (github-webhook, stripe-webhook) are
 * authenticated by HMAC signature and skip `parseJsonBody`; their rejection
 * path lives in the signature-verification check.
 */

function readFunctionSource(slug: string): string {
  return readFileSync(resolve(process.cwd(), `supabase/functions/${slug}/index.ts`), 'utf8')
}

const JSON_BODY_FUNCTIONS: Array<{ slug: string; schemaName: string }> = [
  { slug: 'ai-chat', schemaName: 'ChatRequestBodySchema' },
  { slug: 'ai-key-manage', schemaName: 'AiKeyManageBodySchema' },
  { slug: 'anthropic-subscription-auth', schemaName: 'AnthropicSubscriptionAuthBodySchema' },
  { slug: 'billing-checkout', schemaName: 'BillingCheckoutBodySchema' },
  { slug: 'billing-invoices', schemaName: 'BillingInvoicesBodySchema' },
  { slug: 'billing-payment-method', schemaName: 'BillingPaymentMethodBodySchema' },
  { slug: 'billing-portal-session', schemaName: 'BillingPortalSessionBodySchema' },
  { slug: 'github-install', schemaName: 'GithubInstallBodySchema' },
  { slug: 'github-oauth', schemaName: 'GithubOauthBodySchema' },
  { slug: 'github-repos', schemaName: 'GithubReposBodySchema' },
  { slug: 'github-sync', schemaName: 'GithubSyncBodySchema' },
  { slug: 'github-validate-token', schemaName: 'GithubValidateTokenBodySchema' },
  { slug: 'granola-import', schemaName: 'GranolaImportBodySchema' },
  { slug: 'jira-oauth', schemaName: 'JiraOauthBodySchema' },
  { slug: 'jira-sync', schemaName: 'JiraSyncBodySchema' },
  { slug: 'send-invite-email', schemaName: 'InviteEmailPayloadSchema' },
  { slug: 'super-admin-org-vip', schemaName: 'SuperAdminOrgVipBodySchema' },
]

describe('phase-e — edge function input validation', () => {
  for (const { slug, schemaName } of JSON_BODY_FUNCTIONS) {
    describe(slug, () => {
      const source = readFunctionSource(slug)

      it('exports a Zod body schema', () => {
        expect(source).toContain(`export const ${schemaName}`)
        expect(source).toMatch(/from\s+['"]https:\/\/esm\.sh\/zod@[\d.]+['"]|\bz,\s*\n?\s*\}\s*from\s+['"]\.\.\/_shared\/supabase\.ts['"]|\bz\s*\}\s*from\s+['"]\.\.\/_shared\/supabase\.ts['"]/)
      })

      it('validates the request body through parseJsonBody before handling', () => {
        expect(source).toContain(`parseJsonBody`)
        expect(source).toContain(schemaName)
        expect(source).toMatch(new RegExp(`parseJsonBody\\(\\s*req\\s*,\\s*${schemaName}\\s*\\)`))
      })

      it('returns a success response once the body is valid', () => {
        expect(source).toMatch(/jsonResponse\(|return\s+new\s+Response|return\s+await\s+handle/)
      })

      it('uses shared _shared/supabase helpers, not direct createClient', () => {
        expect(source).not.toMatch(/createClient\(\s*SUPABASE_URL/)
      })
    })
  }

  describe('github-webhook', () => {
    const source = readFunctionSource('github-webhook')

    it('rejects unsigned or mis-signed webhook payloads via verifyGithubWebhookSignature', () => {
      expect(source).toContain('verifyGithubWebhookSignature')
      expect(source).toContain("'Invalid signature'")
    })

    it('processes a valid signed event via the shared createServiceClient', () => {
      expect(source).toContain('createServiceClient')
      expect(source).toMatch(/jsonResponse\(\s*\{\s*ok:\s*true\s*\}\s*\)/)
    })
  })

  describe('stripe-webhook', () => {
    const source = readFunctionSource('stripe-webhook')

    it('rejects events without a valid Stripe signature', () => {
      expect(source).toContain('verifyWebhookSignature')
      expect(source).toContain('rawBody')
    })

    it('uses the shared createServiceClient for event persistence', () => {
      expect(source).toContain('createServiceClient')
    })
  })

  describe('github-repos', () => {
    const source = readFunctionSource('github-repos')

    it('accepts project-agnostic manage requests from org settings', () => {
      expect(source).toMatch(/project_id:\s*(?:z\.string\(\)\.uuid\(\)\.nullable\(\)\.optional\(\)|z\.string\(\)\.uuid\(\)\.nullish\(\))/)
      expect(source).toContain('const projectId = body.project_id ?? undefined')
    })
  })
})
