import {Check, ChevronLeft, Circle, Pencil, Plus, Trash2} from 'lucide-react'
import {useEffect, useLayoutEffect, useRef, useState, type CSSProperties} from 'react'
import {createPortal} from 'react-dom'

type MenuOption = {
  id: string
  label: string
  style?: CSSProperties
}

type EditMenuOption = MenuOption & {
  canDelete?: boolean
  colorKey?: string | null
  deleteDisabledReason?: string
  isCompleted?: boolean
}

type CategoryGroup = {
  key: string
  label: string
  onAdd?: () => void
}

type EditMenuConfig = {
  categories?: CategoryGroup[]
  colorPalette?: Array<{key: string; color: string}>
  description?: string
  onAdd?: () => void
  onColorChange?: (optionId: string, colorKey: string | null) => void
  onDelete?: (optionId: string) => void
  onRename: (optionId: string, label: string) => void
  onSetCompleted?: (optionId: string) => void
  options: (EditMenuOption & {category?: string})[]
  title: string
}

type ClearOption = {
  id: null
  label: string
}

type PropertySelectMenuProps = {
  clearOption?: ClearOption
  editMenu?: EditMenuConfig
  options: MenuOption[]
  selectedId: string | null
  selectorWidth?: number
  trigger: React.ReactNode
  onSelect: (optionId: string | null) => void
}

type ViewMode = 'edit' | 'selector'

function ColorPickerPopover({
  colors,
  onSelect,
  selectedKey,
}: {
  colors: Array<{key: string; color: string}>
  onSelect: (key: string | null) => void
  selectedKey: string | null
}) {
  return (
    <div className='grid grid-cols-7 gap-1 rounded-xl border border-border-subtle bg-surface-elevated p-2 shadow-float'>
      {colors.map(({key, color}) => (
        <button
          className='flex h-6 w-6 items-center justify-center rounded-md transition-transform hover:scale-110'
          key={key}
          onClick={(e) => { e.stopPropagation(); onSelect(key) }}
          style={{backgroundColor: color}}
          title={key}
          type='button'
        >
          {selectedKey === key ? <Check className='h-3 w-3 text-white'/> : null}
        </button>
      ))}
    </div>
  )
}

function EditableRow({
  colorPalette,
  onColorChange,
  option,
  onDelete,
  onRename,
  onSetCompleted,
}: {
  colorPalette?: Array<{key: string; color: string}>
  onColorChange?: (optionId: string, colorKey: string | null) => void
  option: EditMenuOption
  onDelete?: (optionId: string) => void
  onRename: (optionId: string, label: string) => void
  onSetCompleted?: (optionId: string) => void
}) {
  const [draft, setDraft] = useState(option.label)
  const [editing, setEditing] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const colorRef = useRef<HTMLButtonElement>(null)
  const colorPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDraft(option.label)
  }, [option.label])

  useEffect(() => {
    if (!editing) {
      return
    }

    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  // Close color picker on outside click
  useEffect(() => {
    if (!showColorPicker) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        colorPickerRef.current && !colorPickerRef.current.contains(target)
        && colorRef.current && !colorRef.current.contains(target)
      ) {
        setShowColorPicker(false)
      }
    }

    const tid = setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0)
    return () => { clearTimeout(tid); document.removeEventListener('mousedown', handleClickOutside) }
  }, [showColorPicker])

  const commit = () => {
    setEditing(false)
    const normalizedValue = draft.trim()
    if (!normalizedValue || normalizedValue === option.label) {
      setDraft(option.label)
      return
    }

    onRename(option.id, normalizedValue)
  }

  return (
    <div className='relative flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-canvas-accent'>
      {colorPalette && onColorChange ? (
        <>
          <button
            className='flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border-subtle transition-transform hover:scale-110'
            onClick={(e) => { e.stopPropagation(); setShowColorPicker(!showColorPicker) }}
            ref={colorRef}
            style={option.style ? {backgroundColor: option.style.color as string} : undefined}
            title='Change color'
            type='button'
          />
          {showColorPicker ? (
            <div className='absolute left-0 top-full z-50 mt-1' ref={colorPickerRef}>
              <ColorPickerPopover
                colors={colorPalette}
                onSelect={(key) => {
                  onColorChange(option.id, key)
                  setShowColorPicker(false)
                }}
                selectedKey={option.colorKey ?? null}
              />
            </div>
          ) : null}
        </>
      ) : null}
      <div className='min-w-0 flex-1'>
        {editing ? (
          <input
            className='h-8 w-full rounded-lg border border-primary bg-surface-base px-2 text-sm text-text-strong outline-none'
            onBlur={commit}
            onChange={(event) => setDraft(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commit()
              }

              if (event.key === 'Escape') {
                setDraft(option.label)
                setEditing(false)
              }
            }}
            ref={inputRef}
            value={draft}
          />
        ) : option.style ? (
          <button
            className='inline-flex max-w-full cursor-text rounded-full border px-2.5 py-0.5 text-xs font-medium'
            onClick={(event) => {
              event.stopPropagation()
              setEditing(true)
            }}
            style={option.style}
            type='button'
          >
            <span className='truncate'>{option.label}</span>
          </button>
        ) : (
          <button
            className='min-w-0 cursor-text text-left text-sm text-text-strong'
            onClick={(event) => {
              event.stopPropagation()
              setEditing(true)
            }}
            type='button'
          >
            <span className='truncate'>{option.label}</span>
          </button>
        )}
      </div>

      {onSetCompleted ? (
        <button
          className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong'
          onClick={(event) => {
            event.stopPropagation()
            onSetCompleted(option.id)
          }}
          title={option.isCompleted ? 'Completion status' : 'Set as completion status'}
          type='button'
        >
          {option.isCompleted ? (
            <span className='flex h-5 w-5 items-center justify-center rounded-full bg-success'>
              <Check className='h-3 w-3 text-white'/>
            </span>
          ) : (
            <Circle className='h-4 w-4'/>
          )}
        </button>
      ) : null}

      {onDelete ? (
        <button
          className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-canvas-accent hover:text-error disabled:cursor-not-allowed disabled:opacity-40'
          disabled={!option.canDelete}
          onClick={(event) => {
            event.stopPropagation()
            onDelete(option.id)
          }}
          title={option.canDelete ? 'Delete label' : option.deleteDisabledReason ?? 'Cannot delete this label'}
          type='button'
        >
          <Trash2 className='h-3.5 w-3.5'/>
        </button>
      ) : null}
    </div>
  )
}

export function PropertySelectMenu({
  clearOption,
  editMenu,
  options,
  selectedId,
  selectorWidth = 180,
  trigger,
  onSelect,
}: PropertySelectMenuProps) {
  const [open, setOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('selector')
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({visibility: 'hidden'})

  useEffect(() => {
    if (!open) {
      return
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        (!menuRef.current || !menuRef.current.contains(target))
        && (!triggerRef.current || !triggerRef.current.contains(target))
      ) {
        setOpen(false)
        setViewMode('selector')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setMenuStyle({visibility: 'hidden'})
      return
    }

    const triggerRect = triggerRef.current.getBoundingClientRect()
    const dropdownWidth = viewMode === 'edit' ? 280 : selectorWidth
    const menuHeight = menuRef.current?.scrollHeight ?? (viewMode === 'edit' ? 320 : 240)
    const shouldShiftLeft = triggerRect.left + dropdownWidth > window.innerWidth - 8
    const shouldOpenUp = triggerRect.bottom + menuHeight + 8 > window.innerHeight

    const nextStyle: React.CSSProperties = {
      left: shouldShiftLeft ? Math.max(8, triggerRect.right - dropdownWidth) : triggerRect.left,
      position: 'fixed',
      visibility: 'visible',
      width: dropdownWidth,
      zIndex: 1000,
    }

    if (shouldOpenUp) {
      const spaceAbove = triggerRect.top - 8
      if (spaceAbove >= menuHeight) {
        nextStyle.bottom = window.innerHeight - triggerRect.top + 2
      } else {
        nextStyle.maxHeight = `${Math.max(120, triggerRect.top - 16)}px`
        nextStyle.overflowY = 'auto'
        nextStyle.top = 8
      }
    } else {
      nextStyle.top = triggerRect.bottom + 2
    }

    setMenuStyle(nextStyle)
  }, [open, selectorWidth, viewMode, editMenu?.options.length, options.length])

  const closeMenu = () => {
    setOpen(false)
    setViewMode('selector')
  }

  const renderSelectorOption = (option: MenuOption, selected: boolean) => (
    <button
      className='flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-canvas-accent'
      key={option.id}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(option.id)
        closeMenu()
      }}
      type='button'
    >
      {option.style ? (
        <span
          className='inline-flex rounded-full border px-2 py-0.5 text-xs font-medium'
          style={option.style}
        >
          {option.label}
        </span>
      ) : (
        <span className='text-sm text-text-strong'>{option.label}</span>
      )}
      {selected ? <Check className='ml-auto h-4 w-4 text-primary'/> : null}
    </button>
  )

  const menu = !open ? null : createPortal(
    <div
      className='fixed rounded-[24px] border border-border-subtle bg-surface-elevated p-2 shadow-float'
      onClick={(event) => event.stopPropagation()}
      ref={menuRef}
      style={menuStyle}
    >
      {viewMode === 'selector' ? (
        <div className='space-y-1'>
          {clearOption ? (
            <>
              <button
                className='flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-canvas-accent'
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect(null)
                  closeMenu()
                }}
                type='button'
              >
                <span className='text-sm text-text-muted'>{clearOption.label}</span>
                {selectedId === null ? <Check className='ml-auto h-4 w-4 text-primary'/> : null}
              </button>
              <div className='my-1 border-t border-border-subtle'/>
            </>
          ) : null}

          {options.map((option) => renderSelectorOption(option, option.id === selectedId))}

          {editMenu ? (
            <>
              <div className='my-1 border-t border-border-subtle'/>
              <button
                className='flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-text-strong hover:bg-canvas-accent'
                onClick={(event) => {
                  event.stopPropagation()
                  setViewMode('edit')
                }}
                type='button'
              >
                <Pencil className='h-3.5 w-3.5 text-text-muted'/>
                <span>Edit Labels</span>
              </button>
            </>
          ) : null}
        </div>
      ) : editMenu ? (
        <div className='space-y-2'>
          <div className='flex items-center justify-between px-1 pt-1'>
            <span className='text-xs font-semibold uppercase tracking-wider text-text-muted'>{editMenu.title}</span>
            <button
              className='flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-muted hover:bg-canvas-accent hover:text-text-strong'
              onClick={() => setViewMode('selector')}
              type='button'
            >
              <ChevronLeft className='h-3.5 w-3.5'/>
              Back
            </button>
          </div>

          {editMenu.categories ? (
            <div className='space-y-3'>
              {editMenu.categories.map((cat) => {
                const categoryOptions = editMenu.options.filter((o) => o.category === cat.key)
                return (
                  <div key={cat.key}>
                    <p className='px-2 pb-1 text-xs font-medium text-text-muted'>{cat.label}</p>
                    <div className='space-y-0.5'>
                      {categoryOptions.map((option) => (
                        <EditableRow
                          colorPalette={editMenu.colorPalette}
                          key={option.id}
                          onColorChange={editMenu.onColorChange}
                          onDelete={editMenu.onDelete}
                          onRename={editMenu.onRename}
                          option={option}
                        />
                      ))}
                      {cat.onAdd ? (
                        <button
                          className='flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-text-muted hover:bg-canvas-accent hover:text-text-strong'
                          onClick={(event) => { event.stopPropagation(); cat.onAdd?.() }}
                          type='button'
                        >
                          <Plus className='h-3 w-3'/>
                          <span>Add status</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <>
              <div className='space-y-1'>
                {editMenu.options.map((option) => (
                  <EditableRow
                    colorPalette={editMenu.colorPalette}
                    key={option.id}
                    onColorChange={editMenu.onColorChange}
                    onDelete={editMenu.onDelete}
                    onRename={editMenu.onRename}
                    onSetCompleted={editMenu.onSetCompleted}
                    option={option}
                  />
                ))}
              </div>

              {editMenu.description ? (
                <p className='px-1 text-[11px] text-text-muted'>{editMenu.description}</p>
              ) : null}
            </>
          )}

          <div className='flex items-center gap-2 pt-1'>
            {!editMenu.categories && editMenu.onAdd ? (
              <button
                className='flex flex-1 items-center justify-center gap-1 rounded-xl border border-border-subtle px-3 py-2 text-sm text-text-strong hover:bg-canvas-accent'
                onClick={() => editMenu.onAdd?.()}
                type='button'
              >
                <Plus className='h-3.5 w-3.5'/>
                Add Label
              </button>
            ) : null}

            <button
              className='flex items-center justify-center rounded-xl bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90'
              onClick={closeMenu}
              type='button'
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  )

  return (
    <>
      <div
        className='inline-flex'
        onClick={(event) => {
          event.stopPropagation()
          setOpen((current) => {
            const next = !current
            if (!next) {
              setViewMode('selector')
            }
            return next
          })
        }}
        ref={triggerRef}
      >
        {trigger}
      </div>
      {menu}
    </>
  )
}
