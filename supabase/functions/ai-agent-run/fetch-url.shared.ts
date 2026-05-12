// fetch_url tool helpers — SSRF guard, allowlist matching, size cap.
//
// Per PRD §10.7. The Deno runtime needs `Deno.resolveDns` to map host
// → IP for the SSRF check; that's not available in Vitest, so the
// orchestrator takes a `dnsResolver` injection. The pure helpers are
// exported so tests can exercise the deny/allow logic without DNS.
//
// Anti-DNS-rebinding note: the orchestrator resolves the host once,
// then dials the IP directly via fetch's `Host` header trick? No — fetch
// doesn't expose the dialed IP. For v1 we accept that a sufficiently
// motivated attacker can rebind DNS between resolve and dial. The
// security boundary is good enough for v1 (it stops the pathological
// "trick the bot into pointing at AWS metadata"); a full hardened
// fetcher with SOCKS pinning is out of scope.

export type FetchUrlAllowlistEntry = {
  domain_pattern: string
}

const FORBIDDEN_SCHEMES = new Set(['file:', 'ftp:', 'gopher:', 'data:', 'javascript:'])
const ALLOWED_CONTENT_TYPES = [
  'text/html',
  'text/plain',
  'application/json',
  'text/xml',
  'application/xml',
  'text/csv',
  'application/javascript',
  'text/javascript',
] as const

export type ParseUrlResult =
  | {ok: true; parsed: URL}
  | {ok: false; reason: string}

export function parseAndNormalizeUrl(input: string): ParseUrlResult {
  if (!input || typeof input !== 'string') {
    return {ok: false, reason: 'url_required'}
  }
  if (input.length > 2048) {
    return {ok: false, reason: 'url_too_long'}
  }
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    return {ok: false, reason: 'url_unparseable'}
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {ok: false, reason: 'forbidden_scheme'}
  }
  if (FORBIDDEN_SCHEMES.has(parsed.protocol)) {
    return {ok: false, reason: 'forbidden_scheme'}
  }
  if (!parsed.hostname || parsed.hostname.length > 253) {
    return {ok: false, reason: 'invalid_host'}
  }
  return {ok: true, parsed}
}

// Wildcard domain match: `*.zendesk.com` matches `support.zendesk.com`
// (and any deeper subdomain) but NOT `zendesk.com` itself. A bare
// `zendesk.com` pattern matches only `zendesk.com` exactly.
export function hostMatchesPattern(host: string, pattern: string): boolean {
  const normalisedHost = host.trim().toLowerCase()
  const normalisedPattern = pattern.trim().toLowerCase()
  if (!normalisedHost || !normalisedPattern) return false

  if (normalisedPattern.startsWith('*.')) {
    const tail = normalisedPattern.slice(2)
    if (!tail) return false
    return normalisedHost.endsWith('.' + tail) && normalisedHost.length > tail.length + 1
  }
  return normalisedHost === normalisedPattern
}

export function hostMatchesAllowlist(
  host: string,
  allowlist: FetchUrlAllowlistEntry[],
): boolean {
  return allowlist.some((entry) => hostMatchesPattern(host, entry.domain_pattern))
}

// Private / reserved CIDR check. Operates on a pre-resolved IPv4 string.
// IPv6 support is intentionally narrow in v1 — we only accept IPv4
// resolutions; anything else (IPv6 literals, multicast) gets denied
// upstream. PRD §10.7 calls out the v6 link-local + ULA ranges; v1's
// "deny all v6" stance is stricter and safer.
export function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split('.')
  if (parts.length !== 4) return true // refuse anything that isn't a 4-octet v4

  const octets = parts.map((p) => Number(p))
  if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true

  const [a, b] = octets

  if (a === 0) return true               // 0.0.0.0/8 unspecified
  if (a === 10) return true              // RFC1918 10.0.0.0/8
  if (a === 127) return true             // loopback 127.0.0.0/8
  if (a === 169 && b === 254) return true // link-local 169.254.0.0/16 (incl. AWS/GCP metadata)
  if (a === 172 && b >= 16 && b <= 31) return true // RFC1918 172.16.0.0/12
  if (a === 192 && b === 168) return true // RFC1918 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true // benchmark 198.18.0.0/15
  if (a >= 224 && a <= 239) return true  // multicast 224.0.0.0/4
  if (a >= 240) return true              // reserved 240.0.0.0/4 (incl. broadcast)

  return false
}

export function isContentTypeAllowed(contentType: string | null | undefined): boolean {
  if (!contentType) return false
  const lower = contentType.toLowerCase()
  return ALLOWED_CONTENT_TYPES.some((allowed) => lower.startsWith(allowed))
}

export type TruncateResult = {body: string; truncated: boolean; bytes: number}

export function truncateBody(body: string, maxBytes: number): TruncateResult {
  // Bytes, not chars. Multibyte chars compress proportionally in JS strings,
  // but the contract here is bytes-on-the-wire-equivalent so the LLM can't
  // be flooded by a UTF-8 payload that fits under a char limit.
  const bytes = new TextEncoder().encode(body).length
  if (bytes <= maxBytes) {
    return {body, truncated: false, bytes}
  }
  // Truncate at byte budget, then trim back to a valid char boundary.
  const slice = body.slice(0, maxBytes)
  const sliceBytes = new TextEncoder().encode(slice).length
  return {
    body: slice + '\n[response truncated at ' + maxBytes + ' bytes]',
    truncated: true,
    bytes: sliceBytes,
  }
}

export type FetchUrlGuardOptions = {
  allowlist: FetchUrlAllowlistEntry[]
  maxBytes: number
  timeoutMs: number
  dnsResolver: (host: string) => Promise<string[]>
  fetchImpl?: typeof fetch
}

export type FetchUrlGuardResult =
  | {
      ok: true
      url: string
      status: number
      contentType: string | null
      body: string
      bytes: number
      truncated: boolean
      durationMs: number
    }
  | {
      ok: false
      url: string
      reason: string
      status?: number
      durationMs: number
    }

export async function fetchUrlWithGuards(
  rawUrl: string,
  options: FetchUrlGuardOptions,
): Promise<FetchUrlGuardResult> {
  const startedAt = Date.now()
  const parseResult = parseAndNormalizeUrl(rawUrl)
  if (!parseResult.ok) {
    return {ok: false, url: rawUrl, reason: parseResult.reason, durationMs: Date.now() - startedAt}
  }
  const url = parseResult.parsed

  if (!hostMatchesAllowlist(url.hostname, options.allowlist)) {
    return {ok: false, url: rawUrl, reason: 'host_not_allowlisted', durationMs: Date.now() - startedAt}
  }

  let resolvedIps: string[]
  try {
    resolvedIps = await options.dnsResolver(url.hostname)
  } catch {
    return {ok: false, url: rawUrl, reason: 'dns_resolve_failed', durationMs: Date.now() - startedAt}
  }
  if (resolvedIps.length === 0) {
    return {ok: false, url: rawUrl, reason: 'dns_resolve_failed', durationMs: Date.now() - startedAt}
  }
  if (resolvedIps.some((ip) => isPrivateOrReservedIPv4(ip))) {
    return {ok: false, url: rawUrl, reason: 'private_ip_blocked', durationMs: Date.now() - startedAt}
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), options.timeoutMs)

  let response: Response
  try {
    response = await fetchImpl(url.toString(), {
      method: 'GET',
      redirect: 'manual', // refuse server-side redirect chains; let the LLM see the 3xx if relevant
      signal: controller.signal,
      headers: {
        'User-Agent': 'rocketboard-ai-agent/1.0',
        'Accept': ALLOWED_CONTENT_TYPES.join(', '),
      },
    })
  } catch (err) {
    clearTimeout(timeoutHandle)
    const reason = err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'fetch_failed'
    return {ok: false, url: rawUrl, reason, durationMs: Date.now() - startedAt}
  }
  clearTimeout(timeoutHandle)

  const contentType = response.headers.get('content-type')
  if (!isContentTypeAllowed(contentType)) {
    return {
      ok: false,
      url: rawUrl,
      reason: 'unsupported_content_type',
      status: response.status,
      durationMs: Date.now() - startedAt,
    }
  }

  let bodyText: string
  try {
    bodyText = await response.text()
  } catch {
    return {ok: false, url: rawUrl, reason: 'body_read_failed', status: response.status, durationMs: Date.now() - startedAt}
  }

  const truncated = truncateBody(bodyText, options.maxBytes)
  return {
    ok: true,
    url: url.toString(),
    status: response.status,
    contentType,
    body: truncated.body,
    bytes: truncated.bytes,
    truncated: truncated.truncated,
    durationMs: Date.now() - startedAt,
  }
}
