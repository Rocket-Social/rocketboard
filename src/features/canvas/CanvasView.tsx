import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import type {DragEvent} from 'react'

import {useToast} from '../../components/ui/toast'
import {getErrorMessage} from '../../platform/data/rpc-adapter'
import {
  getPersonalCanvasViewport,
  setPersonalCanvasViewportToStorage,
} from '../projects/personal-view-storage'
import {CanvasCommentPins} from './CanvasCommentPins'
import {CanvasDrawingLayer} from './CanvasDrawingLayer'
import {CanvasElements} from './CanvasElements'
import {useCanvasElements, useCreateCanvasElement, useDeleteCanvasElement, useUpdateCanvasElement, useUploadCanvasImageElement} from './canvas.queries'
import {useCanvasRealtime} from './canvas.realtime'
import {CanvasSurface} from './CanvasSurface'
import {CanvasToolbar} from './CanvasToolbar'
import {useCanvasInteraction} from './useCanvasInteraction'
import {useCanvasKeyboardShortcuts} from './useCanvasKeyboardShortcuts'
import {DEFAULT_CANVAS_VIEWPORT, sortCanvasElements, type CanvasElementCreateInput, type CanvasElementUpdateInput, type CanvasShapeType, type CanvasToolMode, type CanvasViewport} from './canvas.types'

type CanvasViewProps = {
  canEdit: boolean
  projectId: string
  projectViewId: string
}

function resolveInitialViewport(projectViewId: string): CanvasViewport {
  return getPersonalCanvasViewport(projectViewId) ?? {...DEFAULT_CANVAS_VIEWPORT}
}

export function CanvasView({
  canEdit,
  projectId,
  projectViewId,
}: CanvasViewProps) {
  const {toast} = useToast()
  const dragDepthRef = useRef(0)
  const [viewport, setViewport] = useState<CanvasViewport>(() => resolveInitialViewport(projectViewId))
  const [activeTool, setActiveTool] = useState<CanvasToolMode>(canEdit ? 'select' : 'hand')
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [editingElementId, setEditingElementId] = useState<string | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const [noteColor, setNoteColor] = useState('#fef3c7')
  const [shapeType, setShapeType] = useState<CanvasShapeType>('rectangle')
  const [shapeFillColor, setShapeFillColor] = useState('#f2eee6')
  const [penColor, setPenColor] = useState('#17202b')
  const [penWidth, setPenWidth] = useState(3)

  const canvasQuery = useCanvasElements(projectViewId)
  const createCanvasElementMutation = useCreateCanvasElement()
  const updateCanvasElementMutation = useUpdateCanvasElement(projectViewId)
  const deleteCanvasElementMutation = useDeleteCanvasElement(projectViewId)
  const uploadCanvasImageMutation = useUploadCanvasImageElement()
  const realtimeStatus = useCanvasRealtime(projectViewId)

  const elements = useMemo(
    () => sortCanvasElements(canvasQuery.data ?? []),
    [canvasQuery.data],
  )
  const selectedElement = useMemo(
    () => elements.find((element) => element.id === selectedElementId) ?? null,
    [elements, selectedElementId],
  )

  useEffect(() => {
    setViewport(resolveInitialViewport(projectViewId))
    setActiveTool(canEdit ? 'select' : 'hand')
    setSelectedElementId(null)
    setEditingElementId(null)
  }, [canEdit, projectViewId])

  useEffect(() => {
    setPersonalCanvasViewportToStorage(projectViewId, viewport)
  }, [projectViewId, viewport])

  useEffect(() => {
    if (selectedElementId && !elements.some((element) => element.id === selectedElementId)) {
      setSelectedElementId(null)
      setEditingElementId(null)
    }
  }, [elements, selectedElementId])

  const handleCreateElement = useCallback(async (input: CanvasElementCreateInput) => {
    try {
      return await createCanvasElementMutation.mutateAsync({
        ...input,
        projectViewId,
      })
    } catch (error) {
      toast({
        title: 'Couldn’t save canvas element',
        description: getErrorMessage(error),
        variant: 'error',
      })
      throw error
    }
  }, [createCanvasElementMutation, projectViewId, toast])

  const handleUpdateElement = useCallback(async (elementId: string, updates: CanvasElementUpdateInput) => {
    try {
      return await updateCanvasElementMutation.mutateAsync({elementId, updates})
    } catch (error) {
      toast({
        title: 'Couldn’t update canvas element',
        description: getErrorMessage(error),
        variant: 'error',
      })
      throw error
    }
  }, [toast, updateCanvasElementMutation])

  const handleDeleteSelected = useCallback(() => {
    if (!selectedElementId) {
      return
    }

    const deletedElementId = selectedElementId
    setSelectedElementId(null)
    setEditingElementId(null)

    deleteCanvasElementMutation.mutate(deletedElementId, {
      onError: (error) => {
        setSelectedElementId(deletedElementId)
        toast({
          title: 'Couldn’t delete canvas element',
          description: getErrorMessage(error),
          variant: 'error',
        })
      },
    })
  }, [deleteCanvasElementMutation, selectedElementId, toast])

  const handleCommitContent = useCallback((elementId: string, content: string) => {
    const element = elements.find((entry) => entry.id === elementId)

    setEditingElementId(null)

    if (!element || (element.content ?? '') === content) {
      return
    }

    void handleUpdateElement(elementId, {content})
  }, [elements, handleUpdateElement])

  const {
    dragPreview,
    handleElementPointerDown,
    handleSurfacePointerCancel,
    handleSurfacePointerDown,
    handleSurfacePointerMove,
    handleSurfacePointerUp,
    handleSurfaceWheel,
    previewDrawing,
    previewShape,
    surfaceRef,
  } = useCanvasInteraction({
    activeTool,
    canEdit,
    elements,
    noteColor,
    onCreateElement: handleCreateElement,
    onUpdateElement: handleUpdateElement,
    penColor,
    penWidth,
    projectViewId,
    setEditingElementId,
    setSelectedElementId,
    setViewport,
    shapeFillColor,
    shapeType,
    viewport,
  })

  useCanvasKeyboardShortcuts({
    canEdit,
    hasSelectedElement: Boolean(selectedElementId),
    onClearSelection: () => {
      setSelectedElementId(null)
      setEditingElementId(null)
    },
    onDeleteSelected: handleDeleteSelected,
    onSetTool: setActiveTool,
    surfaceRef,
  })

  const handleDropFiles = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepthRef.current = 0
    setIsDragActive(false)

    if (!canEdit) {
      return
    }

    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/'))

    if (files.length === 0) {
      return
    }

    const surfaceRect = surfaceRef.current?.getBoundingClientRect()

    if (!surfaceRect) {
      return
    }

    const pointerX = event.clientX || surfaceRect.left + surfaceRect.width / 2
    const pointerY = event.clientY || surfaceRect.top + surfaceRect.height / 2
    const baseX = (pointerX - surfaceRect.left - viewport.x) / viewport.scale
    const baseY = (pointerY - surfaceRect.top - viewport.y) / viewport.scale
    const startZIndex = elements.reduce((maxZIndex, element) => Math.max(maxZIndex, element.zIndex), 0) + 1

    files.forEach((file, index) => {
      uploadCanvasImageMutation.mutate({
        file,
        projectId,
        projectViewId,
        x: baseX + index * 24,
        y: baseY + index * 24,
        zIndex: startZIndex + index,
      }, {
        onError: (error) => {
          toast({
            title: 'Couldn’t upload image',
            description: getErrorMessage(error),
            variant: 'error',
          })
        },
      })
    })
  }, [canEdit, elements, projectId, projectViewId, surfaceRef, toast, uploadCanvasImageMutation, viewport])

  const handleDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()

    if (!canEdit || !Array.from(event.dataTransfer.types).includes('Files')) {
      return
    }

    dragDepthRef.current += 1
    setIsDragActive(true)
  }, [canEdit])

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()

    if (!canEdit) {
      return
    }

    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)

    if (dragDepthRef.current === 0) {
      setIsDragActive(false)
    }
  }, [canEdit])

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
  }, [])

  return (
    <div className='relative h-full min-h-[640px] w-full overflow-hidden rounded-[24px] border border-border-subtle bg-canvas shadow-panel'>
      <CanvasSurface
        canEdit={canEdit}
        empty={elements.length === 0}
        errorMessage={canvasQuery.error ? getErrorMessage(canvasQuery.error) : null}
        isDragActive={isDragActive}
        isLoading={canvasQuery.isPending}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDropFiles={handleDropFiles}
        onPointerCancel={handleSurfacePointerCancel}
        onPointerDown={handleSurfacePointerDown}
        onPointerMove={handleSurfacePointerMove}
        onPointerUp={handleSurfacePointerUp}
        onRetry={() => void canvasQuery.refetch()}
        onWheel={handleSurfaceWheel}
        surfaceRef={surfaceRef}
        viewport={viewport}
      >
        <CanvasDrawingLayer
          canEdit={canEdit}
          dragPreview={dragPreview}
          elements={elements}
          onElementPointerDown={handleElementPointerDown}
          previewDrawing={previewDrawing}
          previewShape={previewShape}
          selectedElementId={selectedElementId}
        />
        <CanvasElements
          canEdit={canEdit}
          dragPreview={dragPreview}
          editingElementId={editingElementId}
          elements={elements}
          onCommitContent={handleCommitContent}
          onElementPointerDown={handleElementPointerDown}
          onStartEditing={setEditingElementId}
          selectedElementId={selectedElementId}
        />
        <CanvasCommentPins
          canEdit={canEdit}
          dragPreview={dragPreview}
          editingElementId={editingElementId}
          elements={elements}
          onCommitContent={handleCommitContent}
          onElementPointerDown={handleElementPointerDown}
          onStartEditing={setEditingElementId}
          selectedElementId={selectedElementId}
        />
      </CanvasSurface>

      <CanvasToolbar
        activeTool={activeTool}
        canEdit={canEdit}
        noteColor={noteColor}
        onNoteColorChange={setNoteColor}
        onPenColorChange={setPenColor}
        onPenWidthChange={setPenWidth}
        onSelectTool={setActiveTool}
        onShapeFillColorChange={setShapeFillColor}
        onShapeTypeChange={setShapeType}
        penColor={penColor}
        penWidth={penWidth}
        shapeFillColor={shapeFillColor}
        shapeType={shapeType}
      />

      {selectedElement && canEdit ? (
        <div className='absolute right-4 top-4 z-20 flex items-center gap-2 rounded-2xl bg-surface-elevated/90 px-3 py-2 text-xs font-medium text-text-medium shadow-panel backdrop-blur-sm'>
          <span>{selectedElement.elementType}</span>
          <button
            className='rounded-lg bg-error px-2 py-1 text-white'
            onClick={handleDeleteSelected}
            type='button'
          >
            Delete
          </button>
        </div>
      ) : null}

      {realtimeStatus !== 'ready' ? (
        <div className='absolute bottom-4 right-4 z-20 rounded-full bg-surface-elevated/90 px-3 py-1.5 text-xs font-medium text-text-medium shadow-panel backdrop-blur-sm'>
          {realtimeStatus === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
        </div>
      ) : null}

      {!canEdit ? (
        <div className='absolute left-4 top-4 z-20 rounded-full bg-surface-elevated/90 px-3 py-1.5 text-xs font-medium text-text-medium shadow-panel backdrop-blur-sm'>
          View-only canvas
        </div>
      ) : null}
    </div>
  )
}
