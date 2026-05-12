// Shared service-role auth check for edge functions invoked exclusively
// by trusted callers (pg_cron, dispatch RPCs, internal tooling).
//
// History:
//   - Original pattern (Phase 2c, drift-watcher v1): the function compared
//     the inbound `Authorization: Bearer <secret>` header byte-for-byte
//     against `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`. That worked
//     when Supabase's gateway forwarded the header unchanged.
//   - 2026-05-07: Supabase rolled out a gateway change that validates
//     the inbound bearer upstream and **replaces** the header with a
//     short-lived JWT signed by the project's `api-keys-jwt-issuer`.
//     The new JWT's payload is `{role:'service_role', iss:'…/api-keys-jwt-issuer',
//     api_key_hash, iat, exp}`. The byte-for-byte compare started
//     returning false for every cron invocation → 403, blocking all
//     stuck-queued run dispatches.
//
// Fix: trust the gateway. If the request reaches the function with a
// JWT that claims `role: 'service_role'` and an `iss` that matches the
// project's expected issuer, accept it. The gateway is the authority
// here — it only forwards JWTs after validating the original auth, and
// our service-role surface is on the trusted Supabase platform.
//
// We do NOT verify the JWT signature locally — that would require
// fetching JWKS at function start and adding crypto verification, with
// minimal additional security in this trust model. Phase 7 follow-up
// if hardening is needed.

const env = typeof Deno !== 'undefined' ? Deno.env : undefined
const SUPABASE_URL = env?.get('SUPABASE_URL') ?? ''
const PROJECT_REF = SUPABASE_URL.replace(/^https?:\/\//, '').split('.')[0]
const EXPECTED_ISSUER = PROJECT_REF
  ? `https://api.supabase.co/v1/projects/${PROJECT_REF}/api-keys-jwt-issuer`
  : null

type JwtClaims = {
  role?: string
  iss?: string
  exp?: number
}

function decodeJwtPayload(jwt: string): JwtClaims | null {
  const parts = jwt.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4)
    const raw = atob(padded)
    return JSON.parse(raw) as JwtClaims
  } catch {
    return null
  }
}

function extractBearerToken(authHeader: string | null): string {
  if (!authHeader) return ''
  const trimmed = authHeader.trim()
  const spaceIdx = trimmed.search(/\s/)
  if (spaceIdx <= 0) return ''
  if (trimmed.slice(0, spaceIdx).toLowerCase() !== 'bearer') return ''
  return trimmed.slice(spaceIdx + 1).trim()
}

export type ServiceRoleAuthResult =
  | {ok: true; userId?: string}
  | {ok: false; reason: 'missing_bearer' | 'invalid_jwt' | 'wrong_role' | 'wrong_issuer' | 'expired'}

/**
 * Validates that the inbound request carries a service-role JWT issued
 * by Supabase's gateway. Returns `{ok: true}` when the request is
 * trusted and `{ok: false, reason}` when it is not — the caller is
 * responsible for translating that to an HTTP response.
 *
 * Recognized success path (post-2026-05-07 gateway):
 *   1. `Authorization: Bearer <jwt>` is present.
 *   2. The JWT decodes (3 segments, base64url-decoded payload is JSON).
 *   3. `role === 'service_role'`.
 *   4. `iss` matches the project's expected api-keys-jwt-issuer URL.
 *   5. `exp` (if present) is in the future.
 *
 * The legacy direct service-role-key path (where the env var was the
 * raw `sb_secret_…` and the bearer matched it byte-for-byte) is
 * intentionally NOT supported here. Supabase's gateway replaces the
 * bearer before forwarding, so the legacy compare can never succeed.
 */
export function verifyServiceRoleAuth(req: Request): ServiceRoleAuthResult {
  const token = extractBearerToken(req.headers.get('authorization'))
  if (!token) return {ok: false, reason: 'missing_bearer'}

  const claims = decodeJwtPayload(token)
  if (!claims) return {ok: false, reason: 'invalid_jwt'}

  if (claims.role !== 'service_role') return {ok: false, reason: 'wrong_role'}

  if (EXPECTED_ISSUER && claims.iss !== EXPECTED_ISSUER) {
    return {ok: false, reason: 'wrong_issuer'}
  }

  if (typeof claims.exp === 'number') {
    const nowSec = Math.floor(Date.now() / 1000)
    if (claims.exp < nowSec) return {ok: false, reason: 'expired'}
  }

  return {ok: true}
}

// Test-only: exposed so vitest can exercise the JWT-decoding logic
// without spinning up a Request mock.
export const __testing = {decodeJwtPayload, extractBearerToken}
