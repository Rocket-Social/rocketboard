import {Archive, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Copy, FolderInput, Trash2, X} from 'lucide-react'
import {memo, useCallback, useEffect, useRef, useState} from 'react'

type GroupOption = {
  id: string
  label: string
}

type SprintOption = {
  id: string
  label: string
}

type BulkActionsBarProps = {
  groups: GroupOption[]
  onArchive: () => void
  onClearSelection: () => void
  onDelete: () => void
  onDuplicate: () => void
  onMoveToGroup: (groupId: string) => void
  onMoveToSprint?: (sprintId: string | null) => void
  selectedCount: number
  sprints?: SprintOption[]
}

type MoveView = 'closed' | 'group' | 'main' | 'sprint'

const menuBtnClass =
  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-canvas-accent'

export const BulkActionsBar = memo(function BulkActionsBar({
  groups,
  onArchive,
  onClearSelection,
  onDelete,
  onDuplicate,
  onMoveToGroup,
  onMoveToSprint,
  selectedCount,
  sprints = [],
}: BulkActionsBarProps) {
  const [moveView, setMoveView] = useState<MoveView>('closed')
  const menuRef = useRef<HTMLDivElement>(null)
  const showSprintMenu = Boolean(onMoveToSprint)
  const showGroupMenu = groups.length > 0

  // Escape key clears selection
  useEffect(() => {
    if (selectedCount === 0) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (moveView !== 'closed') {
          setMoveView('closed')
        } else {
          onClearSelection()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedCount, moveView, onClearSelection])

  // Close menu on outside click
  useEffect(() => {
    if (moveView === 'closed') return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMoveView('closed')
      }
    }
    const tid = setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0)
    return () => { clearTimeout(tid); document.removeEventListener('mousedown', handleClickOutside) }
  }, [moveView])

  const handleMoveToGroup = useCallback((groupId: string) => {
    onMoveToGroup(groupId)
    setMoveView('closed')
  }, [onMoveToGroup])

  const handleMoveToSprint = useCallback((sprintId: string | null) => {
    onMoveToSprint?.(sprintId)
    setMoveView('closed')
  }, [onMoveToSprint])

  if (selectedCount === 0) {
    return null
  }

  return (
    <div className='fixed bottom-6 left-1/2 z-50 -translate-x-1/2'>
      <div className='flex items-center gap-1 rounded-lg bg-text-strong px-2 py-1.5 shadow-float'>
        {/* Selected count badge */}
        <div className='flex items-center gap-2 border-r border-text-inverse-muted/30 px-2 pr-3'>
          <span className='text-sm font-medium text-text-inverse'>
            {selectedCount} selected
          </span>
        </div>

        {/* Move — with submenu */}
        <div className='relative' ref={menuRef}>
          <button
            className='flex items-center gap-1.5 rounded px-3 py-1.5 text-sm text-text-inverse-muted transition-colors hover:bg-text-inverse/10 hover:text-text-inverse'
            onClick={() => setMoveView(moveView === 'closed' ? 'main' : 'closed')}
            type='button'
          >
            <ArrowRight className='h-4 w-4'/>
            <span>Move</span>
          </button>

          {/* Move submenu — opens upward */}
          {moveView === 'main' ? (
            <div className='absolute bottom-full left-0 mb-2 min-w-[200px] rounded-xl border border-border-subtle bg-surface-elevated p-1.5 shadow-elevated'>
              {showSprintMenu ? (
                <button
                  className={`${menuBtnClass} rounded-lg text-text-medium`}
                  onClick={(e) => { e.stopPropagation(); setMoveView('sprint') }}
                  type='button'
                >
                  <CalendarDays className='h-4 w-4 text-text-muted'/>
                  <span className='flex-1'>Move to sprint</span>
                  <ChevronRight className='h-3.5 w-3.5 text-text-muted'/>
                </button>
              ) : null}
              {showGroupMenu ? (
                <button
                  className={`${menuBtnClass} rounded-lg text-text-medium`}
                  onClick={(e) => { e.stopPropagation(); setMoveView('group') }}
                  type='button'
                >
                  <FolderInput className='h-4 w-4 text-text-muted'/>
                  <span className='flex-1'>Move to group</span>
                  <ChevronRight className='h-3.5 w-3.5 text-text-muted'/>
                </button>
              ) : null}
              {!showSprintMenu && !showGroupMenu ? (
                <div className='px-3 py-2 text-xs text-text-muted'>No move targets available</div>
              ) : null}
            </div>
          ) : null}

          {moveView === 'sprint' ? (
            <div className='absolute bottom-full left-0 mb-2 min-w-[220px] rounded-xl border border-border-subtle bg-surface-elevated p-1.5 shadow-elevated'>
              <button
                className={`${menuBtnClass} rounded-lg font-medium text-text-muted`}
                onClick={(e) => { e.stopPropagation(); setMoveView('main') }}
                type='button'
              >
                <ChevronLeft className='h-3.5 w-3.5'/>
                <span>Choose sprint</span>
              </button>
              {sprints.length > 0 ? <div className='my-1 h-px bg-border-subtle'/> : null}
              {sprints.map((sprint) => (
                <button
                  className={`${menuBtnClass} rounded-lg text-text-medium`}
                  key={sprint.id}
                  onClick={(e) => { e.stopPropagation(); handleMoveToSprint(sprint.id) }}
                  type='button'
                >
                  {sprint.label}
                </button>
              ))}
              <div className='my-1 h-px bg-border-subtle'/>
              <button
                className={`${menuBtnClass} rounded-lg text-text-medium`}
                onClick={(e) => { e.stopPropagation(); handleMoveToSprint(null) }}
                type='button'
              >
                Backlog
              </button>
            </div>
          ) : null}

          {moveView === 'group' ? (
            <div className='absolute bottom-full left-0 mb-2 min-w-[220px] rounded-xl border border-border-subtle bg-surface-elevated p-1.5 shadow-elevated'>
              <button
                className={`${menuBtnClass} rounded-lg font-medium text-text-muted`}
                onClick={(e) => { e.stopPropagation(); setMoveView('main') }}
                type='button'
              >
                <ChevronLeft className='h-3.5 w-3.5'/>
                <span>Choose group</span>
              </button>
              <div className='my-1 h-px bg-border-subtle'/>
              {groups.map((group) => (
                <button
                  className={`${menuBtnClass} rounded-lg text-text-medium`}
                  key={group.id}
                  onClick={(e) => { e.stopPropagation(); handleMoveToGroup(group.id) }}
                  type='button'
                >
                  {group.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Duplicate */}
        <button
          className='flex items-center gap-1.5 rounded px-3 py-1.5 text-sm text-text-inverse-muted transition-colors hover:bg-text-inverse/10 hover:text-text-inverse'
          onClick={onDuplicate}
          type='button'
        >
          <Copy className='h-4 w-4'/>
          <span>Duplicate</span>
        </button>

        {/* Archive */}
        <button
          className='flex items-center gap-1.5 rounded px-3 py-1.5 text-sm text-text-inverse-muted transition-colors hover:bg-text-inverse/10 hover:text-text-inverse'
          onClick={onArchive}
          type='button'
        >
          <Archive className='h-4 w-4'/>
          <span>Archive</span>
        </button>

        {/* Move to trash */}
        <button
          className='flex items-center gap-1.5 rounded px-3 py-1.5 text-sm text-error transition-colors hover:bg-text-inverse/10'
          onClick={onDelete}
          type='button'
        >
          <Trash2 className='h-4 w-4'/>
          <span>Trash</span>
        </button>

        {/* Close */}
        <button
          className='ml-1 flex items-center justify-center rounded p-1.5 text-text-inverse-muted transition-colors hover:bg-text-inverse/10 hover:text-text-inverse'
          onClick={onClearSelection}
          type='button'
        >
          <X className='h-4 w-4'/>
        </button>
      </div>
    </div>
  )
})
