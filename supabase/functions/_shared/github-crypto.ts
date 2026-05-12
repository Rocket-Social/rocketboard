// Shared GitHub cryptographic utilities.
// Centralizes JWT creation, token encryption/decryption, and PEM normalization
// that was previously duplicated across github-webhook and github-install.

const GITHUB_APP_ID_ENV = 'GITHUB_APP_ID'
const GITHUB_APP_PRIVATE_KEY_ENV = 'GITHUB_APP_PRIVATE_KEY'
const TOKEN_ENCRYPTION_KEY_ENV = 'TOKEN_ENCRYPTION_KEY'

const RSA_ENCRYPTION_OID = Uint8Array.of(
  0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
)

export type GitHubPrivateKeyKind = 'pkcs1' | 'pkcs8'

export type NormalizedGitHubPrivateKeyPem = {
  der: Uint8Array
  kind: GitHubPrivateKeyKind
}

export type GitHubAppCryptoErrorCode =
  | 'github_app_key_invalid'
  | 'github_app_jwt_sign_failed'

export class GitHubAppCryptoError extends Error {
  code: GitHubAppCryptoErrorCode

  constructor(code: GitHubAppCryptoErrorCode, message: string, options?: {cause?: unknown}) {
    super(message)
    this.code = code
    this.name = 'GitHubAppCryptoError'
    if (options && 'cause' in options) {
      ;(this as Error & {cause?: unknown}).cause = options.cause
    }
  }
}

function getEnv(name: string) {
  if (typeof Deno !== 'undefined' && typeof Deno.env?.get === 'function') {
    return Deno.env.get(name)
  }

  if (typeof process !== 'undefined') {
    return process.env[name]
  }

  return undefined
}

function encodeDerLength(length: number) {
  if (length < 0x80) {
    return Uint8Array.of(length)
  }

  const bytes: number[] = []
  let remaining = length

  while (remaining > 0) {
    bytes.unshift(remaining & 0xff)
    remaining >>= 8
  }

  return Uint8Array.of(0x80 | bytes.length, ...bytes)
}

function concatBytes(...parts: Uint8Array[]) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0)
  const combined = new Uint8Array(totalLength)
  let offset = 0

  for (const part of parts) {
    combined.set(part, offset)
    offset += part.length
  }

  return combined
}

function encodeDerValue(tag: number, value: Uint8Array) {
  return concatBytes(Uint8Array.of(tag), encodeDerLength(value.length), value)
}

function encodeBase64(value: string | Uint8Array) {
  if (typeof value === 'string') {
    if (typeof btoa === 'function') {
      return btoa(value)
    }

    if (typeof Buffer !== 'undefined') {
      return Buffer.from(value, 'binary').toString('base64')
    }

    throw new Error('No base64 encoder available')
  }

  const binary = Array.from(value, (byte) => String.fromCharCode(byte)).join('')
  return encodeBase64(binary)
}

function decodeBase64(value: string) {
  if (typeof atob === 'function') {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
  }

  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(value, 'base64'))
  }

  throw new Error('No base64 decoder available')
}

function encodeBase64Url(value: string | Uint8Array) {
  return encodeBase64(value)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function wrapPkcs1PrivateKey(pkcs1Der: Uint8Array) {
  const version = encodeDerValue(0x02, Uint8Array.of(0x00))
  const algorithmIdentifier = encodeDerValue(0x30, concatBytes(
    encodeDerValue(0x06, RSA_ENCRYPTION_OID),
    encodeDerValue(0x05, new Uint8Array()),
  ))
  const privateKey = encodeDerValue(0x04, pkcs1Der)

  return encodeDerValue(0x30, concatBytes(version, algorithmIdentifier, privateKey))
}

function normalizeBase64Payload(privateKey: string) {
  return privateKey
    .replace(/\\n/g, '\n')
    .trim()
}

function decodeBase64OrThrow(base64: string): Uint8Array {
  try {
    return decodeBase64(base64)
  } catch (error) {
    throw new GitHubAppCryptoError(
      'github_app_key_invalid',
      'GitHub App private key contains invalid base64 data.',
      {cause: error},
    )
  }
}

export function normalizeGitHubPrivateKeyPem(privateKey: string): NormalizedGitHubPrivateKeyPem {
  const normalizedPem = normalizeBase64Payload(privateKey)
  const match = normalizedPem.match(/^-----BEGIN ([A-Z ]+)-----\s*([\s\S]*?)\s*-----END \1-----$/)

  if (match) {
    const [, label, base64Payload] = match
    const der = decodeBase64OrThrow(base64Payload.replace(/\s/g, ''))

    if (label === 'PRIVATE KEY') {
      return {der, kind: 'pkcs8'}
    }

    if (label === 'RSA PRIVATE KEY') {
      return {der, kind: 'pkcs1'}
    }

    throw new GitHubAppCryptoError(
      'github_app_key_invalid',
      `Unsupported GitHub App private key type: ${label}.`,
    )
  }

  // Backwards compatibility: pre-compat-fix deployments stored GITHUB_APP_PRIVATE_KEY
  // as raw base64 without BEGIN/END markers. The old normalizer stripped markers if
  // present and passed the remaining base64 to WebCrypto's importKey('pkcs8', ...).
  // Preserve that path so existing working secrets keep working after this refactor.
  // We only take this fallback when the input has no PEM markers at all; malformed
  // PEMs (one marker missing, mismatched labels, etc.) still fall through as invalid.
  if (!normalizedPem.includes('-----BEGIN') && !normalizedPem.includes('-----END')) {
    const headerlessBase64 = normalizedPem.replace(/\s/g, '')
    if (headerlessBase64.length === 0) {
      throw new GitHubAppCryptoError(
        'github_app_key_invalid',
        'GitHub App private key must be a PEM-encoded RSA private key.',
      )
    }

    const der = decodeBase64OrThrow(headerlessBase64)
    return {der, kind: 'pkcs8'}
  }

  throw new GitHubAppCryptoError(
    'github_app_key_invalid',
    'GitHub App private key must be a PEM-encoded RSA private key.',
  )
}

export async function importGitHubAppPrivateKey(privateKey: string): Promise<CryptoKey> {
  const normalized = normalizeGitHubPrivateKeyPem(privateKey)
  const pkcs8Der = normalized.kind === 'pkcs8'
    ? normalized.der
    : wrapPkcs1PrivateKey(normalized.der)

  try {
    return await crypto.subtle.importKey(
      'pkcs8',
      pkcs8Der,
      {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'},
      false,
      ['sign'],
    )
  } catch (error) {
    throw new GitHubAppCryptoError(
      'github_app_key_invalid',
      'GitHub App private key could not be imported by WebCrypto.',
      {cause: error},
    )
  }
}

export async function createGitHubAppJwt(input: {
  appId: string
  privateKey: string
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const payload = {iat: now - 60, exp: now + (10 * 60), iss: input.appId}
  const key = await importGitHubAppPrivateKey(input.privateKey)

  try {
    const encoder = new TextEncoder()
    const header = encodeBase64Url(JSON.stringify({alg: 'RS256', typ: 'JWT'}))
    const payloadEncoded = encodeBase64Url(JSON.stringify(payload))
    const signatureInput = encoder.encode(`${header}.${payloadEncoded}`)
    const signatureBuffer = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, signatureInput)
    const signatureEncoded = encodeBase64Url(new Uint8Array(signatureBuffer))

    return `${header}.${payloadEncoded}.${signatureEncoded}`
  } catch (error) {
    throw new GitHubAppCryptoError(
      'github_app_jwt_sign_failed',
      'GitHub App JWT signing failed.',
      {cause: error},
    )
  }
}

export async function createAppJWT(): Promise<string> {
  const appId = getEnv(GITHUB_APP_ID_ENV)
  const privateKey = getEnv(GITHUB_APP_PRIVATE_KEY_ENV)

  if (!appId || !privateKey) {
    throw new Error('GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY must be configured')
  }

  return createGitHubAppJwt({appId, privateKey})
}

async function deriveAesKey(usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  const tokenEncryptionKey = getEnv(TOKEN_ENCRYPTION_KEY_ENV)
  if (!tokenEncryptionKey) {
    throw new Error('TOKEN_ENCRYPTION_KEY is required to securely store GitHub tokens')
  }

  const keyHash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tokenEncryptionKey))
  )
  return crypto.subtle.importKey('raw', keyHash, {name: 'AES-GCM'}, false, [usage])
}

export async function encryptToken(token: string): Promise<string> {
  if (!getEnv(TOKEN_ENCRYPTION_KEY_ENV)) {
    throw new Error('TOKEN_ENCRYPTION_KEY is required to securely store GitHub tokens')
  }

  const encoder = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveAesKey('encrypt')

  const encrypted = await crypto.subtle.encrypt(
    {name: 'AES-GCM', iv},
    key,
    encoder.encode(token),
  )

  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('')
  const encHex = Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join('')
  return `${ivHex}:${encHex}`
}

export async function decryptToken(encrypted: string): Promise<string | null> {
  if (!getEnv(TOKEN_ENCRYPTION_KEY_ENV)) {
    console.error('[github-crypto] TOKEN_ENCRYPTION_KEY not configured')
    return null
  }

  // Legacy cleartext fallback (b64:) — log warning but still decode for migration
  if (encrypted.startsWith('b64:')) {
    console.warn('[github-crypto] Found legacy b64-encoded token. Re-encrypt with TOKEN_ENCRYPTION_KEY.')
    return atob(encrypted.slice(4))
  }

  try {
    const [ivHex, encHex] = encrypted.split(':')
    const iv = new Uint8Array(ivHex.match(/.{2}/g)!.map((v) => parseInt(v, 16)))
    const encryptedData = new Uint8Array(encHex.match(/.{2}/g)!.map((v) => parseInt(v, 16)))
    const key = await deriveAesKey('decrypt')
    const decrypted = await crypto.subtle.decrypt({name: 'AES-GCM', iv}, key, encryptedData)
    return new TextDecoder().decode(decrypted)
  } catch (error) {
    console.error('[github-crypto] Decryption failed:', error)
    return null
  }
}

export async function getInstallationAccessToken(installationId: number): Promise<string | null> {
  try {
    const jwt = await createAppJWT()
    const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${jwt}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })

    if (!response.ok) {
      console.error('[github-crypto] github_install_lookup_failed while requesting installation token:', response.status)
      return null
    }

    const data = await response.json()
    return data.token as string
  } catch (error) {
    if (error instanceof GitHubAppCryptoError) {
      console.error(`[github-crypto] ${error.code}:`, error.message)
      return null
    }

    console.error('[github-crypto] Error getting installation token:', error)
    return null
  }
}
