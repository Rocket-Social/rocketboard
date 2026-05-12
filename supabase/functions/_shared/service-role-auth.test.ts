import {beforeEach, describe, expect, it, vi} from 'vitest'

import {__testing, verifyServiceRoleAuth} from './service-role-auth.ts'

function base64Url(input: string): string {
  return btoa(input).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function makeJwt(payload: Record<string, unknown>): string {
  // Header + payload + dummy signature. We don't verify signatures.
  const header = base64Url('{"typ":"JWT","alg":"ES256"}')
  const body = base64Url(JSON.stringify(payload))
  return `${header}.${body}.dummy_sig`
}

function makeRequest(authHeader: string | null): Request {
  const headers = new Headers()
  if (authHeader !== null) headers.set('authorization', authHeader)
  return new Request('https://example.com/', {method: 'POST', headers})
}

describe('extractBearerToken (internal)', () => {
  const {extractBearerToken} = __testing

  it('returns the token after "Bearer "', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi')
  })

  it('returns empty string when header missing', () => {
    expect(extractBearerToken(null)).toBe('')
    expect(extractBearerToken('')).toBe('')
  })

  it('handles case-insensitive scheme', () => {
    expect(extractBearerToken('bearer foo')).toBe('foo')
    expect(extractBearerToken('BEARER foo')).toBe('foo')
  })

  it('rejects non-Bearer schemes', () => {
    expect(extractBearerToken('Basic foo')).toBe('')
  })
})

describe('decodeJwtPayload (internal)', () => {
  const {decodeJwtPayload} = __testing

  it('decodes a 3-segment JWT', () => {
    const jwt = makeJwt({role: 'service_role', iss: 'x'})
    expect(decodeJwtPayload(jwt)).toEqual({role: 'service_role', iss: 'x'})
  })

  it('returns null for non-JWT inputs', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull()
    expect(decodeJwtPayload('a.b')).toBeNull()
    expect(decodeJwtPayload('a.b.c.d')).toBeNull()
  })

  it('returns null when payload is not valid JSON', () => {
    const jwt = `header.${base64Url('not json')}.sig`
    expect(decodeJwtPayload(jwt)).toBeNull()
  })

  it('handles base64url-without-padding payloads', () => {
    // JSON with length giving a payload of 6 chars before padding stripping
    const jwt = makeJwt({a: 1})
    expect(decodeJwtPayload(jwt)).toEqual({a: 1})
  })
})

describe('verifyServiceRoleAuth', () => {
  const ORIGINAL_SUPABASE_URL = process.env.SUPABASE_URL

  beforeEach(() => {
    // The module reads SUPABASE_URL once at import time to compute the
    // expected issuer. The tests rely on the default behavior — when
    // SUPABASE_URL is unset, EXPECTED_ISSUER is null and the issuer
    // check is skipped. Restore env after each test for safety.
    process.env.SUPABASE_URL = ORIGINAL_SUPABASE_URL ?? ''
  })

  it('rejects when no Authorization header is present', () => {
    const r = verifyServiceRoleAuth(makeRequest(null))
    expect(r).toEqual({ok: false, reason: 'missing_bearer'})
  })

  it('rejects when bearer is not a JWT', () => {
    const r = verifyServiceRoleAuth(makeRequest('Bearer sb_secret_legacy_string'))
    expect(r).toEqual({ok: false, reason: 'invalid_jwt'})
  })

  it('rejects when the role claim is not service_role', () => {
    const jwt = makeJwt({role: 'authenticated', iss: 'irrelevant'})
    const r = verifyServiceRoleAuth(makeRequest(`Bearer ${jwt}`))
    expect(r).toEqual({ok: false, reason: 'wrong_role'})
  })

  it('rejects when the JWT is expired', () => {
    const past = Math.floor(Date.now() / 1000) - 60
    const jwt = makeJwt({role: 'service_role', exp: past})
    const r = verifyServiceRoleAuth(makeRequest(`Bearer ${jwt}`))
    expect(r).toEqual({ok: false, reason: 'expired'})
  })

  it('accepts a service_role JWT without exp/iss when SUPABASE_URL is unset', () => {
    const jwt = makeJwt({role: 'service_role'})
    const r = verifyServiceRoleAuth(makeRequest(`Bearer ${jwt}`))
    expect(r.ok).toBe(true)
  })

  it('accepts a service_role JWT with future exp', () => {
    const future = Math.floor(Date.now() / 1000) + 600
    const jwt = makeJwt({role: 'service_role', exp: future})
    const r = verifyServiceRoleAuth(makeRequest(`Bearer ${jwt}`))
    expect(r.ok).toBe(true)
  })
})
