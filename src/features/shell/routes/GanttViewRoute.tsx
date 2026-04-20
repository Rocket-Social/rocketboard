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
import {buildGanttTasks} from '../../cards/card-view-mappers'
import {applyTableViewDraftToCards, sortCards} from '../../cards/card-sorting'
import {runMoveCardMutation, runSetCardScheduleMutation} from '../../cards/card.queries'
import type {CardRecord, TableGroupBy} from '../../cards/card.types'
import {useActionHistory} from '../../cards/useActionHistory'
import {isEditableEventTarget} from '../../../lib/dom'
import {
  getPersonalGanttViewConfigFromStorage,
  setPersonalGanttViewConfigToStorage,
} from '../../projects/personal-view-storage'
import {type ProjectGanttViewDraft} from '../../projects/project-view.types'
import {ProjectSearchPanel} from '../../search/ProjectSearchPanel'
import {listTableSortFieldOptions} from '../../projects/table-view-fields'
import {useProjectChrome} from '../project/ProjectChromeContext'
import {useProjectData} from '../project/ProjectDataContext'
import {useProjectDialogs} from '../project/ProjectDialogContext'
import {ProjectTaskModeControl} from '../ProjectTaskModeControl'
import {ToolbarPortal} from '../ToolbarSlot'
import {GroupByMenu} from '../GroupByMenu'
import {defaultOverviewDateRange} from '../OverviewDateRangePicker'
import {PersonFilter} from '../PersonFilter'
import {QuickFilterMenu} from '../QuickFilterMenu'
import {SortMenu} from '../SortMenu'
import {OverviewDateRangePicker} from '../OverviewDateRangePicker'
import {parseGanttSearchParams, buildGanttSearchParams, type GanttSearchParams} from '../view-search-params'
import {ViewSkeleton} from '../views/ViewSkeletons'
import {useAutoSavePersonalConfig} from '../hooks/useAutoSavePersonalConfig'
import {useInitializeViewSearch} from '../hooks/useInitializeViewSearch'
import {useLocalStorageSync} from '../hooks/useLocalStorageSync'
import {useViewSearchPipeline} from '../hooks/useViewSearchPipeline'

const GanttView = lazyWithRetry(() => import('../views/GanttView').then((m) => ({default: m.GanttView})))

const ganttGroupByOptions: TableGroupBy[] = ['group', 'status', 'priority', 'assignee', 'due_date']

export function GanttViewRoute() {
  const params = useParams({strict: false}) as {viewId: string}
  const search = useSearch({strict: false})
  const rawNavigate = useNavigate()
  const navigate = useCallback((options: {replace: true; search: () => GanttSearchParams}) => {
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
    handleMoveCardToGroup,
    projectGroups,
    projectTaskMode,
    projectTaskModeReady,
  } = useProjectData()
  const {
    isCardSheetOpen,
    openCard,
    openCardComposer,
    openCreateSprintDialog,
    selectedCardId,
    setSurfaceActionError,
    surfaceActionError,
  } = useProjectDialogs()
  const viewId = params.viewId

  // URL search params are the current view config
  const parsedSearch = parseGanttSearchParams(search)

  const sharedBaseline = useMemo((): ProjectGanttViewDraft => ({
    dateRange: defaultOverviewDateRange,
    filters: {priority: [], status: []},
    groupBy: 'group',
    personFilterUserId: null,
    sort: [],
    timeScale: 'week',
  }), [])

  const getPersonalConfig = useCallback(
    () => getPersonalGanttViewConfigFromStorage(viewId),
    [viewId],
  )

  // Two-phase init: personal config from localStorage immediately, shared baseline as fallback.
  // Merge personal with URL so a date range picked last session survives when the user lands
  // here with only *some* URL params (e.g. `?groupBy=status` from a stale shared link) — without
  // the merge, hasExplicitSearchParams would short-circuit the localStorage restore and wipe
  // the persisted dateRange/timeScale on every navigation.
  const mergePersonalWithShared = useCallback(
    (personal: Partial<ProjectGanttViewDraft>, shared: ProjectGanttViewDraft): ProjectGanttViewDraft => ({
      ...shared,
      ...personal,
      ...parseGanttSearchParams(search),
    }),
    [search],
  )

  useInitializeViewSearch({
    buildSearchParams: buildGanttSearchParams,
    getPersonalConfig,
    mergePersonalWithShared,
    navigate,
    routeKey: `${projectId}:${viewId}`,
    search,
    sharedBaseline,
  })

  // Auto-save personal config to localStorage on change
  const personalConfig = useMemo(() => ({
    dateRange: parsedSearch.dateRange,
    filters: parsedSearch.filters,
    groupBy: parsedSearch.groupBy,
    personFilterUserId: parsedSearch.personFilterUserId,
    sort: parsedSearch.sort,
    timeScale: parsedSearch.timeScale,
  }), [parsedSearch.dateRange, parsedSearch.filters, parsedSearch.groupBy, parsedSearch.personFilterUserId, parsedSearch.sort, parsedSearch.timeScale])

  useAutoSavePersonalConfig(viewId, personalConfig, setPersonalGanttViewConfigToStorage)

  // Cross-tab sync for personal settings
  useLocalStorageSync(
    `rocketboard:personalGanttView:${viewId}`,
    useCallback((newValue) => {
      if (!newValue) return
      try {
        const config = JSON.parse(newValue)
        void navigate({
          search: () => buildGanttSearchParams({...parseGanttSearchParams(search), ...config}),
          replace: true,
        })
      } catch { /* ignore corrupt data */ }
    }, [navigate, search]),
  )

  const updateSearch = useCallback((patch: Partial<ReturnType<typeof parseGanttSearchParams>>) => {
    const current = parseGanttSearchParams(search)
    const merged = {...current, ...patch}
    void navigate({
      search: () => buildGanttSearchParams(merged),
      replace: true,
    })
  }, [navigate, search])

  const [isSurfaceMutationPending, setIsSurfaceMutationPending] = useState(false)

  const {
    canRedo, canUndo, clear: _clearHistory, errorMessage: historyErrorMessage,
    isPending: isHistoryPending, push: pushAction, redo, undo,
  } = useActionHistory<CardRecord>()

  const isSprintMode = projectTaskMode === 'sprint'

  const {searchOpen, setSearchOpen, searchValue, setSearchValue, activeSearchValue, visibleCards, searchQuery} = useViewSearchPipeline(projectId, cards, parsedSearch.personFilterUserId)

  const ganttInteractionDisabled = !canEditProject || isSurfaceMutationPending || isHistoryPending

  // Build a ProjectGanttViewDraft for downstream consumption
  const ganttViewDraft = useMemo((): ProjectGanttViewDraft => ({
    dateRange: parsedSearch.dateRange,
    filters: parsedSearch.filters,
    groupBy: parsedSearch.groupBy,
    personFilterUserId: parsedSearch.personFilterUserId,
    sort: parsedSearch.sort,
    timeScale: parsedSearch.timeScale,
  }), [parsedSearch])

  const filteredCards = useMemo(() => {
    const filtered = applyTableViewDraftToCards(visibleCards, ganttViewDraft)
    return ganttViewDraft.sort.length > 0
      ? sortCards(filtered, ganttViewDraft.sort, customFields, {
        groupBy: ganttViewDraft.groupBy,
        projectGroups,
      })
      : filtered
  }, [customFields, projectGroups, visibleCards, ganttViewDraft])

  const ganttTasks = useMemo(
    () => buildGanttTasks(filteredCards, project.statusOptions),
    [filteredCards, project.statusOptions],
  )

  const handleGanttMoveTask = useCallback(
    async (cardId: string, targetPosition: number, targetGroupId?: string | null) => {
      if (parsedSearch.groupBy === 'group') {
        await handleMoveCardToGroup(cardId, targetGroupId ?? null, targetPosition)
      } else {
        const card = cards.find((e) => e.id === cardId)
        if (!card) return
        await runMoveCardMutation(queryClient, {
          cardId,
          projectId,
          targetPosition,
          targetStatusOptionId: card.statusOptionId,
        })
      }
    },
    [cards, handleMoveCardToGroup, parsedSearch.groupBy, projectId, queryClient],
  )

  const ganttMoveTask = canEditProject && (parsedSearch.groupBy === 'group' || parsedSearch.groupBy === 'status')
    ? handleGanttMoveTask
    : undefined

  const sortFieldOptions = useMemo(
    () => listTableSortFieldOptions(customFields, project.builtinFieldLabels),
    [customFields, project.builtinFieldLabels],
  )

  // Keyboard: undo/redo
  useEffect(() => {
    if (isCardSheetOpen) return
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
  }, [canRedo, canUndo, isCardSheetOpen, isHistoryPending, redo, undo])

  const handleScheduleTask = useCallback(async (input: {
    cardId: string
    previousDueAt: string | null
    previousStartAt: string | null
    targetDueAt: string | null
    targetStartAt: string | null
  }) => {
    if (ganttInteractionDisabled) return false
    setIsSurfaceMutationPending(true)
    setSurfaceActionError(null)
    try {
      await runSetCardScheduleMutation(queryClient, {
        cardId: input.cardId,
        dueAt: input.targetDueAt,
        projectId,
        startAt: input.targetStartAt,
      })
      pushAction({
        description: 'Rescheduled task',
        redo: () => runSetCardScheduleMutation(queryClient, {
          cardId: input.cardId, dueAt: input.targetDueAt, projectId, startAt: input.targetStartAt,
        }),
        undo: () => runSetCardScheduleMutation(queryClient, {
          cardId: input.cardId, dueAt: input.previousDueAt, projectId, startAt: input.previousStartAt,
        }),
      })
      return true
    } catch (error) {
      setSurfaceActionError(error instanceof Error ? error.message : 'The schedule change could not be saved.')
      return false
    } finally {
      setIsSurfaceMutationPending(false)
    }
  }, [ganttInteractionDisabled, projectId, pushAction, queryClient, setSurfaceActionError])

  return (
    <>
      <ToolbarPortal slot="leading">
        {projectTaskModeReady ? (
          <>
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
                {isSprintMode ? (
                  <DropdownMenuItem disabled={!canEditProject} onClick={openCreateSprintDialog}>
                    <Plus className='h-4 w-4'/>
                    Add Sprint
                  </DropdownMenuItem>
                ) : null}
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
          </>
        ) : null}
      </ToolbarPortal>

      <ToolbarPortal slot="view-tabs-trailing">
        <ProjectTaskModeControl/>
      </ToolbarPortal>

      {projectTaskModeReady ? (
        <ToolbarPortal slot="trailing">
          <div className='flex items-center gap-2'>
            <OverviewDateRangePicker
              onChange={(dateRange) => updateSearch({dateRange})}
              value={parsedSearch.dateRange}
            />
            <div className='flex items-center rounded-lg border border-border-subtle'>
              {(['day', 'week', 'month'] as const).map((scale) => (
                <button
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    parsedSearch.timeScale === scale
                      ? 'bg-primary text-white'
                      : 'text-text-medium hover:bg-canvas-accent'
                  } ${scale === 'day' ? 'rounded-l-lg' : scale === 'month' ? 'rounded-r-lg' : ''}`}
                  key={scale}
                  onClick={() => updateSearch({timeScale: scale})}
                  type='button'
                >
                  {scale.charAt(0).toUpperCase() + scale.slice(1)}
                </button>
              ))}
            </div>
            <GroupByMenu
              dateLabel='Time'
              groupBy={parsedSearch.groupBy}
              options={ganttGroupByOptions}
              onGroupByChange={(groupBy) => updateSearch({groupBy})}
            />
          </div>
        </ToolbarPortal>
      ) : null}

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
        <GanttView
          activeTaskId={isCardSheetOpen ? selectedCardId : null}
          priorityOptions={project.priorityOptions}
          dateRange={parsedSearch.dateRange.startDate && parsedSearch.dateRange.endDate ? {endDate: parsedSearch.dateRange.endDate, startDate: parsedSearch.dateRange.startDate} : null}
          groupBy={parsedSearch.groupBy}
          isInteractionDisabled={ganttInteractionDisabled}
          isTaskDetailOpen={isCardSheetOpen}
          mode={mode}
          onMoveTask={ganttMoveTask}
          onOpenTask={openCard}
          onScheduleTask={handleScheduleTask}
          projectGroups={projectGroups}
          projectMembers={projectMembers}
          projectSprints={displayProjectSprints}
          statusOptions={project.statusOptions}
          taskMode={projectTaskMode}
          tasks={ganttTasks}
          timeScale={parsedSearch.timeScale}
        />
      </Suspense>
    </div>
      ) : (
        <div className='flex-1 bg-canvas'>
          <ViewSkeleton viewType='gantt'/>
        </div>
      )}
    </>
  )
}
