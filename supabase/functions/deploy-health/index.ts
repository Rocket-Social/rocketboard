import {captureEdgeException, withMonitoring} from '../_shared/monitoring.ts'
import {createServiceClient, handleCors, jsonResponse} from '../_shared/supabase.ts'

const FUNCTION_NAME = 'deploy-health'

async function verifySqlHealth() {
  const supabase = createServiceClient()
  const {data, error} = await supabase.rpc('deploy_healthcheck')

  if (error || data !== true) {
    throw error ?? new Error('deploy_healthcheck returned an unexpected result')
  }
}

Deno.serve(withMonitoring(FUNCTION_NAME, async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'GET') {
    return jsonResponse({error: 'Method not allowed'}, 405)
  }

  const url = new URL(req.url)
  const surface = url.searchParams.get('surface')

  if (surface !== 'edge' && surface !== 'sql') {
    return jsonResponse({error: 'surface must be edge or sql'}, 400)
  }

  try {
    if (surface === 'sql') {
      await verifySqlHealth()
    }

    return jsonResponse({
      ok: true,
      surface,
      checkedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error(`[${FUNCTION_NAME}] probe failed for ${surface}:`, err)
    void captureEdgeException(err, {functionName: FUNCTION_NAME})
    return jsonResponse({ok: false, surface, error: 'Unavailable'}, 503)
  }
}))
