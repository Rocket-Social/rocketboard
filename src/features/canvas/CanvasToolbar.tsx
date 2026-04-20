import {Hand, MessageSquare, MousePointer2, PenLine, Square, StickyNote} from 'lucide-react'
import {useMemo, useState} from 'react'

import {cn} from '../../lib/cn'
import {
  CANVAS_DRAWING_COLORS,
  CANVAS_NOTE_COLORS,
  type CanvasShapeType,
  type CanvasToolMode,
} from './canvas.types'

type CanvasToolbarProps = {
  activeTool: CanvasToolMode
  canEdit: boolean
  noteColor: string
  onNoteColorChange: (color: string) => void
  onPenColorChange: (color: string) => void
  onPenWidthChange: (width: number) => void
  onSelectTool: (tool: CanvasToolMode) => void
  onShapeFillColorChange: (color: string) => void
  onShapeTypeChange: (shapeType: CanvasShapeType) => void
  penColor: string
  penWidth: number
  shapeFillColor: string
  shapeType: CanvasShapeType
}

const PEN_WIDTHS = [2, 3, 5]

type CanvasToolDefinition = {
  icon: typeof MousePointer2
  key: CanvasToolMode
  shortcut: string
  title: string
}

const toolDefinitions: CanvasToolDefinition[] = [
  {icon: MousePointer2, key: 'select', shortcut: 'V', title: 'Select'},
  {icon: Hand, key: 'hand', shortcut: 'H', title: 'Hand'},
  {icon: StickyNote, key: 'note', shortcut: 'N', title: 'Note'},
  {icon: Square, key: 'shape', shortcut: 'S', title: 'Shape'},
  {icon: PenLine, key: 'pen', shortcut: 'P', title: 'Pen'},
  {icon: MessageSquare, key: 'comment', shortcut: 'C', title: 'Comment'},
]

export function CanvasToolbar({
  activeTool,
  canEdit,
  noteColor,
  onNoteColorChange,
  onPenColorChange,
  onPenWidthChange,
  onSelectTool,
  onShapeFillColorChange,
  onShapeTypeChange,
  penColor,
  penWidth,
  shapeFillColor,
  shapeType,
}: CanvasToolbarProps) {
  const [openMenu, setOpenMenu] = useState<'note' | 'pen' | 'shape' | null>(null)

  const activeToolLabel = useMemo(
    () => toolDefinitions.find((tool) => tool.key === activeTool)?.title ?? 'Select',
    [activeTool],
  )

  if (!canEdit) {
    return null
  }

  return (
    <div className='pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-4'>
      <div className='relative'>
        {openMenu ? (
          <div className='pointer-events-auto absolute bottom-[calc(100%+12px)] left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-transparent bg-sidebar px-4 py-3 text-text-inverse shadow-panel'>
            {openMenu === 'note' ? (
              <div className='flex items-center gap-2'>
                {CANVAS_NOTE_COLORS.map((color) => (
                  <button
                    aria-label={`Select note color ${color}`}
                    className={cn(
                      'h-8 w-8 rounded-full border transition-transform hover:scale-105',
                      noteColor === color ? 'border-white' : 'border-white/20',
                    )}
                    key={color}
                    onClick={() => onNoteColorChange(color)}
                    style={{backgroundColor: color}}
                    type='button'
                  />
                ))}
              </div>
            ) : null}

            {openMenu === 'shape' ? (
              <>
                <div className='flex items-center gap-2'>
                  {(['rectangle', 'circle'] as const).map((nextShapeType) => (
                    <button
                      className={cn(
                        'rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                        shapeType === nextShapeType
                          ? 'bg-primary text-text-inverse'
                          : 'bg-sidebar-soft text-text-inverse-muted hover:text-text-inverse',
                      )}
                      key={nextShapeType}
                      onClick={() => onShapeTypeChange(nextShapeType)}
                      type='button'
                    >
                      {nextShapeType === 'rectangle' ? 'Rectangle' : 'Circle'}
                    </button>
                  ))}
                </div>
                <div className='h-6 w-px bg-white/10'/>
                <div className='flex items-center gap-2'>
                  {CANVAS_NOTE_COLORS.map((color) => (
                    <button
                      aria-label={`Select shape fill color ${color}`}
                      className={cn(
                        'h-8 w-8 rounded-full border transition-transform hover:scale-105',
                        shapeFillColor === color ? 'border-white' : 'border-white/20',
                      )}
                      key={color}
                      onClick={() => onShapeFillColorChange(color)}
                      style={{backgroundColor: color}}
                      type='button'
                    />
                  ))}
                </div>
              </>
            ) : null}

            {openMenu === 'pen' ? (
              <>
                <div className='flex items-center gap-2'>
                  {CANVAS_DRAWING_COLORS.map((color) => (
                    <button
                      aria-label={`Select pen color ${color}`}
                      className={cn(
                        'h-8 w-8 rounded-full border transition-transform hover:scale-105',
                        penColor === color ? 'border-white' : 'border-white/20',
                      )}
                      key={color}
                      onClick={() => onPenColorChange(color)}
                      style={{backgroundColor: color}}
                      type='button'
                    />
                  ))}
                </div>
                <div className='h-6 w-px bg-white/10'/>
                <div className='flex items-center gap-2'>
                  {PEN_WIDTHS.map((width) => (
                    <button
                      className={cn(
                        'inline-flex h-8 min-w-8 items-center justify-center rounded-xl px-2 text-sm font-medium transition-colors',
                        penWidth === width
                          ? 'bg-primary text-text-inverse'
                          : 'bg-sidebar-soft text-text-inverse-muted hover:text-text-inverse',
                      )}
                      key={width}
                      onClick={() => onPenWidthChange(width)}
                      type='button'
                    >
                      {width}px
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        <div
          aria-label='Canvas toolbar'
          className='pointer-events-auto flex items-center gap-1 rounded-[16px] bg-sidebar px-2 py-2 text-text-inverse shadow-panel'
          role='toolbar'
        >
          {toolDefinitions.map((tool, index) => {
            const Icon = tool.icon
            const isActive = activeTool === tool.key

            return (
              <div className='flex items-center gap-1' key={tool.key}>
                <button
                  aria-label={`${tool.title} tool (${tool.shortcut})`}
                  className={cn(
                    'inline-flex h-11 w-11 items-center justify-center rounded-[12px] transition-colors',
                    isActive
                      ? 'bg-primary text-text-inverse'
                      : 'text-text-inverse-muted hover:bg-sidebar-soft hover:text-text-inverse',
                  )}
                  onClick={() => {
                    onSelectTool(tool.key)

                    if (tool.key === 'note' || tool.key === 'shape' || tool.key === 'pen') {
                      const nextMenu = tool.key
                      setOpenMenu((current) =>
                        current === nextMenu
                          ? null
                          : nextMenu,
                      )
                      return
                    }

                    setOpenMenu(null)
                  }}
                  title={`${tool.title} (${tool.shortcut})`}
                  type='button'
                >
                  <Icon className='h-5 w-5'/>
                </button>
                {index < toolDefinitions.length - 1 ? (
                  <div className='h-6 w-px bg-white/10'/>
                ) : null}
              </div>
            )
          })}
        </div>

        <div aria-live='polite' className='sr-only'>
          Active canvas tool: {activeToolLabel}
        </div>
      </div>
    </div>
  )
}
