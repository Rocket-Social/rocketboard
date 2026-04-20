import {unzipSync, strFromU8} from 'fflate'

// ============================================================
// Types
// ============================================================

type RichTextMark = {
  attrs?: Record<string, unknown>
  type: string
}

type RichTextNode = {
  attrs?: Record<string, unknown>
  content?: RichTextNode[]
  marks?: RichTextMark[]
  text?: string
  type: string
}

type RichTextDocument = {
  content: RichTextNode[]
  type: 'doc'
}

export type ObsidianNote = {
  contentJson: RichTextDocument
  contentMd: string
  folderPath: string | null
  frontmatter: Record<string, unknown>
  previewText: string
  relativePath: string
  title: string
}

export type VaultParseResult = {
  notes: ObsidianNote[]
  skippedFiles: string[]
  totalFiles: number
}

export type VaultImportProgress = {
  current: number
  currentFile: string
  phase: 'parsing' | 'inserting' | 'done'
  total: number
}

// ============================================================
// Frontmatter
// ============================================================

export function extractFrontmatter(content: string): {
  body: string
  frontmatter: Record<string, unknown>
} {
  const trimmed = content.replace(/^\uFEFF/, '') // strip BOM
  if (!trimmed.startsWith('---')) {
    return {body: trimmed, frontmatter: {}}
  }

  const endIndex = trimmed.indexOf('\n---', 3)
  if (endIndex === -1) {
    return {body: trimmed, frontmatter: {}}
  }

  const yamlBlock = trimmed.slice(4, endIndex)
  const body = trimmed.slice(endIndex + 4).trimStart()
  const frontmatter: Record<string, unknown> = {}

  for (const line of yamlBlock.split('\n')) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue
    const key = line.slice(0, colonIndex).trim()
    const value = line.slice(colonIndex + 1).trim()
    if (!key) continue

    // Simple value parsing: booleans, numbers, arrays, strings
    if (value === 'true') frontmatter[key] = true
    else if (value === 'false') frontmatter[key] = false
    else if (value.startsWith('[') && value.endsWith(']')) {
      frontmatter[key] = value.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean)
    } else if (/^-?\d+(\.\d+)?$/.test(value)) {
      frontmatter[key] = Number(value)
    } else {
      // Strip surrounding quotes
      frontmatter[key] = value.replace(/^["']|["']$/g, '')
    }
  }

  return {body, frontmatter}
}

// ============================================================
// Markdown to TipTap
// ============================================================

function makeTextNode(text: string, marks?: RichTextMark[]): RichTextNode {
  return {marks, text, type: 'text'}
}

function makeParagraphNode(text: string): RichTextNode {
  const trimmed = text.trim()
  if (!trimmed) return {type: 'paragraph'}
  return {content: [makeTextNode(trimmed)], type: 'paragraph'}
}

function makeHeadingNode(text: string, level: number): RichTextNode {
  return {
    attrs: {level: Math.min(level, 4)},
    content: [makeTextNode(text.trim())],
    type: 'heading',
  }
}

function makeBulletListNode(items: string[]): RichTextNode {
  return {
    content: items.map((item) => ({
      content: [makeParagraphNode(item)],
      type: 'listItem',
    })),
    type: 'bulletList',
  }
}

function makeTaskListNode(items: Array<{checked: boolean; text: string}>): RichTextNode {
  return {
    content: items.map((item) => ({
      attrs: {checked: item.checked},
      content: [makeParagraphNode(item.text)],
      type: 'taskItem',
    })),
    type: 'taskList',
  }
}

function stripWikilinks(text: string): string {
  // [[Page Name|display text]] → display text
  // [[Page Name]] → Page Name
  return text
    .replace(/!\[\[.*?\]\]/g, '') // strip image embeds ![[image.png]]
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2') // [[page|alias]] → alias
    .replace(/\[\[([^\]]+)\]\]/g, '$1') // [[page]] → page
}

function stripInlineMarkdown(text: string): string {
  return stripWikilinks(text)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
}

function flushParagraphBuffer(buffer: string[], nodes: RichTextNode[]) {
  if (buffer.length === 0) return
  nodes.push(makeParagraphNode(buffer.join(' ')))
  buffer.length = 0
}

export function obsidianMarkdownToTipTap(markdown: string): RichTextDocument {
  const normalized = markdown.replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return {content: [{type: 'paragraph'}], type: 'doc'}
  }

  const lines = normalized.split('\n')
  const nodes: RichTextNode[] = []
  const paragraphBuffer: string[] = []

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i] ?? ''
    const line = rawLine.trim()

    if (!line) {
      flushParagraphBuffer(paragraphBuffer, nodes)
      continue
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      flushParagraphBuffer(paragraphBuffer, nodes)
      nodes.push(makeHeadingNode(
        stripInlineMarkdown(headingMatch[2] ?? ''),
        headingMatch[1]?.length ?? 2,
      ))
      continue
    }

    // Task lists: - [ ] or - [x]
    const taskMatch = line.match(/^[-*+]\s+\[([ xX])\]\s+(.*)$/)
    if (taskMatch) {
      flushParagraphBuffer(paragraphBuffer, nodes)
      const items: Array<{checked: boolean; text: string}> = [{
        checked: taskMatch[1] !== ' ',
        text: stripInlineMarkdown(taskMatch[2] ?? ''),
      }]

      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1]?.trim() ?? ''
        const nextMatch = nextLine.match(/^[-*+]\s+\[([ xX])\]\s+(.*)$/)
        if (!nextMatch) break
        items.push({
          checked: nextMatch[1] !== ' ',
          text: stripInlineMarkdown(nextMatch[2] ?? ''),
        })
        i += 1
      }

      nodes.push(makeTaskListNode(items))
      continue
    }

    // Bullet lists
    const bulletMatch = line.match(/^[-*+]\s+(.*)$/)
    if (bulletMatch) {
      flushParagraphBuffer(paragraphBuffer, nodes)
      const items = [stripInlineMarkdown(bulletMatch[1] ?? '')]

      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1]?.trim() ?? ''
        const nextMatch = nextLine.match(/^[-*+]\s+(.*)$/)
        if (!nextMatch) break
        items.push(stripInlineMarkdown(nextMatch[1] ?? ''))
        i += 1
      }

      nodes.push(makeBulletListNode(items.filter(Boolean)))
      continue
    }

    // Ordered lists
    const orderedMatch = line.match(/^\d+\.\s+(.*)$/)
    if (orderedMatch) {
      flushParagraphBuffer(paragraphBuffer, nodes)
      const items = [stripInlineMarkdown(orderedMatch[1] ?? '')]

      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1]?.trim() ?? ''
        const nextMatch = nextLine.match(/^\d+\.\s+(.*)$/)
        if (!nextMatch) break
        items.push(stripInlineMarkdown(nextMatch[1] ?? ''))
        i += 1
      }

      nodes.push({
        content: items.filter(Boolean).map((item) => ({
          content: [makeParagraphNode(item)],
          type: 'listItem',
        })),
        type: 'orderedList',
      })
      continue
    }

    // Blockquotes (including callouts like > [!note])
    if (line.startsWith('>')) {
      flushParagraphBuffer(paragraphBuffer, nodes)
      const quoteLines: string[] = [line.replace(/^>\s*(\[!.*?\])?\s*/, '')]

      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1]?.trim() ?? ''
        if (!nextLine.startsWith('>')) break
        quoteLines.push(nextLine.replace(/^>\s*/, ''))
        i += 1
      }

      const quoteText = stripInlineMarkdown(quoteLines.join(' '))
      if (quoteText) {
        nodes.push({
          content: [makeParagraphNode(quoteText)],
          type: 'blockquote',
        })
      }
      continue
    }

    // Horizontal rules
    if (/^[-*_]{3,}$/.test(line)) {
      flushParagraphBuffer(paragraphBuffer, nodes)
      nodes.push({type: 'horizontalRule'})
      continue
    }

    // Regular paragraph text
    paragraphBuffer.push(stripInlineMarkdown(line))
  }

  flushParagraphBuffer(paragraphBuffer, nodes)

  if (nodes.length === 0) {
    nodes.push({type: 'paragraph'})
  }

  return {content: nodes, type: 'doc'}
}

// ============================================================
// Markdown to plain text (for content_md and preview)
// ============================================================

function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/!\[\[.*?\]\]/g, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^>\s*(\[!.*?\])?\s*/gm, '')
    .replace(/^[-*+]\s+\[[ xX]\]\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .trim()
}

// ============================================================
// Note parsing
// ============================================================

function extractTitle(relativePath: string, frontmatter: Record<string, unknown>, body: string): string {
  if (typeof frontmatter.title === 'string' && frontmatter.title.trim()) {
    return frontmatter.title.trim()
  }

  // Use filename without extension
  const fileName = relativePath.split('/').pop() ?? ''
  const nameWithoutExt = fileName.replace(/\.md$/i, '')
  if (nameWithoutExt) {
    return nameWithoutExt
  }

  // Fallback: first line of body
  const firstLine = body.split('\n')[0]?.replace(/^#+\s*/, '').trim()
  return firstLine || 'Untitled'
}

function extractPreview(body: string, maxLength = 180): string {
  const plain = markdownToPlainText(body)
  const firstLine = plain.split('\n').find((line) => line.trim()) ?? ''
  if (firstLine.length <= maxLength) return firstLine
  return firstLine.slice(0, maxLength - 3).trimEnd() + '...'
}

function extractFolderPath(relativePath: string): string | null {
  const parts = relativePath.split('/')
  if (parts.length <= 1) return null
  return parts.slice(0, -1).join('/')
}

export function parseMarkdownNote(relativePath: string, rawContent: string): ObsidianNote {
  const {body, frontmatter} = extractFrontmatter(rawContent)
  const title = extractTitle(relativePath, frontmatter, body)
  const contentJson = obsidianMarkdownToTipTap(body)
  const contentMd = markdownToPlainText(body)
  const previewText = extractPreview(body)
  const folderPath = extractFolderPath(relativePath)

  return {
    contentJson,
    contentMd,
    folderPath,
    frontmatter,
    previewText,
    relativePath,
    title,
  }
}

// ============================================================
// Vault parsing (zip)
// ============================================================

const SKIP_DIRS = new Set(['.obsidian', '.trash', '.git'])

function shouldSkipPath(path: string): boolean {
  const firstSegment = path.split('/')[0] ?? ''
  return SKIP_DIRS.has(firstSegment)
}

function isMarkdownFile(path: string): boolean {
  return path.toLowerCase().endsWith('.md')
}

export function parseVaultFromZip(zipBuffer: ArrayBuffer): VaultParseResult {
  const files = unzipSync(new Uint8Array(zipBuffer))
  const notes: ObsidianNote[] = []
  const skippedFiles: string[] = []
  let totalFiles = 0

  // Detect if zip has a root folder wrapper (common when zipping a folder)
  const paths = Object.keys(files)
  const commonPrefix = detectCommonPrefix(paths)

  for (const [rawPath, data] of Object.entries(files)) {
    // Skip directories (empty entries)
    if (rawPath.endsWith('/')) continue

    totalFiles += 1

    // Strip common prefix if present
    const relativePath = commonPrefix ? rawPath.slice(commonPrefix.length) : rawPath

    if (shouldSkipPath(relativePath)) {
      skippedFiles.push(relativePath)
      continue
    }

    if (!isMarkdownFile(relativePath)) {
      skippedFiles.push(relativePath)
      continue
    }

    const content = strFromU8(data)
    const note = parseMarkdownNote(relativePath, content)
    notes.push(note)
  }

  return {notes, skippedFiles, totalFiles}
}

function detectCommonPrefix(paths: string[]): string {
  if (paths.length === 0) return ''

  // If all paths start with the same directory, strip it
  const firstSegments = paths
    .filter((p) => !p.endsWith('/') || p.split('/').length > 2)
    .map((p) => p.split('/')[0])

  if (firstSegments.length === 0) return ''

  const first = firstSegments[0]
  if (!first) return ''

  const allSame = firstSegments.every((seg) => seg === first)
  if (!allSame) return ''

  return first + '/'
}
