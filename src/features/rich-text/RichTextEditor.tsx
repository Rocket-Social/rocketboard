import {type Editor, EditorContent, useEditor} from '@tiptap/react'
import {BubbleMenu} from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import {Table} from '@tiptap/extension-table'
import {TableCell} from '@tiptap/extension-table-cell'
import {TableHeader} from '@tiptap/extension-table-header'
import {TableRow} from '@tiptap/extension-table-row'
import {
  Bold,
  ChevronDown,
  Check,
  ExternalLink,
  Italic,
  Link2,
  Unlink,
  List,
  ListChecks,
  ListOrdered,
  Pencil,
  Strikethrough,
  Table as TableIcon,
  Type,
  X,
} from 'lucide-react'
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'

import {Button} from '../../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import {
  cloneRichTextDocument,
  normalizeRichTextDocument,
  stringifyRichTextDocument,
  type RichTextDocument,
} from './rich-text'
import {isAllowedRichTextLinkUrl, normalizeRichTextLinkUrl} from './link-url'

type ToolbarButtonProps = {
  active: boolean
  disabled?: boolean
  icon: typeof Bold
  label: string
  onClick: () => void
}

type RichTextEditorProps = {
  editable?: boolean
  focusRequestKey?: number
  minHeightClassName?: string
  onChange?: (value: RichTextDocument) => void
  placeholder?: string
  value: RichTextDocument
}

function ToolbarButton({
  active,
  disabled = false,
  icon: Icon,
  label,
  onClick,
}: ToolbarButtonProps) {
  return (
    <Button
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      size='compact'
      tabIndex={-1}
      title={label}
      variant={active ? 'primary' : 'secondary'}
    >
      <Icon className='h-4 w-4' />
    </Button>
  )
}

function HeadingDropdown({editor, editable}: {editor: Editor | null; editable: boolean}) {
  const currentLevel = editor?.isActive('heading', {level: 1}) ? 'H1'
    : editor?.isActive('heading', {level: 2}) ? 'H2'
    : editor?.isActive('heading', {level: 3}) ? 'H3'
    : editor?.isActive('heading', {level: 4}) ? 'H4'
    : 'Normal'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={!editor || !editable} size='compact' tabIndex={-1} variant='secondary'>
          <Type className='h-4 w-4'/>
          {currentLevel}
          <ChevronDown className='h-3 w-3'/>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start'>
        <DropdownMenuItem onClick={() => editor?.chain().focus().setParagraph().run()}>
          <span className='text-sm'>Normal text</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => editor?.chain().focus().toggleHeading({level: 1}).run()}>
          <span className='text-2xl font-bold'>Heading 1</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => editor?.chain().focus().toggleHeading({level: 2}).run()}>
          <span className='text-xl font-bold'>Heading 2</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => editor?.chain().focus().toggleHeading({level: 3}).run()}>
          <span className='text-lg font-semibold'>Heading 3</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => editor?.chain().focus().toggleHeading({level: 4}).run()}>
          <span className='text-base font-semibold'>Heading 4</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function RichTextToolbar({editor, editable, onLinkButtonClick}: {editor: Editor | null; editable: boolean; onLinkButtonClick?: () => void}) {
  return (
    <div className='flex flex-wrap items-center gap-1 border-b border-border-subtle px-3 py-2' onMouseDown={(e) => e.preventDefault()}>
      {/* Heading dropdown */}
      <HeadingDropdown editor={editor} editable={editable}/>

      <div className='h-6 w-px bg-border-subtle'/>

      {/* Text formatting */}
      <ToolbarButton
        active={Boolean(editor?.isActive('bold'))}
        disabled={!editor || !editable}
        icon={Bold}
        label='Bold'
        onClick={() => editor?.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        active={Boolean(editor?.isActive('italic'))}
        disabled={!editor || !editable}
        icon={Italic}
        label='Italic'
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        active={Boolean(editor?.isActive('strike'))}
        disabled={!editor || !editable}
        icon={Strikethrough}
        label='Strike'
        onClick={() => editor?.chain().focus().toggleStrike().run()}
      />
      <ToolbarButton
        active={Boolean(editor?.isActive('link'))}
        disabled={!editor || !editable}
        icon={Link2}
        label='Insert link'
        onClick={() => {
          if (!editor) return
          if (editor.isActive('link')) {
            editor.chain().focus().unsetLink().run()
          } else {
            onLinkButtonClick?.()
          }
        }}
      />

      <div className='h-6 w-px bg-border-subtle'/>

      {/* Lists */}
      <ToolbarButton
        active={Boolean(editor?.isActive('bulletList'))}
        disabled={!editor || !editable}
        icon={List}
        label='Bullets'
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        active={Boolean(editor?.isActive('orderedList'))}
        disabled={!editor || !editable}
        icon={ListOrdered}
        label='Numbered'
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        active={Boolean(editor?.isActive('taskList'))}
        disabled={!editor || !editable}
        icon={ListChecks}
        label='Checklist'
        onClick={() => editor?.chain().focus().toggleTaskList().run()}
      />

      <div className='h-6 w-px bg-border-subtle'/>

      {/* Table */}
      <Button
        disabled={!editor || !editable}
        onClick={() => editor?.chain().focus().insertTable({rows: 3, cols: 3, withHeaderRow: true}).run()}
        size='compact'
        tabIndex={-1}
        title='Table'
        variant='secondary'
      >
        <TableIcon className='h-4 w-4'/>
      </Button>
    </div>
  )
}

function truncateUrl(url: string, max = 40): string {
  if (url.length <= max) return url
  return url.slice(0, max) + '...'
}

function LinkCreationBubble({editor, isOpen, onClose}: {editor: Editor; isOpen: boolean; onClose: () => void}) {
  const [url, setUrl] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const savedSelectionRef = useRef<{from: number; to: number} | null>(null)
  const [position, setPosition] = useState<{top: number; left: number} | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      // Save current selection before input steals focus
      const {from, to} = editor.state.selection
      savedSelectionRef.current = {from, to}
      setUrl('')

      // Calculate position once from the selection coordinates
      try {
        const coords = editor.view.coordsAtPos(from)
        const editorRect = editor.view.dom.closest('.rich-text-editor')?.getBoundingClientRect()
          ?? editor.view.dom.getBoundingClientRect()
        setPosition({
          top: coords.bottom - editorRect.top + 4,
          left: Math.max(0, coords.left - editorRect.left),
        })
      } catch {
        // Fallback: position at top-left of editor
        setPosition({top: 40, left: 0})
      }

      // Focus input after render
      setTimeout(() => inputRef.current?.focus(), 0)
    } else {
      setPosition(null)
    }
  }, [isOpen, editor])

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose])

  const applyLink = useCallback(() => {
    if (!savedSelectionRef.current) return

    const href = normalizeRichTextLinkUrl(url)

    if (!href) return

    const {from, to} = savedSelectionRef.current
    editor
      .chain()
      .focus()
      .setTextSelection({from, to})
      .setLink({href})
      .run()

    onClose()
  }, [url, editor, onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      applyLink()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }, [applyLink, onClose])

  if (!isOpen || !position) return null

  return (
    <div
      ref={containerRef}
      className='absolute z-50'
      style={{top: position.top, left: position.left}}
    >
      <div
        className='flex items-center gap-1 rounded-2xl border border-border-subtle bg-surface-elevated p-2 shadow-float'
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className='min-w-[16rem] rounded-lg border border-border-subtle bg-surface-base px-2 py-1 text-sm text-text-strong outline-none placeholder:text-text-muted focus:border-accent-primary sm:min-w-[20rem]'
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='Paste or type a URL...'
          type='text'
          value={url}
        />
        <Button
          disabled={!url.trim()}
          onClick={applyLink}
          size='compact'
          tabIndex={-1}
          title='Apply link'
          variant='primary'
        >
          <Check className='h-4 w-4' />
        </Button>
      </div>
    </div>
  )
}

function LinkHoverBubble({editor, isLinkInputOpen}: {editor: Editor; isLinkInputOpen: boolean}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editUrl, setEditUrl] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  // Reset edit mode when the bubble hides
  const linkAttrs = editor.isActive('link') ? editor.getAttributes('link') : null
  const href = (linkAttrs?.href as string) ?? ''

  useEffect(() => {
    if (!editor.isActive('link')) {
      setIsEditing(false)
    }
  }, [editor.state.selection, editor])

  const startEditing = useCallback(() => {
    setEditUrl(href)
    setIsEditing(true)
    setTimeout(() => editInputRef.current?.focus(), 0)
  }, [href])

  const applyEdit = useCallback(() => {
    const href = normalizeRichTextLinkUrl(editUrl)

    if (!href) return

    editor.chain().focus().extendMarkRange('link').setLink({href}).run()
    setIsEditing(false)
  }, [editUrl, editor])

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      applyEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setIsEditing(false)
    }
  }, [applyEdit])

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({editor: e}: {editor: Editor}) => e.isActive('link') && !isLinkInputOpen}
      options={{placement: 'bottom-start'}}
    >
      <div
        className='flex items-center gap-1 rounded-2xl border border-border-subtle bg-surface-elevated p-2 shadow-float'
        onMouseDown={(e) => e.stopPropagation()}
      >
        {isEditing ? (
          <>
            <input
              ref={editInputRef}
              className='min-w-[16rem] rounded-lg border border-border-subtle bg-surface-base px-2 py-1 text-sm text-text-strong outline-none placeholder:text-text-muted focus:border-accent-primary sm:min-w-[20rem]'
              onChange={(e) => setEditUrl(e.target.value)}
              onKeyDown={handleEditKeyDown}
              placeholder='Edit URL...'
              type='text'
              value={editUrl}
            />
            <Button onClick={applyEdit} size='compact' tabIndex={-1} title='Apply' variant='primary'>
              <Check className='h-4 w-4' />
            </Button>
            <Button onClick={() => setIsEditing(false)} size='compact' tabIndex={-1} title='Cancel' variant='secondary'>
              <X className='h-4 w-4' />
            </Button>
          </>
        ) : (
          <>
            <span className='max-w-[16rem] truncate px-1 text-xs text-text-muted sm:max-w-[20rem]' title={href}>
              {truncateUrl(href)}
            </span>
            <Button onClick={startEditing} size='compact' tabIndex={-1} title='Edit link' variant='secondary'>
              <Pencil className='h-3.5 w-3.5' />
            </Button>
            <Button
              onClick={() => editor.chain().focus().unsetLink().run()}
              size='compact'
              tabIndex={-1}
              title='Remove link'
              variant='secondary'
            >
              <Unlink className='h-3.5 w-3.5' />
            </Button>
            <Button
              onClick={() => {
                const normalizedHref = normalizeRichTextLinkUrl(href)

                if (!normalizedHref) {
                  return
                }

                window.open(normalizedHref, '_blank', 'noopener,noreferrer')
              }}
              size='compact'
              tabIndex={-1}
              title='Open link'
              variant='secondary'
            >
              <ExternalLink className='h-3.5 w-3.5' />
            </Button>
          </>
        )}
      </div>
    </BubbleMenu>
  )
}

export function RichTextEditor({
  editable = true,
  focusRequestKey,
  minHeightClassName = 'min-h-[14rem]',
  onChange,
  placeholder,
  value,
}: RichTextEditorProps) {
  const normalizedValue = useMemo(() => normalizeRichTextDocument(value), [value])
  const serializedValue = useMemo(() => stringifyRichTextDocument(normalizedValue), [normalizedValue])
  const [isLinkInputOpen, setIsLinkInputOpen] = useState(false)
  const previousFocusRequestKeyRef = useRef(focusRequestKey)

  const editor = useEditor({
    content: normalizedValue,
    editable,
    extensions: [
      StarterKit.configure({
        undoRedo: false,
      }),
      Link.configure({
        autolink: true,
        defaultProtocol: 'https',
        isAllowedUri: (url) => isAllowedRichTextLinkUrl(url),
        openOnClick: false,
        linkOnPaste: true,
        HTMLAttributes: {
          rel: 'noopener noreferrer nofollow',
          target: '_blank',
        },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? '',
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    immediatelyRender: false,
    onUpdate: ({editor: activeEditor}) => {
      onChange?.(cloneRichTextDocument(activeEditor.getJSON()))
    },
  })

  useEffect(() => {
    if (!editor) {
      return
    }

    // Skip sync-back when the editor already has this content.
    // Uses stableStringify (sorted keys) so PostgreSQL JSONB key reordering
    // doesn't cause false mismatches that trigger unwanted setContent calls.
    if (stringifyRichTextDocument(editor.getJSON()) === serializedValue) {
      return
    }

    editor.commands.setContent(normalizedValue, {emitUpdate: false})
  }, [editor, normalizedValue, serializedValue])

  useEffect(() => {
    if (!editor || !editable || focusRequestKey == null) {
      return
    }

    if (previousFocusRequestKeyRef.current === focusRequestKey) {
      return
    }

    previousFocusRequestKeyRef.current = focusRequestKey
    editor.chain().focus('start').run()
  }, [editable, editor, focusRequestKey])

  const handleLinkButtonClick = useCallback(() => {
    if (!editor) return

    // If no text is selected, expand selection to the word under cursor
    const {from, to} = editor.state.selection
    if (from === to) {
      const $pos = editor.state.doc.resolve(from)
      const start = $pos.start()
      const text = $pos.parent.textContent
      const offset = from - start

      // Find word boundaries around cursor
      let wordStart = offset
      let wordEnd = offset
      while (wordStart > 0 && /\w/.test(text[wordStart - 1])) wordStart--
      while (wordEnd < text.length && /\w/.test(text[wordEnd])) wordEnd++

      if (wordStart !== wordEnd) {
        editor.chain().focus().setTextSelection({from: start + wordStart, to: start + wordEnd}).run()
      }
    }

    setIsLinkInputOpen(true)
  }, [editor])

  const closeLinkInput = useCallback(() => {
    setIsLinkInputOpen(false)
    editor?.chain().focus().run()
  }, [editor])

  return (
    <div className='overflow-hidden rounded-2xl border border-border-subtle bg-surface-base'>
      {editable && <RichTextToolbar editable={editable} editor={editor} onLinkButtonClick={handleLinkButtonClick} />}
      <div
        className={`relative flex flex-col px-4 py-3 text-sm text-text-strong ${minHeightClassName}`}
        onClick={(e) => {
          // Focus editor when clicking empty area outside the ProseMirror element
          if (editable && editor && !(e.target as HTMLElement).closest('.ProseMirror')) {
            editor.chain().focus('end').run()
          }
        }}
      >
        <EditorContent
          editor={editor}
          className='rich-text-editor flex-1 [&_.tiptap]:h-full [&_.ProseMirror]:min-h-full [&_.ProseMirror]:outline-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0 [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-text-muted [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_p]:leading-7 [&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:leading-tight [&_.ProseMirror_h1]:mb-2 [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-bold [&_.ProseMirror_h2]:leading-tight [&_.ProseMirror_h2]:mb-2 [&_.ProseMirror_h3]:text-lg [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:mb-1 [&_.ProseMirror_h4]:text-base [&_.ProseMirror_h4]:font-semibold [&_.ProseMirror_h4]:mb-1 [&_.ProseMirror_s]:line-through [&_.ProseMirror_a]:text-accent-primary [&_.ProseMirror_a]:underline [&_.ProseMirror_a]:cursor-pointer [&_.ProseMirror_ul[data-type="taskList"]]:list-none [&_.ProseMirror_ul[data-type="taskList"]]:pl-0 [&_.ProseMirror_ul[data-type="taskList"]_li]:flex [&_.ProseMirror_ul[data-type="taskList"]_li]:gap-2 [&_.ProseMirror_ul[data-type="taskList"]_li]:items-start [&_.ProseMirror_ul[data-type="taskList"]_li_label]:mt-1 [&_.ProseMirror_table]:border-collapse [&_.ProseMirror_table]:w-full [&_.ProseMirror_table]:mb-3 [&_.ProseMirror_td]:border [&_.ProseMirror_td]:border-border-subtle [&_.ProseMirror_td]:p-2 [&_.ProseMirror_td]:text-sm [&_.ProseMirror_th]:border [&_.ProseMirror_th]:border-border-subtle [&_.ProseMirror_th]:p-2 [&_.ProseMirror_th]:text-sm [&_.ProseMirror_th]:font-semibold [&_.ProseMirror_th]:bg-surface-muted'
        />
        {editor && editable ? (
          <>
            <LinkCreationBubble editor={editor} isOpen={isLinkInputOpen} onClose={closeLinkInput} />
            <LinkHoverBubble editor={editor} isLinkInputOpen={isLinkInputOpen} />
          </>
        ) : null}
      </div>
    </div>
  )
}
