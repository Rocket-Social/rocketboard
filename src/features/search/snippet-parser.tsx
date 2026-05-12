import type {ReactNode} from 'react'

/**
 * Parse search snippet text containing «»-delimited highlight markers
 * into React elements with styled <mark> tags.
 *
 * The SQL search RPCs use ts_headline with StartSel="«" / StopSel="»"
 * to wrap matched terms. This parser converts those markers into
 * highlighted React elements.
 *
 * Graceful degradation: malformed markers (unmatched «/») render as
 * plain text. Never throws.
 */
export function parseSnippet(snippet: string): ReactNode[] {
  if (!snippet) {
    return []
  }

  const parts: ReactNode[] = []
  let current = 0
  let markIndex = 0

  while (current < snippet.length) {
    const startPos = snippet.indexOf('«', current)

    if (startPos === -1) {
      parts.push(snippet.slice(current))
      break
    }

    const endPos = snippet.indexOf('»', startPos + 1)

    if (endPos === -1) {
      // Malformed: start marker without end. Render remaining as plain text.
      parts.push(snippet.slice(current))
      break
    }

    // Text before the marker
    if (startPos > current) {
      parts.push(snippet.slice(current, startPos))
    }

    // Highlighted term
    const term = snippet.slice(startPos + 1, endPos)
    if (term) {
      parts.push(
        <mark
          className='rounded bg-primary-soft/60 px-0.5 text-text-strong'
          key={`hl-${markIndex++}`}
        >
          {term}
        </mark>,
      )
    }

    current = endPos + 1
  }

  return parts
}
