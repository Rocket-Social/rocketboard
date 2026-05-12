// Drift Watcher edge function.
//
// Hourly background scan that nudges card owners when their cards drift
// out of quality (stale, overdue, missing assignee, missing due date).
//
// Invocation: hourly via pg_cron (added in a follow-up migration). The
// cron job authenticates with the project's service_role JWT in the
// Authorization header, which we verify against SUPABASE_SERVICE_ROLE_KEY
// inside the function — verify_jwt is left off because Supabase's stock
// JWT verifier accepts anon and authenticated roles too, and this surface
// must be locked to service_role only.
//
// Scope: each tick processes only orgs with `drift_watcher_enabled=true`.
// All Postgres-side work routes through SECURITY DEFINER RPCs added in
// 20260504100000_drift_watcher_rpcs.sql; this function is purely an
// orchestrator (auth, loop, lifecycle write, summary response).

import {
  createServiceClient,
  errorResponse,
  errorResponseForException,
  handleCors,
  jsonResponse,
} from '../_shared/supabase.ts'
import {withMonitoring} from '../_shared/monitoring.ts'
import {verifyServiceRoleAuth} from '../_shared/service-role-auth.ts'
import {UUID_RE} from './auth.shared.ts'

const FUNCTION_NAME = 'drift-watcher'

// 24h dedup matches Plan §9.6: "once-per-day 'Your tasks need attention'
// notification". The insert_notification helper defaults to 1h; the
// dispatcher RPC overrides it via its dedup_hours argument.
const DRIFT_DEDUP_HOURS = 24

type SupabaseServiceClient = ReturnType<typeof createServiceClient>

type RunSummary = {
  organizationId: string
  status: 'succeeded' | 'failed'
  notifications: number
  error: string | null
}

Deno.serve(withMonitoring(FUNCTION_NAME, async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  const authResult = verifyServiceRoleAuth(req)
  if (!authResult.ok) {
    return errorResponse('Forbidden', 403)
  }

  try {
    const supabase = createServiceClient()
    const targetOrgId = new URL(req.url).searchParams.get('organization_id')

    if (targetOrgId !== null && !UUID_RE.test(targetOrgId)) {
      return errorResponse('organization_id must be a UUID', 400)
    }

    const orgIds = targetOrgId
      ? await loadOrganizationIfEnabled(supabase, targetOrgId)
      : await loadEnabledOrganizationIds(supabase)

    const runs: RunSummary[] = []
    for (const organizationId of orgIds) {
      runs.push(await runOrganization(supabase, organizationId))
    }

    return jsonResponse({
      ok: true,
      orgs: runs.length,
      notifications: runs.reduce((sum, run) => sum + run.notifications, 0),
      failures: runs.filter((run) => run.status === 'failed').length,
      runs,
    })
  } catch (err) {
    return errorResponseForException(err, 'drift-watcher failed', FUNCTION_NAME)
  }
}))

// Manual-trigger path. We refuse orgs that have not opted in even when
// the caller has the service role JWT — flipping `drift_watcher_enabled`
// is the only place an org consents to drift nudges, and a forgotten
// `?organization_id=` curl should not be able to bypass that switch.
async function loadOrganizationIfEnabled(
  supabase: SupabaseServiceClient,
  organizationId: string,
): Promise<string[]> {
  const {data, error} = await supabase
    .from('organizations')
    .select('id')
    .eq('id', organizationId)
    .eq('drift_watcher_enabled', true)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load organization: ${error.message}`)
  }

  return data ? [data.id as string] : []
}

async function loadEnabledOrganizationIds(
  supabase: SupabaseServiceClient,
): Promise<string[]> {
  const {data, error} = await supabase
    .from('organizations')
    .select('id')
    .eq('drift_watcher_enabled', true)

  if (error) {
    throw new Error(`Failed to load enabled organizations: ${error.message}`)
  }

  return (data ?? []).map((row) => row.id as string)
}

async function runOrganization(
  supabase: SupabaseServiceClient,
  organizationId: string,
): Promise<RunSummary> {
  const startedAt = new Date().toISOString()
  let personaId: string | null = null
  let notifications = 0
  let runStatus: 'succeeded' | 'failed' = 'succeeded'
  let errorText: string | null = null

  try {
    const {data: personaData, error: personaError} = await supabase.rpc(
      'get_or_create_drift_watcher_persona',
      {target_org_id: organizationId},
    )
    if (personaError) {
      throw new Error(personaError.message)
    }
    personaId = (personaData as string | null) ?? null

    const {data: dispatchedCount, error: dispatchError} = await supabase.rpc(
      'dispatch_drift_watcher_notifications',
      {target_org_id: organizationId, dedup_hours: DRIFT_DEDUP_HOURS},
    )
    if (dispatchError) {
      throw new Error(dispatchError.message)
    }
    notifications = Number(dispatchedCount ?? 0)
  } catch (err) {
    runStatus = 'failed'
    errorText = err instanceof Error ? err.message : String(err)
  }

  if (personaId) {
    const {error: recordError} = await supabase.rpc('record_drift_watcher_run', {
      target_org_id: organizationId,
      target_persona_id: personaId,
      target_status: runStatus,
      target_started_at: startedAt,
      target_finished_at: new Date().toISOString(),
      target_error_text: errorText,
    })
    if (recordError) {
      // The run finished — losing the audit row is not worth failing the
      // tick over. Log to monitoring via the rethrow path instead so the
      // org's tick still surfaces in the summary as the actual outcome.
      console.error(
        `[${FUNCTION_NAME}] failed to record run for org ${organizationId}: ${recordError.message}`,
      )
    }
  }

  return {
    organizationId,
    status: runStatus,
    notifications,
    error: errorText,
  }
}
