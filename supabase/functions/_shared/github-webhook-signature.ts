/**
 * Verify a GitHub webhook HMAC-SHA256 signature (x-hub-signature-256 header).
 *
 * Constant-time comparison to prevent timing attacks. Returns false for any
 * shape mismatch, not just cryptographic failure — missing secret, empty
 * signature, or wrong-length digest all fail closed.
 */
export async function verifyGithubWebhookSignature(input: {
  body: string
  secret: string
  signature: string | null | undefined
}): Promise<boolean> {
  if (!input.secret || !input.signature) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(input.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(input.body))
  const expected = `sha256=${Array.from(new Uint8Array(signed))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`

  if (input.signature.length !== expected.length) return false

  let mismatch = 0
  for (let i = 0; i < input.signature.length; i++) {
    mismatch |= input.signature.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return mismatch === 0
}
