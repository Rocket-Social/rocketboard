import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {CSS} from '@dnd-kit/utilities'
import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  Suspense,
  useState,
} from 'react'
import {
  AlertTriangle,
  ArrowDownAZ,
  ArrowUpDown,
  Bot,
  CalendarDays,
  Check,
  Copy,
  ChevronRight,
  Clock,
  Download,
  FileText,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Hand,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react'

import {ConfirmDialog, PromptDialog} from '../../components/ui/confirm-dialog'
import {lazyWithRetry} from '../../app/lazyWithRetry'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import {useConfirmDialog} from '../../hooks/useConfirmDialog'
import {usePromptDialog} from '../../hooks/usePromptDialog'
import {getErrorMessage} from '../../platform/data/rpc-adapter'
import {useIsDesktop} from '../shell/useIsDesktop'
import {useResizableWidth} from '../shell/useResizableWidth'
import type {RichTextDocument} from '../rich-text/rich-text'
import {prepareContentForSave} from '../rich-text/prepare-content'
import {
  useCreateNoteMutation,
  useUpdateNoteMutation,
  useDeleteNoteMutation,
  useCreateFolderMutation,
  useUpdateFolderMutation,
  useDeleteFolderMutation,
  useReorderNotesMutation,
  useReorderFoldersMutation,
  useNoteQuery,
} from './note.queries'
import {
  formatNoteDate,
  getNoteDisplayTitle,
  getNotePreview,
  isImportedNote,
  resolveActiveNoteId,
  sortNotes,
  type NoteListItem,
  type NoteFolderRecord,
  type NoteSortBy,
} from './note.types'
import {
  buildFolderChildrenMap,
  buildManagedFolderIdSet,
  getFolderIdsToExpandForActiveFolder,
} from './note-folder-tree'
import {moveTopLevelFolderRow} from './folder-dnd'
import {
  noteDropSlotId,
  parseFolderId,
  parseNoteId,
  resolveCommittedFolderDropIndicator,
  resolveCommittedNoteDropIndicator,
  resolveFolderDropIndicator,
  resolveNoteDropIndicator,
  topLevelFolderDropSlotId,
  parseTopLevelFolderDropSlotId,
  type FolderDropIndicator,
} from './note-drop-targets'
import {
  applyNoteMove,
  type NoteDropIndicator,
} from './note-dnd'
import type {GranolaConnectionRecord} from './granola-import.shared'

// ============================================================
// localStorage helpers
// ============================================================

type NotesViewState = {
  activeFolderId?: string | null
  activeNoteId?: string | null
  expandedFolderIds?: string[]
  sortBy?: NoteSortBy
  unfiledTopLevelPosition?: number | null
}

function loadNotesState(userId: string) {
  try {
    const raw = localStorage.getItem(`rocketboard:notesState:${userId}`)
    if (!raw) return null
    return JSON.parse(raw) as NotesViewState
  } catch { return null }
}

type GranolaFolderStatus = {
  kind: 'error' | 'needs_reconnect' | 'synced' | 'syncing'
  tooltip: string
}

const SYNC_RING_RADIUS = 8
const SYNC_RING_CIRCUMFERENCE = 2 * Math.PI * SYNC_RING_RADIUS
const SYNC_RING_PROGRESS = 0.72
const DEFAULT_GRANOLA_FOLDER_STATUS: GranolaFolderStatus = {
  kind: 'synced',
  tooltip: 'Synced',
}

function getGranolaFolderStatus(
  granolaConnection: GranolaConnectionRecord | null,
  isGranolaSyncing: boolean,
  granolaSyncMessage: string | null,
) {
  if (!granolaConnection) {
    return null
  }

  if (isGranolaSyncing) {
    return {
      kind: 'syncing' as const,
      tooltip: granolaSyncMessage?.trim().length
        ? `Sync in progress. ${granolaSyncMessage}`
        : 'Sync in progress',
    }
  }

  if (granolaConnection.status === 'needs_reconnect') {
    return {
      kind: 'needs_reconnect' as const,
      tooltip: 'Reconnect required',
    }
  }

  if (granolaConnection.status === 'error') {
    return {
      kind: 'error' as const,
      tooltip: 'Sync issue',
    }
  }

  return DEFAULT_GRANOLA_FOLDER_STATUS
}

function FolderSyncStatusIcon({status}: {status: GranolaFolderStatus}) {
  const progressValue = status.kind === 'synced' || status.kind === 'error' ? 1 : SYNC_RING_PROGRESS
  const progressClassName = status.kind === 'synced'
    ? 'text-success'
    : status.kind === 'error'
      ? 'text-error'
      : 'text-warning'

  const icon = status.kind === 'synced'
    ? <Check className='h-2.5 w-2.5 text-success'/>
    : status.kind === 'error'
      ? <AlertTriangle className='h-2.5 w-2.5 text-error'/>
      : <RefreshCw className={`h-2.5 w-2.5 ${status.kind === 'syncing' ? 'animate-spin text-warning' : 'text-warning'}`}/>

  return (
    <span
      aria-label={status.tooltip}
      className='relative inline-flex h-5 w-5 shrink-0 items-center justify-center'
      role='img'
      title={status.tooltip}
    >
      <svg
        aria-hidden='true'
        className='absolute inset-0 h-full w-full -rotate-90'
        viewBox='0 0 20 20'
      >
        <circle
          className='text-border-subtle/60'
          cx='10'
          cy='10'
          fill='none'
          r={SYNC_RING_RADIUS}
          stroke='currentColor'
          strokeWidth='2'
        />
        <circle
          className={progressClassName}
          cx='10'
          cy='10'
          fill='none'
          r={SYNC_RING_RADIUS}
          stroke='currentColor'
          strokeDasharray={`${SYNC_RING_CIRCUMFERENCE * progressValue} ${SYNC_RING_CIRCUMFERENCE}`}
          strokeLinecap='round'
          strokeWidth='2'
        />
      </svg>
      <span aria-hidden='true' className='relative z-10'>
        {icon}
      </span>
    </span>
  )
}

function saveNotesState(userId: string, state: NotesViewState) {
  localStorage.setItem(`rocketboard:notesState:${userId}`, JSON.stringify(state))
}

// ============================================================
// DnD ID helpers
// ============================================================

function noteId(id: string) { return `note:${id}` }
function folderId(id: string) { return `folder:${id}` }

const ROOT_FOLDER_HANDLE_SIZE = 20
const FOLDER_DISCLOSURE_SIZE = 14
const FOLDER_ROW_ICON_GAP = 8
const FOLDER_DEPTH_PADDING = FOLDER_DISCLOSURE_SIZE + FOLDER_ROW_ICON_GAP
const UNFILED_TOP_LEVEL_DND_ID = 'top-level:unfiled'
const FOLDER_AUTO_EXPAND_DELAY_MS = 1200
const TOP_LEVEL_FOLDER_LEFT_INSET = 1
const TOP_LEVEL_FOLDER_RIGHT_INSET = 8
const TOP_LEVEL_FOLDER_ROW_CLASS_NAME = 'group flex w-full items-center gap-0 py-2 text-left text-sm font-medium text-text-muted transition-colors hover:bg-canvas-accent'
const TOP_LEVEL_FOLDER_CONTENT_CLASS_NAME = 'flex min-w-0 flex-1 items-center gap-2'
const TOP_LEVEL_FOLDER_HANDLE_SLOT_STYLE = {
  height: `${ROOT_FOLDER_HANDLE_SIZE}px`,
  width: `${ROOT_FOLDER_HANDLE_SIZE}px`,
} as const
const TOP_LEVEL_FOLDER_ROW_STYLE = {
  paddingLeft: `${TOP_LEVEL_FOLDER_LEFT_INSET}px`,
  paddingRight: `${TOP_LEVEL_FOLDER_RIGHT_INSET}px`,
} as const

type TopLevelRowItem =
  | {folder: NoteFolderRecord; id: string; kind: 'folder'}
  | {id: typeof UNFILED_TOP_LEVEL_DND_ID; kind: 'unfiled'}

function clampUnfiledTopLevelPosition(position: number | null | undefined, rootFolderCount: number) {
  if (typeof position !== 'number' || Number.isNaN(position)) {
    return rootFolderCount
  }

  return Math.min(Math.max(Math.floor(position), 0), rootFolderCount)
}

function buildTopLevelRowItems(
  rootFolders: NoteFolderRecord[],
  hasUnfiledRow: boolean,
  unfiledTopLevelPosition: number | null | undefined,
): TopLevelRowItem[] {
  const items: TopLevelRowItem[] = rootFolders.map((folder) => ({
    folder,
    id: folderId(folder.id),
    kind: 'folder',
  }))

  if (!hasUnfiledRow) {
    return items
  }

  items.splice(
    clampUnfiledTopLevelPosition(unfiledTopLevelPosition, rootFolders.length),
    0,
    {id: UNFILED_TOP_LEVEL_DND_ID, kind: 'unfiled'},
  )

  return items
}

function canCreateChildFolder(folder: Pick<NoteFolderRecord, 'parentId'>) {
  return folder.parentId === null
}

function isFolderDescendant(
  foldersById: Map<string, Pick<NoteFolderRecord, 'id' | 'parentId'>>,
  ancestorFolderId: string,
  targetFolderId: string,
) {
  let cursor = foldersById.get(targetFolderId) ?? null

  while (cursor?.parentId) {
    if (cursor.parentId === ancestorFolderId) {
      return true
    }

    cursor = foldersById.get(cursor.parentId) ?? null
  }

  return false
}

function TopLevelFolderRow({
  children,
  isOver = false,
  rowRef,
}: {
  children: ReactNode
  isOver?: boolean
  rowRef?: (node: HTMLDivElement | null) => void
}) {
  return (
    <div
      ref={rowRef}
      data-folder-depth={0}
      className={`${TOP_LEVEL_FOLDER_ROW_CLASS_NAME} ${isOver ? 'bg-primary-soft' : ''}`}
      style={TOP_LEVEL_FOLDER_ROW_STYLE}
    >
      {children}
    </div>
  )
}

function NoteDropLine({className = ''}: {className?: string}) {
  return (
    <div
      aria-hidden='true'
      className={`pointer-events-none mx-4 h-0.5 rounded-full bg-primary ${className}`.trim()}
    />
  )
}

function DropTargetPlaceholder({
  className = '',
  label,
}: {
  className?: string
  label: string
}) {
  return (
    <div
      className={`mx-2 flex h-9 items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3 text-xs font-medium text-primary/80 ${className}`.trim()}
    >
      <FolderClosed className='h-3.5 w-3.5 shrink-0'/>
      <span>{label}</span>
    </div>
  )
}

function NoteInsertionSlot({
  active = false,
  folderId,
  index,
}: {
  active?: boolean
  folderId: string | null
  index: number
}) {
  const {setNodeRef, isOver} = useDroppable({id: noteDropSlotId(folderId, index)})

  return (
    <div ref={setNodeRef} className='relative -my-1 h-2'>
      {active || isOver ? (
        <NoteDropLine className='absolute inset-x-0 top-1/2 -translate-y-1/2 ml-8 mr-4'/>
      ) : null}
    </div>
  )
}

function FolderRootDropSlot({
  active = false,
  index,
}: {
  active?: boolean
  index: number
}) {
  const {setNodeRef, isOver} = useDroppable({id: topLevelFolderDropSlotId(index)})

  return (
    <div ref={setNodeRef} className='relative h-2'>
      {active || isOver ? <DropTargetPlaceholder label='Move to top level'/> : null}
    </div>
  )
}

function buildMarkdownFilename(title: string) {
  const normalized = title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return `${normalized || 'note'}.md`
}

const LazyRichTextEditor = lazyWithRetry(
  () =>
    import('../rich-text/RichTextEditor').then((module) => ({
      default: module.RichTextEditor,
    })),
  {recovery: 'error-boundary'},
)

// ============================================================
// NotesView
// ============================================================

type NotesViewProps = {
  activeNoteIdFromRoute?: string | null
  errorMessage?: string | null
  folders: NoteFolderRecord[]
  granolaConnection?: GranolaConnectionRecord | null
  granolaSyncMessage?: string | null
  isLoading: boolean
  isGranolaSyncing?: boolean
  notes: NoteListItem[]
  onActiveNoteIdChange?: (noteId: string | null) => void
  onDuplicateImportedNote?: (noteId: string) => void
  onOpenAiChat?: () => void
  onOpenImportDialog?: () => void
  onRetryLoad?: () => void
  userId: string
}

export function NotesView({
  activeNoteIdFromRoute = null,
  errorMessage,
  folders,
  granolaConnection = null,
  granolaSyncMessage = null,
  isLoading,
  isGranolaSyncing = false,
  notes,
  onActiveNoteIdChange,
  onDuplicateImportedNote,
  onOpenAiChat,
  onOpenImportDialog,
  onRetryLoad,
  userId,
}: NotesViewProps) {
  const isDesktop = useIsDesktop()
  const {
    width: folderPanelWidth,
    isResizing: isResizingFolderPanel,
    handleResizeStart: handleFolderPanelResizeStart,
  } = useResizableWidth({
    defaultWidth: 280,
    minWidth: 220,
    maxWidth: 520,
    storageKey: 'rocketboard.notes-folder-panel-width',
  })
  const {confirm, confirmDialogProps} = useConfirmDialog()
  const {prompt, promptDialogProps} = usePromptDialog()
  const savedState = useMemo(() => loadNotesState(userId), [userId])
  const [activeNoteId, setActiveNoteId] = useState<string | null>(
    activeNoteIdFromRoute ?? savedState?.activeNoteId ?? null,
  )
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => {
    if (savedState?.expandedFolderIds) return new Set(savedState.expandedFolderIds)
    if (savedState?.activeFolderId) return new Set([savedState.activeFolderId])
    return new Set<string>()
  })
  const [sortBy, setSortBy] = useState<NoteSortBy>(savedState?.sortBy ?? 'updatedAt')
  const [mobilePane, setMobilePane] = useState<'editor' | 'list'>(
    (activeNoteIdFromRoute ?? savedState?.activeNoteId) ? 'editor' : 'list',
  )
  const [unfiledTopLevelPosition, setUnfiledTopLevelPosition] = useState<number | null>(
    savedState?.unfiledTopLevelPosition ?? null,
  )
  const [pendingCreatedNoteId, setPendingCreatedNoteId] = useState<string | null>(null)
  const [noteIdPendingTitleFocus, setNoteIdPendingTitleFocus] = useState<string | null>(null)

  // Folder CRUD state
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renameFolderValue, setRenameFolderValue] = useState('')

  // DnD state
  const [dragActiveId, setDragActiveId] = useState<string | null>(null)
  const [folderDropIndicator, setFolderDropIndicator] = useState<FolderDropIndicator | null>(null)
  const [noteDropIndicator, setNoteDropIndicator] = useState<NoteDropIndicator | null>(null)
  const [optimisticNotes, setOptimisticNotes] = useState<NoteListItem[] | null>(null)
  const granolaFolderId = granolaConnection?.rootFolderId ?? null
  const folderDropIndicatorRef = useRef<FolderDropIndicator | null>(null)
  const noteDropIndicatorRef = useRef<NoteDropIndicator | null>(null)
  const committedFolderDropIndicatorRef = useRef<FolderDropIndicator | null>(null)
  const committedNoteDropIndicatorRef = useRef<NoteDropIndicator | null>(null)
  const lastOverDndIdRef = useRef<string | null>(null)
  const folderAutoExpandTargetIdRef = useRef<string | null>(null)
  const folderAutoExpandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previousActiveNoteIdRef = useRef<string | null>(
    activeNoteIdFromRoute ?? savedState?.activeNoteId ?? null,
  )
  const displayedNotes = optimisticNotes ?? notes

  const notesById = useMemo(
    () => new Map(displayedNotes.map((note) => [note.id, note])),
    [displayedNotes],
  )
  const foldersById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders],
  )

  // Persist state
  useEffect(() => {
    saveNotesState(userId, {
      activeNoteId,
      expandedFolderIds: [...expandedFolderIds],
      sortBy,
      unfiledTopLevelPosition,
    })
  }, [userId, activeNoteId, expandedFolderIds, sortBy, unfiledTopLevelPosition])

  useEffect(() => {
    if (!optimisticNotes) {
      return
    }

    const notesByIdFromServer = new Map(notes.map((note) => [note.id, note]))
    const optimisticOrderCommitted = optimisticNotes.every((optimisticNote) => {
      const noteFromServer = notesByIdFromServer.get(optimisticNote.id)

      return noteFromServer
        && noteFromServer.folderId === optimisticNote.folderId
        && noteFromServer.position === optimisticNote.position
    })

    if (optimisticOrderCommitted) {
      setOptimisticNotes(null)
    }
  }, [notes, optimisticNotes])

  const notesByFolder = useMemo(() => {
    const map = new Map<string | null, NoteListItem[]>()
    for (const note of displayedNotes) {
      const key = note.folderId
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(note)
    }
    for (const [key, group] of map) {
      map.set(key, sortNotes(group, sortBy))
    }
    return map
  }, [displayedNotes, sortBy])

  const allNotesSorted = useMemo(() => sortNotes(displayedNotes, sortBy), [displayedNotes, sortBy])
  const folderChildrenByParent = useMemo(() => buildFolderChildrenMap(folders), [folders])
  const rootFolders = folderChildrenByParent.get(null) ?? []
  const unfiledNotes = notesByFolder.get(null) ?? []
  const showUnfiledRow = unfiledNotes.length > 0 || parseNoteId(dragActiveId ?? '') !== null
  const topLevelRowItems = useMemo(
    () => buildTopLevelRowItems(rootFolders, showUnfiledRow, unfiledTopLevelPosition),
    [rootFolders, showUnfiledRow, unfiledTopLevelPosition],
  )
  const topLevelSortableIds = useMemo(() => topLevelRowItems.map((item) => item.id), [topLevelRowItems])
  const managedFolderIds = useMemo(
    () => granolaConnection?.mode === 'mirror'
      ? buildManagedFolderIdSet(folders, granolaFolderId)
      : new Set<string>(),
    [folders, granolaFolderId, granolaConnection?.mode],
  )
  const noteCountsByFolder = useMemo(() => {
    const counts = new Map<string | null, number>()

    for (const [folderIdKey, folderNotes] of notesByFolder.entries()) {
      counts.set(folderIdKey, folderNotes.length)
    }

    return counts
  }, [notesByFolder])
  const descendantNoteCountByFolder = useMemo(() => {
    const counts = new Map<string, number>()

    const countFolderNotes = (folderId: string): number => {
      const cachedCount = counts.get(folderId)
      if (cachedCount !== undefined) {
        return cachedCount
      }

      const childFolders = folderChildrenByParent.get(folderId) ?? []
      const totalCount = (noteCountsByFolder.get(folderId) ?? 0) + childFolders.reduce(
        (count, childFolder) => count + countFolderNotes(childFolder.id),
        0,
      )

      counts.set(folderId, totalCount)
      return totalCount
    }

    for (const folder of folders) {
      countFolderNotes(folder.id)
    }

    return counts
  }, [folderChildrenByParent, folders, noteCountsByFolder])

  // On first load with no saved state, expand personal roots and keep managed roots collapsed.
  const initializedFoldersRef = useRef(false)
  useEffect(() => {
    if (!initializedFoldersRef.current && folders.length > 0) {
      initializedFoldersRef.current = true
      if (!savedState?.expandedFolderIds && !savedState?.activeFolderId) {
        setExpandedFolderIds(new Set(
          rootFolders
            .filter((folder) => !managedFolderIds.has(folder.id))
            .map((folder) => folder.id),
        ))
      }
    }
  }, [folders.length, managedFolderIds, rootFolders, savedState?.expandedFolderIds, savedState?.activeFolderId])

  // Keep the route-selected note authoritative when present and fall back
  // deterministically when it is missing or inaccessible.
  useEffect(() => {
    const shouldPreservePendingCreatedNote =
      pendingCreatedNoteId != null
      && !allNotesSorted.some((note) => note.id === pendingCreatedNoteId)
      && (activeNoteId === pendingCreatedNoteId || activeNoteIdFromRoute === pendingCreatedNoteId)

    if (shouldPreservePendingCreatedNote) {
      if (activeNoteId !== pendingCreatedNoteId) {
        setActiveNoteId(pendingCreatedNoteId)
        return
      }

      if (!isLoading) {
        onActiveNoteIdChange?.(pendingCreatedNoteId)
      }
      return
    }

    const resolvedActiveNoteId = resolveActiveNoteId(
      allNotesSorted,
      activeNoteId,
      activeNoteIdFromRoute,
    )

    if (resolvedActiveNoteId !== activeNoteId) {
      setActiveNoteId(resolvedActiveNoteId)
      return
    }

    if (!isLoading) {
      onActiveNoteIdChange?.(resolvedActiveNoteId)
    }
  }, [activeNoteId, activeNoteIdFromRoute, allNotesSorted, isLoading, onActiveNoteIdChange, pendingCreatedNoteId])

  useEffect(() => {
    if (pendingCreatedNoteId && allNotesSorted.some((note) => note.id === pendingCreatedNoteId)) {
      setPendingCreatedNoteId(null)
    }
  }, [allNotesSorted, pendingCreatedNoteId])

  useEffect(() => {
    const activeNote = activeNoteId ? notesById.get(activeNoteId) : null
    const folderIdsToExpand = getFolderIdsToExpandForActiveFolder(folders, activeNote?.folderId ?? null)

    if (folderIdsToExpand.length > 0) {
      setExpandedFolderIds((prev) => new Set([...prev, ...folderIdsToExpand]))
    }
  }, [activeNoteId, folders, notesById])

  useEffect(() => {
    if (!activeNoteId) {
      previousActiveNoteIdRef.current = null
      setMobilePane('list')
      return
    }

    if (previousActiveNoteIdRef.current !== activeNoteId) {
      previousActiveNoteIdRef.current = activeNoteId
      setMobilePane('editor')
    }
  }, [activeNoteId])

  const toggleFolder = useCallback((fId: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev)
      if (next.has(fId)) next.delete(fId)
      else next.add(fId)
      return next
    })
  }, [])

  const commitActiveNoteChange = useCallback((nextNoteId: string | null) => {
    if (onActiveNoteIdChange) {
      onActiveNoteIdChange(nextNoteId)
      return
    }

    setActiveNoteId(nextNoteId)
  }, [onActiveNoteIdChange])

  const handleSelectNote = useCallback((nextNoteId: string) => {
    setPendingCreatedNoteId(null)
    setNoteIdPendingTitleFocus(null)
    commitActiveNoteChange(nextNoteId)
  }, [commitActiveNoteChange])

  const createNoteMutation = useCreateNoteMutation(userId)
  const deleteNoteMutation = useDeleteNoteMutation(userId)
  const createFolderMutation = useCreateFolderMutation(userId)
  const updateFolderMutation = useUpdateFolderMutation(userId)
  const deleteFolderMutation = useDeleteFolderMutation(userId)
  const reorderNotesMutation = useReorderNotesMutation(userId)
  const reorderFoldersMutation = useReorderFoldersMutation(userId)

  const handleCreateNote = useCallback((targetFolderId?: string | null) => {
    const defaultFolderId = rootFolders.find((folder) => !managedFolderIds.has(folder.id))?.id ?? null
    const fId = targetFolderId !== undefined ? targetFolderId : defaultFolderId

    if (fId && managedFolderIds.has(fId)) {
      return
    }

    createNoteMutation.mutate(
      {folderId: fId, title: ''},
      {
        onSuccess: (note) => {
          setPendingCreatedNoteId(note.id)
          setNoteIdPendingTitleFocus(note.id)
          commitActiveNoteChange(note.id)
          if (note.folderId) {
            setExpandedFolderIds((prev) => new Set([...prev, note.folderId!]))
          }
        },
      },
    )
  }, [commitActiveNoteChange, createNoteMutation, managedFolderIds, rootFolders])

  const handleDeleteNote = useCallback(async (nId: string) => {
    if (!await confirm({title: 'Delete this note?', variant: 'destructive', confirmLabel: 'Delete'})) return
    deleteNoteMutation.mutate(nId, {
      onSuccess: () => {
        if (activeNoteId === nId) {
          const remaining = allNotesSorted.filter((n) => n.id !== nId)
          commitActiveNoteChange(remaining[0]?.id ?? null)
        }
      },
    })
  }, [confirm, deleteNoteMutation, activeNoteId, allNotesSorted, commitActiveNoteChange])

  const handleCreateFolder = useCallback(async (targetParentId: string | null = null) => {
    const targetParent = targetParentId ? foldersById.get(targetParentId) ?? null : null
    const name = await prompt({
      confirmLabel: 'Create',
      description: targetParent ? `Add a nested folder inside ${targetParent.name}.` : 'Create a new top-level folder.',
      placeholder: 'Folder name',
      title: targetParent ? 'Create nested folder' : 'Create folder',
    })

    const trimmedName = name?.trim()
    if (!trimmedName) {
      return
    }

    createFolderMutation.mutate({name: trimmedName, parentId: targetParentId}, {
      onSuccess: (folder) => {
        setExpandedFolderIds((prev) => {
          const next = new Set(prev)
          next.add(folder.id)
          if (folder.parentId) {
            next.add(folder.parentId)
          }
          return next
        })
      },
    })
  }, [createFolderMutation, foldersById, prompt])

  const handleRenameFolder = useCallback((fId: string) => {
    const name = renameFolderValue.trim()
    if (!name) { setRenamingFolderId(null); return }
    updateFolderMutation.mutate({folderId: fId, patch: {name}}, {
      onSuccess: () => setRenamingFolderId(null),
    })
  }, [updateFolderMutation, renameFolderValue])

  const handleDeleteFolder = useCallback(async (fId: string, folderName: string) => {
    if (!await confirm({title: `Delete folder "${folderName}"?`, description: 'Notes in this folder will become unfiled.', variant: 'destructive', confirmLabel: 'Delete'})) return
    deleteFolderMutation.mutate(fId)
  }, [confirm, deleteFolderMutation])

  // ---- DnD handlers ----
  const sensors = useSensors(
    useSensor(PointerSensor, {activationConstraint: {distance: 5}}),
  )
  const collisionDetection = useCallback<typeof closestCenter>((args) => {
    const pointerCollisions = pointerWithin(args)
    if (pointerCollisions.length > 0) {
      return pointerCollisions
    }

    return closestCenter(args)
  }, [])

  const draggedNote = dragActiveId ? notesById.get(parseNoteId(dragActiveId) ?? '') ?? null : null
  const draggedFolder = dragActiveId ? foldersById.get(parseFolderId(dragActiveId) ?? '') ?? null : null
  const isDraggingUnfiledTopLevelRow = dragActiveId === UNFILED_TOP_LEVEL_DND_ID
  const clearVisibleDragIndicators = useCallback(() => {
    folderDropIndicatorRef.current = null
    noteDropIndicatorRef.current = null
    setFolderDropIndicator(null)
    setNoteDropIndicator(null)
  }, [])
  const resetDragTracking = useCallback(() => {
    clearVisibleDragIndicators()
    committedFolderDropIndicatorRef.current = null
    committedNoteDropIndicatorRef.current = null
    lastOverDndIdRef.current = null
  }, [clearVisibleDragIndicators])
  const clearFolderAutoExpand = useCallback(() => {
    folderAutoExpandTargetIdRef.current = null
    if (folderAutoExpandTimeoutRef.current) {
      clearTimeout(folderAutoExpandTimeoutRef.current)
      folderAutoExpandTimeoutRef.current = null
    }
  }, [])

  const scheduleFolderAutoExpand = useCallback((folderIdToExpand: string) => {
    if (expandedFolderIds.has(folderIdToExpand) || folderAutoExpandTargetIdRef.current === folderIdToExpand) {
      return
    }

    clearFolderAutoExpand()
    folderAutoExpandTargetIdRef.current = folderIdToExpand
    folderAutoExpandTimeoutRef.current = setTimeout(() => {
      setExpandedFolderIds((prev) => new Set([...prev, folderIdToExpand]))
      folderAutoExpandTargetIdRef.current = null
      folderAutoExpandTimeoutRef.current = null
    }, FOLDER_AUTO_EXPAND_DELAY_MS)
  }, [clearFolderAutoExpand, expandedFolderIds])

  useEffect(() => clearFolderAutoExpand, [clearFolderAutoExpand])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDragActiveId(String(event.active.id))
    clearFolderAutoExpand()
    resetDragTracking()
  }, [clearFolderAutoExpand, resetDragTracking])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const activeDndId = String(event.active.id)
    const activeNoteRealId = parseNoteId(activeDndId)
    const activeFolderRealId = parseFolderId(activeDndId)

    if (!event.over) {
      clearVisibleDragIndicators()
      clearFolderAutoExpand()
      return
    }

    const overStr = String(event.over.id)
    lastOverDndIdRef.current = overStr
    const overFolderDropId = overStr.startsWith('drop:folder:') ? overStr.slice(12) : null
    if (
      (activeNoteRealId || activeFolderRealId)
      && overFolderDropId
      && overFolderDropId !== '__unfiled__'
    ) {
      scheduleFolderAutoExpand(overFolderDropId)
    } else {
      clearFolderAutoExpand()
    }

    if (activeFolderRealId) {
      const nextFolderDropIndicator = resolveFolderDropIndicator({
        activeDndId,
        activeRectHeight: event.active.rect.current.translated?.height ?? event.active.rect.current.initial?.height,
        activeRectTop: event.active.rect.current.translated?.top ?? event.active.rect.current.initial?.top,
        foldersById,
        managedFolderIds,
        overDndId: overStr,
        overRectHeight: event.over.rect.height,
        overRectTop: event.over.rect.top,
      })
      folderDropIndicatorRef.current = nextFolderDropIndicator
      setFolderDropIndicator(nextFolderDropIndicator)
      committedFolderDropIndicatorRef.current = nextFolderDropIndicator
    }

    if (activeNoteRealId) {
      const nextNoteDropIndicator = resolveNoteDropIndicator({
        activeDndId,
        activeRectHeight: event.active.rect.current.translated?.height ?? event.active.rect.current.initial?.height,
        activeRectTop: event.active.rect.current.translated?.top ?? event.active.rect.current.initial?.top,
        notesByFolder,
        notesById,
        overDndId: overStr,
        overRectHeight: event.over.rect.height,
        overRectTop: event.over.rect.top,
        unfiledTopLevelDndId: UNFILED_TOP_LEVEL_DND_ID,
      })
      noteDropIndicatorRef.current = nextNoteDropIndicator
      setNoteDropIndicator(nextNoteDropIndicator)
      committedNoteDropIndicatorRef.current = nextNoteDropIndicator
    }
  }, [clearFolderAutoExpand, clearVisibleDragIndicators, foldersById, managedFolderIds, notesByFolder, notesById, scheduleFolderAutoExpand])

  const handleDragCancel = useCallback(() => {
    clearFolderAutoExpand()
    setDragActiveId(null)
    resetDragTracking()
  }, [clearFolderAutoExpand, resetDragTracking])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const {active, over} = event
    const activeStr = String(active.id)
    const activeNoteRealId = parseNoteId(activeStr)
    const activeFolderRealId = parseFolderId(activeStr)
    const activeIsUnfiledTopLevelRow = activeStr === UNFILED_TOP_LEVEL_DND_ID
    const overStr = over ? String(over.id) : lastOverDndIdRef.current
    const overRectHeight = over?.rect.height
    const overRectTop = over?.rect.top
    const resolvedFolderTarget = overStr
      ? resolveCommittedFolderDropIndicator({
        activeDndId: activeStr,
        activeRectHeight: active.rect.current.translated?.height ?? active.rect.current.initial?.height,
        activeRectTop: active.rect.current.translated?.top ?? active.rect.current.initial?.top,
        currentIndicator: folderDropIndicatorRef.current ?? committedFolderDropIndicatorRef.current,
        foldersById,
        managedFolderIds,
        overDndId: overStr,
        overRectHeight,
        overRectTop,
      })
      : null
    const resolvedNoteTarget = overStr
      ? resolveCommittedNoteDropIndicator({
        activeDndId: activeStr,
        activeRectHeight: active.rect.current.translated?.height ?? active.rect.current.initial?.height,
        activeRectTop: active.rect.current.translated?.top ?? active.rect.current.initial?.top,
        currentIndicator: noteDropIndicatorRef.current ?? committedNoteDropIndicatorRef.current,
        notesByFolder,
        notesById,
        overDndId: overStr,
        overRectHeight,
        overRectTop,
        unfiledTopLevelDndId: UNFILED_TOP_LEVEL_DND_ID,
      })
      : null

    clearFolderAutoExpand()
    setDragActiveId(null)
    resetDragTracking()
    if (!overStr && !resolvedFolderTarget && !resolvedNoteTarget) return

    const overDndId = overStr ?? ''
    const rootDropSlotIndex = parseTopLevelFolderDropSlotId(overDndId)
    const normalizedTopLevelOverId = overDndId === 'drop:folder:__unfiled__'
      ? UNFILED_TOP_LEVEL_DND_ID
      : overDndId.startsWith('drop:folder:')
        ? folderId(overDndId.slice(12))
        : overDndId || null

    // ---- Folder move / reorder ----
    if (activeFolderRealId) {
      const activeFolder = foldersById.get(activeFolderRealId)
      if (!activeFolder || managedFolderIds.has(activeFolder.id)) {
        return
      }

      const overFolderDropId = resolvedFolderTarget?.kind === 'inside'
        ? resolvedFolderTarget.folderId
        : overDndId.startsWith('drop:folder:')
          ? overDndId.slice(12)
          : null
      const overFolderRealId = resolvedFolderTarget?.kind === 'row'
        ? resolvedFolderTarget.folderId
        : parseFolderId(overDndId)
      const overFolder = overFolderRealId ? foldersById.get(overFolderRealId) ?? null : null
      const currentUnfiledIndex = topLevelRowItems.findIndex((item) => item.kind === 'unfiled')
      const rowDropPosition = resolvedFolderTarget?.kind === 'row' ? resolvedFolderTarget.position : 'before'

      if (overFolderDropId && overFolderDropId !== '__unfiled__') {
        const targetFolder = foldersById.get(overFolderDropId)
        if (
          !targetFolder
          || managedFolderIds.has(targetFolder.id)
          || targetFolder.id === activeFolder.id
          || targetFolder.parentId !== null
          || isFolderDescendant(foldersById, activeFolder.id, targetFolder.id)
        ) {
          return
        }

        const nextPosition = (folderChildrenByParent.get(targetFolder.id) ?? [])
          .filter((folder) => folder.id !== activeFolder.id)
          .length

        if (activeFolder.parentId === null) {
          const oldIndex = topLevelRowItems.findIndex((item) => item.id === activeStr)
          if (currentUnfiledIndex !== -1 && oldIndex !== -1 && oldIndex < currentUnfiledIndex) {
            setUnfiledTopLevelPosition(currentUnfiledIndex - 1)
          }
        } else {
          const oldSiblingUpdates = (folderChildrenByParent.get(activeFolder.parentId) ?? [])
            .filter((folder) => folder.id !== activeFolder.id)
            .map((folder, index) => ({folderId: folder.id, position: index}))

          if (oldSiblingUpdates.length > 0) {
            reorderFoldersMutation.mutate(oldSiblingUpdates)
          }
        }

        updateFolderMutation.mutate(
          {folderId: activeFolder.id, patch: {parentId: targetFolder.id, position: nextPosition}},
          {
            onSuccess: () => {
              setExpandedFolderIds((prev) => new Set([...prev, targetFolder.id]))
            },
          },
        )
        return
      }

      const rootTargetIndex = resolvedFolderTarget?.kind === 'root'
        ? resolvedFolderTarget.index
        : rootDropSlotIndex ?? (
          overDndId === 'drop:folder:__unfiled__' || overDndId === UNFILED_TOP_LEVEL_DND_ID
            ? (currentUnfiledIndex === -1 ? topLevelRowItems.length : currentUnfiledIndex)
            : overFolder?.parentId === null
              ? (() => {
                const overRowIndex = topLevelRowItems.findIndex(
                  (item) => item.kind === 'folder' && item.folder.id === overFolder.id,
                )
                return overRowIndex === -1 ? null : overRowIndex + (rowDropPosition === 'after' ? 1 : 0)
              })()
              : null
        )

      if (rootTargetIndex !== null) {
        const rootMove = moveTopLevelFolderRow({
          activeFolderId: activeFolder.id,
          items: topLevelRowItems.map((item) => item.kind === 'folder'
            ? {folderId: item.folder.id, kind: 'folder' as const}
            : {kind: 'unfiled' as const}),
          targetIndex: rootTargetIndex,
        })
        if (!rootMove) {
          return
        }

        if (activeFolder.parentId === null) {
          reorderFoldersMutation.mutate(rootMove.nextRootFolderIds.map((folderId, index) => ({
            folderId,
            position: index,
          })))
        } else {
          const oldSiblingUpdates = (folderChildrenByParent.get(activeFolder.parentId) ?? [])
            .filter((folder) => folder.id !== activeFolder.id)
            .map((folder, index) => ({folderId: folder.id, position: index}))
          const rootSiblingUpdates = rootMove.nextRootFolderIds
            .filter((folderId) => folderId !== activeFolder.id)
            .map((folderId) => ({
              folderId,
              position: rootMove.nextRootFolderIds.indexOf(folderId),
            }))

          if (oldSiblingUpdates.length > 0 || rootSiblingUpdates.length > 0) {
            reorderFoldersMutation.mutate([...oldSiblingUpdates, ...rootSiblingUpdates])
          }

          const nextRootPosition = rootMove.nextRootFolderIds.indexOf(activeFolder.id)
          if (nextRootPosition === -1) {
            return
          }

          updateFolderMutation.mutate({
            folderId: activeFolder.id,
            patch: {parentId: null, position: nextRootPosition},
          })
        }

        if (rootMove.nextUnfiledRowIndex !== null) {
          setUnfiledTopLevelPosition(rootMove.nextUnfiledRowIndex)
        }
        return
      }

      if (!overFolder || managedFolderIds.has(overFolder.id)) {
        return
      }

      const targetParentId = overFolder.parentId
      if (targetParentId !== activeFolder.parentId) {
        if (
          targetParentId === activeFolder.id
          || (targetParentId && isFolderDescendant(foldersById, activeFolder.id, targetParentId))
        ) {
          return
        }

        const oldSiblingUpdates = (folderChildrenByParent.get(activeFolder.parentId) ?? [])
          .filter((folder) => folder.id !== activeFolder.id)
          .map((folder, index) => ({folderId: folder.id, position: index}))

        const targetSiblings = [...(folderChildrenByParent.get(targetParentId) ?? [])]
          .filter((folder) => folder.id !== activeFolder.id)
        const overFolderIndex = targetSiblings.findIndex((folder) => folder.id === overFolder.id)
        if (overFolderIndex === -1) {
          return
        }
        const insertIndex = overFolderIndex + (rowDropPosition === 'after' ? 1 : 0)

        if (activeFolder.parentId === null && currentUnfiledIndex !== -1) {
          const oldIndex = topLevelRowItems.findIndex((item) => item.id === activeStr)
          if (oldIndex !== -1 && oldIndex < currentUnfiledIndex) {
            setUnfiledTopLevelPosition(currentUnfiledIndex - 1)
          }
        }

        targetSiblings.splice(insertIndex, 0, activeFolder)
        const targetSiblingUpdates = targetSiblings
          .filter((folder) => folder.id !== activeFolder.id)
          .map((folder, index) => ({folderId: folder.id, position: index >= insertIndex ? index + 1 : index}))

        if (oldSiblingUpdates.length > 0 || targetSiblingUpdates.length > 0) {
          reorderFoldersMutation.mutate([...oldSiblingUpdates, ...targetSiblingUpdates])
        }

        updateFolderMutation.mutate({folderId: activeFolder.id, patch: {parentId: targetParentId, position: insertIndex}})
        return
      }

      const siblingFolders = folderChildrenByParent.get(activeFolder.parentId) ?? []
      const oldIndex = siblingFolders.findIndex((folder) => folder.id === activeFolder.id)
      const overIndex = siblingFolders.findIndex((folder) => folder.id === overFolder.id)
      if (oldIndex === -1 || overIndex === -1) {
        return
      }

      const reordered = [...siblingFolders]
      const [movedFolder] = reordered.splice(oldIndex, 1)
      if (!movedFolder) {
        return
      }

      let insertIndex = overIndex + (rowDropPosition === 'after' ? 1 : 0)
      if (oldIndex < insertIndex) {
        insertIndex -= 1
      }
      if (oldIndex === insertIndex) {
        return
      }

      reordered.splice(insertIndex, 0, movedFolder)
      reorderFoldersMutation.mutate(reordered.map((folder, index) => ({
        folderId: folder.id,
        position: index,
      })))
      return
    }

    // ---- Top-level row reorder ----
    if (activeIsUnfiledTopLevelRow) {
      if (!normalizedTopLevelOverId) return
      const oldIndex = topLevelRowItems.findIndex((item) => item.id === activeStr)
      const newIndex = topLevelRowItems.findIndex((item) => item.id === normalizedTopLevelOverId)
      if (oldIndex === -1 || newIndex === -1) return
      if (oldIndex === newIndex) return

      const reordered = arrayMove(topLevelRowItems, oldIndex, newIndex)
      const reorderedFolderIds = reordered.flatMap((item) => item.kind === 'folder' ? [item.folder.id] : [])
      const currentFolderIds = rootFolders.map((folder) => folder.id)

      if (!reorderedFolderIds.every((folderId, index) => folderId === currentFolderIds[index])) {
        reorderFoldersMutation.mutate(reorderedFolderIds.map((folderId, index) => ({
          folderId,
          position: index,
        })))
      }

      if (reordered.some((item) => item.kind === 'unfiled')) {
        setUnfiledTopLevelPosition(reordered.findIndex((item) => item.kind === 'unfiled'))
      }
      return
    }

    // ---- Note reorder / move ----
    if (activeNoteRealId) {
      const activeNote = notesById.get(activeNoteRealId)
      if (!activeNote) return
      const resolvedIndicator = resolvedNoteTarget
      if (!resolvedIndicator) return

      if (
        (activeNote.folderId && managedFolderIds.has(activeNote.folderId))
        || (resolvedIndicator.folderId && managedFolderIds.has(resolvedIndicator.folderId))
      ) return

      const moveResult = applyNoteMove({
        activeNoteId: activeNoteRealId,
        notes: displayedNotes,
        notesByFolder,
        targetFolderId: resolvedIndicator.folderId,
        targetIndex: resolvedIndicator.targetIndex,
      })
      if (!moveResult) return

      setOptimisticNotes(moveResult.nextNotes)
      reorderNotesMutation.mutate(moveResult.updates, {
        onError: () => setOptimisticNotes(null),
      })

      const targetFolderId = resolvedIndicator.folderId
      if (targetFolderId !== null) {
        setExpandedFolderIds((prev) => new Set([...prev, targetFolderId]))
      }

      if (sortBy !== 'manual') setSortBy('manual')
    }
  }, [
    displayedNotes,
    folderChildrenByParent,
    foldersById,
    managedFolderIds,
    notesByFolder,
    notesById,
    reorderNotesMutation,
    reorderFoldersMutation,
    rootFolders,
    sortBy,
    topLevelRowItems,
    updateFolderMutation,
    resetDragTracking,
    clearFolderAutoExpand,
  ])
  const isListPaneVisible = mobilePane === 'list'
  const isEditorPaneVisible = mobilePane === 'editor'

  return (
    <div className='flex min-h-0 flex-1 flex-col lg:flex-row'>
      {/* Combined sidebar panel */}
      <div
        className={`relative min-h-0 flex-1 flex-col border-b border-border-subtle bg-surface-base lg:flex lg:flex-none lg:border-b-0 lg:border-r ${
          isListPaneVisible ? 'flex' : 'max-lg:hidden'
        }`}
        style={isDesktop ? {width: folderPanelWidth} : undefined}
      >
        {/* Top bar */}
        <div className='flex items-center justify-between border-b border-border-subtle px-3 py-2'>
          <span className='text-sm font-semibold text-text-strong'>Notes</span>
          <div className='flex items-center gap-2'>
            {isGranolaSyncing ? (
              <span aria-live='polite' className='inline-flex items-center gap-1 text-xs text-text-muted'>
                <RefreshCw className='h-3.5 w-3.5 animate-spin'/>
                {granolaSyncMessage ?? 'Importing from Granola...'}
              </span>
            ) : null}
            {onOpenImportDialog ? (
              <button
                className='inline-flex min-h-11 items-center rounded-full border border-border-subtle bg-surface-elevated px-3 py-2 text-sm font-medium text-text-strong transition-colors hover:border-border-strong hover:bg-surface-base'
                onClick={onOpenImportDialog}
                type='button'
              >
                Import
              </button>
            ) : null}
            <SortDropdown sortBy={sortBy} onSortChange={setSortBy}/>
            <AddActionMenu
              align='end'
              buttonClassName='min-h-11 min-w-11 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong'
              onAddFolder={() => { void handleCreateFolder(null) }}
              onAddNote={() => handleCreateNote()}
              title='Add note or folder'
            />
          </div>
        </div>

        {/* Scrollable content */}
        <div
          aria-busy={isLoading}
          aria-live='polite'
          className='flex-1 overflow-y-auto'
        >
          {isLoading ? (
            <NotesTreeSkeleton/>
          ) : errorMessage ? (
            <PanelInlineError
              actionLabel={onRetryLoad ? 'Retry' : undefined}
              description={errorMessage}
              onAction={onRetryLoad}
              title='Could not load notes'
            />
          ) : notes.length === 0 && folders.length === 0 ? (
            <div className='flex flex-col items-center justify-center gap-3 px-6 py-12 text-center'>
              <FileText className='h-10 w-10 text-text-muted/30'/>
              <div className='space-y-1'>
                <div className='text-sm font-medium text-text-strong'>No notes yet</div>
                <p className='text-sm text-text-muted'>Create a note to get started. Imports stay inside My Notes.</p>
              </div>
              <div className='flex flex-wrap items-center justify-center gap-2'>
                <button
                  className='inline-flex min-h-11 items-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90'
                  onClick={() => handleCreateNote()}
                  type='button'
                >
                  Create note
                </button>
                {onOpenImportDialog ? (
                  <button
                    className='inline-flex min-h-11 items-center rounded-full border border-border-subtle bg-surface-elevated px-4 py-2 text-sm font-medium text-text-strong transition-colors hover:border-border-strong hover:bg-surface-base'
                    onClick={onOpenImportDialog}
                    type='button'
                  >
                    Import
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <DndContext
              collisionDetection={collisionDetection}
              onDragCancel={handleDragCancel}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDragStart={handleDragStart}
              sensors={sensors}
            >
              <SortableContext items={topLevelSortableIds} strategy={verticalListSortingStrategy}>
                {draggedFolder ? (
                  <FolderRootDropSlot
                    active={folderDropIndicator?.kind === 'root' && folderDropIndicator.index === 0}
                    index={0}
                  />
                ) : null}
                {topLevelRowItems.map((item, index) => (
                  <Fragment key={item.id}>
                    {item.kind === 'folder' ? (
                      <SortableFolderSection
                        activeNoteId={activeNoteId}
                        childFolders={folderChildrenByParent.get(item.folder.id) ?? []}
                        descendantNoteCountByFolder={descendantNoteCountByFolder}
                        expandedFolderIds={expandedFolderIds}
                        folder={item.folder}
                        folderChildrenByParent={folderChildrenByParent}
                        folderDropIndicator={folderDropIndicator}
                        folderStatus={item.folder.id === granolaFolderId
                          ? getGranolaFolderStatus(granolaConnection, isGranolaSyncing, granolaSyncMessage)
                          : null}
                        dropIndicator={noteDropIndicator}
                        isManaged={managedFolderIds.has(item.folder.id)}
                        isExpanded={expandedFolderIds.has(item.folder.id)}
                        isRenaming={renamingFolderId === item.folder.id}
                        managedFolderIds={managedFolderIds}
                        notes={notesByFolder.get(item.folder.id) ?? []}
                        notesByFolder={notesByFolder}
                        onCancelRename={() => setRenamingFolderId(null)}
                        onCreateFolder={handleCreateFolder}
                        onCreateNote={handleCreateNote}
                        onDeleteFolder={handleDeleteFolder}
                        onRenameFolder={handleRenameFolder}
                        onSelectNote={handleSelectNote}
                        onStartRename={(targetFolder) => {
                          setRenamingFolderId(targetFolder.id)
                          setRenameFolderValue(targetFolder.name)
                        }}
                        onToggle={toggleFolder}
                        renameValue={renameFolderValue}
                        setRenameValue={setRenameFolderValue}
                      />
                    ) : (
                      <UnfiledSection
                        activeNoteId={activeNoteId}
                        dropIndicator={noteDropIndicator}
                        isExpanded={expandedFolderIds.has('__unfiled__')}
                        notes={unfiledNotes}
                        onSelectNote={handleSelectNote}
                        onToggle={() => toggleFolder('__unfiled__')}
                      />
                    )}
                    {draggedFolder ? (
                      <FolderRootDropSlot
                        active={folderDropIndicator?.kind === 'root' && folderDropIndicator.index === index + 1}
                        index={index + 1}
                      />
                    ) : null}
                  </Fragment>
                ))}
              </SortableContext>

              {/* Drag overlay */}
              <DragOverlay>
                {draggedNote ? (
                  <div className='rounded-lg border border-primary bg-surface-base px-4 py-3 pl-8 shadow-lg opacity-90'>
                    <span className='truncate text-sm font-semibold text-text-strong'>
                      {getNoteDisplayTitle(draggedNote)}
                    </span>
                  </div>
                ) : draggedFolder ? (
                  <div className='flex items-center gap-2 rounded-lg border border-primary bg-surface-base px-3 py-2 shadow-lg opacity-90'>
                    <FolderClosed className='h-4 w-4 text-text-muted'/>
                    <span className='text-sm font-medium text-text-muted'>{draggedFolder.name}</span>
                  </div>
                ) : isDraggingUnfiledTopLevelRow ? (
                  <div className='flex items-center gap-2 rounded-lg border border-primary bg-surface-base px-3 py-2 shadow-lg opacity-90'>
                    <FileText className='h-4 w-4 text-text-muted'/>
                    <span className='text-sm font-medium text-text-muted'>Unfiled</span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>

        {isDesktop ? (
          <div
            aria-hidden='true'
            className='absolute inset-y-0 right-[-6px] hidden w-3 cursor-col-resize lg:block'
            onMouseDown={handleFolderPanelResizeStart}
          >
            <div
              className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 ${isResizingFolderPanel ? 'bg-primary' : 'bg-border-subtle'}`}
            />
          </div>
        ) : null}
      </div>

      {/* Editor column */}
      <div className={`min-h-0 flex-1 ${isEditorPaneVisible ? 'flex' : 'max-lg:hidden lg:flex'}`}>
        <NoteEditorPanel
          granolaConnection={granolaConnection}
          isGranolaSyncing={isGranolaSyncing}
          isShellLoading={isLoading}
          loadErrorMessage={errorMessage}
          noteId={activeNoteId}
          onBackToList={activeNoteId ? () => setMobilePane('list') : undefined}
          onDelete={handleDeleteNote}
          onDuplicateImportedNote={onDuplicateImportedNote}
          onOpenAiChat={onOpenAiChat}
          onRetryLoad={onRetryLoad}
          onTitleFocusHandled={() => setNoteIdPendingTitleFocus(null)}
          shouldFocusTitle={activeNoteId != null && activeNoteId === noteIdPendingTitleFocus}
          userId={userId}
        />
      </div>
      {confirmDialogProps ? <ConfirmDialog {...confirmDialogProps}/> : null}
      {promptDialogProps ? <PromptDialog {...promptDialogProps}/> : null}
    </div>
  )
}

// ============================================================
// Loading and Error States
// ============================================================

function PanelInlineError({
  actionLabel,
  description,
  onAction,
  title,
}: {
  actionLabel?: string
  description: string
  onAction?: () => void
  title: string
}) {
  return (
    <div className='flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center'>
      <AlertTriangle className='h-10 w-10 text-error/70'/>
      <div className='space-y-1'>
        <div className='text-sm font-medium text-text-strong'>{title}</div>
        <p className='text-sm text-text-muted'>{description}</p>
      </div>
      {onAction && actionLabel ? (
        <button
          className='inline-flex min-h-11 items-center rounded-full border border-border-subtle bg-surface-elevated px-4 py-2 text-sm font-medium text-text-strong transition-colors hover:border-border-strong hover:bg-surface-base'
          onClick={onAction}
          type='button'
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

function NotesTreeSkeleton() {
  return (
    <div aria-hidden='true' className='space-y-2 px-3 py-3'>
      <div className='h-11 rounded-xl bg-canvas-accent/70'/>
      <div className='space-y-1 rounded-2xl border border-border-subtle/80 p-2'>
        <div className='h-10 rounded-lg bg-canvas-accent/70'/>
        <div className='h-16 rounded-xl bg-canvas-accent/50'/>
        <div className='h-16 rounded-xl bg-canvas-accent/50'/>
      </div>
      <div className='space-y-1 rounded-2xl border border-border-subtle/80 p-2'>
        <div className='h-10 rounded-lg bg-canvas-accent/70'/>
        <div className='h-16 rounded-xl bg-canvas-accent/50'/>
      </div>
    </div>
  )
}

function EditorChromeSkeleton() {
  return (
    <div aria-hidden='true' className='space-y-4'>
      <div className='h-12 rounded-2xl bg-canvas-accent/70'/>
      <div className='h-24 rounded-3xl border border-border-subtle/80 bg-canvas-accent/50'/>
      <div className='h-48 rounded-3xl border border-border-subtle/80 bg-canvas-accent/40'/>
      <div className='grid gap-3 md:grid-cols-2'>
        <div className='h-24 rounded-2xl bg-canvas-accent/40'/>
        <div className='h-24 rounded-2xl bg-canvas-accent/40'/>
      </div>
    </div>
  )
}

function EditorPanelSkeleton() {
  return (
    <div
      aria-busy='true'
      aria-live='polite'
      className='flex min-h-0 min-w-0 flex-1 flex-col bg-surface-base'
    >
      <div className='flex items-center justify-between gap-3 border-b border-border-subtle px-6 py-3'>
        <div className='h-11 w-full max-w-md rounded-2xl bg-canvas-accent/70'/>
        <div className='h-11 w-11 rounded-xl bg-canvas-accent/70'/>
      </div>
      <div className='flex-1 overflow-y-auto px-6 py-6 lg:px-12'>
        <EditorChromeSkeleton/>
      </div>
    </div>
  )
}

// ============================================================
// SortableFolderSection
// ============================================================

type FolderSectionProps = {
  activeNoteId: string | null
  childFolders: NoteFolderRecord[]
  descendantNoteCountByFolder: Map<string, number>
  dropIndicator: NoteDropIndicator | null
  expandedFolderIds: Set<string>
  folderDropIndicator: FolderDropIndicator | null
  folder: NoteFolderRecord
  folderChildrenByParent: Map<string | null, NoteFolderRecord[]>
  folderStatus?: GranolaFolderStatus | null
  isManaged?: boolean
  isExpanded: boolean
  isRenaming: boolean
  managedFolderIds: Set<string>
  notes: NoteListItem[]
  notesByFolder: Map<string | null, NoteListItem[]>
  onCancelRename: () => void
  onCreateFolder: (parentId: string | null) => Promise<void> | void
  onCreateNote: (folderId: string) => void
  onDeleteFolder: (folderId: string, folderName: string) => void
  onRenameFolder: (folderId: string) => void
  onSelectNote: (noteId: string) => void
  onStartRename: (folder: NoteFolderRecord) => void
  onToggle: (folderId: string) => void
  renameValue: string
  setRenameValue: (value: string) => void
}

function FolderNotes({
  activeNoteId,
  dropIndicator,
  emptyMessage,
  folderId,
  isManaged = false,
  notes,
  onSelectNote,
  showEmptyState = true,
}: {
  activeNoteId: string | null
  dropIndicator: NoteDropIndicator | null
  emptyMessage: string
  folderId: string | null
  isManaged?: boolean
  notes: NoteListItem[]
  onSelectNote: (noteId: string) => void
  showEmptyState?: boolean
}) {
  const noteSortableIds = useMemo(() => notes.map((n) => noteId(n.id)), [notes])
  const isDropSlotActive = (index: number) =>
    dropIndicator?.folderId === folderId && dropIndicator.targetIndex === index

  return (
    <SortableContext items={noteSortableIds} strategy={verticalListSortingStrategy}>
      {notes.length === 0 ? (
        <>
          <NoteInsertionSlot active={isDropSlotActive(0)} folderId={folderId} index={0}/>
          {showEmptyState ? (
            <div className='px-8 py-2 text-xs text-text-muted/60'>
              {emptyMessage}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <NoteInsertionSlot active={isDropSlotActive(0)} folderId={folderId} index={0}/>
          {notes.map((note, index) => (
            <Fragment key={note.id}>
              <SortableNoteRow
                active={activeNoteId === note.id}
                disableDrag={isManaged || isImportedNote(note)}
                note={note}
                onSelect={() => onSelectNote(note.id)}
              />
              <NoteInsertionSlot
                active={isDropSlotActive(index + 1)}
                folderId={folderId}
                index={index + 1}
              />
            </Fragment>
          ))}
        </>
      )}
    </SortableContext>
  )
}

function NestedFolderSection({
  activeNoteId,
  childFolders,
  descendantNoteCountByFolder,
  depth,
  dropIndicator,
  expandedFolderIds,
  folderDropIndicator,
  folder,
  folderChildrenByParent,
  folderStatus,
  isExpanded,
  isManaged = false,
  managedFolderIds,
  notes,
  notesByFolder,
  onSelectNote,
  onToggle,
}: {
  activeNoteId: string | null
  childFolders: NoteFolderRecord[]
  descendantNoteCountByFolder: Map<string, number>
  depth: number
  dropIndicator: NoteDropIndicator | null
  expandedFolderIds: Set<string>
  folderDropIndicator: FolderDropIndicator | null
  folder: NoteFolderRecord
  folderChildrenByParent: Map<string | null, NoteFolderRecord[]>
  folderStatus?: GranolaFolderStatus | null
  isExpanded: boolean
  isManaged?: boolean
  managedFolderIds: Set<string>
  notes: NoteListItem[]
  notesByFolder: Map<string | null, NoteListItem[]>
  onSelectNote: (noteId: string) => void
  onToggle: (folderId: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({disabled: isManaged, id: folderId(folder.id)})
  const {setNodeRef: setDropRef, isOver} = useDroppable({id: `drop:folder:${folder.id}`})
  const descendantNoteCount = descendantNoteCountByFolder.get(folder.id) ?? notes.length
  const childFolderSortableIds = useMemo(() => childFolders.map((childFolder) => folderId(childFolder.id)), [childFolders])
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  const showEndDropIndicator =
    dropIndicator?.folderId === folder.id
    && dropIndicator.targetIndex === notes.length
  const showFolderDropBefore =
    folderDropIndicator?.kind === 'row'
    && folderDropIndicator.folderId === folder.id
    && folderDropIndicator.position === 'before'
  const showFolderDropAfter =
    folderDropIndicator?.kind === 'row'
    && folderDropIndicator.folderId === folder.id
    && folderDropIndicator.position === 'after'
  const showFolderDropInside =
    folderDropIndicator?.kind === 'inside'
    && folderDropIndicator.folderId === folder.id
  const showCollapsedDropIntoFolder = showFolderDropInside || (showEndDropIndicator && !isExpanded)

  return (
    <div data-folder-depth={depth} ref={setNodeRef} style={style}>
      {showFolderDropBefore ? <NoteDropLine className='ml-8 mr-4'/> : null}
      <div
        className={`${TOP_LEVEL_FOLDER_ROW_CLASS_NAME} min-h-11 ${isOver ? 'bg-primary-soft' : ''}`}
        style={TOP_LEVEL_FOLDER_ROW_STYLE}
      >
        <button
          aria-label={`Reorder folder ${folder.name}`}
          className='inline-flex shrink-0 cursor-grab items-center justify-center rounded p-0.5 text-text-muted/40 opacity-0 transition-opacity hover:text-text-muted group-hover:opacity-100 active:cursor-grabbing disabled:cursor-default disabled:opacity-0'
          disabled={isManaged}
          style={TOP_LEVEL_FOLDER_HANDLE_SLOT_STYLE}
          type='button'
          {...(!isManaged ? attributes : {})}
          {...(!isManaged ? listeners : {})}
        >
          <GripVertical className='h-3 w-3'/>
        </button>
        <button
          ref={setDropRef}
          className='flex min-w-0 flex-1 items-center'
          onClick={() => onToggle(folder.id)}
          type='button'
        >
          <span
            aria-hidden='true'
            data-folder-indent-spacer={depth}
            className='shrink-0'
            style={{width: `${depth * FOLDER_DEPTH_PADDING}px`}}
          />
          <span className='flex min-w-0 flex-1 items-center gap-2'>
            <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}/>
            {isExpanded ? <FolderOpen className='h-4 w-4 shrink-0'/> : <FolderClosed className='h-4 w-4 shrink-0'/>}
            <span className='min-w-0 truncate' title={folder.name}>{folder.name}</span>
            {isManaged ? <FolderSyncStatusIcon status={folderStatus ?? DEFAULT_GRANOLA_FOLDER_STATUS}/> : null}
            <span className='ml-auto text-text-muted/60'>{descendantNoteCount}</span>
          </span>
        </button>
      </div>
      {showCollapsedDropIntoFolder ? (
        <DropTargetPlaceholder className='ml-8 mr-4 mt-1' label='Drop into folder'/>
      ) : null}
      {isExpanded ? (
        <>
          <SortableContext items={childFolderSortableIds} strategy={verticalListSortingStrategy}>
            {childFolders.map((childFolder) => (
              <NestedFolderSection
                key={childFolder.id}
                activeNoteId={activeNoteId}
                childFolders={folderChildrenByParent.get(childFolder.id) ?? []}
                descendantNoteCountByFolder={descendantNoteCountByFolder}
                depth={depth + 1}
                dropIndicator={dropIndicator}
                expandedFolderIds={expandedFolderIds}
                folderDropIndicator={folderDropIndicator}
                folder={childFolder}
                folderChildrenByParent={folderChildrenByParent}
                folderStatus={managedFolderIds.has(childFolder.id) ? (folderStatus ?? DEFAULT_GRANOLA_FOLDER_STATUS) : null}
                isExpanded={expandedFolderIds.has(childFolder.id)}
                isManaged={managedFolderIds.has(childFolder.id)}
                managedFolderIds={managedFolderIds}
                notes={notesByFolder.get(childFolder.id) ?? []}
                notesByFolder={notesByFolder}
                onSelectNote={onSelectNote}
                onToggle={onToggle}
              />
            ))}
          </SortableContext>
          <FolderNotes
            activeNoteId={activeNoteId}
            dropIndicator={dropIndicator}
            emptyMessage={isManaged ? 'Imported notes will appear here.' : 'No notes'}
            folderId={folder.id}
            isManaged={isManaged}
            notes={notes}
            onSelectNote={onSelectNote}
            showEmptyState={childFolders.length === 0}
          />
        </>
      ) : null}
      {showFolderDropAfter ? <NoteDropLine className='ml-8 mr-4'/> : null}
    </div>
  )
}

function SortableFolderSection(props: FolderSectionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({disabled: props.isManaged, id: folderId(props.folder.id)})

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  // Droppable zone for the folder (so notes can be dropped onto the folder header)
  const {setNodeRef: setDropRef, isOver} = useDroppable({id: `drop:folder:${props.folder.id}`})
  const descendantNoteCount = props.descendantNoteCountByFolder.get(props.folder.id) ?? props.notes.length
  const childFolderSortableIds = useMemo(
    () => props.childFolders.map((folder) => folderId(folder.id)),
    [props.childFolders],
  )
  const showEndDropIndicator =
    props.dropIndicator?.folderId === props.folder.id
    && props.dropIndicator.targetIndex === props.notes.length
  const showFolderDropBefore =
    props.folderDropIndicator?.kind === 'row'
    && props.folderDropIndicator.folderId === props.folder.id
    && props.folderDropIndicator.position === 'before'
  const showFolderDropAfter =
    props.folderDropIndicator?.kind === 'row'
    && props.folderDropIndicator.folderId === props.folder.id
    && props.folderDropIndicator.position === 'after'
  const showFolderDropInside =
    props.folderDropIndicator?.kind === 'inside'
    && props.folderDropIndicator.folderId === props.folder.id
  const showCollapsedDropIntoFolder = showFolderDropInside || (showEndDropIndicator && !props.isExpanded)

  return (
    <div ref={setNodeRef} style={style}>
      {showFolderDropBefore ? <NoteDropLine className='ml-8 mr-4'/> : null}
      {/* Folder header */}
      <TopLevelFolderRow isOver={isOver} rowRef={setDropRef}>
        <button
          aria-label={`Reorder folder ${props.folder.name}`}
          className='inline-flex shrink-0 cursor-grab items-center justify-center rounded p-0.5 text-text-muted/40 opacity-0 transition-opacity hover:text-text-muted group-hover:opacity-100 active:cursor-grabbing disabled:cursor-default disabled:opacity-0'
          disabled={props.isManaged}
          style={TOP_LEVEL_FOLDER_HANDLE_SLOT_STYLE}
          type='button'
          {...(!props.isManaged ? attributes : {})}
          {...(!props.isManaged ? listeners : {})}
        >
          <GripVertical className='h-3 w-3'/>
        </button>

        <button
          className={TOP_LEVEL_FOLDER_CONTENT_CLASS_NAME}
          onClick={() => props.onToggle(props.folder.id)}
          type='button'
        >
          <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${props.isExpanded ? 'rotate-90' : ''}`}/>
          {props.isExpanded ? <FolderOpen className='h-4 w-4 shrink-0'/> : <FolderClosed className='h-4 w-4 shrink-0'/>}
          {props.isRenaming ? (
            <input
              autoFocus
              className='h-5 flex-1 rounded border border-primary bg-surface-base px-1.5 text-sm normal-case tracking-normal text-text-strong outline-none'
              onBlur={() => props.onRenameFolder(props.folder.id)}
              onChange={(e) => props.setRenameValue(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') props.onRenameFolder(props.folder.id)
                if (e.key === 'Escape') props.onCancelRename()
              }}
              value={props.renameValue}
            />
          ) : (
            <span className='flex min-w-0 items-center gap-2'>
              <span className='min-w-0 truncate' title={props.folder.name}>{props.folder.name}</span>
              {props.isManaged ? <FolderSyncStatusIcon status={props.folderStatus ?? DEFAULT_GRANOLA_FOLDER_STATUS}/> : null}
            </span>
          )}
        </button>

        {!props.isRenaming ? (
          <div className='flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100'>
            <span className='mr-1 text-text-muted/60'>{descendantNoteCount}</span>
            {!props.isManaged ? (
              <>
                <AddActionMenu
                  buttonClassName='min-h-11 min-w-11 rounded p-0.5 text-text-muted hover:text-text-strong'
                  canCreateFolder={canCreateChildFolder(props.folder)}
                  onAddFolder={() => { void props.onCreateFolder(props.folder.id) }}
                  onAddNote={() => props.onCreateNote(props.folder.id)}
                  title='Add note or folder'
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className='min-h-11 min-w-11 rounded p-0.5 text-text-muted hover:text-text-strong' type='button'>
                      <MoreHorizontal className='h-3.5 w-3.5'/>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='start'>
                    <DropdownMenuItem onClick={() => props.onStartRename(props.folder)}>
                      <Pencil className='h-4 w-4'/>
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className='text-error focus:text-error'
                      onClick={() => props.onDeleteFolder(props.folder.id, props.folder.name)}
                    >
                      <Trash2 className='h-4 w-4'/>
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null}
          </div>
        ) : null}
      </TopLevelFolderRow>
      {showCollapsedDropIntoFolder ? (
        <DropTargetPlaceholder className='ml-8 mr-4 mt-1' label='Drop into folder'/>
      ) : null}

      {/* Notes under this folder */}
      {props.isExpanded ? (
        <>
          <SortableContext items={childFolderSortableIds} strategy={verticalListSortingStrategy}>
            {props.childFolders.map((folder) => (
              <NestedFolderSection
                key={folder.id}
                activeNoteId={props.activeNoteId}
                childFolders={props.folderChildrenByParent.get(folder.id) ?? []}
                descendantNoteCountByFolder={props.descendantNoteCountByFolder}
                depth={1}
                dropIndicator={props.dropIndicator}
                expandedFolderIds={props.expandedFolderIds}
                folderDropIndicator={props.folderDropIndicator}
                folder={folder}
                folderChildrenByParent={props.folderChildrenByParent}
                folderStatus={props.managedFolderIds.has(folder.id) ? (props.folderStatus ?? DEFAULT_GRANOLA_FOLDER_STATUS) : null}
                isExpanded={props.expandedFolderIds.has(folder.id)}
                isManaged={props.managedFolderIds.has(folder.id)}
                managedFolderIds={props.managedFolderIds}
                notes={props.notesByFolder.get(folder.id) ?? []}
                notesByFolder={props.notesByFolder}
                onSelectNote={props.onSelectNote}
                onToggle={props.onToggle}
              />
            ))}
          </SortableContext>
          <FolderNotes
            activeNoteId={props.activeNoteId}
            dropIndicator={props.dropIndicator}
            emptyMessage={props.isManaged ? 'Imported notes will appear here.' : 'No notes'}
            folderId={props.folder.id}
            isManaged={props.isManaged}
            notes={props.notes}
            onSelectNote={props.onSelectNote}
            showEmptyState={props.childFolders.length === 0}
          />
        </>
      ) : null}
      {showFolderDropAfter ? <NoteDropLine className='ml-8 mr-4'/> : null}
    </div>
  )
}

// ============================================================
// UnfiledSection
// ============================================================

function UnfiledSection({
  activeNoteId,
  dropIndicator,
  isExpanded,
  notes,
  onSelectNote,
  onToggle,
}: {
  activeNoteId: string | null
  dropIndicator: NoteDropIndicator | null
  isExpanded: boolean
  notes: NoteListItem[]
  onSelectNote: (noteId: string) => void
  onToggle: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({id: UNFILED_TOP_LEVEL_DND_ID})
  const {setNodeRef: setDropRef, isOver} = useDroppable({id: 'drop:folder:__unfiled__'})

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  const showEndDropIndicator =
    dropIndicator?.folderId === null
    && dropIndicator.targetIndex === notes.length

  return (
    <div ref={setNodeRef} style={style}>
      <TopLevelFolderRow isOver={isOver} rowRef={setDropRef}>
        <button
          aria-label='Reorder folder Unfiled'
          className='inline-flex shrink-0 cursor-grab items-center justify-center rounded p-0.5 text-text-muted/40 opacity-0 transition-opacity hover:text-text-muted group-hover:opacity-100 active:cursor-grabbing'
          style={TOP_LEVEL_FOLDER_HANDLE_SLOT_STYLE}
          type='button'
          {...attributes}
          {...listeners}
        >
          <GripVertical className='h-3 w-3'/>
        </button>
        <button
          className={TOP_LEVEL_FOLDER_CONTENT_CLASS_NAME}
          onClick={onToggle}
          type='button'
        >
          <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}/>
          <FileText className='h-4 w-4 shrink-0'/>
          <span>Unfiled</span>
          <span className='ml-auto text-text-muted/60'>{notes.length}</span>
        </button>
      </TopLevelFolderRow>
      {showEndDropIndicator && !isExpanded ? <NoteDropLine className='ml-8 mr-4'/> : null}
      {isExpanded ? (
        <FolderNotes
          activeNoteId={activeNoteId}
          dropIndicator={dropIndicator}
          emptyMessage='No unfiled notes'
          folderId={null}
          notes={notes}
          onSelectNote={onSelectNote}
          showEmptyState={true}
        />
      ) : null}
    </div>
  )
}

// ============================================================
// SortableNoteRow
// ============================================================

function SortableNoteRow({
  active,
  disableDrag = false,
  note,
  onSelect,
}: {
  active: boolean
  disableDrag?: boolean
  note: NoteListItem
  onSelect: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({disabled: disableDrag, id: noteId(note.id)})

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  const noteTitle = getNoteDisplayTitle(note)
  const notePreview = getNotePreview(note)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group/note relative flex w-full items-start border-b border-border-subtle text-left transition-colors hover:bg-canvas-accent ${
        active ? 'bg-primary-soft' : ''
      }`}
    >
      {/* Drag handle */}
      <button
        className='mt-3.5 flex-shrink-0 cursor-grab rounded p-0.5 pl-2 text-text-muted/30 opacity-0 transition-opacity hover:text-text-muted group-hover/note:opacity-100 active:cursor-grabbing disabled:cursor-default disabled:opacity-0'
        type='button'
        disabled={disableDrag}
        {...(!disableDrag ? attributes : {})}
        {...(!disableDrag ? listeners : {})}
      >
        <GripVertical className='h-3 w-3'/>
      </button>

      {/* Note content */}
      <button
        className={`flex min-h-11 min-w-0 flex-1 flex-col gap-1 px-2 py-3 pr-4 text-left ${
          disableDrag ? '' : 'cursor-grab active:cursor-grabbing'
        }`}
        onClick={onSelect}
        type='button'
        {...(!disableDrag ? listeners : {})}
      >
        <span
          className={`truncate text-sm font-semibold ${active ? 'text-primary' : 'text-text-strong'}`}
          title={noteTitle}
        >
          {noteTitle}
        </span>
        <div className='flex items-center gap-2 text-xs text-text-muted'>
          <span className='shrink-0'>{formatNoteDate(note.sourceUpdatedAt ?? note.updatedAt)}</span>
          {notePreview ? (
            <span className='min-w-0 flex-1 truncate text-text-muted/60'>{notePreview}</span>
          ) : null}
        </div>
      </button>
    </div>
  )
}

// ============================================================
// AddActionMenu
// ============================================================

function AddActionMenu({
  align = 'start',
  buttonClassName,
  canCreateFolder = true,
  onAddFolder,
  onAddNote,
  title,
}: {
  align?: 'center' | 'end' | 'start'
  buttonClassName: string
  canCreateFolder?: boolean
  onAddFolder: () => void
  onAddNote: () => void
  title: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={buttonClassName} title={title} type='button'>
          <Plus className='h-4 w-4'/>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} onCloseAutoFocus={(event) => event.preventDefault()}>
        <DropdownMenuItem onClick={onAddNote}>
          <FileText className='h-4 w-4'/>
          Add New Note
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canCreateFolder} onClick={onAddFolder}>
          <FolderPlus className='h-4 w-4'/>
          Add New Folder
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ============================================================
// SortDropdown
// ============================================================

function SortDropdown({sortBy, onSortChange}: {sortBy: NoteSortBy; onSortChange: (s: NoteSortBy) => void}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className='min-h-11 min-w-11 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong'
          title='Sort notes'
          type='button'
        >
          <ArrowUpDown className='h-4 w-4'/>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onSortChange('manual')}>
          <Hand className='h-4 w-4'/>
          Manual
          {sortBy === 'manual' ? <Check className='ml-auto h-4 w-4'/> : null}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSortChange('updatedAt')}>
          <Clock className='h-4 w-4'/>
          Date Modified
          {sortBy === 'updatedAt' ? <Check className='ml-auto h-4 w-4'/> : null}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSortChange('createdAt')}>
          <CalendarDays className='h-4 w-4'/>
          Date Created
          {sortBy === 'createdAt' ? <Check className='ml-auto h-4 w-4'/> : null}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSortChange('title')}>
          <ArrowDownAZ className='h-4 w-4'/>
          Title
          {sortBy === 'title' ? <Check className='ml-auto h-4 w-4'/> : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ============================================================
// NoteEditorPanel
// ============================================================

type NoteEditorPanelProps = {
  granolaConnection: GranolaConnectionRecord | null
  isGranolaSyncing: boolean
  isShellLoading: boolean
  loadErrorMessage?: string | null
  noteId: string | null
  onBackToList?: () => void
  onDelete: (noteId: string) => void
  onDuplicateImportedNote?: (noteId: string) => void
  onOpenAiChat?: () => void
  onRetryLoad?: () => void
  onTitleFocusHandled?: () => void
  shouldFocusTitle?: boolean
  userId: string
}

function NoteEditorPanel({
  granolaConnection,
  isGranolaSyncing,
  isShellLoading,
  loadErrorMessage,
  noteId: panelNoteId,
  onBackToList,
  onDelete,
  onDuplicateImportedNote,
  onOpenAiChat,
  onRetryLoad,
  onTitleFocusHandled,
  shouldFocusTitle = false,
}: NoteEditorPanelProps) {
  const noteQuery = useNoteQuery(panelNoteId)
  const updateNoteMutation = useUpdateNoteMutation()
  const [title, setTitle] = useState('')
  const [bodyFocusRequestKey, setBodyFocusRequestKey] = useState(0)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const lastNoteIdRef = useRef<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingContentRef = useRef<{contentJson: RichTextDocument; contentMd: string} | null>(null)
  const previousGranolaSyncingRef = useRef(isGranolaSyncing)
  const titleInputRef = useRef<HTMLInputElement | null>(null)

  const note = noteQuery.data
  const imported = note ? isImportedNote(note) : false
  const currentMarkdown = pendingContentRef.current?.contentMd ?? note?.contentMd ?? ''
  const currentMarkdownFilename = buildMarkdownFilename(
    getNoteDisplayTitle({contentMd: currentMarkdown, title}),
  )
  const detailErrorMessage = noteQuery.error
    ? getErrorMessage(noteQuery.error, "Rocketboard couldn't load this note.")
    : null

  useEffect(() => {
    if (note && lastNoteIdRef.current !== note.id) {
      setTitle(note.title)
      lastNoteIdRef.current = note.id
      setSaveStatus('idle')
    }
  }, [note])

  useEffect(() => {
    if (!note || imported || !shouldFocusTitle) {
      return
    }

    const focusTitle = () => {
      titleInputRef.current?.focus()
      onTitleFocusHandled?.()
    }

    const timeoutId = window.setTimeout(focusTitle, 0)
    return () => window.clearTimeout(timeoutId)
  }, [imported, note, onTitleFocusHandled, shouldFocusTitle])

  useEffect(() => {
    const shouldRefreshImportedNote =
      previousGranolaSyncingRef.current
      && !isGranolaSyncing
      && imported

    previousGranolaSyncingRef.current = isGranolaSyncing

    if (!shouldRefreshImportedNote) {
      return
    }

    void noteQuery.refetch()
  }, [imported, isGranolaSyncing, noteQuery])

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (imported) {
      pendingContentRef.current = null
      return
    }
    if (pendingContentRef.current && panelNoteId) {
      updateNoteMutation.mutate({
        noteId: panelNoteId,
        patch: {
          contentJson: pendingContentRef.current.contentJson,
          contentMd: pendingContentRef.current.contentMd,
        },
      })
      pendingContentRef.current = null
    }
  }, [imported, panelNoteId, updateNoteMutation])

  useEffect(() => {
    return () => { flushSave() }
  }, [panelNoteId, flushSave])

  useEffect(() => {
    const handleBeforeUnload = () => { flushSave() }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [flushSave])

  const handleTitleBlur = useCallback(() => {
    if (imported) return
    const nextTitle = title.trim()
    if (!note || nextTitle === note.title) return
    setSaveStatus('saving')
    updateNoteMutation.mutate(
      {noteId: note.id, patch: {title: nextTitle}},
      {
        onSuccess: () => setSaveStatus('saved'),
        onError: () => setSaveStatus('error'),
      },
    )
  }, [imported, note, title, updateNoteMutation])

  const handleContentChange = useCallback((content: RichTextDocument) => {
    if (imported) return
    if (!panelNoteId) return
    const prepared = prepareContentForSave(content)
    pendingContentRef.current = prepared
    setSaveStatus('saving')

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      if (pendingContentRef.current) {
        updateNoteMutation.mutate(
          {noteId: panelNoteId, patch: {contentJson: pendingContentRef.current.contentJson, contentMd: pendingContentRef.current.contentMd}},
          {
            onSuccess: () => { pendingContentRef.current = null; setSaveStatus('saved') },
            onError: () => setSaveStatus('error'),
          },
        )
      }
    }, 500)
  }, [imported, panelNoteId, updateNoteMutation])

  const handleDownloadMarkdown = useCallback(() => {
    const blob = new Blob([currentMarkdown], {type: 'text/markdown'})
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = currentMarkdownFilename
    anchor.click()
    URL.revokeObjectURL(url)
  }, [currentMarkdown, currentMarkdownFilename])

  if (loadErrorMessage) {
    return (
      <div className='flex min-h-0 flex-1 flex-col bg-surface-base'>
        <PanelInlineError
          actionLabel={onRetryLoad ? 'Retry' : undefined}
          description={loadErrorMessage}
          onAction={onRetryLoad}
          title='Could not load notes'
        />
      </div>
    )
  }

  if (isShellLoading) {
    return <EditorPanelSkeleton/>
  }

  if (!panelNoteId) {
    return (
      <div className='flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-surface-base px-6 text-center'>
        <FileText className='h-12 w-12 text-text-muted/20'/>
        <span className='text-sm text-text-muted'>Select a note to view</span>
      </div>
    )
  }

  if (noteQuery.isPending) {
    return <EditorPanelSkeleton/>
  }

  if (detailErrorMessage) {
    return (
      <div className='flex min-h-0 flex-1 flex-col bg-surface-base'>
        <PanelInlineError
          actionLabel='Retry'
          description={detailErrorMessage}
          onAction={() => { void noteQuery.refetch() }}
          title='Could not load this note'
        />
      </div>
    )
  }

  if (!note) {
    return (
      <div className='flex flex-1 items-center justify-center bg-surface-base'>
        <span className='text-sm text-text-muted'>Note not found</span>
      </div>
    )
  }

  return (
    <div aria-busy={false} className='flex min-h-0 min-w-0 flex-1 flex-col bg-surface-base'>
      <div className='flex items-center justify-between gap-3 border-b border-border-subtle px-6 py-3'>
        <div className='flex min-w-0 flex-1 items-center gap-3'>
          {onBackToList ? (
            <button
              aria-label='Back to notes'
              className='inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong lg:hidden'
              onClick={onBackToList}
              type='button'
            >
              <ChevronRight className='h-4 w-4 rotate-180'/>
            </button>
          ) : null}
          <input
            className='flex-1 bg-transparent text-xl font-semibold text-text-strong outline-none placeholder:text-text-muted disabled:cursor-default'
            disabled={imported}
            onBlur={handleTitleBlur}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') {
                return
              }

              e.preventDefault()
              e.currentTarget.blur()
              setBodyFocusRequestKey((current) => current + 1)
            }}
            placeholder='New Note'
            ref={titleInputRef}
            value={title}
          />
        </div>
        <div className='flex items-center gap-2'>
          {imported ? null : saveStatus === 'saving' ? (
            <span className='text-xs text-text-muted'>Saving...</span>
          ) : saveStatus === 'saved' ? (
            <span className='text-xs text-text-muted'>Saved</span>
          ) : saveStatus === 'error' ? (
            <span className='text-xs text-error'>Error saving</span>
          ) : null}

          {onOpenAiChat ? (
            <button
              aria-label='Ask AI'
              className='min-h-11 min-w-11 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-primary/10 hover:text-primary'
              onClick={onOpenAiChat}
              title='Ask AI'
              type='button'
            >
              <Bot className='h-4 w-4'/>
            </button>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label='Note actions'
                className='min-h-11 min-w-11 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong'
                title='Note actions'
                type='button'
              >
                <MoreHorizontal className='h-4 w-4'/>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={handleDownloadMarkdown}>
                <Download className='h-4 w-4'/>
                Download as .md
              </DropdownMenuItem>
              <DropdownMenuItem
                className='text-error focus:text-error'
                onClick={() => onDelete(note.id)}
              >
                <Trash2 className='h-4 w-4'/>
                Delete note
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {imported && note ? (
        <div className='border-b border-border-subtle bg-canvas-accent/60 px-6 py-4 lg:px-12'>
          <div className='flex flex-col gap-3 rounded-[24px] border border-border-subtle bg-surface-elevated p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between'>
            <div className='space-y-2'>
              <div className='flex flex-wrap items-center gap-2 text-sm text-text-medium'>
                <span className='inline-flex items-center gap-1 rounded-full border border-border-subtle bg-surface-base px-3 py-1 font-medium text-text-strong'>
                  <ShieldCheck className='h-4 w-4'/>
                  Read-only
                </span>
                <span>Mirrored from Granola</span>
              </div>
              <div className='flex flex-wrap items-center gap-2 text-sm text-text-muted'>
                {isGranolaSyncing ? (
                  <>
                    <RefreshCw className='h-4 w-4 animate-spin'/>
                    <span>Syncing now</span>
                  </>
                ) : granolaConnection?.status === 'needs_reconnect' ? (
                  <span>Reconnect required. Imported notes already in My Notes remain available.</span>
                ) : (
                  <span>
                    Last synced {granolaConnection?.lastSyncFinishedAt ? formatNoteDate(granolaConnection.lastSyncFinishedAt) : 'not yet'}
                  </span>
                )}
              </div>
            </div>
            {onDuplicateImportedNote ? (
              <button
                className='inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border-subtle bg-surface-base px-4 py-2 text-sm font-medium text-text-strong transition-colors hover:border-border-strong hover:bg-canvas-accent'
                onClick={() => onDuplicateImportedNote(note.id)}
                type='button'
              >
                <Copy className='h-4 w-4'/>
                Duplicate as editable note
              </button>
            ) : null}
          </div>
        </div>
      ) : !imported && note?.sourceProvider ? (
        <div className='border-b border-border-subtle px-6 py-2 lg:px-12'>
          <span className='text-xs text-text-muted'>
            Captured from {note.sourceProvider === 'obsidian' ? 'Obsidian' : 'Granola'}
          </span>
        </div>
      ) : null}

      <div className='flex-1 overflow-y-auto px-6 py-6 lg:px-12'>
        <Suspense fallback={<EditorChromeSkeleton/>}>
          <LazyRichTextEditor
            editable={!imported}
            focusRequestKey={bodyFocusRequestKey}
            onChange={handleContentChange}
            placeholder='Start writing...'
            value={note.contentJson}
          />
        </Suspense>
      </div>
    </div>
  )
}
