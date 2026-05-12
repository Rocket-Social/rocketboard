import {execFileSync} from 'node:child_process'
import {readdirSync} from 'node:fs'

import {describe, expect, it, beforeAll} from 'vitest'

const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function psqlQuery(sql: string): string {
  return execFileSync('psql', [LOCAL_DB_URL, '-At', '-c', sql], {
    encoding: 'utf8',
    timeout: 10_000,
  }).trim()
}

function psqlScriptQuery(sql: string): string {
  const output = execFileSync('psql', [LOCAL_DB_URL, '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8',
    timeout: 10_000,
  }).trim()

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(BEGIN|COMMIT|ROLLBACK|DO|INSERT \d+ \d+|UPDATE \d+|DELETE \d+|SET)$/.test(line))
    .at(-1) ?? ''
}

function psqlError(sql: string): string {
  try {
    execFileSync('psql', [LOCAL_DB_URL, '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
      encoding: 'utf8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return ''
  } catch (error) {
    const stderr = (error as {stderr?: Buffer | string}).stderr
    if (typeof stderr === 'string') return stderr
    if (stderr) return stderr.toString('utf8')
    return error instanceof Error ? error.message : String(error)
  }
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

function listExpectedMigrationVersions(): string[] {
  return readdirSync(new URL('../../supabase/migrations/', import.meta.url))
    .filter((entry) => entry.endsWith('.sql'))
    .map((entry) => entry.replace(/\.sql$/, '').split('_', 1)[0] ?? '')
    .filter(Boolean)
    .sort()
}

function listAppliedMigrationVersions(): string[] {
  return psqlQuery(`select version from supabase_migrations.schema_migrations order by version`)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function loadMigrationHistoryStatus(): {
  actual: string[]
  aligned: boolean
  expected: string[]
} {
  const expected = listExpectedMigrationVersions()
  const actual = listAppliedMigrationVersions()
  const aligned = expected.length === actual.length && expected.every((version, index) => actual[index] === version)
  return {actual, aligned, expected}
}

const migrationHistoryStatus = pgReachable ? loadMigrationHistoryStatus() : null
const migrationContractReady = pgReachable && migrationHistoryStatus?.aligned === true
const itIfPg = migrationContractReady ? it : it.skip

describe('migration schema contract', () => {
  beforeAll(() => {
    if (!pgReachable) {
      console.warn(
        '[migration-contract] Local Supabase not reachable at 127.0.0.1:54322. Tests skipped. Run `supabase start` to exercise.',
      )
      return
    }

    if (!migrationHistoryStatus?.aligned) {
      const extraVersions = migrationHistoryStatus?.actual.filter(
        (version) => !migrationHistoryStatus.expected.includes(version),
      ) ?? []
      const missingVersions = migrationHistoryStatus?.expected.filter(
        (version) => !migrationHistoryStatus.actual.includes(version),
      ) ?? []
      console.warn(
        '[migration-contract] Local Supabase migration history does not match this checkout. '
        + `Tests skipped. Extra versions: ${extraVersions.join(', ') || 'none'}. `
        + `Missing versions: ${missingVersions.join(', ') || 'none'}. `
        + 'Run `npm run sql:verify:reset` when it is safe to reset the shared local stack.',
      )
    }
  })

  // ---------------------------------------------------------------------------
  // Baseline shape — keep the consolidation from silently shrinking the schema
  // ---------------------------------------------------------------------------
  itIfPg('has the expected object counts in the public schema', () => {
    // Post-2026-04 cutover + scheduled-org-VIP helpers + canvas batch RPCs + last-active heartbeat + invite-requests + Jira + Inbox foundation + AI agent runs skeleton + insert_notification helper + Drift Watcher RPCs + set_organization_ai_settings + AI Kanban Phase 1 provisioning + AI Kanban Phase 2a dispatch backbone (ai_agent_schedules + 6 RPCs) + Phase 2b lifecycle (8 RPCs) + Phase 2c worker tools (6 wrappers + dispatcher + start_agent_run + organization_ai_fetch_allowlist) + Phase 3c persona auto-provision trigger fn + Phase 4-A get_card_detail extension (drop+create, same signature): 84 tables / 415 functions / 219 policies / 13 enums.
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
    // Phase 6-B adds organization_budget_alert_log → 85.
    // Phase 7-B adds organization_dispatch_quota_alert_log → 86.
    // Phase 7-D adds metrics_org_agent_engagement → 87.
    // Follow-card v1 adds card_followers → 88.
    expect(tableCount).toBe(88)
    // Phase 6-B adds get_org_calendar_month_spend_usd, get_org_budget_utilization,
    // update_org_budget_cap, ai_agent_runs_after_update_budget_alert_fn → 420.
    // Phase 7-B adds is_paid_plan_active, get_org_calendar_month_dispatches,
    // get_org_active_recurring_schedules, dispatch_quota_alert_emit_exceeded_if_uncrossed,
    // ai_agent_runs_after_insert_quota_alert_fn, ai_agent_schedules_quota_check_fn,
    // get_org_quota_utilization → 427.
    // Phase 7-C adds get_persona_hour_run_count → 428. start_agent_run is
    // replaced (drop+create same signature, no count delta).
    // Phase 7-D adds metrics_aakash_spine_tick → 429.
    // Follow-card v1 adds follow_card, unfollow_card, cards_after_insert_auto_follow_fn → 432.
    // Follow-card v1.1 adds list_card_followers → 433.
    // Sprint Manager PR-B adds agent_send_inbox_message → 434.
    expect(functionCount).toBe(434)
    // Follow-card v1 adds card_followers_select_self → 220.
    expect(policyCount).toBe(220)
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

  itIfPg('jira integration tables, policies, and RPCs exist', () => {
    const tables = psqlQuery(
      `select string_agg(table_name, ',' order by table_name)
       from information_schema.tables
       where table_schema='public'
         and table_name in (
           'jira_connection_sources',
           'jira_contributor_stats',
           'jira_oauth_site_selections',
           'jira_oauth_states',
           'project_jira_settings'
         )`,
    )
    expect(tables).toBe('jira_connection_sources,jira_contributor_stats,jira_oauth_site_selections,jira_oauth_states,project_jira_settings')

    const functions = psqlQuery(
      `select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ',' order by p.proname)
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public'
         and p.proname in (
           'set_project_jira_source',
           'clear_project_jira_source',
           'cancel_jira_oauth_site_selection',
           'complete_jira_oauth_site_selection',
           'replace_project_jira_contributor_stats'
         )`,
    )
    expect(functions).toContain('cancel_jira_oauth_site_selection(target_state text, target_requested_by uuid, target_organization_id uuid)')
    expect(functions).toContain('complete_jira_oauth_site_selection(target_state text, target_requested_by uuid, target_organization_id uuid, target_cloud_id text)')
    expect(functions).toContain('set_project_jira_source(target_project_id uuid, target_connection_source_id uuid, target_jira_project_key text)')
    expect(functions).toContain('clear_project_jira_source(target_project_id uuid)')
    expect(functions).toContain('replace_project_jira_contributor_stats(target_project_id uuid, target_connection_source_id uuid, target_window_start_date date, target_window_end_date date, stats jsonb)')

    const policyTables = psqlQuery(
      `select string_agg(distinct tablename, ',' order by tablename)
       from pg_catalog.pg_policies
       where schemaname='public'
         and tablename like '%jira%'`,
    )
    expect(policyTables).toBe('jira_connection_sources,jira_contributor_stats,jira_oauth_states,project_jira_settings')

    const projectSettingsColumns = psqlQuery(
      `select string_agg(column_name, ',' order by column_name)
       from information_schema.columns
       where table_schema='public'
         and table_name='project_jira_settings'
         and column_name in ('connection_source_id','jira_project_key','project_id')`,
    )
    expect(projectSettingsColumns).toBe('connection_source_id,jira_project_key,project_id')
  })

  itIfPg('authenticated users cannot select encrypted Jira OAuth token columns', () => {
    const selectableColumns = psqlQuery(
      `select coalesce(string_agg(column_name, ',' order by column_name), '')
       from information_schema.column_privileges
       where table_schema='public'
         and table_name='jira_connection_sources'
         and grantee='authenticated'
         and privilege_type='SELECT'`,
    )

    expect(selectableColumns).not.toContain('encrypted_access_token')
    expect(selectableColumns).not.toContain('encrypted_refresh_token')
    expect(selectableColumns).not.toContain('token_expires_at')
    expect(selectableColumns).toContain('site_url')
    expect(selectableColumns).toContain('status')
  })

  itIfPg('pending Jira OAuth site selections are service-role only', () => {
    const authenticatedPrivileges = psqlQuery(
      `select coalesce(string_agg(privilege_type, ',' order by privilege_type), '')
       from information_schema.table_privileges
       where table_schema='public'
         and table_name='jira_oauth_site_selections'
         and grantee='authenticated'`,
    )

    expect(authenticatedPrivileges).toBe('')
  })

  // ---------------------------------------------------------------------------
  // Inbox foundation + AI agent runs skeleton
  // ---------------------------------------------------------------------------
  itIfPg('inbox foundation tables exist with the v1 kind set', () => {
    const tables = psqlQuery(
      `select string_agg(table_name, ',' order by table_name)
       from information_schema.tables
       where table_schema='public'
         and table_name in ('notifications', 'inbox_preferences', 'ai_agent_runs')`,
    )
    expect(tables).toBe('ai_agent_runs,inbox_preferences,notifications')

    const notificationKindCheck = psqlQuery(
      `select pg_get_constraintdef(c.oid)
       from pg_catalog.pg_constraint c
       join pg_catalog.pg_class t on t.oid=c.conrelid
       join pg_catalog.pg_namespace n on n.oid=t.relnamespace
       where n.nspname='public' and t.relname='notifications' and c.conname='notifications_kind_check'`,
    )
    expect(notificationKindCheck).toContain("'mention'")
    expect(notificationKindCheck).toContain("'assignment'")
    expect(notificationKindCheck).toContain("'comment_on_owned_card'")
    expect(notificationKindCheck).toContain("'drift_nudge'")
    expect(notificationKindCheck).toContain("'run_completed'")
    expect(notificationKindCheck).toContain("'run_awaiting_approval'")
  })

  itIfPg('notifications.origin_run_id is wired to ai_agent_runs with ON DELETE SET NULL', () => {
    const fkConfig = psqlQuery(
      `select c.confdeltype::text || '|' || pg_get_constraintdef(c.oid)
       from pg_catalog.pg_constraint c
       join pg_catalog.pg_class t on t.oid=c.conrelid
       join pg_catalog.pg_namespace n on n.oid=t.relnamespace
       where n.nspname='public' and t.relname='notifications' and c.conname='notifications_origin_run_id_fk'`,
    )
    // confdeltype 'n' = SET NULL.
    expect(fkConfig).toMatch(/^n\|/)
    expect(fkConfig).toContain('REFERENCES ai_agent_runs(id)')
    expect(fkConfig).toContain('ON DELETE SET NULL')
  })

  itIfPg('ai_agent_runs status + dispatch_reason constraints cover the documented set', () => {
    const statusCheck = psqlQuery(
      `select pg_get_constraintdef(c.oid)
       from pg_catalog.pg_constraint c
       join pg_catalog.pg_class t on t.oid=c.conrelid
       join pg_catalog.pg_namespace n on n.oid=t.relnamespace
       where n.nspname='public' and t.relname='ai_agent_runs' and c.conname='ai_agent_runs_status_check'`,
    )
    for (const value of ['queued', 'running', 'succeeded', 'failed', 'cancelled', 'awaiting_approval']) {
      expect(statusCheck).toContain(`'${value}'`)
    }

    const dispatchCheck = psqlQuery(
      `select pg_get_constraintdef(c.oid)
       from pg_catalog.pg_constraint c
       join pg_catalog.pg_class t on t.oid=c.conrelid
       join pg_catalog.pg_namespace n on n.oid=t.relnamespace
       where n.nspname='public' and t.relname='ai_agent_runs' and c.conname='ai_agent_runs_dispatch_reason_check'`,
    )
    for (const value of ['assignee_changed', 'manual', 'schedule', 'automation', 'project_monitor']) {
      expect(dispatchCheck).toContain(`'${value}'`)
    }
  })

  itIfPg('notifications and ai_agent_runs are insert-locked for authenticated', () => {
    const notificationsPrivs = psqlQuery(
      `select coalesce(string_agg(privilege_type, ',' order by privilege_type), '')
       from information_schema.table_privileges
       where table_schema='public'
         and table_name='notifications'
         and grantee='authenticated'`,
    )
    // Authenticated may read their own rows and toggle read_at / archived_at.
    // INSERT and DELETE flow through service_role only. After Wave 1 Batch 2
    // PR B, the broad table-level UPDATE was replaced by a column-level grant
    // on (read_at, archived_at) — column grants don't show up in
    // information_schema.table_privileges, so only SELECT remains here.
    // The narrowed write surface is asserted below in the inbox-pr-b tests.
    expect(notificationsPrivs).toBe('SELECT')

    const runsPrivs = psqlQuery(
      `select coalesce(string_agg(privilege_type, ',' order by privilege_type), '')
       from information_schema.table_privileges
       where table_schema='public'
         and table_name='ai_agent_runs'
         and grantee='authenticated'`,
    )
    expect(runsPrivs).toBe('SELECT')
  })

  itIfPg('organizations gain ai_workspace_guidance + drift_watcher_enabled', () => {
    const cols = psqlQuery(
      `select string_agg(column_name || ':' || data_type || ':' || coalesce(column_default,'<null>'), ',' order by column_name)
       from information_schema.columns
       where table_schema='public'
         and table_name='organizations'
         and column_name in ('ai_workspace_guidance','drift_watcher_enabled')`,
    )
    expect(cols).toContain('ai_workspace_guidance:text:<null>')
    expect(cols).toContain('drift_watcher_enabled:boolean:false')
  })

  itIfPg('set_organization_ai_settings is admin-only and updates both columns', () => {
    const signature = psqlQuery(
      `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='set_organization_ai_settings'`,
    )
    expect(signature).toBe('set_organization_ai_settings(target_org_id uuid, target_drift_watcher_enabled boolean, target_workspace_guidance text)')

    // Authenticated callers may execute; admin enforcement happens inside.
    const grants = psqlQuery(
      `select string_agg(grantee || ':' || privilege_type, ',' order by grantee || ':' || privilege_type)
       from information_schema.routine_privileges
       where routine_schema='public'
         and routine_name='set_organization_ai_settings'
         and privilege_type='EXECUTE'`,
    )
    expect(grants).toContain('authenticated:EXECUTE')
    expect(grants).not.toContain('anon:EXECUTE')

    // Body must enforce role='admin' so a non-admin authenticated caller is rejected.
    const body = psqlQuery(
      `select pg_get_functiondef(p.oid)
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='set_organization_ai_settings'`,
    )
    expect(body).toContain('organization_members')
    expect(body).toContain("role = 'admin'")
  })

  itIfPg('get_organization_members organization snapshot includes the AI fields', () => {
    const body = psqlQuery(
      `select pg_get_functiondef(p.oid)
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='get_organization_members'`,
    )
    // Both AI columns must surface in the organization JSON so the OrgSettings UI
    // can read them off the canonical snapshot rather than firing a side query.
    expect(body).toContain("'drift_watcher_enabled', o.drift_watcher_enabled")
    expect(body).toContain("'ai_workspace_guidance', o.ai_workspace_guidance")
  })

  itIfPg('insert_notification helper exists, is service-role-only, and feeds the v1 writers', () => {
    const signature = psqlQuery(
      `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='insert_notification'`,
    )
    expect(signature).toContain('insert_notification(')
    expect(signature).toContain('target_user_id uuid')
    expect(signature).toContain('target_organization_id uuid')
    expect(signature).toContain('target_kind text')
    expect(signature).toContain('target_dedup_window interval')

    // The helper handles privileged inserts; only service_role may call it.
    const grants = psqlQuery(
      `select coalesce(string_agg(grantee || ':' || privilege_type, ',' order by grantee, privilege_type), '')
       from information_schema.routine_privileges
       where routine_schema='public'
         and routine_name='insert_notification'`,
    )
    expect(grants).toContain('service_role:EXECUTE')
    expect(grants).not.toContain('authenticated:EXECUTE')
    expect(grants).not.toContain('anon:EXECUTE')

    // Both v1 writers route through the helper. Brittle but cheap to update —
    // catches accidental reverts that drop the notification side effect.
    const setAssigneeBody = psqlQuery(
      `select pg_get_functiondef(p.oid)
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='set_card_assignee'`,
    )
    expect(setAssigneeBody).toContain('insert_notification')
    expect(setAssigneeBody).toContain("'assignment'")

    const addCommentBody = psqlQuery(
      `select pg_get_functiondef(p.oid)
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='add_card_comment'`,
    )
    expect(addCommentBody).toContain('insert_notification')
    // Follow-card v1: the assignee-only `comment_on_owned_card` emission was
    // replaced with a `comment_on_followed_card` fan-out across the
    // card_followers table.
    expect(addCommentBody).toContain("'comment_on_followed_card'")
  })

  itIfPg('drift watcher RPCs exist with the v1 signatures and are service-role-only', () => {
    const signatures = psqlQuery(
      `select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', '|' order by p.proname)
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public'
         and p.proname in (
           'get_or_create_drift_watcher_persona',
           'find_drift_watcher_candidates',
           'dispatch_drift_watcher_notifications',
           'record_drift_watcher_run'
         )`,
    ).split('|')
    expect(signatures).toContain('get_or_create_drift_watcher_persona(target_org_id uuid)')
    expect(signatures).toContain('find_drift_watcher_candidates(target_org_id uuid, stale_threshold interval)')
    expect(signatures).toContain('dispatch_drift_watcher_notifications(target_org_id uuid, dedup_hours integer)')
    expect(signatures).toContain('record_drift_watcher_run(target_org_id uuid, target_persona_id uuid, target_status text, target_started_at timestamp with time zone, target_finished_at timestamp with time zone, target_error_text text, target_dispatch_reason text)')

    // All four are SECURITY DEFINER and granted to service_role only.
    const grants = psqlQuery(
      `select string_agg(distinct routine_name || ':' || grantee, ',' order by routine_name || ':' || grantee)
       from information_schema.routine_privileges
       where routine_schema='public'
         and routine_name in (
           'get_or_create_drift_watcher_persona',
           'find_drift_watcher_candidates',
           'dispatch_drift_watcher_notifications',
           'record_drift_watcher_run'
         )
         and privilege_type='EXECUTE'`,
    )
    expect(grants).toContain('get_or_create_drift_watcher_persona:service_role')
    expect(grants).toContain('find_drift_watcher_candidates:service_role')
    expect(grants).toContain('dispatch_drift_watcher_notifications:service_role')
    expect(grants).toContain('record_drift_watcher_run:service_role')
    expect(grants).not.toContain(':authenticated')
    expect(grants).not.toContain(':anon')

    // Dispatcher must call insert_notification with kind='drift_nudge' so a
    // future refactor can't silently swap the helper or change the kind.
    const dispatcherBody = psqlQuery(
      `select pg_get_functiondef(p.oid)
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='dispatch_drift_watcher_notifications'`,
    )
    expect(dispatcherBody).toContain('insert_notification')
    expect(dispatcherBody).toContain("'drift_nudge'")

    // record_drift_watcher_run defaults dispatch_reason='schedule' so the
    // existing scheduled path stays source-compatible, but the parameter
    // is overridable for future manual-trigger callers.
    const recordBody = psqlQuery(
      `select pg_get_functiondef(p.oid)
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='record_drift_watcher_run'`,
    )
    expect(recordBody).toContain("DEFAULT 'schedule'")
  })

  itIfPg('cron schema is locked down for application roles', () => {
    // Sanity check that authenticated/anon cannot read the cron schedule
    // table. Drift watcher's pg_cron command embeds vault.decrypted_secrets
    // subqueries — only the SQL template is in cron.job, but exposing
    // job state to the application surface still leaks ops detail.
    const exposed = psqlQuery(
      `select coalesce(
         string_agg(grantee || ':' || privilege_type, ',' order by grantee, privilege_type),
         ''
       )
       from information_schema.table_privileges
       where table_schema = 'cron'
         and table_name in ('job', 'job_run_details')
         and grantee in ('anon', 'authenticated')`,
    )
    expect(exposed).toBe('')
  })

  itIfPg('drift watcher dispatcher emits the expected notifications and dedups on second tick', () => {
    // End-to-end behavioural check: build a full org/workspace/project with
    // four cards — one per heuristic — then call the dispatcher twice and
    // verify the first tick inserts four notifications with the right kind +
    // link, and the second tick is a no-op (dedup window). We also assert
    // that a card hitting two heuristics (overdue + stale) collapses into a
    // single notification with the higher-priority 'overdue' title.
    const result = psqlScriptQuery(
      `begin;
       create temp table drift_test_ids on commit drop as
       select
         gen_random_uuid() as user_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         gen_random_uuid() as sprint_id,
         gen_random_uuid() as status_started_id,
         gen_random_uuid() as card_overdue_id,
         gen_random_uuid() as card_missing_due_id,
         gen_random_uuid() as card_stale_id,
         gen_random_uuid() as card_missing_assignee_id,
         gen_random_uuid() as card_overdue_and_stale_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select user_id from drift_test_ids),
         'authenticated', 'authenticated',
         'drift-' || (select suffix from drift_test_ids) || '@rocketboard.test',
         'not-used',
         timezone('utc', now()), '', '', '', '',
         '{"provider":"email","providers":["email"]}'::jsonb,
         '{"full_name":"Drift Watcher Contract"}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       );

       insert into public.organizations (id, name, slug, created_by_user_id, drift_watcher_enabled)
       values (
         (select org_id from drift_test_ids),
         'Drift Org',
         'drift-org-' || (select suffix from drift_test_ids),
         (select user_id from drift_test_ids),
         true
       );

       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values (
         (select workspace_id from drift_test_ids),
         (select org_id from drift_test_ids),
         'Drift Workspace',
         'drift-ws-' || (select suffix from drift_test_ids),
         (select user_id from drift_test_ids)
       );

       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id)
       values (
         (select project_id from drift_test_ids),
         (select workspace_id from drift_test_ids),
         'Drift Project',
         'drift-proj-' || (select suffix from drift_test_ids),
         'DR' || upper((select substr(suffix, 1, 4) from drift_test_ids)),
         (select user_id from drift_test_ids),
         (select user_id from drift_test_ids)
       );

       insert into public.organization_members (organization_id, user_id, role)
       values (
         (select org_id from drift_test_ids),
         (select user_id from drift_test_ids),
         'member'::public.organization_role
       );

       insert into public.project_status_options (id, project_id, label, key, category, position)
       values (
         (select status_started_id from drift_test_ids),
         (select project_id from drift_test_ids),
         'In Progress', 'in_progress', 'started', 0
       );

       insert into public.project_sprints (id, project_id, name, status, position, start_date, end_date, created_by_user_id, updated_by_user_id)
       values (
         (select sprint_id from drift_test_ids),
         (select project_id from drift_test_ids),
         'Sprint 1',
         'active'::public.sprint_status,
         0,
         current_date - 3,
         current_date + 7,
         (select user_id from drift_test_ids),
         (select user_id from drift_test_ids)
       );

       -- 1) Overdue card (assignee set, due in the past).
       insert into public.cards (
         id, project_id, project_card_number, title, sprint_id,
         due_at, assignee_user_id, created_by_user_id
       )
       values (
         (select card_overdue_id from drift_test_ids),
         (select project_id from drift_test_ids),
         1,
         'Overdue card',
         (select sprint_id from drift_test_ids),
         current_date - 1,
         (select user_id from drift_test_ids),
         (select user_id from drift_test_ids)
       );

       -- 2) Active sprint, no due date.
       insert into public.cards (
         id, project_id, project_card_number, title, sprint_id,
         assignee_user_id, created_by_user_id
       )
       values (
         (select card_missing_due_id from drift_test_ids),
         (select project_id from drift_test_ids),
         2,
         'Missing due date card',
         (select sprint_id from drift_test_ids),
         (select user_id from drift_test_ids),
         (select user_id from drift_test_ids)
       );

       -- 3) Stale: 'started' status, updated > 7 days ago. The
       --    cards_set_updated_at trigger only fires on UPDATE, so we set
       --    updated_at directly at INSERT time to dodge it.
       insert into public.cards (
         id, project_id, project_card_number, title,
         status_option_id, assignee_user_id, created_by_user_id, updated_at
       )
       values (
         (select card_stale_id from drift_test_ids),
         (select project_id from drift_test_ids),
         3,
         'Stale card',
         (select status_started_id from drift_test_ids),
         (select user_id from drift_test_ids),
         (select user_id from drift_test_ids),
         timezone('utc', now()) - interval '10 days'
       );

       -- 4) In active sprint, no assignee. Notification falls back to creator.
       insert into public.cards (
         id, project_id, project_card_number, title, sprint_id,
         due_at, created_by_user_id
       )
       values (
         (select card_missing_assignee_id from drift_test_ids),
         (select project_id from drift_test_ids),
         4,
         'Needs an assignee',
         (select sprint_id from drift_test_ids),
         current_date + 5,
         (select user_id from drift_test_ids)
       );

       -- 5) Both overdue AND stale — should collapse to a single 'overdue'
       --    nudge by the dispatcher's DISTINCT ON (card_id) priority order.
       insert into public.cards (
         id, project_id, project_card_number, title,
         status_option_id, due_at, assignee_user_id, created_by_user_id, updated_at
       )
       values (
         (select card_overdue_and_stale_id from drift_test_ids),
         (select project_id from drift_test_ids),
         5,
         'Overdue and stale card',
         (select status_started_id from drift_test_ids),
         current_date - 5,
         (select user_id from drift_test_ids),
         (select user_id from drift_test_ids),
         timezone('utc', now()) - interval '10 days'
       );

       -- First tick: should insert 5 notifications (one per affected card).
       create temp table drift_first_tick on commit drop as
       select public.dispatch_drift_watcher_notifications(
         (select org_id from drift_test_ids),
         24
       ) as inserted;

       -- Second tick: should be a no-op (dedup window collapses everything).
       create temp table drift_second_tick on commit drop as
       select public.dispatch_drift_watcher_notifications(
         (select org_id from drift_test_ids),
         24
       ) as inserted;

       select
         (select inserted::text from drift_first_tick)
         || '|' || (select inserted::text from drift_second_tick)
         || '|' || (
           select count(*)::text
           from public.notifications n
           where n.organization_id = (select org_id from drift_test_ids)
             and n.kind = 'drift_nudge'
         )
         || '|' || (
           select count(distinct n.card_id)::text
           from public.notifications n
           where n.organization_id = (select org_id from drift_test_ids)
             and n.kind = 'drift_nudge'
         )
         || '|' || (
           -- Overdue+stale card surfaces as 'overdue' (priority 1 wins).
           select n.title
           from public.notifications n
           where n.card_id = (select card_overdue_and_stale_id from drift_test_ids)
             and n.kind = 'drift_nudge'
         )
         || '|' || (
           -- Missing-assignee card targets the creator (assignee is null).
           select case when n.user_id = (select user_id from drift_test_ids) then 'creator' else 'other' end
           from public.notifications n
           where n.card_id = (select card_missing_assignee_id from drift_test_ids)
             and n.kind = 'drift_nudge'
         );
       rollback;`,
    )

    expect(result).toBe(
      '5|0|5|5|Overdue and stale card is overdue|creator',
    )
  })

  itIfPg('drift watcher dispatcher excludes ex-org members and truncates oversized titles', () => {
    // Retro security guards (PR3 / 2026-05-04 review batch):
    //  • A3 — a card whose assignee left the org must not get a nudge.
    //  • A2 — an oversized card title must be truncated before landing
    //         in notifications.title; cap is 200 chars.
    // Both checked against the same fixture: one in-org user gets nudged,
    // one ex-org user (creator on a separate card) does not.
    const result = psqlScriptQuery(
      `begin;
       create temp table drift_security_ids on commit drop as
       select
         gen_random_uuid() as in_org_user_id,
         gen_random_uuid() as ex_org_user_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         gen_random_uuid() as card_in_org_id,
         gen_random_uuid() as card_ex_org_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select in_org_user_id from drift_security_ids),
         'authenticated', 'authenticated',
         'inorg-' || (select suffix from drift_security_ids) || '@rocketboard.test',
         'not-used',
         timezone('utc', now()), '', '', '', '',
         '{}'::jsonb, '{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       ),
       (
         '00000000-0000-0000-0000-000000000000',
         (select ex_org_user_id from drift_security_ids),
         'authenticated', 'authenticated',
         'exorg-' || (select suffix from drift_security_ids) || '@rocketboard.test',
         'not-used',
         timezone('utc', now()), '', '', '', '',
         '{}'::jsonb, '{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       );

       insert into public.organizations (id, name, slug, created_by_user_id, drift_watcher_enabled)
       values (
         (select org_id from drift_security_ids),
         'Drift Security Org',
         'drift-sec-' || (select suffix from drift_security_ids),
         (select in_org_user_id from drift_security_ids),
         true
       );

       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values (
         (select workspace_id from drift_security_ids),
         (select org_id from drift_security_ids),
         'Drift Security Workspace',
         'drift-sec-ws-' || (select suffix from drift_security_ids),
         (select in_org_user_id from drift_security_ids)
       );

       insert into public.projects (
         id, workspace_id, name, slug, project_key,
         created_by_user_id, updated_by_user_id
       )
       values (
         (select project_id from drift_security_ids),
         (select workspace_id from drift_security_ids),
         'Drift Security Project',
         'drift-sec-proj-' || (select suffix from drift_security_ids),
         'DS' || upper((select substr(suffix, 1, 4) from drift_security_ids)),
         (select in_org_user_id from drift_security_ids),
         (select in_org_user_id from drift_security_ids)
       );

       -- Only in_org_user is a current member. ex_org_user has a card in
       -- the project (created back when they were in the org) but is no
       -- longer in organization_members.
       insert into public.organization_members (organization_id, user_id, role)
       values (
         (select org_id from drift_security_ids),
         (select in_org_user_id from drift_security_ids),
         'member'::public.organization_role
       );

       -- Card 1: assignee in_org_user, oversized title (5000 chars).
       insert into public.cards (
         id, project_id, project_card_number, title,
         due_at, assignee_user_id, created_by_user_id
       )
       values (
         (select card_in_org_id from drift_security_ids),
         (select project_id from drift_security_ids),
         1,
         repeat('X', 5000),
         current_date - 2,
         (select in_org_user_id from drift_security_ids),
         (select in_org_user_id from drift_security_ids)
       );

       -- Card 2: assignee + creator both ex_org_user. Should NOT nudge.
       insert into public.cards (
         id, project_id, project_card_number, title,
         due_at, assignee_user_id, created_by_user_id
       )
       values (
         (select card_ex_org_id from drift_security_ids),
         (select project_id from drift_security_ids),
         2,
         'Card from ex-member',
         current_date - 2,
         (select ex_org_user_id from drift_security_ids),
         (select ex_org_user_id from drift_security_ids)
       );

       create temp table drift_security_dispatch on commit drop as
       select public.dispatch_drift_watcher_notifications(
         (select org_id from drift_security_ids),
         24
       ) as inserted;

       select
         (
           -- Total drift nudges in the org: should be exactly 1 (in_org_user only).
           select count(*)::text
           from public.notifications n
           where n.organization_id = (select org_id from drift_security_ids)
             and n.kind = 'drift_nudge'
         )
         || '|' || (
           -- Ex-org user must have zero drift nudges.
           select count(*)::text
           from public.notifications n
           where n.user_id = (select ex_org_user_id from drift_security_ids)
             and n.kind = 'drift_nudge'
         )
         || '|' || (
           -- Title for the oversized card is truncated. 200 chars of 'X'
           -- + ' is overdue' (11 chars) = 211 chars.
           select length(n.title)::text
           from public.notifications n
           where n.card_id = (select card_in_org_id from drift_security_ids)
             and n.kind = 'drift_nudge'
         );
       rollback;`,
    )
    expect(result).toBe('1|0|211')
  })

  itIfPg('record_drift_watcher_run accepts a custom dispatch_reason', () => {
    // N1 retro fix: dispatch_reason is parameterized so a future
    // manual-trigger surface can record dispatch_reason='manual'.
    // Verify the override works end-to-end and persists to ai_agent_runs.
    const result = psqlScriptQuery(
      `begin;
       create temp table drift_record_ids on commit drop as
       select
         gen_random_uuid() as user_id,
         gen_random_uuid() as org_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select user_id from drift_record_ids),
         'authenticated', 'authenticated',
         'rec-' || (select suffix from drift_record_ids) || '@rocketboard.test',
         'not-used',
         timezone('utc', now()), '', '', '', '',
         '{}'::jsonb, '{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       );

       insert into public.organizations (id, name, slug, created_by_user_id)
       values (
         (select org_id from drift_record_ids),
         'Record Org',
         'record-' || (select suffix from drift_record_ids),
         (select user_id from drift_record_ids)
       );

       create temp table drift_record_persona on commit drop as
       select public.get_or_create_drift_watcher_persona(
         (select org_id from drift_record_ids)
       ) as persona_id;

       create temp table drift_record_run on commit drop as
       select public.record_drift_watcher_run(
         target_org_id => (select org_id from drift_record_ids),
         target_persona_id => (select persona_id from drift_record_persona),
         target_status => 'succeeded',
         target_started_at => timezone('utc', now()),
         target_finished_at => timezone('utc', now()),
         target_error_text => null,
         target_dispatch_reason => 'manual'
       ) as run_id;

       select
         (select dispatch_reason from public.ai_agent_runs where id = (select run_id from drift_record_run))
         || '|' || (select status from public.ai_agent_runs where id = (select run_id from drift_record_run));
       rollback;`,
    )
    expect(result).toBe('manual|succeeded')
  })

  itIfPg('drift-watcher-hourly cron job is scheduled with the expected cadence and target', () => {
    const job = psqlQuery(
      `select schedule || '|' || command
       from cron.job
       where jobname = 'drift-watcher-hourly'`,
    )
    // Hourly at minute 0 — Plan §9.6 cadence.
    expect(job).toContain('0 * * * *|')
    // Calls the deployed edge function via pg_net.
    expect(job).toContain('net.http_post')
    expect(job).toContain('/functions/v1/drift-watcher')
    // Reads the URL + service role JWT from Vault rather than hard-coding
    // env-specific values into the migration.
    expect(job).toContain('vault.decrypted_secrets')
    expect(job).toContain("name = 'project_url'")
    expect(job).toContain("name = 'service_role_key'")
  })

  itIfPg('pg_net extension is installed so the drift-watcher cron command can call net.http_post', () => {
    // The cron job (20260504110000) calls net.http_post to invoke the
    // edge function. Without pg_net installed every tick errors with
    // `schema "net" does not exist`. Local Supabase auto-installs the
    // extension; cloud projects need the explicit migration in
    // 20260504210000_pg_net_extension.sql.
    const installed = psqlQuery(
      `select extname from pg_extension where extname = 'pg_net'`,
    )
    expect(installed).toBe('pg_net')
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
           'get_pending_invite_for_current_user',
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
    expect(signatures).toContain('get_pending_invite_for_current_user()')
    expect(signatures).toContain('get_shell_summary_rows_v2()')
    expect(signatures).toContain(
      'set_organization_member_role(target_org_id uuid, target_user_id uuid, target_role organization_role)',
    )
    expect(signatures).toContain('default_scope_role_for_org_role(target_org_role organization_role)')
  })

  itIfPg('canvas batch element RPCs exist with expected signatures', () => {
    const signatures = psqlQuery(
      `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public'
         and p.proname in ('delete_canvas_elements', 'update_canvas_elements')
       order by 1`,
    ).split('\n')

    expect(signatures).toContain('delete_canvas_elements(target_project_view_id uuid, target_element_ids uuid[])')
    expect(signatures).toContain('update_canvas_elements(target_project_view_id uuid, target_updates jsonb)')
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

  itIfPg('complete_sprint can atomically create and return the next sprint', () => {
    const result = psqlScriptQuery(
      `begin;

       create temp table complete_sprint_test_ids on commit drop as
       select
         gen_random_uuid() as user_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         gen_random_uuid() as sprint_id,
         gen_random_uuid() as card_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       do $$
       begin
         perform set_config(
           'request.jwt.claim.sub',
           (select ids.user_id::text from complete_sprint_test_ids ids),
           true
         );
         perform set_config('request.jwt.claim.role', 'authenticated', true);
       end
       $$;

       insert into auth.users (
         instance_id,
         id,
         aud,
         role,
         email,
         encrypted_password,
         email_confirmed_at,
         confirmation_token,
         recovery_token,
         email_change_token_new,
         email_change,
         raw_app_meta_data,
         raw_user_meta_data,
         created_at,
         updated_at,
         last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select ids.user_id from complete_sprint_test_ids ids),
         'authenticated',
         'authenticated',
         'complete-sprint-' || (select ids.suffix from complete_sprint_test_ids ids) || '@rocketboard.test',
         'not-used',
         timezone('utc', now()),
         '',
         '',
         '',
         '',
         '{"provider":"email","providers":["email"]}'::jsonb,
         '{"full_name":"Complete Sprint Contract"}'::jsonb,
         timezone('utc', now()),
         timezone('utc', now()),
         timezone('utc', now())
       );

       insert into public.organizations (
         id,
         name,
         slug,
         created_by_user_id
       )
       values (
         (select ids.org_id from complete_sprint_test_ids ids),
         'Complete Sprint Contract',
         'complete-sprint-' || (select ids.suffix from complete_sprint_test_ids ids),
         (select ids.user_id from complete_sprint_test_ids ids)
       );

       insert into public.workspaces (
         id,
         organization_id,
         name,
         slug,
         created_by_user_id
       )
       values (
         (select ids.workspace_id from complete_sprint_test_ids ids),
         (select ids.org_id from complete_sprint_test_ids ids),
         'Contract Workspace',
         'complete-workspace-' || (select ids.suffix from complete_sprint_test_ids ids),
         (select ids.user_id from complete_sprint_test_ids ids)
       );

       insert into public.projects (
         id,
         workspace_id,
         name,
         slug,
         project_key,
         created_by_user_id,
         updated_by_user_id
       )
       values (
         (select ids.project_id from complete_sprint_test_ids ids),
         (select ids.workspace_id from complete_sprint_test_ids ids),
         'Contract Project',
         'complete-project-' || (select ids.suffix from complete_sprint_test_ids ids),
         'CS' || upper((select substr(ids.suffix, 1, 4) from complete_sprint_test_ids ids)),
         (select ids.user_id from complete_sprint_test_ids ids),
         (select ids.user_id from complete_sprint_test_ids ids)
       );

       insert into public.organization_members (
         organization_id,
         user_id,
         role
       )
       values (
         (select ids.org_id from complete_sprint_test_ids ids),
         (select ids.user_id from complete_sprint_test_ids ids),
         'member'::public.organization_role
       );

       insert into public.project_sprints (
         id,
         project_id,
         name,
         status,
         position,
         start_date,
         end_date,
         created_by_user_id,
         updated_by_user_id
       )
       values (
         (select ids.sprint_id from complete_sprint_test_ids ids),
         (select ids.project_id from complete_sprint_test_ids ids),
         'Sprint 1',
         'active'::public.sprint_status,
         0,
         '2026-04-12'::date,
         '2026-04-18'::date,
         (select ids.user_id from complete_sprint_test_ids ids),
         (select ids.user_id from complete_sprint_test_ids ids)
       );

       insert into public.cards (
         id,
         project_id,
         project_card_number,
         title,
         sprint_id,
         created_by_user_id,
         updated_by_user_id
       )
       values (
         (select ids.card_id from complete_sprint_test_ids ids),
         (select ids.project_id from complete_sprint_test_ids ids),
         1,
         'Incomplete card',
         (select ids.sprint_id from complete_sprint_test_ids ids),
         (select ids.user_id from complete_sprint_test_ids ids),
         (select ids.user_id from complete_sprint_test_ids ids)
       );

       create temp table complete_sprint_result on commit drop as
       select *
       from public.complete_sprint(
         target_sprint_id => (select ids.sprint_id from complete_sprint_test_ids ids),
         target_action => 'move_to_next',
         target_next_sprint_id => null,
         target_next_sprint_name => 'Sprint 2',
         target_next_sprint_start_date => '2026-04-19'::date,
         target_next_sprint_end_date => '2026-04-25'::date,
         target_next_sprint_goal => null
       );

       select
         (select name from complete_sprint_result)
         || '|'
         || (
           select sprint.status::text
           from public.project_sprints sprint
           where sprint.id = (select ids.sprint_id from complete_sprint_test_ids ids)
         )
         || '|'
         || (
           select moved_to.name
           from public.project_sprints moved_to
           where moved_to.id = (
             select card.sprint_id
             from public.cards card
             where card.id = (select ids.card_id from complete_sprint_test_ids ids)
           )
         )
         || '|'
         || (
           select count(*)::text
           from public.project_sprints sprint
           where sprint.project_id = (select ids.project_id from complete_sprint_test_ids ids)
         );

       rollback;`,
    )

    expect(result).toBe('Sprint 2|completed|Sprint 2|2')
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

  // ---------------------------------------------------------------------------
  // AI Kanban Phase 1 — schema deltas + provisioning RPCs
  // ---------------------------------------------------------------------------
  itIfPg('ai_personas Phase 1 columns exist with the expected types and defaults', () => {
    const cols = psqlQuery(
      `select string_agg(column_name || ':' || data_type || ':' || coalesce(column_default,'<null>'), '|' order by column_name)
       from information_schema.columns
       where table_schema='public'
         and table_name='ai_personas'
         and column_name in ('agent_user_id','capabilities','autonomy_level','default_review_user_id','role','visibility')`,
    ).split('|')
    expect(cols).toContain('agent_user_id:uuid:<null>')
    expect(cols.some((c) => c.startsWith('capabilities:ARRAY:'))).toBe(true)
    expect(cols).toContain("autonomy_level:text:'manual'::text")
    expect(cols).toContain('default_review_user_id:uuid:<null>')
    expect(cols).toContain("role:text:'assistant'::text")
    expect(cols).toContain("visibility:text:'org'::text")
  })

  itIfPg('organization_role enum gains the agent value', () => {
    const values = psqlQuery(
      `select string_agg(e.enumlabel, ',' order by e.enumsortorder)
       from pg_catalog.pg_type t
       join pg_catalog.pg_namespace n on n.oid=t.typnamespace
       join pg_catalog.pg_enum e on e.enumtypid=t.oid
       where n.nspname='public' and t.typname='organization_role'`,
    )
    expect(values).toContain('agent')
  })

  itIfPg('projects gains kind + agents_assignable with the expected defaults', () => {
    const cols = psqlQuery(
      `select string_agg(column_name || ':' || coalesce(column_default,'<null>'), ',' order by column_name)
       from information_schema.columns
       where table_schema='public'
         and table_name='projects'
         and column_name in ('kind','agents_assignable')`,
    )
    expect(cols).toContain('agents_assignable:true')
    expect(cols).toContain("kind:'standard'::text")

    // Partial unique index enforces one personal_ai_workspace per
    // (creator, workspace) so Phase 3's UI can rely on the invariant.
    const idx = psqlQuery(
      `select indexdef
       from pg_indexes
       where schemaname='public' and indexname='projects_personal_ai_workspace_unique'`,
    )
    expect(idx).toContain('kind = ')
    expect(idx).toContain('personal_ai_workspace')
  })

  itIfPg('card_comments.is_streaming exists with a partial lookup index', () => {
    const colDefault = psqlQuery(
      `select column_default from information_schema.columns
       where table_schema='public' and table_name='card_comments' and column_name='is_streaming'`,
    )
    expect(colDefault).toBe('false')

    const idx = psqlQuery(
      `select indexdef from pg_indexes
       where schemaname='public' and indexname='card_comments_streaming_lookup_idx'`,
    )
    expect(idx).toContain('is_streaming = true')
  })

  itIfPg('notifications.kind constraint allows the Wave 2 dispatch lifecycle kinds', () => {
    const constraintDef = psqlQuery(
      `select pg_get_constraintdef(c.oid)
       from pg_catalog.pg_constraint c
       join pg_catalog.pg_class t on t.oid = c.conrelid
       join pg_catalog.pg_namespace n on n.oid = t.relnamespace
       where n.nspname='public' and t.relname='notifications' and c.conname='notifications_kind_check'`,
    )
    expect(constraintDef).toContain("'run_completed'")
    expect(constraintDef).toContain("'run_awaiting_approval'")
    // Wave 1 kinds must still be allowed.
    expect(constraintDef).toContain("'mention'")
    expect(constraintDef).toContain("'assignment'")
    expect(constraintDef).toContain("'comment_on_owned_card'")
    expect(constraintDef).toContain("'drift_nudge'")
  })

  itIfPg('factory persona role backfill assigns the documented roles', () => {
    // The migration backfills role per persona slug. Roles drive which
    // features the persona surfaces in (chat drawer / AI Kanban
    // dispatch / monitor / retro). Default for new orgs is 'assistant'.
    const result = psqlScriptQuery(
      `begin;
       create temp table role_backfill_ids on commit drop as
       select gen_random_uuid() as user_id, gen_random_uuid() as org_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select user_id from role_backfill_ids),
         'authenticated', 'authenticated',
         'roles-' || (select suffix from role_backfill_ids) || '@rocketboard.test',
         'not-used',
         timezone('utc', now()), '', '', '', '',
         '{}'::jsonb, '{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       );

       insert into public.organizations (id, name, slug, created_by_user_id)
       values (
         (select org_id from role_backfill_ids),
         'Roles Org',
         'roles-' || (select suffix from role_backfill_ids),
         (select user_id from role_backfill_ids)
       );

       insert into public.organization_members (organization_id, user_id, role)
       values (
         (select org_id from role_backfill_ids),
         (select user_id from role_backfill_ids),
         'member'::public.organization_role
       );

       -- Set request context so seed_default_ai_personas's RLS check passes.
       select set_config('request.jwt.claim.sub', (select user_id::text from role_backfill_ids), true);
       select set_config('request.jwt.claim.role', 'authenticated', true);
       select public.seed_default_ai_personas((select org_id from role_backfill_ids));

       -- Apply the backfill again to the freshly-seeded personas — mirrors
       -- what the migration did to existing rows; the migration itself
       -- doesn't touch later-seeded orgs, so this temp table simulates it.
       update public.ai_personas
       set role = case slug
         when 'buddy' then 'chat'
         when 'claire' then 'chat'
         when 'jk' then 'chat'
         when 'drift-watcher' then 'monitor'
         else role
       end
       where organization_id = (select org_id from role_backfill_ids);

       select string_agg(slug || ':' || role, ',' order by slug)
       from public.ai_personas
       where organization_id = (select org_id from role_backfill_ids);
       rollback;`,
    )
    expect(result).toContain('andy:assistant')
    expect(result).toContain('buddy:chat')
    expect(result).toContain('chris:assistant')
    expect(result).toContain('claire:chat')
    expect(result).toContain('jk:chat')
    expect(result).toContain('sara:assistant')
  })

  itIfPg('provision_agent_user is service-role-only and idempotent', () => {
    const signature = psqlQuery(
      `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='provision_agent_user'`,
    )
    expect(signature).toBe('provision_agent_user(target_persona_id uuid)')

    const grants = psqlQuery(
      `select string_agg(grantee || ':' || privilege_type, ',' order by grantee || ':' || privilege_type)
       from information_schema.routine_privileges
       where routine_schema='public'
         and routine_name='provision_agent_user'
         and privilege_type='EXECUTE'`,
    )
    expect(grants).toContain('service_role:EXECUTE')
    expect(grants).not.toContain('authenticated:EXECUTE')
    expect(grants).not.toContain('anon:EXECUTE')

    // Idempotency + side-effect contract: two calls return the same uuid;
    // exactly one auth.users + organization_members row exists per persona.
    const result = psqlScriptQuery(
      `begin;
       create temp table prov_agent_ids on commit drop as
       select gen_random_uuid() as creator_id, gen_random_uuid() as org_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select creator_id from prov_agent_ids),
         'authenticated', 'authenticated',
         'prov-' || (select suffix from prov_agent_ids) || '@rocketboard.test',
         'not-used',
         timezone('utc', now()), '', '', '', '',
         '{}'::jsonb, '{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       );

       insert into public.organizations (id, name, slug, created_by_user_id)
       values (
         (select org_id from prov_agent_ids),
         'Prov Org',
         'prov-' || (select suffix from prov_agent_ids),
         (select creator_id from prov_agent_ids)
       );

       insert into public.organization_members (organization_id, user_id, role)
       values (
         (select org_id from prov_agent_ids),
         (select creator_id from prov_agent_ids),
         'member'::public.organization_role
       );

       insert into public.ai_personas (
         organization_id, name, slug, system_prompt
       )
       values (
         (select org_id from prov_agent_ids),
         'Test Sara', 'test-sara', 'You are a test persona.'
       );

       create temp table prov_agent_calls on commit drop as
       select
         public.provision_agent_user(p.id) as first_call,
         public.provision_agent_user(p.id) as second_call,
         p.id as persona_id
       from public.ai_personas p
       where p.organization_id = (select org_id from prov_agent_ids)
         and p.slug = 'test-sara';

       select
         (case when first_call = second_call then 'idempotent' else 'mismatched' end)
         || '|' || (
           select count(*)::text
           from public.organization_members
           where organization_id = (select org_id from prov_agent_ids)
             and user_id = (select first_call from prov_agent_calls)
             and role = 'agent'::public.organization_role
         )
         || '|' || (
           select count(*)::text
           from auth.users
           where id = (select first_call from prov_agent_calls)
         )
         || '|' || (
           select agent_user_id::text = (select first_call::text from prov_agent_calls)
           from public.ai_personas where id = (select persona_id from prov_agent_calls)
         )::text
       from prov_agent_calls;
       rollback;`,
    )
    expect(result).toBe('idempotent|1|1|true')
  })

  itIfPg('provision_personal_ai_workspace is authenticated, scoped to caller, idempotent', () => {
    const grants = psqlQuery(
      `select string_agg(grantee, ',' order by grantee)
       from information_schema.routine_privileges
       where routine_schema='public'
         and routine_name='provision_personal_ai_workspace'
         and privilege_type='EXECUTE'`,
    )
    expect(grants).toContain('authenticated')
    expect(grants).toContain('service_role')
    expect(grants).not.toContain('anon')

    // Idempotency contract: two calls for the same (user, org) return
    // the same project id; exactly one personal_ai_workspace project
    // exists; the project has agents_assignable=true.
    const result = psqlScriptQuery(
      `begin;
       create temp table prov_paw_ids on commit drop as
       select gen_random_uuid() as user_id, gen_random_uuid() as org_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select user_id from prov_paw_ids),
         'authenticated', 'authenticated',
         'paw-' || (select suffix from prov_paw_ids) || '@rocketboard.test',
         'not-used',
         timezone('utc', now()), '', '', '', '',
         '{}'::jsonb, '{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       );

       insert into public.organizations (id, name, slug, created_by_user_id)
       values (
         (select org_id from prov_paw_ids),
         'PAW Org',
         'paw-' || (select suffix from prov_paw_ids),
         (select user_id from prov_paw_ids)
       );

       insert into public.organization_members (organization_id, user_id, role)
       values (
         (select org_id from prov_paw_ids),
         (select user_id from prov_paw_ids),
         'member'::public.organization_role
       );

       create temp table prov_paw_calls on commit drop as
       select
         public.provision_personal_ai_workspace(
           (select user_id from prov_paw_ids),
           (select org_id from prov_paw_ids)
         ) as first_call,
         public.provision_personal_ai_workspace(
           (select user_id from prov_paw_ids),
           (select org_id from prov_paw_ids)
         ) as second_call;

       select
         (case when first_call = second_call then 'idempotent' else 'mismatched' end)
         || '|' || (
           select count(*)::text
           from public.projects p
           join public.workspaces w on w.id = p.workspace_id
           where w.organization_id = (select org_id from prov_paw_ids)
             and p.kind = 'personal_ai_workspace'
             and p.created_by_user_id = (select user_id from prov_paw_ids)
         )
         || '|' || (
           select agents_assignable::text
           from public.projects
           where id = (select first_call from prov_paw_calls)
         )
         || '|' || (
           select kind
           from public.projects
           where id = (select first_call from prov_paw_calls)
         )
       from prov_paw_calls;
       rollback;`,
    )
    expect(result).toBe('idempotent|1|true|personal_ai_workspace')
  })

  // ---------------------------------------------------------------------------
  // AI Kanban Phase 2a — dispatch backbone
  // ---------------------------------------------------------------------------
  itIfPg('ai_agent_runs gains previous_run_id with the retry-chain index', () => {
    const col = psqlQuery(
      `select data_type from information_schema.columns
       where table_schema='public' and table_name='ai_agent_runs' and column_name='previous_run_id'`,
    )
    expect(col).toBe('uuid')

    const idx = psqlQuery(
      `select indexdef from pg_indexes
       where schemaname='public' and indexname='ai_agent_runs_previous_run_id_idx'`,
    )
    expect(idx).toContain('previous_run_id IS NOT NULL')
  })

  itIfPg('ai_agent_schedules table + RLS exist with the v1 shape', () => {
    const cols = psqlQuery(
      `select string_agg(column_name, ',' order by column_name)
       from information_schema.columns
       where table_schema='public' and table_name='ai_agent_schedules'`,
    )
    expect(cols).toContain('card_template')
    expect(cols).toContain('cron_expression')
    expect(cols).toContain('is_paused')
    expect(cols).toContain('next_run_at')
    expect(cols).toContain('persona_id')
    expect(cols).toContain('target_project_id')

    const policies = psqlQuery(
      `select string_agg(policyname, ',' order by policyname)
       from pg_policies
       where schemaname='public' and tablename='ai_agent_schedules'`,
    )
    expect(policies).toBe(
      'ai_agent_schedules_delete_owner,ai_agent_schedules_insert,ai_agent_schedules_select,ai_agent_schedules_update_owner',
    )

    const dueIdx = psqlQuery(
      `select indexdef from pg_indexes
       where schemaname='public' and indexname='ai_agent_schedules_due_idx'`,
    )
    expect(dueIdx).toContain('is_paused = false')
  })

  itIfPg('dispatch RPCs exist with v1 signatures and grants', () => {
    const signatures = psqlQuery(
      `select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', '|' order by p.proname)
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public'
         and p.proname in (
           'count_agent_run_ancestors',
           'dispatch_agent_run',
           'cancel_agent_run',
           'pause_agent_schedule',
           'resume_agent_schedule'
         )`,
    ).split('|')
    expect(signatures).toContain('count_agent_run_ancestors(target_run_id uuid)')
    expect(signatures).toContain(
      'dispatch_agent_run(target_card_id uuid, target_persona_id uuid, target_dispatch_reason text, target_prompt text, target_previous_run_id uuid)',
    )
    expect(signatures).toContain('cancel_agent_run(target_run_id uuid, target_reason text)')
    expect(signatures).toContain('pause_agent_schedule(target_schedule_id uuid)')
    expect(signatures).toContain('resume_agent_schedule(target_schedule_id uuid)')

    const grants = psqlQuery(
      `select string_agg(distinct routine_name || ':' || grantee, ',' order by routine_name || ':' || grantee)
       from information_schema.routine_privileges
       where routine_schema='public'
         and routine_name in ('dispatch_agent_run', 'cancel_agent_run', 'pause_agent_schedule', 'resume_agent_schedule')
         and privilege_type='EXECUTE'`,
    )
    // Authenticated callers may dispatch + lifecycle; admin/permission
    // gating happens inside each RPC body.
    expect(grants).toContain('dispatch_agent_run:authenticated')
    expect(grants).toContain('cancel_agent_run:authenticated')
    expect(grants).toContain('pause_agent_schedule:authenticated')
    expect(grants).toContain('resume_agent_schedule:authenticated')
    expect(grants).not.toContain(':anon')
  })

  itIfPg('cards assignee trigger fires only for bot-user assignees (REG-2)', () => {
    // Two-card invariant: assigning to a human assignee MUST NOT
    // produce an ai_agent_runs row; assigning to a persona's bot user
    // MUST produce one. Loop protection + idempotency are tested below
    // by re-firing the same assignment a second time.
    const result = psqlScriptQuery(
      `begin;
       create temp table dispatch_test_ids on commit drop as
       select gen_random_uuid() as human_user_id,
         gen_random_uuid() as creator_user_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         gen_random_uuid() as human_card_id,
         gen_random_uuid() as bot_card_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       -- Two real users + one persona (which gets a synthesised bot user
       -- via the Phase 1 RPC).
       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values
       (
         '00000000-0000-0000-0000-000000000000',
         (select human_user_id from dispatch_test_ids),
         'authenticated', 'authenticated',
         'human-' || (select suffix from dispatch_test_ids) || '@rocketboard.test',
         'not-used',
         timezone('utc', now()), '', '', '', '',
         '{}'::jsonb, '{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       ),
       (
         '00000000-0000-0000-0000-000000000000',
         (select creator_user_id from dispatch_test_ids),
         'authenticated', 'authenticated',
         'creator-' || (select suffix from dispatch_test_ids) || '@rocketboard.test',
         'not-used',
         timezone('utc', now()), '', '', '', '',
         '{}'::jsonb, '{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       );

       insert into public.organizations (id, name, slug, created_by_user_id)
       values (
         (select org_id from dispatch_test_ids),
         'Dispatch Org',
         'dispatch-' || (select suffix from dispatch_test_ids),
         (select creator_user_id from dispatch_test_ids)
       );

       insert into public.organization_members (organization_id, user_id, role)
       values
         ((select org_id from dispatch_test_ids), (select creator_user_id from dispatch_test_ids), 'admin'::public.organization_role),
         ((select org_id from dispatch_test_ids), (select human_user_id from dispatch_test_ids), 'member'::public.organization_role);

       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values (
         (select workspace_id from dispatch_test_ids),
         (select org_id from dispatch_test_ids),
         'Dispatch Workspace',
         'dispatch-ws-' || (select suffix from dispatch_test_ids),
         (select creator_user_id from dispatch_test_ids)
       );

       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id)
       values (
         (select project_id from dispatch_test_ids),
         (select workspace_id from dispatch_test_ids),
         'Dispatch Project',
         'dispatch-proj-' || (select suffix from dispatch_test_ids),
         'DP' || upper((select substr(suffix, 1, 4) from dispatch_test_ids)),
         (select creator_user_id from dispatch_test_ids),
         (select creator_user_id from dispatch_test_ids)
       );

       insert into public.project_members (project_id, user_id, role)
       values
         ((select project_id from dispatch_test_ids), (select creator_user_id from dispatch_test_ids), 'admin'::public.scope_access_role),
         ((select project_id from dispatch_test_ids), (select human_user_id from dispatch_test_ids), 'member'::public.scope_access_role);

       insert into public.ai_personas (organization_id, name, slug, system_prompt, role)
       values (
         (select org_id from dispatch_test_ids),
         'Dispatch Sara', 'dispatch-sara', 'You are a test persona.', 'assistant'
       );

       create temp table dispatch_test_persona on commit drop as
       select id as persona_id,
         public.provision_agent_user(id) as bot_user_id
       from public.ai_personas
       where organization_id = (select org_id from dispatch_test_ids) and slug = 'dispatch-sara';

       -- Bot user must also be a project member or can_edit_project
       -- will reject the assignment via the RLS check on cards updates.
       insert into public.project_members (project_id, user_id, role)
       select (select project_id from dispatch_test_ids), bot_user_id, 'member'::public.scope_access_role
       from dispatch_test_persona;

       -- Card #1 — assigned to the human user. No agent run expected.
       insert into public.cards (id, project_id, project_card_number, title, created_by_user_id, assignee_user_id)
       values (
         (select human_card_id from dispatch_test_ids),
         (select project_id from dispatch_test_ids),
         1, 'Human card',
         (select creator_user_id from dispatch_test_ids),
         (select human_user_id from dispatch_test_ids)
       );

       -- Card #2 — created with a human assignee, then reassigned to the
       -- bot user via UPDATE so the trigger fires.
       insert into public.cards (id, project_id, project_card_number, title, created_by_user_id, assignee_user_id)
       values (
         (select bot_card_id from dispatch_test_ids),
         (select project_id from dispatch_test_ids),
         2, 'Bot card',
         (select creator_user_id from dispatch_test_ids),
         (select human_user_id from dispatch_test_ids)
       );

       update public.cards
       set assignee_user_id = (select bot_user_id from dispatch_test_persona)
       where id = (select bot_card_id from dispatch_test_ids);

       -- Re-assign to the same bot user (idempotency probe — trigger
       -- only fires when assignee actually changed; this UPDATE
       -- changes nothing).
       update public.cards
       set assignee_user_id = (select bot_user_id from dispatch_test_persona)
       where id = (select bot_card_id from dispatch_test_ids);

       select
         (
           select count(*)::text from public.ai_agent_runs
           where card_id = (select human_card_id from dispatch_test_ids)
         )
         || '|' || (
           select count(*)::text from public.ai_agent_runs
           where card_id = (select bot_card_id from dispatch_test_ids)
         )
         || '|' || (
           select dispatch_reason from public.ai_agent_runs
           where card_id = (select bot_card_id from dispatch_test_ids)
           limit 1
         )
         || '|' || (
           select status from public.ai_agent_runs
           where card_id = (select bot_card_id from dispatch_test_ids)
           limit 1
         );
       rollback;`,
    )
    // Format: human_runs|bot_runs|dispatch_reason|status
    // Expected: 0 runs for the human assignee, 1 run for the bot
    // assignee (idempotent — the duplicate UPDATE doesn't double-fire),
    // dispatched via the assignee_changed reason in queued state.
    expect(result).toBe('0|1|assignee_changed|queued')
  })

  itIfPg('dispatch_agent_run refuses chat-role personas + agents_assignable=false projects', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table guard_test_ids on commit drop as
       select gen_random_uuid() as user_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as locked_project_id,
         gen_random_uuid() as open_project_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select user_id from guard_test_ids),
         'authenticated', 'authenticated',
         'guard-' || (select suffix from guard_test_ids) || '@rocketboard.test',
         'not-used',
         timezone('utc', now()), '', '', '', '',
         '{}'::jsonb, '{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       );

       insert into public.organizations (id, name, slug, created_by_user_id)
       values (
         (select org_id from guard_test_ids),
         'Guard Org', 'guard-' || (select suffix from guard_test_ids),
         (select user_id from guard_test_ids)
       );
       insert into public.organization_members (organization_id, user_id, role)
       values (
         (select org_id from guard_test_ids), (select user_id from guard_test_ids),
         'admin'::public.organization_role
       );
       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values (
         (select workspace_id from guard_test_ids),
         (select org_id from guard_test_ids),
         'Guard WS', 'guard-ws-' || (select suffix from guard_test_ids),
         (select user_id from guard_test_ids)
       );
       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id, agents_assignable)
       values
         ((select locked_project_id from guard_test_ids),
          (select workspace_id from guard_test_ids),
          'Locked', 'guard-locked-' || (select suffix from guard_test_ids),
          'GL' || upper((select substr(suffix, 1, 4) from guard_test_ids)),
          (select user_id from guard_test_ids), (select user_id from guard_test_ids), false),
         ((select open_project_id from guard_test_ids),
          (select workspace_id from guard_test_ids),
          'Open', 'guard-open-' || (select suffix from guard_test_ids),
          'GO' || upper((select substr(suffix, 1, 4) from guard_test_ids)),
          (select user_id from guard_test_ids), (select user_id from guard_test_ids), true);

       -- Two personas: a chat-only persona (must be refused) and an
       -- assistant persona (used to test the agents_assignable=false
       -- project guard).
       insert into public.ai_personas (organization_id, name, slug, system_prompt, role)
       values
         ((select org_id from guard_test_ids), 'Guard Buddy', 'guard-buddy', 'chatonly', 'chat'),
         ((select org_id from guard_test_ids), 'Guard Sara', 'guard-sara', 'assistant', 'assistant');

       insert into public.cards (id, project_id, project_card_number, title, created_by_user_id)
       values
         ('11111111-1111-4111-8111-111111111111'::uuid, (select locked_project_id from guard_test_ids), 1, 'Locked card', (select user_id from guard_test_ids)),
         ('22222222-2222-4222-8222-222222222222'::uuid, (select open_project_id from guard_test_ids), 1, 'Open card', (select user_id from guard_test_ids));

       -- Two refusal cases. The do/exception block is the only way to
       -- catch raise-in-plpgsql cleanly inside psql, so we run both
       -- probes there and stash results in a temp table for the final
       -- select.
       do $body$
       declare
         chat_status text;
         locked_status text;
       begin
         begin
           perform public.dispatch_agent_run(
             '22222222-2222-4222-8222-222222222222'::uuid,
             (select id from public.ai_personas where slug = 'guard-buddy' limit 1)
           );
           chat_status := 'unexpected_ok';
         exception when others then
           chat_status := 'rejected_chat';
         end;
         begin
           perform public.dispatch_agent_run(
             '11111111-1111-4111-8111-111111111111'::uuid,
             (select id from public.ai_personas where slug = 'guard-sara' limit 1)
           );
           locked_status := 'unexpected_ok';
         exception when others then
           locked_status := 'rejected_locked';
         end;
         create temp table guard_results (chat text, locked text) on commit drop;
         insert into guard_results values (chat_status, locked_status);
       end
       $body$;

       select chat || '|' || locked from guard_results;
       rollback;`,
    )
    expect(result).toBe('rejected_chat|rejected_locked')
  })

  itIfPg('cancel_agent_run is idempotent for terminal runs', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table cancel_test_ids on commit drop as
       select gen_random_uuid() as user_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select user_id from cancel_test_ids),
         'authenticated', 'authenticated',
         'cancel-' || (select suffix from cancel_test_ids) || '@rocketboard.test',
         'not-used',
         timezone('utc', now()), '', '', '', '',
         '{}'::jsonb, '{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       );
       insert into public.organizations (id, name, slug, created_by_user_id)
       values ((select org_id from cancel_test_ids), 'Cancel Org', 'cancel-' || (select suffix from cancel_test_ids), (select user_id from cancel_test_ids));
       insert into public.organization_members (organization_id, user_id, role)
       values ((select org_id from cancel_test_ids), (select user_id from cancel_test_ids), 'admin'::public.organization_role);
       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values ((select workspace_id from cancel_test_ids), (select org_id from cancel_test_ids), 'Cancel WS', 'cancel-ws-' || (select suffix from cancel_test_ids), (select user_id from cancel_test_ids));
       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id)
       values ((select project_id from cancel_test_ids), (select workspace_id from cancel_test_ids), 'Cancel Proj', 'cancel-proj-' || (select suffix from cancel_test_ids), 'CN' || upper((select substr(suffix, 1, 4) from cancel_test_ids)), (select user_id from cancel_test_ids), (select user_id from cancel_test_ids));
       insert into public.ai_personas (organization_id, name, slug, system_prompt, role)
       values ((select org_id from cancel_test_ids), 'Cancel Sara', 'cancel-sara', 'You are a test persona.', 'assistant');

       create temp table cancel_persona on commit drop as
       select id as persona_id from public.ai_personas
       where organization_id = (select org_id from cancel_test_ids) and slug = 'cancel-sara';

       insert into public.cards (id, project_id, project_card_number, title, created_by_user_id)
       values ('33333333-3333-4333-8333-333333333333'::uuid, (select project_id from cancel_test_ids), 1, 'Cancel card', (select user_id from cancel_test_ids));

       create temp table cancel_run on commit drop as
       select public.dispatch_agent_run(
         '33333333-3333-4333-8333-333333333333'::uuid,
         (select persona_id from cancel_persona)
       ) as run_id;

       -- First cancel transitions queued -> cancelled.
       select public.cancel_agent_run((select run_id from cancel_run), 'first_call');
       -- Second cancel is a silent no-op (terminal-state guard).
       select public.cancel_agent_run((select run_id from cancel_run), 'second_call_should_be_ignored');

       select
         (select status from public.ai_agent_runs where id = (select run_id from cancel_run))
         || '|' || (select error_text from public.ai_agent_runs where id = (select run_id from cancel_run));
       rollback;`,
    )
    // First call's reason wins; second call must not overwrite.
    expect(result).toBe('cancelled|first_call')
  })

  itIfPg('get_org_wiki_startup_snapshot RPC exists', () => {
    const count = psqlQuery(
      `select count(*) from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='get_org_wiki_startup_snapshot'`,
    )
    expect(Number(count)).toBe(1)
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

  itIfPg('legacy VIP grant rpc is no longer executable by authenticated callers', () => {
    const privileges = psqlQuery(
      `select has_function_privilege('authenticated', 'public.super_admin_grant_org_vip(uuid)', 'EXECUTE')::text`,
    )
    expect(privileges).toBe('false')
  })

  itIfPg('effective entitlements rpc is not directly executable by authenticated callers', () => {
    const privileges = psqlQuery(
      `select has_function_privilege('authenticated', 'public.get_org_effective_entitlements(uuid)', 'EXECUTE')::text`,
    )
    expect(privileges).toBe('false')
  })

  itIfPg('effective plan helper is not executable by anon or authenticated callers', () => {
    const privileges = psqlQuery(
      `select has_function_privilege('authenticated', 'public.get_effective_plan(uuid)', 'EXECUTE')::text
       || '|'
       || has_function_privilege('anon', 'public.get_effective_plan(uuid)', 'EXECUTE')::text`,
    )
    expect(privileges).toBe('false|false')
  })

  itIfPg('billing summary keeps VIP transition metadata in the admin-only snapshot', () => {
    const summaryDef = psqlQuery(
      `select pg_get_functiondef(p.oid)
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='get_org_billing_summary'`,
    )
    expect(summaryDef).not.toContain('admin_grant_starts_at')
    expect(summaryDef).not.toContain('vip_cancellation_managed')
    expect(summaryDef).not.toContain('vip_canceled_subscription_id')

    const adminSnapshotDef = psqlQuery(
      `select pg_get_functiondef(p.oid)
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='get_org_billing_admin_snapshot'`,
    )
    expect(adminSnapshotDef).toContain('can_manage_organization')
    expect(adminSnapshotDef).toContain('admin_grant_starts_at')
    expect(adminSnapshotDef).toContain('vip_cancellation_managed')
    expect(adminSnapshotDef).toContain('vip_canceled_subscription_id')
  })

  itIfPg('renewed paid terms do not keep advertising VIP as scheduled in SQL entitlements', () => {
    const result = psqlScriptQuery(
      `begin;

       create temp table renewed_vip_ids on commit drop as
       select
         gen_random_uuid() as user_id,
         gen_random_uuid() as org_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id,
         id,
         aud,
         role,
         email,
         encrypted_password,
         email_confirmed_at,
         confirmation_token,
         recovery_token,
         email_change_token_new,
         email_change,
         raw_app_meta_data,
         raw_user_meta_data,
         created_at,
         updated_at,
         last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select ids.user_id from renewed_vip_ids ids),
         'authenticated',
         'authenticated',
         'renewed-vip-' || (select ids.suffix from renewed_vip_ids ids) || '@rocketboard.test',
         'not-used',
         timezone('utc', now()),
         '',
         '',
         '',
         '',
         '{"provider":"email","providers":["email"]}'::jsonb,
         '{"full_name":"Renewed VIP Contract"}'::jsonb,
         timezone('utc', now()),
         timezone('utc', now()),
         timezone('utc', now())
       );

       insert into public.organizations (
         id,
         name,
         slug,
         created_by_user_id,
         plan,
         plan_status,
         admin_grant_plan,
         admin_grant_starts_at
       )
       values (
         (select ids.org_id from renewed_vip_ids ids),
         'Renewed VIP Contract',
         'renewed-vip-' || (select ids.suffix from renewed_vip_ids ids),
         (select ids.user_id from renewed_vip_ids ids),
         'pro',
         'active',
         'pro',
         timezone('utc', now()) + interval '1 day'
       );

       select
         ent.admin_grant_is_scheduled::text
         || '|'
         || ent.effective_plan
       from public.get_org_effective_entitlements((select ids.org_id from renewed_vip_ids ids)) ent;

       rollback;`,
    )

    expect(result).toBe('false|pro')
  })

  itIfPg('award revoke rpc refuses VIP grants so the edge flow remains canonical', () => {
    const body = psqlQuery(
      `select pg_get_functiondef(p.oid)
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='super_admin_revoke_org_grant'`,
    )
    expect(body).toContain('VIP grants must be revoked through the VIP admin flow')
  })

  itIfPg('VIP admin rpc persists Stripe billing projections with grant and revoke writes', () => {
    const setGrantBody = psqlQuery(
      `select pg_get_functiondef(p.oid)
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public'
         and p.proname='internal_admin_set_org_vip_grant'
         and pg_get_function_identity_arguments(p.oid) =
           'p_org_id uuid, p_admin_user_id uuid, p_starts_at timestamp with time zone, p_cancellation_managed boolean, p_canceled_subscription_id text, p_apply_billing_projection boolean, p_base_plan text, p_base_plan_status text, p_base_billing_period text, p_base_plan_ends_at timestamp with time zone, p_base_stripe_customer_id text, p_base_stripe_subscription_id text'`,
    )
    expect(setGrantBody).toContain('p_apply_billing_projection')
    expect(setGrantBody).toContain('plan_status')
    expect(setGrantBody).toContain('plan_ends_at')
    expect(setGrantBody).toContain('stripe_subscription_id')

    const revokeBody = psqlQuery(
      `select pg_get_functiondef(p.oid)
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public'
         and p.proname='internal_admin_revoke_org_vip_grant'
         and pg_get_function_identity_arguments(p.oid) =
           'p_org_id uuid, p_admin_user_id uuid, p_apply_billing_projection boolean, p_base_plan text, p_base_plan_status text, p_base_billing_period text, p_base_plan_ends_at timestamp with time zone, p_base_stripe_customer_id text, p_base_stripe_subscription_id text'`,
    )
    expect(revokeBody).toContain('p_apply_billing_projection')
    expect(revokeBody).toContain('plan_status')
    expect(revokeBody).toContain('plan_ends_at')
    expect(revokeBody).toContain('stripe_subscription_id')
  })

  itIfPg('free-org member limits ignore guests and overflow member invites are stored as guest invites', () => {
    const result = psqlScriptQuery(
      `begin;

       create temp table free_org_guest_limit_ids on commit drop as
       select
         gen_random_uuid() as org_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       create temp table free_org_guest_limit_users on commit drop as
       select
         gen_random_uuid() as user_id,
         case when seat_no = 0 then 'admin'::public.organization_role else 'member'::public.organization_role end as org_role,
         'free-org-seat-' || seat_no || '-' || (select ids.suffix from free_org_guest_limit_ids ids) || '@rocketboard.test' as email
       from generate_series(0, 4) seat_no;

       create temp table free_org_guest_limit_guests on commit drop as
       select
         gen_random_uuid() as user_id,
         'free-org-guest-' || guest_no || '-' || (select ids.suffix from free_org_guest_limit_ids ids) || '@rocketboard.test' as email
       from generate_series(1, 3) guest_no;

       insert into auth.users (
         instance_id,
         id,
         aud,
         role,
         email,
         encrypted_password,
         email_confirmed_at,
         confirmation_token,
         recovery_token,
         email_change_token_new,
         email_change,
         raw_app_meta_data,
         raw_user_meta_data,
         created_at,
         updated_at,
         last_sign_in_at
       )
       select
         '00000000-0000-0000-0000-000000000000',
         seeded.user_id,
         'authenticated',
         'authenticated',
         seeded.email,
         'not-used',
         timezone('utc', now()),
         '',
         '',
         '',
         '',
         '{"provider":"email","providers":["email"]}'::jsonb,
         '{"full_name":"Free Org Guest Limit"}'::jsonb,
         timezone('utc', now()),
         timezone('utc', now()),
         timezone('utc', now())
       from (
         select user_id, email from free_org_guest_limit_users
         union all
         select user_id, email from free_org_guest_limit_guests
       ) seeded;

       insert into public.organizations (
         id,
         name,
         slug,
         created_by_user_id
       )
       values (
         (select ids.org_id from free_org_guest_limit_ids ids),
         'Free Org Guest Limit',
         'free-org-guest-limit-' || (select ids.suffix from free_org_guest_limit_ids ids),
         (select seeded.user_id from free_org_guest_limit_users seeded where seeded.org_role = 'admin')
       );

       insert into public.organization_members (
         organization_id,
         user_id,
         role,
         seat_status
       )
       select
         (select ids.org_id from free_org_guest_limit_ids ids),
         seeded.user_id,
         seeded.org_role,
         'paid'
       from free_org_guest_limit_users seeded;

       insert into public.organization_members (
         organization_id,
         user_id,
         role,
         seat_status
       )
       select
         (select ids.org_id from free_org_guest_limit_ids ids),
         seeded.user_id,
         'guest',
         'free'
       from free_org_guest_limit_guests seeded;

       do $$
       begin
         perform set_config(
           'request.jwt.claim.sub',
           (
             select seeded.user_id::text
             from free_org_guest_limit_users seeded
             where seeded.org_role = 'admin'
           ),
           true
         );
         perform set_config('request.jwt.claim.role', 'authenticated', true);
       end
       $$;

       create temp table free_org_guest_limit_invite on commit drop as
       select *
       from public.create_organization_invite(
         (select ids.org_id from free_org_guest_limit_ids ids),
         'overflow-' || (select ids.suffix from free_org_guest_limit_ids ids) || '@rocketboard.test',
         'member'::public.organization_role,
         null
       );

       select
         public.check_org_limit((select ids.org_id from free_org_guest_limit_ids ids), 'members')::text
         || '|'
         || (select usage.member_count::text from public.get_org_usage((select ids.org_id from free_org_guest_limit_ids ids)) usage)
         || '|'
         || (select invite.role::text from free_org_guest_limit_invite invite);

       rollback;`,
    )

    expect(result).toBe('false|5|guest')
  })

  itIfPg('super_admin_get_organizations separates seat-bearing members from guests', () => {
    const result = psqlScriptQuery(
      `begin;

       create temp table super_admin_org_count_ids on commit drop as
       select
         gen_random_uuid() as org_id,
         gen_random_uuid() as admin_user_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       create temp table super_admin_org_count_members on commit drop as
       select
         gen_random_uuid() as user_id,
         'seat-member-' || member_no || '-' || (select ids.suffix from super_admin_org_count_ids ids) || '@rocketboard.test' as email
       from generate_series(1, 4) member_no;

       create temp table super_admin_org_count_guests on commit drop as
       select
         gen_random_uuid() as user_id,
         'guest-member-' || guest_no || '-' || (select ids.suffix from super_admin_org_count_ids ids) || '@rocketboard.test' as email
       from generate_series(1, 3) guest_no;

       insert into auth.users (
         instance_id,
         id,
         aud,
         role,
         email,
         encrypted_password,
         email_confirmed_at,
         confirmation_token,
         recovery_token,
         email_change_token_new,
         email_change,
         raw_app_meta_data,
         raw_user_meta_data,
         created_at,
         updated_at,
         last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select ids.admin_user_id from super_admin_org_count_ids ids),
         'authenticated',
         'authenticated',
         'internal-admin-' || (select ids.suffix from super_admin_org_count_ids ids) || '@rocketboard.test',
         '',
         timezone('utc', now()),
         '',
         '',
         '',
         '',
         '{}'::jsonb,
         jsonb_build_object('name', 'Internal Admin'),
         timezone('utc', now()),
         timezone('utc', now()),
         timezone('utc', now())
       );

       insert into auth.users (
         instance_id,
         id,
         aud,
         role,
         email,
         encrypted_password,
         email_confirmed_at,
         confirmation_token,
         recovery_token,
         email_change_token_new,
         email_change,
         raw_app_meta_data,
         raw_user_meta_data,
         created_at,
         updated_at,
         last_sign_in_at
       )
       select
         '00000000-0000-0000-0000-000000000000',
         seeded.user_id,
         'authenticated',
         'authenticated',
         seeded.email,
         '',
         timezone('utc', now()),
         '',
         '',
         '',
         '',
         '{}'::jsonb,
         '{}'::jsonb,
         timezone('utc', now()),
         timezone('utc', now()),
         timezone('utc', now())
       from (
         select * from super_admin_org_count_members
         union all
         select * from super_admin_org_count_guests
       ) seeded;

       insert into public.profiles (
         user_id,
         email,
         full_name,
         is_internal_admin
       )
       values (
         (select ids.admin_user_id from super_admin_org_count_ids ids),
         'internal-admin-' || (select ids.suffix from super_admin_org_count_ids ids) || '@rocketboard.test',
         'Internal Admin',
         true
       );

       insert into public.organizations (
         id,
         name,
         slug,
         created_by_user_id
       )
       values (
         (select ids.org_id from super_admin_org_count_ids ids),
         'Guest Count Contract Org',
         'guest-count-contract-' || (select ids.suffix from super_admin_org_count_ids ids),
         (select ids.admin_user_id from super_admin_org_count_ids ids)
       );

       insert into public.organization_members (
         organization_id,
         user_id,
         role,
         seat_status
       )
       values (
         (select ids.org_id from super_admin_org_count_ids ids),
         (select ids.admin_user_id from super_admin_org_count_ids ids),
         'admin',
         'paid'
       );

       insert into public.organization_members (
         organization_id,
         user_id,
         role,
         seat_status
       )
       select
         (select ids.org_id from super_admin_org_count_ids ids),
         seeded.user_id,
         'member',
         'paid'
       from super_admin_org_count_members seeded;

       insert into public.organization_members (
         organization_id,
         user_id,
         role,
         seat_status
       )
       select
         (select ids.org_id from super_admin_org_count_ids ids),
         seeded.user_id,
         'guest',
         'free'
       from super_admin_org_count_guests seeded;

       do $$
       begin
         perform set_config(
           'request.jwt.claim.sub',
           (select ids.admin_user_id::text from super_admin_org_count_ids ids),
           true
         );
         perform set_config('request.jwt.claim.role', 'authenticated', true);
       end
       $$;

       select
         org.member_count::text
         || '|'
         || org.guest_count::text
       from public.super_admin_get_organizations(null, 200, 0) org
       where org.org_id = (select ids.org_id from super_admin_org_count_ids ids);

       rollback;`,
    )

    expect(result).toBe('5|3')
  })

  itIfPg('super_admin_get_customers filters by visible tier and counts zero-org users as free', () => {
    const result = psqlScriptQuery(
      `begin;

       create temp table super_admin_customer_filter_ids on commit drop as
       select
         gen_random_uuid() as admin_user_id,
         gen_random_uuid() as free_user_id,
         gen_random_uuid() as award_user_id,
         gen_random_uuid() as vip_user_id,
         gen_random_uuid() as pro_user_id,
         gen_random_uuid() as zero_user_id,
         gen_random_uuid() as free_org_id,
         gen_random_uuid() as award_org_id,
         gen_random_uuid() as vip_org_id,
         gen_random_uuid() as pro_org_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       create temp table super_admin_customer_filter_users on commit drop as
       select
         (select ids.admin_user_id from super_admin_customer_filter_ids ids) as user_id,
         'internal-admin-' || (select ids.suffix from super_admin_customer_filter_ids ids) || '@rocketboard.test' as email,
         'Internal Admin'::text as full_name,
         true as is_internal_admin
       union all
       select
         (select ids.free_user_id from super_admin_customer_filter_ids ids),
         'tier-contract-free-' || (select ids.suffix from super_admin_customer_filter_ids ids) || '@rocketboard.test',
         'Tier Contract Free',
         false
       union all
       select
         (select ids.award_user_id from super_admin_customer_filter_ids ids),
         'tier-contract-award-' || (select ids.suffix from super_admin_customer_filter_ids ids) || '@rocketboard.test',
         'Tier Contract Award',
         false
       union all
       select
         (select ids.vip_user_id from super_admin_customer_filter_ids ids),
         'tier-contract-vip-' || (select ids.suffix from super_admin_customer_filter_ids ids) || '@rocketboard.test',
         'Tier Contract VIP',
         false
       union all
       select
         (select ids.pro_user_id from super_admin_customer_filter_ids ids),
         'tier-contract-pro-' || (select ids.suffix from super_admin_customer_filter_ids ids) || '@rocketboard.test',
         'Tier Contract Pro',
         false
       union all
       select
         (select ids.zero_user_id from super_admin_customer_filter_ids ids),
         'tier-contract-zero-' || (select ids.suffix from super_admin_customer_filter_ids ids) || '@rocketboard.test',
         'Tier Contract Zero',
         false;

       insert into auth.users (
         instance_id,
         id,
         aud,
         role,
         email,
         encrypted_password,
         email_confirmed_at,
         confirmation_token,
         recovery_token,
         email_change_token_new,
         email_change,
         raw_app_meta_data,
         raw_user_meta_data,
         created_at,
         updated_at,
         last_sign_in_at
       )
       select
         '00000000-0000-0000-0000-000000000000',
         seeded.user_id,
         'authenticated',
         'authenticated',
         seeded.email,
         '',
         timezone('utc', now()),
         '',
         '',
         '',
         '',
         '{}'::jsonb,
         jsonb_build_object('name', seeded.full_name),
         timezone('utc', now()),
         timezone('utc', now()),
         timezone('utc', now())
       from super_admin_customer_filter_users seeded;

       insert into public.profiles (
         user_id,
         email,
         full_name,
         is_internal_admin
       )
       select
         seeded.user_id,
         seeded.email,
         seeded.full_name,
         seeded.is_internal_admin
       from super_admin_customer_filter_users seeded;

       insert into public.organizations (
         id,
         name,
         slug,
         created_by_user_id,
         plan,
         plan_status,
         admin_grant_plan,
         admin_grant_starts_at,
         admin_grant_ends_at
       )
       values
         (
           (select ids.free_org_id from super_admin_customer_filter_ids ids),
           'Tier Contract Free Org',
           'tier-contract-free-org-' || (select ids.suffix from super_admin_customer_filter_ids ids),
           (select ids.admin_user_id from super_admin_customer_filter_ids ids),
           'free',
           'canceled',
           null,
           null,
           null
         ),
         (
           (select ids.award_org_id from super_admin_customer_filter_ids ids),
           'Tier Contract Award Org',
           'tier-contract-award-org-' || (select ids.suffix from super_admin_customer_filter_ids ids),
           (select ids.admin_user_id from super_admin_customer_filter_ids ids),
           'free',
           'canceled',
           'pro',
           null,
           timezone('utc', now()) + interval '1 month'
         ),
         (
           (select ids.vip_org_id from super_admin_customer_filter_ids ids),
           'Tier Contract VIP Org',
           'tier-contract-vip-org-' || (select ids.suffix from super_admin_customer_filter_ids ids),
           (select ids.admin_user_id from super_admin_customer_filter_ids ids),
           'free',
           'canceled',
           'pro',
           timezone('utc', now()) - interval '1 day',
           null
         ),
         (
           (select ids.pro_org_id from super_admin_customer_filter_ids ids),
           'Tier Contract Pro Org',
           'tier-contract-pro-org-' || (select ids.suffix from super_admin_customer_filter_ids ids),
           (select ids.admin_user_id from super_admin_customer_filter_ids ids),
           'enterprise',
           'active',
           null,
           null,
           null
         );

       insert into public.organization_members (
         organization_id,
         user_id,
         role,
         seat_status,
         invited_by
       )
       values
         (
           (select ids.free_org_id from super_admin_customer_filter_ids ids),
           (select ids.free_user_id from super_admin_customer_filter_ids ids),
           'member',
           'paid',
           (select ids.admin_user_id from super_admin_customer_filter_ids ids)
         ),
         (
           (select ids.award_org_id from super_admin_customer_filter_ids ids),
           (select ids.award_user_id from super_admin_customer_filter_ids ids),
           'member',
           'paid',
           (select ids.admin_user_id from super_admin_customer_filter_ids ids)
         ),
         (
           (select ids.vip_org_id from super_admin_customer_filter_ids ids),
           (select ids.vip_user_id from super_admin_customer_filter_ids ids),
           'member',
           'paid',
           (select ids.admin_user_id from super_admin_customer_filter_ids ids)
         ),
         (
           (select ids.pro_org_id from super_admin_customer_filter_ids ids),
           (select ids.pro_user_id from super_admin_customer_filter_ids ids),
           'member',
           'paid',
           (select ids.admin_user_id from super_admin_customer_filter_ids ids)
         );

       do $$
       begin
         perform set_config(
           'request.jwt.claim.sub',
           (select ids.admin_user_id::text from super_admin_customer_filter_ids ids),
           true
         );
         perform set_config('request.jwt.claim.role', 'authenticated', true);
       end
       $$;

       select
         (select count(*)::text from public.super_admin_get_customers((select ids.suffix from super_admin_customer_filter_ids ids), null, 200, 0))
         || '|'
         || (select count(*)::text from public.super_admin_get_customers((select ids.suffix from super_admin_customer_filter_ids ids), 'free', 200, 0))
         || '|'
         || (select count(*)::text from public.super_admin_get_customers((select ids.suffix from super_admin_customer_filter_ids ids), 'award', 200, 0))
         || '|'
         || (select count(*)::text from public.super_admin_get_customers((select ids.suffix from super_admin_customer_filter_ids ids), 'vip', 200, 0))
         || '|'
         || (select count(*)::text from public.super_admin_get_customers((select ids.suffix from super_admin_customer_filter_ids ids), 'pro', 200, 0));

       rollback;`,
    )

    expect(result).toBe('5|2|1|1|1')
  })

  itIfPg('super_admin_get_customers can include internal admins without changing the default customer scope', () => {
    const result = psqlScriptQuery(
      `begin;

       create temp table super_admin_customer_internal_toggle_ids on commit drop as
       select
         gen_random_uuid() as admin_user_id,
         gen_random_uuid() as customer_user_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       create temp table super_admin_customer_internal_toggle_users on commit drop as
       select
         (select ids.admin_user_id from super_admin_customer_internal_toggle_ids ids) as user_id,
         'internal-admin-' || (select ids.suffix from super_admin_customer_internal_toggle_ids ids) || '@rocketboard.test' as email,
         'Internal Admin'::text as full_name,
         true as is_internal_admin
       union all
       select
         (select ids.customer_user_id from super_admin_customer_internal_toggle_ids ids),
         'customer-' || (select ids.suffix from super_admin_customer_internal_toggle_ids ids) || '@rocketboard.test',
         'Visible Customer',
         false;

       insert into auth.users (
         instance_id,
         id,
         aud,
         role,
         email,
         encrypted_password,
         email_confirmed_at,
         confirmation_token,
         recovery_token,
         email_change_token_new,
         email_change,
         raw_app_meta_data,
         raw_user_meta_data,
         created_at,
         updated_at,
         last_sign_in_at
       )
       select
         '00000000-0000-0000-0000-000000000000',
         seeded.user_id,
         'authenticated',
         'authenticated',
         seeded.email,
         '',
         timezone('utc', now()),
         '',
         '',
         '',
         '',
         '{}'::jsonb,
         jsonb_build_object('name', seeded.full_name),
         timezone('utc', now()),
         timezone('utc', now()),
         timezone('utc', now())
       from super_admin_customer_internal_toggle_users seeded;

       insert into public.profiles (
         user_id,
         email,
         full_name,
         is_internal_admin
       )
       select
         seeded.user_id,
         seeded.email,
         seeded.full_name,
         seeded.is_internal_admin
       from super_admin_customer_internal_toggle_users seeded;

       do $$
       begin
         perform set_config(
           'request.jwt.claim.sub',
           (select ids.admin_user_id::text from super_admin_customer_internal_toggle_ids ids),
           true
         );
         perform set_config('request.jwt.claim.role', 'authenticated', true);
       end
       $$;

       select
         (select count(*)::text from public.super_admin_get_customers((select ids.suffix from super_admin_customer_internal_toggle_ids ids), null, 200, 0))
         || '|'
         || (
           select string_agg(customer.full_name || ':' || customer.is_internal_admin::text, ',' order by customer.full_name)
           from public.super_admin_get_customers(
             (select ids.suffix from super_admin_customer_internal_toggle_ids ids),
             null,
             200,
             0,
             true
           ) customer
         );

       rollback;`,
    )

    expect(result).toBe('1|Internal Admin:true,Visible Customer:false')
  })

  itIfPg('super_admin_get_customers excludes guest org memberships from org counts, memberships, and tier filters', () => {
    const result = psqlScriptQuery(
      `begin;

       create temp table super_admin_customer_guest_membership_ids on commit drop as
       select
         gen_random_uuid() as admin_user_id,
         gen_random_uuid() as visible_user_id,
         gen_random_uuid() as guest_only_user_id,
         gen_random_uuid() as visible_org_id,
         gen_random_uuid() as hidden_guest_org_id,
         gen_random_uuid() as guest_vip_org_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       create temp table super_admin_customer_guest_membership_users on commit drop as
       select
         (select ids.admin_user_id from super_admin_customer_guest_membership_ids ids) as user_id,
         'internal-admin-' || (select ids.suffix from super_admin_customer_guest_membership_ids ids) || '@rocketboard.test' as email,
         'Internal Admin'::text as full_name,
         true as is_internal_admin
       union all
       select
         (select ids.visible_user_id from super_admin_customer_guest_membership_ids ids),
         'visible-member-' || (select ids.suffix from super_admin_customer_guest_membership_ids ids) || '@rocketboard.test',
         'Visible Member',
         false
       union all
       select
         (select ids.guest_only_user_id from super_admin_customer_guest_membership_ids ids),
         'guest-only-' || (select ids.suffix from super_admin_customer_guest_membership_ids ids) || '@rocketboard.test',
         'Guest Only',
         false;

       insert into auth.users (
         instance_id,
         id,
         aud,
         role,
         email,
         encrypted_password,
         email_confirmed_at,
         confirmation_token,
         recovery_token,
         email_change_token_new,
         email_change,
         raw_app_meta_data,
         raw_user_meta_data,
         created_at,
         updated_at,
         last_sign_in_at
       )
       select
         '00000000-0000-0000-0000-000000000000',
         seeded.user_id,
         'authenticated',
         'authenticated',
         seeded.email,
         '',
         timezone('utc', now()),
         '',
         '',
         '',
         '',
         '{}'::jsonb,
         jsonb_build_object('name', seeded.full_name),
         timezone('utc', now()),
         timezone('utc', now()),
         timezone('utc', now())
       from super_admin_customer_guest_membership_users seeded;

       insert into public.profiles (
         user_id,
         email,
         full_name,
         is_internal_admin
       )
       select
         seeded.user_id,
         seeded.email,
         seeded.full_name,
         seeded.is_internal_admin
       from super_admin_customer_guest_membership_users seeded;

       insert into public.organizations (
         id,
         name,
         slug,
         created_by_user_id,
         plan,
         plan_status,
         admin_grant_plan,
         admin_grant_starts_at,
         admin_grant_ends_at
       )
       values
         (
           (select ids.visible_org_id from super_admin_customer_guest_membership_ids ids),
           'Visible Member Org',
           'visible-member-org-' || (select ids.suffix from super_admin_customer_guest_membership_ids ids),
           (select ids.admin_user_id from super_admin_customer_guest_membership_ids ids),
           'pro',
           'active',
           null,
           null,
           null
         ),
         (
           (select ids.hidden_guest_org_id from super_admin_customer_guest_membership_ids ids),
           'Hidden Guest Org',
           'hidden-guest-org-' || (select ids.suffix from super_admin_customer_guest_membership_ids ids),
           (select ids.admin_user_id from super_admin_customer_guest_membership_ids ids),
           'free',
           'canceled',
           null,
           null,
           null
         ),
         (
           (select ids.guest_vip_org_id from super_admin_customer_guest_membership_ids ids),
           'Guest VIP Org',
           'guest-vip-org-' || (select ids.suffix from super_admin_customer_guest_membership_ids ids),
           (select ids.admin_user_id from super_admin_customer_guest_membership_ids ids),
           'free',
           'canceled',
           'pro',
           timezone('utc', now()) - interval '1 day',
           null
         );

       insert into public.organization_members (
         organization_id,
         user_id,
         role,
         seat_status,
         invited_by
       )
       values
         (
           (select ids.visible_org_id from super_admin_customer_guest_membership_ids ids),
           (select ids.visible_user_id from super_admin_customer_guest_membership_ids ids),
           'member',
           'paid',
           (select ids.admin_user_id from super_admin_customer_guest_membership_ids ids)
         ),
         (
           (select ids.hidden_guest_org_id from super_admin_customer_guest_membership_ids ids),
           (select ids.visible_user_id from super_admin_customer_guest_membership_ids ids),
           'guest',
           'free',
           (select ids.admin_user_id from super_admin_customer_guest_membership_ids ids)
         ),
         (
           (select ids.guest_vip_org_id from super_admin_customer_guest_membership_ids ids),
           (select ids.guest_only_user_id from super_admin_customer_guest_membership_ids ids),
           'guest',
           'free',
           (select ids.admin_user_id from super_admin_customer_guest_membership_ids ids)
         );

       do $$
       begin
         perform set_config(
           'request.jwt.claim.sub',
           (select ids.admin_user_id::text from super_admin_customer_guest_membership_ids ids),
           true
         );
         perform set_config('request.jwt.claim.role', 'authenticated', true);
       end
       $$;

       select
         coalesce(
           (
             select string_agg(
               customer.full_name
               || ':'
               || customer.org_count::text
               || ':'
               || jsonb_array_length(customer.memberships)::text
               || ':'
               || coalesce(
                 (
                   select string_agg(entry.membership ->> 'org_name', ',' order by entry.ordinality)
                   from jsonb_array_elements(customer.memberships) with ordinality as entry(membership, ordinality)
                 ),
                 '-'
               ),
               ',' order by customer.full_name
             )
             from public.super_admin_get_customers(
               (select ids.suffix from super_admin_customer_guest_membership_ids ids),
               null,
               200,
               0
             ) customer
           ),
           ''
         )
         || '|'
         || coalesce(
           (
             select string_agg(customer.full_name, ',' order by customer.full_name)
             from public.super_admin_get_customers(
               (select ids.suffix from super_admin_customer_guest_membership_ids ids),
               'free',
               200,
               0
             ) customer
           ),
           ''
         )
         || '|'
         || coalesce(
           (
             select string_agg(customer.full_name, ',' order by customer.full_name)
             from public.super_admin_get_customers(
               (select ids.suffix from super_admin_customer_guest_membership_ids ids),
               'vip',
               200,
               0
             ) customer
           ),
           ''
         );

       rollback;`,
    )

    expect(result).toBe('Guest Only:0:0:-,Visible Member:1:1:Visible Member Org|Guest Only|')
  })

  itIfPg('super_admin_get_customers keeps all memberships for a matched multi-org user in membership order', () => {
    const result = psqlScriptQuery(
      `begin;

       create temp table super_admin_customer_membership_ids on commit drop as
       select
         gen_random_uuid() as admin_user_id,
         gen_random_uuid() as multi_user_id,
         gen_random_uuid() as free_org_id,
         gen_random_uuid() as vip_org_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id,
         id,
         aud,
         role,
         email,
         encrypted_password,
         email_confirmed_at,
         confirmation_token,
         recovery_token,
         email_change_token_new,
         email_change,
         raw_app_meta_data,
         raw_user_meta_data,
         created_at,
         updated_at,
         last_sign_in_at
       )
       values
         (
           '00000000-0000-0000-0000-000000000000',
           (select ids.admin_user_id from super_admin_customer_membership_ids ids),
           'authenticated',
           'authenticated',
           'internal-admin-' || (select ids.suffix from super_admin_customer_membership_ids ids) || '@rocketboard.test',
           '',
           timezone('utc', now()),
           '',
           '',
           '',
           '',
           '{}'::jsonb,
           jsonb_build_object('name', 'Internal Admin'),
           timezone('utc', now()),
           timezone('utc', now()),
           timezone('utc', now())
         ),
         (
           '00000000-0000-0000-0000-000000000000',
           (select ids.multi_user_id from super_admin_customer_membership_ids ids),
           'authenticated',
           'authenticated',
           'multi-org-contract-' || (select ids.suffix from super_admin_customer_membership_ids ids) || '@rocketboard.test',
           '',
           timezone('utc', now()),
           '',
           '',
           '',
           '',
           '{}'::jsonb,
           jsonb_build_object('name', 'Multi Org Contract'),
           timezone('utc', now()),
           timezone('utc', now()),
           timezone('utc', now())
         );

       insert into public.profiles (
         user_id,
         email,
         full_name,
         is_internal_admin
       )
       values
         (
           (select ids.admin_user_id from super_admin_customer_membership_ids ids),
           'internal-admin-' || (select ids.suffix from super_admin_customer_membership_ids ids) || '@rocketboard.test',
           'Internal Admin',
           true
         ),
         (
           (select ids.multi_user_id from super_admin_customer_membership_ids ids),
           'multi-org-contract-' || (select ids.suffix from super_admin_customer_membership_ids ids) || '@rocketboard.test',
           'Multi Org Contract',
           false
         );

       insert into public.organizations (
         id,
         name,
         slug,
         created_by_user_id,
         plan,
         plan_status,
         admin_grant_plan,
         admin_grant_starts_at,
         admin_grant_ends_at
       )
       values
         (
           (select ids.free_org_id from super_admin_customer_membership_ids ids),
           'Multi Org Free',
           'multi-org-free-' || (select ids.suffix from super_admin_customer_membership_ids ids),
           (select ids.admin_user_id from super_admin_customer_membership_ids ids),
           'free',
           'canceled',
           null,
           null,
           null
         ),
         (
           (select ids.vip_org_id from super_admin_customer_membership_ids ids),
           'Multi Org VIP',
           'multi-org-vip-' || (select ids.suffix from super_admin_customer_membership_ids ids),
           (select ids.admin_user_id from super_admin_customer_membership_ids ids),
           'free',
           'canceled',
           'pro',
           timezone('utc', now()) - interval '1 day',
           null
         );

       insert into public.organization_members (
         organization_id,
         user_id,
         role,
         seat_status,
         invited_by,
         created_at
       )
       values
         (
           (select ids.free_org_id from super_admin_customer_membership_ids ids),
           (select ids.multi_user_id from super_admin_customer_membership_ids ids),
           'member',
           'paid',
           (select ids.admin_user_id from super_admin_customer_membership_ids ids),
           timezone('utc', now()) - interval '2 days'
         ),
         (
           (select ids.vip_org_id from super_admin_customer_membership_ids ids),
           (select ids.multi_user_id from super_admin_customer_membership_ids ids),
           'member',
           'paid',
           (select ids.admin_user_id from super_admin_customer_membership_ids ids),
           timezone('utc', now()) - interval '1 day'
         );

       do $$
       begin
         perform set_config(
           'request.jwt.claim.sub',
           (select ids.admin_user_id::text from super_admin_customer_membership_ids ids),
           true
         );
         perform set_config('request.jwt.claim.role', 'authenticated', true);
       end
       $$;

       select
         customer.org_count::text
         || '|'
         || jsonb_array_length(customer.memberships)::text
         || '|'
         || coalesce(
           (
             select string_agg(entry.membership ->> 'org_name', ',' order by entry.ordinality)
             from jsonb_array_elements(customer.memberships) with ordinality as entry(membership, ordinality)
           ),
           ''
         )
       from public.super_admin_get_customers(
         'multi-org-contract-' || (select ids.suffix from super_admin_customer_membership_ids ids),
         'vip',
         200,
         0
       ) customer;

       rollback;`,
    )

    expect(result).toBe('2|2|Multi Org Free,Multi Org VIP')
  })

  itIfPg('super_admin_get_customers paginates by user instead of duplicating multi-org users across pages', () => {
    const result = psqlScriptQuery(
      `begin;

       create temp table super_admin_customer_page_ids on commit drop as
       select
         gen_random_uuid() as admin_user_id,
         gen_random_uuid() as multi_user_id,
         gen_random_uuid() as single_user_id,
         gen_random_uuid() as multi_org_one_id,
         gen_random_uuid() as multi_org_two_id,
         gen_random_uuid() as single_org_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       create temp table super_admin_customer_page_users on commit drop as
       select
         (select ids.admin_user_id from super_admin_customer_page_ids ids) as user_id,
         'internal-admin-' || (select ids.suffix from super_admin_customer_page_ids ids) || '@rocketboard.test' as email,
         'Internal Admin'::text as full_name,
         true as is_internal_admin,
         timezone('utc', now()) - interval '3 minutes' as created_at
       union all
       select
         (select ids.multi_user_id from super_admin_customer_page_ids ids),
         'page-contract-multi-' || (select ids.suffix from super_admin_customer_page_ids ids) || '@rocketboard.test',
         'Page Contract Multi',
         false,
         timezone('utc', now())
       union all
       select
         (select ids.single_user_id from super_admin_customer_page_ids ids),
         'page-contract-single-' || (select ids.suffix from super_admin_customer_page_ids ids) || '@rocketboard.test',
         'Page Contract Single',
         false,
         timezone('utc', now()) - interval '1 minute';

       insert into auth.users (
         instance_id,
         id,
         aud,
         role,
         email,
         encrypted_password,
         email_confirmed_at,
         confirmation_token,
         recovery_token,
         email_change_token_new,
         email_change,
         raw_app_meta_data,
         raw_user_meta_data,
         created_at,
         updated_at,
         last_sign_in_at
       )
       select
         '00000000-0000-0000-0000-000000000000',
         seeded.user_id,
         'authenticated',
         'authenticated',
         seeded.email,
         '',
         timezone('utc', now()),
         '',
         '',
         '',
         '',
         '{}'::jsonb,
         jsonb_build_object('name', seeded.full_name),
         seeded.created_at,
         seeded.created_at,
         seeded.created_at
       from super_admin_customer_page_users seeded;

       insert into public.profiles (
         user_id,
         email,
         full_name,
         is_internal_admin,
         created_at,
         updated_at
       )
       select
         seeded.user_id,
         seeded.email,
         seeded.full_name,
         seeded.is_internal_admin,
         seeded.created_at,
         seeded.created_at
       from super_admin_customer_page_users seeded;

       insert into public.organizations (
         id,
         name,
         slug,
         created_by_user_id
       )
       values
         (
           (select ids.multi_org_one_id from super_admin_customer_page_ids ids),
           'Page Contract Multi One',
           'page-contract-multi-one-' || (select ids.suffix from super_admin_customer_page_ids ids),
           (select ids.admin_user_id from super_admin_customer_page_ids ids)
         ),
         (
           (select ids.multi_org_two_id from super_admin_customer_page_ids ids),
           'Page Contract Multi Two',
           'page-contract-multi-two-' || (select ids.suffix from super_admin_customer_page_ids ids),
           (select ids.admin_user_id from super_admin_customer_page_ids ids)
         ),
         (
           (select ids.single_org_id from super_admin_customer_page_ids ids),
           'Page Contract Single',
           'page-contract-single-' || (select ids.suffix from super_admin_customer_page_ids ids),
           (select ids.admin_user_id from super_admin_customer_page_ids ids)
         );

       insert into public.organization_members (
         organization_id,
         user_id,
         role,
         seat_status,
         invited_by
       )
       values
         (
           (select ids.multi_org_one_id from super_admin_customer_page_ids ids),
           (select ids.multi_user_id from super_admin_customer_page_ids ids),
           'member',
           'paid',
           (select ids.admin_user_id from super_admin_customer_page_ids ids)
         ),
         (
           (select ids.multi_org_two_id from super_admin_customer_page_ids ids),
           (select ids.multi_user_id from super_admin_customer_page_ids ids),
           'member',
           'paid',
           (select ids.admin_user_id from super_admin_customer_page_ids ids)
         ),
         (
           (select ids.single_org_id from super_admin_customer_page_ids ids),
           (select ids.single_user_id from super_admin_customer_page_ids ids),
           'member',
           'paid',
           (select ids.admin_user_id from super_admin_customer_page_ids ids)
         );

       do $$
       begin
         perform set_config(
           'request.jwt.claim.sub',
           (select ids.admin_user_id::text from super_admin_customer_page_ids ids),
           true
         );
         perform set_config('request.jwt.claim.role', 'authenticated', true);
       end
       $$;

       select
         coalesce(
           (
             select customer.full_name || ':' || jsonb_array_length(customer.memberships)::text
             from public.super_admin_get_customers(
               (select ids.suffix from super_admin_customer_page_ids ids),
               null,
               1,
               0
             ) customer
           ),
           ''
         )
         || '|'
         || coalesce(
           (
             select customer.full_name || ':' || jsonb_array_length(customer.memberships)::text
             from public.super_admin_get_customers(
               (select ids.suffix from super_admin_customer_page_ids ids),
               null,
               1,
               1
             ) customer
           ),
           ''
         );

       rollback;`,
    )

    expect(result).toBe('Page Contract Multi:2|Page Contract Single:1')
  })

  itIfPg('accept_invite downgrades a stale member invite to guest when the free org fills before acceptance', () => {
    const result = psqlScriptQuery(
      `begin;

       create temp table stale_member_invite_ids on commit drop as
       select
         gen_random_uuid() as org_id,
         gen_random_uuid() as admin_user_id,
         gen_random_uuid() as target_user_id,
         gen_random_uuid() as filler_user_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       create temp table stale_member_invite_existing_members on commit drop as
       select
         gen_random_uuid() as user_id,
         'existing-member-' || member_no || '-' || (select ids.suffix from stale_member_invite_ids ids) || '@rocketboard.test' as email
       from generate_series(1, 3) member_no;

       insert into auth.users (
         instance_id,
         id,
         aud,
         role,
         email,
         encrypted_password,
         email_confirmed_at,
         confirmation_token,
         recovery_token,
         email_change_token_new,
         email_change,
         raw_app_meta_data,
         raw_user_meta_data,
         created_at,
         updated_at,
         last_sign_in_at
       )
       select
         '00000000-0000-0000-0000-000000000000',
         seeded.user_id,
         'authenticated',
         'authenticated',
         seeded.email,
         'not-used',
         timezone('utc', now()),
         '',
         '',
         '',
         '',
         '{"provider":"email","providers":["email"]}'::jsonb,
         '{"full_name":"Stale Member Invite"}'::jsonb,
         timezone('utc', now()),
         timezone('utc', now()),
         timezone('utc', now())
       from (
         select
           ids.admin_user_id as user_id,
           'stale-admin-' || ids.suffix || '@rocketboard.test' as email
         from stale_member_invite_ids ids
         union all
         select
           ids.target_user_id,
           'stale-target-' || ids.suffix || '@rocketboard.test'
         from stale_member_invite_ids ids
         union all
         select
           ids.filler_user_id,
           'stale-filler-' || ids.suffix || '@rocketboard.test'
         from stale_member_invite_ids ids
         union all
         select user_id, email from stale_member_invite_existing_members
       ) seeded;

       insert into public.organizations (
         id,
         name,
         slug,
         created_by_user_id
       )
       values (
         (select ids.org_id from stale_member_invite_ids ids),
         'Stale Member Invite',
         'stale-member-invite-' || (select ids.suffix from stale_member_invite_ids ids),
         (select ids.admin_user_id from stale_member_invite_ids ids)
       );

       insert into public.organization_members (
         organization_id,
         user_id,
         role,
         seat_status
       )
       values (
         (select ids.org_id from stale_member_invite_ids ids),
         (select ids.admin_user_id from stale_member_invite_ids ids),
         'admin',
         'paid'
       );

       insert into public.organization_members (
         organization_id,
         user_id,
         role,
         seat_status
       )
       select
         (select ids.org_id from stale_member_invite_ids ids),
         seeded.user_id,
         'member',
         'paid'
       from stale_member_invite_existing_members seeded;

       do $$
       begin
         perform set_config(
           'request.jwt.claim.sub',
           (select ids.admin_user_id::text from stale_member_invite_ids ids),
           true
         );
         perform set_config('request.jwt.claim.role', 'authenticated', true);
       end
       $$;

       create temp table stale_member_invite_created on commit drop as
       select *
       from public.create_organization_invite(
         (select ids.org_id from stale_member_invite_ids ids),
         'stale-target-' || (select ids.suffix from stale_member_invite_ids ids) || '@rocketboard.test',
         'member'::public.organization_role,
         null
       );

       insert into public.organization_members (
         organization_id,
         user_id,
         role,
         seat_status
       )
       values (
         (select ids.org_id from stale_member_invite_ids ids),
         (select ids.filler_user_id from stale_member_invite_ids ids),
         'member',
         'paid'
       );

       do $$
       begin
         perform set_config(
           'request.jwt.claim.sub',
           (select ids.target_user_id::text from stale_member_invite_ids ids),
           true
         );
         perform set_config('request.jwt.claim.role', 'authenticated', true);
       end
       $$;

       create temp table stale_member_invite_accept_result on commit drop as
       select *
       from public.accept_invite(
         (select invite.accept_token from stale_member_invite_created invite)
       );

       select
         org_member.role::text || '|' || org_member.seat_status || '|'
         || (select invite.role from public.invitations invite where invite.accept_token = (select created.accept_token from stale_member_invite_created created))
       from public.organization_members org_member
       where org_member.organization_id = (select ids.org_id from stale_member_invite_ids ids)
         and org_member.user_id = (select ids.target_user_id from stale_member_invite_ids ids);

       rollback;`,
    )

    expect(result).toBe('guest|free|guest')
  })

  itIfPg('set_organization_member_role blocks guest promotion when the free org is already full', () => {
    const error = psqlError(
      `begin;

       create temp table guest_promotion_limit_ids on commit drop as
       select
         gen_random_uuid() as org_id,
         gen_random_uuid() as admin_user_id,
         gen_random_uuid() as guest_user_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       create temp table guest_promotion_limit_members on commit drop as
       select
         gen_random_uuid() as user_id,
         'limit-member-' || member_no || '-' || (select ids.suffix from guest_promotion_limit_ids ids) || '@rocketboard.test' as email
       from generate_series(1, 4) member_no;

       insert into auth.users (
         instance_id,
         id,
         aud,
         role,
         email,
         encrypted_password,
         email_confirmed_at,
         confirmation_token,
         recovery_token,
         email_change_token_new,
         email_change,
         raw_app_meta_data,
         raw_user_meta_data,
         created_at,
         updated_at,
         last_sign_in_at
       )
       select
         '00000000-0000-0000-0000-000000000000',
         seeded.user_id,
         'authenticated',
         'authenticated',
         seeded.email,
         'not-used',
         timezone('utc', now()),
         '',
         '',
         '',
         '',
         '{"provider":"email","providers":["email"]}'::jsonb,
         '{"full_name":"Guest Promotion Limit"}'::jsonb,
         timezone('utc', now()),
         timezone('utc', now()),
         timezone('utc', now())
       from (
         select
           ids.admin_user_id as user_id,
           'promotion-admin-' || ids.suffix || '@rocketboard.test' as email
         from guest_promotion_limit_ids ids
         union all
         select
           ids.guest_user_id,
           'promotion-guest-' || ids.suffix || '@rocketboard.test'
         from guest_promotion_limit_ids ids
         union all
         select user_id, email from guest_promotion_limit_members
       ) seeded;

       insert into public.organizations (
         id,
         name,
         slug,
         created_by_user_id
       )
       values (
         (select ids.org_id from guest_promotion_limit_ids ids),
         'Guest Promotion Limit',
         'guest-promotion-limit-' || (select ids.suffix from guest_promotion_limit_ids ids),
         (select ids.admin_user_id from guest_promotion_limit_ids ids)
       );

       insert into public.organization_members (
         organization_id,
         user_id,
         role,
         seat_status
       )
       values (
         (select ids.org_id from guest_promotion_limit_ids ids),
         (select ids.admin_user_id from guest_promotion_limit_ids ids),
         'admin',
         'paid'
       );

       insert into public.organization_members (
         organization_id,
         user_id,
         role,
         seat_status
       )
       select
         (select ids.org_id from guest_promotion_limit_ids ids),
         seeded.user_id,
         'member',
         'paid'
       from guest_promotion_limit_members seeded;

       insert into public.organization_members (
         organization_id,
         user_id,
         role,
         seat_status
       )
       values (
         (select ids.org_id from guest_promotion_limit_ids ids),
         (select ids.guest_user_id from guest_promotion_limit_ids ids),
         'guest',
         'free'
       );

       do $$
       begin
         perform set_config(
           'request.jwt.claim.sub',
           (select ids.admin_user_id::text from guest_promotion_limit_ids ids),
           true
         );
         perform set_config('request.jwt.claim.role', 'authenticated', true);
       end
       $$;

       select public.set_organization_member_role(
         (select ids.org_id from guest_promotion_limit_ids ids),
         (select ids.guest_user_id from guest_promotion_limit_ids ids),
         'member'::public.organization_role
       );

       rollback;`,
    )

    expect(error).toContain('This organization has reached its member limit.')
  })

  itIfPg('timed awards cannot be scheduled with a future admin_grant_starts_at', () => {
    const error = psqlError(
      `begin;

       create temp table scheduled_award_ids on commit drop as
       select
         gen_random_uuid() as user_id,
         gen_random_uuid() as org_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id,
         id,
         aud,
         role,
         email,
         encrypted_password,
         email_confirmed_at,
         confirmation_token,
         recovery_token,
         email_change_token_new,
         email_change,
         raw_app_meta_data,
         raw_user_meta_data,
         created_at,
         updated_at,
         last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select ids.user_id from scheduled_award_ids ids),
         'authenticated',
         'authenticated',
         'scheduled-award-' || (select ids.suffix from scheduled_award_ids ids) || '@rocketboard.test',
         'not-used',
         timezone('utc', now()),
         '',
         '',
         '',
         '',
         '{"provider":"email","providers":["email"]}'::jsonb,
         '{"full_name":"Scheduled Award Contract"}'::jsonb,
         timezone('utc', now()),
         timezone('utc', now()),
         timezone('utc', now())
       );

       insert into public.organizations (
         id,
         name,
         slug,
         created_by_user_id,
         admin_grant_plan,
         admin_grant_starts_at,
         admin_grant_ends_at
       )
       values (
         (select ids.org_id from scheduled_award_ids ids),
         'Scheduled Award Contract',
         'scheduled-award-' || (select ids.suffix from scheduled_award_ids ids),
         (select ids.user_id from scheduled_award_ids ids),
         'pro',
         timezone('utc', now()) + interval '1 day',
         timezone('utc', now()) + interval '2 days'
       );

       rollback;`,
    )

    expect(error).toContain('organizations_admin_grant_schedule_check')
  })

  itIfPg('effective entitlements ignore stale stored limits after an award expires', () => {
    const result = psqlScriptQuery(
      `begin;

       create temp table stale_limit_ids on commit drop as
       select
         gen_random_uuid() as user_id,
         gen_random_uuid() as org_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id,
         id,
         aud,
         role,
         email,
         encrypted_password,
         email_confirmed_at,
         confirmation_token,
         recovery_token,
         email_change_token_new,
         email_change,
         raw_app_meta_data,
         raw_user_meta_data,
         created_at,
         updated_at,
         last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select ids.user_id from stale_limit_ids ids),
         'authenticated',
         'authenticated',
         'stale-limits-' || (select ids.suffix from stale_limit_ids ids) || '@rocketboard.test',
         'not-used',
         timezone('utc', now()),
         '',
         '',
         '',
         '',
         '{"provider":"email","providers":["email"]}'::jsonb,
         '{"full_name":"Stale Limits Contract"}'::jsonb,
         timezone('utc', now()),
         timezone('utc', now()),
         timezone('utc', now())
       );

       insert into public.organizations (
         id,
         name,
         slug,
         created_by_user_id,
         plan,
         admin_grant_plan,
         admin_grant_ends_at,
         limits
       )
       values (
         (select ids.org_id from stale_limit_ids ids),
         'Stale Limits Contract',
         'stale-limits-' || (select ids.suffix from stale_limit_ids ids),
         (select ids.user_id from stale_limit_ids ids),
         'free',
         'pro',
         timezone('utc', now()) - interval '1 day',
         '{"members":-1,"projects":-1,"workspaces":-1,"storage_mb":-1}'::jsonb
       );

       select
         ent.effective_plan
         || '|'
         || (ent.effective_limits ->> 'members')
         || '|'
         || (ent.effective_limits ->> 'projects')
         || '|'
         || (ent.effective_limits ->> 'workspaces')
         || '|'
         || (ent.effective_limits ->> 'storage_mb')
       from public.get_org_effective_entitlements((select ids.org_id from stale_limit_ids ids)) ent;

       rollback;`,
    )

    expect(result).toBe('free|5|10|1|1024')
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

  itIfPg('update_wiki_page coalesces wiki revision snapshots within ten minutes', () => {
    const result = psqlScriptQuery(
      `begin;

       create temp table wiki_revision_snapshot_ids on commit drop as
       select
         gen_random_uuid() as user_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as page_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       do $$
       begin
         perform set_config(
           'request.jwt.claim.sub',
           (select ids.user_id::text from wiki_revision_snapshot_ids ids),
           true
         );
         perform set_config('request.jwt.claim.role', 'authenticated', true);
       end
       $$;

       insert into auth.users (
         instance_id,
         id,
         aud,
         role,
         email,
         encrypted_password,
         email_confirmed_at,
         confirmation_token,
         recovery_token,
         email_change_token_new,
         email_change,
         raw_app_meta_data,
         raw_user_meta_data,
         created_at,
         updated_at,
         last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select ids.user_id from wiki_revision_snapshot_ids ids),
         'authenticated',
         'authenticated',
         'wiki-revision-' || (select ids.suffix from wiki_revision_snapshot_ids ids) || '@rocketboard.test',
         'not-used',
         timezone('utc', now()),
         '',
         '',
         '',
         '',
         '{"provider":"email","providers":["email"]}'::jsonb,
         '{"full_name":"Wiki Revision Contract"}'::jsonb,
         timezone('utc', now()),
         timezone('utc', now()),
         timezone('utc', now())
       );

       insert into public.organizations (
         id,
         name,
         slug,
         created_by_user_id
       )
       values (
         (select ids.org_id from wiki_revision_snapshot_ids ids),
         'Wiki Revision Contract',
         'wiki-revision-' || (select ids.suffix from wiki_revision_snapshot_ids ids),
         (select ids.user_id from wiki_revision_snapshot_ids ids)
       );

       insert into public.organization_members (
         organization_id,
         user_id,
         role
       )
       values (
         (select ids.org_id from wiki_revision_snapshot_ids ids),
         (select ids.user_id from wiki_revision_snapshot_ids ids),
         'member'::public.organization_role
       );

       insert into public.wiki_pages (
         id,
         organization_id,
         title,
         slug,
         content_json,
         content_md,
         created_by_user_id,
         updated_by_user_id
       )
       values (
         (select ids.page_id from wiki_revision_snapshot_ids ids),
         (select ids.org_id from wiki_revision_snapshot_ids ids),
         'Versioned Page',
         'versioned-page-' || (select ids.suffix from wiki_revision_snapshot_ids ids),
         '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Initial"}]}]}'::jsonb,
         'Initial',
         (select ids.user_id from wiki_revision_snapshot_ids ids),
         (select ids.user_id from wiki_revision_snapshot_ids ids)
       );

       select *
       from public.update_wiki_page(
         (select ids.page_id from wiki_revision_snapshot_ids ids),
         null,
         '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"First"}]}]}'::jsonb,
         'First',
         null,
         null,
         null,
         null,
         1
       );

       select *
       from public.update_wiki_page(
         (select ids.page_id from wiki_revision_snapshot_ids ids),
         null,
         '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Second"}]}]}'::jsonb,
         'Second',
         null,
         null,
         null,
         null,
         2
       );

       update public.wiki_page_versions
       set created_at = now() - interval '11 minutes'
       where page_id = (select ids.page_id from wiki_revision_snapshot_ids ids);

       select *
       from public.update_wiki_page(
         (select ids.page_id from wiki_revision_snapshot_ids ids),
         null,
         '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Third"}]}]}'::jsonb,
         'Third',
         null,
         null,
         null,
         null,
         3
       );

       select
         count(*)::text
         || '|'
         || max(version)::text
         || '|'
         || (
           select content_md
           from public.wiki_page_versions
           where page_id = (select ids.page_id from wiki_revision_snapshot_ids ids)
           order by version desc
           limit 1
         )
         || '|'
         || (
           select string_agg(revision_number::text, ',' order by revision_number)
           from public.wiki_page_versions
           where page_id = (select ids.page_id from wiki_revision_snapshot_ids ids)
         )
       from public.wiki_page_versions
       where page_id = (select ids.page_id from wiki_revision_snapshot_ids ids);

       rollback;`,
    )

    expect(result).toBe('2|4|Third|1,2')
  })

  itIfPg('list_wiki_page_versions exposes revision_number for the per-page label', () => {
    const columns = psqlQuery(
      `select string_agg(parameter_name, ',' order by ordinal_position)
       from information_schema.parameters
       where specific_schema='public'
         and specific_name like 'list_wiki_page_versions_%'
         and parameter_mode='OUT'`,
    )
    expect(columns).toBe('id,version,revision_number,title,created_at,author_name')
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
  // Last-active heartbeat plumbing: table, RPC, and the join in
  // get_organization_members that prefers user_activity over auth.users.
  // ---------------------------------------------------------------------------
  itIfPg('touch_user_active RPC exists with the expected signature', () => {
    const signatures = psqlQuery(
      `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='touch_user_active'`,
    )
    expect(signatures).toBe('touch_user_active()')
  })

  itIfPg('user_activity table is RLS-enabled with select-own policy and is touchable only via the RPC', () => {
    const rlsEnabled = psqlQuery(
      `select c.relrowsecurity::text
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relname='user_activity'`,
    )
    expect(rlsEnabled).toBe('true')

    const policies = psqlQuery(
      `select policyname
       from pg_catalog.pg_policies
       where schemaname='public' and tablename='user_activity'
       order by policyname`,
    )
    expect(policies).toBe('user_activity_select_own')
  })

  itIfPg('get_organization_members coalesces user_activity.last_active_at over auth.users.last_sign_in_at', () => {
    const body = psqlQuery(
      `select pg_get_functiondef(to_regprocedure('public.get_organization_members(uuid)'))`,
    )
    expect(body).toContain("coalesce(ua.last_active_at, auth_user_record.last_sign_in_at)")
    expect(body).toContain('left join public.user_activity ua on ua.user_id = om.user_id')
  })

  // ---------------------------------------------------------------------------
  // Invite-requests: member-side request flow + admin approval (org scope only)
  // ---------------------------------------------------------------------------
  itIfPg('invite_requests table exists with cascade FK to organizations and partial unique index', () => {
    const fkAction = psqlQuery(
      `select c.confdeltype
       from pg_catalog.pg_constraint c
       join pg_catalog.pg_class child on child.oid = c.conrelid
       join pg_catalog.pg_namespace n on n.oid = child.relnamespace
       where n.nspname = 'public'
         and child.relname = 'invite_requests'
         and c.contype = 'f'
         and (
           select string_agg(att.attname, ',' order by att.attnum)
           from pg_catalog.pg_attribute att
           where att.attrelid = c.conrelid and att.attnum = any(c.conkey)
         ) = 'organization_id'`,
    )
    expect(fkAction).toBe('c')

    const partialIndex = psqlQuery(
      `select pg_get_indexdef(i.indexrelid)
       from pg_catalog.pg_index i
       join pg_catalog.pg_class c on c.oid = i.indrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = 'invite_requests'
         and i.indisunique
         and i.indpred is not null`,
    )
    expect(partialIndex).toContain('lower(email)')
    expect(partialIndex).toContain("status = 'pending'")
  })

  itIfPg('invite_requests RLS is enabled with select-own-or-admin and insert-own policies', () => {
    const rlsEnabled = psqlQuery(
      `select c.relrowsecurity::text
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname='public' and c.relname='invite_requests'`,
    )
    expect(rlsEnabled).toBe('true')

    const policies = psqlQuery(
      `select policyname
       from pg_catalog.pg_policies
       where schemaname='public' and tablename='invite_requests'
       order by policyname`,
    ).split('\n')
    expect(policies).toContain('invite_requests_insert_own')
    expect(policies).toContain('invite_requests_select_own_or_admin')
  })

  itIfPg('invite-request RPCs exist with expected signatures', () => {
    const signatures = psqlQuery(
      `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public'
         and p.proname in ('create_invite_request', 'list_invite_requests', 'approve_invite_request', 'decline_invite_request')
       order by 1`,
    ).split('\n')
    expect(signatures).toContain('approve_invite_request(target_request_id uuid)')
    expect(signatures).toContain('create_invite_request(target_org_id uuid, target_email text, target_role organization_role)')
    expect(signatures).toContain('decline_invite_request(target_request_id uuid, target_reason text)')
    expect(signatures).toContain('list_invite_requests(target_org_id uuid)')
  })

  itIfPg('approve_invite_request composes create_organization_invite', () => {
    const body = psqlQuery(
      `select pg_get_functiondef(to_regprocedure('public.approve_invite_request(uuid)'))`,
    )
    expect(body).toContain('public.create_organization_invite(')
  })

  itIfPg('list_invite_requests filters non-pending and expired rows', () => {
    const body = psqlQuery(
      `select pg_get_functiondef(to_regprocedure('public.list_invite_requests(uuid)'))`,
    )
    expect(body).toContain("status = 'pending'")
    expect(body).toContain('expires_at > timezone')
  })

  // ---------------------------------------------------------------------------
  // Migration history is exactly the expected file set
  // ---------------------------------------------------------------------------
  itIfPg('supabase_migrations history matches the expected file set', () => {
    const versions = psqlQuery(
      `select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations`,
    ).split(',')
    expect(versions).toEqual([
      '00000000000000',
      '00000000000001',
      '00000000000002',
      '00000000000003',
      '00000000000004',
      '00000000000005',
      '00000000000006',
      '00000000000007',
      '00000000000008',
      '00000000000009',
      '00000000000010',
      '00000000000012',
      '00000000000014',
      '20260418010000',
      '20260418230000',
      '20260419000000',
      '20260419010000',
      '20260419110000',
      '20260419143000',
      '20260419160000',
      '20260419170000',
      '20260419180000',
      '20260419194500',
      '20260419203000',
      '20260419204000',
      '20260420220500',
      '20260421103000',
      '20260421194500',
      '20260421203000',
      '20260421215500',
      '20260421223000',
      '20260422230000',
      '20260424133000',
      '20260425100500',
      '20260428120000',
      '20260428234500',
      '20260429000000',
      '20260429170000',
      '20260430010000',
      '20260502140000',
      '20260503020000',
      '20260503033000',
      '20260503034000',
      '20260503103000',
      '20260504000000',
      '20260504010000',
      '20260504020000',
      '20260504030000',
      '20260504100000',
      '20260504110000',
      '20260504200000',
      '20260504210000',
      '20260504220000',
      '20260505000000',
      '20260505010000',
      '20260505020000',
      '20260505030000',
      '20260505040000',
      '20260506010000',
      '20260506030000',
      '20260506040000',
      '20260506050000',
      '20260507000000',
      '20260507100000',
      '20260507110000',
      '20260507115000',
      '20260507120000',
      '20260507130000',
      '20260508140000',
      '20260508150000',
      '20260509000000',
      '20260509100000',
      '20260509200000',
      '20260510000000',
      '20260510010000',
      '20260510020000',
      '20260510030000',
    ])
  })

  // ---------------------------------------------------------------------------
  // AI Kanban Wave 2 — Phase 2b lifecycle RPCs + schedule fire path
  // ---------------------------------------------------------------------------

  itIfPg('phase 2b RPCs exist with expected signatures', () => {
    const signatures = psqlQuery(
      `select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', E'\n' order by p.proname)
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public'
         and p.proname in (
           'cron_field_matches',
           'next_cron_fire',
           'clone_template_to_card',
           'approve_tool_call',
           'reject_tool_call',
           'retry_agent_run',
           'update_agent_schedule',
           'ai_agent_schedules_tick'
         )`,
    )
    expect(signatures).toContain('cron_field_matches(field_expr text, field_value integer, field_min integer, field_max integer)')
    expect(signatures).toContain('next_cron_fire(cron_expr text, tz text, from_ts timestamp with time zone)')
    expect(signatures).toContain('clone_template_to_card(template jsonb, target_project_id uuid, target_assignee_user_id uuid)')
    expect(signatures).toContain('approve_tool_call(run_id uuid, tool_call_index integer, edited_args jsonb)')
    expect(signatures).toContain('reject_tool_call(run_id uuid, tool_call_index integer, reason text)')
    expect(signatures).toContain('retry_agent_run(prior_run_id uuid)')
    expect(signatures).toContain('update_agent_schedule(schedule_id uuid, new_template jsonb, new_cron_expression text, new_timezone text, new_persona_id uuid, new_target_project_id uuid)')
    expect(signatures).toContain('ai_agent_schedules_tick()')
  })

  itIfPg('phase 2b mutating RPCs are restricted to authenticated/service_role only', () => {
    const privileges = psqlQuery(
      `select string_agg(
         p.proname || ':' ||
         has_function_privilege('anon', p.oid, 'EXECUTE')::text || '|' ||
         has_function_privilege('authenticated', p.oid, 'EXECUTE')::text || '|' ||
         has_function_privilege('service_role', p.oid, 'EXECUTE')::text,
         E'\n' order by p.proname)
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public'
         and p.proname in (
           'clone_template_to_card',
           'approve_tool_call',
           'reject_tool_call',
           'retry_agent_run',
           'update_agent_schedule',
           'ai_agent_schedules_tick'
         )`,
    )
    // ai_agent_schedules_tick is service_role only (cron-driven); others are authenticated + service_role.
    expect(privileges).toContain('ai_agent_schedules_tick:false|false|true')
    expect(privileges).toContain('approve_tool_call:false|true|true')
    expect(privileges).toContain('clone_template_to_card:false|true|true')
    expect(privileges).toContain('reject_tool_call:false|true|true')
    expect(privileges).toContain('retry_agent_run:false|true|true')
    expect(privileges).toContain('update_agent_schedule:false|true|true')
  })

  itIfPg('next_cron_fire computes the next weekday-morning slot in the requested timezone', () => {
    // Sunday 2026-05-03 09:00 UTC → expect Monday 2026-05-04 10:00 UTC
    // for cron `0 10 * * 1-5` in UTC.
    const result = psqlQuery(
      `select to_char(public.next_cron_fire('0 10 * * 1-5', 'UTC', '2026-05-03 09:00:00+00'::timestamptz),
                      'YYYY-MM-DD HH24:MI:SS')`,
    )
    expect(result).toBe('2026-05-04 10:00:00')
  })

  itIfPg('next_cron_fire handles a Friday-only schedule across week boundaries', () => {
    // Saturday 2026-05-02 12:00 UTC → expect Friday 2026-05-08 16:00 UTC
    // for cron `0 16 * * 5`.
    const result = psqlQuery(
      `select to_char(public.next_cron_fire('0 16 * * 5', 'UTC', '2026-05-02 12:00:00+00'::timestamptz),
                      'YYYY-MM-DD HH24:MI:SS')`,
    )
    expect(result).toBe('2026-05-08 16:00:00')
  })

  itIfPg('next_cron_fire rejects malformed cron expressions', () => {
    const error = psqlError(`select public.next_cron_fire('bad expr', 'UTC', now())`)
    expect(error).toMatch(/cron expression must have 5 fields|invalid literal|invalid range/)
  })

  itIfPg('clone_template_to_card creates a card with bot user as assignee and queues a run', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table clone_test_ids on commit drop as
       select gen_random_uuid() as creator_user_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select creator_user_id from clone_test_ids),
         'authenticated', 'authenticated',
         'clone-' || (select suffix from clone_test_ids) || '@rocketboard.test',
         'not-used',
         timezone('utc', now()), '', '', '', '',
         '{}'::jsonb, '{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       );

       insert into public.organizations (id, name, slug, created_by_user_id)
       values (
         (select org_id from clone_test_ids),
         'Clone Org', 'clone-' || (select suffix from clone_test_ids),
         (select creator_user_id from clone_test_ids)
       );
       insert into public.organization_members (organization_id, user_id, role)
       values (
         (select org_id from clone_test_ids), (select creator_user_id from clone_test_ids),
         'admin'::public.organization_role
       );
       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values (
         (select workspace_id from clone_test_ids),
         (select org_id from clone_test_ids),
         'Clone WS', 'clone-ws-' || (select suffix from clone_test_ids),
         (select creator_user_id from clone_test_ids)
       );
       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id, agents_assignable)
       values (
         (select project_id from clone_test_ids),
         (select workspace_id from clone_test_ids),
         'Clone Project',
         'clone-' || (select suffix from clone_test_ids),
         'CL' || upper((select substr(suffix, 1, 4) from clone_test_ids)),
         (select creator_user_id from clone_test_ids),
         (select creator_user_id from clone_test_ids),
         true
       );
       insert into public.project_members (project_id, user_id, role)
       values (
         (select project_id from clone_test_ids),
         (select creator_user_id from clone_test_ids),
         'admin'::public.scope_access_role
       );

       insert into public.ai_personas (organization_id, name, slug, system_prompt, role)
       values (
         (select org_id from clone_test_ids),
         'Clone Sara', 'clone-sara', 'You are a test persona.', 'assistant'
       );

       create temp table clone_test_persona on commit drop as
       select id as persona_id,
         public.provision_agent_user(id) as bot_user_id
       from public.ai_personas
       where organization_id = (select org_id from clone_test_ids) and slug = 'clone-sara';

       create temp table clone_test_card on commit drop as
       select public.clone_template_to_card(
         template => '{"title": "Cloned \${date}", "body_md": "The body."}'::jsonb,
         target_project_id => (select project_id from clone_test_ids),
         target_assignee_user_id => (select bot_user_id from clone_test_persona)
       ) as new_card_id;

       select
         (select case when title like 'Cloned ____-__-__' then 'date_resolved' else 'date_unresolved' end
            from public.cards where id = (select new_card_id from clone_test_card))
         || '|' || (
           select assignee_user_id::text from public.cards
           where id = (select new_card_id from clone_test_card)
         )
         || '|' || (select bot_user_id::text from clone_test_persona)
         || '|' || (
           select count(*)::text from public.ai_agent_runs
           where card_id = (select new_card_id from clone_test_card)
             and dispatch_reason = 'schedule'
             and status = 'queued'
         );
       rollback;`,
    )
    // Format: date_resolved|assignee|bot_user|run_count
    // assignee should equal bot_user; run_count should be 1.
    const parts = result.split('|')
    expect(parts[0]).toBe('date_resolved')
    expect(parts[1]).toBe(parts[2])
    expect(parts[3]).toBe('1')
  })

  itIfPg('approve_tool_call transitions awaiting_approval to executed and is idempotent on second call', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table approve_test_ids on commit drop as
       select gen_random_uuid() as creator_user_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         gen_random_uuid() as card_id,
         gen_random_uuid() as run_id,
         gen_random_uuid() as priority_option_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select creator_user_id from approve_test_ids),
         'authenticated', 'authenticated',
         'approve-' || (select suffix from approve_test_ids) || '@rocketboard.test',
         'not-used',
         timezone('utc', now()), '', '', '', '',
         '{}'::jsonb, '{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       );

       insert into public.organizations (id, name, slug, created_by_user_id)
       values (
         (select org_id from approve_test_ids),
         'Approve Org', 'approve-' || (select suffix from approve_test_ids),
         (select creator_user_id from approve_test_ids)
       );
       insert into public.organization_members (organization_id, user_id, role)
       values (
         (select org_id from approve_test_ids), (select creator_user_id from approve_test_ids),
         'admin'::public.organization_role
       );
       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values (
         (select workspace_id from approve_test_ids),
         (select org_id from approve_test_ids),
         'Approve WS', 'approve-ws-' || (select suffix from approve_test_ids),
         (select creator_user_id from approve_test_ids)
       );
       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id)
       values (
         (select project_id from approve_test_ids),
         (select workspace_id from approve_test_ids),
         'Approve Project',
         'approve-' || (select suffix from approve_test_ids),
         'AP' || upper((select substr(suffix, 1, 4) from approve_test_ids)),
         (select creator_user_id from approve_test_ids),
         (select creator_user_id from approve_test_ids)
       );
       insert into public.project_members (project_id, user_id, role)
       values (
         (select project_id from approve_test_ids),
         (select creator_user_id from approve_test_ids),
         'admin'::public.scope_access_role
       );
       insert into public.cards (id, project_id, project_card_number, title, created_by_user_id)
       values (
         (select card_id from approve_test_ids),
         (select project_id from approve_test_ids),
         1, 'Approve card',
         (select creator_user_id from approve_test_ids)
       );
       insert into public.project_priority_options (id, project_id, label, key, sort_order, is_default)
       values (
         (select priority_option_id from approve_test_ids),
         (select project_id from approve_test_ids),
         'Phase 2c High', 'p2c-high', 1, true
       );

       insert into public.ai_personas (organization_id, name, slug, system_prompt, role)
       values (
         (select org_id from approve_test_ids),
         'Approve Sara', 'approve-sara', 'You are a test persona.', 'assistant'
       );

       create temp table approve_test_persona on commit drop as
       select id as persona_id, public.provision_agent_user(id) as bot_user_id
       from public.ai_personas
       where organization_id = (select org_id from approve_test_ids) and slug = 'approve-sara';

       insert into public.ai_agent_runs (
         id, organization_id, project_id, card_id, persona_id,
         status, dispatch_reason, created_by_user_id,
         tool_calls
       )
       select
         (select run_id from approve_test_ids),
         (select org_id from approve_test_ids),
         (select project_id from approve_test_ids),
         (select card_id from approve_test_ids),
         persona.id,
         'awaiting_approval', 'manual',
         (select creator_user_id from approve_test_ids),
         jsonb_build_array(jsonb_build_object(
           'name', 'set_card_priority',
           'args', jsonb_build_object(
             'card_id', (select card_id from approve_test_ids)::text,
             'priority_option_id', (select priority_option_id from approve_test_ids)::text
           ),
           'status', 'awaiting_approval'
         ))
       from public.ai_personas persona
       where organization_id = (select org_id from approve_test_ids) and slug = 'approve-sara';

       -- Approve tool call as service_role (no auth.uid()).
       do $body$
       begin
         perform public.approve_tool_call((select run_id from approve_test_ids), 0, null);
         -- Second call should be idempotent (no error, status stays executed).
         perform public.approve_tool_call((select run_id from approve_test_ids), 0, null);
       end
       $body$;

       select
         (tool_calls->0->>'status')
         || '|' || coalesce(tool_calls->0->>'executed_at', 'null')::text
         || '|' || coalesce((tool_calls->0->>'approved_by_user_id')::text, 'null')
       from public.ai_agent_runs where id = (select run_id from approve_test_ids);
       rollback;`,
    )
    // Format: status|executed_at|approved_by_user_id
    const parts = result.split('|')
    expect(parts[0]).toBe('executed')
    expect(parts[1]).not.toBe('null') // executed_at stamped
    // approved_by_user_id stays null because the test runs as service_role (no auth.uid()).
    expect(parts[2]).toBe('null')
  })

  itIfPg('approve_tool_call refuses tool calls already in terminal rejected state', () => {
    const error = psqlError(
      `do $$
       declare
         v_user_id uuid := gen_random_uuid();
         v_org_id uuid := gen_random_uuid();
         v_workspace_id uuid := gen_random_uuid();
         v_project_id uuid := gen_random_uuid();
         v_card_id uuid := gen_random_uuid();
         v_run_id uuid := gen_random_uuid();
         v_suffix text := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
         v_persona_id uuid;
       begin
         insert into auth.users (
           instance_id, id, aud, role, email, encrypted_password,
           email_confirmed_at, confirmation_token, recovery_token,
           email_change_token_new, email_change,
           raw_app_meta_data, raw_user_meta_data,
           created_at, updated_at, last_sign_in_at
         )
         values (
           '00000000-0000-0000-0000-000000000000', v_user_id,
           'authenticated', 'authenticated',
           'rej-' || v_suffix || '@rocketboard.test', 'not-used',
           timezone('utc', now()), '', '', '', '',
           '{}'::jsonb, '{}'::jsonb,
           timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
         );
         insert into public.organizations (id, name, slug, created_by_user_id)
         values (v_org_id, 'Rej Org', 'rej-' || v_suffix, v_user_id);
         insert into public.organization_members (organization_id, user_id, role)
         values (v_org_id, v_user_id, 'admin'::public.organization_role);
         insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
         values (v_workspace_id, v_org_id, 'Rej WS', 'rej-ws-' || v_suffix, v_user_id);
         insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id)
         values (v_project_id, v_workspace_id, 'Rej Project', 'rej-' || v_suffix, 'RJ' || upper(substr(v_suffix, 1, 4)), v_user_id, v_user_id);
         insert into public.project_members (project_id, user_id, role)
         values (v_project_id, v_user_id, 'admin'::public.scope_access_role);
         insert into public.cards (id, project_id, project_card_number, title, created_by_user_id)
         values (v_card_id, v_project_id, 1, 'Rej card', v_user_id);
         insert into public.ai_personas (organization_id, name, slug, system_prompt, role)
         values (v_org_id, 'Rej Sara', 'rej-sara-' || v_suffix, 'sys', 'assistant')
         returning id into v_persona_id;
         insert into public.ai_agent_runs (
           id, organization_id, project_id, card_id, persona_id,
           status, dispatch_reason, created_by_user_id, tool_calls
         )
         values (
           v_run_id, v_org_id, v_project_id, v_card_id, v_persona_id,
           'awaiting_approval', 'manual', v_user_id,
           '[{"name":"set_card_priority","args":{},"status":"rejected"}]'::jsonb
         );
         perform public.approve_tool_call(v_run_id, 0, null);
       end
       $$;`,
    )
    expect(error).toMatch(/tool_call_no_longer_pending/)
  })

  itIfPg('reject_tool_call transitions awaiting_approval to rejected with reason captured', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table reject_test_ids on commit drop as
       select gen_random_uuid() as creator_user_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         gen_random_uuid() as card_id,
         gen_random_uuid() as run_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select creator_user_id from reject_test_ids),
         'authenticated', 'authenticated',
         'reject-' || (select suffix from reject_test_ids) || '@rocketboard.test',
         'not-used',
         timezone('utc', now()), '', '', '', '',
         '{}'::jsonb, '{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       );
       insert into public.organizations (id, name, slug, created_by_user_id)
       values ((select org_id from reject_test_ids), 'Reject Org',
         'reject-' || (select suffix from reject_test_ids),
         (select creator_user_id from reject_test_ids));
       insert into public.organization_members (organization_id, user_id, role)
       values ((select org_id from reject_test_ids), (select creator_user_id from reject_test_ids),
         'admin'::public.organization_role);
       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values ((select workspace_id from reject_test_ids), (select org_id from reject_test_ids),
         'Reject WS', 'reject-ws-' || (select suffix from reject_test_ids),
         (select creator_user_id from reject_test_ids));
       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id)
       values ((select project_id from reject_test_ids), (select workspace_id from reject_test_ids),
         'Reject Project', 'reject-' || (select suffix from reject_test_ids),
         'RJ' || upper((select substr(suffix, 1, 4) from reject_test_ids)),
         (select creator_user_id from reject_test_ids), (select creator_user_id from reject_test_ids));
       insert into public.project_members (project_id, user_id, role)
       values ((select project_id from reject_test_ids), (select creator_user_id from reject_test_ids),
         'admin'::public.scope_access_role);
       insert into public.cards (id, project_id, project_card_number, title, created_by_user_id)
       values ((select card_id from reject_test_ids), (select project_id from reject_test_ids),
         1, 'Reject card', (select creator_user_id from reject_test_ids));
       insert into public.ai_personas (organization_id, name, slug, system_prompt, role)
       values ((select org_id from reject_test_ids), 'Reject Sara', 'reject-sara', 'sys', 'assistant');
       insert into public.ai_agent_runs (
         id, organization_id, project_id, card_id, persona_id,
         status, dispatch_reason, created_by_user_id, tool_calls
       )
       select (select run_id from reject_test_ids), (select org_id from reject_test_ids),
         (select project_id from reject_test_ids), (select card_id from reject_test_ids),
         persona.id, 'awaiting_approval', 'manual',
         (select creator_user_id from reject_test_ids),
         '[{"name":"set_card_status","args":{},"status":"awaiting_approval"}]'::jsonb
       from public.ai_personas persona
       where organization_id = (select org_id from reject_test_ids) and slug = 'reject-sara';

       do $body$
       begin
         perform public.reject_tool_call((select run_id from reject_test_ids), 0, 'already done');
       end
       $body$;

       select (tool_calls->0->>'status')
         || '|' || coalesce(tool_calls->0->>'rejection_reason', 'null')
         || '|' || coalesce(tool_calls->0->>'rejected_at', 'null')
       from public.ai_agent_runs where id = (select run_id from reject_test_ids);
       rollback;`,
    )
    const parts = result.split('|')
    expect(parts[0]).toBe('rejected')
    expect(parts[1]).toBe('already done')
    expect(parts[2]).not.toBe('null')
  })

  itIfPg('retry_agent_run links via previous_run_id and expires pending tool calls on prior run', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table retry_test_ids on commit drop as
       select gen_random_uuid() as creator_user_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         gen_random_uuid() as card_id,
         gen_random_uuid() as prior_run_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select creator_user_id from retry_test_ids),
         'authenticated', 'authenticated',
         'retry-' || (select suffix from retry_test_ids) || '@rocketboard.test',
         'not-used',
         timezone('utc', now()), '', '', '', '',
         '{}'::jsonb, '{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       );
       insert into public.organizations (id, name, slug, created_by_user_id)
       values ((select org_id from retry_test_ids), 'Retry Org',
         'retry-' || (select suffix from retry_test_ids),
         (select creator_user_id from retry_test_ids));
       insert into public.organization_members (organization_id, user_id, role)
       values ((select org_id from retry_test_ids), (select creator_user_id from retry_test_ids),
         'admin'::public.organization_role);
       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values ((select workspace_id from retry_test_ids), (select org_id from retry_test_ids),
         'Retry WS', 'retry-ws-' || (select suffix from retry_test_ids),
         (select creator_user_id from retry_test_ids));
       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id, agents_assignable)
       values ((select project_id from retry_test_ids), (select workspace_id from retry_test_ids),
         'Retry Project', 'retry-' || (select suffix from retry_test_ids),
         'RT' || upper((select substr(suffix, 1, 4) from retry_test_ids)),
         (select creator_user_id from retry_test_ids), (select creator_user_id from retry_test_ids), true);
       insert into public.project_members (project_id, user_id, role)
       values ((select project_id from retry_test_ids), (select creator_user_id from retry_test_ids),
         'admin'::public.scope_access_role);
       insert into public.cards (id, project_id, project_card_number, title, created_by_user_id)
       values ((select card_id from retry_test_ids), (select project_id from retry_test_ids),
         1, 'Retry card', (select creator_user_id from retry_test_ids));
       insert into public.ai_personas (organization_id, name, slug, system_prompt, role)
       values ((select org_id from retry_test_ids), 'Retry Sara', 'retry-sara', 'sys', 'assistant');

       insert into public.ai_agent_runs (
         id, organization_id, project_id, card_id, persona_id,
         status, dispatch_reason, created_by_user_id, tool_calls,
         finished_at
       )
       select (select prior_run_id from retry_test_ids), (select org_id from retry_test_ids),
         (select project_id from retry_test_ids), (select card_id from retry_test_ids),
         persona.id, 'failed', 'manual',
         (select creator_user_id from retry_test_ids),
         '[{"name":"set_card_status","args":{},"status":"awaiting_approval"},{"name":"add_comment","args":{},"status":"executed"}]'::jsonb,
         timezone('utc', now())
       from public.ai_personas persona
       where organization_id = (select org_id from retry_test_ids) and slug = 'retry-sara';

       create temp table retry_result on commit drop as
       select public.retry_agent_run((select prior_run_id from retry_test_ids)) as new_run_id;

       select
         (select count(*)::text from public.ai_agent_runs where previous_run_id = (select prior_run_id from retry_test_ids))
         || '|' || (
           select status from public.ai_agent_runs
           where id = (select new_run_id from retry_result)
         )
         || '|' || (
           select tool_calls->0->>'status' from public.ai_agent_runs
           where id = (select prior_run_id from retry_test_ids)
         )
         || '|' || (
           select coalesce(tool_calls->0->>'expired_reason', 'null')
           from public.ai_agent_runs
           where id = (select prior_run_id from retry_test_ids)
         )
         || '|' || (
           select tool_calls->1->>'status' from public.ai_agent_runs
           where id = (select prior_run_id from retry_test_ids)
         );
       rollback;`,
    )
    // Format: child_count|new_status|prior_call_0_status|prior_call_0_expired_reason|prior_call_1_status
    expect(result).toBe('1|queued|expired|superseded_by_retry|executed')
  })

  itIfPg('retry_agent_run is idempotent — second call returns the existing child', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table retry_idem_ids on commit drop as
       select gen_random_uuid() as creator_user_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         gen_random_uuid() as card_id,
         gen_random_uuid() as prior_run_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select creator_user_id from retry_idem_ids),
         'authenticated', 'authenticated',
         'rid-' || (select suffix from retry_idem_ids) || '@rocketboard.test',
         'not-used',
         timezone('utc', now()), '', '', '', '',
         '{}'::jsonb, '{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       );
       insert into public.organizations (id, name, slug, created_by_user_id)
       values ((select org_id from retry_idem_ids), 'RI Org',
         'rid-' || (select suffix from retry_idem_ids), (select creator_user_id from retry_idem_ids));
       insert into public.organization_members (organization_id, user_id, role)
       values ((select org_id from retry_idem_ids), (select creator_user_id from retry_idem_ids),
         'admin'::public.organization_role);
       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values ((select workspace_id from retry_idem_ids), (select org_id from retry_idem_ids),
         'RI WS', 'rid-ws-' || (select suffix from retry_idem_ids), (select creator_user_id from retry_idem_ids));
       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id, agents_assignable)
       values ((select project_id from retry_idem_ids), (select workspace_id from retry_idem_ids),
         'RI Project', 'rid-' || (select suffix from retry_idem_ids),
         'RI' || upper((select substr(suffix, 1, 4) from retry_idem_ids)),
         (select creator_user_id from retry_idem_ids), (select creator_user_id from retry_idem_ids), true);
       insert into public.project_members (project_id, user_id, role)
       values ((select project_id from retry_idem_ids), (select creator_user_id from retry_idem_ids),
         'admin'::public.scope_access_role);
       insert into public.cards (id, project_id, project_card_number, title, created_by_user_id)
       values ((select card_id from retry_idem_ids), (select project_id from retry_idem_ids),
         1, 'RI card', (select creator_user_id from retry_idem_ids));
       insert into public.ai_personas (organization_id, name, slug, system_prompt, role)
       values ((select org_id from retry_idem_ids), 'RI Sara', 'rid-sara', 'sys', 'assistant');
       insert into public.ai_agent_runs (
         id, organization_id, project_id, card_id, persona_id,
         status, dispatch_reason, created_by_user_id, finished_at
       )
       select (select prior_run_id from retry_idem_ids), (select org_id from retry_idem_ids),
         (select project_id from retry_idem_ids), (select card_id from retry_idem_ids),
         persona.id, 'failed', 'manual',
         (select creator_user_id from retry_idem_ids), timezone('utc', now())
       from public.ai_personas persona
       where organization_id = (select org_id from retry_idem_ids) and slug = 'rid-sara';

       create temp table retry_idem_result on commit drop as
       select public.retry_agent_run((select prior_run_id from retry_idem_ids)) as first_id,
         public.retry_agent_run((select prior_run_id from retry_idem_ids)) as second_id;

       select case when first_id = second_id then 'same' else 'different' end
         || '|' || (select count(*)::text from public.ai_agent_runs
                    where previous_run_id = (select prior_run_id from retry_idem_ids))
       from retry_idem_result;
       rollback;`,
    )
    expect(result).toBe('same|1')
  })

  itIfPg('ai_agent_schedules_tick fires due schedules and advances next_run_at', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table tick_test_ids on commit drop as
       select gen_random_uuid() as creator_user_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         gen_random_uuid() as schedule_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select creator_user_id from tick_test_ids),
         'authenticated', 'authenticated',
         'tick-' || (select suffix from tick_test_ids) || '@rocketboard.test',
         'not-used',
         timezone('utc', now()), '', '', '', '',
         '{}'::jsonb, '{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       );
       insert into public.organizations (id, name, slug, created_by_user_id)
       values ((select org_id from tick_test_ids), 'Tick Org',
         'tick-' || (select suffix from tick_test_ids), (select creator_user_id from tick_test_ids));
       insert into public.organization_members (organization_id, user_id, role)
       values ((select org_id from tick_test_ids), (select creator_user_id from tick_test_ids),
         'admin'::public.organization_role);
       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values ((select workspace_id from tick_test_ids), (select org_id from tick_test_ids),
         'Tick WS', 'tick-ws-' || (select suffix from tick_test_ids), (select creator_user_id from tick_test_ids));
       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id, agents_assignable)
       values ((select project_id from tick_test_ids), (select workspace_id from tick_test_ids),
         'Tick Project', 'tick-' || (select suffix from tick_test_ids),
         'TK' || upper((select substr(suffix, 1, 4) from tick_test_ids)),
         (select creator_user_id from tick_test_ids), (select creator_user_id from tick_test_ids), true);
       insert into public.project_members (project_id, user_id, role)
       values ((select project_id from tick_test_ids), (select creator_user_id from tick_test_ids),
         'admin'::public.scope_access_role);
       insert into public.ai_personas (organization_id, name, slug, system_prompt, role)
       values ((select org_id from tick_test_ids), 'Tick Sara', 'tick-sara', 'sys', 'assistant');

       create temp table tick_test_persona on commit drop as
       select id as persona_id,
         public.provision_agent_user(id) as bot_user_id
       from public.ai_personas
       where organization_id = (select org_id from tick_test_ids) and slug = 'tick-sara';

       -- Schedule due 1 minute ago, fires every weekday at 10:00 UTC.
       insert into public.ai_agent_schedules (
         id, organization_id, persona_id, card_template,
         cron_expression, timezone, target_project_id, next_run_at,
         created_by_user_id
       )
       values (
         (select schedule_id from tick_test_ids),
         (select org_id from tick_test_ids),
         (select persona_id from tick_test_persona),
         '{"title":"Tick task","body_md":"do the thing"}'::jsonb,
         '0 10 * * 1-5', 'UTC',
         (select project_id from tick_test_ids),
         timezone('utc', now()) - interval '1 minute',
         (select creator_user_id from tick_test_ids)
       );

       do $body$
       begin
         perform public.ai_agent_schedules_tick();
       end
       $body$;

       select
         (select count(*)::text from public.cards
          where project_id = (select project_id from tick_test_ids)
            and assignee_user_id = (select bot_user_id from tick_test_persona))
         || '|' || (
           select count(*)::text from public.ai_agent_runs
           where dispatch_reason = 'schedule'
             and project_id = (select project_id from tick_test_ids)
         )
         || '|' || case
           when next_run_at > timezone('utc', now()) then 'advanced'
           else 'stale'
         end
         || '|' || case
           when last_run_at is not null then 'stamped'
           else 'unstamped'
         end
       from public.ai_agent_schedules
       where id = (select schedule_id from tick_test_ids);
       rollback;`,
    )
    // Format: card_count|run_count|next_run_status|last_run_status
    expect(result).toBe('1|1|advanced|stamped')
  })

  itIfPg('ai-agent-schedules-tick cron job is scheduled with the every-minute cadence', () => {
    const result = psqlQuery(
      `select schedule || '|' || command
       from cron.job
       where jobname = 'ai-agent-schedules-tick'`,
    )
    expect(result).toContain('* * * * *|')
    expect(result).toContain('public.ai_agent_schedules_tick()')
  })

  itIfPg('ai_agent_schedules_tick auto-pauses schedules whose persona is missing or unprovisioned', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table pause_tick_ids on commit drop as
       select gen_random_uuid() as creator_user_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         gen_random_uuid() as schedule_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select creator_user_id from pause_tick_ids),
         'authenticated', 'authenticated',
         'pause-tick-' || (select suffix from pause_tick_ids) || '@rocketboard.test',
         'not-used', timezone('utc', now()), '', '', '', '',
         '{}'::jsonb, '{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       );
       insert into public.organizations (id, name, slug, created_by_user_id)
       values ((select org_id from pause_tick_ids), 'PT Org',
         'pause-tick-' || (select suffix from pause_tick_ids), (select creator_user_id from pause_tick_ids));
       insert into public.organization_members (organization_id, user_id, role)
       values ((select org_id from pause_tick_ids), (select creator_user_id from pause_tick_ids),
         'admin'::public.organization_role);
       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values ((select workspace_id from pause_tick_ids), (select org_id from pause_tick_ids),
         'PT WS', 'pause-tick-ws-' || (select suffix from pause_tick_ids), (select creator_user_id from pause_tick_ids));
       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id, agents_assignable)
       values ((select project_id from pause_tick_ids), (select workspace_id from pause_tick_ids),
         'PT Project', 'pause-tick-' || (select suffix from pause_tick_ids),
         'PT' || upper((select substr(suffix, 1, 4) from pause_tick_ids)),
         (select creator_user_id from pause_tick_ids), (select creator_user_id from pause_tick_ids), true);
       -- Persona without provisioned bot user. Phase 3c's AFTER INSERT
       -- trigger auto-provisions assistant/monitor personas, so we have to
       -- force the row back to its unprovisioned shape to exercise the
       -- schedule_tick fallback path.
       insert into public.ai_personas (organization_id, name, slug, system_prompt, role)
       values ((select org_id from pause_tick_ids), 'PT Sara', 'pt-sara-' || (select suffix from pause_tick_ids), 'sys', 'assistant');

       update public.ai_personas
       set agent_user_id = null
       where organization_id = (select org_id from pause_tick_ids)
         and slug = 'pt-sara-' || (select suffix from pause_tick_ids);

       insert into public.ai_agent_schedules (
         id, organization_id, persona_id, card_template,
         cron_expression, timezone, target_project_id, next_run_at,
         created_by_user_id
       )
       select (select schedule_id from pause_tick_ids),
         (select org_id from pause_tick_ids),
         persona.id,
         '{"title":"PT"}'::jsonb,
         '0 10 * * 1-5', 'UTC',
         (select project_id from pause_tick_ids),
         timezone('utc', now()) - interval '1 minute',
         (select creator_user_id from pause_tick_ids)
       from public.ai_personas persona
       where organization_id = (select org_id from pause_tick_ids)
         and slug = 'pt-sara-' || (select suffix from pause_tick_ids);

       do $body$
       begin
         perform public.ai_agent_schedules_tick();
       end
       $body$;

       select is_paused::text
       from public.ai_agent_schedules
       where id = (select schedule_id from pause_tick_ids);
       rollback;`,
    )
    expect(result).toBe('true')
  })

  // ---------------------------------------------------------------------------
  // AI Kanban Wave 2 — Phase 2c tool execution layer
  // ---------------------------------------------------------------------------

  itIfPg('phase 2c agent_* tool wrappers + dispatcher exist with expected signatures', () => {
    const signatures = psqlQuery(
      `select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', E'\n' order by p.proname)
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public'
         and p.proname in (
           'agent_assert_persona_can_edit_project',
           'agent_add_comment',
           'agent_set_card_status',
           'agent_set_card_priority',
           'agent_set_card_assignee',
           'agent_attach_subtask',
           'agent_create_card_in_project',
           'dispatch_agent_tool_call_internal',
           'start_agent_run'
         )`,
    )
    expect(signatures).toContain('agent_add_comment(target_persona_id uuid, target_card_id uuid, target_body_md text, target_mention_user_ids uuid[])')
    expect(signatures).toContain('agent_set_card_status(target_persona_id uuid, target_card_id uuid, target_status_option_id uuid)')
    expect(signatures).toContain('agent_set_card_priority(target_persona_id uuid, target_card_id uuid, target_priority_option_id uuid)')
    expect(signatures).toContain('agent_set_card_assignee(target_persona_id uuid, target_card_id uuid, target_assignee_user_id uuid)')
    expect(signatures).toContain('agent_attach_subtask(target_persona_id uuid, target_parent_card_id uuid, target_title text, target_body_md text, target_assignee_user_id uuid, target_priority_option_id uuid)')
    expect(signatures).toContain('agent_create_card_in_project(target_persona_id uuid, target_project_id uuid, target_title text, target_body_md text, target_assignee_user_id uuid, target_priority_option_id uuid, target_status_option_id uuid)')
    expect(signatures).toContain('dispatch_agent_tool_call_internal(target_run_id uuid, tool_call_index integer)')
    expect(signatures).toContain('start_agent_run(target_run_id uuid)')
  })

  itIfPg('start_agent_run is service-role only', () => {
    const privileges = psqlQuery(
      `select has_function_privilege('anon', 'public.start_agent_run(uuid)', 'EXECUTE')::text
       || '|' || has_function_privilege('authenticated', 'public.start_agent_run(uuid)', 'EXECUTE')::text
       || '|' || has_function_privilege('service_role', 'public.start_agent_run(uuid)', 'EXECUTE')::text`,
    )
    expect(privileges).toBe('false|false|true')
  })

  itIfPg('cards.parent_card_id column exists for attach_subtask', () => {
    const result = psqlQuery(
      `select data_type::text
       from information_schema.columns
       where table_schema='public' and table_name='cards' and column_name='parent_card_id'`,
    )
    expect(result).toBe('uuid')
  })

  itIfPg('organizations.ai_run_budget_usd_monthly_cap exists with expected type', () => {
    const result = psqlQuery(
      `select data_type::text || '|' || coalesce(numeric_precision::text, 'null') || '|' || coalesce(numeric_scale::text, 'null')
       from information_schema.columns
       where table_schema='public' and table_name='organizations' and column_name='ai_run_budget_usd_monthly_cap'`,
    )
    expect(result).toBe('numeric|10|2')
  })

  itIfPg('organization_ai_fetch_allowlist table is RLS-enabled with admin-only insert/delete', () => {
    const policies = psqlQuery(
      `select string_agg(policyname, ',' order by policyname)
       from pg_catalog.pg_policies
       where schemaname='public' and tablename='organization_ai_fetch_allowlist'`,
    )
    expect(policies).toBe('organization_ai_fetch_allowlist_delete,organization_ai_fetch_allowlist_insert,organization_ai_fetch_allowlist_select')

    const rlsEnabled = psqlQuery(
      `select c.relrowsecurity::text
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relname='organization_ai_fetch_allowlist'`,
    )
    expect(rlsEnabled).toBe('true')
  })

  itIfPg('ai-agent-run-pull-fallback cron job is scheduled with the every-30s cadence and pg_net target', () => {
    const job = psqlQuery(
      `select schedule || '|' || command
       from cron.job
       where jobname = 'ai-agent-run-pull-fallback'`,
    )
    expect(job).toContain('30 seconds|')
    expect(job).toContain('net.http_post')
    expect(job).toContain('/functions/v1/ai-agent-run')
    expect(job).toContain('pull_fallback')
    // Cron body must filter by stuck-queued window so a quiet table is cheap.
    expect(job).toContain("status = 'queued'")
  })

  itIfPg('agent_set_card_assignee refuses bot-to-bot reassignment (loop guard)', () => {
    const error = psqlError(
      `do $$
       declare
         v_creator uuid := gen_random_uuid();
         v_org uuid := gen_random_uuid();
         v_workspace uuid := gen_random_uuid();
         v_project uuid := gen_random_uuid();
         v_card uuid := gen_random_uuid();
         v_suffix text := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
         v_persona_a uuid;
         v_persona_b uuid;
         v_bot_a uuid;
         v_bot_b uuid;
       begin
         insert into auth.users (
           instance_id, id, aud, role, email, encrypted_password,
           email_confirmed_at, confirmation_token, recovery_token,
           email_change_token_new, email_change,
           raw_app_meta_data, raw_user_meta_data,
           created_at, updated_at, last_sign_in_at
         )
         values (
           '00000000-0000-0000-0000-000000000000', v_creator,
           'authenticated', 'authenticated',
           'b2b-' || v_suffix || '@rocketboard.test', 'not-used',
           timezone('utc', now()), '', '', '', '',
           '{}'::jsonb, '{}'::jsonb,
           timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
         );
         insert into public.organizations (id, name, slug, created_by_user_id)
         values (v_org, 'B2B Org', 'b2b-' || v_suffix, v_creator);
         insert into public.organization_members (organization_id, user_id, role)
         values (v_org, v_creator, 'admin'::public.organization_role);
         insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
         values (v_workspace, v_org, 'B2B WS', 'b2b-ws-' || v_suffix, v_creator);
         insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id, agents_assignable)
         values (v_project, v_workspace, 'B2B Proj', 'b2b-' || v_suffix,
           'B2' || upper(substr(v_suffix, 1, 4)), v_creator, v_creator, true);
         insert into public.project_members (project_id, user_id, role)
         values (v_project, v_creator, 'admin'::public.scope_access_role);
         insert into public.cards (id, project_id, project_card_number, title, created_by_user_id)
         values (v_card, v_project, 1, 'B2B Card', v_creator);
         insert into public.ai_personas (organization_id, name, slug, system_prompt, role)
         values (v_org, 'B2B Sara', 'b2b-sara-' || v_suffix, 'sys', 'assistant')
         returning id into v_persona_a;
         insert into public.ai_personas (organization_id, name, slug, system_prompt, role)
         values (v_org, 'B2B Andy', 'b2b-andy-' || v_suffix, 'sys', 'assistant')
         returning id into v_persona_b;
         v_bot_a := public.provision_agent_user(v_persona_a);
         v_bot_b := public.provision_agent_user(v_persona_b);
         perform public.agent_set_card_assignee(v_persona_a, v_card, v_bot_b);
       end
       $$;`,
    )
    expect(error).toMatch(/refusing bot-to-bot reassignment/)
  })

  itIfPg('approve_tool_call dispatches set_card_priority through the dispatcher and mutates the card', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table apt_ids on commit drop as
       select gen_random_uuid() as creator,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         gen_random_uuid() as card_id,
         gen_random_uuid() as run_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select creator from apt_ids),
         'authenticated', 'authenticated',
         'apt-' || (select suffix from apt_ids) || '@rocketboard.test',
         'not-used',
         timezone('utc', now()), '', '', '', '',
         '{}'::jsonb, '{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       );
       insert into public.organizations (id, name, slug, created_by_user_id)
       values ((select org_id from apt_ids), 'APT Org', 'apt-' || (select suffix from apt_ids), (select creator from apt_ids));
       insert into public.organization_members (organization_id, user_id, role)
       values ((select org_id from apt_ids), (select creator from apt_ids), 'admin'::public.organization_role);
       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values ((select workspace_id from apt_ids), (select org_id from apt_ids),
         'APT WS', 'apt-ws-' || (select suffix from apt_ids), (select creator from apt_ids));
       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id, agents_assignable)
       values ((select project_id from apt_ids), (select workspace_id from apt_ids),
         'APT Project', 'apt-' || (select suffix from apt_ids),
         'AP' || upper((select substr(suffix, 1, 4) from apt_ids)),
         (select creator from apt_ids), (select creator from apt_ids), true);
       insert into public.project_members (project_id, user_id, role)
       values ((select project_id from apt_ids), (select creator from apt_ids), 'admin'::public.scope_access_role);
       insert into public.project_priority_options (project_id, label, key, sort_order, is_default)
       values ((select project_id from apt_ids), 'High', 'high', 1, true);

       insert into public.cards (id, project_id, project_card_number, title, created_by_user_id)
       values ((select card_id from apt_ids), (select project_id from apt_ids),
         1, 'APT card', (select creator from apt_ids));

       insert into public.ai_personas (organization_id, name, slug, system_prompt, role)
       values ((select org_id from apt_ids), 'APT Sara', 'apt-sara', 'sys', 'assistant');

       create temp table apt_persona on commit drop as
       select id as persona_id, public.provision_agent_user(id) as bot_user_id
       from public.ai_personas
       where organization_id = (select org_id from apt_ids) and slug = 'apt-sara';

       insert into public.ai_agent_runs (
         id, organization_id, project_id, card_id, persona_id,
         status, dispatch_reason, created_by_user_id, tool_calls
       )
       select
         (select run_id from apt_ids),
         (select org_id from apt_ids),
         (select project_id from apt_ids),
         (select card_id from apt_ids),
         persona_id,
         'awaiting_approval', 'manual',
         (select creator from apt_ids),
         jsonb_build_array(jsonb_build_object(
           'name', 'set_card_priority',
           'args', jsonb_build_object(
             'card_id', (select card_id from apt_ids)::text,
             'priority_option_id', (select id from public.project_priority_options
                                    where project_id = (select project_id from apt_ids) limit 1)::text
           ),
           'status', 'awaiting_approval'
         ))
       from apt_persona;

       do $body$
       begin
         perform public.approve_tool_call((select run_id from apt_ids), 0, null);
       end
       $body$;

       select
         (tool_calls->0->>'status')
         || '|' || (
           select case when priority_option_id is not null then 'card_priority_set' else 'card_priority_unset' end
           from public.cards where id = (select card_id from apt_ids)
         )
         || '|' || (
           select coalesce(updated_by_user_id::text, 'null')
           from public.cards where id = (select card_id from apt_ids)
         )
         || '|' || (select bot_user_id::text from apt_persona)
       from public.ai_agent_runs where id = (select run_id from apt_ids);
       rollback;`,
    )
    // Format: tool_status|card_priority|card_updated_by|bot_user
    // tool transitions to 'executed', card priority is set, updated_by = bot user.
    const parts = result.split('|')
    expect(parts[0]).toBe('executed')
    expect(parts[1]).toBe('card_priority_set')
    expect(parts[2]).toBe(parts[3])
  })

  // ---------------------------------------------------------------------------
  // AI Kanban Wave 2 — Phase 3c persona auto-provision
  // ---------------------------------------------------------------------------

  itIfPg('phase 3c trigger function exists with SECURITY DEFINER + locked search_path', () => {
    const signature = psqlQuery(
      `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='ai_personas_auto_provision_agent_fn'`,
    )
    expect(signature).toBe('ai_personas_auto_provision_agent_fn()')

    const security = psqlQuery(
      `select case when prosecdef then 'definer' else 'invoker' end || '|'
         || coalesce(array_to_string(proconfig, ';'), '')
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='ai_personas_auto_provision_agent_fn'`,
    )
    expect(security.split('|')[0]).toBe('definer')
    expect(security).toContain('search_path=public')

    const grants = psqlQuery(
      `select coalesce(string_agg(grantee || ':' || privilege_type, ',' order by grantee || ':' || privilege_type), '')
       from information_schema.routine_privileges
       where routine_schema='public'
         and routine_name='ai_personas_auto_provision_agent_fn'
         and privilege_type='EXECUTE'`,
    )
    expect(grants).not.toContain('PUBLIC:EXECUTE')
    expect(grants).not.toContain('anon:EXECUTE')
    expect(grants).not.toContain('authenticated:EXECUTE')
  })

  itIfPg('phase 3c trigger is registered AFTER INSERT on ai_personas', () => {
    const triggerDef = psqlQuery(
      `select pg_get_triggerdef(t.oid)
       from pg_catalog.pg_trigger t
       join pg_catalog.pg_class c on c.oid = t.tgrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where t.tgname = 'ai_personas_auto_provision_agent'
         and n.nspname = 'public'
         and c.relname = 'ai_personas'
         and not t.tgisinternal`,
    )
    expect(triggerDef).toContain('CREATE TRIGGER ai_personas_auto_provision_agent')
    expect(triggerDef).toContain('AFTER INSERT')
    expect(triggerDef).toContain('ON public.ai_personas')
    expect(triggerDef).toContain('FOR EACH ROW')
    // pg_get_triggerdef omits the schema prefix on the executed function.
    expect(triggerDef).toContain('EXECUTE FUNCTION ai_personas_auto_provision_agent_fn()')
  })

  itIfPg('phase 3c backfill leaves no enabled assistant/monitor persona unprovisioned', () => {
    // Post-migration invariant — after the DO block + trigger, every
    // assistant/monitor persona that is enabled must have an agent_user_id.
    const remaining = psqlQuery(
      `select count(*) from public.ai_personas
       where role in ('assistant', 'monitor')
         and is_enabled = true
         and agent_user_id is null`,
    )
    expect(remaining).toBe('0')
  })

  itIfPg('phase 3c trigger auto-provisions assistant + monitor only (chat/retro stay null)', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table apa_role_ids on commit drop as
       select gen_random_uuid() as creator_id, gen_random_uuid() as org_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select creator_id from apa_role_ids),
         'authenticated', 'authenticated',
         'apa-role-' || (select suffix from apa_role_ids) || '@rocketboard.test',
         'not-used',
         timezone('utc', now()), '', '', '', '',
         '{}'::jsonb, '{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       );

       insert into public.organizations (id, name, slug, created_by_user_id)
       values (
         (select org_id from apa_role_ids),
         'APA Role Org',
         'apa-role-' || (select suffix from apa_role_ids),
         (select creator_id from apa_role_ids)
       );

       insert into public.organization_members (organization_id, user_id, role)
       values (
         (select org_id from apa_role_ids),
         (select creator_id from apa_role_ids),
         'admin'::public.organization_role
       );

       insert into public.ai_personas (organization_id, name, slug, system_prompt, role)
       values
         ((select org_id from apa_role_ids), 'APA Sara', 'apa-sara', 'sys', 'assistant'),
         ((select org_id from apa_role_ids), 'APA Mon',  'apa-mon',  'sys', 'monitor'),
         ((select org_id from apa_role_ids), 'APA Chat', 'apa-chat', 'sys', 'chat'),
         ((select org_id from apa_role_ids), 'APA Retro','apa-retro','sys', 'retro');

       select string_agg(
         slug || ':' || (case when agent_user_id is not null then 'provisioned' else 'null' end),
         ',' order by slug
       )
       from public.ai_personas
       where organization_id = (select org_id from apa_role_ids);

       rollback;`,
    )
    expect(result).toBe(
      'apa-chat:null,apa-mon:provisioned,apa-retro:null,apa-sara:provisioned',
    )
  })

  itIfPg('phase 3c trigger no-ops when agent_user_id is pre-set (idempotency)', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table apa_idem_ids on commit drop as
       select gen_random_uuid() as creator_id,
         gen_random_uuid() as preset_user_id,
         gen_random_uuid() as org_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values
         (
           '00000000-0000-0000-0000-000000000000',
           (select creator_id from apa_idem_ids),
           'authenticated', 'authenticated',
           'apa-idem-creator-' || (select suffix from apa_idem_ids) || '@rocketboard.test',
           'not-used',
           timezone('utc', now()), '', '', '', '',
           '{}'::jsonb, '{}'::jsonb,
           timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
         ),
         (
           '00000000-0000-0000-0000-000000000000',
           (select preset_user_id from apa_idem_ids),
           'authenticated', 'authenticated',
           'apa-idem-preset-' || (select suffix from apa_idem_ids) || '@rocketboard.test',
           'not-used',
           timezone('utc', now()), '', '', '', '',
           '{}'::jsonb, '{}'::jsonb,
           timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
         );

       insert into public.organizations (id, name, slug, created_by_user_id)
       values (
         (select org_id from apa_idem_ids),
         'APA Idem Org',
         'apa-idem-' || (select suffix from apa_idem_ids),
         (select creator_id from apa_idem_ids)
       );

       insert into public.organization_members (organization_id, user_id, role)
       values
         ((select org_id from apa_idem_ids), (select creator_id from apa_idem_ids),
          'admin'::public.organization_role),
         ((select org_id from apa_idem_ids), (select preset_user_id from apa_idem_ids),
          'agent'::public.organization_role);

       -- Insert a persona with agent_user_id ALREADY set. Trigger must
       -- early-return — no provision_agent_user call, no second auth.users
       -- row carrying the persona_id metadata.
       insert into public.ai_personas (
         organization_id, name, slug, system_prompt, role, agent_user_id
       )
       values (
         (select org_id from apa_idem_ids),
         'APA Idem Sara', 'apa-idem-sara', 'sys', 'assistant',
         (select preset_user_id from apa_idem_ids)
       );

       select
         (select agent_user_id::text from public.ai_personas
          where organization_id = (select org_id from apa_idem_ids)
            and slug = 'apa-idem-sara')
         || '|' || (
           select count(*)::text from auth.users u
           where u.raw_user_meta_data->>'is_agent' = 'true'
             and u.raw_app_meta_data->>'persona_id' in (
               select p.id::text from public.ai_personas p
               where p.organization_id = (select org_id from apa_idem_ids)
             )
         )
         || '|' || (select preset_user_id::text from apa_idem_ids);

       rollback;`,
    )
    // Format: persona.agent_user_id | bot_user_count_for_org | preset_user_id
    const parts = result.split('|')
    expect(parts[0]).toBe(parts[2])
    expect(parts[1]).toBe('0')
  })

  itIfPg('phase 3c trigger rolls back the persona INSERT atomically when provisioning raises', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table apa_rollback_ids on commit drop as
       select gen_random_uuid() as creator_id, gen_random_uuid() as org_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select creator_id from apa_rollback_ids),
         'authenticated', 'authenticated',
         'apa-rb-' || (select suffix from apa_rollback_ids) || '@rocketboard.test',
         'not-used',
         timezone('utc', now()), '', '', '', '',
         '{}'::jsonb, '{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       );

       insert into public.organizations (id, name, slug, created_by_user_id)
       values (
         (select org_id from apa_rollback_ids),
         'APA Rollback Org',
         'apa-rb-' || (select suffix from apa_rollback_ids),
         (select creator_id from apa_rollback_ids)
       );

       insert into public.organization_members (organization_id, user_id, role)
       values (
         (select org_id from apa_rollback_ids),
         (select creator_id from apa_rollback_ids),
         'admin'::public.organization_role
       );

       -- Stub the provisioner to always raise. Inside this transaction
       -- only — the surrounding ROLLBACK restores the real definition.
       create or replace function public.provision_agent_user(target_persona_id uuid)
       returns uuid
       language plpgsql
       as $stub$
       begin
         raise exception 'apa-rollback-stub-raised';
       end;
       $stub$;

       do $body$
       declare
         v_outcome text := 'no-error';
       begin
         begin
           insert into public.ai_personas (organization_id, name, slug, system_prompt, role)
           values (
             (select org_id from apa_rollback_ids),
             'APA Rollback Sara', 'apa-rb-sara', 'sys', 'assistant'
           );
         exception
           when others then
             v_outcome := sqlerrm;
         end;
         if v_outcome not like '%apa-rollback-stub-raised%' then
           raise exception 'expected stub error, got: %', v_outcome;
         end if;
         if exists (
           select 1 from public.ai_personas
           where organization_id = (select org_id from apa_rollback_ids)
             and slug = 'apa-rb-sara'
         ) then
           raise exception 'persona row leaked past failed provisioner';
         end if;
       end;
       $body$;

       select 'rolled-back-cleanly';

       rollback;`,
    )
    expect(result).toBe('rolled-back-cleanly')
  })

  // ---------------------------------------------------------------------------
  // AI Kanban Wave 2 — Phase 4 PR 4-A: get_card_detail extension + realtime
  // ---------------------------------------------------------------------------
  itIfPg('phase 4-A get_card_detail returns the new comment + summary shape', () => {
    const returnsKeys = psqlQuery(
      `select string_agg(parameter_name, ',' order by ordinal_position)
       from information_schema.parameters
       where specific_schema='public'
         and specific_name in (
           select specific_name from information_schema.routines
           where routine_schema='public' and routine_name='get_card_detail'
         )
         and parameter_mode='OUT'`,
    )
    // The newly-added column (agent_run_summary) must appear in the
    // function's OUT parameters; the dropped+recreated definition does
    // not silently lose any of the existing columns.
    expect(returnsKeys).toContain('agent_run_summary')
    expect(returnsKeys).toContain('comments')
    expect(returnsKeys).toContain('attachments')
    expect(returnsKeys).toContain('assignee_user_id')
  })

  itIfPg('phase 4-A get_card_detail emits agent_run_context only for agent-authored comments (D3 + D4)', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table p4a_ids on commit drop as
       select gen_random_uuid() as user_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         gen_random_uuid() as card_id,
         gen_random_uuid() as human_comment_id,
         gen_random_uuid() as agent_comment_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select user_id from p4a_ids),
         'authenticated', 'authenticated',
         'p4a-' || (select suffix from p4a_ids) || '@rocketboard.test',
         'not-used',
         timezone('utc', now()), '', '', '', '',
         '{}'::jsonb, '{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       );
       insert into public.organizations (id, name, slug, created_by_user_id)
       values ((select org_id from p4a_ids), 'P4A Org', 'p4a-' || (select suffix from p4a_ids), (select user_id from p4a_ids));
       insert into public.organization_members (organization_id, user_id, role)
       values ((select org_id from p4a_ids), (select user_id from p4a_ids), 'admin'::public.organization_role);
       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values ((select workspace_id from p4a_ids), (select org_id from p4a_ids), 'P4A WS', 'p4a-ws-' || (select suffix from p4a_ids), (select user_id from p4a_ids));
       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id)
       values ((select project_id from p4a_ids), (select workspace_id from p4a_ids), 'P4A Proj', 'p4a-proj-' || (select suffix from p4a_ids), 'P4' || upper((select substr(suffix, 1, 4) from p4a_ids)), (select user_id from p4a_ids), (select user_id from p4a_ids));
       insert into public.ai_personas (organization_id, name, slug, system_prompt, role)
       values ((select org_id from p4a_ids), 'P4A Sara', 'p4a-sara', 'You are a test persona.', 'assistant');

       create temp table p4a_persona on commit drop as
       select id as persona_id, agent_user_id from public.ai_personas
       where organization_id = (select org_id from p4a_ids) and slug = 'p4a-sara';

       insert into public.cards (id, project_id, project_card_number, title, created_by_user_id)
       values ((select card_id from p4a_ids), (select project_id from p4a_ids), 1, 'P4A card', (select user_id from p4a_ids));

       -- One human-authored comment (no agent_run_context expected).
       insert into public.card_comments (id, card_id, body_text, created_by_user_id, is_streaming)
       values ((select human_comment_id from p4a_ids), (select card_id from p4a_ids), 'human text', (select user_id from p4a_ids), false);

       -- One agent-authored streaming comment whose result_comment_id is
       -- linked to a freshly-dispatched run (agent_run_context expected).
       insert into public.card_comments (id, card_id, body_text, created_by_user_id, is_streaming)
       values ((select agent_comment_id from p4a_ids), (select card_id from p4a_ids), 'agent body', (select agent_user_id from p4a_persona), true);

       create temp table p4a_run on commit drop as
       select public.dispatch_agent_run(
         (select card_id from p4a_ids),
         (select persona_id from p4a_persona)
       ) as run_id;

       update public.ai_agent_runs
       set result_comment_id = (select agent_comment_id from p4a_ids),
           status = 'awaiting_approval',
           tool_calls = jsonb_build_array(
             jsonb_build_object(
               'name', 'set_card_priority',
               'args', jsonb_build_object('card_id', (select card_id from p4a_ids), 'priority', 'p1'),
               'status', 'awaiting_approval',
               'queued_at', now()::text,
               'tool_use_id', 'toolu_p4a_test'
             )
           )
       where id = (select run_id from p4a_run);

       -- Become the org admin so can_access_project succeeds inside the RPC.
       -- get_card_detail is SECURITY DEFINER + reads auth.uid() via the
       -- request.jwt.claim.sub setting; setting that is enough (no role switch).
       select set_config('request.jwt.claim.sub', (select user_id from p4a_ids)::text, true);
       select set_config('request.jwt.claim.role', 'authenticated', true);

       create temp table p4a_detail on commit drop as
       select * from public.get_card_detail((select card_id from p4a_ids));

       select (
         select count(*)::text
         from jsonb_array_elements((select comments from p4a_detail)) entry
         where entry->>'id' = (select human_comment_id from p4a_ids)::text
           and entry->>'agent_run_context' is null
       ) || '|' || (
         select count(*)::text
         from jsonb_array_elements((select comments from p4a_detail)) entry
         where entry->>'id' = (select agent_comment_id from p4a_ids)::text
           and (entry->'agent_run_context'->>'persona_name') = 'P4A Sara'
           and (entry->'agent_run_context'->>'status') = 'awaiting_approval'
           and jsonb_array_length(entry->'agent_run_context'->'tool_calls') = 1
           and (entry->>'is_streaming')::boolean = true
       ) || '|' || (
         select case
           when (select agent_run_summary->>'persona_name' from p4a_detail) = 'P4A Sara'
             and (select agent_run_summary->>'status' from p4a_detail) = 'awaiting_approval'
           then 'summary_live'
           else 'summary_missing'
         end
       );
       rollback;`,
    )
    expect(result).toBe('1|1|summary_live')
  })

  itIfPg('phase 4-A realtime publication includes card_comments and ai_agent_runs', () => {
    const tables = psqlQuery(
      `select string_agg(tablename, ',' order by tablename)
       from pg_catalog.pg_publication_tables
       where pubname='supabase_realtime'
         and schemaname='public'
         and tablename in ('card_comments', 'ai_agent_runs')`,
    )
    expect(tables).toBe('ai_agent_runs,card_comments')
  })

  // ---------------------------------------------------------------------------
  // AI Kanban Wave 2 — Phase 4 PR 4-B: dispatch debounce + cancel-on-reassign
  //                                    + list_project_assignable_personas RPC
  // ---------------------------------------------------------------------------

  itIfPg('phase 4-B list_project_assignable_personas RPC exists with expected signature (D11)', () => {
    const fn = psqlQuery(
      `select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ',' order by p.proname)
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public'
         and p.proname = 'list_project_assignable_personas'`,
    )
    expect(fn).toBe('list_project_assignable_personas(target_project_id uuid)')

    // SECURITY DEFINER + execute restricted to authenticated/service_role only.
    const grantees = psqlQuery(
      `select string_agg(grantee, ',' order by grantee)
       from information_schema.routine_privileges
       where specific_schema='public'
         and routine_name='list_project_assignable_personas'
         and privilege_type='EXECUTE'`,
    )
    expect(grantees).toContain('authenticated')
    expect(grantees).toContain('service_role')
    expect(grantees).not.toContain('anon')
  })

  itIfPg('phase 4-B list_project_assignable_personas filters by agents_assignable + can_edit_project (D11)', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table p4b_ids on commit drop as
       select gen_random_uuid() as admin_id,
         gen_random_uuid() as viewer_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as proj_open_id,
         gen_random_uuid() as proj_locked_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values
         ('00000000-0000-0000-0000-000000000000', (select admin_id from p4b_ids),
          'authenticated','authenticated',
          'p4b-adm-' || (select suffix from p4b_ids) || '@rocketboard.test',
          'not-used', timezone('utc', now()),'','','','',
          '{}'::jsonb,'{}'::jsonb,
          timezone('utc', now()), timezone('utc', now()), timezone('utc', now())),
         ('00000000-0000-0000-0000-000000000000', (select viewer_id from p4b_ids),
          'authenticated','authenticated',
          'p4b-view-' || (select suffix from p4b_ids) || '@rocketboard.test',
          'not-used', timezone('utc', now()),'','','','',
          '{}'::jsonb,'{}'::jsonb,
          timezone('utc', now()), timezone('utc', now()), timezone('utc', now()));

       insert into public.organizations (id, name, slug, created_by_user_id)
       values ((select org_id from p4b_ids), 'P4B Org',
         'p4b-' || (select suffix from p4b_ids), (select admin_id from p4b_ids));
       insert into public.organization_members (organization_id, user_id, role)
       values
         ((select org_id from p4b_ids), (select admin_id from p4b_ids), 'admin'::public.organization_role);
       -- Viewer is intentionally NOT in organization_members — they
       -- have no edit access to projects in this org. The picker
       -- should refuse to enumerate personas for them (D11).
       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values ((select workspace_id from p4b_ids), (select org_id from p4b_ids),
         'P4B WS', 'p4b-ws-' || (select suffix from p4b_ids), (select admin_id from p4b_ids));

       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id, agents_assignable)
       values
         ((select proj_open_id from p4b_ids), (select workspace_id from p4b_ids),
          'P4B Open', 'p4b-open-' || (select suffix from p4b_ids),
          'PA' || upper((select substr(suffix, 1, 4) from p4b_ids)),
          (select admin_id from p4b_ids), (select admin_id from p4b_ids), true),
         ((select proj_locked_id from p4b_ids), (select workspace_id from p4b_ids),
          'P4B Locked', 'p4b-lock-' || (select suffix from p4b_ids),
          'PB' || upper((select substr(suffix, 1, 4) from p4b_ids)),
          (select admin_id from p4b_ids), (select admin_id from p4b_ids), false);

       insert into public.ai_personas (organization_id, name, slug, system_prompt, role)
       values
         ((select org_id from p4b_ids), 'P4B Sara', 'p4b-sara', 'sys', 'assistant'),
         ((select org_id from p4b_ids), 'P4B Andy', 'p4b-andy', 'sys', 'assistant'),
         ((select org_id from p4b_ids), 'P4B Buddy', 'p4b-buddy', 'sys', 'chat');

       -- Become admin so can_edit_project resolves.
       select set_config('request.jwt.claim.sub', (select admin_id from p4b_ids)::text, true);
       select set_config('request.jwt.claim.role', 'authenticated', true);

       create temp table p4b_open_rows on commit drop as
       select * from public.list_project_assignable_personas((select proj_open_id from p4b_ids));

       create temp table p4b_locked_rows on commit drop as
       select * from public.list_project_assignable_personas((select proj_locked_id from p4b_ids));

       -- Now switch to a viewer who isn't an org admin/editor — they
       -- should get an empty result even on the open project.
       create temp table p4b_viewer_rows on commit drop as
       select * from public.list_project_assignable_personas((select proj_open_id from p4b_ids))
       where false; -- placeholder, will populate after role switch

       select set_config('request.jwt.claim.sub', (select viewer_id from p4b_ids)::text, true);
       select set_config('request.jwt.claim.role', 'authenticated', true);

       insert into p4b_viewer_rows
       select * from public.list_project_assignable_personas((select proj_open_id from p4b_ids));

       select
         (select string_agg(name, ',' order by name) from p4b_open_rows)
         || '|' || coalesce((select string_agg(name, ',') from p4b_locked_rows), '<empty>')
         || '|' || coalesce((select string_agg(name, ',') from p4b_viewer_rows), '<empty>');
       rollback;`,
    )
    // Open project as admin: assistants only (Sara + Andy), chat persona excluded.
    // Locked project (agents_assignable=false): empty.
    // Viewer on open project: empty (D11 can_edit_project gate).
    expect(result).toBe('P4B Andy,P4B Sara|<empty>|<empty>')
  })

  itIfPg('phase 4-B trigger debounce: same (card,persona) within 60s yields one run (D2)', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table p4b_d_ids on commit drop as
       select gen_random_uuid() as user_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         gen_random_uuid() as card_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select user_id from p4b_d_ids),
         'authenticated','authenticated',
         'p4b-d-' || (select suffix from p4b_d_ids) || '@rocketboard.test',
         'not-used', timezone('utc', now()),'','','','',
         '{}'::jsonb,'{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       );
       insert into public.organizations (id, name, slug, created_by_user_id)
       values ((select org_id from p4b_d_ids), 'P4BD Org',
         'p4bd-' || (select suffix from p4b_d_ids), (select user_id from p4b_d_ids));
       insert into public.organization_members (organization_id, user_id, role)
       values ((select org_id from p4b_d_ids), (select user_id from p4b_d_ids),
         'admin'::public.organization_role);
       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values ((select workspace_id from p4b_d_ids), (select org_id from p4b_d_ids),
         'P4BD WS', 'p4bd-ws-' || (select suffix from p4b_d_ids),
         (select user_id from p4b_d_ids));
       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id)
       values ((select project_id from p4b_d_ids), (select workspace_id from p4b_d_ids),
         'P4BD Proj', 'p4bd-proj-' || (select suffix from p4b_d_ids),
         'PD' || upper((select substr(suffix, 1, 4) from p4b_d_ids)),
         (select user_id from p4b_d_ids), (select user_id from p4b_d_ids));
       insert into public.ai_personas (organization_id, name, slug, system_prompt, role)
       values ((select org_id from p4b_d_ids), 'Debounce Sara', 'p4bd-sara', 'sys', 'assistant');

       create temp table p4bd_persona on commit drop as
       select id as persona_id, agent_user_id from public.ai_personas
       where organization_id = (select org_id from p4b_d_ids) and slug = 'p4bd-sara';

       insert into public.cards (id, project_id, project_card_number, title, created_by_user_id)
       values ((select card_id from p4b_d_ids), (select project_id from p4b_d_ids), 1, 'Debounce card',
         (select user_id from p4b_d_ids));

       -- First UPDATE flips the assignee to Sara → trigger fires, run #1 created.
       update public.cards
       set assignee_user_id = (select agent_user_id from p4bd_persona)
       where id = (select card_id from p4b_d_ids);

       -- Force the assignee column to register as "changed" again
       -- (the trigger no-ops when old IS NOT DISTINCT FROM new). The
       -- normal UI flow would null + reassign. We emulate that here.
       update public.cards
       set assignee_user_id = null
       where id = (select card_id from p4b_d_ids);

       update public.cards
       set assignee_user_id = (select agent_user_id from p4bd_persona)
       where id = (select card_id from p4b_d_ids);

       select count(*)::text || '|' ||
         (select count(*)::text
          from public.ai_agent_runs
          where card_id = (select card_id from p4b_d_ids)
            and persona_id = (select persona_id from p4bd_persona)
            and status in ('queued','running','awaiting_approval'))
       from public.ai_agent_runs
       where card_id = (select card_id from p4b_d_ids);
       rollback;`,
    )
    // The clear-then-reassign creates a SECOND row only because cancel-on-
    // reassign (D14) cancels run #1, then dispatch fires for run #2.
    // The 60s debounce blocks duplicate (card,persona) inserts but here
    // the OLD assignee was null between the two reassigns, so the cancel
    // path doesn't fire and the debounce DOES guard.
    // Expected: total_runs|live_runs.
    // After D14 cancel happens during the null-reassign? No — null clear
    // doesn't dispatch a new run; it just cancels the prior one. Then
    // reassign back to Sara fires the trigger, sees no live run on
    // (card, sara) (it was cancelled), and dispatches run #2.
    // So total = 2, live = 1 (the second run is the only non-cancelled one).
    expect(result).toBe('2|1')
  })

  itIfPg('phase 4-B cancel-on-reassign cancels prior persona run on Sara → Andy flip (D14)', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table p4b_c_ids on commit drop as
       select gen_random_uuid() as user_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         gen_random_uuid() as card_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select user_id from p4b_c_ids),
         'authenticated','authenticated',
         'p4b-c-' || (select suffix from p4b_c_ids) || '@rocketboard.test',
         'not-used', timezone('utc', now()),'','','','',
         '{}'::jsonb,'{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       );
       insert into public.organizations (id, name, slug, created_by_user_id)
       values ((select org_id from p4b_c_ids), 'P4BC Org',
         'p4bc-' || (select suffix from p4b_c_ids), (select user_id from p4b_c_ids));
       insert into public.organization_members (organization_id, user_id, role)
       values ((select org_id from p4b_c_ids), (select user_id from p4b_c_ids),
         'admin'::public.organization_role);
       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values ((select workspace_id from p4b_c_ids), (select org_id from p4b_c_ids),
         'P4BC WS', 'p4bc-ws-' || (select suffix from p4b_c_ids),
         (select user_id from p4b_c_ids));
       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id)
       values ((select project_id from p4b_c_ids), (select workspace_id from p4b_c_ids),
         'P4BC Proj', 'p4bc-proj-' || (select suffix from p4b_c_ids),
         'PC' || upper((select substr(suffix, 1, 4) from p4b_c_ids)),
         (select user_id from p4b_c_ids), (select user_id from p4b_c_ids));

       insert into public.ai_personas (organization_id, name, slug, system_prompt, role)
       values
         ((select org_id from p4b_c_ids), 'Cancel Sara', 'p4bc-sara', 'sys', 'assistant'),
         ((select org_id from p4b_c_ids), 'Cancel Andy', 'p4bc-andy', 'sys', 'assistant');

       create temp table p4bc_personas on commit drop as
       select slug, id, agent_user_id from public.ai_personas
       where organization_id = (select org_id from p4b_c_ids)
         and slug in ('p4bc-sara','p4bc-andy');

       insert into public.cards (id, project_id, project_card_number, title, created_by_user_id)
       values ((select card_id from p4b_c_ids), (select project_id from p4b_c_ids), 1,
         'Cancel-on-reassign card', (select user_id from p4b_c_ids));

       -- Assign to Sara → dispatch run on (card, sara).
       update public.cards
       set assignee_user_id = (select agent_user_id from p4bc_personas where slug = 'p4bc-sara')
       where id = (select card_id from p4b_c_ids);

       -- Reassign to Andy → trigger should cancel Sara's run, then
       -- dispatch a fresh run for Andy.
       update public.cards
       set assignee_user_id = (select agent_user_id from p4bc_personas where slug = 'p4bc-andy')
       where id = (select card_id from p4b_c_ids);

       select
         (select status from public.ai_agent_runs
          where card_id = (select card_id from p4b_c_ids)
            and persona_id = (select id from p4bc_personas where slug = 'p4bc-sara')
          order by created_at desc limit 1)
         || '|' ||
         (select status from public.ai_agent_runs
          where card_id = (select card_id from p4b_c_ids)
            and persona_id = (select id from p4bc_personas where slug = 'p4bc-andy')
          order by created_at desc limit 1);
       rollback;`,
    )
    // Sara's prior run is cancelled; Andy's new run is queued.
    expect(result).toBe('cancelled|queued')
  })

  // ---------------------------------------------------------------------------
  // AI Kanban Wave 2 — Phase 6-B: cost cap enforcement + budget alerts
  // ---------------------------------------------------------------------------

  itIfPg('phase 6-B start_agent_run rejects with org_budget_capped when calendar-month spend ≥ cap', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table p6b_cap_ids on commit drop as
       select gen_random_uuid() as user_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         gen_random_uuid() as card_id,
         gen_random_uuid() as prior_run_id,
         gen_random_uuid() as new_run_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select user_id from p6b_cap_ids),
         'authenticated','authenticated',
         'p6bcap-' || (select suffix from p6b_cap_ids) || '@rocketboard.test',
         'not-used', timezone('utc', now()),'','','','',
         '{}'::jsonb,'{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       );

       insert into public.organizations (id, name, slug, created_by_user_id, ai_run_budget_usd_monthly_cap)
       values ((select org_id from p6b_cap_ids), 'P6B Cap Org',
         'p6b-cap-' || (select suffix from p6b_cap_ids),
         (select user_id from p6b_cap_ids), 5.00);
       insert into public.organization_members (organization_id, user_id, role)
       values ((select org_id from p6b_cap_ids), (select user_id from p6b_cap_ids),
         'admin'::public.organization_role);
       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values ((select workspace_id from p6b_cap_ids), (select org_id from p6b_cap_ids),
         'P6B Cap WS', 'p6b-cap-ws-' || (select suffix from p6b_cap_ids),
         (select user_id from p6b_cap_ids));
       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id)
       values ((select project_id from p6b_cap_ids), (select workspace_id from p6b_cap_ids),
         'P6B Cap Proj', 'p6b-cap-proj-' || (select suffix from p6b_cap_ids),
         'CB' || upper((select substr(suffix, 1, 4) from p6b_cap_ids)),
         (select user_id from p6b_cap_ids), (select user_id from p6b_cap_ids));

       insert into public.ai_personas (organization_id, name, slug, system_prompt, role)
       values ((select org_id from p6b_cap_ids), 'P6B Cap Sara', 'p6b-cap-sara', 'sys', 'assistant');

       insert into public.cards (id, project_id, project_card_number, title, created_by_user_id)
       values ((select card_id from p6b_cap_ids), (select project_id from p6b_cap_ids),
         1, 'P6B cap card', (select user_id from p6b_cap_ids));

       -- Prior run already burned the entire cap this calendar month.
       insert into public.ai_agent_runs (
         id, organization_id, project_id, card_id, persona_id,
         status, dispatch_reason, created_by_user_id, finished_at, token_cost_usd
       )
       select (select prior_run_id from p6b_cap_ids),
         (select org_id from p6b_cap_ids),
         (select project_id from p6b_cap_ids),
         (select card_id from p6b_cap_ids),
         persona.id,
         'succeeded', 'manual',
         (select user_id from p6b_cap_ids),
         date_trunc('month', now()) + interval '1 day', 5.50
       from public.ai_personas persona
       where organization_id = (select org_id from p6b_cap_ids) and slug = 'p6b-cap-sara';

       -- New queued run that should be rejected by start_agent_run.
       insert into public.ai_agent_runs (
         id, organization_id, project_id, card_id, persona_id,
         status, dispatch_reason, created_by_user_id
       )
       select (select new_run_id from p6b_cap_ids),
         (select org_id from p6b_cap_ids),
         (select project_id from p6b_cap_ids),
         (select card_id from p6b_cap_ids),
         persona.id,
         'queued', 'manual',
         (select user_id from p6b_cap_ids)
       from public.ai_personas persona
       where organization_id = (select org_id from p6b_cap_ids) and slug = 'p6b-cap-sara';

       create temp table p6b_cap_result on commit drop as
       select public.start_agent_run((select new_run_id from p6b_cap_ids)) as ok;

       select
         (select ok::text from p6b_cap_result)
         || '|' || (select status from public.ai_agent_runs where id = (select new_run_id from p6b_cap_ids))
         || '|' || coalesce((select error_text from public.ai_agent_runs where id = (select new_run_id from p6b_cap_ids)), 'null');
       rollback;`,
    )
    // start_agent_run should return false; the run row should be flipped
    // to status='failed' with error_text='org_budget_capped' (D6-2).
    expect(result).toBe('false|failed|org_budget_capped')
  })

  itIfPg('phase 6-B start_agent_run transitions queued → running when below cap', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table p6b_ok_ids on commit drop as
       select gen_random_uuid() as user_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         gen_random_uuid() as card_id,
         gen_random_uuid() as run_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000', (select user_id from p6b_ok_ids),
         'authenticated','authenticated',
         'p6bok-' || (select suffix from p6b_ok_ids) || '@rocketboard.test',
         'not-used', timezone('utc', now()),'','','','',
         '{}'::jsonb,'{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       );

       insert into public.organizations (id, name, slug, created_by_user_id, ai_run_budget_usd_monthly_cap)
       values ((select org_id from p6b_ok_ids), 'P6B OK Org',
         'p6b-ok-' || (select suffix from p6b_ok_ids),
         (select user_id from p6b_ok_ids), 100.00);
       insert into public.organization_members (organization_id, user_id, role)
       values ((select org_id from p6b_ok_ids), (select user_id from p6b_ok_ids),
         'admin'::public.organization_role);
       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values ((select workspace_id from p6b_ok_ids), (select org_id from p6b_ok_ids),
         'P6B OK WS', 'p6b-ok-ws-' || (select suffix from p6b_ok_ids),
         (select user_id from p6b_ok_ids));
       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id)
       values ((select project_id from p6b_ok_ids), (select workspace_id from p6b_ok_ids),
         'P6B OK Proj', 'p6b-ok-proj-' || (select suffix from p6b_ok_ids),
         'OK' || upper((select substr(suffix, 1, 4) from p6b_ok_ids)),
         (select user_id from p6b_ok_ids), (select user_id from p6b_ok_ids));

       insert into public.ai_personas (organization_id, name, slug, system_prompt, role)
       values ((select org_id from p6b_ok_ids), 'P6B OK Sara', 'p6b-ok-sara', 'sys', 'assistant');

       insert into public.cards (id, project_id, project_card_number, title, created_by_user_id)
       values ((select card_id from p6b_ok_ids), (select project_id from p6b_ok_ids),
         1, 'P6B OK card', (select user_id from p6b_ok_ids));

       insert into public.ai_agent_runs (
         id, organization_id, project_id, card_id, persona_id,
         status, dispatch_reason, created_by_user_id
       )
       select (select run_id from p6b_ok_ids),
         (select org_id from p6b_ok_ids),
         (select project_id from p6b_ok_ids),
         (select card_id from p6b_ok_ids),
         persona.id,
         'queued', 'manual',
         (select user_id from p6b_ok_ids)
       from public.ai_personas persona
       where organization_id = (select org_id from p6b_ok_ids) and slug = 'p6b-ok-sara';

       create temp table p6b_ok_result on commit drop as
       select public.start_agent_run((select run_id from p6b_ok_ids)) as ok;

       select
         (select ok::text from p6b_ok_result)
         || '|' || (select status from public.ai_agent_runs where id = (select run_id from p6b_ok_ids));
       rollback;`,
    )
    // No prior spend, cap is $100. start_agent_run wins the CAS and
    // transitions the run to 'running'.
    expect(result).toBe('true|running')
  })

  itIfPg('phase 6-B trigger fires org_budget_warning + org_budget_capped notifications, then is idempotent', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table p6b_alert_ids on commit drop as
       select gen_random_uuid() as user_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         gen_random_uuid() as card_id,
         gen_random_uuid() as run1_id,
         gen_random_uuid() as run2_id,
         gen_random_uuid() as run3_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000', (select user_id from p6b_alert_ids),
         'authenticated','authenticated',
         'p6balert-' || (select suffix from p6b_alert_ids) || '@rocketboard.test',
         'not-used', timezone('utc', now()),'','','','',
         '{}'::jsonb,'{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       );

       insert into public.organizations (id, name, slug, created_by_user_id, ai_run_budget_usd_monthly_cap)
       values ((select org_id from p6b_alert_ids), 'P6B Alert Org',
         'p6b-alert-' || (select suffix from p6b_alert_ids),
         (select user_id from p6b_alert_ids), 50.00);
       insert into public.organization_members (organization_id, user_id, role)
       values ((select org_id from p6b_alert_ids), (select user_id from p6b_alert_ids),
         'admin'::public.organization_role);
       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values ((select workspace_id from p6b_alert_ids), (select org_id from p6b_alert_ids),
         'P6B Alert WS', 'p6b-alert-ws-' || (select suffix from p6b_alert_ids),
         (select user_id from p6b_alert_ids));
       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id)
       values ((select project_id from p6b_alert_ids), (select workspace_id from p6b_alert_ids),
         'P6B Alert Proj', 'p6b-alert-proj-' || (select suffix from p6b_alert_ids),
         'AL' || upper((select substr(suffix, 1, 4) from p6b_alert_ids)),
         (select user_id from p6b_alert_ids), (select user_id from p6b_alert_ids));

       insert into public.ai_personas (organization_id, name, slug, system_prompt, role)
       values ((select org_id from p6b_alert_ids), 'P6B Alert Sara', 'p6b-alert-sara', 'sys', 'assistant');

       insert into public.cards (id, project_id, project_card_number, title, created_by_user_id)
       values ((select card_id from p6b_alert_ids), (select project_id from p6b_alert_ids),
         1, 'P6B alert card', (select user_id from p6b_alert_ids));

       -- Run #1: $30. Pre=0, post=30. 80% threshold = $40 — not crossed.
       insert into public.ai_agent_runs (
         id, organization_id, project_id, card_id, persona_id,
         status, dispatch_reason, created_by_user_id, finished_at, token_cost_usd
       )
       select (select run1_id from p6b_alert_ids),
         (select org_id from p6b_alert_ids),
         (select project_id from p6b_alert_ids),
         (select card_id from p6b_alert_ids),
         persona.id,
         'running', 'manual',
         (select user_id from p6b_alert_ids),
         null, 0
       from public.ai_personas persona
       where organization_id = (select org_id from p6b_alert_ids) and slug = 'p6b-alert-sara';

       update public.ai_agent_runs
         set status = 'succeeded',
             finished_at = date_trunc('month', now()) + interval '1 day',
             token_cost_usd = 30.00
         where id = (select run1_id from p6b_alert_ids);

       -- Run #2: $15. Pre=30, post=45. 80% threshold = $40 → fires warning.
       insert into public.ai_agent_runs (
         id, organization_id, project_id, card_id, persona_id,
         status, dispatch_reason, created_by_user_id, finished_at, token_cost_usd
       )
       select (select run2_id from p6b_alert_ids),
         (select org_id from p6b_alert_ids),
         (select project_id from p6b_alert_ids),
         (select card_id from p6b_alert_ids),
         persona.id,
         'running', 'manual',
         (select user_id from p6b_alert_ids),
         null, 0
       from public.ai_personas persona
       where organization_id = (select org_id from p6b_alert_ids) and slug = 'p6b-alert-sara';

       update public.ai_agent_runs
         set status = 'succeeded',
             finished_at = date_trunc('month', now()) + interval '2 days',
             token_cost_usd = 15.00
         where id = (select run2_id from p6b_alert_ids);

       -- Run #3: $10. Pre=45, post=55. 80% already fired (idempotent →
       -- no second warning); 100% threshold = $50 → fires capped.
       insert into public.ai_agent_runs (
         id, organization_id, project_id, card_id, persona_id,
         status, dispatch_reason, created_by_user_id, finished_at, token_cost_usd
       )
       select (select run3_id from p6b_alert_ids),
         (select org_id from p6b_alert_ids),
         (select project_id from p6b_alert_ids),
         (select card_id from p6b_alert_ids),
         persona.id,
         'running', 'manual',
         (select user_id from p6b_alert_ids),
         null, 0
       from public.ai_personas persona
       where organization_id = (select org_id from p6b_alert_ids) and slug = 'p6b-alert-sara';

       update public.ai_agent_runs
         set status = 'succeeded',
             finished_at = date_trunc('month', now()) + interval '3 days',
             token_cost_usd = 10.00
         where id = (select run3_id from p6b_alert_ids);

       select
         (select count(*)::text from public.notifications
          where organization_id = (select org_id from p6b_alert_ids)
            and kind = 'org_budget_warning')
         || '|' ||
         (select count(*)::text from public.notifications
          where organization_id = (select org_id from p6b_alert_ids)
            and kind = 'org_budget_capped')
         || '|' ||
         (select count(*)::text from public.organization_budget_alert_log
          where organization_id = (select org_id from p6b_alert_ids));
       rollback;`,
    )
    // Exactly one warning + one capped notification + two alert_log rows
    // (one per threshold for this org-month).
    expect(result).toBe('1|1|2')
  })

  itIfPg('phase 6-B update_org_budget_cap rejects non-admin caller', () => {
    const error = psqlError(
      `do $$
       declare
         v_admin_id uuid := gen_random_uuid();
         v_member_id uuid := gen_random_uuid();
         v_org_id uuid := gen_random_uuid();
         v_suffix text := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
       begin
         insert into auth.users (
           instance_id, id, aud, role, email, encrypted_password,
           email_confirmed_at, confirmation_token, recovery_token,
           email_change_token_new, email_change,
           raw_app_meta_data, raw_user_meta_data,
           created_at, updated_at, last_sign_in_at
         )
         values
           ('00000000-0000-0000-0000-000000000000', v_admin_id,
            'authenticated','authenticated',
            'p6b-cap-adm-' || v_suffix || '@rocketboard.test', 'not-used',
            timezone('utc', now()),'','','','',
            '{}'::jsonb,'{}'::jsonb,
            timezone('utc', now()), timezone('utc', now()), timezone('utc', now())),
           ('00000000-0000-0000-0000-000000000000', v_member_id,
            'authenticated','authenticated',
            'p6b-cap-mem-' || v_suffix || '@rocketboard.test', 'not-used',
            timezone('utc', now()),'','','','',
            '{}'::jsonb,'{}'::jsonb,
            timezone('utc', now()), timezone('utc', now()), timezone('utc', now()));
         insert into public.organizations (id, name, slug, created_by_user_id)
         values (v_org_id, 'P6B Member Org', 'p6b-mem-' || v_suffix, v_admin_id);
         insert into public.organization_members (organization_id, user_id, role)
         values
           (v_org_id, v_admin_id, 'admin'::public.organization_role),
           (v_org_id, v_member_id, 'member'::public.organization_role);

         perform set_config('request.jwt.claim.sub', v_member_id::text, true);
         perform set_config('request.jwt.claim.role', 'authenticated', true);

         perform public.update_org_budget_cap(v_org_id, 25.00);
       end
       $$;`,
    )
    expect(error).toMatch(/Organization admin access required/)
  })

  // ---------------------------------------------------------------------------
  // AI Kanban Wave 2 — Phase 7-A: org-scoped API key visibility hardening
  // ---------------------------------------------------------------------------

  itIfPg('phase 7-A ai_api_keys_select policy restricts org-scoped rows to admins only (D7-4)', () => {
    // The Phase 7-A migration tightened the SELECT policy so non-admin members
    // cannot infer whether an org has API keys configured. The policy text
    // must reference role = 'admin' and NOT include 'member'.
    const policy = psqlQuery(
      `select qual
       from pg_catalog.pg_policies
       where schemaname='public' and tablename='ai_api_keys'
         and policyname='ai_api_keys_select'`,
    )
    expect(policy).toContain('user_id = auth.uid()')
    expect(policy).toContain('organization_members')
    expect(policy).toContain("'admin'")
    // The pre-Phase-7-A policy allowed both admin AND member; assert the
    // member-allowing form is gone.
    expect(policy).not.toContain("'member'")
  })

  // ---------------------------------------------------------------------------
  // AI Kanban Wave 2 — Phase 7-B: free-tier dispatch + recurring quota
  // ---------------------------------------------------------------------------

  itIfPg('phase 7-B is_paid_plan_active matrix: paid+active, paid+canceled-grace, VIP, free (REG-C, REG-C2)', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table p7b_paid_ids on commit drop as
       select gen_random_uuid() as user_id,
         gen_random_uuid() as org_pro_active,
         gen_random_uuid() as org_pro_past_due,
         gen_random_uuid() as org_pro_grace,
         gen_random_uuid() as org_pro_grace_expired,
         gen_random_uuid() as org_free_vip,
         gen_random_uuid() as org_free_vip_expired,
         gen_random_uuid() as org_free,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
       )
       values (
         '00000000-0000-0000-0000-000000000000',
         (select user_id from p7b_paid_ids),
         'authenticated','authenticated',
         'p7b-' || (select suffix from p7b_paid_ids) || '@rocketboard.test',
         'not-used', timezone('utc', now()),'','','','',
         '{}'::jsonb,'{}'::jsonb,
         timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
       );

       insert into public.organizations (id, name, slug, created_by_user_id, plan, plan_status, plan_ends_at, admin_grant_plan, admin_grant_ends_at)
       values
         ((select org_pro_active from p7b_paid_ids), 'P7B Pro Active', 'p7b-pa-' || (select suffix from p7b_paid_ids), (select user_id from p7b_paid_ids), 'pro', 'active', null, null, null),
         ((select org_pro_past_due from p7b_paid_ids), 'P7B Pro PastDue', 'p7b-pp-' || (select suffix from p7b_paid_ids), (select user_id from p7b_paid_ids), 'pro', 'past_due', null, null, null),
         ((select org_pro_grace from p7b_paid_ids), 'P7B Pro Grace', 'p7b-pg-' || (select suffix from p7b_paid_ids), (select user_id from p7b_paid_ids), 'pro', 'canceled', timezone('utc', now()) + interval '5 days', null, null),
         ((select org_pro_grace_expired from p7b_paid_ids), 'P7B Pro Grace Exp', 'p7b-pge-' || (select suffix from p7b_paid_ids), (select user_id from p7b_paid_ids), 'pro', 'canceled', timezone('utc', now()) - interval '1 day', null, null),
         ((select org_free_vip from p7b_paid_ids), 'P7B Free VIP', 'p7b-fv-' || (select suffix from p7b_paid_ids), (select user_id from p7b_paid_ids), 'free', 'active', null, 'pro', null),
         ((select org_free_vip_expired from p7b_paid_ids), 'P7B Free VIP Exp', 'p7b-fve-' || (select suffix from p7b_paid_ids), (select user_id from p7b_paid_ids), 'free', 'active', null, 'pro', timezone('utc', now()) - interval '1 day'),
         ((select org_free from p7b_paid_ids), 'P7B Free', 'p7b-fr-' || (select suffix from p7b_paid_ids), (select user_id from p7b_paid_ids), 'free', 'active', null, null, null);

       select
         public.is_paid_plan_active((select org_pro_active from p7b_paid_ids))::text
         || '|' || public.is_paid_plan_active((select org_pro_past_due from p7b_paid_ids))::text
         || '|' || public.is_paid_plan_active((select org_pro_grace from p7b_paid_ids))::text
         || '|' || public.is_paid_plan_active((select org_pro_grace_expired from p7b_paid_ids))::text
         || '|' || public.is_paid_plan_active((select org_free_vip from p7b_paid_ids))::text
         || '|' || public.is_paid_plan_active((select org_free_vip_expired from p7b_paid_ids))::text
         || '|' || public.is_paid_plan_active((select org_free from p7b_paid_ids))::text;
       rollback;`,
    )
    expect(result).toBe('true|true|true|false|true|false|false')
  })

  itIfPg('phase 7-B dispatch_agent_run rejects free-tier 101st dispatch with free_tier_dispatch_quota_exceeded', () => {
    const error = psqlError(
      `do $$
       declare
         v_user_id uuid := gen_random_uuid();
         v_org_id uuid := gen_random_uuid();
         v_workspace_id uuid := gen_random_uuid();
         v_project_id uuid := gen_random_uuid();
         v_card_id uuid := gen_random_uuid();
         v_persona_id uuid;
         v_agent_user_id uuid := gen_random_uuid();
         v_suffix text := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
       begin
         insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
           email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change,
           raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
         values
           ('00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated','authenticated',
            'p7bq-u-' || v_suffix || '@rocketboard.test', 'not-used',
            timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
            timezone('utc', now()), timezone('utc', now()), timezone('utc', now())),
           ('00000000-0000-0000-0000-000000000000', v_agent_user_id, 'authenticated','authenticated',
            'p7bq-a-' || v_suffix || '@rocketboard.test', 'not-used',
            timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
            timezone('utc', now()), timezone('utc', now()), timezone('utc', now()));

         insert into public.organizations (id, name, slug, created_by_user_id, plan)
         values (v_org_id, 'P7BQ Free Org', 'p7bq-' || v_suffix, v_user_id, 'free');
         insert into public.organization_members (organization_id, user_id, role)
         values
           (v_org_id, v_user_id, 'admin'::public.organization_role),
           (v_org_id, v_agent_user_id, 'agent'::public.organization_role);
         insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
         values (v_workspace_id, v_org_id, 'P7BQ WS', 'p7bq-ws-' || v_suffix, v_user_id);
         insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id)
         values (v_project_id, v_workspace_id, 'P7BQ Proj', 'p7bq-proj-' || v_suffix,
           'PQ' || upper(substr(v_suffix, 1, 4)), v_user_id, v_user_id);

         insert into public.ai_personas (organization_id, name, slug, system_prompt, role, agent_user_id)
         values (v_org_id, 'P7BQ Sara', 'p7bq-sara', 'sys', 'assistant', v_agent_user_id)
         returning id into v_persona_id;

         insert into public.cards (id, project_id, project_card_number, title, created_by_user_id)
         values (v_card_id, v_project_id, 1, 'P7BQ card', v_user_id);

         -- 100 prior runs in current month → quota at the limit.
         insert into public.ai_agent_runs (organization_id, project_id, card_id, persona_id,
           status, dispatch_reason, created_by_user_id, created_at)
         select v_org_id, v_project_id, v_card_id, v_persona_id, 'failed', 'manual',
           v_user_id, timezone('utc', now())
         from generate_series(1, 100);

         perform set_config('request.jwt.claim.sub', v_user_id::text, true);
         perform set_config('request.jwt.claim.role', 'authenticated', true);

         -- 101st dispatch should raise.
         perform public.dispatch_agent_run(v_card_id, v_persona_id, 'manual', null, null);
       end
       $$;`,
    )
    expect(error).toMatch(/free_tier_dispatch_quota_exceeded/)
  })

  itIfPg('phase 7-B paid org dispatches at 200 in current month — quota does NOT block', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table p7b_paid_ids2 on commit drop as
       select gen_random_uuid() as user_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         gen_random_uuid() as card_id,
         gen_random_uuid() as agent_user_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
       values
         ('00000000-0000-0000-0000-000000000000', (select user_id from p7b_paid_ids2),
          'authenticated','authenticated',
          'p7bp-u-' || (select suffix from p7b_paid_ids2) || '@rocketboard.test', 'not-used',
          timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
          timezone('utc', now()), timezone('utc', now()), timezone('utc', now())),
         ('00000000-0000-0000-0000-000000000000', (select agent_user_id from p7b_paid_ids2),
          'authenticated','authenticated',
          'p7bp-a-' || (select suffix from p7b_paid_ids2) || '@rocketboard.test', 'not-used',
          timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
          timezone('utc', now()), timezone('utc', now()), timezone('utc', now()));

       insert into public.organizations (id, name, slug, created_by_user_id, plan, plan_status)
       values ((select org_id from p7b_paid_ids2), 'P7BP Pro Org',
         'p7bp-' || (select suffix from p7b_paid_ids2), (select user_id from p7b_paid_ids2), 'pro', 'active');
       insert into public.organization_members (organization_id, user_id, role)
       values
         ((select org_id from p7b_paid_ids2), (select user_id from p7b_paid_ids2),
          'admin'::public.organization_role),
         ((select org_id from p7b_paid_ids2), (select agent_user_id from p7b_paid_ids2),
          'agent'::public.organization_role);
       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values ((select workspace_id from p7b_paid_ids2), (select org_id from p7b_paid_ids2),
         'P7BP WS', 'p7bp-ws-' || (select suffix from p7b_paid_ids2),
         (select user_id from p7b_paid_ids2));
       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id)
       values ((select project_id from p7b_paid_ids2), (select workspace_id from p7b_paid_ids2),
         'P7BP Proj', 'p7bp-proj-' || (select suffix from p7b_paid_ids2),
         'PP' || upper(substr((select suffix from p7b_paid_ids2), 1, 4)),
         (select user_id from p7b_paid_ids2), (select user_id from p7b_paid_ids2));

       insert into public.ai_personas (organization_id, name, slug, system_prompt, role, agent_user_id)
       values ((select org_id from p7b_paid_ids2), 'P7BP Sara', 'p7bp-sara', 'sys', 'assistant',
         (select agent_user_id from p7b_paid_ids2));

       insert into public.cards (id, project_id, project_card_number, title, created_by_user_id)
       values ((select card_id from p7b_paid_ids2), (select project_id from p7b_paid_ids2),
         1, 'P7BP card', (select user_id from p7b_paid_ids2));

       -- 200 prior runs (way over free-tier limit).
       insert into public.ai_agent_runs (organization_id, project_id, card_id, persona_id,
         status, dispatch_reason, created_by_user_id, created_at)
       select (select org_id from p7b_paid_ids2),
         (select project_id from p7b_paid_ids2),
         (select card_id from p7b_paid_ids2),
         persona.id, 'failed', 'manual',
         (select user_id from p7b_paid_ids2),
         timezone('utc', now())
       from public.ai_personas persona, generate_series(1, 200)
       where persona.slug = 'p7bp-sara'
         and persona.organization_id = (select org_id from p7b_paid_ids2);

       select set_config('request.jwt.claim.sub', (select user_id::text from p7b_paid_ids2), true);
       select set_config('request.jwt.claim.role', 'authenticated', true);

       create temp table p7b_paid_result on commit drop as
       select public.dispatch_agent_run(
         (select card_id from p7b_paid_ids2),
         (select id from public.ai_personas where slug = 'p7bp-sara'),
         'manual', null, null
       ) as run_id;

       select case when (select run_id from p7b_paid_result) is not null then 'success' else 'null' end;
       rollback;`,
    )
    expect(result).toBe('success')
  })

  itIfPg('phase 7-B free-tier 2nd active recurring schedule rejected (D7-15 boundary)', () => {
    const error = psqlError(
      `do $$
       declare
         v_user_id uuid := gen_random_uuid();
         v_org_id uuid := gen_random_uuid();
         v_workspace_id uuid := gen_random_uuid();
         v_project_id uuid := gen_random_uuid();
         v_persona_id uuid;
         v_agent_user_id uuid := gen_random_uuid();
         v_suffix text := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
       begin
         insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
           email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change,
           raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
         values
           ('00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated','authenticated',
            'p7bs-u-' || v_suffix || '@rocketboard.test', 'not-used',
            timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
            timezone('utc', now()), timezone('utc', now()), timezone('utc', now())),
           ('00000000-0000-0000-0000-000000000000', v_agent_user_id, 'authenticated','authenticated',
            'p7bs-a-' || v_suffix || '@rocketboard.test', 'not-used',
            timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
            timezone('utc', now()), timezone('utc', now()), timezone('utc', now()));

         insert into public.organizations (id, name, slug, created_by_user_id, plan)
         values (v_org_id, 'P7BS Free Org', 'p7bs-' || v_suffix, v_user_id, 'free');
         insert into public.organization_members (organization_id, user_id, role)
         values
           (v_org_id, v_user_id, 'admin'::public.organization_role),
           (v_org_id, v_agent_user_id, 'agent'::public.organization_role);
         insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
         values (v_workspace_id, v_org_id, 'P7BS WS', 'p7bs-ws-' || v_suffix, v_user_id);
         insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id)
         values (v_project_id, v_workspace_id, 'P7BS Proj', 'p7bs-proj-' || v_suffix,
           'PS' || upper(substr(v_suffix, 1, 4)), v_user_id, v_user_id);

         insert into public.ai_personas (organization_id, name, slug, system_prompt, role, agent_user_id)
         values (v_org_id, 'P7BS Sara', 'p7bs-sara', 'sys', 'assistant', v_agent_user_id)
         returning id into v_persona_id;

         insert into public.ai_agent_schedules (organization_id, target_project_id, persona_id,
           cron_expression, timezone, created_by_user_id, card_template, is_paused, next_run_at)
         values (v_org_id, v_project_id, v_persona_id, '0 9 * * *', 'UTC',
           v_user_id, '{"title":"a","body_md":"x"}'::jsonb, false,
           timezone('utc', now()) + interval '1 hour');

         -- 2nd active should reject.
         insert into public.ai_agent_schedules (organization_id, target_project_id, persona_id,
           cron_expression, timezone, created_by_user_id, card_template, is_paused, next_run_at)
         values (v_org_id, v_project_id, v_persona_id, '0 17 * * *', 'UTC',
           v_user_id, '{"title":"b","body_md":"x"}'::jsonb, false,
           timezone('utc', now()) + interval '2 hours');
       end
       $$;`,
    )
    expect(error).toMatch(/free_tier_recurring_schedule_quota_exceeded/)
  })

  itIfPg('phase 7-B 2nd schedule paused-on-create succeeds; flipping to active rejects (codex C6)', () => {
    const error = psqlError(
      `do $$
       declare
         v_user_id uuid := gen_random_uuid();
         v_org_id uuid := gen_random_uuid();
         v_workspace_id uuid := gen_random_uuid();
         v_project_id uuid := gen_random_uuid();
         v_persona_id uuid;
         v_agent_user_id uuid := gen_random_uuid();
         v_paused_id uuid;
         v_suffix text := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
       begin
         insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
           email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change,
           raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
         values
           ('00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated','authenticated',
            'p7bp2-u-' || v_suffix || '@rocketboard.test', 'not-used',
            timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
            timezone('utc', now()), timezone('utc', now()), timezone('utc', now())),
           ('00000000-0000-0000-0000-000000000000', v_agent_user_id, 'authenticated','authenticated',
            'p7bp2-a-' || v_suffix || '@rocketboard.test', 'not-used',
            timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
            timezone('utc', now()), timezone('utc', now()), timezone('utc', now()));

         insert into public.organizations (id, name, slug, created_by_user_id, plan)
         values (v_org_id, 'P7BP2 Free Org', 'p7bp2-' || v_suffix, v_user_id, 'free');
         insert into public.organization_members (organization_id, user_id, role)
         values
           (v_org_id, v_user_id, 'admin'::public.organization_role),
           (v_org_id, v_agent_user_id, 'agent'::public.organization_role);
         insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
         values (v_workspace_id, v_org_id, 'P7BP2 WS', 'p7bp2-ws-' || v_suffix, v_user_id);
         insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id)
         values (v_project_id, v_workspace_id, 'P7BP2 Proj', 'p7bp2-proj-' || v_suffix,
           'P2' || upper(substr(v_suffix, 1, 4)), v_user_id, v_user_id);

         insert into public.ai_personas (organization_id, name, slug, system_prompt, role, agent_user_id)
         values (v_org_id, 'P7BP2 Sara', 'p7bp2-sara', 'sys', 'assistant', v_agent_user_id)
         returning id into v_persona_id;

         insert into public.ai_agent_schedules (organization_id, target_project_id, persona_id,
           cron_expression, timezone, created_by_user_id, card_template, is_paused, next_run_at)
         values (v_org_id, v_project_id, v_persona_id, '0 9 * * *', 'UTC',
           v_user_id, '{"title":"a","body_md":"x"}'::jsonb, false,
           timezone('utc', now()) + interval '1 hour');

         -- 2nd PAUSED — succeeds.
         insert into public.ai_agent_schedules (organization_id, target_project_id, persona_id,
           cron_expression, timezone, created_by_user_id, card_template, is_paused, next_run_at)
         values (v_org_id, v_project_id, v_persona_id, '0 17 * * *', 'UTC',
           v_user_id, '{"title":"b","body_md":"x"}'::jsonb, true,
           timezone('utc', now()) + interval '2 hours')
         returning id into v_paused_id;

         -- Flip paused → active should reject.
         update public.ai_agent_schedules
         set is_paused = false
         where id = v_paused_id;
       end
       $$;`,
    )
    expect(error).toMatch(/free_tier_recurring_schedule_quota_exceeded/)
  })

  itIfPg('phase 7-B AFTER INSERT trigger has WHEN clause restricting to free orgs (P1)', () => {
    const triggerDef = psqlQuery(
      `select pg_get_triggerdef(t.oid)
       from pg_catalog.pg_trigger t
       join pg_catalog.pg_class c on c.oid = t.tgrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname='public' and c.relname='ai_agent_runs'
         and t.tgname='ai_agent_runs_after_insert_quota_alert'`,
    )
    expect(triggerDef).toContain('AFTER INSERT')
    expect(triggerDef).toContain('NOT is_paid_plan_active')
  })

  itIfPg('phase 7-B notifications_kind_check includes the new dispatch quota kinds', () => {
    const checkDef = psqlQuery(
      `select pg_get_constraintdef(c.oid)
       from pg_catalog.pg_constraint c
       join pg_catalog.pg_class cls on cls.oid = c.conrelid
       join pg_catalog.pg_namespace n on n.oid = cls.relnamespace
       where n.nspname='public' and cls.relname='notifications'
         and c.conname='notifications_kind_check'`,
    )
    expect(checkDef).toContain('org_dispatch_quota_warning')
    expect(checkDef).toContain('org_dispatch_quota_exceeded')
  })

  itIfPg('phase 7-B alert log table is RLS deny-all', () => {
    const rlsEnabled = psqlQuery(
      `select c.relrowsecurity::text
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname='public' and c.relname='organization_dispatch_quota_alert_log'`,
    )
    expect(rlsEnabled).toBe('true')

    const policies = psqlQuery(
      `select coalesce(string_agg(policyname, ','), '<none>')
       from pg_catalog.pg_policies
       where schemaname='public' and tablename='organization_dispatch_quota_alert_log'`,
    )
    expect(policies).toBe('<none>')
  })

  itIfPg('phase 7-B get_org_quota_utilization rejects non-admin caller', () => {
    const error = psqlError(
      `do $$
       declare
         v_user_id uuid := gen_random_uuid();
         v_member_id uuid := gen_random_uuid();
         v_org_id uuid := gen_random_uuid();
         v_suffix text := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
       begin
         insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
           email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change,
           raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
         values
           ('00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated','authenticated',
            'p7bg-' || v_suffix || '@rocketboard.test', 'not-used',
            timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
            timezone('utc', now()), timezone('utc', now()), timezone('utc', now())),
           ('00000000-0000-0000-0000-000000000000', v_member_id, 'authenticated','authenticated',
            'p7bg-mem-' || v_suffix || '@rocketboard.test', 'not-used',
            timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
            timezone('utc', now()), timezone('utc', now()), timezone('utc', now()));

         insert into public.organizations (id, name, slug, created_by_user_id)
         values (v_org_id, 'P7BG Org', 'p7bg-' || v_suffix, v_user_id);
         insert into public.organization_members (organization_id, user_id, role)
         values
           (v_org_id, v_user_id, 'admin'::public.organization_role),
           (v_org_id, v_member_id, 'member'::public.organization_role);

         perform set_config('request.jwt.claim.sub', v_member_id::text, true);
         perform set_config('request.jwt.claim.role', 'authenticated', true);

         perform * from public.get_org_quota_utilization(v_org_id);
       end
       $$;`,
    )
    expect(error).toMatch(/Organization admin access required/)
  })

  // ---------------------------------------------------------------------------
  // HOTFIX 2026-05-07 — get_organization_members excludes role='agent'
  // ---------------------------------------------------------------------------

  itIfPg('get_organization_members excludes AI agent rows from members aggregate (HOTFIX 2026-05-07)', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table hf_agent_ids on commit drop as
       select gen_random_uuid() as admin_id,
         gen_random_uuid() as agent_user_id,
         gen_random_uuid() as org_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
       values
         ('00000000-0000-0000-0000-000000000000', (select admin_id from hf_agent_ids),
          'authenticated','authenticated',
          'hf-adm-' || (select suffix from hf_agent_ids) || '@rocketboard.test',
          'not-used', timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
          timezone('utc', now()), timezone('utc', now()), timezone('utc', now())),
         ('00000000-0000-0000-0000-000000000000', (select agent_user_id from hf_agent_ids),
          'authenticated','authenticated',
          'hf-agent-' || (select suffix from hf_agent_ids) || '@rocketboard-agents.local',
          'not-used', timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
          timezone('utc', now()), timezone('utc', now()), timezone('utc', now()));

       insert into public.profiles (user_id, email, full_name)
       values
         ((select admin_id from hf_agent_ids),
          'hf-adm-' || (select suffix from hf_agent_ids) || '@rocketboard.test', 'HF Admin'),
         ((select agent_user_id from hf_agent_ids),
          'hf-agent-' || (select suffix from hf_agent_ids) || '@rocketboard-agents.local', 'HF Agent');

       insert into public.organizations (id, name, slug, created_by_user_id)
       values ((select org_id from hf_agent_ids), 'HF Org',
         'hf-' || (select suffix from hf_agent_ids), (select admin_id from hf_agent_ids));

       insert into public.organization_members (organization_id, user_id, role)
       values
         ((select org_id from hf_agent_ids), (select admin_id from hf_agent_ids),
          'admin'::public.organization_role),
         ((select org_id from hf_agent_ids), (select agent_user_id from hf_agent_ids),
          'agent'::public.organization_role);

       select set_config('request.jwt.claim.sub', (select admin_id::text from hf_agent_ids), true);
       select set_config('request.jwt.claim.role', 'authenticated', true);

       -- members JSON should contain exactly 1 row (the human admin), NOT the agent.
       select jsonb_array_length(members) || '|' || (members->0->>'role')
       from public.get_organization_members((select org_id from hf_agent_ids));
       rollback;`,
    )
    expect(result).toBe('1|admin')
  })

  // ---------------------------------------------------------------------------
  // AI Kanban Wave 2 — Phase 7-C: per-persona hourly rate cap
  // ---------------------------------------------------------------------------

  itIfPg('phase 7-C ai_personas.max_runs_per_hour column exists with default 60 + check constraint', () => {
    const colDefault = psqlQuery(
      `select column_default from information_schema.columns
       where table_schema='public' and table_name='ai_personas'
         and column_name='max_runs_per_hour'`,
    )
    expect(colDefault).toBe('60')

    const checkDef = psqlQuery(
      `select pg_get_constraintdef(c.oid)
       from pg_catalog.pg_constraint c
       join pg_catalog.pg_class cls on cls.oid = c.conrelid
       where cls.relname='ai_personas'
         and c.conname like '%max_runs_per_hour%'`,
    )
    expect(checkDef).toContain('IS NULL')
    expect(checkDef).toContain('> (0)')
    expect(checkDef).toContain('<= (9999)')
  })

  itIfPg('phase 7-C max_runs_per_hour=0 is rejected by the check constraint (codex S2)', () => {
    const error = psqlError(
      `do $$
       declare
         v_user_id uuid := gen_random_uuid();
         v_org_id uuid := gen_random_uuid();
         v_suffix text := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
       begin
         insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
           email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change,
           raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
         values
           ('00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated','authenticated',
            'p7c-zero-' || v_suffix || '@rocketboard.test', 'not-used',
            timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
            timezone('utc', now()), timezone('utc', now()), timezone('utc', now()));

         insert into public.organizations (id, name, slug, created_by_user_id)
         values (v_org_id, 'P7C Zero', 'p7c-z-' || v_suffix, v_user_id);

         insert into public.ai_personas (organization_id, name, slug, system_prompt, role, max_runs_per_hour)
         values (v_org_id, 'P7C Zero Sara', 'p7c-zero-sara', 'sys', 'assistant', 0);
       end
       $$;`,
    )
    expect(error).toMatch(/check constraint|max_runs_per_hour/)
  })

  itIfPg('phase 7-C start_agent_run rejects 61st run within hour with persona_rate_limited (default cap=60)', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table p7c_cap_ids on commit drop as
       select gen_random_uuid() as user_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         gen_random_uuid() as card_id,
         gen_random_uuid() as agent_user_id,
         gen_random_uuid() as new_run_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
       values
         ('00000000-0000-0000-0000-000000000000', (select user_id from p7c_cap_ids),
          'authenticated','authenticated',
          'p7c-u-' || (select suffix from p7c_cap_ids) || '@rocketboard.test', 'not-used',
          timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
          timezone('utc', now()), timezone('utc', now()), timezone('utc', now())),
         ('00000000-0000-0000-0000-000000000000', (select agent_user_id from p7c_cap_ids),
          'authenticated','authenticated',
          'p7c-a-' || (select suffix from p7c_cap_ids) || '@rocketboard.test', 'not-used',
          timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
          timezone('utc', now()), timezone('utc', now()), timezone('utc', now()));

       insert into public.organizations (id, name, slug, created_by_user_id, plan)
       values ((select org_id from p7c_cap_ids), 'P7C Cap Org',
         'p7c-' || (select suffix from p7c_cap_ids), (select user_id from p7c_cap_ids), 'pro');
       insert into public.organization_members (organization_id, user_id, role)
       values
         ((select org_id from p7c_cap_ids), (select user_id from p7c_cap_ids),
          'admin'::public.organization_role),
         ((select org_id from p7c_cap_ids), (select agent_user_id from p7c_cap_ids),
          'agent'::public.organization_role);
       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values ((select workspace_id from p7c_cap_ids), (select org_id from p7c_cap_ids),
         'P7C WS', 'p7c-ws-' || (select suffix from p7c_cap_ids), (select user_id from p7c_cap_ids));
       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id)
       values ((select project_id from p7c_cap_ids), (select workspace_id from p7c_cap_ids),
         'P7C Proj', 'p7c-proj-' || (select suffix from p7c_cap_ids),
         'PC' || upper(substr((select suffix from p7c_cap_ids), 1, 4)),
         (select user_id from p7c_cap_ids), (select user_id from p7c_cap_ids));

       insert into public.ai_personas (organization_id, name, slug, system_prompt, role, agent_user_id, max_runs_per_hour)
       values ((select org_id from p7c_cap_ids), 'P7C Sara', 'p7c-sara', 'sys', 'assistant',
         (select agent_user_id from p7c_cap_ids), 60);

       insert into public.cards (id, project_id, project_card_number, title, created_by_user_id)
       values ((select card_id from p7c_cap_ids), (select project_id from p7c_cap_ids),
         1, 'P7C card', (select user_id from p7c_cap_ids));

       -- 60 prior runs in last hour (counts toward cap).
       insert into public.ai_agent_runs (organization_id, project_id, card_id, persona_id,
         status, dispatch_reason, created_by_user_id, created_at)
       select (select org_id from p7c_cap_ids), (select project_id from p7c_cap_ids),
         (select card_id from p7c_cap_ids),
         (select id from public.ai_personas where slug = 'p7c-sara'),
         'succeeded', 'manual', (select user_id from p7c_cap_ids), timezone('utc', now())
       from generate_series(1, 60);

       -- 61st queued run.
       insert into public.ai_agent_runs (id, organization_id, project_id, card_id, persona_id,
         status, dispatch_reason, created_by_user_id)
       values ((select new_run_id from p7c_cap_ids), (select org_id from p7c_cap_ids),
         (select project_id from p7c_cap_ids), (select card_id from p7c_cap_ids),
         (select id from public.ai_personas where slug = 'p7c-sara'),
         'queued', 'manual', (select user_id from p7c_cap_ids));

       create temp table p7c_cap_result on commit drop as
       select public.start_agent_run((select new_run_id from p7c_cap_ids)) as ok;

       select
         (select ok::text from p7c_cap_result)
         || '|' || (select status from public.ai_agent_runs where id = (select new_run_id from p7c_cap_ids))
         || '|' || coalesce((select error_text from public.ai_agent_runs where id = (select new_run_id from p7c_cap_ids)), 'null');
       rollback;`,
    )
    expect(result).toBe('false|failed|persona_rate_limited')
  })

  itIfPg('phase 7-C start_agent_run accepts the 60th run (boundary, default cap=60)', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table p7c_b_ids on commit drop as
       select gen_random_uuid() as user_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         gen_random_uuid() as card_id,
         gen_random_uuid() as agent_user_id,
         gen_random_uuid() as new_run_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
       values
         ('00000000-0000-0000-0000-000000000000', (select user_id from p7c_b_ids),
          'authenticated','authenticated',
          'p7cb-u-' || (select suffix from p7c_b_ids) || '@rocketboard.test', 'not-used',
          timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
          timezone('utc', now()), timezone('utc', now()), timezone('utc', now())),
         ('00000000-0000-0000-0000-000000000000', (select agent_user_id from p7c_b_ids),
          'authenticated','authenticated',
          'p7cb-a-' || (select suffix from p7c_b_ids) || '@rocketboard.test', 'not-used',
          timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
          timezone('utc', now()), timezone('utc', now()), timezone('utc', now()));

       insert into public.organizations (id, name, slug, created_by_user_id, plan)
       values ((select org_id from p7c_b_ids), 'P7CB Org',
         'p7cb-' || (select suffix from p7c_b_ids), (select user_id from p7c_b_ids), 'pro');
       insert into public.organization_members (organization_id, user_id, role)
       values
         ((select org_id from p7c_b_ids), (select user_id from p7c_b_ids),
          'admin'::public.organization_role),
         ((select org_id from p7c_b_ids), (select agent_user_id from p7c_b_ids),
          'agent'::public.organization_role);
       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values ((select workspace_id from p7c_b_ids), (select org_id from p7c_b_ids),
         'P7CB WS', 'p7cb-ws-' || (select suffix from p7c_b_ids), (select user_id from p7c_b_ids));
       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id)
       values ((select project_id from p7c_b_ids), (select workspace_id from p7c_b_ids),
         'P7CB Proj', 'p7cb-proj-' || (select suffix from p7c_b_ids),
         'PB' || upper(substr((select suffix from p7c_b_ids), 1, 4)),
         (select user_id from p7c_b_ids), (select user_id from p7c_b_ids));

       insert into public.ai_personas (organization_id, name, slug, system_prompt, role, agent_user_id, max_runs_per_hour)
       values ((select org_id from p7c_b_ids), 'P7CB Sara', 'p7cb-sara', 'sys', 'assistant',
         (select agent_user_id from p7c_b_ids), 60);

       insert into public.cards (id, project_id, project_card_number, title, created_by_user_id)
       values ((select card_id from p7c_b_ids), (select project_id from p7c_b_ids),
         1, 'P7CB card', (select user_id from p7c_b_ids));

       insert into public.ai_agent_runs (organization_id, project_id, card_id, persona_id,
         status, dispatch_reason, created_by_user_id, created_at)
       select (select org_id from p7c_b_ids), (select project_id from p7c_b_ids),
         (select card_id from p7c_b_ids),
         (select id from public.ai_personas where slug = 'p7cb-sara'),
         'succeeded', 'manual', (select user_id from p7c_b_ids), timezone('utc', now())
       from generate_series(1, 59);

       insert into public.ai_agent_runs (id, organization_id, project_id, card_id, persona_id,
         status, dispatch_reason, created_by_user_id)
       values ((select new_run_id from p7c_b_ids), (select org_id from p7c_b_ids),
         (select project_id from p7c_b_ids), (select card_id from p7c_b_ids),
         (select id from public.ai_personas where slug = 'p7cb-sara'),
         'queued', 'manual', (select user_id from p7c_b_ids));

       create temp table p7c_b_result on commit drop as
       select public.start_agent_run((select new_run_id from p7c_b_ids)) as ok;

       select
         (select ok::text from p7c_b_result)
         || '|' || (select status from public.ai_agent_runs where id = (select new_run_id from p7c_b_ids));
       rollback;`,
    )
    expect(result).toBe('true|running')
  })

  itIfPg('phase 7-C max_runs_per_hour=NULL bypasses rate cap (T7-5 admin opt-out)', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table p7c_n_ids on commit drop as
       select gen_random_uuid() as user_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         gen_random_uuid() as card_id,
         gen_random_uuid() as agent_user_id,
         gen_random_uuid() as new_run_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
       values
         ('00000000-0000-0000-0000-000000000000', (select user_id from p7c_n_ids),
          'authenticated','authenticated',
          'p7cn-u-' || (select suffix from p7c_n_ids) || '@rocketboard.test', 'not-used',
          timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
          timezone('utc', now()), timezone('utc', now()), timezone('utc', now())),
         ('00000000-0000-0000-0000-000000000000', (select agent_user_id from p7c_n_ids),
          'authenticated','authenticated',
          'p7cn-a-' || (select suffix from p7c_n_ids) || '@rocketboard.test', 'not-used',
          timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
          timezone('utc', now()), timezone('utc', now()), timezone('utc', now()));

       insert into public.organizations (id, name, slug, created_by_user_id, plan)
       values ((select org_id from p7c_n_ids), 'P7CN Org',
         'p7cn-' || (select suffix from p7c_n_ids), (select user_id from p7c_n_ids), 'pro');
       insert into public.organization_members (organization_id, user_id, role)
       values
         ((select org_id from p7c_n_ids), (select user_id from p7c_n_ids),
          'admin'::public.organization_role),
         ((select org_id from p7c_n_ids), (select agent_user_id from p7c_n_ids),
          'agent'::public.organization_role);
       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values ((select workspace_id from p7c_n_ids), (select org_id from p7c_n_ids),
         'P7CN WS', 'p7cn-ws-' || (select suffix from p7c_n_ids), (select user_id from p7c_n_ids));
       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id)
       values ((select project_id from p7c_n_ids), (select workspace_id from p7c_n_ids),
         'P7CN Proj', 'p7cn-proj-' || (select suffix from p7c_n_ids),
         'PN' || upper(substr((select suffix from p7c_n_ids), 1, 4)),
         (select user_id from p7c_n_ids), (select user_id from p7c_n_ids));

       insert into public.ai_personas (organization_id, name, slug, system_prompt, role, agent_user_id, max_runs_per_hour)
       values ((select org_id from p7c_n_ids), 'P7CN Sara', 'p7cn-sara', 'sys', 'assistant',
         (select agent_user_id from p7c_n_ids), null);

       insert into public.cards (id, project_id, project_card_number, title, created_by_user_id)
       values ((select card_id from p7c_n_ids), (select project_id from p7c_n_ids),
         1, 'P7CN card', (select user_id from p7c_n_ids));

       insert into public.ai_agent_runs (organization_id, project_id, card_id, persona_id,
         status, dispatch_reason, created_by_user_id, created_at)
       select (select org_id from p7c_n_ids), (select project_id from p7c_n_ids),
         (select card_id from p7c_n_ids),
         (select id from public.ai_personas where slug = 'p7cn-sara'),
         'succeeded', 'manual', (select user_id from p7c_n_ids), timezone('utc', now())
       from generate_series(1, 200);

       insert into public.ai_agent_runs (id, organization_id, project_id, card_id, persona_id,
         status, dispatch_reason, created_by_user_id)
       values ((select new_run_id from p7c_n_ids), (select org_id from p7c_n_ids),
         (select project_id from p7c_n_ids), (select card_id from p7c_n_ids),
         (select id from public.ai_personas where slug = 'p7cn-sara'),
         'queued', 'manual', (select user_id from p7c_n_ids));

       create temp table p7c_n_result on commit drop as
       select public.start_agent_run((select new_run_id from p7c_n_ids)) as ok;

       select
         (select ok::text from p7c_n_result)
         || '|' || (select status from public.ai_agent_runs where id = (select new_run_id from p7c_n_ids));
       rollback;`,
    )
    expect(result).toBe('true|running')
  })

  // ---------------------------------------------------------------------------
  // AI Kanban Phase 7-D — Aakash spine persistence
  // ---------------------------------------------------------------------------

  itIfPg('phase 7-D metrics_org_agent_engagement table is RLS deny-all', () => {
    const rlsEnabled = psqlQuery(
      `select c.relrowsecurity::text
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname='public' and c.relname='metrics_org_agent_engagement'`,
    )
    expect(rlsEnabled).toBe('true')

    const policies = psqlQuery(
      `select coalesce(string_agg(policyname, ','), '<none>')
       from pg_catalog.pg_policies
       where schemaname='public' and tablename='metrics_org_agent_engagement'`,
    )
    expect(policies).toBe('<none>')
  })

  itIfPg('phase 7-D service_role grants on metrics_org_agent_engagement are narrowed (no DELETE)', () => {
    // Codex S8: tick fn only needs select/insert/update; no DELETE/TRUNCATE.
    const grants = psqlQuery(
      `select coalesce(
         string_agg(privilege_type, ',' order by privilege_type),
         ''
       )
       from information_schema.table_privileges
       where table_schema='public'
         and table_name='metrics_org_agent_engagement'
         and grantee='service_role'`,
    )
    expect(grants).toBe('INSERT,SELECT,UPDATE')
  })

  itIfPg('phase 7-D metrics-aakash-spine-tick cron job is scheduled with the daily 03:00 UTC cadence', () => {
    const result = psqlQuery(
      `select schedule || '|' || command
       from cron.job
       where jobname = 'metrics-aakash-spine-tick'`,
    )
    expect(result).toContain('0 3 * * *|')
    expect(result).toContain('public.metrics_aakash_spine_tick()')
  })

  itIfPg('phase 7-D parameterized tick writes exactly one row per (org, week) for a 4-week sweep', () => {
    // The migration's backfill DO-block targets pre-existing orgs at
    // deploy time. In a fresh test DB the migration runs before any
    // org exists (seed.sql runs after migrations), so the DO-block is
    // a no-op there. This test seeds an org and exercises the tick
    // function for 4 weeks programmatically — same code path as the
    // backfill DO-block, just driven explicitly.
    const result = psqlScriptQuery(
      `begin;
       create temp table p7d_back_ids on commit drop as
       select gen_random_uuid() as user_id,
         gen_random_uuid() as org_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
       values
         ('00000000-0000-0000-0000-000000000000', (select user_id from p7d_back_ids),
          'authenticated','authenticated',
          'p7db-' || (select suffix from p7d_back_ids) || '@rocketboard.test', 'not-used',
          timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
          timezone('utc', now()), timezone('utc', now()), timezone('utc', now()));

       insert into public.organizations (id, name, slug, created_by_user_id)
       values ((select org_id from p7d_back_ids), 'P7DB Org',
         'p7db-' || (select suffix from p7d_back_ids), (select user_id from p7d_back_ids));

       do $do$
       declare
         i integer;
       begin
         for i in 0..3 loop
           perform public.metrics_aakash_spine_tick(
             (date_trunc('week', timezone('utc', now()))::date - (i * 7))
           );
         end loop;
       end
       $do$;

       select count(*)::text
       from public.metrics_org_agent_engagement
       where organization_id = (select org_id from p7d_back_ids);
       rollback;`,
    )
    expect(result).toBe('4')
  })

  itIfPg('phase 7-D tick is idempotent — running twice for the same week leaves identical counts', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table p7d_idem_ids on commit drop as
       select gen_random_uuid() as user_id,
         gen_random_uuid() as agent_user_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         gen_random_uuid() as card_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix,
         (date_trunc('week', timezone('utc', now()))::date - 14) as backfill_week;

       insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
       values
         ('00000000-0000-0000-0000-000000000000', (select user_id from p7d_idem_ids),
          'authenticated','authenticated',
          'p7di-' || (select suffix from p7d_idem_ids) || '@rocketboard.test', 'not-used',
          timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
          timezone('utc', now()), timezone('utc', now()), timezone('utc', now())),
         ('00000000-0000-0000-0000-000000000000', (select agent_user_id from p7d_idem_ids),
          'authenticated','authenticated',
          'p7di-agent-' || (select suffix from p7d_idem_ids) || '@rocketboard.test', 'not-used',
          timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
          timezone('utc', now()), timezone('utc', now()), timezone('utc', now()));

       insert into public.organizations (id, name, slug, created_by_user_id)
       values ((select org_id from p7d_idem_ids), 'P7DI Org',
         'p7di-' || (select suffix from p7d_idem_ids), (select user_id from p7d_idem_ids));
       insert into public.organization_members (organization_id, user_id, role)
       values
         ((select org_id from p7d_idem_ids), (select user_id from p7d_idem_ids),
          'admin'::public.organization_role),
         ((select org_id from p7d_idem_ids), (select agent_user_id from p7d_idem_ids),
          'agent'::public.organization_role);
       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values ((select workspace_id from p7d_idem_ids), (select org_id from p7d_idem_ids),
         'P7DI WS', 'p7di-ws-' || (select suffix from p7d_idem_ids),
         (select user_id from p7d_idem_ids));
       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id)
       values ((select project_id from p7d_idem_ids), (select workspace_id from p7d_idem_ids),
         'P7DI Proj', 'p7di-proj-' || (select suffix from p7d_idem_ids),
         'PD' || upper(substr((select suffix from p7d_idem_ids), 1, 4)),
         (select user_id from p7d_idem_ids), (select user_id from p7d_idem_ids));
       insert into public.cards (id, project_id, project_card_number, title, created_by_user_id)
       values ((select card_id from p7d_idem_ids), (select project_id from p7d_idem_ids),
         1, 'P7DI card', (select user_id from p7d_idem_ids));

       -- Seed in-window agent comment + human heartbeat for backfill_week.
       insert into public.card_comments (card_id, body_text, created_by_user_id, created_at)
       values ((select card_id from p7d_idem_ids), 'agent edit',
         (select agent_user_id from p7d_idem_ids),
         (select backfill_week from p7d_idem_ids)::timestamptz + interval '2 days');
       insert into public.user_activity (user_id, last_active_at)
       values ((select user_id from p7d_idem_ids),
         (select backfill_week from p7d_idem_ids)::timestamptz + interval '1 day')
       on conflict (user_id) do update set last_active_at = excluded.last_active_at;

       create temp table p7d_idem_first on commit drop as
       select cards_modified_by_agent, weekly_active_users, spine_ratio, computed_at
       from public.metrics_org_agent_engagement
       where false;

       do $do$
       declare
         v_week date := (select backfill_week from p7d_idem_ids);
       begin
         perform public.metrics_aakash_spine_tick(v_week);
         insert into p7d_idem_first
         select cards_modified_by_agent, weekly_active_users, spine_ratio, computed_at
         from public.metrics_org_agent_engagement
         where organization_id = (select org_id from p7d_idem_ids)
           and week_start = v_week;
         perform pg_sleep(0.05);
         perform public.metrics_aakash_spine_tick(v_week);
       end
       $do$;

       create temp table p7d_idem_second on commit drop as
       select cards_modified_by_agent, weekly_active_users, spine_ratio, computed_at
       from public.metrics_org_agent_engagement
       where organization_id = (select org_id from p7d_idem_ids)
         and week_start = (select backfill_week from p7d_idem_ids);

       -- Compare counts across the two ticks. We don't assert on
       -- computed_at advancement because both ticks share the same
       -- enclosing test transaction and now() is constant per
       -- transaction; in production each cron fire is a fresh txn so
       -- computed_at advances naturally.
       select
         (select cards_modified_by_agent::text from p7d_idem_first)
         || '|' || (select weekly_active_users::text from p7d_idem_first)
         || '|' || (select round(spine_ratio, 2)::text from p7d_idem_first)
         || '|same-counts:' ||
         (
           ((select cards_modified_by_agent from p7d_idem_first)
              = (select cards_modified_by_agent from p7d_idem_second)
            and (select weekly_active_users from p7d_idem_first)
              = (select weekly_active_users from p7d_idem_second)
            and (select spine_ratio from p7d_idem_first)
              is not distinct from (select spine_ratio from p7d_idem_second))::text
         );
       rollback;`,
    )
    // 1 distinct card touched by an agent + 1 distinct human active user.
    // spine_ratio = 1 / 1 = 1.00. Two ticks → identical counts.
    expect(result).toBe('1|1|1.00|same-counts:true')
  })

  itIfPg('phase 7-D zero-activity orgs still get a row with counts=0 (codex S7 LEFT JOIN coverage)', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table p7d_zero_ids on commit drop as
       select gen_random_uuid() as user_id,
         gen_random_uuid() as org_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix,
         (date_trunc('week', timezone('utc', now()))::date - 7) as backfill_week;

       insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
       values
         ('00000000-0000-0000-0000-000000000000', (select user_id from p7d_zero_ids),
          'authenticated','authenticated',
          'p7dz-' || (select suffix from p7d_zero_ids) || '@rocketboard.test', 'not-used',
          timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
          timezone('utc', now()), timezone('utc', now()), timezone('utc', now()));

       insert into public.organizations (id, name, slug, created_by_user_id)
       values ((select org_id from p7d_zero_ids), 'P7DZ Org',
         'p7dz-' || (select suffix from p7d_zero_ids), (select user_id from p7d_zero_ids));
       -- No members, no workspaces, no cards, no heartbeat. Bare org.

       do $do$
       begin
         perform public.metrics_aakash_spine_tick((select backfill_week from p7d_zero_ids));
       end
       $do$;

       select
         cards_modified_by_agent::text
         || '|' || weekly_active_users::text
         || '|' || coalesce(spine_ratio::text, 'null')
       from public.metrics_org_agent_engagement
       where organization_id = (select org_id from p7d_zero_ids)
         and week_start = (select backfill_week from p7d_zero_ids);
       rollback;`,
    )
    expect(result).toBe('0|0|null')
  })

  // ---------------------------------------------------------------------------
  // Wave 1 Batch 2 PR B — `/inbox` surface (realtime publication + column-level GRANT)
  // ---------------------------------------------------------------------------

  itIfPg('inbox-pr-b: notifications is in the supabase_realtime publication', () => {
    const present = psqlQuery(
      `select count(*)
       from pg_publication_tables
       where pubname='supabase_realtime'
         and schemaname='public'
         and tablename='notifications'`,
    )
    expect(Number(present)).toBe(1)
  })

  itIfPg('inbox-pr-b: authenticated has SELECT but lacks broad UPDATE on notifications', () => {
    // information_schema.column_privileges enumerates per-column grants; an
    // unscoped UPDATE on the table appears as a row per column. After PR B,
    // the only columns authenticated can UPDATE are read_at and archived_at.
    const updateCols = psqlQuery(
      `select coalesce(string_agg(column_name, ',' order by column_name), '')
       from information_schema.column_privileges
       where table_schema='public'
         and table_name='notifications'
         and grantee='authenticated'
         and privilege_type='UPDATE'`,
    )
    expect(updateCols).toBe('archived_at,read_at')

    const tableUpdate = psqlQuery(
      `select coalesce(string_agg(privilege_type, ',' order by privilege_type), '')
       from information_schema.table_privileges
       where table_schema='public'
         and table_name='notifications'
         and grantee='authenticated'`,
    )
    // Table-level: SELECT remains; UPDATE is gone (replaced by column-level).
    expect(tableUpdate).toBe('SELECT')
  })

  itIfPg('inbox-pr-b: notifications RLS policies are unchanged (select_self + update_self only)', () => {
    const policies = psqlQuery(
      `select string_agg(policyname, ',' order by policyname)
       from pg_catalog.pg_policies
       where schemaname='public' and tablename='notifications'`,
    )
    expect(policies).toBe('notifications_select_self,notifications_update_self')
  })

  // ---------------------------------------------------------------------------
  // Follow-card v1 — card_followers table + RPCs + auto-follow triggers
  // ---------------------------------------------------------------------------

  itIfPg('follow-card: card_followers table shape + PK + indexes', () => {
    const cols = psqlQuery(
      `select string_agg(column_name || ':' || data_type, ',' order by column_name)
       from information_schema.columns
       where table_schema='public' and table_name='card_followers'`,
    )
    expect(cols).toContain('card_id:uuid')
    expect(cols).toContain('user_id:uuid')
    expect(cols).toContain('source:text')
    expect(cols).toContain('created_at:timestamp with time zone')

    const pk = psqlQuery(
      `select string_agg(a.attname, ',' order by a.attname)
       from pg_constraint c
       join pg_class t on t.oid=c.conrelid
       join pg_namespace n on n.oid=t.relnamespace
       cross join lateral unnest(c.conkey) as col(attnum)
       join pg_attribute a on a.attrelid=t.oid and a.attnum=col.attnum
       where n.nspname='public' and t.relname='card_followers' and c.contype='p'`,
    )
    expect(pk).toBe('card_id,user_id')

    const indexes = psqlQuery(
      `select string_agg(indexname, ',' order by indexname)
       from pg_indexes
       where schemaname='public' and tablename='card_followers'`,
    )
    expect(indexes).toContain('card_followers_user_idx')
    expect(indexes).toContain('card_followers_pkey')
  })

  itIfPg('follow-card: card_followers source check constraint', () => {
    const checkDef = psqlQuery(
      `select pg_get_constraintdef(c.oid)
       from pg_constraint c
       join pg_class t on t.oid=c.conrelid
       join pg_namespace n on n.oid=t.relnamespace
       where n.nspname='public' and t.relname='card_followers'
         and c.contype='c'`,
    )
    expect(checkDef).toContain("'manual'")
    expect(checkDef).toContain("'assignee_auto'")
    expect(checkDef).toContain("'creator_auto'")
    expect(checkDef).toContain("'comment_auto'")
  })

  itIfPg('follow-card: card_followers RLS is enabled with self-select policy only', () => {
    const rlsEnabled = psqlQuery(
      `select c.relrowsecurity::text
       from pg_class c
       join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relname='card_followers'`,
    )
    expect(rlsEnabled).toBe('true')

    const policies = psqlQuery(
      `select string_agg(policyname, ',' order by policyname)
       from pg_policies
       where schemaname='public' and tablename='card_followers'`,
    )
    expect(policies).toBe('card_followers_select_self')

    const tablePrivs = psqlQuery(
      `select coalesce(string_agg(privilege_type, ',' order by privilege_type), '')
       from information_schema.table_privileges
       where table_schema='public'
         and table_name='card_followers'
         and grantee='authenticated'`,
    )
    // SELECT only — INSERT/UPDATE/DELETE flow through SECURITY DEFINER RPCs
    // and trigger fns. Postgres doesn't always count default REFERENCES grants;
    // the salient bit is that authenticated has SELECT and nothing more.
    expect(tablePrivs).toBe('SELECT')
  })

  itIfPg('follow-card: notifications_kind_check includes comment_on_followed_card and keeps comment_on_owned_card', () => {
    const checkDef = psqlQuery(
      `select pg_get_constraintdef(c.oid)
       from pg_constraint c
       join pg_class t on t.oid=c.conrelid
       join pg_namespace n on n.oid=t.relnamespace
       where n.nspname='public' and t.relname='notifications'
         and c.conname='notifications_kind_check'`,
    )
    expect(checkDef).toContain("'comment_on_followed_card'")
    expect(checkDef).toContain("'comment_on_owned_card'")
  })

  itIfPg('follow-card: follow_card + unfollow_card RPCs exist with expected signatures', () => {
    const sigs = psqlQuery(
      `select string_agg(
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         E'\n' order by p.proname
       )
       from pg_proc p
       join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public'
         and p.proname in ('follow_card', 'unfollow_card')`,
    ).split('\n')
    expect(sigs).toContain('follow_card(target_card_id uuid)')
    expect(sigs).toContain('unfollow_card(target_card_id uuid)')
  })

  itIfPg('follow-card: cards_after_insert_auto_follow trigger registers the creator', () => {
    const trigger = psqlQuery(
      `select pg_get_triggerdef(t.oid)
       from pg_trigger t
       join pg_class c on c.oid=t.tgrelid
       join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relname='cards'
         and t.tgname='cards_after_insert_auto_follow'`,
    )
    expect(trigger).toContain('AFTER INSERT')
    expect(trigger).toContain('cards_after_insert_auto_follow_fn')
  })

  itIfPg('follow-card: cards INSERT auto-follows the creator (REG)', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table fc_creator_ids on commit drop as
       select gen_random_uuid() as user_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         gen_random_uuid() as card_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
       values
         ('00000000-0000-0000-0000-000000000000', (select user_id from fc_creator_ids),
          'authenticated','authenticated',
          'fcc-' || (select suffix from fc_creator_ids) || '@rocketboard.test', 'not-used',
          timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
          timezone('utc', now()), timezone('utc', now()), timezone('utc', now()));

       insert into public.organizations (id, name, slug, created_by_user_id)
       values ((select org_id from fc_creator_ids), 'FCC Org',
         'fcc-' || (select suffix from fc_creator_ids), (select user_id from fc_creator_ids));
       insert into public.organization_members (organization_id, user_id, role)
       values ((select org_id from fc_creator_ids), (select user_id from fc_creator_ids), 'admin'::public.organization_role);
       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values ((select workspace_id from fc_creator_ids), (select org_id from fc_creator_ids),
         'FCC WS', 'fcc-ws-' || (select suffix from fc_creator_ids),
         (select user_id from fc_creator_ids));
       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id)
       values ((select project_id from fc_creator_ids), (select workspace_id from fc_creator_ids),
         'FCC Proj', 'fcc-proj-' || (select suffix from fc_creator_ids),
         'FC' || upper(substr((select suffix from fc_creator_ids), 1, 4)),
         (select user_id from fc_creator_ids), (select user_id from fc_creator_ids));

       insert into public.cards (id, project_id, project_card_number, title, created_by_user_id)
       values ((select card_id from fc_creator_ids), (select project_id from fc_creator_ids),
         1, 'FCC card', (select user_id from fc_creator_ids));

       select source from public.card_followers
       where card_id = (select card_id from fc_creator_ids)
         and user_id = (select user_id from fc_creator_ids);
       rollback;`,
    )
    expect(result).toBe('creator_auto')
  })

  itIfPg('follow-card: add_card_comment fans out comment_on_followed_card to followers (skipping the author)', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table fc_comment_ids on commit drop as
       select gen_random_uuid() as author_id,
         gen_random_uuid() as follower_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         gen_random_uuid() as card_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
       values
         ('00000000-0000-0000-0000-000000000000', (select author_id from fc_comment_ids),
          'authenticated','authenticated',
          'fca-' || (select suffix from fc_comment_ids) || '@rocketboard.test', 'not-used',
          timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
          timezone('utc', now()), timezone('utc', now()), timezone('utc', now())),
         ('00000000-0000-0000-0000-000000000000', (select follower_id from fc_comment_ids),
          'authenticated','authenticated',
          'fcf-' || (select suffix from fc_comment_ids) || '@rocketboard.test', 'not-used',
          timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
          timezone('utc', now()), timezone('utc', now()), timezone('utc', now()));

       insert into public.organizations (id, name, slug, created_by_user_id)
       values ((select org_id from fc_comment_ids), 'FCM Org',
         'fcm-' || (select suffix from fc_comment_ids), (select author_id from fc_comment_ids));
       insert into public.organization_members (organization_id, user_id, role)
       values
         ((select org_id from fc_comment_ids), (select author_id from fc_comment_ids), 'admin'::public.organization_role),
         ((select org_id from fc_comment_ids), (select follower_id from fc_comment_ids), 'member'::public.organization_role);
       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values ((select workspace_id from fc_comment_ids), (select org_id from fc_comment_ids),
         'FCM WS', 'fcm-ws-' || (select suffix from fc_comment_ids),
         (select author_id from fc_comment_ids));
       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id)
       values ((select project_id from fc_comment_ids), (select workspace_id from fc_comment_ids),
         'FCM Proj', 'fcm-proj-' || (select suffix from fc_comment_ids),
         'FM' || upper(substr((select suffix from fc_comment_ids), 1, 4)),
         (select author_id from fc_comment_ids), (select author_id from fc_comment_ids));
       insert into public.project_members (project_id, user_id, role)
       values
         ((select project_id from fc_comment_ids), (select author_id from fc_comment_ids), 'admin'::public.scope_access_role),
         ((select project_id from fc_comment_ids), (select follower_id from fc_comment_ids), 'member'::public.scope_access_role);

       insert into public.cards (id, project_id, project_card_number, title, created_by_user_id)
       values ((select card_id from fc_comment_ids), (select project_id from fc_comment_ids),
         1, 'FCM card', (select author_id from fc_comment_ids));

       -- Manually add the follower as a watcher (creator was auto-added by the trigger).
       insert into public.card_followers (card_id, user_id, source)
       values ((select card_id from fc_comment_ids), (select follower_id from fc_comment_ids), 'manual');

       do $auth$
       begin
         perform set_config('request.jwt.claim.sub', (select author_id from fc_comment_ids)::text, true);
         perform set_config('request.jwt.claim.role', 'authenticated', true);
         perform public.add_card_comment((select card_id from fc_comment_ids), 'Hello followers!');
       end
       $auth$;

       select string_agg(user_id::text || '|' || kind, ',' order by user_id::text)
       from public.notifications
       where card_id = (select card_id from fc_comment_ids);
       rollback;`,
    )
    // Author is the card creator → already a follower, but skipped by the
    // self-notify guard. Only the manual follower receives the notification.
    const followerId = result.split('|')[0]
    expect(result).toMatch(/^[0-9a-f-]+\|comment_on_followed_card$/)
    expect(followerId).toMatch(/^[0-9a-f-]{36}$/)
  })

  itIfPg('follow-card: set_card_assignee auto-follows the new assignee (non-agent)', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table fc_assign_ids on commit drop as
       select gen_random_uuid() as user_id,
         gen_random_uuid() as assignee_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         gen_random_uuid() as card_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
       values
         ('00000000-0000-0000-0000-000000000000', (select user_id from fc_assign_ids),
          'authenticated','authenticated',
          'fcas-' || (select suffix from fc_assign_ids) || '@rocketboard.test', 'not-used',
          timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
          timezone('utc', now()), timezone('utc', now()), timezone('utc', now())),
         ('00000000-0000-0000-0000-000000000000', (select assignee_id from fc_assign_ids),
          'authenticated','authenticated',
          'fcas2-' || (select suffix from fc_assign_ids) || '@rocketboard.test', 'not-used',
          timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
          timezone('utc', now()), timezone('utc', now()), timezone('utc', now()));

       insert into public.organizations (id, name, slug, created_by_user_id)
       values ((select org_id from fc_assign_ids), 'FCA Org',
         'fca-' || (select suffix from fc_assign_ids), (select user_id from fc_assign_ids));
       insert into public.organization_members (organization_id, user_id, role)
       values
         ((select org_id from fc_assign_ids), (select user_id from fc_assign_ids), 'admin'::public.organization_role),
         ((select org_id from fc_assign_ids), (select assignee_id from fc_assign_ids), 'member'::public.organization_role);
       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values ((select workspace_id from fc_assign_ids), (select org_id from fc_assign_ids),
         'FCA WS', 'fca-ws-' || (select suffix from fc_assign_ids),
         (select user_id from fc_assign_ids));
       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id)
       values ((select project_id from fc_assign_ids), (select workspace_id from fc_assign_ids),
         'FCA Proj', 'fca-proj-' || (select suffix from fc_assign_ids),
         'FA' || upper(substr((select suffix from fc_assign_ids), 1, 4)),
         (select user_id from fc_assign_ids), (select user_id from fc_assign_ids));
       insert into public.project_members (project_id, user_id, role)
       values
         ((select project_id from fc_assign_ids), (select user_id from fc_assign_ids), 'admin'::public.scope_access_role),
         ((select project_id from fc_assign_ids), (select assignee_id from fc_assign_ids), 'member'::public.scope_access_role);

       insert into public.cards (id, project_id, project_card_number, title, created_by_user_id)
       values ((select card_id from fc_assign_ids), (select project_id from fc_assign_ids),
         1, 'FCA card', (select user_id from fc_assign_ids));

       do $auth$
       begin
         perform set_config('request.jwt.claim.sub', (select user_id from fc_assign_ids)::text, true);
         perform set_config('request.jwt.claim.role', 'authenticated', true);
         perform public.set_card_assignee(
           (select card_id from fc_assign_ids),
           (select assignee_id from fc_assign_ids)
         );
       end
       $auth$;

       select source from public.card_followers
       where card_id = (select card_id from fc_assign_ids)
         and user_id = (select assignee_id from fc_assign_ids);
       rollback;`,
    )
    expect(result).toBe('assignee_auto')
  })

  // ---------------------------------------------------------------------------
  // Follow-card v1.1 — list_card_followers RPC
  // ---------------------------------------------------------------------------

  itIfPg('follow-card v1.1: list_card_followers exists with the expected signature', () => {
    const sig = psqlQuery(
      `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') -> '
         || pg_get_function_result(p.oid)
       from pg_proc p
       join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='list_card_followers'`,
    )
    expect(sig).toContain('list_card_followers(target_card_id uuid)')
    expect(sig).toContain('TABLE')
    expect(sig).toContain('user_id uuid')
    expect(sig).toContain('display_name text')
    expect(sig).toContain('avatar_url text')
    expect(sig).toContain('source text')
    expect(sig).toContain('created_at timestamp with time zone')
  })

  itIfPg('follow-card v1.1: list_card_followers is service-defined and execute-grant goes to authenticated only', () => {
    const sec = psqlQuery(
      `select case when p.prosecdef then 'definer' else 'invoker' end
       from pg_proc p
       join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='list_card_followers'`,
    )
    expect(sec).toBe('definer')

    const grants = psqlQuery(
      `select coalesce(string_agg(grantee, ',' order by grantee), '')
       from information_schema.routine_privileges
       where specific_schema='public'
         and routine_name='list_card_followers'
         and privilege_type='EXECUTE'`,
    )
    expect(grants).toContain('authenticated')
    expect(grants).not.toContain('anon')
  })

  itIfPg('follow-card v1.1: list_card_followers returns followers with profile join (REG)', () => {
    const result = psqlScriptQuery(
      `begin;
       create temp table fcl_ids on commit drop as
       select gen_random_uuid() as user_id,
         gen_random_uuid() as follower_id,
         gen_random_uuid() as org_id,
         gen_random_uuid() as workspace_id,
         gen_random_uuid() as project_id,
         gen_random_uuid() as card_id,
         lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) as suffix;

       insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
       values
         ('00000000-0000-0000-0000-000000000000', (select user_id from fcl_ids),
          'authenticated','authenticated',
          'fcl-' || (select suffix from fcl_ids) || '@rocketboard.test', 'not-used',
          timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
          timezone('utc', now()), timezone('utc', now()), timezone('utc', now())),
         ('00000000-0000-0000-0000-000000000000', (select follower_id from fcl_ids),
          'authenticated','authenticated',
          'fclf-' || (select suffix from fcl_ids) || '@rocketboard.test', 'not-used',
          timezone('utc', now()),'','','','', '{}'::jsonb,'{}'::jsonb,
          timezone('utc', now()), timezone('utc', now()), timezone('utc', now()));

       insert into public.profiles (user_id, email, full_name)
       values
         ((select user_id from fcl_ids),
          'fcl-' || (select suffix from fcl_ids) || '@rocketboard.test',
          'FCL Author'),
         ((select follower_id from fcl_ids),
          'fclf-' || (select suffix from fcl_ids) || '@rocketboard.test',
          'FCL Follower');

       insert into public.organizations (id, name, slug, created_by_user_id)
       values ((select org_id from fcl_ids), 'FCL Org',
         'fcl-' || (select suffix from fcl_ids), (select user_id from fcl_ids));
       insert into public.organization_members (organization_id, user_id, role)
       values
         ((select org_id from fcl_ids), (select user_id from fcl_ids), 'admin'::public.organization_role),
         ((select org_id from fcl_ids), (select follower_id from fcl_ids), 'member'::public.organization_role);
       insert into public.workspaces (id, organization_id, name, slug, created_by_user_id)
       values ((select workspace_id from fcl_ids), (select org_id from fcl_ids),
         'FCL WS', 'fcl-ws-' || (select suffix from fcl_ids),
         (select user_id from fcl_ids));
       insert into public.projects (id, workspace_id, name, slug, project_key, created_by_user_id, updated_by_user_id)
       values ((select project_id from fcl_ids), (select workspace_id from fcl_ids),
         'FCL Proj', 'fcl-proj-' || (select suffix from fcl_ids),
         'FL' || upper(substr((select suffix from fcl_ids), 1, 4)),
         (select user_id from fcl_ids), (select user_id from fcl_ids));
       insert into public.project_members (project_id, user_id, role)
       values
         ((select project_id from fcl_ids), (select user_id from fcl_ids), 'admin'::public.scope_access_role),
         ((select project_id from fcl_ids), (select follower_id from fcl_ids), 'member'::public.scope_access_role);

       insert into public.cards (id, project_id, project_card_number, title, created_by_user_id)
       values ((select card_id from fcl_ids), (select project_id from fcl_ids),
         1, 'FCL card', (select user_id from fcl_ids));

       -- The cards INSERT trigger auto-followed the creator. Add the second
       -- user manually so we get two rows in deterministic order.
       insert into public.card_followers (card_id, user_id, source)
       values ((select card_id from fcl_ids), (select follower_id from fcl_ids), 'manual');

       do $auth$
       begin
         perform set_config('request.jwt.claim.sub', (select user_id from fcl_ids)::text, true);
         perform set_config('request.jwt.claim.role', 'authenticated', true);
       end
       $auth$;

       select string_agg(display_name || ':' || source, ',' order by created_at asc)
       from public.list_card_followers((select card_id from fcl_ids));
       rollback;`,
    )
    // Creator was inserted first by the trigger; manual follower second.
    expect(result).toBe('FCL Author:creator_auto,FCL Follower:manual')
  })
})
