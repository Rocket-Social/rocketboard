import {ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronLeft, MoreHorizontal, Plus, RotateCcw} from 'lucide-react'
import {useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction} from 'react'
import {createPortal} from 'react-dom'

import {ConfirmDialog} from '../../components/ui/confirm-dialog'
import {Input} from '../../components/ui/input'
import {useConfirmDialog} from '../../hooks/useConfirmDialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import {TableColumnResizeHandle} from '../shell/views/TableColumnResizeHandle'
import {ColumnSortIcon} from './ColumnSortIcon'
import {
  getBuiltinFieldCanonicalLabel,
  isBuiltinFieldRenamed,
  isBuiltinTableFieldKey,
  type BuiltinTableFieldKey,
  type ProjectBuiltinFieldLabels,
} from './builtin-fields'
import type {TableColumnDefinition} from './table-view-fields'
import type {ProjectTableSort, ProjectTableViewDraft} from './project-view.types'
import {hideVisibleFieldKey, insertVisibleFieldKey, moveVisibleFieldKey} from './table-column-operations'

type TableColumnHeaderProps = {
  availableColumns: TableColumnDefinition[]
  builtinFieldLabels?: ProjectBuiltinFieldLabels | null
  column?: TableColumnDefinition | null
  isConfigurationDisabled?: boolean
  isMutationPending?: boolean
  onArchiveCustomField?: (fieldDefinitionId: string) => void
  onClearSort?: () => void
  onRenameBuiltinField?: (fieldKey: BuiltinTableFieldKey, label: string | null) => void
  onRenameCustomField?: (fieldDefinitionId: string, name: string) => void
  onResizeStart?: (columnKey: string, event: React.MouseEvent) => void
  onSaveSort?: () => void
  onToggleSort?: () => void
  setDraft: Dispatch<SetStateAction<ProjectTableViewDraft>>
  sort: ProjectTableSort
  visibleFieldKeys: string[]
}

export function TableColumnHeader({
  availableColumns,
  builtinFieldLabels,
  column,
  isConfigurationDisabled = false,
  isMutationPending = false,
  onArchiveCustomField,
  onClearSort,
  onRenameBuiltinField,
  onRenameCustomField,
  onResizeStart,
  onSaveSort,
  onToggleSort,
  setDraft,
  sort,
  visibleFieldKeys,
}: TableColumnHeaderProps) {
  const fieldKey = column?.key ?? 'title'
  const isTitleColumn = column === null
  const isBuiltin = column?.kind === 'builtin' && isBuiltinTableFieldKey(column.key)
  const builtinFieldKey: BuiltinTableFieldKey | null = isBuiltin && column ? (column.key as BuiltinTableFieldKey) : null
  const builtinDefaultLabel = builtinFieldKey ? getBuiltinFieldCanonicalLabel(builtinFieldKey) : null
  const renamedBuiltin = builtinFieldKey
    ? isBuiltinFieldRenamed(builtinFieldKey, builtinFieldLabels)
    : false
  const currentIndex = isTitleColumn ? -1 : visibleFieldKeys.indexOf(fieldKey)
  const isFirstColumn = isTitleColumn || currentIndex === 0
  const isLastColumn = isTitleColumn ? visibleFieldKeys.length === 0 : currentIndex === visibleFieldKeys.length - 1
  const sharedConfigDisabled = isConfigurationDisabled
  const mutationDisabled = isMutationPending
  const {confirm, confirmDialogProps} = useConfirmDialog()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [isHeaderHovered, setIsHeaderHovered] = useState(false)
  const [isSortControlHovered, setIsSortControlHovered] = useState(false)
  const [menuMode, setMenuMode] = useState<'main' | 'add-left' | 'add-right'>('main')
  const [renameValue, setRenameValue] = useState(isTitleColumn ? 'Name' : column?.label ?? '')
  const [sortPortalStyle, setSortPortalStyle] = useState<React.CSSProperties | null>(null)
  const headerCellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setRenameValue(isTitleColumn ? 'Name' : column?.label ?? '')
  }, [column, isTitleColumn])

  // Sort icon portal positioning — fixed position at top-center of header cell
  const sortEntry = sort.find((s) => s.fieldKey === fieldKey)
  const isSorted = Boolean(sortEntry)
  const showSortPortal = !!onToggleSort && !isRenaming
  const shouldRenderSortControl = showSortPortal && (isSorted || isHeaderHovered || isSortControlHovered)

  useLayoutEffect(() => {
    if (!showSortPortal || !headerCellRef.current) {
      setSortPortalStyle(null)
      return
    }

    const el = headerCellRef.current
    const updatePosition = () => {
      const rect = el.getBoundingClientRect()
      setSortPortalStyle({
        left: rect.left + rect.width / 2,
        position: 'fixed',
        top: rect.top,
        transform: 'translate(-50%, -75%)',
        visibility: 'visible',
        zIndex: 40,
      })
    }
    updatePosition()

    const scrollContainer = el.closest('.overflow-x-auto')
    const verticalScrollContainer = el.closest('.overflow-auto')
    scrollContainer?.addEventListener('scroll', updatePosition)
    verticalScrollContainer?.addEventListener('scroll', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      scrollContainer?.removeEventListener('scroll', updatePosition)
      verticalScrollContainer?.removeEventListener('scroll', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [showSortPortal, isRenaming])

  const handleToggleSort = useCallback(() => {
    onToggleSort?.()
  }, [onToggleSort])

  const handleClearSort = useCallback(() => {
    onClearSort?.()
  }, [onClearSort])

  const handleSaveSort = useCallback(() => {
    onSaveSort?.()
  }, [onSaveSort])

  const commitRename = () => {
    const normalizedName = renameValue.trim()
    setIsRenaming(false)

    if (isTitleColumn || !column || normalizedName.length === 0 || normalizedName === column.label) {
      setRenameValue(isTitleColumn ? 'Name' : column?.label ?? '')
      return
    }

    if (builtinFieldKey) {
      onRenameBuiltinField?.(
        builtinFieldKey,
        normalizedName === builtinDefaultLabel ? null : normalizedName,
      )
      return
    }

    if (column.fieldDefinition) {
      onRenameCustomField?.(column.fieldDefinition.id, normalizedName)
    }
  }

  const handleSort = (direction: 'asc' | 'desc') => {
    setDraft((current) => {
      // Replace existing sort for this field, or add new one at end
      const withoutThis = current.sort.filter((s) => s.fieldKey !== fieldKey)
      return {...current, sort: [...withoutThis, {direction, fieldKey}]}
    })
    setIsMenuOpen(false)
  }

  const handleMove = (direction: 'left' | 'right') => {
    if (isTitleColumn) {
      return
    }

    setDraft((current) => ({
      ...current,
      visibleFieldKeys: moveVisibleFieldKey(current.visibleFieldKeys, fieldKey, direction),
    }))
    setIsMenuOpen(false)
  }

  const handleHide = () => {
    if (isTitleColumn) {
      return
    }

    setDraft((current) => ({
      ...current,
      visibleFieldKeys: hideVisibleFieldKey(current.visibleFieldKeys, fieldKey),
    }))
    setIsMenuOpen(false)
  }

  const handleAddColumn = (nextFieldKey: string, side: 'left' | 'right') => {
    const targetIndex = isTitleColumn
      ? 0
      : side === 'left'
        ? currentIndex
        : currentIndex + 1

    setDraft((current) => ({
      ...current,
      visibleFieldKeys: insertVisibleFieldKey(current.visibleFieldKeys, nextFieldKey, targetIndex),
    }))
    setIsMenuOpen(false)
    setMenuMode('main')
  }

  const handleResetBuiltinName = () => {
    if (!builtinFieldKey) {
      return
    }

    onRenameBuiltinField?.(builtinFieldKey, null)
    setIsMenuOpen(false)
  }

  const handleArchiveCustomField = async () => {
    if (!column?.fieldDefinition || !onArchiveCustomField) {
      return
    }

    if (!await confirm({title: `Archive the field "${column.label}"?`, confirmLabel: 'Archive'})) {
      return
    }

    onArchiveCustomField(column.fieldDefinition.id)
    setIsMenuOpen(false)
  }

  const displayLabel = isTitleColumn ? 'Name' : column?.label
  const usesDueDateSortDirectionLabels = fieldKey === 'due_date'
  const AscSortIcon = usesDueDateSortDirectionLabels ? ArrowDown : ArrowUp
  const DescSortIcon = usesDueDateSortDirectionLabels ? ArrowUp : ArrowDown
  const ascendingSortLabel = usesDueDateSortDirectionLabels ? 'Soonest to latest' : 'Sort ascending'
  const descendingSortLabel = usesDueDateSortDirectionLabels ? 'Latest to soonest' : 'Sort descending'

  return (
    <div
      className={`group relative flex min-w-0 items-center gap-2 ${isTitleColumn ? 'justify-between' : 'justify-center'}`}
      onMouseEnter={() => setIsHeaderHovered(true)}
      onMouseLeave={() => setIsHeaderHovered(false)}
      ref={headerCellRef}
    >
      {/* Sort controls rendered via portal so they are not clipped by overflow */}
      {shouldRenderSortControl && sortPortalStyle
        ? createPortal(
          <div
            className='flex items-center justify-center'
            onClick={(event) => event.stopPropagation()}
            onMouseEnter={() => setIsSortControlHovered(true)}
            onMouseLeave={() => setIsSortControlHovered(false)}
            style={sortPortalStyle}
          >
            <ColumnSortIcon
              ascendingLabel={usesDueDateSortDirectionLabels ? 'Soonest to latest' : 'Ascending'}
              descendingLabel={usesDueDateSortDirectionLabels ? 'Latest to soonest' : 'Descending'}
              direction={isSorted && sortEntry ? sortEntry.direction : 'none'}
              onClear={handleClearSort}
              onSave={handleSaveSort}
              onToggle={handleToggleSort}
              reverseActiveDirectionIcon={usesDueDateSortDirectionLabels}
            />
          </div>,
          document.body,
        )
        : null}

      {isRenaming ? (
        <Input
          autoFocus
          className='h-8 bg-surface-base'
          onBlur={commitRename}
          onChange={(event) => setRenameValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commitRename()
            }

            if (event.key === 'Escape') {
              event.preventDefault()
              setIsRenaming(false)
              setRenameValue(isTitleColumn ? 'Name' : column?.label ?? '')
            }
          }}
          value={renameValue}
        />
      ) : (
        <>
          <div className='flex min-w-0 items-center gap-2'>
            <span className='truncate' title={displayLabel ?? undefined}>{displayLabel}</span>
          </div>

          <DropdownMenu onOpenChange={(open) => {
            setIsMenuOpen(open)
            if (!open) {
              setMenuMode('main')
            }
          }} open={isMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                className={`absolute right-0 top-1/2 -translate-y-1/2 shrink-0 rounded-lg p-1 text-text-muted transition-all hover:bg-surface-base hover:text-text-strong ${
                  isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
                type='button'
              >
                <MoreHorizontal className='h-3.5 w-3.5'/>
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align='start' className='w-72'>
              {menuMode !== 'main' ? (
                <>
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault()
                      setMenuMode('main')
                    }}
                  >
                    <ChevronLeft className='h-4 w-4'/>
                    <span>Back</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator/>
                </>
              ) : null}

              {menuMode === 'main' ? (
                <>
                  {renamedBuiltin && builtinDefaultLabel ? (
                    <>
                      <div className='px-3 py-2 text-xs text-text-muted'>Built-in: {builtinDefaultLabel}</div>
                      <DropdownMenuSeparator/>
                    </>
                  ) : null}

                  <DropdownMenuItem
                    disabled={sharedConfigDisabled}
                    onSelect={(event) => {
                      event.preventDefault()
                      handleSort('asc')
                    }}
                  >
                    <AscSortIcon className='h-4 w-4'/>
                    <span>{ascendingSortLabel}</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    disabled={sharedConfigDisabled}
                    onSelect={(event) => {
                      event.preventDefault()
                      handleSort('desc')
                    }}
                  >
                    <DescSortIcon className='h-4 w-4'/>
                    <span>{descendingSortLabel}</span>
                  </DropdownMenuItem>

                  {!isTitleColumn ? (
                    <DropdownMenuItem
                      disabled={sharedConfigDisabled}
                      onSelect={(event) => {
                        event.preventDefault()
                        handleHide()
                      }}
                    >
                      <ArrowUpDown className='h-4 w-4'/>
                      <span>Hide column</span>
                    </DropdownMenuItem>
                  ) : null}

                  <DropdownMenuSeparator/>

                  <DropdownMenuItem
                    disabled={sharedConfigDisabled}
                    onSelect={(event) => {
                      event.preventDefault()
                      setMenuMode('add-right')
                    }}
                  >
                    <Plus className='h-4 w-4'/>
                    <span>Add column to the right</span>
                  </DropdownMenuItem>

                  {!isTitleColumn ? (
                    <DropdownMenuItem
                      disabled={sharedConfigDisabled}
                      onSelect={(event) => {
                        event.preventDefault()
                        setMenuMode('add-left')
                      }}
                    >
                      <Plus className='h-4 w-4'/>
                      <span>Add column to the left</span>
                    </DropdownMenuItem>
                  ) : null}

                  {!isTitleColumn ? (
                    <>
                      <DropdownMenuSeparator/>

                      <DropdownMenuItem
                        disabled={sharedConfigDisabled || isFirstColumn}
                        onSelect={(event) => {
                          event.preventDefault()
                          handleMove('left')
                        }}
                      >
                        <ChevronLeft className='h-4 w-4'/>
                        <span>Move left</span>
                      </DropdownMenuItem>

                      <DropdownMenuItem
                        disabled={sharedConfigDisabled || isLastColumn}
                        onSelect={(event) => {
                          event.preventDefault()
                          handleMove('right')
                        }}
                      >
                        <ChevronLeft className='h-4 w-4 rotate-180'/>
                        <span>Move right</span>
                      </DropdownMenuItem>
                    </>
                  ) : null}

                  {!isTitleColumn ? (
                    <>
                      <DropdownMenuSeparator/>

                      <DropdownMenuItem
                        disabled={mutationDisabled}
                        onSelect={(event) => {
                          event.preventDefault()
                          setIsMenuOpen(false)
                          setIsRenaming(true)
                        }}
                      >
                        <ArrowUpDown className='h-4 w-4'/>
                        <span>Rename</span>
                      </DropdownMenuItem>

                      {renamedBuiltin ? (
                        <DropdownMenuItem
                          disabled={mutationDisabled}
                          onSelect={(event) => {
                            event.preventDefault()
                            handleResetBuiltinName()
                          }}
                        >
                          <RotateCcw className='h-4 w-4'/>
                          <span>Reset to "{builtinDefaultLabel}"</span>
                        </DropdownMenuItem>
                      ) : null}

                      {!builtinFieldKey && column?.fieldDefinition ? (
                        <DropdownMenuItem
                          className='text-error focus:text-error'
                          disabled={mutationDisabled}
                          onSelect={(event) => {
                            event.preventDefault()
                            handleArchiveCustomField()
                          }}
                        >
                          <RotateCcw className='h-4 w-4'/>
                          <span>Archive field</span>
                        </DropdownMenuItem>
                      ) : null}
                    </>
                  ) : null}
                </>
              ) : (() => {
                const builtinColumns = availableColumns.filter((c) => c.kind === 'builtin')
                const customColumns = availableColumns.filter((c) => c.kind === 'custom')
                const side = menuMode === 'add-left' ? 'left' : 'right'

                return (
                  <>
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault()
                        setMenuMode('main')
                      }}
                    >
                      <ChevronLeft className='h-4 w-4'/>
                      <span>Back</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator/>

                    <DropdownMenuLabel>
                      {menuMode === 'add-left' ? 'Add Column To The Left' : 'Add Column To The Right'}
                    </DropdownMenuLabel>

                    {/* Built-in properties */}
                    {builtinColumns.map((col) => {
                      const isVisible = visibleFieldKeys.includes(col.key)
                      const bKey = isBuiltinTableFieldKey(col.key) ? col.key : null
                      const alias = bKey ? builtinFieldLabels?.[bKey]?.trim() : null
                      const canonicalLabel = bKey ? getBuiltinFieldCanonicalLabel(bKey) : null

                      return (
                        <DropdownMenuItem
                          disabled={isVisible || sharedConfigDisabled}
                          key={col.key}
                          onSelect={(event) => {
                            event.preventDefault()
                            if (!isVisible) {
                              handleAddColumn(col.key, side)
                            }
                          }}
                        >
                          {isVisible ? <Check className='h-4 w-4'/> : <Plus className='h-4 w-4'/>}
                          <div className='min-w-0'>
                            <div className='truncate'>{canonicalLabel ?? col.label}</div>
                            {canonicalLabel && alias && alias !== canonicalLabel ? (
                              <div className='truncate text-xs text-text-muted'>Shown as {alias}</div>
                            ) : null}
                          </div>
                        </DropdownMenuItem>
                      )
                    })}

                    {/* Custom fields (if any) */}
                    {customColumns.length > 0 ? (
                      <>
                        <DropdownMenuSeparator/>
                        <DropdownMenuLabel>Custom</DropdownMenuLabel>
                        {customColumns.map((col) => {
                          const isVisible = visibleFieldKeys.includes(col.key)

                          return (
                            <DropdownMenuItem
                              disabled={isVisible || sharedConfigDisabled}
                              key={col.key}
                              onSelect={(event) => {
                                event.preventDefault()
                                if (!isVisible) {
                                  handleAddColumn(col.key, side)
                                }
                              }}
                            >
                              {isVisible ? <Check className='h-4 w-4'/> : <Plus className='h-4 w-4'/>}
                              <span className='truncate'>{col.label}</span>
                            </DropdownMenuItem>
                          )
                        })}
                      </>
                    ) : null}
                  </>
                )
              })()}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      {onResizeStart ? (
        <TableColumnResizeHandle
          columnKey={fieldKey}
          onResizeStart={onResizeStart}
        />
      ) : null}
      {confirmDialogProps ? <ConfirmDialog {...confirmDialogProps}/> : null}
    </div>
  )
}
