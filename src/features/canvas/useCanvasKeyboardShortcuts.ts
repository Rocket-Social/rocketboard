import {useEffect} from 'react'
import type {RefObject} from 'react'

import {isEditableEventTarget} from '../../lib/dom'
import {resolveCanvasKeyboardAction} from './canvas-keyboard'
import type {CanvasToolMode} from './canvas.types'

type UseCanvasKeyboardShortcutsOptions = {
  canEdit: boolean
  canCopySelected: boolean
  hasSelectedElement: boolean
  hasPasteableSelection: boolean
  onClearSelection: () => void
  onCopySelected: () => void
  onDeleteSelected: () => void
  onPasteSelection: () => void
  onSetTool: (tool: CanvasToolMode) => void
  surfaceRef: RefObject<HTMLDivElement | null>
}

export function isCanvasShortcutScopeActive(
  surfaceElement: HTMLDivElement | null,
  activeElement: Element | null,
) {
  return Boolean(
    surfaceElement
    && activeElement instanceof HTMLElement
    && (activeElement === surfaceElement || surfaceElement.contains(activeElement)),
  )
}

export function useCanvasKeyboardShortcuts({
  canEdit,
  canCopySelected,
  hasSelectedElement,
  hasPasteableSelection,
  onClearSelection,
  onCopySelected,
  onDeleteSelected,
  onPasteSelection,
  onSetTool,
  surfaceRef,
}: UseCanvasKeyboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isCanvasShortcutScopeActive(surfaceRef.current, document.activeElement)) {
        return
      }

      const action = resolveCanvasKeyboardAction(event, {
        canCopySelected,
        hasSelectedElement,
        hasPasteableSelection,
        isEditableTarget: isEditableEventTarget(event.target),
      })

      if (!action) {
        return
      }

      if (action.type === 'set-tool' && !canEdit && action.tool !== 'hand' && action.tool !== 'select') {
        return
      }

      if (!canEdit && (
        action.type === 'copy-selected'
        || action.type === 'delete-selected'
        || action.type === 'paste-selection'
      )) {
        return
      }

      event.preventDefault()

      if (action.type === 'delete-selected') {
        onDeleteSelected()
        return
      }

      if (action.type === 'copy-selected') {
        onCopySelected()
        return
      }

      if (action.type === 'paste-selection') {
        onPasteSelection()
        return
      }

      if (action.type === 'clear-selection') {
        onClearSelection()
        onSetTool(canEdit ? 'select' : 'hand')
        return
      }

      onSetTool(action.tool)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    canCopySelected,
    canEdit,
    hasPasteableSelection,
    hasSelectedElement,
    onClearSelection,
    onCopySelected,
    onDeleteSelected,
    onPasteSelection,
    onSetTool,
    surfaceRef,
  ])
}
