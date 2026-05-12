import {GripVertical, Plus, Star} from 'lucide-react'
import {useEffect, useMemo, useRef, useState} from 'react'

import {Button} from '../../components/ui/button'
import {PromptDialog} from '../../components/ui/confirm-dialog'
import {usePromptDialog} from '../../hooks/usePromptDialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import {cn} from '../../lib/cn'
import {getMaxProjectViewCount, projectViewTypes, type ProjectViewType} from '../projects/project-view.model'
import type {WorkspaceProjectSummary} from '../projects/project-shell.types'
import {getProjectViewCapability} from './project-view-capabilities'
import {ToolbarTarget} from './ToolbarSlot'

type ProjectViewTabsProps = {
  activeViewId: string
  configurationDisabled?: boolean
  canEditProject?: boolean
  onAddView: (viewType: ProjectViewType) => void
  onHideView: (viewId: string) => void
  onPrefetchView?: (viewId: string, viewType: string) => void
  onRenameView: (viewId: string, name: string) => void
  onReorderViews: (orderedVisibleViewIds: string[]) => void
  onResetView?: (viewId: string) => void
  onRestoreView: (viewId: string) => void
  onSelectView: (viewId: string) => void
  onSetDefaultView: (viewId: string) => void
  project: WorkspaceProjectSummary
}

const TOUCH_CONTEXT_MENU_DELAY_MS = 450
const TOUCH_CONTEXT_MENU_MOVE_TOLERANCE_PX = 8

function reorderViewIds(viewIds: string[], draggedViewId: string, targetViewId: string) {
  if (draggedViewId === targetViewId) {
    return viewIds
  }

  const draggedIndex = viewIds.indexOf(draggedViewId)
  const targetIndex = viewIds.indexOf(targetViewId)

  if (draggedIndex === -1 || targetIndex === -1) {
    return viewIds
  }

  const nextIds = [...viewIds]
  const [draggedId] = nextIds.splice(draggedIndex, 1)
  nextIds.splice(targetIndex, 0, draggedId)
  return nextIds
}

export function ProjectViewTabs({
  activeViewId,
  canEditProject = false,
  configurationDisabled = false,
  onAddView,
  onHideView,
  onPrefetchView,
  onRenameView,
  onReorderViews,
  onResetView,
  onRestoreView,
  onSelectView,
  onSetDefaultView,
  project,
}: ProjectViewTabsProps) {
  const {prompt, promptDialogProps} = usePromptDialog()
  const [draggedViewId, setDraggedViewId] = useState<string | null>(null)
  const [contextMenuState, setContextMenuState] = useState<{
    viewId: string
    x: number
    y: number
  } | null>(null)
  const contextMenuTargetRef = useRef<{
    viewId: string
    viewName: string
  } | null>(null)
  const longPressTimeoutRef = useRef<number | null>(null)
  const longPressGestureRef = useRef<{
    pointerId: number
    viewId: string
    x: number
    y: number
  } | null>(null)
  const suppressNextClickViewIdRef = useRef<string | null>(null)
  const visibleViews = useMemo(
    () => project.projectViews.filter((view) => !view.isHidden),
    [project.projectViews],
  )
  const hiddenViews = useMemo(
    () => project.projectViews.filter((view) => view.isHidden),
    [project.projectViews],
  )
  const addableViewTypes = useMemo(
    () =>
      projectViewTypes.filter((viewType) => {
        if (viewType === 'overview') {
          return false
        }

        const currentViewCount = project.projectViews.filter((view) => view.viewType === viewType).length
        return currentViewCount < getMaxProjectViewCount(viewType)
      }),
    [project.projectViews],
  )
  const contextMenuView = contextMenuState
    ? project.projectViews.find((view) => view.id === contextMenuState.viewId) ?? null
    : null
  const viewManagementDisabled = configurationDisabled || !canEditProject

  const openViewContextMenu = (
    view: Pick<WorkspaceProjectSummary['projectViews'][number], 'id' | 'name'>,
    position: {x: number; y: number},
  ) => {
    if (configurationDisabled) {
      return
    }

    contextMenuTargetRef.current = {
      viewId: view.id,
      viewName: view.name,
    }
    setContextMenuState({
      viewId: view.id,
      x: position.x,
      y: position.y,
    })
  }

  const promptRenameView = async (viewId: string, currentName: string) => {
    const nextName = await prompt({title: 'Rename board', defaultValue: currentName, confirmLabel: 'Rename'})

    if (nextName && nextName !== currentName) {
      onRenameView(viewId, nextName)
    }
  }

  const clearPendingTouchContextMenu = () => {
    if (longPressTimeoutRef.current !== null) {
      window.clearTimeout(longPressTimeoutRef.current)
      longPressTimeoutRef.current = null
    }

    longPressGestureRef.current = null
  }

  useEffect(
    () => () => {
      clearPendingTouchContextMenu()
    },
    [],
  )

  return (
    <div className='flex min-w-0 flex-wrap items-center gap-2'>
      <div className='min-w-0 flex-1 overflow-x-auto' data-testid='project-view-tabs-row'>
        <div className='inline-flex min-w-max items-center gap-2 pr-1'>
          <div className='inline-flex items-center gap-1 rounded-full bg-canvas-accent p-1'>
            {visibleViews.map((view) => {
              const capability = getProjectViewCapability(view.viewType)
              const Icon = capability.icon
              const active = view.id === activeViewId

              return (
                <div
                  className={cn(
                    'inline-flex items-center rounded-full border transition-all',
                    active
                      ? 'border-border-subtle bg-surface-elevated text-text-strong shadow-panel'
                      : 'border-transparent bg-transparent text-text-muted hover:text-text-strong',
                    view.isDefault ? 'gap-1 pr-1' : '',
                    draggedViewId === view.id ? 'opacity-60' : '',
                  )}
                  draggable={!viewManagementDisabled}
                  key={view.id}
                  onContextMenu={(event) => {
                    if (configurationDisabled) {
                      return
                    }

                    event.preventDefault()
                    openViewContextMenu(view, {x: event.clientX, y: event.clientY})
                  }}
                  onDragEnd={() => {
                    clearPendingTouchContextMenu()
                    setDraggedViewId(null)
                  }}
                  onDragOver={(event) => {
                    if (viewManagementDisabled) {
                      return
                    }

                    if (!draggedViewId || draggedViewId === view.id) {
                      return
                    }

                    event.preventDefault()
                  }}
                  onDragStart={() => {
                    if (viewManagementDisabled) {
                      return
                    }
                    clearPendingTouchContextMenu()
                    setDraggedViewId(view.id)
                  }}
                  onDrop={(event) => {
                    if (viewManagementDisabled) {
                      return
                    }

                    event.preventDefault()

                    if (!draggedViewId || draggedViewId === view.id) {
                      return
                    }

                    onReorderViews(reorderViewIds(visibleViews.map((entry) => entry.id), draggedViewId, view.id))
                    setDraggedViewId(null)
                  }}
                  onPointerCancel={() => clearPendingTouchContextMenu()}
                  onPointerDown={(event) => {
                    if (configurationDisabled || event.pointerType !== 'touch') {
                      return
                    }

                    clearPendingTouchContextMenu()

                    const rect = event.currentTarget.getBoundingClientRect()
                    const x = event.clientX || rect.left + Math.min(rect.width / 2, 40)
                    const y = event.clientY || rect.bottom

                    longPressGestureRef.current = {
                      pointerId: event.pointerId,
                      viewId: view.id,
                      x: event.clientX,
                      y: event.clientY,
                    }
                    longPressTimeoutRef.current = window.setTimeout(() => {
                      suppressNextClickViewIdRef.current = view.id
                      openViewContextMenu(view, {x, y})
                      clearPendingTouchContextMenu()
                    }, TOUCH_CONTEXT_MENU_DELAY_MS)
                  }}
                  onPointerLeave={(event) => {
                    if (event.pointerType === 'touch') {
                      clearPendingTouchContextMenu()
                    }
                  }}
                  onPointerMove={(event) => {
                    if (event.pointerType !== 'touch') {
                      return
                    }

                    const gesture = longPressGestureRef.current

                    if (!gesture || gesture.pointerId !== event.pointerId || gesture.viewId !== view.id) {
                      return
                    }

                    const movedX = Math.abs(event.clientX - gesture.x)
                    const movedY = Math.abs(event.clientY - gesture.y)

                    if (movedX > TOUCH_CONTEXT_MENU_MOVE_TOLERANCE_PX || movedY > TOUCH_CONTEXT_MENU_MOVE_TOLERANCE_PX) {
                      clearPendingTouchContextMenu()
                    }
                  }}
                  onPointerUp={(event) => {
                    if (event.pointerType === 'touch') {
                      clearPendingTouchContextMenu()
                    }
                  }}
                >
                  <button
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors',
                      active ? 'text-text-strong' : 'text-text-muted hover:text-text-strong',
                    )}
                    onKeyDown={(event) => {
                      if (configurationDisabled) {
                        return
                      }

                      if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) {
                        return
                      }

                      event.preventDefault()
                      const rect = event.currentTarget.getBoundingClientRect()
                      openViewContextMenu(view, {
                        x: rect.left + Math.min(rect.width / 2, 40),
                        y: rect.bottom,
                      })
                    }}
                    onClick={() => {
                      if (suppressNextClickViewIdRef.current === view.id) {
                        suppressNextClickViewIdRef.current = null
                        return
                      }

                      onSelectView(view.id)
                    }}
                    onMouseEnter={() => {
                      if (!active && onPrefetchView) {
                        onPrefetchView(view.id, view.viewType)
                      }
                    }}
                    type='button'
                  >
                    <GripVertical className='h-3.5 w-3.5 text-text-subtle'/>
                    <Icon className='h-4 w-4'/>
                    <span>{view.name}</span>
                  </button>
                  {view.isDefault ? (
                    <span
                      aria-label={`${view.name} is the default board`}
                      className='inline-flex rounded-full p-1.5 text-primary'
                      role='img'
                    >
                      <Star className='h-3.5 w-3.5 fill-current'/>
                    </span>
                  ) : null}
                </div>
              )
            })}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label='Add board'
                className='h-9 w-9 shrink-0 px-0'
                disabled={viewManagementDisabled}
                title={canEditProject ? undefined : 'Project write access is required to add boards'}
                variant='secondary'
              >
                <Plus className='h-4 w-4'/>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='start'>
              <DropdownMenuLabel>Add board</DropdownMenuLabel>
              {addableViewTypes.map((viewType) => {
                const capability = getProjectViewCapability(viewType)
                const Icon = capability.icon

                return (
                  <DropdownMenuItem key={viewType} onSelect={() => onAddView(viewType)}>
                    <Icon className='h-4 w-4'/>
                    <span>{capability.defaultName}</span>
                  </DropdownMenuItem>
                )
              })}

              {hiddenViews.length > 0 ? (
                <>
                  <DropdownMenuSeparator/>
                  <DropdownMenuLabel>Hidden boards</DropdownMenuLabel>
                  {hiddenViews.map((view) => {
                    const capability = getProjectViewCapability(view.viewType)
                    const Icon = capability.icon

                    return (
                      <DropdownMenuItem key={view.id} onSelect={() => onRestoreView(view.id)}>
                        <Icon className='h-4 w-4'/>
                        <span>Show {view.name}</span>
                      </DropdownMenuItem>
                    )
                  })}
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ToolbarTarget
        className='ml-auto flex basis-full justify-end pt-1 empty:hidden sm:basis-auto sm:pt-0 sm:pl-4'
        slot='view-tabs-trailing'
      />

      {contextMenuState && contextMenuView ? (
        <DropdownMenu
          onOpenChange={(open) => {
            if (!open) {
              setContextMenuState(null)
            }
          }}
          open
        >
          <DropdownMenuTrigger asChild>
            <button
              aria-hidden
              className='pointer-events-none fixed h-0 w-0 opacity-0'
              style={{
                left: contextMenuState.x,
                top: contextMenuState.y,
              }}
              tabIndex={-1}
              type='button'
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start' className='w-56'>
            <DropdownMenuLabel>{contextMenuView.name}</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={viewManagementDisabled}
              onSelect={() => {
                const target = contextMenuTargetRef.current
                if (!target) {
                  return
                }

                promptRenameView(target.viewId, target.viewName)
              }}
            >
              Rename board
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={viewManagementDisabled || contextMenuView.isDefault}
              onSelect={() => {
                const target = contextMenuTargetRef.current
                if (!target) {
                  return
                }

                onSetDefaultView(target.viewId)
              }}
            >
              Set as default
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={configurationDisabled || !canEditProject || visibleViews.length <= 1}
              onSelect={() => {
                const target = contextMenuTargetRef.current
                if (!target) {
                  return
                }

                onHideView(target.viewId)
              }}
            >
              Hide board
            </DropdownMenuItem>
            {onResetView ? (
              <DropdownMenuItem
                onSelect={() => {
                  const target = contextMenuTargetRef.current
                  if (!target) {
                    return
                  }

                  onResetView(target.viewId)
                }}
              >
                Reset to team defaults
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {promptDialogProps ? <PromptDialog {...promptDialogProps}/> : null}
    </div>
  )
}
