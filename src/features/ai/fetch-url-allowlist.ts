// Frontend mirror of the worker's host-allowlist match logic. The worker
// owns the authoritative version at
// `supabase/functions/ai-agent-run/fetch-url.shared.ts` and writes a
// Failed run with `error_text='url_not_in_allowlist:<host>'` if a
// dispatched URL fails the check.
//
// Phase 5 surfaces an inline warning during template-config entry so
// the user can see the mismatch before submitting. The actual deny still
// happens server-side; this is render-only UX.

export type FetchUrlAllowlistEntry = {
  domainPattern: string
}

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
  return allowlist.some((entry) => hostMatchesPattern(host, entry.domainPattern))
}

// Best-effort URL parse; returns null on any failure (invalid URL, empty
// string, missing protocol). Callers gate the allowlist warning on a
// non-null hostname so partially-typed URLs don't flicker the warning.
export function parseHostname(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  try {
    return new URL(trimmed).hostname.toLowerCase()
  } catch {
    return null
  }
}
