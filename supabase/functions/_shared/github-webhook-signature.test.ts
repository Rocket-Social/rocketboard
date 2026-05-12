import { webcrypto } from 'node:crypto'

import { beforeAll, describe, expect, it } from 'vitest'

import { verifyGithubWebhookSignature } from './github-webhook-signature.ts'

beforeAll(() => {
  if (!globalThis.crypto) {
    // node:crypto.webcrypto is SubtleCrypto-compatible; assign before any Deno.serve runs
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
  }
})

async function sign(body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  const hex = Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `sha256=${hex}`
}

describe('verifyGithubWebhookSignature', () => {
  const secret = 'test-webhook-secret-value-9f2c'
  const body = JSON.stringify({ action: 'opened', pull_request: { number: 42 } })

  it('accepts a body signed with the matching secret', async () => {
    const signature = await sign(body, secret)
    expect(await verifyGithubWebhookSignature({ body, secret, signature })).toBe(true)
  })

  it('rejects a body signed with a different secret', async () => {
    const signature = await sign(body, 'different-secret')
    expect(await verifyGithubWebhookSignature({ body, secret, signature })).toBe(false)
  })

  it('rejects a tampered body under the same signature', async () => {
    const signature = await sign(body, secret)
    const tampered = body.replace('"action":"opened"', '"action":"closed"')
    expect(await verifyGithubWebhookSignature({ body: tampered, secret, signature })).toBe(false)
  })

  it('rejects when the signature header is missing or empty', async () => {
    expect(await verifyGithubWebhookSignature({ body, secret, signature: null })).toBe(false)
    expect(await verifyGithubWebhookSignature({ body, secret, signature: undefined })).toBe(false)
    expect(await verifyGithubWebhookSignature({ body, secret, signature: '' })).toBe(false)
  })

  it('rejects when the secret env is missing', async () => {
    const signature = await sign(body, secret)
    expect(await verifyGithubWebhookSignature({ body, secret: '', signature })).toBe(false)
  })

  it('rejects a malformed signature header (wrong length)', async () => {
    expect(await verifyGithubWebhookSignature({ body, secret, signature: 'sha256=abc' })).toBe(false)
  })
})
