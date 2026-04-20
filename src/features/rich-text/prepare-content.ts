import type {RichTextDocument} from './rich-text'
import {tiptapJsonToMarkdown} from './tiptap-to-markdown'

export function prepareContentForSave(json: RichTextDocument): {
  contentJson: RichTextDocument
  contentMd: string
} {
  return {
    contentJson: json,
    contentMd: tiptapJsonToMarkdown(json),
  }
}

export function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/\*(.+?)\*/g, '$1') // italic
    .replace(/~~(.+?)~~/g, '$1') // strikethrough
    .replace(/`(.+?)`/g, '$1') // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/^>\s+/gm, '') // blockquotes
    .replace(/^[-*+]\s+/gm, '') // unordered list markers
    .replace(/^\d+\.\s+/gm, '') // ordered list markers
    .replace(/^- \[[ x]\]\s+/gm, '') // task list markers
    .replace(/^\|.*\|$/gm, (line) => // table rows
      line
        .replace(/\|/g, ' ')
        .replace(/[-:]+/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .replace(/^```\w*$/gm, '') // code fences
    .trim()
}
