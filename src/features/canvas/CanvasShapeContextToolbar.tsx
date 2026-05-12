import {AlignCenter, AlignLeft, AlignRight, Bold, ChevronDown, Link2, List, Rows3, Strikethrough, Unlink, type LucideIcon} from 'lucide-react'
import {type Editor} from '@tiptap/react'
import {forwardRef, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode, useEffect, useMemo, useState} from 'react'

import {Input} from '../../components/ui/input'
import {Popover, PopoverContent, PopoverTrigger} from '../../components/ui/popover'
import {cn} from '../../lib/cn'
import {normalizeRichTextLinkUrl} from '../rich-text/link-url'
import {CanvasColorSwatchPalette, CanvasShapeGlyph, CanvasShapePickerGrid} from './CanvasShapeControls'
import {
  resolveCanvasShapeStyle,
  type CanvasElementStyle,
  type CanvasShapeStrokeStyle,
  type CanvasShapeTextAlign,
  type CanvasShapeTextFamily,
  type CanvasShapeType,
} from './canvas.types'
import {CANVAS_SHAPE_TEXT_SIZE_PRESETS} from './canvas.types'

type CanvasShapeContextToolbarProps = {
  editor: Editor | null
  editing: boolean
  left: number
  style: CanvasElementStyle
  top: number
  zIndex: number
  onFillColorChange: (color: string | null) => void
  onShapeTypeChange: (shapeType: CanvasShapeType) => void
  onStrokeColorChange: (color: string) => void
  onStrokeStyleChange: (strokeStyle: CanvasShapeStrokeStyle) => void
  onTextAlignChange: (textAlign: CanvasShapeTextAlign) => void
  onTextFamilyChange: (textFamily: CanvasShapeTextFamily) => void
  onTextSizeChange: (textSize: number) => void
}

function ToolbarSeparator() {
  return <div className='h-6 w-px bg-white/10'/>
}

const ToolbarButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean
  children: ReactNode
}>(({
  active = false,
  children,
  className,
  onMouseDown,
  type = 'button',
  ...props
}, ref) => {
  return (
    <button
      className={cn(
        'inline-flex h-10 min-w-10 items-center justify-center rounded-xl px-2 text-sm transition-colors',
        active
          ? 'bg-primary text-white'
          : 'text-text-inverse-muted hover:bg-sidebar-soft hover:text-text-inverse',
        props.disabled ? 'cursor-not-allowed opacity-50' : '',
        className,
      )}
      {...props}
      onMouseDown={(event) => {
        onMouseDown?.(event)
        event.preventDefault()
      }}
      ref={ref}
      type={type}
    >
      {children}
    </button>
  )
})

ToolbarButton.displayName = 'ToolbarButton'

function ToolbarIconButton({
  active = false,
  disabled = false,
  icon: Icon,
  onClick,
  title,
}: {
  active?: boolean
  disabled?: boolean
  icon: LucideIcon
  onClick?: () => void
  title: string
}) {
  return (
    <ToolbarButton active={active} disabled={disabled} onClick={onClick} title={title}>
      <Icon className='h-4 w-4'/>
    </ToolbarButton>
  )
}

function resolveTextFamilyLabel(textFamily: CanvasShapeTextFamily) {
  switch (textFamily) {
    case 'technical':
      return 'Technical'
    case 'scribbled':
      return 'Scribbled'
    default:
      return 'Standard'
  }
}

function resolveTextSizeLabel(textSize: number) {
  return CANVAS_SHAPE_TEXT_SIZE_PRESETS.find((preset) => preset.value === textSize)?.label ?? `${textSize}`
}

export function CanvasShapeContextToolbar({
  editor,
  editing,
  left,
  onFillColorChange,
  onShapeTypeChange,
  onStrokeColorChange,
  onStrokeStyleChange,
  onTextAlignChange,
  onTextFamilyChange,
  onTextSizeChange,
  style,
  top,
  zIndex,
}: CanvasShapeContextToolbarProps) {
  const [openMenu, setOpenMenu] = useState<'border' | 'fill' | 'font' | 'link' | 'shape' | 'size' | null>(null)
  const [editorVersion, setEditorVersion] = useState(0)
  const [linkValue, setLinkValue] = useState('')
  const resolvedShapeStyle = resolveCanvasShapeStyle(style)
  const [textSizeInput, setTextSizeInput] = useState(String(resolvedShapeStyle.textSize))
  const popoverZIndex = zIndex + 1

  const currentShapeType = resolvedShapeStyle.shapeType
  const currentFillColor = resolvedShapeStyle.fillColor
  const currentStrokeColor = resolvedShapeStyle.strokeColor
  const currentStrokeStyle = resolvedShapeStyle.strokeStyle
  const currentTextFamily = resolvedShapeStyle.textFamily
  const currentTextSize = resolvedShapeStyle.textSize
  const currentTextAlign = resolvedShapeStyle.textAlign

  useEffect(() => {
    setTextSizeInput(String(currentTextSize))
  }, [currentTextSize])

  useEffect(() => {
    if (!editor) {
      return
    }

    const handleEditorUpdate = () => setEditorVersion((current) => current + 1)
    editor.on('selectionUpdate', handleEditorUpdate)
    editor.on('transaction', handleEditorUpdate)

    return () => {
      editor.off('selectionUpdate', handleEditorUpdate)
      editor.off('transaction', handleEditorUpdate)
    }
  }, [editor])

  const editorState = useMemo(() => {
    if (!editor) {
      return {
        canEditLink: false,
        isBold: false,
        isBulletList: false,
        isLink: false,
        isStrike: false,
      }
    }

    return {
      canEditLink: true,
      isBold: editor.isActive('bold'),
      isBulletList: editor.isActive('bulletList'),
      isLink: editor.isActive('link'),
      isStrike: editor.isActive('strike'),
    }
  }, [editor, editorVersion])

  function applyLink() {
    if (!editor) {
      return
    }

    const trimmedLinkValue = linkValue.trim()

    if (!trimmedLinkValue) {
      setOpenMenu(null)
      return
    }

    const href = normalizeRichTextLinkUrl(trimmedLinkValue)

    if (!href) {
      return
    }

    const {empty, from} = editor.state.selection

    if (empty) {
      editor
        .chain()
        .focus()
        .insertContent(href)
        .setTextSelection({from, to: from + href.length})
        .setLink({href})
        .run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({href}).run()
    }

    setOpenMenu(null)
    setLinkValue('')
  }

  function handleLinkKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      applyLink()
    }

    if (event.key === 'Escape') {
      setOpenMenu(null)
    }
  }

  return (
    <div
      className='pointer-events-none absolute'
      data-testid='canvas-shape-context-toolbar'
      style={{
        left: `${left}px`,
        top: `${top}px`,
        transform: 'translate(-50%, calc(-100% - 16px))',
        zIndex,
      }}
    >
      <div className='pointer-events-auto flex items-center gap-1 rounded-[18px] bg-sidebar px-2 py-2 text-text-inverse shadow-float'>
        <Popover onOpenChange={(isOpen) => setOpenMenu(isOpen ? 'shape' : null)} open={openMenu === 'shape'}>
          <PopoverTrigger asChild>
            <ToolbarButton title='Change shape'>
              <CanvasShapeGlyph className='h-5 w-5' shapeType={currentShapeType} strokeColor='currentColor'/>
              <ChevronDown className='ml-1 h-3.5 w-3.5'/>
            </ToolbarButton>
          </PopoverTrigger>
          <PopoverContent align='center' className='border-white/10 bg-sidebar p-3 text-text-inverse' style={{zIndex: popoverZIndex}}>
            <CanvasShapePickerGrid
              onShapeTypeChange={(shapeType) => {
                onShapeTypeChange(shapeType)
                setOpenMenu(null)
              }}
              searchable
              selectedShapeType={currentShapeType}
            />
          </PopoverContent>
        </Popover>

        <Popover onOpenChange={(isOpen) => setOpenMenu(isOpen ? 'fill' : null)} open={openMenu === 'fill'}>
          <PopoverTrigger asChild>
            <ToolbarButton title='Fill color'>
              <span
                className='h-5 w-5 rounded-full border border-white/15'
                style={{backgroundColor: currentFillColor ?? 'transparent'}}
              />
              <ChevronDown className='ml-1 h-3.5 w-3.5'/>
            </ToolbarButton>
          </PopoverTrigger>
          <PopoverContent align='center' className='border-white/10 bg-sidebar p-3 text-text-inverse' style={{zIndex: popoverZIndex}}>
            <CanvasColorSwatchPalette
              allowNone
              onChange={(color) => {
                onFillColorChange(color)
                setOpenMenu(null)
              }}
              selectedColor={currentFillColor}
            />
          </PopoverContent>
        </Popover>

        <Popover onOpenChange={(isOpen) => setOpenMenu(isOpen ? 'border' : null)} open={openMenu === 'border'}>
          <PopoverTrigger asChild>
            <ToolbarButton title='Border style'>
              <Rows3 className='h-4 w-4'/>
              <ChevronDown className='ml-1 h-3.5 w-3.5'/>
            </ToolbarButton>
          </PopoverTrigger>
          <PopoverContent align='center' className='border-white/10 bg-sidebar p-3 text-text-inverse' style={{zIndex: popoverZIndex}}>
            <div className='space-y-3'>
              <div className='flex items-center gap-2'>
                {(['solid', 'dashed', 'none'] as const).map((strokeStyle) => (
                  <ToolbarButton
                    active={currentStrokeStyle === strokeStyle}
                    className='h-9 px-3'
                    key={strokeStyle}
                    onClick={() => onStrokeStyleChange(strokeStyle)}
                    title={strokeStyle}
                  >
                    {strokeStyle === 'solid' ? 'Solid' : strokeStyle === 'dashed' ? 'Dashed' : 'None'}
                  </ToolbarButton>
                ))}
              </div>

              <CanvasColorSwatchPalette
                onChange={(color) => {
                  if (!color) {
                    return
                  }

                  onStrokeColorChange(color)
                }}
                selectedColor={currentStrokeColor}
              />
            </div>
          </PopoverContent>
        </Popover>

        {editing ? (
          <>
            <ToolbarSeparator/>

            <Popover onOpenChange={(isOpen) => setOpenMenu(isOpen ? 'font' : null)} open={openMenu === 'font'}>
              <PopoverTrigger asChild>
                <ToolbarButton className='px-3 font-medium' title='Font preset'>
                  <span className={cn(
                    'text-base leading-none',
                    currentTextFamily === 'technical' ? 'font-mono text-sm' : currentTextFamily === 'scribbled' ? '' : 'font-sans',
                  )}
                  style={{
                    fontFamily: currentTextFamily === 'scribbled'
                      ? '"Marker Felt", "Bradley Hand", "Comic Sans MS", cursive'
                      : undefined,
                  }}
                  >
                    Aa
                  </span>
                  <ChevronDown className='ml-1 h-3.5 w-3.5'/>
                </ToolbarButton>
              </PopoverTrigger>
              <PopoverContent align='start' className='border-white/10 bg-sidebar p-2 text-text-inverse' style={{zIndex: popoverZIndex}}>
                <div className='space-y-1'>
                  {(['standard', 'technical', 'scribbled'] as const).map((textFamily) => (
                    <button
                      className={cn(
                        'flex w-full items-center rounded-xl px-3 py-2 text-left text-sm transition-colors',
                        currentTextFamily === textFamily
                          ? 'bg-sidebar-soft text-text-inverse'
                          : 'text-text-inverse-muted hover:bg-sidebar-soft hover:text-text-inverse',
                      )}
                      key={textFamily}
                      onClick={() => {
                        onTextFamilyChange(textFamily)
                        setOpenMenu(null)
                      }}
                      onMouseDown={(event) => event.preventDefault()}
                      style={{
                        fontFamily: textFamily === 'scribbled'
                          ? '"Marker Felt", "Bradley Hand", "Comic Sans MS", cursive'
                          : undefined,
                      }}
                      type='button'
                    >
                      {resolveTextFamilyLabel(textFamily)}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <Popover onOpenChange={(isOpen) => setOpenMenu(isOpen ? 'size' : null)} open={openMenu === 'size'}>
              <PopoverTrigger asChild>
                <ToolbarButton className='min-w-[92px] justify-between px-3' title='Text size'>
                  <span>{resolveTextSizeLabel(currentTextSize)}</span>
                  <ChevronDown className='ml-2 h-3.5 w-3.5'/>
                </ToolbarButton>
              </PopoverTrigger>
              <PopoverContent align='start' className='border-white/10 bg-sidebar p-2 text-text-inverse' style={{zIndex: popoverZIndex}}>
                <div className='space-y-1'>
                  {CANVAS_SHAPE_TEXT_SIZE_PRESETS.map((preset) => (
                    <button
                      className={cn(
                        'flex w-full items-center rounded-xl px-3 py-2 text-left text-sm transition-colors',
                        currentTextSize === preset.value
                          ? 'bg-sidebar-soft text-text-inverse'
                          : 'text-text-inverse-muted hover:bg-sidebar-soft hover:text-text-inverse',
                      )}
                      key={preset.value}
                      onClick={() => {
                        onTextSizeChange(preset.value)
                        setOpenMenu(null)
                      }}
                      onMouseDown={(event) => event.preventDefault()}
                      type='button'
                    >
                      {preset.label}
                    </button>
                  ))}

                  <div className='pt-2'>
                    <Input
                      className='h-10 rounded-xl border-white/10 bg-sidebar-soft text-text-inverse focus:border-primary'
                      onChange={(event) => setTextSizeInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') {
                          return
                        }

                        const nextValue = Number(textSizeInput)

                        if (!Number.isFinite(nextValue) || nextValue < 10) {
                          return
                        }

                        onTextSizeChange(nextValue)
                        setOpenMenu(null)
                      }}
                      placeholder='16'
                      value={textSizeInput}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <ToolbarIconButton
              active={editorState.isBold}
              disabled={!editor}
              icon={Bold}
              onClick={() => editor?.chain().focus().toggleBold().run()}
              title='Bold'
            />

            <ToolbarIconButton
              active={editorState.isStrike}
              disabled={!editor}
              icon={Strikethrough}
              onClick={() => editor?.chain().focus().toggleStrike().run()}
              title='Strikethrough'
            />

            <Popover onOpenChange={(isOpen) => {
              setOpenMenu(isOpen ? 'link' : null)
              if (!isOpen) {
                setLinkValue('')
              }
            }} open={openMenu === 'link'}>
              <PopoverTrigger asChild>
                <ToolbarButton
                  active={editorState.isLink}
                  disabled={!editor || !editorState.canEditLink}
                  onClick={() => {
                    if (editorState.isLink) {
                      editor?.chain().focus().unsetLink().run()
                      setOpenMenu(null)
                      return
                    }

                    setLinkValue(typeof editor?.getAttributes('link').href === 'string' ? editor.getAttributes('link').href : '')
                    setOpenMenu('link')
                  }}
                  title={editorState.isLink ? 'Remove link' : 'Create link'}
                >
                  {editorState.isLink ? <Unlink className='h-4 w-4'/> : <Link2 className='h-4 w-4'/>}
                </ToolbarButton>
              </PopoverTrigger>
              <PopoverContent align='center' className='border-white/10 bg-sidebar p-2 text-text-inverse' style={{zIndex: popoverZIndex}}>
                <Input
                  className='h-10 w-[240px] rounded-xl border-white/10 bg-sidebar-soft text-text-inverse focus:border-primary'
                  onChange={(event) => setLinkValue(event.target.value)}
                  onKeyDown={handleLinkKeyDown}
                  placeholder='Type or paste URL'
                  value={linkValue}
                />
              </PopoverContent>
            </Popover>

            <ToolbarIconButton
              active={editorState.isBulletList}
              disabled={!editor}
              icon={List}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              title='Bullet list'
            />

            <ToolbarSeparator/>

            <div className='flex items-center gap-1 rounded-xl bg-sidebar-soft p-1'>
              {[
                {icon: AlignLeft, value: 'left'},
                {icon: AlignCenter, value: 'center'},
                {icon: AlignRight, value: 'right'},
              ].map((item) => (
                <ToolbarIconButton
                  active={currentTextAlign === item.value}
                  icon={item.icon}
                  key={item.value}
                  onClick={() => onTextAlignChange(item.value as CanvasShapeTextAlign)}
                  title={`${item.value} align`}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
