import {useCallback, useRef, type Dispatch, type RefObject, type SetStateAction} from 'react'

import type {CustomFieldDefinition} from '../../fields/field.types'
import {getDefaultColumnWidth} from '../../projects/table-view-fields'
import type {ProjectTableViewDraft} from '../../projects/project-view.types'

const MIN_COLUMN_WIDTH = 96
const MAX_COLUMN_WIDTH = 600

type UseColumnResizeOptions = {
  columnKeys: string[]
  columnWidths: Record<string, number>
  containerRef: RefObject<HTMLDivElement | null>
  customFields: CustomFieldDefinition[]
  setDraft: Dispatch<SetStateAction<ProjectTableViewDraft>>
}

export function useColumnResize({
  columnKeys,
  columnWidths,
  containerRef,
  customFields,
  setDraft,
}: UseColumnResizeOptions) {
  const stateRef = useRef({
    columnKey: '',
    initialX: 0,
    isResizing: false,
    originalWidth: 0,
    rafId: 0,
  })

  // Keep latest values in refs to avoid stale closures in event handlers
  const columnKeysRef = useRef(columnKeys)
  columnKeysRef.current = columnKeys
  const columnWidthsRef = useRef(columnWidths)
  columnWidthsRef.current = columnWidths
  const customFieldsRef = useRef(customFields)
  customFieldsRef.current = customFields
  const containerRefRef = useRef(containerRef)
  containerRefRef.current = containerRef

  const buildGridTemplate = useCallback((overrideKey: string, overrideWidth: number) => {
    const keys = columnKeysRef.current
    const widths = columnWidthsRef.current
    const fields = customFieldsRef.current

    const parts = ['44px']
    for (const key of keys) {
      const width = key === overrideKey
        ? overrideWidth
        : widths[key] ?? getDefaultColumnWidth(key, fields)
      parts.push(`${width}px`)
    }
    return parts.join(' ')
  }, [])

  const handleMouseMove = useRef((event: MouseEvent) => {
    const state = stateRef.current
    if (!state.isResizing) return

    cancelAnimationFrame(state.rafId)
    state.rafId = requestAnimationFrame(() => {
      const offset = event.clientX - state.initialX
      const newWidth = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, state.originalWidth + offset))
      const container = containerRefRef.current.current
      if (container) {
        container.style.setProperty('--table-grid-columns', buildGridTemplate(state.columnKey, newWidth))
      }
    })
  })

  const handleMouseUp = useRef(() => {
    const state = stateRef.current
    if (!state.isResizing) return

    cancelAnimationFrame(state.rafId)
    state.isResizing = false
    document.removeEventListener('mousemove', handleMouseMove.current)
    document.removeEventListener('mouseup', handleMouseUp.current)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''

    // Compute final width from last known mouse position is not reliable here,
    // so read the current CSS property and parse the overridden column width.
    // Simpler: recalculate from the last mousemove event position.
    // Actually, we need to capture the final width. Let's track it in state.
  })

  // Rewrite handleMouseMove and handleMouseUp to track finalWidth
  const finalWidthRef = useRef(0)

  handleMouseMove.current = (event: MouseEvent) => {
    const state = stateRef.current
    if (!state.isResizing) return

    cancelAnimationFrame(state.rafId)
    state.rafId = requestAnimationFrame(() => {
      const offset = event.clientX - state.initialX
      const newWidth = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, state.originalWidth + offset))
      finalWidthRef.current = newWidth
      const container = containerRefRef.current.current
      if (container) {
        container.style.setProperty('--table-grid-columns', buildGridTemplate(state.columnKey, newWidth))
      }
    })
  }

  handleMouseUp.current = () => {
    const state = stateRef.current
    if (!state.isResizing) return

    cancelAnimationFrame(state.rafId)
    state.isResizing = false
    document.removeEventListener('mousemove', handleMouseMove.current)
    document.removeEventListener('mouseup', handleMouseUp.current)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''

    const columnKey = state.columnKey
    const finalWidth = finalWidthRef.current

    if (finalWidth !== state.originalWidth) {
      setDraft((current) => ({
        ...current,
        columnWidths: {...current.columnWidths, [columnKey]: finalWidth},
      }))
    }
  }

  const startResize = useCallback((columnKey: string, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    const currentWidth = columnWidthsRef.current[columnKey]
      ?? getDefaultColumnWidth(columnKey, customFieldsRef.current)

    stateRef.current = {
      columnKey,
      initialX: event.clientX,
      isResizing: true,
      originalWidth: currentWidth,
      rafId: 0,
    }
    finalWidthRef.current = currentWidth

    document.addEventListener('mousemove', handleMouseMove.current)
    document.addEventListener('mouseup', handleMouseUp.current)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
  }, [])

  return {startResize}
}
