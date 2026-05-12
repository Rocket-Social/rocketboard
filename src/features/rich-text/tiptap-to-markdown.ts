import type {JSONContent} from '@tiptap/core'

/**
 * Converts a Tiptap JSON document to GitHub-Flavored Markdown.
 * Used by the wiki and notes systems to generate the content_md column.
 */
export function tiptapJsonToMarkdown(doc: JSONContent | null | undefined): string {
  if (!doc || doc.type !== 'doc' || !doc.content) {
    return ''
  }

  return doc.content.map((node) => renderNode(node, 0)).join('\n\n')
}

function renderNode(node: JSONContent, depth: number): string {
  switch (node.type) {
    case 'paragraph':
      return renderInlineContent(node.content)

    case 'heading': {
      const level = node.attrs?.level ?? 1
      const prefix = '#'.repeat(Math.min(level, 6))
      return `${prefix} ${renderInlineContent(node.content)}`
    }

    case 'bulletList':
      return renderList(node.content, depth, 'bullet')

    case 'orderedList':
      return renderList(node.content, depth, 'ordered')

    case 'taskList':
      return renderList(node.content, depth, 'task')

    case 'listItem':
      return renderListItemContent(node.content, depth)

    case 'taskItem': {
      const checked = node.attrs?.checked ? 'x' : ' '
      const indent = '  '.repeat(depth)
      const content = renderListItemContent(node.content, depth)
      return `${indent}- [${checked}] ${content}`
    }

    case 'blockquote':
      return (node.content ?? [])
        .map((child) => renderNode(child, depth))
        .map((line) =>
          line
            .split('\n')
            .map((l) => `> ${l}`)
            .join('\n'),
        )
        .join('\n')

    case 'codeBlock': {
      const language = node.attrs?.language ?? ''
      const code = renderPlainTextContent(node.content)
      return `\`\`\`${language}\n${code}\n\`\`\``
    }

    case 'horizontalRule':
      return '---'

    case 'table':
      return renderTable(node)

    case 'hardBreak':
      return '\n'

    default:
      return renderInlineContent(node.content)
  }
}

function renderInlineContent(content: JSONContent[] | undefined): string {
  if (!content) return ''

  return content
    .map((node) => {
      if (node.type === 'text') {
        let text = node.text ?? ''
        const marks = node.marks ?? []

        for (const mark of marks) {
          switch (mark.type) {
            case 'bold':
              text = `**${text}**`
              break
            case 'italic':
              text = `*${text}*`
              break
            case 'strike':
              text = `~~${text}~~`
              break
            case 'code':
              text = `\`${text}\``
              break
            case 'link': {
              const href = (mark.attrs?.href ?? '') as string
              // Encode characters that break markdown link syntax
              const safeHref = href
                .replace(/ /g, '%20')
                .replace(/\(/g, '%28')
                .replace(/\)/g, '%29')
              text = `[${text}](${safeHref})`
              break
            }
          }
        }

        return text
      }

      if (node.type === 'hardBreak') {
        return '\n'
      }

      return renderInlineContent(node.content)
    })
    .join('')
}

function renderPlainTextContent(content: JSONContent[] | undefined): string {
  if (!content) return ''

  return content
    .map((node) => {
      if (node.type === 'text') return node.text ?? ''
      if (node.type === 'hardBreak') return '\n'
      return renderPlainTextContent(node.content)
    })
    .join('')
}

function renderList(
  items: JSONContent[] | undefined,
  depth: number,
  type: 'bullet' | 'ordered' | 'task',
): string {
  if (!items) return ''

  return items
    .map((item, index) => {
      if (item.type === 'taskItem') {
        return renderNode(item, depth)
      }

      const indent = '  '.repeat(depth)
      const prefix = type === 'ordered' ? `${index + 1}. ` : '- '
      const content = renderListItemContent(item.content, depth)
      return `${indent}${prefix}${content}`
    })
    .join('\n')
}

function renderListItemContent(content: JSONContent[] | undefined, depth: number): string {
  if (!content) return ''

  return content
    .map((child) => {
      if (child.type === 'paragraph') {
        return renderInlineContent(child.content)
      }

      if (child.type === 'bulletList' || child.type === 'orderedList' || child.type === 'taskList') {
        return '\n' + renderNode(child, depth + 1)
      }

      return renderNode(child, depth)
    })
    .join('\n')
}

function renderTable(node: JSONContent): string {
  const rows = node.content ?? []
  if (rows.length === 0) return ''

  const tableData: string[][] = []

  for (const row of rows) {
    const cells: string[] = []
    for (const cell of row.content ?? []) {
      cells.push(renderInlineContent(cell.content?.[0]?.content))
    }
    tableData.push(cells)
  }

  if (tableData.length === 0) return ''

  const colCount = Math.max(...tableData.map((row) => row.length))

  // Pad rows to have equal columns
  for (const row of tableData) {
    while (row.length < colCount) {
      row.push('')
    }
  }

  // Calculate column widths
  const colWidths = Array.from({length: colCount}, (_, i) =>
    Math.max(3, ...tableData.map((row) => (row[i] ?? '').length)),
  )

  const formatRow = (cells: string[]) =>
    '| ' + cells.map((cell, i) => cell.padEnd(colWidths[i])).join(' | ') + ' |'

  const headerRow = formatRow(tableData[0])
  const separatorRow = '| ' + colWidths.map((w) => '-'.repeat(w)).join(' | ') + ' |'
  const bodyRows = tableData.slice(1).map(formatRow)

  return [headerRow, separatorRow, ...bodyRows].join('\n')
}
