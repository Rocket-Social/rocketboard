import {execFileSync} from 'node:child_process'
import {readdirSync} from 'node:fs'
import {resolve} from 'node:path'

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
const expectedMigrationVersions = readdirSync(resolve(process.cwd(), 'supabase/migrations'))
  .sort()
  .map(fileName => fileName.split('_', 1)[0]!)

describe('migration schema contract', () => {
  beforeAll(() => {
    if (!pgReachable) {
      console.warn(
        '[migration-contract] Local Supabase not reachable at 127.0.0.1:54322. Tests skipped. Run `supabase start` to exercise.',
      )
    }
  })

  // ---------------------------------------------------------------------------
  // Baseline shape — keep the consolidation from silently shrinking the schema
  // ---------------------------------------------------------------------------
  itIfPg('has the expected object counts in the public schema', () => {
    // Post-2026-04 cutover + deploy healthcheck RPC: 72 tables / 362 functions / 192 policies / 13 enums.
    // Treat these as exact — silent shrinkage of any category is a regression
    // signal worth surfacing even if it's an intentional follow-up.
    const tableCount = Number(
      psqlQuery(
        `select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'`,
      ),
    )
    const functionCount = Number(
      psqlQuery(
        `select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`,
      ),
    )
    const policyCount = Number(
      psqlQuery(`select count(*) from pg_catalog.pg_policies where schemaname='public'`),
    )
    const enumCount = Number(
      psqlQuery(
        `select count(*) from pg_catalog.pg_type t join pg_catalog.pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype='e'`,
      ),
    )
    expect(tableCount).toBe(72)
    expect(functionCount).toBe(362)
    expect(policyCount).toBe(192)
    expect(enumCount).toBe(13)
  })

  // ---------------------------------------------------------------------------
  // Access model — scope_access_role and organization_role final form
  // ---------------------------------------------------------------------------
  itIfPg('scope_access_role enum has admin/member/guest, no access', () => {
    const values = psqlQuery(
      `select string_agg(e.enumlabel, ',' order by e.enumsortorder)
       from pg_catalog.pg_type t
       join pg_catalog.pg_namespace n on n.oid=t.typnamespace
       join pg_catalog.pg_enum e on e.enumtypid=t.oid
       where n.nspname='public' and t.typname='scope_access_role'`,
    )
    expect(values).toBe('admin,member,guest')
  })

  itIfPg('role columns default to member, not access', () => {
    const defaults = psqlQuery(
      `select table_name || '.' || column_name || '=' || column_default
       from information_schema.columns
       where table_schema='public'
         and column_name='role'
         and table_name in ('workspace_members', 'project_members', 'project_invites')
       order by 1`,
    )
    expect(defaults).toContain(`workspace_members.role='member'::scope_access_role`)
    expect(defaults).toContain(`project_members.role='member'::scope_access_role`)
    expect(defaults).toContain(`project_invites.role='member'::scope_access_role`)
  })

  // ---------------------------------------------------------------------------
  // Key RPCs the consolidation delivered
  // ---------------------------------------------------------------------------
  itIfPg('core access-control RPCs exist with expected signatures', () => {
    const signatures = psqlQuery(
      `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public'
         and p.proname in (
           'accept_invite','accept_project_invite',
           'add_workspace_member','add_project_member',
           'can_access_workspace','can_access_project',
           'can_edit_workspace','can_edit_project',
           'can_manage_workspace','can_manage_project',
           'default_scope_role_for_org_role',
           'get_shell_summary_rows_v2',
           'get_workspace_access_snapshot','get_project_access_snapshot',
           'list_workspace_access_projects',
           'set_workspace_access','set_project_access',
           'set_organization_member_role'
         )
       order by 1`,
    ).split('\n')
    expect(signatures).toContain('accept_invite(target_accept_token text)')
    expect(signatures).toContain('add_workspace_member(target_workspace_id uuid, target_user_id uuid, target_role scope_access_role)')
    expect(signatures).toContain('can_edit_project(target_project_id uuid, target_user_id uuid)')
    expect(signatures).toContain('get_shell_summary_rows_v2()')
    expect(signatures).toContain(
      'set_organization_member_role(target_org_id uuid, target_user_id uuid, target_role organization_role)',
    )
    expect(signatures).toContain('default_scope_role_for_org_role(target_org_role organization_role)')
  })

  itIfPg('get_shell_summary_rows_v2 uses the post-phase1 workspace_can_manage semantics', () => {
    // Phase1 replaced the pre-access-model logic with a cleaner check that
    // treats workspace admins as workspace_can_manage regardless of org role.
    // Pre-phase1: `current_org_member.role = 'member' AND workspace_member.role = 'admin'`
    // Post-phase1 (this is the contract): `coalesce(current_workspace_member.role, 'guest'::...) = 'admin'`
    // The fold erroneously shadowed phase1 with the older body; this guards
    // against a repeat.
    const body = psqlQuery(
      `select pg_get_functiondef(p.oid)
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='get_shell_summary_rows_v2'`,
    )
    expect(body).toContain(`coalesce(current_workspace_member.role, 'guest'::public.scope_access_role) = 'admin'`)
  })

  itIfPg('admin-floor error codes exist in the access RPC bodies', () => {
    // Replacement for deleted admin_floor_guard brittle-text tests.
    const adminFloorFns = psqlQuery(
      `select string_agg(pg_get_functiondef(p.oid), chr(10))
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public'
         and p.proname in ('add_workspace_member','set_workspace_member_role','remove_workspace_member','add_project_member','set_project_member_role','remove_project_member')`,
    )
    expect(adminFloorFns).toContain('WORKSPACE_ADMIN_REQUIRED')
    expect(adminFloorFns).toContain('PROJECT_ADMIN_REQUIRED')
  })

  itIfPg('duplicate_cards RPC exists (atomic card duplication)', () => {
    const count = psqlQuery(
      `select count(*) from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='duplicate_cards'`,
    )
    expect(Number(count)).toBe(1)
  })

  itIfPg('deploy_healthcheck RPC exists and is executable only by service_role', () => {
    const signatures = psqlQuery(
      `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public'
         and p.proname = 'deploy_healthcheck'`,
    ).split('\n')
    expect(signatures).toEqual(['deploy_healthcheck()'])

    const privileges = psqlQuery(
      `select
         has_function_privilege('service_role', 'public.deploy_healthcheck()', 'EXECUTE')::text
         || ',' ||
         has_function_privilege('authenticated', 'public.deploy_healthcheck()', 'EXECUTE')::text
         || ',' ||
         has_function_privilege('anon', 'public.deploy_healthcheck()', 'EXECUTE')::text`,
    )
    expect(privileges).toBe('true,false,false')

    expect(psqlQuery(`select public.deploy_healthcheck()::text`)).toBe('true')
  })

  itIfPg('project_scoped_task_mode helpers exist', () => {
    const names = psqlQuery(
      `select distinct p.proname
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public'
         and p.proname in (
           'get_project_task_mode','set_project_task_mode',
           'get_gantt_shared_config_by_view_id','set_gantt_shared_config_by_view_id',
           'normalize_project_gantt_shared_config','normalize_project_table_shared_config',
           'default_table_shared_config'
         )
       order by 1`,
    ).split('\n')
    expect(names).toEqual([
      'default_table_shared_config',
      'get_gantt_shared_config_by_view_id',
      'get_project_task_mode',
      'normalize_project_gantt_shared_config',
      'normalize_project_table_shared_config',
      'set_gantt_shared_config_by_view_id',
      'set_project_task_mode',
    ])
  })

  // ---------------------------------------------------------------------------
  // Column shape for billing, AI, notes, wiki — preserving the original text-grep
  // test assertions as execution-based checks
  // ---------------------------------------------------------------------------
  itIfPg('ai_api_keys has credential + refresh token columns for the subscription-auth flow', () => {
    const columns = psqlQuery(
      `select column_name
       from information_schema.columns
       where table_schema='public' and table_name='ai_api_keys'
         and column_name in ('credential_kind','encrypted_refresh_token','expires_at')
       order by 1`,
    ).split('\n')
    expect(columns).toEqual(['credential_kind', 'encrypted_refresh_token', 'expires_at'])
  })

  itIfPg('ai_api_keys credential_kind restricts to api_key/subscription', () => {
    const check = psqlQuery(
      `select pg_get_constraintdef(c.oid)
       from pg_catalog.pg_constraint c
       join pg_catalog.pg_class cls on cls.oid=c.conrelid
       join pg_catalog.pg_namespace n on n.oid=cls.relnamespace
       where n.nspname='public' and cls.relname='ai_api_keys' and c.contype='c'
         and pg_get_constraintdef(c.oid) like '%credential_kind%'`,
    )
    expect(check).toContain('api_key')
    expect(check).toContain('subscription')
  })

  itIfPg('ai_api_keys has the user/org credential unique indexes', () => {
    const indexes = psqlQuery(
      `select indexname from pg_indexes
       where schemaname='public' and tablename='ai_api_keys'
         and indexname like '%credential_unique%'
       order by indexname`,
    ).split('\n')
    expect(indexes).toContain('ai_api_keys_user_provider_credential_unique')
    expect(indexes).toContain('ai_api_keys_org_provider_credential_unique')
  })

  itIfPg('ai_personas default model is the corrected Anthropic sonnet string', () => {
    const modelDefault = psqlQuery(
      `select column_default from information_schema.columns
       where table_schema='public' and table_name='ai_personas' and column_name='model'`,
    )
    expect(modelDefault).toContain('claude-sonnet-4-20250514')
    expect(modelDefault).not.toContain('claude-sonnet-4-5-20250514')
  })

  itIfPg('ai_provider_oauth_states table exists', () => {
    const count = psqlQuery(
      `select count(*) from information_schema.tables
       where table_schema='public' and table_name='ai_provider_oauth_states'`,
    )
    expect(Number(count)).toBe(1)
  })

  itIfPg('billing_webhook_events table + processing_result check constraint', () => {
    const count = psqlQuery(
      `select count(*) from information_schema.tables
       where table_schema='public' and table_name='billing_webhook_events'`,
    )
    expect(Number(count)).toBe(1)

    // processing_result should accept the known set of values.
    const checkSql = psqlQuery(
      `select pg_get_constraintdef(c.oid)
       from pg_catalog.pg_constraint c
       join pg_catalog.pg_class cls on cls.oid=c.conrelid
       join pg_catalog.pg_namespace n on n.oid=cls.relnamespace
       where n.nspname='public' and cls.relname='billing_webhook_events' and c.contype='c'`,
    )
    expect(checkSql).toContain('processing')
    expect(checkSql).toContain('applied')
    expect(checkSql).toContain('ignored_stale')
  })

  itIfPg('plan_status drops trialing', () => {
    const orgsConstraint = psqlQuery(
      `select pg_get_constraintdef(c.oid)
       from pg_catalog.pg_constraint c
       join pg_catalog.pg_class cls on cls.oid=c.conrelid
       join pg_catalog.pg_namespace n on n.oid=cls.relnamespace
       where n.nspname='public' and cls.relname='organizations' and c.contype='c'
       and pg_get_constraintdef(c.oid) like '%plan_status%'`,
    )
    expect(orgsConstraint).toContain('active')
    expect(orgsConstraint).toContain('past_due')
    expect(orgsConstraint).toContain('canceled')
    expect(orgsConstraint).not.toContain('trialing')
  })

  itIfPg('upgrade_org_plan RPC was removed', () => {
    const count = psqlQuery(
      `select count(*) from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='upgrade_org_plan'`,
    )
    expect(Number(count)).toBe(0)
  })

  itIfPg('note_import_connections table + provider check constraint', () => {
    const count = psqlQuery(
      `select count(*) from information_schema.tables
       where table_schema='public' and table_name='note_import_connections'`,
    )
    expect(Number(count)).toBe(1)

    const providerCheck = psqlQuery(
      `select pg_get_constraintdef(c.oid)
       from pg_catalog.pg_constraint c
       join pg_catalog.pg_class cls on cls.oid=c.conrelid
       join pg_catalog.pg_namespace n on n.oid=cls.relnamespace
       where n.nspname='public' and cls.relname='note_import_connections' and c.contype='c'
       and pg_get_constraintdef(c.oid) like '%provider%'`,
    )
    expect(providerCheck).toContain('granola')
    expect(providerCheck).toContain('obsidian')

    const authMethodDefault = psqlQuery(
      `select column_default from information_schema.columns
       where table_schema='public' and table_name='note_import_connections' and column_name='auth_method'`,
    )
    expect(authMethodDefault).toContain("'api_key'")
  })

  itIfPg('cards.body_md column exists (post rename from body_text)', () => {
    const bodyMd = psqlQuery(
      `select count(*) from information_schema.columns
       where table_schema='public' and table_name='cards' and column_name='body_md'`,
    )
    expect(Number(bodyMd)).toBe(1)

    const bodyText = psqlQuery(
      `select count(*) from information_schema.columns
       where table_schema='public' and table_name='cards' and column_name='body_text'`,
    )
    expect(Number(bodyText)).toBe(0)
  })

  itIfPg('wiki_pages has slug unique-on-active index with nulls-not-distinct semantics', () => {
    const indexes = psqlQuery(
      `select indexdef from pg_indexes
       where schemaname='public' and tablename='wiki_pages' and indexname='wiki_pages_slug_unique'`,
    ).toLowerCase()
    expect(indexes).toContain('nulls not distinct')
    expect(indexes).toContain('where (deleted_at is null)')
  })

  itIfPg('wiki search function has full_path column', () => {
    const def = psqlQuery(
      `select pg_get_functiondef(p.oid)
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='search_wiki_pages'
       limit 1`,
    )
    expect(def).toContain('full_path text,')
  })

  itIfPg('pinned wiki metadata function only returns the caller pins they can still access', () => {
    const def = psqlQuery(
      `select pg_get_functiondef(p.oid)
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='list_pinned_pages_with_metadata'
       limit 1`,
    )
    expect(def).toContain('target_user_id = auth.uid()')
    expect(def).toContain('public.can_edit_organization(wp.organization_id, auth.uid())')
    expect(def).toContain('public.can_access_project(wp.project_id)')
  })

  itIfPg('update_wiki_page carries the 9-arg signature', () => {
    const args = psqlQuery(
      `select pg_get_function_identity_arguments(p.oid)
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='update_wiki_page'`,
    )
    // 9 arguments: uuid, text, jsonb, text, text, uuid, integer, text, integer.
    // Argument names have evolved but the signature shape is the contract.
    const argCount = args.split(',').length
    expect(argCount).toBe(9)
    expect(args).toContain('target_page_id uuid')
    expect(args).toContain('target_title text')
    expect(args).toContain('target_content_json jsonb')
    expect(args).toContain('target_content_md text')
    expect(args).toContain('expected_version integer')
  })

  // ---------------------------------------------------------------------------
  // RLS: organization_members policies don't self-recursively read membership
  // ---------------------------------------------------------------------------
  itIfPg('organization_members RLS uses can_access_organization helper', () => {
    const policies = psqlQuery(
      `select policyname || ' => ' || qual
       from pg_catalog.pg_policies
       where schemaname='public' and tablename='organization_members'
       order by policyname`,
    )
    expect(policies).toContain('can_access_organization')
    expect(policies).toContain('can_manage_organization')
  })

  // ---------------------------------------------------------------------------
  // Migration history is exactly the expected file set
  // ---------------------------------------------------------------------------
  itIfPg('supabase_migrations history covers the expected file set', () => {
    const versions = psqlQuery(
      `select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations`,
    ).split(',')
    const missingVersions = expectedMigrationVersions.filter(version => !versions.includes(version))
    const unexpectedVersions = versions.filter(version => !expectedMigrationVersions.includes(version))

    expect(missingVersions).toEqual([])

    if (unexpectedVersions.length > 0) {
      console.warn(
        `[migration-contract] Local supabase_migrations contains extra versions not present in the repo: ${unexpectedVersions.join(', ')}. Run \`supabase db reset\` if you need an exact local history match.`,
      )
    }
  })
})
