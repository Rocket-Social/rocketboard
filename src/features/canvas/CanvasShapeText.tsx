import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import {EditorContent, useEditor, type Editor} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {Fragment, type CSSProperties, type ReactNode, useEffect} from 'react'

import {cn} from '../../lib/cn'
import {isAllowedRichTextLinkUrl, normalizeRichTextLinkUrl} from '../rich-text/link-url'
import {prepareContentForSave} from '../rich-text/prepare-content'
import {
  normalizeRichTextDocument,
  plainTextToRichTextDocument,
  type RichTextDocument,
} from '../rich-text/rich-text'
import {resolveCanvasShapeStyle, type CanvasElementStyle} from './canvas.types'

export type CanvasShapeEditorDraft = {
  content: string
  richText: RichTextDocument
}

export type CanvasShapeTextFocusTarget =
  | {
      mode: 'end'
    }
  | {
      clientX: number
      clientY: number
      mode: 'pointer'
    }

export type CanvasShapeTextFocusRequest = CanvasShapeTextFocusTarget & {
  requestKey: number
}

export function resolveCanvasShapeTextFocusPosition(
  editor: Pick<Editor, 'state' | 'view'>,
  focusRequest: CanvasShapeTextFocusRequest | null,
) {
  if (focusRequest?.mode === 'pointer') {
    if (editor.state.doc.textContent.trim().length === 0) {
      return 'end'
    }

    return editor.view.posAtCoords({
      left: focusRequest.clientX,
      top: focusRequest.clientY,
    })?.pos ?? 'end'
  }

  return 'end'
}

function applyMarks(content: ReactNode, marks: Array<{attrs?: Record<string, unknown>; type: string}> | undefined) {
  return (marks ?? []).reduceRight<ReactNode>((acc, mark, index) => {
    switch (mark.type) {
      case 'bold':
        return <strong key={`mark-${mark.type}-${index}`}>{acc}</strong>
      case 'italic':
        return <em key={`mark-${mark.type}-${index}`}>{acc}</em>
      case 'strike':
        return <s key={`mark-${mark.type}-${index}`}>{acc}</s>
      case 'code':
        return <code className='rounded bg-canvas-accent px-1 py-0.5 text-[0.92em]' key={`mark-${mark.type}-${index}`}>{acc}</code>
      case 'link': {
        const href = typeof mark.attrs?.href === 'string'
          ? normalizeRichTextLinkUrl(mark.attrs.href)
          : ''

        return href && isAllowedRichTextLinkUrl(href)
          ? (
            <a
              className='text-primary underline underline-offset-2'
              href={href}
              key={`mark-${mark.type}-${index}`}
              onClick={(event) => event.stopPropagation()}
              rel='noreferrer'
              target='_blank'
            >
              {acc}
            </a>
          )
          : acc
      }
      default:
        return acc
    }
  }, content)
}

function renderRichTextNode(node: RichTextDocument, keyPrefix: string): ReactNode {
  if (node.type === 'text') {
    return (
      <Fragment key={keyPrefix}>
        {applyMarks(node.text ?? '', node.marks as Array<{attrs?: Record<string, unknown>; type: string}> | undefined)}
      </Fragment>
    )
  }

  if (node.type === 'hardBreak') {
    return <br key={keyPrefix}/>
  }

  if (node.type === 'bulletList') {
    return (
      <ul className='list-disc pl-5' key={keyPrefix}>
        {(node.content ?? []).map((child, index) => renderRichTextNode(child as RichTextDocument, `${keyPrefix}-${index}`))}
      </ul>
    )
  }

  if (node.type === 'orderedList') {
    return (
      <ol className='list-decimal pl-5' key={keyPrefix}>
        {(node.content ?? []).map((child, index) => renderRichTextNode(child as RichTextDocument, `${keyPrefix}-${index}`))}
      </ol>
    )
  }

  if (node.type === 'listItem') {
    return (
      <li className='min-h-[1.5em]' key={keyPrefix}>
        {(node.content ?? []).map((child, index) => renderRichTextNode(child as RichTextDocument, `${keyPrefix}-${index}`))}
      </li>
    )
  }

  if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'doc') {
    const children = (node.content ?? []).map((child, index) => renderRichTextNode(child as RichTextDocument, `${keyPrefix}-${index}`))

    if (node.type === 'doc') {
      return <Fragment key={keyPrefix}>{children}</Fragment>
    }

    return (
      <p className='min-h-[1.5em] whitespace-pre-wrap break-words' key={keyPrefix}>
        {children.length > 0 ? children : <br/>}
      </p>
    )
  }

  return null
}

function richTextNodeHasContent(node: RichTextDocument | null | undefined): boolean {
  if (!node) {
    return false
  }

  if (node.type === 'text') {
    return Boolean(node.text && node.text.length > 0)
  }

  return (node.content ?? []).some((child) => richTextNodeHasContent(child as RichTextDocument))
}

export function resolveCanvasShapeRichTextDocument(style: CanvasElementStyle, fallbackText: string | null | undefined) {
  if (style.rich_text) {
    return normalizeRichTextDocument(style.rich_text, fallbackText ?? '')
  }

  return plainTextToRichTextDocument(fallbackText)
}

export function resolveCanvasShapeTextPresentation(style: CanvasElementStyle): {
  className: string
  style: CSSProperties
} {
  const resolvedStyle = resolveCanvasShapeStyle(style)
  const family = resolvedStyle.textFamily

  return {
    className: cn(
      family === 'technical' ? 'font-mono' : 'font-sans',
      'text-text-strong',
    ),
    style: {
      fontFamily: family === 'scribbled'
        ? '"Marker Felt", "Bradley Hand", "Comic Sans MS", cursive'
        : undefined,
      fontSize: `${resolvedStyle.textSize}px`,
      textAlign: resolvedStyle.textAlign,
    },
  }
}

export function CanvasShapeTextDisplay({
  content,
  placeholder = 'Add text',
  style,
}: {
  content: string | null
  placeholder?: string
  style: CanvasElementStyle
}) {
  const document = resolveCanvasShapeRichTextDocument(style, content)
  const textPresentation = resolveCanvasShapeTextPresentation(style)
  const hasContent = richTextNodeHasContent(document)

  if (!hasContent) {
    return (
      <div className='flex h-full items-center justify-center text-sm text-text-muted'>
        {placeholder}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col justify-center gap-1 overflow-hidden whitespace-pre-wrap break-words',
        textPresentation.className,
      )}
      style={textPresentation.style}
    >
      {renderRichTextNode(document, 'shape-text')}
    </div>
  )
}

export function CanvasShapeTextEditor({
  content,
  focusRequest,
  onChange,
  onEscape,
  onReady,
  style,
}: {
  content: string | null
  focusRequest: CanvasShapeTextFocusRequest | null
  onChange: (draft: CanvasShapeEditorDraft) => void
  onEscape: () => void
  onReady: (editor: Editor | null) => void
  style: CanvasElementStyle
}) {
  const textPresentation = resolveCanvasShapeTextPresentation(style)
  const initialContent = resolveCanvasShapeRichTextDocument(style, content)
  const editor = useEditor({
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'flex min-h-full flex-col justify-center outline-none [&_p]:my-0 [&_p]:min-h-[1.5em] [&_ul]:my-0 [&_ul]:pl-5 [&_li]:my-0',
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onEscape()
          return true
        }

        return false
      },
    },
    extensions: [
      StarterKit.configure({
        blockquote: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        orderedList: false,
      }),
      Link.configure({
        autolink: false,
        defaultProtocol: 'https',
        isAllowedUri: (url) => isAllowedRichTextLinkUrl(url),
        openOnClick: false,
      }),
      Placeholder.configure({
        placeholder: 'Add text',
      }),
    ],
    immediatelyRender: false,
    onUpdate: ({editor: nextEditor}) => {
      const richText = normalizeRichTextDocument(nextEditor.getJSON() as RichTextDocument)
      const preparedContent = prepareContentForSave(richText)
      onChange({
        content: preparedContent.contentMd,
        richText: preparedContent.contentJson,
      })
    },
  })

  useEffect(() => {
    onReady(editor)

    return () => {
      onReady(null)
    }
  }, [editor, onReady])

  useEffect(() => {
    if (!editor) {
      return
    }

    const focusPosition = resolveCanvasShapeTextFocusPosition(editor, focusRequest)
    const frameId = requestAnimationFrame(() => {
      if (!editor.isDestroyed) {
        editor.commands.focus(focusPosition, {scrollIntoView: false})
      }
    })

    return () => cancelAnimationFrame(frameId)
  }, [editor, focusRequest])

  return (
    <div
      className={cn('h-full w-full overflow-hidden', textPresentation.className)}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      style={textPresentation.style}
    >
      <EditorContent className='h-full w-full' editor={editor}/>
    </div>
  )
}
