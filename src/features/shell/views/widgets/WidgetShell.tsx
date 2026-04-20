import {GripVertical, MoreVertical} from 'lucide-react'
import {type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState} from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../../components/ui/dropdown-menu'
import type {OverviewWidgetWidth} from '../../../projects/project-view.types'
import {getWidgetDisplayTitle} from './widget-registry'
import type {OverviewWidgetType} from '../../../projects/project-view.types'

type WidgetShellProps = {
  children: ReactNode
  customTitle: string | null
  dragHandleProps?: Record<string, unknown>
  isEditMode: boolean
  onRemove?: () => void
  onRename?: (title: string | null) => void
  onResize?: (width: OverviewWidgetWidth) => void
  type: OverviewWidgetType
  width: OverviewWidgetWidth
}

export function WidgetShell({
  children,
  customTitle,
  dragHandleProps,
  isEditMode,
  onRemove,
  onRename,
  onResize,
  type,
  width,
}: WidgetShellProps) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const displayTitle = getWidgetDisplayTitle(type, customTitle)

  const startRename = useCallback(() => {
    setRenameValue(customTitle ?? '')
    setIsRenaming(true)
  }, [customTitle])

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isRenaming])

  const commitRename = useCallback(() => {
    const trimmed = renameValue.trim()
    onRename?.(trimmed.length > 0 ? trimmed : null)
    setIsRenaming(false)
  }, [onRename, renameValue])

  const handleRenameKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitRename()
    } else if (e.key === 'Escape') {
      setIsRenaming(false)
    }
  }, [commitRename])

  return (
    <div
      className={`flex h-full flex-col rounded-2xl border bg-surface-elevated p-5 shadow-panel transition-[border-style] duration-[180ms] ${
        isEditMode ? 'border-dashed border-border-strong' : 'border-border-subtle'
      }`}
    >
      <div className='mb-4 flex items-center gap-2'>
        {isEditMode && dragHandleProps ? (
          <button
            className='cursor-grab touch-none rounded p-0.5 text-text-muted transition-colors hover:text-text-medium active:cursor-grabbing'
            type='button'
            {...dragHandleProps}
          >
            <GripVertical className='h-4 w-4'/>
          </button>
        ) : null}

        <div className='min-w-0 flex-1'>
          {isEditMode && isRenaming ? (
            <input
              className='w-full bg-transparent font-display text-base font-semibold text-text-strong outline-none'
              onBlur={commitRename}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              placeholder={getWidgetDisplayTitle(type, null)}
              ref={inputRef}
              value={renameValue}
            />
          ) : (
            <h3
              className={`truncate font-display text-base font-semibold text-text-strong ${
                isEditMode ? 'cursor-text' : ''
              }`}
              onClick={isEditMode ? startRename : undefined}
            >
              {displayTitle}
            </h3>
          )}
        </div>

        {isEditMode ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className='rounded p-1 text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-medium'
                type='button'
              >
                <MoreVertical className='h-4 w-4'/>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={startRename}>
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator/>
              <DropdownMenuItem
                className={width === 1 ? 'font-medium text-primary' : ''}
                onClick={() => onResize?.(1)}
              >
                Width: 1 column {width === 1 ? '✓' : ''}
              </DropdownMenuItem>
              <DropdownMenuItem
                className={width === 2 ? 'font-medium text-primary' : ''}
                onClick={() => onResize?.(2)}
              >
                Width: 2 columns {width === 2 ? '✓' : ''}
              </DropdownMenuItem>
              <DropdownMenuItem
                className={width === 3 ? 'font-medium text-primary' : ''}
                onClick={() => onResize?.(3)}
              >
                Width: 3 columns {width === 3 ? '✓' : ''}
              </DropdownMenuItem>
              <DropdownMenuSeparator/>
              <DropdownMenuItem
                className='text-error'
                onClick={onRemove}
              >
                Remove widget
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <div className='flex min-h-0 flex-1 flex-col'>
        {children}
      </div>
    </div>
  )
}
