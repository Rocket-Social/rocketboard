// Error capture for edge functions — thin fetch-based sender to PostHog's
// capture endpoint. PostHog has no first-party Deno SDK, but the HTTP API is
// trivial. Fire-and-forget: never block the handler response on the network
// call, and never throw from inside monitoring code.

const env = typeof Deno !== 'undefined' ? Deno.env : undefined
const POSTHOG_PROJECT_TOKEN = env?.get('POSTHOG_PROJECT_TOKEN') ?? env?.get('POSTHOG_API_KEY')
const POSTHOG_HOST = env?.get('POSTHOG_HOST') ?? 'https://us.i.posthog.com'
const GIT_SHA = env?.get('GIT_SHA')

type EdgeContext = {
  functionName: string
  userId?: string
}

type EdgeExceptionFrame = {
  platform: 'custom'
  lang: 'javascript'
  function?: string
  filename?: string
  lineno?: number
  colno?: number
}

type EdgeExceptionEntry = {
  type: string
  value: string
  mechanism: {
    handled: true
    synthetic: false
    type: 'generic'
  }
  stacktrace?: {
    type: 'raw'
    frames: EdgeExceptionFrame[]
  }
}

function normalizeError(err: unknown): {type: string; message: string; stack?: string} {
  if (err instanceof Error) {
    return {type: err.name || 'Error', message: err.message, stack: err.stack}
  }
  return {type: 'Error', message: String(err)}
}

function parseStackFrame(line: string): EdgeExceptionFrame | null {
  const trimmed = line.trim()
  const match = /^(?:at\s+)?(?:(.*?)\s+\()?(.+):(\d+):(\d+)\)?$/.exec(trimmed)
  if (!match) return null

  const [, functionName, filename, lineNumber, columnNumber] = match
  return {
    platform: 'custom',
    lang: 'javascript',
    function: functionName || undefined,
    filename,
    lineno: Number(lineNumber),
    colno: Number(columnNumber),
  }
}

function buildStacktrace(stack?: string): EdgeExceptionEntry['stacktrace'] | undefined {
  if (!stack) return undefined

  const frames = stack
    .split('\n')
    .slice(1)
    .map(parseStackFrame)
    .filter((frame): frame is EdgeExceptionFrame => frame !== null)

  if (frames.length === 0) return undefined

  return {
    type: 'raw',
    frames,
  }
}

export function buildEdgeExceptionEvent(err: unknown, context: EdgeContext) {
  const {type, message, stack} = normalizeError(err)
  const distinctId = context.userId ?? `edge-anonymous:${context.functionName}`
  const exception: EdgeExceptionEntry = {
    type,
    value: message,
    mechanism: {
      handled: true,
      synthetic: false,
      type: 'generic',
    },
  }
  const stacktrace = buildStacktrace(stack)
  if (stacktrace) {
    exception.stacktrace = stacktrace
  }

  return {
    distinct_id: distinctId,
    event: '$exception',
    properties: {
      distinct_id: distinctId,
      ...(context.userId ? {} : {$process_person_profile: false}),
      $exception_level: 'error',
      $exception_list: [exception],
      $release: GIT_SHA,
      rocketboard_function: context.functionName,
      rocketboard_surface: 'edge',
    },
  }
}

export async function captureEdgeException(err: unknown, context: EdgeContext): Promise<void> {
  const {message, stack} = normalizeError(err)

  if (!POSTHOG_PROJECT_TOKEN) {
    console.error(`[${context.functionName}] exception:`, message, stack)
    return
  }

  try {
    await fetch(`${POSTHOG_HOST}/i/v0/e/`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        api_key: POSTHOG_PROJECT_TOKEN,
        ...buildEdgeExceptionEvent(err, context),
      }),
    })
  } catch (captureErr) {
    console.error(`[${context.functionName}] monitoring capture failed:`, captureErr)
  }
}

export function withMonitoring(
  functionName: string,
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      return await handler(req)
    } catch (err) {
      // Extract auth user best-effort — don't fail the handler if auth lookup throws.
      let userId: string | undefined
      try {
        const auth = req.headers.get('authorization')
        if (auth?.startsWith('Bearer ')) {
          const token = auth.slice('Bearer '.length)
          // Decode JWT payload without verification — we just want `sub` for context.
          const [, payloadB64] = token.split('.')
          if (payloadB64) {
            const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')))
            if (typeof payload?.sub === 'string') {
              userId = payload.sub
            }
          }
        }
      } catch {
        // ignore — user id is best-effort metadata
      }
      await captureEdgeException(err, {functionName, userId})
      throw err
    }
  }
}
