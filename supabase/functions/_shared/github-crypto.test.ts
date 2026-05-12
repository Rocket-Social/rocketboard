import {generateKeyPairSync, webcrypto} from 'node:crypto'

import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'

import {
  createAppJWT,
  createGitHubAppJwt,
  GitHubAppCryptoError,
  getInstallationAccessToken,
  importGitHubAppPrivateKey,
  normalizeGitHubPrivateKeyPem,
} from './github-crypto'

const PKCS1_KEY = generateKeyPairSync('rsa', {
  modulusLength: 1024,
  privateKeyEncoding: {
    format: 'pem',
    type: 'pkcs1',
  },
}).privateKey

const PKCS8_KEY = generateKeyPairSync('rsa', {
  modulusLength: 1024,
  privateKeyEncoding: {
    format: 'pem',
    type: 'pkcs8',
  },
}).privateKey

function toEscapedSecret(pem: string) {
  return pem.replace(/\n/g, '\\n')
}

function decodeJwt(token: string) {
  const [header, payload] = token.split('.')

  return {
    header: JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as Record<string, unknown>,
    payload: JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>,
  }
}

describe('github crypto helpers', () => {
  const originalFetch = globalThis.fetch
  const envSnapshot = {
    GITHUB_APP_ID: process.env.GITHUB_APP_ID,
    GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY,
    TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
  }

  beforeAll(() => {
    vi.stubGlobal('crypto', webcrypto)
  })

  beforeEach(() => {
    process.env.GITHUB_APP_ID = '12345'
    process.env.GITHUB_APP_PRIVATE_KEY = PKCS8_KEY
    process.env.TOKEN_ENCRYPTION_KEY = 'token-encryption-key'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.stubGlobal('crypto', webcrypto)

    if (originalFetch) {
      vi.stubGlobal('fetch', originalFetch)
    } else {
      vi.unstubAllGlobals()
      vi.stubGlobal('crypto', webcrypto)
    }

    process.env.GITHUB_APP_ID = envSnapshot.GITHUB_APP_ID
    process.env.GITHUB_APP_PRIVATE_KEY = envSnapshot.GITHUB_APP_PRIVATE_KEY
    process.env.TOKEN_ENCRYPTION_KEY = envSnapshot.TOKEN_ENCRYPTION_KEY
  })

  it.each([
    ['pkcs8 real newlines', PKCS8_KEY, 'pkcs8'],
    ['pkcs8 escaped newlines', toEscapedSecret(PKCS8_KEY), 'pkcs8'],
    ['pkcs1 real newlines', PKCS1_KEY, 'pkcs1'],
    ['pkcs1 escaped newlines', toEscapedSecret(PKCS1_KEY), 'pkcs1'],
  ] as const)('imports and signs %s', async (_label, privateKey, expectedKind) => {
    const normalized = normalizeGitHubPrivateKeyPem(privateKey)
    expect(normalized.kind).toBe(expectedKind)

    const imported = await importGitHubAppPrivateKey(privateKey)
    expect(imported.type).toBe('private')

    const jwt = await createGitHubAppJwt({
      appId: '12345',
      privateKey,
    })
    const decoded = decodeJwt(jwt)

    expect(decoded.header).toMatchObject({alg: 'RS256', typ: 'JWT'})
    expect(decoded.payload.iss).toBe('12345')
    expect(Number(decoded.payload.exp)).toBeGreaterThan(Number(decoded.payload.iat))
  })

  it('rejects malformed PEM values with a typed key error', async () => {
    await expect(importGitHubAppPrivateKey('-----BEGIN PRIVATE KEY-----not-valid-----END PRIVATE KEY-----'))
      .rejects.toMatchObject({
        code: 'github_app_key_invalid',
      })
  })

  it('accepts headerless base64 PKCS#8 secrets for backwards compatibility', async () => {
    // Pre-compat-fix deployments could store GITHUB_APP_PRIVATE_KEY as the raw
    // base64 body with no BEGIN/END markers. The previous normalizer stripped
    // markers if present and handed whatever was left to WebCrypto as PKCS#8.
    // Preserve that path so working secrets do not regress.
    const headerlessBase64 = PKCS8_KEY
      .replace('-----BEGIN PRIVATE KEY-----', '')
      .replace('-----END PRIVATE KEY-----', '')
      .replace(/\s/g, '')

    const normalized = normalizeGitHubPrivateKeyPem(headerlessBase64)
    expect(normalized.kind).toBe('pkcs8')

    const imported = await importGitHubAppPrivateKey(headerlessBase64)
    expect(imported.type).toBe('private')

    const jwt = await createGitHubAppJwt({
      appId: '12345',
      privateKey: headerlessBase64,
    })
    expect(jwt.split('.')).toHaveLength(3)
  })

  it('accepts headerless base64 even when escaped newlines are present', async () => {
    const headerlessBase64 = PKCS8_KEY
      .replace('-----BEGIN PRIVATE KEY-----', '')
      .replace('-----END PRIVATE KEY-----', '')
      .trim()
      .replace(/\n/g, '\\n')

    const imported = await importGitHubAppPrivateKey(headerlessBase64)
    expect(imported.type).toBe('private')
  })

  it('still rejects half-wrapped PEMs where only one marker is present', async () => {
    // Guard rail: headerless fallback must not accept malformed PEMs. Input
    // that has a BEGIN marker but no END marker is corrupt, not headerless.
    await expect(importGitHubAppPrivateKey('-----BEGIN PRIVATE KEY-----\nQUJD\n'))
      .rejects.toMatchObject({
        code: 'github_app_key_invalid',
      })
  })

  it('creates an app JWT from env-backed configuration', async () => {
    process.env.GITHUB_APP_PRIVATE_KEY = toEscapedSecret(PKCS1_KEY)

    const jwt = await createAppJWT()
    const decoded = decodeJwt(jwt)

    expect(decoded.payload.iss).toBe('12345')
  })

  it('returns an installation token on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      token: 'installation-token',
    }), {
      headers: {'Content-Type': 'application/json'},
      status: 200,
    })))

    await expect(getInstallationAccessToken(42)).resolves.toBe('installation-token')
    expect(globalThis.fetch).toHaveBeenCalledOnce()
  })

  it('returns null on upstream GitHub failures and logs the lookup reason', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', {status: 401})))

    await expect(getInstallationAccessToken(42)).resolves.toBeNull()
    expect(errorSpy).toHaveBeenCalledWith(
      '[github-crypto] github_install_lookup_failed while requesting installation token:',
      401,
    )
  })

  it('returns null and logs a typed reason when JWT signing cannot start', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.GITHUB_APP_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----not-valid-----END PRIVATE KEY-----'
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    await expect(getInstallationAccessToken(42)).resolves.toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(
      '[github-crypto] github_app_key_invalid:',
      expect.any(String),
    )
  })
})
