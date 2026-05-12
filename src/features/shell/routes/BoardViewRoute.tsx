import {useNavigate, useParams, useSearch} from '@tanstack/react-router'
import {Suspense, useCallback, useEffect, useMemo, useState} from 'react'
import {Plus, ChevronDown, Columns3, Search, Users} from 'lucide-react'
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
import {useToast} from '../../../components/ui/toast'
import {useAssignablePersonasForProjectQuery, useUndoCancelAgentRunMutation} from '../../ai/ai.queries'
import {
  buildAssigneeBoardTasks,
  buildBoardTasks,
  formatCardStatusLabel,
} from '../../cards/card-view-mappers'
import {applyTableViewDraftToCards, sortCards} from '../../cards/card-sorting'
import {
  cardDetailQueryOptions,
  runMoveCardMutation,
  runSetCardAssigneeMutation,
} from '../../cards/card.queries'
import type {CardDetail} from '../../cards/card.types'
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
import {TaskScopeToolbarControl} from '../TaskScopeToolbarControl'
import type {CardRecord} from '../../cards/card.types'
import {listTableSortFieldOptions} from '../../projects/table-view-fields'
import {defaultOverviewDateRange} from '../OverviewDateRangePicker'
import {collectAssignedPersonFilterUserIds} from '../person-filter-options'
import {
  applyExplicitBoardSearchParams,
  parseBoardSearchParams,
  buildBoardSearchParams,
  type BoardGroupBy,
  type BoardSearchParams,
} from '../view-search-params'
import {ViewSkeleton} from '../views/ViewSkeletons'
import {useAutoSavePersonalConfig} from '../hooks/useAutoSavePersonalConfig'
import {useInitializeViewSearch} from '../hooks/useInitializeViewSearch'
import {useLocalStorageSync} from '../hooks/useLocalStorageSync'
import {
  filterCardsByTaskScope,
  resolveDefaultTaskScopeSprintIds,
} from '../task-scope'
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
    projectSprints,
    projectSprintsUnavailable,
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
  const sharedBaseline = useMemo((): ReturnType<typeof parseBoardSearchParams> => ({
    dateRange: defaultOverviewDateRange,
    filters: {priority: [], status: []},
    groupBy: 'status' as BoardGroupBy,
    personFilterUserId: null,
    sprintIds: [],
    sort: [],
  }), [])

  const mergePersonalWithShared = useCallback(
    (personal: Partial<typeof sharedBaseline>, shared: typeof sharedBaseline) =>
      applyExplicitBoardSearchParams({
        ...shared,
        ...personal,
      }, search),
    [search],
  )

  const getPersonalConfig = useCallback(
    () => getPersonalBoardViewConfigFromStorage(viewId),
    [viewId],
  )
  const [collapsedColumnIds, setCollapsedColumnIds] = useState<string[]>(() => getPersonalConfig()?.collapsedColumnIds ?? [])

  // Two-phase init: personal config from localStorage immediately, shared baseline as fallback
  const isViewSearchInitialized = useInitializeViewSearch({
    buildSearchParams: buildBoardSearchParams,
    getPersonalConfig,
    mergePersonalWithShared,
    navigate,
    routeKey: `${projectId}:${viewId}`,
    search,
    sharedBaseline,
  })

  // Auto-save personal config to localStorage on change
  const personalConfig = useMemo(() => ({
    collapsedColumnIds,
    dateRange: parsedSearch.dateRange,
    filters: parsedSearch.filters,
    groupBy: parsedSearch.groupBy,
    personFilterUserId: parsedSearch.personFilterUserId,
    sprintIds: parsedSearch.sprintIds,
    sort: parsedSearch.sort,
  }), [collapsedColumnIds, parsedSearch.dateRange, parsedSearch.filters, parsedSearch.groupBy, parsedSearch.personFilterUserId, parsedSearch.sort, parsedSearch.sprintIds])

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
  const effectiveSprintIds = useMemo(
    () => parsedSearch.sprintIds.length > 0
      ? parsedSearch.sprintIds
      : isViewSearchInitialized
        ? resolveDefaultTaskScopeSprintIds(projectSprints)
        : [],
    [isViewSearchInitialized, parsedSearch.sprintIds, projectSprints],
  )

  useEffect(() => {
    if (!isViewSearchInitialized || !projectTaskModeReady || !isSprintMode || parsedSearch.sprintIds.length > 0 || effectiveSprintIds.length === 0) {
      return
    }

    updateSearch({sprintIds: effectiveSprintIds})
  }, [effectiveSprintIds, isSprintMode, isViewSearchInitialized, parsedSearch.sprintIds.length, projectTaskModeReady, updateSearch])

  const {searchOpen, setSearchOpen, searchValue, setSearchValue, activeSearchValue, visibleCards, searchQuery} = useViewSearchPipeline(projectId, cards, parsedSearch.personFilterUserId)

  const boardInteractionDisabled = !canEditProject || isSurfaceMutationPending || isHistoryPending || Boolean(activeSearchValue)

  // Build a ProjectBoardViewDraft for downstream consumption
  const boardViewDraft = useMemo((): ProjectBoardViewDraft => ({
    filters: parsedSearch.filters,
    personFilterUserId: parsedSearch.personFilterUserId,
    sort: parsedSearch.sort,
  }), [parsedSearch])

  const scopeFilteredCards = useMemo(
    () => filterCardsByTaskScope(visibleCards, {
      dateRange: parsedSearch.dateRange,
      includeBacklogInSprintScope: true,
      sprintIds: effectiveSprintIds,
      taskMode: projectTaskMode,
    }),
    [effectiveSprintIds, parsedSearch.dateRange, projectTaskMode, visibleCards],
  )

  const personFilterCandidateCards = useMemo(
    () => applyTableViewDraftToCards(
      filterCardsByTaskScope(cards, {
        dateRange: parsedSearch.dateRange,
        includeBacklogInSprintScope: true,
        sprintIds: effectiveSprintIds,
        taskMode: projectTaskMode,
      }),
      boardViewDraft,
    ),
    [boardViewDraft, cards, effectiveSprintIds, parsedSearch.dateRange, projectTaskMode],
  )

  const eligiblePersonFilterUserIds = useMemo(
    () => collectAssignedPersonFilterUserIds(personFilterCandidateCards),
    [personFilterCandidateCards],
  )

  const filteredCards = useMemo(() => {
    const filtered = applyTableViewDraftToCards(scopeFilteredCards, boardViewDraft)
    return boardViewDraft.sort.length > 0
      ? sortCards(filtered, boardViewDraft.sort, customFields, {
        groupBy: 'status',
        priorityOptions: project.priorityOptions,
        projectGroups,
        statusOptions: project.statusOptions,
      })
      : filtered
  }, [scopeFilteredCards, boardViewDraft, customFields, project.priorityOptions, project.statusOptions, projectGroups])

  const visibleScopeSprints = useMemo(
    () => isSprintMode && effectiveSprintIds.length > 0
      ? displayProjectSprints.filter((sprint) => effectiveSprintIds.includes(sprint.id))
      : displayProjectSprints,
    [displayProjectSprints, effectiveSprintIds, isSprintMode],
  )

  // Phase 4 PR 4-B-2: assignee groupBy. We pull the per-project
  // persona list (server-side gated by `can_edit_project` per D11) so
  // agent columns only render when the project actually has agents
  // available. Empty list = humans + unassigned only, which is still
  // useful as an at-a-glance "who has what" view.
  const assignablePersonasQuery = useAssignablePersonasForProjectQuery(projectId)
  const assignablePersonas = useMemo(
    () => assignablePersonasQuery.data ?? [],
    [assignablePersonasQuery.data],
  )
  // Phase 4 polish: filter agents to project_members only — same rule as
  // humans (matches the picker shipped in PR #474). Org-level personas
  // that haven't been added to this project should not surface as
  // columns; they need to be dispatched to the project first (one-off
  // task in My AI Kanban auto-adds via clone_template_to_card, or via
  // the future Overview access UI).
  const projectMemberAssignablePersonas = useMemo(
    () => assignablePersonas.filter((persona) =>
      projectMembers.some((member) => member.id === persona.agentUserId),
    ),
    [assignablePersonas, projectMembers],
  )

  const groupBy: BoardGroupBy = parsedSearch.groupBy
  // Sprint lanes only make sense when grouping by status. groupBy
  // ='assignee' implicitly forces standard mode (single "All tasks"
  // lane) so cards render as one column-per-person.
  const effectiveGroupBy: BoardGroupBy = groupBy

  const statusBoardLayout = useMemo(
    () => buildBoardTasks(filteredCards, project.statusOptions, project.priorityOptions, projectTaskMode, visibleScopeSprints),
    [filteredCards, project.priorityOptions, project.statusOptions, projectTaskMode, visibleScopeSprints],
  )

  const assigneeBoardLayout = useMemo(
    () =>
      effectiveGroupBy === 'assignee'
        ? buildAssigneeBoardTasks(
            filteredCards,
            project.priorityOptions,
            projectMembers,
            projectMemberAssignablePersonas,
          )
        : null,
    [
      effectiveGroupBy,
      filteredCards,
      project.priorityOptions,
      projectMemberAssignablePersonas,
      projectMembers,
    ],
  )

  const boardLayout = effectiveGroupBy === 'assignee' && assigneeBoardLayout
    ? assigneeBoardLayout
    : statusBoardLayout

  const boardColumns = useMemo(() => {
    if (effectiveGroupBy === 'assignee' && assigneeBoardLayout) {
      return assigneeBoardLayout.columnMeta.map((meta) => ({
        accentColor: meta.accentColor,
        id: meta.id,
        kind: 'assignee' as const,
        title: meta.title,
      }))
    }
    return project.statusOptions.map((option) => ({
      id: option.id,
      kind: 'status' as const,
      title: option.label,
    }))
  }, [assigneeBoardLayout, effectiveGroupBy, project.statusOptions])
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

  const {toast} = useToast()
  const undoCancelMutation = useUndoCancelAgentRunMutation()

  const handleBoardAssigneeMove = useCallback(async (input: {
    cardId: string
    previousAssigneeUserId: string | null
    targetAssigneeUserId: string | null
  }) => {
    if (boardInteractionDisabled) return false
    setIsSurfaceMutationPending(true)
    setSurfaceActionError(null)
    // Drag-as-dispatch: the Phase 2a `cards_assignee_dispatch` trigger
    // handles agent-run insertion server-side. Drops onto a human
    // column are a no-op for the trigger (REG-2). Position bookkeeping
    // doesn't apply here.
    const targetPersona = input.targetAssigneeUserId
      ? assignablePersonas.find((p) => p.agentUserId === input.targetAssigneeUserId) ?? null
      : null
    try {
      await runSetCardAssigneeMutation(queryClient, {
        assigneeUserId: input.targetAssigneeUserId,
        cardId: input.cardId,
        projectId,
      })
      pushAction({
        description: targetPersona
          ? `Dispatched ${targetPersona.name}`
          : input.targetAssigneeUserId
            ? 'Reassigned task'
            : 'Cleared assignee',
        redo: async () => {
          return runSetCardAssigneeMutation(queryClient, {
            assigneeUserId: input.targetAssigneeUserId,
            cardId: input.cardId,
            projectId,
          })
        },
        undo: async () => {
          return runSetCardAssigneeMutation(queryClient, {
            assigneeUserId: input.previousAssigneeUserId,
            cardId: input.cardId,
            projectId,
          })
        },
      })

      if (targetPersona) {
        // 5s undo toast (D14): mirror CardSheet's flow so the rapid
        // drop-wrong-then-correct case has an explicit recovery path.
        toast({
          title: `Dispatched ${targetPersona.name}`,
          description: `${targetPersona.name} will pick up this card shortly.`,
          duration: 5000,
          action: {
            label: 'Undo',
            onClick: () => {
              const cached = queryClient.getQueryData<CardDetail | undefined>(
                cardDetailQueryOptions(input.cardId).queryKey,
              )
              const runId = cached?.agentRunSummary?.runId
              if (!runId) {
                toast({
                  title: 'Could not undo',
                  description: 'The agent run is no longer in the cache. Try refreshing.',
                  variant: 'error',
                })
                return
              }
              undoCancelMutation.mutate({cardId: input.cardId, runId})
            },
          },
        })
      }

      return true
    } catch (error) {
      setSurfaceActionError(error instanceof Error ? error.message : 'The card move could not be saved.')
      return false
    } finally {
      setIsSurfaceMutationPending(false)
    }
  }, [assignablePersonas, boardInteractionDisabled, projectId, pushAction, queryClient, setSurfaceActionError, toast, undoCancelMutation])

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
            <PersonFilter
              assignablePersonas={assignablePersonas}
              currentUserId={currentUser.id}
              eligibleUserIds={eligiblePersonFilterUserIds}
              onSelectPerson={(userId) => updateSearch({personFilterUserId: userId})}
              projectMembers={projectMembers}
              selectedUserId={parsedSearch.personFilterUserId}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='secondary'>
                  {groupBy === 'assignee' ? <Users className='h-4 w-4'/> : <Columns3 className='h-4 w-4'/>}
                  Group: {groupBy === 'assignee' ? 'Assignee' : 'Status'}
                  <ChevronDown className='h-3 w-3'/>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='start'>
                <DropdownMenuItem onClick={() => updateSearch({groupBy: 'status'})}>
                  <Columns3 className='h-4 w-4'/>
                  Status
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => updateSearch({groupBy: 'assignee'})}>
                  <Users className='h-4 w-4'/>
                  Assignee
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <QuickFilterMenu filters={parsedSearch.filters} onFiltersChange={(filters) => updateSearch({filters})} priorityOptions={project.priorityOptions} statusOptions={project.statusOptions}/>
            <SortMenu onSortChange={(sort) => updateSearch({sort})} sort={parsedSearch.sort} sortFieldOptions={sortFieldOptions}/>
          </ToolbarPortal>

          <ToolbarPortal slot="trailing">
            <div className='flex flex-wrap items-center justify-end gap-2'>
              <TaskScopeToolbarControl
                dateRange={parsedSearch.dateRange}
                isSprintHistoryUnavailable={projectSprintsUnavailable}
                onDateRangeChange={(dateRange) => updateSearch({dateRange})}
                onSprintIdsChange={(sprintIds) => updateSearch({sprintIds})}
                sprintIds={effectiveSprintIds}
                sprints={projectSprints}
                taskMode={projectTaskMode}
              />
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
          assignablePersonas={assignablePersonas}
          boardColumns={boardColumns}
          boardLanes={boardLayout.lanes}
          boardTasks={boardLayout.tasksByColumn}
          collapsedColumnIds={collapsedColumnIds}
          displayProjectSprintsInferred={displayProjectSprintsInferred}
          groupBy={effectiveGroupBy}
          isInteractionDisabled={boardInteractionDisabled}
          mode={mode}
          onCreateTask={openCardComposer}
          onCollapsedColumnIdsChange={setCollapsedColumnIds}
          onMoveAssignee={handleBoardAssigneeMove}
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
