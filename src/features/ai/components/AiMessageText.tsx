import type { ReactNode } from 'react'

import { cn } from '../../../lib/cn'

type MessageBlock =
  | { depth: number; text: string; type: 'heading' }
  | { items: string[]; type: 'ordered-list' }
  | { lines: string[]; type: 'paragraph' }
  | { items: string[]; type: 'unordered-list' }

type AiMessageTextProps = {
  className?: string
  content: string
}

const INLINE_TOKEN_PATTERN = /(\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`)/g

export function AiMessageText({ className, content }: AiMessageTextProps) {
  const blocks = parseMessageBlocks(content)

  return (
    <div className={cn('space-y-2 break-words leading-relaxed', className)}>
      {blocks.map((block, blockIndex) => renderBlock(block, blockIndex))}
    </div>
  )
}

function parseMessageBlocks(content: string): MessageBlock[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  const blocks: MessageBlock[] = []
  let paragraphLines: string[] = []
  let listBlock: Extract<MessageBlock, { type: 'ordered-list' }> | Extract<MessageBlock, { type: 'unordered-list' }> | null = null

  const flushParagraph = () => {
    const linesToFlush = paragraphLines.map((line) => line.trim()).filter(Boolean)
    if (linesToFlush.length > 0) {
      blocks.push({ lines: linesToFlush, type: 'paragraph' })
    }
    paragraphLines = []
  }

  const flushList = () => {
    if (listBlock && listBlock.items.length > 0) {
      blocks.push(listBlock)
    }
    listBlock = null
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (!line) {
      flushParagraph()
      flushList()
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      flushParagraph()
      flushList()
      blocks.push({
        depth: headingMatch[1].length,
        text: headingMatch[2].trim(),
        type: 'heading',
      })
      continue
    }

    const orderedListMatch = line.match(/^\d+[.)]\s+(.+)$/)
    if (orderedListMatch) {
      flushParagraph()
      if (listBlock?.type !== 'ordered-list') {
        flushList()
        listBlock = { items: [], type: 'ordered-list' }
      }
      listBlock.items.push(orderedListMatch[1].trim())
      continue
    }

    const unorderedListMatch = line.match(/^[-*]\s+(.+)$/)
    if (unorderedListMatch) {
      flushParagraph()
      if (listBlock?.type !== 'unordered-list') {
        flushList()
        listBlock = { items: [], type: 'unordered-list' }
      }
      listBlock.items.push(unorderedListMatch[1].trim())
      continue
    }

    flushList()
    paragraphLines.push(line)
  }

  flushParagraph()
  flushList()

  return blocks
}

function renderBlock(block: MessageBlock, blockIndex: number) {
  if (block.type === 'heading') {
    return renderHeading(block, blockIndex)
  }

  if (block.type === 'ordered-list') {
    return (
      <ol className="list-decimal space-y-1 pl-5" key={`ordered-list-${blockIndex}`}>
        {block.items.map((item, itemIndex) => (
          <li key={`ordered-list-${blockIndex}-${itemIndex}`}>
            {renderInline(item, `ordered-list-${blockIndex}-${itemIndex}`)}
          </li>
        ))}
      </ol>
    )
  }

  if (block.type === 'unordered-list') {
    return (
      <ul className="list-disc space-y-1 pl-5" key={`unordered-list-${blockIndex}`}>
        {block.items.map((item, itemIndex) => (
          <li key={`unordered-list-${blockIndex}-${itemIndex}`}>
            {renderInline(item, `unordered-list-${blockIndex}-${itemIndex}`)}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <p key={`paragraph-${blockIndex}`}>
      {block.lines.flatMap((line, lineIndex) => {
        const renderedLine = renderInline(line, `paragraph-${blockIndex}-${lineIndex}`)
        return lineIndex === 0
          ? renderedLine
          : [<br key={`paragraph-${blockIndex}-${lineIndex}-break`} />, ...renderedLine]
      })}
    </p>
  )
}

function renderHeading(block: Extract<MessageBlock, { type: 'heading' }>, blockIndex: number) {
  const className = 'pt-1 text-sm font-semibold leading-snug text-text-strong first:pt-0'
  const children = renderInline(block.text, `heading-${blockIndex}`)

  if (block.depth <= 3) {
    return (
      <h3 className={className} key={`heading-${blockIndex}`}>
        {children}
      </h3>
    )
  }

  if (block.depth === 4) {
    return (
      <h4 className={className} key={`heading-${blockIndex}`}>
        {children}
      </h4>
    )
  }

  if (block.depth === 5) {
    return (
      <h5 className={className} key={`heading-${blockIndex}`}>
        {children}
      </h5>
    )
  }

  return (
    <h6 className={className} key={`heading-${blockIndex}`}>
      {children}
    </h6>
  )
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let cursor = 0

  for (const match of text.matchAll(INLINE_TOKEN_PATTERN)) {
    if (match.index === undefined) continue

    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index))
    }

    const boldText = match[2] ?? match[3]
    const codeText = match[4]
    const tokenKey = `${keyPrefix}-${match.index}`

    if (boldText) {
      nodes.push(<strong key={tokenKey}>{boldText}</strong>)
    } else if (codeText) {
      nodes.push(
        <code
          className="rounded bg-surface-base/80 px-1 py-0.5 font-mono text-[0.92em] text-text-strong"
          key={tokenKey}
        >
          {codeText}
        </code>,
      )
    } else {
      nodes.push(match[0])
    }

    cursor = match.index + match[0].length
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor))
  }

  return nodes
}
