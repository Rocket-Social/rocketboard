import {execFileSync} from 'node:child_process'

import {describe, expect, it, beforeAll} from 'vitest'

const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function psqlQuery(sql: string): string {
  return execFileSync('psql', [LOCAL_DB_URL, '-At', '-c', sql], {
    encoding: 'utf8',
    timeout: 10_000,
  }).trim()
}

function canReachPostgres(): boolean {
  try {
    execFileSync('psql', [LOCAL_DB_URL, '-At', '-c', 'select 1'], {
      encoding: 'utf8',
      timeout: 3_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return true
  } catch {
    return false
  }
}

const pgReachable = canReachPostgres()
const itIfPg = pgReachable ? it : it.skip

describe('RLS tenant-isolation regression guards', () => {
  beforeAll(() => {
    if (!pgReachable) {
      console.warn(
        '[rls-tenant-isolation] Local Supabase not reachable at 127.0.0.1:54322. Tests skipped. Run `supabase start` to exercise.',
      )
    }
  })

  // F1 — invitations must not have USING(true). The previous permissive policy
  // let any authed user UPDATE an invitation's email → org takeover via
  // accept_invite. Guard against regression.
  itIfPg('invitations has no USING(true) policy', () => {
    const perms = psqlQuery(
      `select coalesce(string_agg(policyname || ':' || qual, ';'), '')
       from pg_catalog.pg_policies
       where schemaname='public' and tablename='invitations'
         and (qual = 'true' or with_check = 'true')`,
    )
    expect(perms).toBe('')
  })

  itIfPg('invitations SELECT requires admin of target resource', () => {
    const qual = psqlQuery(
      `select qual
       from pg_catalog.pg_policies
       where schemaname='public' and tablename='invitations' and cmd='SELECT'`,
    )
    expect(qual).toContain('can_manage_organization')
    expect(qual).toContain('can_manage_workspace')
  })

  itIfPg('invitations ALL policy requires admin (both USING and WITH CHECK)', () => {
    const row = psqlQuery(
      `select qual || '|' || coalesce(with_check, '')
       from pg_catalog.pg_policies
       where schemaname='public' and tablename='invitations' and cmd='ALL'`,
    )
    // Both halves must constrain to manage_organization/manage_workspace
    expect(row).toMatch(/can_manage_organization.*can_manage_workspace.*\|.*can_manage_organization.*can_manage_workspace/s)
  })

  // F2 — project_github_settings source-scope enforcement lives in a trigger
  // (not in WITH CHECK) so that legitimate UPDATEs to analytics/auto_transitions
  // don't require re-validating the source owner on every row edit. The trigger
  // fires on INSERT and on UPDATE OF connection_source_id only.
  itIfPg('project_github_settings has validate_project_github_settings_source trigger', () => {
    const row = psqlQuery(
      `select trigger_name || '|' || action_timing || '|' || event_manipulation || '|' || event_object_table
       from information_schema.triggers
       where trigger_schema='public'
         and event_object_table='project_github_settings'
         and trigger_name='project_github_settings_validate_source'`,
    )
    // One row per event_manipulation (INSERT, UPDATE) — concat both into single string.
    expect(row).toContain('project_github_settings_validate_source')
    expect(row).toContain('BEFORE')
  })

  itIfPg('validate_project_github_settings_source enforces source scope', () => {
    // Function body must check both organization scope and personal-owner scope.
    const body = psqlQuery(
      `select pg_get_functiondef(oid)
       from pg_catalog.pg_proc
       where proname='validate_project_github_settings_source'
         and pronamespace=(select oid from pg_catalog.pg_namespace where nspname='public')`,
    )
    expect(body).toContain('github_connection_sources')
    expect(body).toContain('scope_type')
    expect(body).toContain('organization_id')
    expect(body).toContain('owner_user_id')
  })

  // F3 — document_presence INSERT must verify project access (not just self).
  itIfPg('document_presence INSERT verifies project access', () => {
    const row = psqlQuery(
      `select coalesce(with_check, '')
       from pg_catalog.pg_policies
       where schemaname='public' and tablename='document_presence' and cmd='INSERT'`,
    )
    expect(row).toContain('can_access_project')
  })

  // F4 — ai_api_keys SELECT must exclude guests from org-scoped keys.
  itIfPg('ai_api_keys SELECT excludes guest role on org-scoped keys', () => {
    const qual = psqlQuery(
      `select qual
       from pg_catalog.pg_policies
       where schemaname='public' and tablename='ai_api_keys' and cmd='SELECT'`,
    )
    expect(qual).toMatch(/role.*admin.*member|role.*IN.*\(.*admin.*member/s)
  })

  // Broad safety net — no `using(true)` or `with check(true)` on user-facing
  // tables. service_role-only policies are exempt (infra use).
  itIfPg('no USING(true) or WITH CHECK(true) on tables accessible to authenticated', () => {
    const rows = psqlQuery(
      `select string_agg(tablename || '.' || policyname, ',')
       from pg_catalog.pg_policies
       where schemaname='public'
         and 'authenticated' = any(roles)
         and (qual = 'true' or with_check = 'true')`,
    )
    expect(rows).toBe('')
  })
})
