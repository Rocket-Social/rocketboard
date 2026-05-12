import {describe, expect, it} from 'vitest'

import {
  fetchUrlWithGuards,
  hostMatchesAllowlist,
  hostMatchesPattern,
  isContentTypeAllowed,
  isPrivateOrReservedIPv4,
  parseAndNormalizeUrl,
  truncateBody,
} from './fetch-url.shared.ts'

describe('parseAndNormalizeUrl', () => {
  it('accepts a normal https URL', () => {
    const result = parseAndNormalizeUrl('https://crash.lila.com/log')
    expect(result.ok).toBe(true)
  })

  it('rejects file:// + javascript:', () => {
    expect(parseAndNormalizeUrl('file:///etc/passwd').ok).toBe(false)
    expect(parseAndNormalizeUrl('javascript:alert(1)').ok).toBe(false)
    expect(parseAndNormalizeUrl('ftp://example.com').ok).toBe(false)
  })

  it('rejects URLs longer than 2048 chars', () => {
    const long = 'https://example.com/' + 'a'.repeat(2050)
    expect(parseAndNormalizeUrl(long).ok).toBe(false)
  })

  it('rejects empty / non-string input', () => {
    expect(parseAndNormalizeUrl('').ok).toBe(false)
    expect(parseAndNormalizeUrl(undefined as unknown as string).ok).toBe(false)
  })
})

describe('hostMatchesPattern', () => {
  it('matches exact host', () => {
    expect(hostMatchesPattern('crash.lila.com', 'crash.lila.com')).toBe(true)
    expect(hostMatchesPattern('crash.lila.com', 'crash.lila.io')).toBe(false)
  })

  it('matches wildcard subdomain only (not the bare suffix)', () => {
    expect(hostMatchesPattern('support.zendesk.com', '*.zendesk.com')).toBe(true)
    expect(hostMatchesPattern('zendesk.com', '*.zendesk.com')).toBe(false)
    expect(hostMatchesPattern('a.b.zendesk.com', '*.zendesk.com')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(hostMatchesPattern('Crash.Lila.com', 'crash.lila.com')).toBe(true)
  })
})

describe('hostMatchesAllowlist', () => {
  it('returns true if any pattern matches', () => {
    const allowlist = [
      {domain_pattern: 'crash.lila.com'},
      {domain_pattern: '*.zendesk.com'},
    ]
    expect(hostMatchesAllowlist('crash.lila.com', allowlist)).toBe(true)
    expect(hostMatchesAllowlist('support.zendesk.com', allowlist)).toBe(true)
    expect(hostMatchesAllowlist('evil.example.com', allowlist)).toBe(false)
  })

  it('returns false for an empty allowlist', () => {
    expect(hostMatchesAllowlist('any.host', [])).toBe(false)
  })
})

describe('isPrivateOrReservedIPv4', () => {
  it('flags loopback', () => {
    expect(isPrivateOrReservedIPv4('127.0.0.1')).toBe(true)
  })

  it('flags AWS/GCP metadata link-local', () => {
    expect(isPrivateOrReservedIPv4('169.254.169.254')).toBe(true)
  })

  it('flags RFC1918 ranges', () => {
    expect(isPrivateOrReservedIPv4('10.0.0.1')).toBe(true)
    expect(isPrivateOrReservedIPv4('172.16.0.1')).toBe(true)
    expect(isPrivateOrReservedIPv4('172.31.255.255')).toBe(true)
    expect(isPrivateOrReservedIPv4('172.32.0.1')).toBe(false) // outside RFC1918
    expect(isPrivateOrReservedIPv4('192.168.1.1')).toBe(true)
  })

  it('flags multicast and reserved blocks', () => {
    expect(isPrivateOrReservedIPv4('224.0.0.1')).toBe(true)
    expect(isPrivateOrReservedIPv4('240.0.0.1')).toBe(true)
    expect(isPrivateOrReservedIPv4('255.255.255.255')).toBe(true)
  })

  it('passes typical public IPs', () => {
    expect(isPrivateOrReservedIPv4('8.8.8.8')).toBe(false)
    expect(isPrivateOrReservedIPv4('1.1.1.1')).toBe(false)
  })

  it('refuses non-IPv4 inputs (denylist-by-default)', () => {
    expect(isPrivateOrReservedIPv4('::1')).toBe(true)
    expect(isPrivateOrReservedIPv4('not-an-ip')).toBe(true)
    expect(isPrivateOrReservedIPv4('10.0.0.300')).toBe(true) // octet > 255
  })
})

describe('isContentTypeAllowed', () => {
  it('accepts the v1 allowlist', () => {
    expect(isContentTypeAllowed('text/html; charset=utf-8')).toBe(true)
    expect(isContentTypeAllowed('application/json')).toBe(true)
    expect(isContentTypeAllowed('text/csv')).toBe(true)
  })

  it('rejects binary types', () => {
    expect(isContentTypeAllowed('application/octet-stream')).toBe(false)
    expect(isContentTypeAllowed('image/png')).toBe(false)
    expect(isContentTypeAllowed('video/mp4')).toBe(false)
  })

  it('rejects empty / null content-type', () => {
    expect(isContentTypeAllowed(null)).toBe(false)
    expect(isContentTypeAllowed('')).toBe(false)
  })
})

describe('truncateBody', () => {
  it('returns body unchanged when under cap', () => {
    const result = truncateBody('hello', 1000)
    expect(result.truncated).toBe(false)
    expect(result.body).toBe('hello')
  })

  it('truncates and appends marker when over cap', () => {
    const big = 'a'.repeat(1000)
    const result = truncateBody(big, 100)
    expect(result.truncated).toBe(true)
    expect(result.body.length).toBeGreaterThan(100)
    expect(result.body).toContain('[response truncated')
  })
})

describe('fetchUrlWithGuards', () => {
  const baseOptions = {
    allowlist: [{domain_pattern: 'crash.lila.com'}, {domain_pattern: '*.zendesk.com'}],
    maxBytes: 10_000,
    timeoutMs: 5_000,
    dnsResolver: async () => ['8.8.8.8'],
  }

  it('rejects URLs whose host is not in the allowlist', async () => {
    const result = await fetchUrlWithGuards('https://evil.example.com/x', baseOptions)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('host_not_allowlisted')
  })

  it('rejects URLs whose DNS resolves to a private IP', async () => {
    const result = await fetchUrlWithGuards('https://crash.lila.com/log', {
      ...baseOptions,
      dnsResolver: async () => ['169.254.169.254'],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('private_ip_blocked')
  })

  it('rejects URLs that the DNS resolver fails for', async () => {
    const result = await fetchUrlWithGuards('https://crash.lila.com/log', {
      ...baseOptions,
      dnsResolver: async () => {
        throw new Error('nx_domain')
      },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('dns_resolve_failed')
  })

  it('rejects responses with disallowed content-type', async () => {
    const fetchImpl = (async () => new Response('binary', {
      status: 200,
      headers: {'content-type': 'application/octet-stream'},
    })) as unknown as typeof fetch
    const result = await fetchUrlWithGuards('https://crash.lila.com/log', {
      ...baseOptions,
      fetchImpl,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('unsupported_content_type')
  })

  it('returns truncated body when response exceeds maxBytes', async () => {
    const huge = 'x'.repeat(50_000)
    const fetchImpl = (async () => new Response(huge, {
      status: 200,
      headers: {'content-type': 'text/plain'},
    })) as unknown as typeof fetch
    const result = await fetchUrlWithGuards('https://crash.lila.com/log', {
      ...baseOptions,
      maxBytes: 1_000,
      fetchImpl,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.truncated).toBe(true)
      expect(result.body).toContain('[response truncated')
    }
  })

  it('returns the response body for an allowed URL with public DNS + valid content-type', async () => {
    const fetchImpl = (async () => new Response('crash log contents', {
      status: 200,
      headers: {'content-type': 'text/plain'},
    })) as unknown as typeof fetch
    const result = await fetchUrlWithGuards('https://crash.lila.com/log', {
      ...baseOptions,
      fetchImpl,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.body).toBe('crash log contents')
      expect(result.contentType).toBe('text/plain')
    }
  })
})
