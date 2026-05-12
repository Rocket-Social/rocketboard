import {useSortable} from '@dnd-kit/sortable'
import {CSS} from '@dnd-kit/utilities'
import {ChevronDown, ChevronRight, GripVertical, MoreHorizontal} from 'lucide-react'
import {useEffect, useRef, useState} from 'react'

import {DropdownMenu, DropdownMenuContent, DropdownMenuTrigger} from '../../../components/ui/dropdown-menu'
import {cn} from '../../../lib/cn'
import type {ReleaseChecklistItem, ReleaseNoteSection, ReleaseRecord, ReleaseStatus, UpdateReleaseInput} from '../plan.types'
import {ReleaseExpandPanel} from './ReleaseExpandPanel'
import {ReleaseHealthPopover} from './ReleaseHealthPopover'
import {ReleaseStatusPopover} from './ReleaseStatusPopover'
import type {ReleaseColumnId} from './release-utils'
import {formatReleaseChecklistProgress, formatReleaseDrift} from './release-utils'

type InlineTextCellProps = {
  autoFocus?: boolean
  className?: string
  onCommit: (value: string) => Promise<void>
  placeholder?: string
  value: string
}

function InlineTextCell({autoFocus = false, className, onCommit, placeholder, value}: InlineTextCellProps) {
  const [draft, setDraft] = useState(value)
  const [isFocused, setIsFocused] = useState(false)
  const [flashError, setFlashError] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const skipCommitRef = useRef(false)

  useEffect(() => {
    if (!isFocused) {
      setDraft(value)
    }
  }, [isFocused, value])

  useEffect(() => {
    if (!autoFocus || !inputRef.current) return
    inputRef.current.focus()
    inputRef.current.select()
  }, [autoFocus])

  const commit = async () => {
    if (draft === value) return
    try {
      await onCommit(draft)
    } catch {
      setFlashError(true)
      window.setTimeout(() => setFlashError(false), 180)
      setDraft(value)
    }
  }

  return (
    <input
      className={cn(
        'h-9 w-full rounded-xl border border-transparent bg-transparent px-2.5 text-sm text-text-medium outline-none transition-all placeholder:text-text-muted focus:border-primary focus:bg-surface-elevated focus:text-text-strong focus:ring-2 focus:ring-primary-soft',
        flashError && 'border-error focus:border-error focus:ring-error/20',
        className,
      )}
      onBlur={() => {
        setIsFocused(false)
        if (skipCommitRef.current) {
          skipCommitRef.current = false
          return
        }
        void commit()
      }}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => setIsFocused(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          skipCommitRef.current = true
          setDraft(value)
          event.currentTarget.blur()
        }
      }}
      placeholder={placeholder}
      ref={inputRef}
      value={draft}
    />
  )
}

type InlineDateCellProps = {
  onCommit: (value: string | null) => Promise<void>
  value: string | null
}

function InlineDateCell({onCommit, value}: InlineDateCellProps) {
  const [draft, setDraft] = useState(value ?? '')
  const [isFocused, setIsFocused] = useState(false)
  const [flashError, setFlashError] = useState(false)
  const skipCommitRef = useRef(false)

  useEffect(() => {
    if (!isFocused) {
      setDraft(value ?? '')
    }
  }, [isFocused, value])

  const commit = async () => {
    const nextValue = draft || null
    if (nextValue === value) return
    try {
      await onCommit(nextValue)
    } catch {
      setFlashError(true)
      window.setTimeout(() => setFlashError(false), 180)
      setDraft(value ?? '')
    }
  }

  return (
    <input
      className={cn(
        'h-9 w-full rounded-xl border border-transparent bg-transparent px-2.5 font-mono text-xs text-text-medium outline-none transition-all focus:border-primary focus:bg-surface-elevated focus:text-text-strong focus:ring-2 focus:ring-primary-soft',
        flashError && 'border-error focus:border-error focus:ring-error/20',
      )}
      onBlur={() => {
        setIsFocused(false)
        if (skipCommitRef.current) {
          skipCommitRef.current = false
          return
        }
        void commit()
      }}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => setIsFocused(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          skipCommitRef.current = true
          setDraft(value ?? '')
          event.currentTarget.blur()
        }
      }}
      type='date'
      value={draft}
    />
  )
}

function ForceUpgradeToggle({checked, onToggle}: {checked: boolean; onToggle: (checked: boolean) => void}) {
  return (
    <button
      aria-pressed={checked}
      className={`relative mx-auto flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-border-subtle'}`}
      onClick={() => onToggle(!checked)}
      type='button'
    >
      <span
        className={`absolute h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
      />
    </button>
  )
}

type ReleaseRowProps = {
  autoFocusName: boolean
  canDrag: boolean
  gridTemplateColumns: string
  isExpanded: boolean
  onArchiveRelease: (release: ReleaseRecord) => void
  onAutoFocusHandled: () => void
  onDeleteRelease: (release: ReleaseRecord) => void
  onOpenDetail: (release: ReleaseRecord) => void
  onExpandToggle: () => void
  onHealthChange: (release: ReleaseRecord, health: ReleaseRecord['health']) => Promise<void>
  onSaveChecklist: (releaseId: string, checklistItems: ReleaseChecklistItem[]) => Promise<void>
  onSaveNotes: (releaseId: string, noteSections: ReleaseNoteSection[]) => Promise<void>
  onSaveRetro: (
    releaseId: string,
    input: {
      abVariations: string | null
      releaseNotes: string | null
      retroNotes: string | null
      retroUrl: string | null
    },
  ) => Promise<void>
  onStatusChange: (release: ReleaseRecord, status: ReleaseStatus) => Promise<void>
  onUpdateRelease: (input: UpdateReleaseInput, fieldLabel: string) => Promise<void>
  planViewId: string
  release: ReleaseRecord
  visibleColumns: ReleaseColumnId[]
  workspaceId: string
}

export function ReleaseRow({
  autoFocusName,
  canDrag,
  gridTemplateColumns,
  isExpanded,
  onArchiveRelease,
  onAutoFocusHandled,
  onDeleteRelease,
  onOpenDetail,
  onExpandToggle,
  onHealthChange,
  onSaveChecklist,
  onSaveNotes,
  onSaveRetro,
  onStatusChange,
  onUpdateRelease,
  planViewId,
  release,
  visibleColumns,
  workspaceId,
}: ReleaseRowProps) {
  const {attributes, isDragging, listeners, setNodeRef, transform, transition} = useSortable({
    disabled: !canDrag,
    id: release.id,
  })

  const style = {
    opacity: isDragging ? 0.75 : 1,
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const drift = formatReleaseDrift(release)
  const rowClasses = release.status === 'released'
    ? 'border-success/20 bg-success/5'
    : release.status === 'in_progress'
      ? 'border-primary/25 bg-primary/5'
      : release.status === 'draft'
        ? 'border-border-subtle bg-surface-elevated'
        : 'border-border-subtle bg-surface-elevated'

  useEffect(() => {
    if (autoFocusName) {
      onAutoFocusHandled()
    }
  }, [autoFocusName, onAutoFocusHandled])

  const renderColumn = (column: ReleaseColumnId) => {
    switch (column) {
      case 'status':
        return (
          <ReleaseStatusPopover
            onSelect={(status) => {
              void onStatusChange(release, status)
            }}
            status={release.status}
          />
        )
      case 'buildNumber':
        return (
          <InlineTextCell
            className='font-mono text-xs text-text-muted'
            onCommit={(nextValue) => onUpdateRelease({
              buildNumber: nextValue.trim() ? nextValue.trim() : null,
              releaseId: release.id,
            }, 'build number')}
            placeholder='—'
            value={release.buildNumber ?? ''}
          />
        )
      case 'plannedDate':
        return (
          <InlineDateCell
            onCommit={(nextValue) => onUpdateRelease({plannedDate: nextValue, releaseId: release.id}, 'planned date')}
            value={release.plannedDate}
          />
        )
      case 'actualDate':
        return (
          <InlineDateCell
            onCommit={(nextValue) => onUpdateRelease({actualDate: nextValue, releaseId: release.id}, 'actual date')}
            value={release.actualDate}
          />
        )
      case 'drift':
        return (
          <div className={cn(
            'px-2.5 font-mono text-xs',
            drift.tone === 'success' && 'text-success',
            drift.tone === 'warning' && 'text-warning',
            drift.tone === 'error' && 'text-error',
            drift.tone === 'muted' && 'text-text-muted',
          )}
          >
            {drift.label}
          </div>
        )
      case 'health':
        return (
          <ReleaseHealthPopover
            health={release.health}
            onSelect={(health) => {
              void onHealthChange(release, health)
            }}
          />
        )
      case 'linkedCards':
        return <div className='px-2.5 font-mono text-xs text-text-muted'>{release.linkedCardCount}</div>
      case 'linkedSprints':
        return <div className='px-2.5 font-mono text-xs text-text-muted'>{release.linkedSprintCount}</div>
      case 'checklist':
        return <div className='px-2.5 font-mono text-xs text-text-muted'>{formatReleaseChecklistProgress(release)}</div>
      case 'forceUpgrade':
        return (
          <ForceUpgradeToggle
            checked={release.forceUpgrade}
            onToggle={(checked) => {
              void onUpdateRelease({forceUpgrade: checked, releaseId: release.id}, 'force upgrade')
            }}
          />
        )
    }
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[24px] border shadow-panel transition-all duration-[180ms]',
        rowClasses,
        release.status === 'released' && 'text-text-medium',
      )}
      ref={setNodeRef}
      style={style}
    >
      <div className='grid items-center gap-3 px-3 py-2.5' style={{gridTemplateColumns}}>
        <div className='flex items-center justify-center'>
          <button
            className={cn(
              'rounded-lg p-1 text-text-muted transition-colors',
              canDrag ? 'cursor-grab hover:bg-canvas-accent hover:text-text-strong active:cursor-grabbing' : 'cursor-not-allowed opacity-40',
            )}
            title={canDrag ? 'Drag to reorder' : 'Reorder is available in default sort order.'}
            type='button'
            {...(canDrag ? attributes : {})}
            {...(canDrag ? listeners : {})}
          >
            <GripVertical className='h-4 w-4'/>
          </button>
        </div>

        <div className='flex min-w-0 items-center gap-2'>
          <InlineTextCell
            autoFocus={autoFocusName}
            className='text-sm font-medium text-text-strong'
            onCommit={(nextValue) => onUpdateRelease({name: nextValue.trim(), releaseId: release.id}, 'name')}
            placeholder='Untitled release'
            value={release.name}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className='rounded-lg p-1 text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong'
                type='button'
              >
                <MoreHorizontal className='h-4 w-4'/>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-44 p-1'>
              <button
                className='w-full rounded-xl px-3 py-2 text-left text-sm text-text-medium transition-colors hover:bg-canvas-accent hover:text-text-strong'
                onClick={() => onOpenDetail(release)}
                type='button'
              >
                Open detail drawer
              </button>
              {release.status === 'archived' ? (
                <button
                  className='w-full rounded-xl px-3 py-2 text-left text-sm text-error transition-colors hover:bg-error/10'
                  onClick={() => onDeleteRelease(release)}
                  type='button'
                >
                  Delete permanently
                </button>
              ) : (
                <button
                  className='w-full rounded-xl px-3 py-2 text-left text-sm text-text-medium transition-colors hover:bg-canvas-accent hover:text-text-strong'
                  onClick={() => onArchiveRelease(release)}
                  type='button'
                >
                  Archive release
                </button>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {visibleColumns.map((column) => (
          <div className='min-w-0' key={column}>
            {renderColumn(column)}
          </div>
        ))}

        <div className='flex items-center justify-center'>
          <button
            className='rounded-lg p-1.5 text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong'
            onClick={onExpandToggle}
            type='button'
          >
            {isExpanded ? <ChevronDown className='h-4 w-4'/> : <ChevronRight className='h-4 w-4'/>}
          </button>
        </div>
      </div>

      {isExpanded ? (
        <ReleaseExpandPanel
          onOpenDetail={() => onOpenDetail(release)}
          onSaveChecklist={(checklistItems) => onSaveChecklist(release.id, checklistItems)}
          onSaveNotes={(noteSections) => onSaveNotes(release.id, noteSections)}
          onSaveRetro={(input) => onSaveRetro(release.id, input)}
          planViewId={planViewId}
          release={release}
          workspaceId={workspaceId}
        />
      ) : null}
    </div>
  )
}
