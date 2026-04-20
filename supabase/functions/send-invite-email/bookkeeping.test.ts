import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

describe('send-invite-email bookkeeping', () => {
  it('records invite email timestamps through RPCs keyed by accept token', () => {
    const functionPath = resolve(process.cwd(), 'supabase/functions/send-invite-email/index.ts')
    const source = readFileSync(functionPath, 'utf8')

    expect(source).toContain("rpc('mark_project_invite_email_sent'")
    expect(source).toContain("rpc('mark_invitation_email_sent'")
    expect(source).toContain('target_accept_token: payload.acceptToken')
  })

  it('keeps invite email bookkeeping on the core owner file and resets resend state for org/workspace invites', () => {
    const migrationPath = resolve(process.cwd(), 'supabase/migrations/00000000000000_core.sql')
    const source = readFileSync(migrationPath, 'utf8')

    expect(source).toContain('create or replace function public.mark_project_invite_email_sent(')
    expect(source).toContain('create or replace function public.mark_invitation_email_sent(')
    expect(source).toMatch(/create or replace function public\.create_organization_invite[\s\S]*email_sent_at = null,/)
    expect(source).toMatch(/create or replace function public\.create_workspace_invite[\s\S]*email_sent_at = null,/)
  })
})
