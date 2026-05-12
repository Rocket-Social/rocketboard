// Edge-side PostHog event capture for AI agent telemetry (Phase 6 PR 6-A).
//
// Thin fetch-based sender to PostHog's capture endpoint. PostHog has no
// first-party Deno SDK, but the HTTP API is trivial.
//
// Telemetry MUST NOT block a run (per Phase 6 plan D6-3): every call is
// wrapped so a thrown fetch / non-2xx / missing env never escapes.
//
// Call site: edge worker (`ai-agent-run`). Errors are logged via
// console.warn and swallowed.

export type CapturePostHogEventInput = {
  event: string
  // The dispatching user's user_id. If null/undefined, the helper drops
  // the event (per D6-5; the FK constraint on
  // ai_agent_schedules.created_by_user_id makes this unreachable for
  // live runs, but defense-in-depth so we never emit an anonymous
  // synthetic identity into PostHog).
  distinctId: string | null | undefined
  properties?: Record<string, unknown>
}

type PosthogEdgeConfig = {
  token: string | undefined
  host: string
  gitSha: string | undefined
}

function readPosthogEdgeConfig(): PosthogEdgeConfig {
  const env = typeof Deno !== 'undefined' ? Deno.env : undefined
  return {
    token: env?.get('POSTHOG_PROJECT_TOKEN') ?? env?.get('POSTHOG_API_KEY'),
    host: env?.get('POSTHOG_HOST') ?? 'https://us.i.posthog.com',
    gitSha: env?.get('GIT_SHA'),
  }
}

export async function capturePostHogEvent(input: CapturePostHogEventInput): Promise<void> {
  if (!input.distinctId) {
    console.warn('[posthog] dropping event with null distinct_id', {event: input.event})
    return
  }

  const config = readPosthogEdgeConfig()
  if (!config.token) {
    // PostHog isn't configured for this environment. Silent no-op.
    return
  }

  const properties: Record<string, unknown> = {
    ...(input.properties ?? {}),
    rocketboard_surface: 'edge',
  }
  if (config.gitSha) {
    properties.$release = config.gitSha
  }

  try {
    const response = await fetch(`${config.host}/i/v0/e/`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        api_key: config.token,
        event: input.event,
        distinct_id: input.distinctId,
        properties: {
          ...properties,
          distinct_id: input.distinctId,
        },
      }),
    })
    if (!response.ok) {
      console.warn('[posthog] capture non-2xx', {event: input.event, status: response.status})
    }
  } catch (err) {
    console.warn('[posthog] capture failed', {
      event: input.event,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
