const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])
const EXPLICIT_LINK_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i
const RELATIVE_LINK_PATTERN = /^(\/|#|\?|\.\/|\.\.\/)/

export function normalizeRichTextLinkUrl(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return ''
  }

  if (trimmed.startsWith('//')) {
    return normalizeRichTextLinkUrl(`https:${trimmed}`)
  }

  if (RELATIVE_LINK_PATTERN.test(trimmed)) {
    return ''
  }

  const candidate = EXPLICIT_LINK_SCHEME_PATTERN.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const parsed = new URL(candidate)

    if (!SAFE_LINK_PROTOCOLS.has(parsed.protocol)) {
      return ''
    }

    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && !parsed.hostname) {
      return ''
    }

    if ((parsed.protocol === 'mailto:' || parsed.protocol === 'tel:') && !parsed.pathname) {
      return ''
    }

    return parsed.toString()
  } catch {
    return ''
  }
}

export function isAllowedRichTextLinkUrl(value: string) {
  return normalizeRichTextLinkUrl(value).length > 0
}
