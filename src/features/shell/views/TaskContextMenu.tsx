import {Archive, Check, CheckCircle, ChevronRight, Copy, ExternalLink, Link, Trash2} from 'lucide-react'
import {memo, useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import type {InitiativeRecord} from '../../initiatives/initiative.types'
import type {ProjectSprintRecord} from '../../sprints/sprint.types'

type TaskContextMenuProps = {
  cardInitiativeId?: string | null
  cardSprintId?: string | null
  isCompleted: boolean
  isOpen: boolean
  onArchive: () => void
  onClose: () => void
  onCopyLink: () => void
  onDelete: () => void
  onDuplicate: () => void
  onMoveToInitiative?: (initiativeId: string | null) => void
  onMoveToSprint?: (sprintId: string | null) => void
  onOpenDetails: () => void
  onToggleComplete: () => void
  position: {x: number; y: number}
  projectSprints?: ProjectSprintRecord[]
  workspaceInitiatives?: InitiativeRecord[]
}

const menuItemClass =
  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-text-medium transition-colors hover:bg-canvas-accent'

export const TaskContextMenu = memo(function TaskContextMenu({
  cardInitiativeId,
  cardSprintId,
  isCompleted,
  isOpen,
  onArchive,
  onClose,
  onCopyLink,
  onDelete,
  onDuplicate,
  onMoveToInitiative,
  onMoveToSprint,
  onOpenDetails,
  onToggleComplete,
  position,
  projectSprints,
  workspaceInitiatives,
}: TaskContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [clampedPosition, setClampedPosition] = useState(position)
  const [initiativeSubmenuOpen, setInitiativeSubmenuOpen] = useState(false)
  const [sprintSubmenuOpen, setSprintSubmenuOpen] = useState(false)

  // Clamp position so menu doesn't overflow viewport
  useLayoutEffect(() => {
    if (!isOpen || !menuRef.current) return

    const rect = menuRef.current.getBoundingClientRect()
    const padding = 8
    let x = position.x
    let y = position.y

    if (x + rect.width > window.innerWidth - padding) {
      x = window.innerWidth - rect.width - padding
    }
    if (y + rect.height > window.innerHeight - padding) {
      y = window.innerHeight - rect.height - padding
    }
    if (x < padding) x = padding
    if (y < padding) y = padding

    setClampedPosition({x, y})
  }, [isOpen, position])

  // Close on outside click or Escape
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    // Delay to avoid immediate close from the right-click event
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) {
      setInitiativeSubmenuOpen(false)
      setSprintSubmenuOpen(false)
    }
  }, [isOpen])

  const handleAction = useCallback((action: () => void) => {
    action()
    onClose()
  }, [onClose])

  if (!isOpen) return null

  const availableSprints = (projectSprints ?? []).filter(
    (s) => s.status === 'planned' || s.status === 'active',
  )
  const availableInitiatives = (workspaceInitiatives ?? []).filter(
    (initiative) => initiative.status === 'planned' || initiative.status === 'active',
  )
  const showInitiativeMenu = availableInitiatives.length > 0 && onMoveToInitiative
  const showSprintMenu = availableSprints.length > 0 && onMoveToSprint

  return createPortal(
    <div
      className='fixed z-50'
      ref={menuRef}
      style={{left: clampedPosition.x, top: clampedPosition.y}}
    >
      <div className='min-w-[200px] rounded-xl border border-border-subtle bg-surface-elevated p-1.5 shadow-elevated'>
        <button
          className={menuItemClass}
          onClick={() => handleAction(onDuplicate)}
          type='button'
        >
          <Copy className='h-4 w-4 text-text-muted'/>
          <span>Duplicate task</span>
        </button>

        <button
          className={menuItemClass}
          onClick={() => handleAction(onToggleComplete)}
          type='button'
        >
          <CheckCircle className='h-4 w-4 text-text-muted'/>
          <span>{isCompleted ? 'Mark incomplete' : 'Mark complete'}</span>
        </button>

        <button
          className={menuItemClass}
          onClick={() => handleAction(onOpenDetails)}
          type='button'
        >
          <ExternalLink className='h-4 w-4 text-text-muted'/>
          <span>Open task details</span>
        </button>

        <button
          className={menuItemClass}
          onClick={() => handleAction(onCopyLink)}
          type='button'
        >
          <Link className='h-4 w-4 text-text-muted'/>
          <span>Copy task link</span>
        </button>

        {showInitiativeMenu ? (
          <div
            className='relative'
            onMouseEnter={() => setInitiativeSubmenuOpen(true)}
            onMouseLeave={() => setInitiativeSubmenuOpen(false)}
          >
            <button
              className={menuItemClass}
              onClick={() => setInitiativeSubmenuOpen((prev) => !prev)}
              type='button'
            >
              <ChevronRight className='h-4 w-4 text-text-muted'/>
              <span className='flex-1'>Move to initiative</span>
              <ChevronRight className='h-3 w-3 text-text-muted'/>
            </button>

            {initiativeSubmenuOpen ? (
              <div
                className='absolute left-full top-0 z-50 ml-1 min-w-[180px] rounded-xl border border-border-subtle bg-surface-elevated p-1.5 shadow-elevated'
              >
                {availableInitiatives.map((initiative) => {
                  const isCurrent = cardInitiativeId === initiative.id
                  return (
                    <button
                      className={`${menuItemClass} ${isCurrent ? 'font-medium text-text-strong' : ''}`}
                      key={initiative.id}
                      onClick={() => {
                        if (!isCurrent) {
                          handleAction(() => onMoveToInitiative(initiative.id))
                        }
                      }}
                      type='button'
                    >
                      <span className='flex-1'>{initiative.name}</span>
                      {isCurrent ? <Check className='h-4 w-4 text-primary'/> : null}
                    </button>
                  )
                })}

                <div className='my-1 h-px bg-border-subtle'/>

                <button
                  className={`${menuItemClass} ${!cardInitiativeId ? 'font-medium text-text-strong' : ''}`}
                  onClick={() => {
                    if (cardInitiativeId) {
                      handleAction(() => onMoveToInitiative(null))
                    }
                  }}
                  type='button'
                >
                  <span className='flex-1'>No initiative</span>
                  {!cardInitiativeId ? <Check className='h-4 w-4 text-primary'/> : null}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {showSprintMenu ? (
          <div
            className='relative'
            onMouseEnter={() => setSprintSubmenuOpen(true)}
            onMouseLeave={() => setSprintSubmenuOpen(false)}
          >
            <button
              className={menuItemClass}
              onClick={() => setSprintSubmenuOpen((prev) => !prev)}
              type='button'
            >
              <ChevronRight className='h-4 w-4 text-text-muted'/>
              <span className='flex-1'>Move to sprint</span>
              <ChevronRight className='h-3 w-3 text-text-muted'/>
            </button>

            {sprintSubmenuOpen ? (
              <div
                className='absolute left-full top-0 z-50 ml-1 min-w-[180px] rounded-xl border border-border-subtle bg-surface-elevated p-1.5 shadow-elevated'
              >
                {availableSprints.map((sprint) => {
                  const isCurrent = cardSprintId === sprint.id
                  return (
                    <button
                      className={`${menuItemClass} ${isCurrent ? 'font-medium text-text-strong' : ''}`}
                      key={sprint.id}
                      onClick={() => {
                        if (!isCurrent) {
                          handleAction(() => onMoveToSprint(sprint.id))
                        }
                      }}
                      type='button'
                    >
                      <span className='flex-1'>{sprint.name}</span>
                      {isCurrent ? <Check className='h-4 w-4 text-primary'/> : null}
                    </button>
                  )
                })}

                <div className='my-1 h-px bg-border-subtle'/>

                <button
                  className={`${menuItemClass} ${!cardSprintId ? 'font-medium text-text-strong' : ''}`}
                  onClick={() => {
                    if (cardSprintId) {
                      handleAction(() => onMoveToSprint(null))
                    }
                  }}
                  type='button'
                >
                  <span className='flex-1'>Backlog</span>
                  {!cardSprintId ? <Check className='h-4 w-4 text-primary'/> : null}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <button
          className={menuItemClass}
          onClick={() => handleAction(onArchive)}
          type='button'
        >
          <Archive className='h-4 w-4 text-text-muted'/>
          <span>Archive</span>
        </button>

        <div className='my-1 h-px bg-border-subtle'/>

        <button
          className='flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-error transition-colors hover:bg-error/10'
          onClick={() => handleAction(onDelete)}
          type='button'
        >
          <Trash2 className='h-4 w-4'/>
          <span>Move to trash</span>
        </button>
      </div>
    </div>,
    document.body,
  )
})
