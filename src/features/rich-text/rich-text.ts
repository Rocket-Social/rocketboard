import type {JSONContent} from '@tiptap/core'

import {normalizeRichTextLinkUrl} from './link-url'

export type RichTextDocument = JSONContent

const EMPTY_RICH_TEXT_DOCUMENT: RichTextDocument = {
  content: [{type: 'paragraph'}],
  type: 'doc',
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * JSON.stringify with sorted keys so comparisons are key-order-independent.
 * PostgreSQL JSONB sorts keys alphabetically, which differs from the insertion
 * order TipTap uses — plain JSON.stringify would produce false mismatches.
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']'
  }
  const keys = Object.keys(value).sort()
  return '{' + keys.map(k =>
    JSON.stringify(k) + ':' + stableStringify((value as Record<string, unknown>)[k])
  ).join(',') + '}'
}

function normalizeMarks(marks: JSONContent['marks']) {
  if (!Array.isArray(marks)) {
    return undefined
  }

  const normalizedMarks = marks.flatMap((mark) => {
    if (!mark || typeof mark !== 'object' || typeof mark.type !== 'string') {
      return []
    }

    if (mark.type !== 'link') {
      return [mark]
    }

    const normalizedHref = typeof mark.attrs?.href === 'string'
      ? normalizeRichTextLinkUrl(mark.attrs.href)
      : ''

    if (!normalizedHref) {
      return []
    }

    return [{
      ...mark,
      attrs: {
        ...mark.attrs,
        href: normalizedHref,
      },
    }]
  })

  return normalizedMarks.length > 0 ? normalizedMarks : undefined
}

function normalizeNode(node: JSONContent): JSONContent {
  return {
    ...node,
    content: Array.isArray(node.content) ? node.content.map(normalizeNode) : undefined,
    marks: normalizeMarks(node.marks),
  }
}


export function emptyRichTextDocument(): RichTextDocument {
  return cloneJson(EMPTY_RICH_TEXT_DOCUMENT)
}

export function plainTextToRichTextDocument(value: string | null | undefined): RichTextDocument {
  const normalizedText = (value ?? '').replace(/\r\n/g, '\n')

  if (!normalizedText.trim()) {
    return emptyRichTextDocument()
  }

  return {
    content: normalizedText.split('\n').map((line) =>
      line
        ? {
            content: [{text: line, type: 'text'}],
            type: 'paragraph',
          }
        : {type: 'paragraph'},
    ),
    type: 'doc',
  }
}

export function normalizeRichTextDocument(
  value: RichTextDocument | null | undefined,
  fallbackText = '',
): RichTextDocument {
  if (!value || value.type !== 'doc') {
    return plainTextToRichTextDocument(fallbackText)
  }

  const normalized = normalizeNode(value)

  // Ensure at least one paragraph so TipTap has a focusable/editable area
  if (!normalized.content || normalized.content.length === 0) {
    normalized.content = [{type: 'paragraph'}]
  }

  return normalized
}

export function cloneRichTextDocument(value: RichTextDocument | null | undefined, fallbackText = '') {
  return cloneJson(normalizeRichTextDocument(value, fallbackText))
}

export function stringifyRichTextDocument(value: RichTextDocument | null | undefined, fallbackText = '') {
  return stableStringify(normalizeRichTextDocument(value, fallbackText))
}

export function richTextDocumentsEqual(
  left: RichTextDocument | null | undefined,
  right: RichTextDocument | null | undefined,
) {
  return stringifyRichTextDocument(left) === stringifyRichTextDocument(right)
}
