import posthog from 'posthog-js'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com'
const GIT_SHA = import.meta.env.VITE_GIT_SHA as string | undefined
const POSTHOG_DEFAULTS = '2026-01-30'

let initialized = false

type Primitive = string | number | boolean | null | undefined
type MonitoringEvent = {
  properties?: Record<string, unknown>
} & Record<string, unknown>

type SensitiveHeader = 'authorization' | 'cookie' | 'set-cookie' | 'x-supabase-auth'

const SENSITIVE_HEADER_NAMES: ReadonlySet<SensitiveHeader> = new Set<SensitiveHeader>([
  'authorization',
  'cookie',
  'set-cookie',
  'x-supabase-auth',
])

const SDK_URL_PROPERTY_NAMES = new Set([
  'current_url',
  'pathname',
  'href',
  'referrer',
  'initial_current_url',
  'initial_pathname',
  'initial_referrer',
])

const SDK_HEADER_PROPERTY_NAMES = new Set([
  'headers',
  'request_headers',
])

const AUTH_CALLBACK_TOKEN_PATTERN = /([?#&](?:access_token|refresh_token|code)=)[^&#]*/gi
const INVITE_TOKEN_PATH_PATTERN = /(\/accept-invite\/)([^/?#]+)/gi
const LONG_TOKEN_PATTERN = /[a-zA-Z0-9_-]{32,}/g

function redactString(value: string): string {
  return value
    .replace(AUTH_CALLBACK_TOKEN_PATTERN, '$1[REDACTED]')
    .replace(INVITE_TOKEN_PATH_PATTERN, '$1[REDACTED]')
    .replace(LONG_TOKEN_PATTERN, '[REDACTED]')
}

function sanitizeMonitoringValue(key: string, value: unknown): unknown {
  if (SENSITIVE_HEADER_NAMES.has(key.toLowerCase() as SensitiveHeader)) {
    return '[REDACTED]'
  }
  if (typeof value === 'string') {
    return redactString(value)
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMonitoringValue(key, item))
  }
  if (value && typeof value === 'object') {
    return sanitizeMonitoringProperties(value as Record<string, unknown>)
  }
  return value
}

export function sanitizeMonitoringProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(properties)) {
    redacted[key] = sanitizeMonitoringValue(key, value)
  }
  return redacted
}

function sanitizeSdkEventProperty(key: string, value: unknown): unknown {
  const normalizedKey = key.toLowerCase().replace(/^\$/, '')
  if (SENSITIVE_HEADER_NAMES.has(normalizedKey as SensitiveHeader)) {
    return '[REDACTED]'
  }
  if (SDK_HEADER_PROPERTY_NAMES.has(normalizedKey)) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? sanitizeMonitoringProperties(value as Record<string, unknown>)
      : value
  }
  if (!SDK_URL_PROPERTY_NAMES.has(normalizedKey)) {
    return value
  }
  if (typeof value === 'string') {
    return redactString(value)
  }
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'string' ? redactString(item) : item))
  }
  return value
}

function sanitizeSdkEventProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(properties)) {
    sanitized[key] = sanitizeSdkEventProperty(key, value)
  }
  return sanitized
}

export function initMonitoring(): void {
  if (initialized) return
  if (!POSTHOG_KEY) {
    console.warn('[monitoring] VITE_POSTHOG_KEY not set — skipping init')
    return
  }
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    defaults: POSTHOG_DEFAULTS,
    // Errors-only — do not capture pageviews, clicks, or session recordings.
    capture_pageview: false,
    capture_pageleave: false,
    autocapture: false,
    disable_session_recording: true,
    // Scrub SDK-added browser context without mutating PostHog's own exception fields.
    before_send: (event: unknown) => {
      if (!event || typeof event !== 'object') {
        return event
      }
      const monitoringEvent = event as MonitoringEvent
      if (!monitoringEvent.properties || typeof monitoringEvent.properties !== 'object') {
        return event
      }
      return {
        ...monitoringEvent,
        properties: sanitizeSdkEventProperties(monitoringEvent.properties),
      }
    },
  })
  if (GIT_SHA) {
    posthog.register({$release: GIT_SHA})
  }
  posthog.register({rocketboard_surface: 'frontend'})
  initialized = true
  console.info('[monitoring] initialized', {host: POSTHOG_HOST, release: GIT_SHA ?? '(none)'})
}

export function isMonitoringEnabled(): boolean {
  return initialized
}

export function captureException(error: unknown, context?: Record<string, Primitive | unknown>): void {
  const normalized = error instanceof Error ? error : new Error(String(error))
  if (!initialized) {
    console.error('[monitoring]', normalized, context)
    return
  }
  posthog.captureException(
    normalized,
    context ? sanitizeMonitoringProperties(context as Record<string, unknown>) : undefined,
  )
}

// Phase 6 PR 6-A — explicit product-event capture wrapper. Distinct
// from the SDK's autocaptured pageview/click events (which we keep
// disabled). Properties are passed through `sanitizeMonitoringProperties`
// to scrub any URL/header values the call site forwards in.
//
// Per D6-3 / Phase 6 plan: telemetry MUST NOT block the caller. If the
// SDK is uninitialized (env not set, e.g. local dev), this is a silent
// no-op.
export function captureEvent(event: string, properties?: Record<string, Primitive | unknown>): void {
  if (!initialized) return
  try {
    posthog.capture(
      event,
      properties ? sanitizeMonitoringProperties(properties as Record<string, unknown>) : undefined,
    )
  } catch (err) {
    console.warn('[monitoring] captureEvent failed', {event, error: err instanceof Error ? err.message : String(err)})
  }
}

export function identifyUser(userId: string, traits?: Record<string, Primitive | unknown>): void {
  if (!initialized) return
  posthog.identify(
    userId,
    traits ? sanitizeMonitoringProperties(traits as Record<string, unknown>) : undefined,
  )
}

export function resetIdentity(): void {
  if (!initialized) return
  posthog.reset()
}
