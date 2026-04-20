import {useNavigate, useParams, useSearch} from '@tanstack/react-router'
import {Suspense, useCallback, useEffect, useMemo, useState} from 'react'
import {Plus, ChevronDown, Search} from 'lucide-react'
import {useQueryClient} from '@tanstack/react-query'

import {lazyWithRetry} from '../../../app/lazyWithRetry'
import {Button} from '../../../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu'
import {Input} from '../../../components/ui/input'
import {
  buildBoardTasks,
  formatCardStatusLabel,
} from '../../cards/card-view-mappers'
import {applyTableViewDraftToCards, sortCards} from '../../cards/card-sorting'
import {
  runMoveCardMutation,
} from '../../cards/card.queries'
import {useActionHistory} from '../../cards/useActionHistory'
import {isEditableEventTarget} from '../../../lib/dom'
import {
  getPersonalBoardViewConfigFromStorage,
  setPersonalBoardViewConfigToStorage,
} from '../../projects/personal-view-storage'
import type {ProjectBoardViewDraft} from '../../projects/project-view.types'
import {ProjectSearchPanel} from '../../search/ProjectSearchPanel'
import {useProjectChrome} from '../project/ProjectChromeContext'
import {useProjectData} from '../project/ProjectDataContext'
import {useProjectDialogs} from '../project/ProjectDialogContext'
import {ProjectTaskModeControl} from '../ProjectTaskModeControl'
import {ToolbarPortal} from '../ToolbarSlot'
import {PersonFilter} from '../PersonFilter'
import {QuickFilterMenu} from '../QuickFilterMenu'
import {SortMenu} from '../SortMenu'
import type {CardRecord} from '../../cards/card.types'
import {listTableSortFieldOptions} from '../../projects/table-view-fields'
import {parseBoardSearchParams, buildBoardSearchParams, type BoardSearchParams} from '../view-search-params'
import {ViewSkeleton} from '../views/ViewSkeletons'
import {useAutoSavePersonalConfig} from '../hooks/useAutoSavePersonalConfig'
import {useInitializeViewSearch} from '../hooks/useInitializeViewSearch'
import {useLocalStorageSync} from '../hooks/useLocalStorageSync'
import {useViewSearchPipeline} from '../hooks/useViewSearchPipeline'

const BoardView = lazyWithRetry(() => import('../views/BoardView').then((m) => ({default: m.BoardView})))

function normalizeCollapsedColumnIds(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return [...new Set(value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim()))]
}

export function BoardViewRoute() {
  const params = useParams({strict: false}) as {viewId: string}
  const search = useSearch({strict: false})
  const rawNavigate = useNavigate()
  const navigate = useCallback((options: {replace: true; search: () => BoardSearchParams}) => {
    void rawNavigate({
      replace: options.replace,
      search: options.search as never,
    } as never)
  }, [rawNavigate])
  const queryClient = useQueryClient()
  const {canEditProject, currentUser, mode, project, projectId, projectMembers} = useProjectChrome()
  const {
    cards,
    customFields,
    displayProjectSprints,
    displayProjectSprintsInferred,
    handleMoveCardToSprint,
    projectGroups,
    projectTaskMode,
    projectTaskModeReady,
  } = useProjectData()
  const {
    openCard,
    openCardComposer,
    surfaceActionError,
    setSurfaceActionError,
  } = useProjectDialogs()
  const viewId = params.viewId

  // URL search params are the current view config
  const parsedSearch = parseBoardSearchParams(search)

  // Board doesn't have a DB-backed shared config yet, so baseline is defaults
  const sharedBaseline = useMemo((): ProjectBoardViewDraft => ({
    filters: {priority: [], status: []},
    personFilterUserId: null,
    sort: [],
  }), [])

  const getPersonalConfig = useCallback(
    () => getPersonalBoardViewConfigFromStorage(viewId),
    [viewId],
  )
  const [collapsedColumnIds, setCollapsedColumnIds] = useState<string[]>(() => getPersonalConfig()?.collapsedColumnIds ?? [])

  // Two-phase init: personal config from localStorage immediately, shared baseline as fallback
  useInitializeViewSearch({
    buildSearchParams: buildBoardSearchParams,
    getPersonalConfig,
    navigate,
    routeKey: `${projectId}:${viewId}`,
    search,
    sharedBaseline,
  })

  // Auto-save personal config to localStorage on change
  const personalConfig = useMemo(() => ({
    collapsedColumnIds,
    filters: parsedSearch.filters,
    personFilterUserId: parsedSearch.personFilterUserId,
    sort: parsedSearch.sort,
  }), [collapsedColumnIds, parsedSearch.filters, parsedSearch.personFilterUserId, parsedSearch.sort])

  useAutoSavePersonalConfig(viewId, personalConfig, setPersonalBoardViewConfigToStorage)

  // Cross-tab sync for personal settings
  useLocalStorageSync(
    `rocketboard:personalBoardView:${viewId}`,
    useCallback((newValue) => {
      if (!newValue) return
      try {
        const config = JSON.parse(newValue)
        setCollapsedColumnIds(normalizeCollapsedColumnIds(config.collapsedColumnIds))
        void navigate({
          search: () => buildBoardSearchParams({...parseBoardSearchParams(search), ...config}),
          replace: true,
        })
      } catch { /* ignore corrupt data */ }
    }, [navigate, search]),
  )

  const updateSearch = useCallback((patch: Partial<ReturnType<typeof parseBoardSearchParams>>) => {
    const current = parseBoardSearchParams(search)
    const merged = {...current, ...patch}
    void navigate({
      search: () => buildBoardSearchParams(merged),
      replace: true,
    })
  }, [navigate, search])

  const [isSurfaceMutationPending, setIsSurfaceMutationPending] = useState(false)

  const {
    canRedo,
    canUndo,
    clear: _clearHistory,
    errorMessage: historyErrorMessage,
    isPending: isHistoryPending,
    lastActionDescription,
    push: pushAction,
    redo,
    undo,
  } = useActionHistory<CardRecord>()

  const isSprintMode = projectTaskMode === 'sprint'

  const {searchOpen, setSearchOpen, searchValue, setSearchValue, activeSearchValue, visibleCards, searchQuery} = useViewSearchPipeline(projectId, cards, parsedSearch.personFilterUserId)

  const boardInteractionDisabled = !canEditProject || isSurfaceMutationPending || isHistoryPending || Boolean(activeSearchValue)

  // Build a ProjectBoardViewDraft for downstream consumption
  const boardViewDraft = useMemo((): ProjectBoardViewDraft => ({
    filters: parsedSearch.filters,
    personFilterUserId: parsedSearch.personFilterUserId,
    sort: parsedSearch.sort,
  }), [parsedSearch])

  const filteredCards = useMemo(() => {
    const filtered = applyTableViewDraftToCards(visibleCards, boardViewDraft)
    return boardViewDraft.sort.length > 0
      ? sortCards(filtered, boardViewDraft.sort, customFields, {
        groupBy: 'status',
        projectGroups,
      })
      : filtered
  }, [visibleCards, boardViewDraft, customFields, projectGroups])

  const boardLayout = useMemo(
    () => buildBoardTasks(filteredCards, project.statusOptions, project.priorityOptions, projectTaskMode, displayProjectSprints),
    [displayProjectSprints, filteredCards, project.statusOptions, project.priorityOptions, projectTaskMode],
  )
  const boardColumns = useMemo(
    () => project.statusOptions.map((option) => ({id: option.id, title: option.label})),
    [project.statusOptions],
  )
  const validBoardColumnIds = useMemo(
    () => new Set(boardColumns.map((column) => column.id)),
    [boardColumns],
  )

  const sortFieldOptions = useMemo(
    () => listTableSortFieldOptions(customFields, project.builtinFieldLabels),
    [customFields, project.builtinFieldLabels],
  )

  useEffect(() => {
    setCollapsedColumnIds(getPersonalConfig()?.collapsedColumnIds ?? [])
  }, [getPersonalConfig, viewId])

  useEffect(() => {
    setCollapsedColumnIds((current) => {
      const next = current.filter((columnId) => validBoardColumnIds.has(columnId))
      return next.length === current.length ? current : next
    })
  }, [validBoardColumnIds])

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((!event.metaKey && !event.ctrlKey) || isEditableEventTarget(event.target)) return
      const key = event.key.toLowerCase()
      if (key === 'z' && event.shiftKey) {
        if (!canRedo || isHistoryPending) return
        event.preventDefault()
        void redo()
      } else if (key === 'z') {
        if (!canUndo || isHistoryPending) return
        event.preventDefault()
        void undo()
      } else if (key === 'y' || key === 'r') {
        if (!canRedo || isHistoryPending) return
        event.preventDefault()
        void redo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canRedo, canUndo, isHistoryPending, redo, undo])

  const persistBoardMove = useCallback(async (input: {
    cardId: string
    rollbackPosition: number
    rollbackSprintId: string | null
    rollbackStatusOptionId: string | null
    targetPosition: number
    targetSprintId: string | null
    targetStatusOptionId: string | null
  }) => {
    const card = await runMoveCardMutation(queryClient, {
      cardId: input.cardId,
      projectId,
      targetPosition: input.targetPosition,
      targetStatusOptionId: input.targetStatusOptionId,
    })

    if (isSprintMode && input.rollbackSprintId !== input.targetSprintId) {
      const sprintMoveSucceeded = await handleMoveCardToSprint(input.cardId, input.targetSprintId)

      if (!sprintMoveSucceeded) {
        await runMoveCardMutation(queryClient, {
          cardId: input.cardId,
          projectId,
          targetPosition: input.rollbackPosition,
          targetStatusOptionId: input.rollbackStatusOptionId,
        })
        return null
      }
    }

    return card
  }, [handleMoveCardToSprint, isSprintMode, projectId, queryClient])

  const handleBoardMove = useCallback(async (input: {
    cardId: string
    previousPosition: number
    previousStatusOptionId: string | null
    previousSprintId: string | null
    targetPosition: number
    targetSprintId: string | null
    targetStatusOptionId: string | null
  }) => {
    if (boardInteractionDisabled) return false
    setIsSurfaceMutationPending(true)
    setSurfaceActionError(null)
    const targetLabel = formatCardStatusLabel(input.targetStatusOptionId, project.statusOptions)
    try {
      const card = await persistBoardMove({
        cardId: input.cardId,
        rollbackPosition: input.previousPosition,
        rollbackSprintId: input.previousSprintId,
        rollbackStatusOptionId: input.previousStatusOptionId,
        targetPosition: input.targetPosition,
        targetSprintId: input.targetSprintId,
        targetStatusOptionId: input.targetStatusOptionId,
      })

      if (!card) {
        setSurfaceActionError('The sprint change could not be saved.')
        return false
      }

      pushAction({
        description: `Moved task to ${targetLabel}`,
        redo: async () => {
          const card = await persistBoardMove({
            cardId: input.cardId,
            rollbackPosition: input.previousPosition,
            rollbackSprintId: input.previousSprintId,
            rollbackStatusOptionId: input.previousStatusOptionId,
            targetPosition: input.targetPosition,
            targetSprintId: input.targetSprintId,
            targetStatusOptionId: input.targetStatusOptionId,
          })

          if (!card) {
            throw new Error('The sprint change could not be saved.')
          }

          return card
        },
        undo: async () => {
          const card = await persistBoardMove({
            cardId: input.cardId,
            rollbackPosition: input.targetPosition,
            rollbackSprintId: input.targetSprintId,
            rollbackStatusOptionId: input.targetStatusOptionId,
            targetPosition: input.previousPosition,
            targetSprintId: input.previousSprintId,
            targetStatusOptionId: input.previousStatusOptionId,
          })

          if (!card) {
            throw new Error('The sprint change could not be saved.')
          }

          return card
        },
      })
      return true
    } catch (error) {
      setSurfaceActionError(error instanceof Error ? error.message : 'The card move could not be saved.')
      return false
    } finally {
      setIsSurfaceMutationPending(false)
    }
  }, [boardInteractionDisabled, persistBoardMove, project.statusOptions, pushAction, setSurfaceActionError])

  return (
    <>
      {projectTaskModeReady ? (
        <>
          <ToolbarPortal slot="leading">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button disabled={!canEditProject} variant='primary'>
                  <Plus className='h-4 w-4'/>
                  Add task
                  <ChevronDown className='h-3 w-3'/>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='start'>
                <DropdownMenuItem disabled={!canEditProject} onClick={() => void openCardComposer()}>
                  <Plus className='h-4 w-4'/>
                  Add task
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className='h-6 w-px bg-border-subtle'/>
            <Button onClick={() => { setSearchOpen((c) => { if (c) setSearchValue(''); return !c }) }} variant='secondary'>
              <Search className='h-4 w-4'/>
              Search
            </Button>
            {searchOpen ? (
              <div className='relative min-w-[16rem] max-w-xs flex-1'>
                <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted'/>
                <Input className='pl-9' onChange={(e) => setSearchValue(e.target.value)} placeholder='Search title, description, tags, assignee…' value={searchValue}/>
              </div>
            ) : null}
            <PersonFilter currentUserId={currentUser.id} onSelectPerson={(userId) => updateSearch({personFilterUserId: userId})} projectMembers={projectMembers} selectedUserId={parsedSearch.personFilterUserId}/>
            <QuickFilterMenu filters={parsedSearch.filters} onFiltersChange={(filters) => updateSearch({filters})} priorityOptions={project.priorityOptions} statusOptions={project.statusOptions}/>
            <SortMenu onSortChange={(sort) => updateSearch({sort})} sort={parsedSearch.sort} sortFieldOptions={sortFieldOptions}/>
          </ToolbarPortal>

          <ToolbarPortal slot="trailing">
            <div className='flex flex-wrap items-center justify-end gap-2'>
              {activeSearchValue ? (
                <span className='text-xs font-medium uppercase tracking-wide text-text-muted'>Clear search to reorder tasks</span>
              ) : lastActionDescription ? (
                <span className='text-xs font-medium uppercase tracking-wide text-text-muted'>Last: {lastActionDescription}</span>
              ) : null}
            </div>
          </ToolbarPortal>
        </>
      ) : null}

      <ToolbarPortal slot="view-tabs-trailing">
        <ProjectTaskModeControl/>
      </ToolbarPortal>

      {projectTaskModeReady ? (
      <div className='flex-1 bg-canvas overflow-auto p-4 sm:p-6'>
      {surfaceActionError || historyErrorMessage ? (
        <div className='mb-4 rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error'>
          {surfaceActionError ?? historyErrorMessage}
        </div>
      ) : null}
      {activeSearchValue ? (
        <ProjectSearchPanel
          errorMessage={searchQuery.error instanceof Error ? searchQuery.error.message : null}
          isPending={searchQuery.isPending}
          onOpenCard={openCard}
          query={activeSearchValue}
          results={searchQuery.data ?? {cards: [], documents: []}}
          statusOptions={project.statusOptions}
        />
      ) : null}
      <Suspense fallback={null}>
        <BoardView
          boardColumns={boardColumns}
          boardLanes={boardLayout.lanes}
          boardTasks={boardLayout.tasksByColumn}
          collapsedColumnIds={collapsedColumnIds}
          displayProjectSprintsInferred={displayProjectSprintsInferred}
          isInteractionDisabled={boardInteractionDisabled}
          mode={mode}
          onCreateTask={openCardComposer}
          onCollapsedColumnIdsChange={setCollapsedColumnIds}
          onMoveBlocked={setSurfaceActionError}
          onMoveTask={handleBoardMove}
          onOpenTask={openCard}
          projectMembers={projectMembers}
          statusOptions={project.statusOptions}
          taskMode={projectTaskMode}
        />
      </Suspense>
    </div>
      ) : (
        <div className='flex-1 bg-canvas'>
          <ViewSkeleton viewType='kanban'/>
        </div>
      )}
    </>
  )
}
