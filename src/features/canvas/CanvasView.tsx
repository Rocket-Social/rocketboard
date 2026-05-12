import type {Editor} from '@tiptap/react'
import {useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type SetStateAction} from 'react'

import {useToast} from '../../components/ui/toast'
import {getErrorMessage} from '../../platform/data/rpc-adapter'
import {stringifyRichTextDocument} from '../rich-text/rich-text'
import {
  getPersonalCanvasViewport,
  setPersonalCanvasViewportToStorage,
} from '../projects/personal-view-storage'
import {useAutoSavePersonalConfig} from '../shell/hooks/useAutoSavePersonalConfig'
import {CanvasCommentPins} from './CanvasCommentPins'
import {CanvasDrawingLayer, resolveCanvasFrame} from './CanvasDrawingLayer'
import {CanvasElements} from './CanvasElements'
import {CanvasShapeContextToolbar} from './CanvasShapeContextToolbar'
import {
  type CanvasShapeEditorDraft,
  type CanvasShapeTextFocusRequest,
  type CanvasShapeTextFocusTarget,
  resolveCanvasShapeRichTextDocument,
} from './CanvasShapeText'
import {
  copyCanvasShape,
  resolveCanvasPastePlacement,
  type CanvasClipboardPlacementState,
  type CanvasClipboardShape,
} from './canvas-clipboard'
import {useCanvasElements, useCreateCanvasElement, useDeleteCanvasElements, useUpdateCanvasElement, useUpdateCanvasElements, useUploadCanvasImageElement} from './canvas.queries'
import {useCanvasRealtime} from './canvas.realtime'
import {CanvasSurface} from './CanvasSurface'
import {CanvasToolbar} from './CanvasToolbar'
import {CanvasZoomControl} from './CanvasZoomControl'
import {useCanvasInteraction} from './useCanvasInteraction'
import {useCanvasKeyboardShortcuts} from './useCanvasKeyboardShortcuts'
import {getCanvasViewportForFit, getCanvasViewportForZoom, normalizeCanvasViewport} from './canvas-viewport'
import {
  DEFAULT_CANVAS_SHAPE_FILL_COLOR,
  DEFAULT_CANVAS_VIEWPORT,
  getCanvasOverlayZIndex,
  sortCanvasElements,
  withCanvasShapeDefaultTextAlignment,
  type CanvasElement,
  type CanvasElementBatchUpdateInput,
  type CanvasElementCreateInput,
  type CanvasElementStyle,
  type CanvasElementUpdateInput,
  type CanvasShapeType,
  type CanvasToolMode,
  type CanvasViewport,
} from './canvas.types'

type CanvasViewProps = {
  canEdit: boolean
  projectId: string
  projectViewId: string
}

type CanvasViewportState = {
  viewId: string
  viewport: CanvasViewport
}

type ShapeEditingStyleDraft = {
  elementId: string
  style: CanvasElementStyle
}

type ShapeEditingCommitState = {
  closeSessionKey: number | null
  elementId: string
  promise: Promise<boolean>
  shouldCloseAfterCommit: boolean
}

type ShapeEditingSnapshot = {
  content: string
  richText: string
  style: string
}

type CanvasClipboardState = {
  lastPlacement: CanvasClipboardPlacementState | null
  shape: CanvasClipboardShape
}

const CANVAS_VIEWPORT_AUTO_SAVE_DEBOUNCE_MS = 200
const CANVAS_SHAPE_STYLE_MISSING_SENTINEL = '__canvas-shape-style-missing__'

function resolveInitialViewport(projectViewId: string): CanvasViewport {
  return normalizeCanvasViewport(getPersonalCanvasViewport(projectViewId)) ?? {...DEFAULT_CANVAS_VIEWPORT}
}

function resolveCanvasShapeStyleSnapshot(style: CanvasElementStyle) {
  return JSON.stringify([
    style.fill_color === undefined ? CANVAS_SHAPE_STYLE_MISSING_SENTINEL : style.fill_color,
    style.shape_type === undefined ? CANVAS_SHAPE_STYLE_MISSING_SENTINEL : style.shape_type,
    style.stroke_color === undefined ? CANVAS_SHAPE_STYLE_MISSING_SENTINEL : style.stroke_color,
    style.stroke_opacity === undefined ? CANVAS_SHAPE_STYLE_MISSING_SENTINEL : style.stroke_opacity,
    style.stroke_style === undefined ? CANVAS_SHAPE_STYLE_MISSING_SENTINEL : style.stroke_style,
    style.stroke_width === undefined ? CANVAS_SHAPE_STYLE_MISSING_SENTINEL : style.stroke_width,
    style.text_align === undefined ? CANVAS_SHAPE_STYLE_MISSING_SENTINEL : style.text_align,
    style.text_family === undefined ? CANVAS_SHAPE_STYLE_MISSING_SENTINEL : style.text_family,
    style.text_size === undefined ? CANVAS_SHAPE_STYLE_MISSING_SENTINEL : style.text_size,
  ])
}

function createShapeEditingSnapshot({
  content,
  richText,
  style,
}: {
  content: string | null | undefined
  richText: CanvasShapeEditorDraft['richText']
  style: CanvasElementStyle
}): ShapeEditingSnapshot {
  const normalizedContent = content ?? ''

  return {
    content: normalizedContent,
    richText: stringifyRichTextDocument(richText, normalizedContent),
    style: resolveCanvasShapeStyleSnapshot(style),
  }
}

function areShapeEditingSnapshotsEqual(left: ShapeEditingSnapshot, right: ShapeEditingSnapshot) {
  return left.content === right.content
    && left.richText === right.richText
    && left.style === right.style
}

export function CanvasView({
  canEdit,
  projectId,
  projectViewId,
}: CanvasViewProps) {
  const {toast} = useToast()
  const dragDepthRef = useRef(0)
  const initialViewport = useMemo(() => resolveInitialViewport(projectViewId), [projectViewId])
  const [viewportState, setViewportState] = useState<CanvasViewportState>(() => ({
    viewId: projectViewId,
    viewport: initialViewport,
  }))
  const [activeTool, setActiveTool] = useState<CanvasToolMode>(canEdit ? 'select' : 'hand')
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([])
  const [editingElementId, setEditingElementId] = useState<string | null>(null)
  const elementsRef = useRef<CanvasElement[]>([])
  const shapeTextCommitRef = useRef<ShapeEditingCommitState | null>(null)
  const shapeTextAcknowledgedSnapshotRef = useRef<{
    elementId: string
    snapshot: ShapeEditingSnapshot
  } | null>(null)
  const shapeTextSessionKeyRef = useRef(0)
  const shapeTextSessionRevisionRef = useRef(0)
  const nextEditingRequestKeyRef = useRef(0)
  const nextShapeTextFocusRequestKeyRef = useRef(0)
  const nextSurfaceFocusRequestKeyRef = useRef(0)
  const shapeTextDraftRef = useRef<({elementId: string} & CanvasShapeEditorDraft) | null>(null)
  const shapeEditingStyleDraftRef = useRef<ShapeEditingStyleDraft | null>(null)
  const [shapeTextDraft, setShapeTextDraft] = useState<({elementId: string} & CanvasShapeEditorDraft) | null>(null)
  const [shapeEditingStyleDraft, setShapeEditingStyleDraft] = useState<ShapeEditingStyleDraft | null>(null)
  const [shapeTextEditor, setShapeTextEditor] = useState<Editor | null>(null)
  const [shapeTextFocusRequest, setShapeTextFocusRequest] = useState<({elementId: string} & CanvasShapeTextFocusRequest) | null>(null)
  const [surfaceFocusRequestKey, setSurfaceFocusRequestKey] = useState(0)
  const [isDragActive, setIsDragActive] = useState(false)
  const [isShiftPressed, setIsShiftPressed] = useState(false)
  const [isShapeToolbarSuppressedBySpacing, setIsShapeToolbarSuppressedBySpacing] = useState(false)
  const [noteColor, setNoteColor] = useState('#fef3c7')
  const [shapeType, setShapeType] = useState<CanvasShapeType>('rectangle')
  const [shapeFillColor, setShapeFillColor] = useState(DEFAULT_CANVAS_SHAPE_FILL_COLOR)
  const [penColor, setPenColor] = useState('#17202b')
  const [penWidth, setPenWidth] = useState(3)
  const copiedShapeRef = useRef<CanvasClipboardState | null>(null)
  const [copiedShape, setCopiedShape] = useState<CanvasClipboardState | null>(null)

  const canvasQuery = useCanvasElements(projectViewId)
  const createCanvasElementMutation = useCreateCanvasElement()
  const updateCanvasElementMutation = useUpdateCanvasElement(projectViewId)
  const updateCanvasElementsMutation = useUpdateCanvasElements(projectViewId)
  const deleteCanvasElementsMutation = useDeleteCanvasElements(projectViewId)
  const uploadCanvasImageMutation = useUploadCanvasImageElement()
  const realtimeStatus = useCanvasRealtime(projectViewId)

  const elements = useMemo(
    () => sortCanvasElements(canvasQuery.data ?? []),
    [canvasQuery.data],
  )
  const setSelectedElementId = useCallback((elementId: string | null) => {
    setSelectedElementIds(elementId ? [elementId] : [])
  }, [])
  const selectedElements = useMemo(() => {
    const elementById = new Map(elements.map((element) => [element.id, element]))

    return selectedElementIds
      .map((elementId) => elementById.get(elementId))
      .filter((element): element is CanvasElement => Boolean(element))
  }, [elements, selectedElementIds])
  const selectedElementId = selectedElementIds.length === 1 ? selectedElementIds[0] : null
  const selectedElement = useMemo(
    () => selectedElements.length === 1 ? selectedElements[0] : null,
    [selectedElements],
  )
  const selectedShape = useMemo(
    () => selectedElement?.elementType === 'shape' ? selectedElement : null,
    [selectedElement],
  )
  const isViewportReady = viewportState.viewId === projectViewId
  const viewport = isViewportReady ? viewportState.viewport : initialViewport

  const setShapeEditingStyleDraftState = useCallback((
    nextStyleDraft: SetStateAction<ShapeEditingStyleDraft | null>,
  ) => {
    const resolvedStyleDraft = typeof nextStyleDraft === 'function'
      ? (nextStyleDraft as (
          currentStyleDraft: ShapeEditingStyleDraft | null,
        ) => ShapeEditingStyleDraft | null)(shapeEditingStyleDraftRef.current)
      : nextStyleDraft

    shapeEditingStyleDraftRef.current = resolvedStyleDraft
    setShapeEditingStyleDraft(resolvedStyleDraft)
  }, [])

  const setShapeTextDraftState = useCallback((
    nextDraft: SetStateAction<({elementId: string} & CanvasShapeEditorDraft) | null>,
  ) => {
    const resolvedDraft = typeof nextDraft === 'function'
      ? (nextDraft as (
          currentDraft: ({elementId: string} & CanvasShapeEditorDraft) | null,
        ) => ({elementId: string} & CanvasShapeEditorDraft) | null)(shapeTextDraftRef.current)
      : nextDraft

    shapeTextDraftRef.current = resolvedDraft
    setShapeTextDraft(resolvedDraft)
  }, [])

  const setCopiedShapeState = useCallback((
    nextCopiedShape: SetStateAction<CanvasClipboardState | null>,
  ) => {
    const resolvedCopiedShape = typeof nextCopiedShape === 'function'
      ? (nextCopiedShape as (
          currentCopiedShape: CanvasClipboardState | null,
        ) => CanvasClipboardState | null)(copiedShapeRef.current)
      : nextCopiedShape

    copiedShapeRef.current = resolvedCopiedShape
    setCopiedShape(resolvedCopiedShape)
  }, [])

  const markShapeTextSessionDirty = useCallback(() => {
    shapeTextSessionRevisionRef.current += 1
    return shapeTextSessionRevisionRef.current
  }, [])

  useEffect(() => {
    elementsRef.current = elements
  }, [elements])

  useEffect(() => {
    setViewportState({
      viewId: projectViewId,
      viewport: initialViewport,
    })
    setActiveTool(canEdit ? 'select' : 'hand')
    setSelectedElementIds([])
    setEditingElementId(null)
    setShapeTextDraftState(null)
    setShapeEditingStyleDraftState(null)
    setShapeTextEditor(null)
    setShapeTextFocusRequest(null)
    shapeTextAcknowledgedSnapshotRef.current = null
    shapeTextCommitRef.current = null
    shapeTextSessionKeyRef.current += 1
    shapeTextSessionRevisionRef.current = 0
    setCopiedShapeState(null)
  }, [canEdit, initialViewport, projectViewId, setCopiedShapeState, setShapeEditingStyleDraftState, setShapeTextDraftState])

  const setViewport = useCallback((updater: CanvasViewport | ((current: CanvasViewport) => CanvasViewport)) => {
    setViewportState((currentState) => {
      const currentViewport = currentState.viewId === projectViewId ? currentState.viewport : initialViewport
      const nextViewport = typeof updater === 'function' ? updater(currentViewport) : updater

      return {
        viewId: projectViewId,
        viewport: nextViewport,
      }
    })
  }, [initialViewport, projectViewId])

  useAutoSavePersonalConfig(projectViewId, viewport, setPersonalCanvasViewportToStorage, {
    debounceMs: CANVAS_VIEWPORT_AUTO_SAVE_DEBOUNCE_MS,
    enabled: isViewportReady,
    flushOnViewChange: true,
  })

  useEffect(() => {
    const elementIdSet = new Set(elements.map((element) => element.id))
    const nextSelectedElementIds = selectedElementIds.filter((elementId) => elementIdSet.has(elementId))
    const didSelectionLoseElements = nextSelectedElementIds.length !== selectedElementIds.length
    const didEditingElementDisappear = Boolean(editingElementId && !elementIdSet.has(editingElementId))

    if (didSelectionLoseElements) {
      setSelectedElementIds(nextSelectedElementIds)
    }

    if (didSelectionLoseElements || didEditingElementDisappear) {
      if (didEditingElementDisappear) {
        setEditingElementId(null)
      }
      setShapeTextDraftState(null)
      setShapeEditingStyleDraftState(null)
      setShapeTextEditor(null)
      setShapeTextFocusRequest(null)
      shapeTextAcknowledgedSnapshotRef.current = null
      shapeTextSessionKeyRef.current += 1
    }
  }, [editingElementId, elements, selectedElementIds, setShapeEditingStyleDraftState, setShapeTextDraftState])

  const ensureShapeEditingLocalState = useCallback((shape: CanvasElement) => {
    const normalizedShapeStyle = withCanvasShapeDefaultTextAlignment(shape.style)
    const nextDraft = shapeTextDraftRef.current?.elementId === shape.id
      ? shapeTextDraftRef.current
      : {
          content: shape.content ?? '',
          elementId: shape.id,
          richText: resolveCanvasShapeRichTextDocument(shape.style, shape.content),
        }
    const nextStyleDraft = shapeEditingStyleDraftRef.current?.elementId === shape.id
      ? shapeEditingStyleDraftRef.current
      : {
          elementId: shape.id,
          style: normalizedShapeStyle,
        }

    if (shapeTextDraftRef.current?.elementId !== shape.id) {
      setShapeTextDraftState(nextDraft)
    }

    if (shapeEditingStyleDraftRef.current?.elementId !== shape.id) {
      setShapeEditingStyleDraftState(nextStyleDraft)
    }

    if (shapeTextAcknowledgedSnapshotRef.current?.elementId !== shape.id) {
      shapeTextAcknowledgedSnapshotRef.current = {
        elementId: shape.id,
        snapshot: createShapeEditingSnapshot({
          content: shape.content,
          richText: nextDraft.richText,
          style: normalizedShapeStyle,
        }),
      }
    }

    return {
      draft: nextDraft,
      style: nextStyleDraft.style,
    }
  }, [setShapeEditingStyleDraftState, setShapeTextDraftState])

  useEffect(() => {
    if (!editingElementId) {
      return
    }

    const editingShape = elements.find((element) => element.id === editingElementId && element.elementType === 'shape')

    if (!editingShape) {
      return
    }

    ensureShapeEditingLocalState(editingShape)
  }, [editingElementId, elements, ensureShapeEditingLocalState])

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

  const handleUpdateElements = useCallback(async (inputs: CanvasElementBatchUpdateInput[]) => {
    try {
      return await updateCanvasElementsMutation.mutateAsync(inputs)
    } catch (error) {
      toast({
        title: 'Couldn’t update canvas elements',
        description: getErrorMessage(error),
        variant: 'error',
      })
      throw error
    }
  }, [toast, updateCanvasElementsMutation])

  const clearShapeTextSession = useCallback((elementId: string | null) => {
    if (!elementId) {
      return
    }

    setShapeTextDraftState((current) => current?.elementId === elementId ? null : current)
    setShapeEditingStyleDraftState((current) => current?.elementId === elementId ? null : current)
    setShapeTextFocusRequest((current) => current?.elementId === elementId ? null : current)
    setShapeTextEditor(null)
    if (shapeTextAcknowledgedSnapshotRef.current?.elementId === elementId) {
      shapeTextAcknowledgedSnapshotRef.current = null
    }
  }, [setShapeEditingStyleDraftState, setShapeTextDraftState])

  const markShapeTextSessionOpen = useCallback((elementId: string | null) => {
    if (!elementId) {
      return
    }

    shapeTextSessionKeyRef.current += 1

    if (shapeTextCommitRef.current?.elementId === elementId) {
      shapeTextCommitRef.current.shouldCloseAfterCommit = false
      shapeTextCommitRef.current.closeSessionKey = null
    }
  }, [])

  const createShapeTextFocusRequest = useCallback((elementId: string, focusTarget: CanvasShapeTextFocusTarget) => {
    nextShapeTextFocusRequestKeyRef.current += 1

    return {
      ...focusTarget,
      elementId,
      requestKey: nextShapeTextFocusRequestKeyRef.current,
    } satisfies {elementId: string} & CanvasShapeTextFocusRequest
  }, [])

  const requestCanvasSurfaceFocus = useCallback(() => {
    nextSurfaceFocusRequestKeyRef.current += 1
    setSurfaceFocusRequestKey(nextSurfaceFocusRequestKeyRef.current)
  }, [])

  const flushShapeTextSession = useCallback((
    elementId: string | null,
    options: {
      closeAfterCommit?: boolean
    } = {},
  ) => {
    if (!elementId) {
      return Promise.resolve(true)
    }

    const activeCommit = shapeTextCommitRef.current

    if (activeCommit?.elementId === elementId) {
      if (options.closeAfterCommit) {
        activeCommit.shouldCloseAfterCommit = true
        activeCommit.closeSessionKey = shapeTextSessionKeyRef.current
      }
      return activeCommit.promise
    }

    const commitState: ShapeEditingCommitState = {
      closeSessionKey: options.closeAfterCommit ? shapeTextSessionKeyRef.current : null,
      elementId,
      promise: Promise.resolve(true),
      shouldCloseAfterCommit: options.closeAfterCommit === true,
    }

    const commitPromise = (async () => {
      while (true) {
        const element = elementsRef.current.find((entry) => entry.id === elementId && entry.elementType === 'shape')

        if (!element) {
          clearShapeTextSession(elementId)
          return true
        }

        const latestDraft = shapeTextDraftRef.current?.elementId === elementId
          ? shapeTextDraftRef.current
          : {
              content: element.content ?? '',
              elementId,
              richText: resolveCanvasShapeRichTextDocument(element.style, element.content),
            }
        const latestStyle = shapeEditingStyleDraftRef.current?.elementId === elementId
          ? shapeEditingStyleDraftRef.current.style
          : element.style
        const nextSnapshot = createShapeEditingSnapshot({
          content: latestDraft.content,
          richText: latestDraft.richText,
          style: latestStyle,
        })
        const acknowledgedSnapshot = shapeTextAcknowledgedSnapshotRef.current?.elementId === elementId
          ? shapeTextAcknowledgedSnapshotRef.current.snapshot
          : null
        const elementSnapshot = createShapeEditingSnapshot({
          content: element.content,
          richText: resolveCanvasShapeRichTextDocument(element.style, element.content),
          style: element.style,
        })
        const commitRevision = shapeTextSessionRevisionRef.current

        if (
          areShapeEditingSnapshotsEqual(elementSnapshot, nextSnapshot)
          || (acknowledgedSnapshot ? areShapeEditingSnapshotsEqual(acknowledgedSnapshot, nextSnapshot) : false)
        ) {
          if (
            commitState.shouldCloseAfterCommit
            && commitState.closeSessionKey === shapeTextSessionKeyRef.current
          ) {
            clearShapeTextSession(elementId)
          }
          return true
        }

        try {
          await handleUpdateElement(elementId, {
            content: latestDraft.content,
            style: {
              ...latestStyle,
              rich_text: latestDraft.richText,
            },
          })
        } catch {
          if (shapeTextDraftRef.current?.elementId === elementId) {
            setSelectedElementId(elementId)
          }
          return false
        }

        shapeTextAcknowledgedSnapshotRef.current = {
          elementId,
          snapshot: nextSnapshot,
        }

        if (shapeTextSessionRevisionRef.current !== commitRevision) {
          continue
        }

        if (
          commitState.shouldCloseAfterCommit
          && commitState.closeSessionKey === shapeTextSessionKeyRef.current
        ) {
          clearShapeTextSession(elementId)
        }
        return true
      }
    })()

    commitState.promise = commitPromise
    shapeTextCommitRef.current = commitState

    return commitPromise.finally(() => {
      if (shapeTextCommitRef.current === commitState) {
        shapeTextCommitRef.current = null
      }
    })
  }, [clearShapeTextSession, handleUpdateElement])

  const handleSetEditingElementId = useCallback((
    nextElementId: string | null,
    focusTarget: CanvasShapeTextFocusTarget = {mode: 'end'},
    options: {
      focusSurfaceAfterClose?: boolean
    } = {},
  ) => {
    nextEditingRequestKeyRef.current += 1

    const requestKey = nextEditingRequestKeyRef.current

    if (nextElementId && nextElementId === editingElementId) {
      markShapeTextSessionOpen(nextElementId)
      if (focusTarget.mode === 'pointer') {
        setShapeTextFocusRequest(createShapeTextFocusRequest(nextElementId, focusTarget))
      }
      return
    }

    const applyEditingTarget = () => {
      if (nextEditingRequestKeyRef.current !== requestKey) {
        return
      }

      if (!nextElementId) {
        setEditingElementId(null)
        setShapeTextFocusRequest(null)
        if (options.focusSurfaceAfterClose) {
          requestCanvasSurfaceFocus()
        }
        return
      }

      markShapeTextSessionOpen(nextElementId)
      setShapeTextFocusRequest(createShapeTextFocusRequest(nextElementId, focusTarget))
      setEditingElementId(nextElementId)
    }

    if (editingElementId && editingElementId !== nextElementId) {
      void (async () => {
        const didCommit = await flushShapeTextSession(editingElementId, {closeAfterCommit: true})

        if (!didCommit) {
          return
        }

        applyEditingTarget()
      })()
      return
    }

    applyEditingTarget()
  }, [createShapeTextFocusRequest, editingElementId, flushShapeTextSession, markShapeTextSessionOpen, requestCanvasSurfaceFocus])

  const handleUpdateSelectedShapeStyle = useCallback((styleUpdates: Partial<CanvasElementStyle>) => {
    if (!selectedShape) {
      return
    }

    if (editingElementId === selectedShape.id) {
      const sessionState = ensureShapeEditingLocalState(selectedShape)
      const nextStyle = {
        ...withCanvasShapeDefaultTextAlignment(sessionState.style),
        ...styleUpdates,
      }

      if (resolveCanvasShapeStyleSnapshot(nextStyle) === resolveCanvasShapeStyleSnapshot(sessionState.style)) {
        return
      }

      markShapeTextSessionOpen(selectedShape.id)
      markShapeTextSessionDirty()
      setShapeEditingStyleDraftState({
        elementId: selectedShape.id,
        style: nextStyle,
      })
      void flushShapeTextSession(selectedShape.id)
      return
    }

    const nextStyle = {
      ...withCanvasShapeDefaultTextAlignment(selectedShape.style),
      ...styleUpdates,
    }

    if (resolveCanvasShapeStyleSnapshot(nextStyle) === resolveCanvasShapeStyleSnapshot(selectedShape.style)) {
      return
    }

    void handleUpdateElement(selectedShape.id, {
      style: nextStyle,
    })
  }, [
    editingElementId,
    ensureShapeEditingLocalState,
    flushShapeTextSession,
    handleUpdateElement,
    markShapeTextSessionDirty,
    markShapeTextSessionOpen,
    selectedShape,
    setShapeEditingStyleDraftState,
  ])

  const handleExitShapeTextEditing = useCallback(() => {
    handleSetEditingElementId(null, {mode: 'end'}, {focusSurfaceAfterClose: true})
  }, [handleSetEditingElementId])

  const handleDeleteSelected = useCallback(() => {
    if (selectedElementIds.length === 0) {
      return
    }

    const deletedElementIds = selectedElementIds
    setSelectedElementIds([])
    setEditingElementId(null)
    deletedElementIds.forEach((elementId) => clearShapeTextSession(elementId))
    shapeTextSessionKeyRef.current += 1

    deleteCanvasElementsMutation.mutate(deletedElementIds, {
      onError: (error) => {
        setSelectedElementIds(deletedElementIds)
        toast({
          title: 'Couldn’t delete canvas elements',
          description: getErrorMessage(error),
          variant: 'error',
        })
      },
    })
  }, [clearShapeTextSession, deleteCanvasElementsMutation, selectedElementIds, toast])

  const handleCopySelected = useCallback(() => {
    if (!selectedElement) {
      return
    }

    const nextCopiedShape = copyCanvasShape(selectedElement)

    if (!nextCopiedShape) {
      return
    }

    setCopiedShapeState({
      lastPlacement: null,
      shape: nextCopiedShape,
    })
  }, [selectedElement, setCopiedShapeState])

  const handleCommitContent = useCallback((elementId: string, content: string) => {
    const element = elements.find((entry) => entry.id === elementId)

    handleSetEditingElementId(null)

    if (!element || (element.content ?? '') === content) {
      return
    }

    void handleUpdateElement(elementId, {content})
  }, [elements, handleSetEditingElementId, handleUpdateElement])
  const handleSelectionLimitExceeded = useCallback((limit: number) => {
    toast({
      title: `Select up to ${limit} objects`,
      description: 'Move or delete the current selection, then select more.',
    })
  }, [toast])

  const {
    handleElementPointerDown,
    handleResizeHandlePointerDown,
    handleSurfacePointerCancel,
    handleSurfacePointerDown,
    handleSurfacePointerMove,
    handleSurfacePointerUp,
    handleSurfaceWheel,
    getLastPointerCanvasPosition,
    previewDrawing,
    previewSelectionMarquee,
    previewShape,
    surfaceRef,
    transformPreview,
    transformPreviews,
  } = useCanvasInteraction({
    activeTool,
    canEdit,
    elements,
    noteColor,
    onCreateElement: handleCreateElement,
    onSelectionLimitExceeded: handleSelectionLimitExceeded,
    onUpdateElement: handleUpdateElement,
    onUpdateElements: handleUpdateElements,
    penColor,
    penWidth,
    projectViewId,
    selectedElementIds,
    setEditingElementId: handleSetEditingElementId,
    setSelectedElementId,
    setSelectedElementIds,
    setViewport,
    shapeFillColor,
    shapeType,
    viewport,
  })
  const hasSpacingGuides = (transformPreview?.guides?.spacing.length ?? 0) > 0

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        setIsShiftPressed(true)
      }
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        setIsShiftPressed(false)
      }
    }
    const handleWindowBlur = () => {
      setIsShiftPressed(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [])

  useEffect(() => {
    if (isShiftPressed && hasSpacingGuides) {
      setIsShapeToolbarSuppressedBySpacing(true)
      return
    }

    if (!isShiftPressed) {
      setIsShapeToolbarSuppressedBySpacing(false)
    }
  }, [hasSpacingGuides, isShiftPressed])

  useEffect(() => {
    if (!selectedShape) {
      setIsShapeToolbarSuppressedBySpacing(false)
    }
  }, [selectedShape])
  const shouldHideShapeToolbarForSpacing = hasSpacingGuides || isShapeToolbarSuppressedBySpacing

  const resolveCanvasSurfaceSize = useCallback(() => {
    const surfaceRect = surfaceRef.current?.getBoundingClientRect()

    if (!surfaceRect) {
      return null
    }

    return {
      height: surfaceRect.height,
      width: surfaceRect.width,
    }
  }, [surfaceRef])

  const handleZoomChange = useCallback((scale: number) => {
    const surfaceSize = resolveCanvasSurfaceSize()

    setViewport((currentViewport) => getCanvasViewportForZoom(currentViewport, scale, surfaceSize))
    requestCanvasSurfaceFocus()
  }, [requestCanvasSurfaceFocus, resolveCanvasSurfaceSize, setViewport])

  const handleZoomFit = useCallback(() => {
    const surfaceSize = resolveCanvasSurfaceSize()
    const frames = elements.map((element) => resolveCanvasFrame(element, null))

    setViewport(getCanvasViewportForFit(frames, surfaceSize))
    requestCanvasSurfaceFocus()
  }, [elements, requestCanvasSurfaceFocus, resolveCanvasSurfaceSize, setViewport])

  useEffect(() => {
    if (surfaceFocusRequestKey === 0) {
      return
    }

    const requestKey = surfaceFocusRequestKey
    const frameId = requestAnimationFrame(() => {
      surfaceRef.current?.focus()
      setSurfaceFocusRequestKey((current) => current === requestKey ? 0 : current)
    })

    return () => cancelAnimationFrame(frameId)
  }, [surfaceFocusRequestKey, surfaceRef])

  const selectedShapeFrame = useMemo(
    () => (selectedShape ? resolveCanvasFrame(selectedShape, transformPreview) : null),
    [selectedShape, transformPreview],
  )
  const selectedShapeStyle = useMemo(() => {
    if (!selectedShape) {
      return null
    }

    return shapeEditingStyleDraft?.elementId === selectedShape.id
      ? shapeEditingStyleDraft.style
      : selectedShape.style
  }, [selectedShape, shapeEditingStyleDraft])
  const shapeToolbarZIndex = useMemo(() => getCanvasOverlayZIndex(elements, 2), [elements])

  const handlePasteShape = useCallback(() => {
    const clipboard = copiedShapeRef.current

    if (!canEdit || !clipboard) {
      return
    }

    const placement = resolveCanvasPastePlacement(clipboard.shape, {
      lastPlacement: clipboard.lastPlacement,
      lastPointerPosition: getLastPointerCanvasPosition(),
    })
    const nextClipboard: CanvasClipboardState = {
      ...clipboard,
      lastPlacement: placement.nextPlacement,
    }

    // Advance the clipboard cursor before awaiting persistence so repeated
    // paste shortcuts never reuse stale placement state.
    setCopiedShapeState(nextClipboard)

    void handleCreateElement({
      content: clipboard.shape.content,
      elementType: clipboard.shape.elementType,
      height: clipboard.shape.height,
      pathData: clipboard.shape.pathData,
      projectViewId: clipboard.shape.projectViewId,
      style: {...clipboard.shape.style},
      url: clipboard.shape.url,
      width: clipboard.shape.width,
      x: placement.x,
      y: placement.y,
      zIndex: elements.reduce((maxZIndex, element) => Math.max(maxZIndex, element.zIndex), 0) + 1,
    }).then((element) => {
      setSelectedElementId(element.id)
      handleSetEditingElementId(null)
    }).catch(() => undefined)
  }, [canEdit, elements, getLastPointerCanvasPosition, handleCreateElement, handleSetEditingElementId, setCopiedShapeState])

  useCanvasKeyboardShortcuts({
    canEdit,
    canCopySelected: canEdit && selectedElement?.elementType === 'shape',
    hasSelectedElement: selectedElementIds.length > 0,
    hasPasteableSelection: Boolean(copiedShape),
    onClearSelection: () => {
      setSelectedElementIds([])
      handleSetEditingElementId(null)
    },
    onCopySelected: handleCopySelected,
    onDeleteSelected: handleDeleteSelected,
    onPasteSelection: handlePasteShape,
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
    <div className='relative h-full min-h-[min(640px,100%)] w-full overflow-hidden rounded-[24px] border border-border-subtle bg-canvas shadow-panel'>
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
          editingElementId={editingElementId}
          elements={elements}
          onElementPointerDown={handleElementPointerDown}
          onResizeHandlePointerDown={handleResizeHandlePointerDown}
          onShapeClick={(element, focusTarget) => {
            if (activeTool === 'select') {
              handleSetEditingElementId(element.id, focusTarget)
            }
          }}
          onShapeEditorEscape={handleExitShapeTextEditing}
          onShapeEditorReady={setShapeTextEditor}
          onShapeTextDraftChange={(elementId, draft) => {
            markShapeTextSessionDirty()
            setShapeTextDraftState({elementId, ...draft})
          }}
          previewDrawing={previewDrawing}
          previewSelectionMarquee={previewSelectionMarquee}
          previewShape={previewShape}
          selectedElementId={selectedElementId}
          selectedElementIds={selectedElementIds}
          shapeEditingStyleDraft={shapeEditingStyleDraft}
          shapeTextFocusRequest={shapeTextFocusRequest}
          shapeTextDraft={shapeTextDraft}
          showShapeSelectionHandles={canEdit && activeTool === 'select'}
          transformPreview={transformPreview}
          transformPreviews={transformPreviews}
        />
        <CanvasElements
          canEdit={canEdit}
          editingElementId={editingElementId}
          elements={elements}
          onCommitContent={handleCommitContent}
          onElementPointerDown={handleElementPointerDown}
          onStartEditing={handleSetEditingElementId}
          selectedElementId={selectedElementId}
          selectedElementIds={selectedElementIds}
          transformPreview={transformPreview}
          transformPreviews={transformPreviews}
        />
        <CanvasCommentPins
          canEdit={canEdit}
          editingElementId={editingElementId}
          elements={elements}
          onCommitContent={handleCommitContent}
          onElementPointerDown={handleElementPointerDown}
          onStartEditing={handleSetEditingElementId}
          selectedElementId={selectedElementId}
          selectedElementIds={selectedElementIds}
          transformPreview={transformPreview}
          transformPreviews={transformPreviews}
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

      {selectedShape && selectedShapeFrame && canEdit && activeTool === 'select' && !shouldHideShapeToolbarForSpacing ? (
        <CanvasShapeContextToolbar
          editor={editingElementId === selectedShape.id ? shapeTextEditor : null}
          editing={editingElementId === selectedShape.id}
          left={viewport.x + (selectedShapeFrame.x + selectedShapeFrame.width / 2) * viewport.scale}
          onFillColorChange={(fillColor) => handleUpdateSelectedShapeStyle({fill_color: fillColor})}
          onShapeTypeChange={(nextShapeType) => handleUpdateSelectedShapeStyle({shape_type: nextShapeType})}
          onStrokeColorChange={(strokeColor) => handleUpdateSelectedShapeStyle({stroke_color: strokeColor})}
          onStrokeStyleChange={(strokeStyle) => handleUpdateSelectedShapeStyle({stroke_style: strokeStyle})}
          onTextAlignChange={(textAlign) => handleUpdateSelectedShapeStyle({text_align: textAlign})}
          onTextFamilyChange={(textFamily) => handleUpdateSelectedShapeStyle({text_family: textFamily})}
          onTextSizeChange={(textSize) => handleUpdateSelectedShapeStyle({text_size: textSize})}
          style={selectedShapeStyle ?? selectedShape.style}
          top={Math.max(96, viewport.y + selectedShapeFrame.y * viewport.scale)}
          zIndex={shapeToolbarZIndex}
        />
      ) : null}

      <div className='pointer-events-none absolute right-4 top-4 z-20 flex flex-col items-end gap-2'>
        <CanvasZoomControl
          onFit={handleZoomFit}
          onZoomChange={handleZoomChange}
          scale={viewport.scale}
        />

        {selectedElements.length > 0 && canEdit ? (
          <div className='pointer-events-auto flex items-center gap-2 rounded-2xl bg-surface-elevated/90 px-3 py-2 text-xs font-medium text-text-medium shadow-panel backdrop-blur-sm'>
            <span>{selectedElements.length === 1 ? selectedElements[0].elementType : `${selectedElements.length} selected`}</span>
            <button
              className='rounded-lg bg-error px-2 py-1 text-white'
              onClick={handleDeleteSelected}
              type='button'
            >
              Delete
            </button>
          </div>
        ) : null}
        </div>

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
