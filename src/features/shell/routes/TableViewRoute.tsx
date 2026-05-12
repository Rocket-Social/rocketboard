import {useNavigate, useParams, useSearch} from '@tanstack/react-router'
import {Suspense, useCallback, useEffect, useMemo, useRef, useState, type RefObject} from 'react'
import {ArrowDown, Plus, ChevronDown, Search} from 'lucide-react'
import {useQueryClient} from '@tanstack/react-query'

import {lazyWithRetry} from '../../../app/lazyWithRetry'
import {Button} from '../../../components/ui/button'
import {ConfirmDialog} from '../../../components/ui/confirm-dialog'
import {useConfirmDialog} from '../../../hooks/useConfirmDialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu'
import {Input} from '../../../components/ui/input'
import {
  buildTableGroups,
  getDefaultStatusOption,
} from '../../cards/card-view-mappers'
import {
  canMoveTasksWithinGroupView,
  getGroupByMenuLabel,
  getProjectGroupsForTaskMode,
  usesFlatSprintGrouping,
  usesProjectGroupBuckets,
} from '../../cards/card-grouping'
import {applyTableViewDraftToCards, sortCards} from '../../cards/card-sorting'
import {
  runArchiveCardsMutation,
  runCreateCardMutation,
  runDuplicateCardsMutation,
  runMoveCardMutation,
  runRestoreCardsMutation,
  runTrashCardsMutation,
  runUnarchiveCardsMutation,
} from '../../cards/card.queries'
import type {CardRecord, TableGroupBy} from '../../cards/card.types'
import {isEditableEventTarget} from '../../../lib/dom'
import {
  getPersonalTableViewConfigFromStorage,
  setPersonalTableViewConfigToStorage,
} from '../../projects/personal-view-storage'
import {
  useSetTablePersonalLayoutMutation,
  useSetTableSharedConfigMutation,
} from '../../projects/project-view.queries'
import {
  normalizeProjectTableCollapsedGroups,
  normalizeProjectTableColumnWidths,
  normalizeProjectTableFilters,
  normalizeProjectTableSort,
  normalizeProjectViewGroupBy,
  normalizeProjectTableVisibleFieldKeys,
  type ProjectTableViewDraft,
} from '../../projects/project-view.types'
import {patchProjectCards, patchProjectGroups} from '../../projects/project-data.cache'
import {projectGroupRepository} from '../../projects/project-group.repository'
import {listTableSortFieldOptions} from '../../projects/table-view-fields'
import {
  useCreateCustomFieldMutation,
  useSetCardCustomFieldValueMutation,
} from '../../fields/field.queries'
import {ProjectSearchPanel} from '../../search/ProjectSearchPanel'
import {useToast} from '../../../components/ui/toast'
import {useProjectChrome} from '../project/ProjectChromeContext'
import {useProjectData} from '../project/ProjectDataContext'
import {useProjectDialogs} from '../project/ProjectDialogContext'
import {GroupByMenu} from '../GroupByMenu'
import {LazySurfaceBoundary} from '../LazySurfaceBoundary'
import {PersonFilter} from '../PersonFilter'
import {ProjectTaskModeControl} from '../ProjectTaskModeControl'
import {QuickFilterMenu} from '../QuickFilterMenu'
import {SortMenu} from '../SortMenu'
import {TaskScopeToolbarControl} from '../TaskScopeToolbarControl'
import {ToolbarPortal} from '../ToolbarSlot'
import {defaultOverviewDateRange} from '../OverviewDateRangePicker'
import {collectAssignedPersonFilterUserIds} from '../person-filter-options'
import {
  applyExplicitTableSearchParams,
  parseTableSearchParams,
  buildTableSearchParams,
  type TableSearchParams,
} from '../view-search-params'
import {ViewSkeleton} from '../views/ViewSkeletons'
import {useAutoSavePersonalConfig} from '../hooks/useAutoSavePersonalConfig'
import {useInitializeViewSearch} from '../hooks/useInitializeViewSearch'
import {useLocalStorageSync} from '../hooks/useLocalStorageSync'
import {
  filterCardsByTaskScope,
  resolveDefaultTaskScopeSprintIds,
  resolveTaskScopeQuickSprints,
  sortTaskScopeSprintsByRecency,
} from '../task-scope'
import {
  addSprintCompletedEventListener,
  formatSprintStartedToastTitle,
  sprintStartedToastDescription,
  sprintStartedToastDuration,
} from '../sprint-completion-events'
import {useViewSearchPipeline} from '../hooks/useViewSearchPipeline'
import {moveCardsToGroupSequentially} from './table-bulk-actions'
import {getVisibleTableTaskIds, toggleTableTaskSelection} from './table-selection'

const TableView = lazyWithRetry(() => import('../views/TableView').then((m) => ({default: m.TableView})))
const BulkActionsBar = lazyWithRetry(() => import('../views/BulkActionsBar').then((m) => ({default: m.BulkActionsBar})), {recovery: 'error-boundary'})

const tableGroupByOptions: TableGroupBy[] = ['group', 'status', 'priority', 'assignee', 'due_date']
const sprintPickerNudgeDuration = sprintStartedToastDuration

type SprintPickerNudgeState = {
  description: string
  id: number
  title: string
}

type SprintPickerNudgeGeometry = {
  arrowLeft: number
  arrowTop: number
}

function SprintPickerNudge({
  anchorRef,
  description,
  title,
}: {
  anchorRef: RefObject<HTMLDivElement | null>
  description: string
  title: string
}) {
  const [geometry, setGeometry] = useState<SprintPickerNudgeGeometry | null>(null)

  useEffect(() => {
    const updateGeometry = () => {
      const anchorRect = anchorRef.current?.getBoundingClientRect()

      if (!anchorRect) {
        return
      }

      setGeometry({
        arrowLeft: anchorRect.left + anchorRect.width / 2,
        arrowTop: Math.max(4, anchorRect.top - 66),
      })
    }

    const frame = window.requestAnimationFrame(updateGeometry)
    window.addEventListener('resize', updateGeometry)
    window.addEventListener('scroll', updateGeometry, true)
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateGeometry)
    const anchor = anchorRef.current
    if (anchor) resizeObserver?.observe(anchor)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', updateGeometry)
      window.removeEventListener('scroll', updateGeometry, true)
      resizeObserver?.disconnect()
    }
  }, [anchorRef, description, title])

  return (
    <div
      className='pointer-events-none fixed inset-0 z-40'
      data-testid='sprint-picker-nudge'
    >
      <style>
        {'@keyframes sprint-picker-nudge-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}'}
      </style>
      {geometry ? (
        <div
          aria-hidden='true'
          className='absolute -translate-x-1/2'
          data-testid='sprint-picker-nudge-arrow'
          style={{
            left: geometry.arrowLeft,
            top: geometry.arrowTop,
          }}
        >
          <ArrowDown
            className='h-16 w-16 animate-[sprint-picker-nudge-bob_1.1s_ease-in-out_infinite] overflow-visible text-primary drop-shadow-lg motion-reduce:animate-none'
            data-testid='sprint-picker-nudge-arrow-icon'
            strokeWidth={5}
          />
        </div>
      ) : null}
      <div
        aria-live='polite'
        className='absolute left-1/2 top-4 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl bg-slate-950 px-4 py-3 text-white shadow-panel ring-1 ring-white/10'
        data-testid='sprint-picker-nudge-toast'
        role='status'
      >
        <p className='text-sm font-medium'>{title}</p>
        <p className='mt-0.5 text-xs text-slate-300'>{description}</p>
      </div>
    </div>
  )
}

export function TableViewRoute() {
  const params = useParams({strict: false}) as {viewId: string}
  const search = useSearch({strict: false})
  const rawNavigate = useNavigate()
  const navigate = useCallback((options: {replace: true; search: () => TableSearchParams}) => {
    void rawNavigate({
      replace: options.replace,
      search: options.search as never,
    } as never)
  }, [rawNavigate])
  const queryClient = useQueryClient()
  const {toast} = useToast()
  const {
    canEditProject,
    currentUser,
    invalidateProjectData,
    mode,
    project,
    projectId,
    projectMembers,
  } = useProjectChrome()
  const {
    cards,
    customFields,
    displayProjectSprints,
    handleMoveCardToGroup,
    handleMoveCardToSprint,
    projectGroups,
    projectSprints,
    projectSprintsUnavailable,
    projectTaskMode,
    projectTaskModeReady,
    projectViewBackendUnavailable,
    tableViewStates,
    tableViewStatesReady,
  } = useProjectData()
  const {
    isCardSheetOpen,
    openCard,
    openCardComposer,
    openCompleteSprintDialog,
    openCreateSprintDialog,
    openEditSprintDialog,
    renameSprint,
    selectedCardId,
    startSprint,
    surfaceActionError,
  } = useProjectDialogs()
  // Toolbar content rendered via <ToolbarPortal> below (no effects, no state setters)

  const viewId = params.viewId
  const {confirm, confirmDialogProps: bulkDeleteConfirmDialogProps} = useConfirmDialog()
  const setTableSharedConfigMutation = useSetTableSharedConfigMutation(projectId, viewId)
  const setTablePersonalLayoutMutation = useSetTablePersonalLayoutMutation(projectId, viewId)
  const createCustomFieldMutation = useCreateCustomFieldMutation(projectId)
  const setCardCustomFieldValueMutation = useSetCardCustomFieldValueMutation()

  // URL search params are the current view config
  const parsedSearch = parseTableSearchParams(search)

  // Shared baseline from DB
  const sharedBaseline = useMemo((): ReturnType<typeof parseTableSearchParams> => {
    const state = tableViewStates[viewId] ?? null
    return {
      dateRange: defaultOverviewDateRange,
      filters: normalizeProjectTableFilters(state?.sharedConfig.filters),
      groupBy: normalizeProjectViewGroupBy(state?.sharedConfig.groupBy),
      personFilterUserId: state?.sharedConfig.personFilterUserId ?? null,
      sprintIds: [],
      sort: normalizeProjectTableSort(state?.sharedConfig.sort),
      visibleFieldKeys: normalizeProjectTableVisibleFieldKeys(state?.sharedConfig.visibleFieldKeys ?? []),
    }
  }, [viewId, tableViewStates])

  // Layout prefs from backend (not URL config)
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>(() => {
    const state = tableViewStates[viewId] ?? null
    return normalizeProjectTableCollapsedGroups(state?.personalConfig?.collapsedGroups ?? [])
  })
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const state = tableViewStates[viewId] ?? null
    return normalizeProjectTableColumnWidths(state?.personalConfig?.columnWidths ?? {})
  })

  const getPersonalConfig = useCallback(
    () => getPersonalTableViewConfigFromStorage(viewId),
    [viewId],
  )

  const mergePersonalWithShared = useCallback(
    (personal: Partial<typeof sharedBaseline>, shared: typeof sharedBaseline) =>
      applyExplicitTableSearchParams({
        ...shared,
        ...personal,
        // Shared fields always come from the shared baseline.
        visibleFieldKeys: shared.visibleFieldKeys,
      }, search),
    [search],
  )

  // Two-phase init: personal config from localStorage immediately, shared fields patched when ready
  const isViewSearchInitialized = useInitializeViewSearch({
    buildSearchParams: buildTableSearchParams,
    getPersonalConfig,
    isBaselineReady: tableViewStatesReady,
    mergePersonalWithShared,
    navigate,
    routeKey: `${projectId}:${viewId}`,
    search,
    sharedBaseline,
  })

  // Reset layout prefs when viewId changes (useState initializers only run on mount)
  const prevViewIdRef = useRef(viewId)
  useEffect(() => {
    if (prevViewIdRef.current !== viewId) {
      prevViewIdRef.current = viewId
      const state = tableViewStates[viewId] ?? null
      setCollapsedGroups(normalizeProjectTableCollapsedGroups(state?.personalConfig?.collapsedGroups ?? []))
      setColumnWidths(normalizeProjectTableColumnWidths(state?.personalConfig?.columnWidths ?? {}))
    }
  }, [viewId, tableViewStates])

  // Auto-save personal config to localStorage on change
  const personalConfig = useMemo(() => ({
    columnWidths,
    dateRange: parsedSearch.dateRange,
    filters: parsedSearch.filters,
    groupBy: parsedSearch.groupBy,
    personFilterUserId: parsedSearch.personFilterUserId,
    sprintIds: parsedSearch.sprintIds,
    sort: parsedSearch.sort,
    visibleFieldKeys: parsedSearch.visibleFieldKeys,
  }), [columnWidths, parsedSearch.dateRange, parsedSearch.filters, parsedSearch.groupBy, parsedSearch.personFilterUserId, parsedSearch.sort, parsedSearch.sprintIds, parsedSearch.visibleFieldKeys])

  useAutoSavePersonalConfig(viewId, personalConfig, setPersonalTableViewConfigToStorage)

  // Cross-tab sync for personal settings
  useLocalStorageSync(
    `rocketboard:personalTableView:${viewId}`,
    useCallback((newValue) => {
      if (!newValue) return
      try {
        const config = JSON.parse(newValue)
        if (config.columnWidths) setColumnWidths(normalizeProjectTableColumnWidths(config.columnWidths))
        void navigate({
          search: () => buildTableSearchParams({...parseTableSearchParams(search), ...config}),
          replace: true,
        })
      } catch { /* ignore corrupt data */ }
    }, [navigate, search]),
  )

  // Auto-save shared visibleFieldKeys to Supabase when they change
  const lastSavedSharedRef = useMemo(() => ({
    current: {visibleFieldKeys: parsedSearch.visibleFieldKeys},
  }), []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const changed =
      JSON.stringify(parsedSearch.visibleFieldKeys) !== JSON.stringify(lastSavedSharedRef.current.visibleFieldKeys)
    if (!changed) return
    lastSavedSharedRef.current = {visibleFieldKeys: parsedSearch.visibleFieldKeys}
    if (projectViewBackendUnavailable) return
    setTableSharedConfigMutation.mutate({
      filters: parsedSearch.filters,
      groupBy: parsedSearch.groupBy,
      personFilterUserId: parsedSearch.personFilterUserId,
      sort: parsedSearch.sort,
      visibleFieldKeys: parsedSearch.visibleFieldKeys,
    }, {
      onError: () => toast({title: "Couldn't save visible columns for the team", variant: 'error'}),
    })
  }, [parsedSearch.visibleFieldKeys]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save personal layout (collapsedGroups + columnWidths) to Supabase backend
  const layoutTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const layoutInitializedRef = useRef(false)
  useEffect(() => {
    if (!layoutInitializedRef.current) {
      layoutInitializedRef.current = true
      return
    }
    if (projectViewBackendUnavailable) return
    clearTimeout(layoutTimerRef.current)
    layoutTimerRef.current = setTimeout(() => {
      setTablePersonalLayoutMutation.mutate({collapsedGroups, columnWidths})
    }, 500)
    return () => clearTimeout(layoutTimerRef.current)
  }, [collapsedGroups, columnWidths]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateSearch = useCallback((patch: Partial<ReturnType<typeof parseTableSearchParams>>) => {
    const current = parseTableSearchParams(search)
    const merged = {...current, ...patch}
    void navigate({
      search: () => buildTableSearchParams(merged),
      replace: true,
    })
  }, [navigate, search])

  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
  const [pendingInlineCreateIds, setPendingInlineCreateIds] = useState<string[]>([])
  const [sprintPickerNudge, setSprintPickerNudge] = useState<SprintPickerNudgeState | null>(null)
  const sprintPickerNudgeAnchorRef = useRef<HTMLDivElement | null>(null)
  const sprintPickerNudgeIdRef = useRef(0)
  const staleSprintArrivalCheckKeyRef = useRef<string | null>(null)

  const {searchOpen, setSearchOpen, searchValue, setSearchValue, activeSearchValue, visibleCards, searchQuery} = useViewSearchPipeline(projectId, cards, parsedSearch.personFilterUserId)

  // Build a full ProjectTableViewDraft for downstream consumption
  const tableViewDraft = useMemo((): ProjectTableViewDraft => ({
    collapsedGroups,
    columnWidths,
    filters: parsedSearch.filters,
    groupBy: parsedSearch.groupBy,
    personFilterUserId: parsedSearch.personFilterUserId,
    sort: parsedSearch.sort,
    visibleFieldKeys: parsedSearch.visibleFieldKeys,
  }), [collapsedGroups, columnWidths, parsedSearch])
  const projectGroupsInCurrentMode = useMemo(
    () => getProjectGroupsForTaskMode(projectGroups, projectTaskMode),
    [projectGroups, projectTaskMode],
  )
  const hasFlatSprintGrouping = usesFlatSprintGrouping(parsedSearch.groupBy, projectTaskMode)

  const showSprintPickerNudge = useCallback((sprintName: string) => {
    sprintPickerNudgeIdRef.current += 1
    setSprintPickerNudge({
      description: sprintStartedToastDescription,
      id: sprintPickerNudgeIdRef.current,
      title: formatSprintStartedToastTitle(sprintName),
    })
  }, [])

  const setTableViewDraft = useCallback((updater: ProjectTableViewDraft | ((current: ProjectTableViewDraft) => ProjectTableViewDraft)) => {
    const current: ProjectTableViewDraft = {
      collapsedGroups,
      columnWidths,
      filters: parsedSearch.filters,
      groupBy: parsedSearch.groupBy,
      personFilterUserId: parsedSearch.personFilterUserId,
      sort: parsedSearch.sort,
      visibleFieldKeys: parsedSearch.visibleFieldKeys,
    }
    const next = typeof updater === 'function' ? updater(current) : updater
    // Update layout prefs in local state
    if (next.collapsedGroups !== current.collapsedGroups) {
      setCollapsedGroups(next.collapsedGroups)
    }
    if (next.columnWidths !== current.columnWidths) {
      setColumnWidths(next.columnWidths)
    }
    // Update URL search params for view config
    const hasUrlChange =
      next.groupBy !== current.groupBy
      || next.personFilterUserId !== current.personFilterUserId
      || JSON.stringify(next.filters) !== JSON.stringify(current.filters)
      || JSON.stringify(next.sort) !== JSON.stringify(current.sort)
      || JSON.stringify(next.visibleFieldKeys) !== JSON.stringify(current.visibleFieldKeys)
    if (hasUrlChange) {
      void navigate({
        search: () => buildTableSearchParams({
          dateRange: parsedSearch.dateRange,
          filters: next.filters,
          groupBy: next.groupBy,
          personFilterUserId: next.personFilterUserId,
          sprintIds: parsedSearch.sprintIds,
          sort: next.sort,
          visibleFieldKeys: next.visibleFieldKeys,
        }),
        replace: true,
      })
    }
  }, [collapsedGroups, columnWidths, navigate, parsedSearch])

  const isSprintMode = projectTaskMode === 'sprint'
  const effectiveSprintIds = useMemo(
    () => parsedSearch.sprintIds.length > 0
      ? parsedSearch.sprintIds
      : isViewSearchInitialized
        ? resolveDefaultTaskScopeSprintIds(projectSprints)
        : [],
    [isViewSearchInitialized, parsedSearch.sprintIds, projectSprints],
  )
  const sprintArrivalCurrentTarget = useMemo(() => {
    if (!isSprintMode || parsedSearch.sprintIds.length > 1) {
      return null
    }

    const quickSprints = resolveTaskScopeQuickSprints(projectSprints)
    const currentSprint = quickSprints[0]?.sprint ?? null
    const previousSprint = quickSprints[1]?.sprint ?? null

    if (!currentSprint || !previousSprint || previousSprint.status !== 'completed') {
      return null
    }

    const isFreshSprintSelection = parsedSearch.sprintIds.length === 0
    const isStalePreviousSprintSelection = parsedSearch.sprintIds[0] === previousSprint.id

    if (!isFreshSprintSelection && !isStalePreviousSprintSelection) {
      return null
    }

    const hasRelevantAssignment = cards.some((card) =>
      card.assigneeUserId === currentUser.id
      && (card.sprintId === previousSprint.id || card.sprintId === currentSprint.id),
    )

    return hasRelevantAssignment ? currentSprint : null
  }, [cards, currentUser.id, isSprintMode, parsedSearch.sprintIds, projectSprints])

  useEffect(() => {
    if (!isViewSearchInitialized || !projectTaskModeReady || !isSprintMode || parsedSearch.sprintIds.length > 0 || effectiveSprintIds.length === 0 || sprintArrivalCurrentTarget) {
      return
    }

    updateSearch({sprintIds: effectiveSprintIds})
  }, [effectiveSprintIds, isSprintMode, isViewSearchInitialized, parsedSearch.sprintIds.length, projectTaskModeReady, sprintArrivalCurrentTarget, updateSearch])

  useEffect(() => {
    if (!isViewSearchInitialized || !projectTaskModeReady || !isSprintMode) {
      return
    }

    if (!sprintArrivalCurrentTarget) {
      return
    }

    const quickSprints = resolveTaskScopeQuickSprints(projectSprints)
    const previousSprint = quickSprints[1]?.sprint ?? null
    const checkKey = `${projectId}:${viewId}:${currentUser.id}:${previousSprint?.id ?? 'none'}:${sprintArrivalCurrentTarget.id}`
    if (staleSprintArrivalCheckKeyRef.current === checkKey) {
      return
    }
    staleSprintArrivalCheckKeyRef.current = checkKey

    updateSearch({sprintIds: [sprintArrivalCurrentTarget.id]})
    showSprintPickerNudge(sprintArrivalCurrentTarget.name)
  }, [
    isSprintMode,
    isViewSearchInitialized,
    currentUser.id,
    projectId,
    projectSprints,
    projectTaskModeReady,
    showSprintPickerNudge,
    sprintArrivalCurrentTarget,
    updateSearch,
    viewId,
  ])

  useEffect(() => addSprintCompletedEventListener((detail) => {
    if (!isSprintMode || !projectTaskModeReady || detail.projectId !== projectId || !detail.currentSprintId) {
      return
    }

    const selectedSprintIds = effectiveSprintIds.length > 0 ? effectiveSprintIds : parsedSearch.sprintIds
    const isCompletingSelectedSprint = selectedSprintIds.includes(detail.completedSprintId)
    const isCompletingFromThisView = detail.sourceViewId === viewId
    if (!isCompletingSelectedSprint && !isCompletingFromThisView) {
      return
    }

    const currentSprint = projectSprints.find((sprint) => sprint.id === detail.currentSprintId)
    if (!currentSprint && !detail.currentSprintName) {
      return
    }

    const nudgeSprintName = currentSprint?.name ?? detail.currentSprintName
    if (!nudgeSprintName) {
      return
    }

    updateSearch({sprintIds: [currentSprint?.id ?? detail.currentSprintId]})
    showSprintPickerNudge(nudgeSprintName)
  }), [effectiveSprintIds, isSprintMode, parsedSearch.sprintIds, projectId, projectSprints, projectTaskModeReady, showSprintPickerNudge, updateSearch, viewId])

  useEffect(() => {
    if (!sprintPickerNudge) return

    const nudgeId = sprintPickerNudge.id
    const timeout = window.setTimeout(() => {
      setSprintPickerNudge((current) => (current?.id === nudgeId ? null : current))
    }, sprintPickerNudgeDuration)

    return () => window.clearTimeout(timeout)
  }, [sprintPickerNudge])

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
      tableViewDraft,
    ),
    [cards, effectiveSprintIds, parsedSearch.dateRange, projectTaskMode, tableViewDraft],
  )

  const eligiblePersonFilterUserIds = useMemo(
    () => collectAssignedPersonFilterUserIds(personFilterCandidateCards),
    [personFilterCandidateCards],
  )

  const tableCards = useMemo(
    () => applyTableViewDraftToCards(scopeFilteredCards, tableViewDraft),
    [scopeFilteredCards, tableViewDraft],
  )

  const visibleScopeSprints = useMemo(
    () => {
      if (!isSprintMode || effectiveSprintIds.length === 0) {
        return displayProjectSprints
      }

      return sortTaskScopeSprintsByRecency(
        displayProjectSprints.filter((sprint) => effectiveSprintIds.includes(sprint.id)),
      )
    },
    [displayProjectSprints, effectiveSprintIds, isSprintMode],
  )
  const shouldPreserveVisibleSprintOrder = isSprintMode && effectiveSprintIds.length > 0

  const unsortedTableGroups = useMemo(
    () => buildTableGroups(
      tableCards,
      parsedSearch.groupBy,
      collapsedGroups,
      projectGroupsInCurrentMode,
      project.statusOptions,
      project.priorityOptions,
      visibleScopeSprints,
      projectTaskMode,
      shouldPreserveVisibleSprintOrder ? {sprintOrder: 'input'} : undefined,
    ),
    [tableCards, parsedSearch.groupBy, collapsedGroups, projectGroupsInCurrentMode,
     project.statusOptions, project.priorityOptions, visibleScopeSprints, projectTaskMode, shouldPreserveVisibleSprintOrder],
  )

  const tableGroups = useMemo(() => {
    if (parsedSearch.sort.length === 0) return unsortedTableGroups
    return unsortedTableGroups.map((group) => {
      const sortedCards = sortCards(
        group.tasks.map((t) => t.card),
        parsedSearch.sort,
        customFields,
        {
          fallbackOrder: hasFlatSprintGrouping ? 'createdAt' : undefined,
          groupBy: parsedSearch.groupBy,
          priorityOptions: project.priorityOptions,
          projectGroups: projectGroupsInCurrentMode,
          statusOptions: project.statusOptions,
        },
      )
      const taskByCardId = new Map(group.tasks.map((t) => [t.card.id, t]))
      return {...group, tasks: sortedCards.map((card) => taskByCardId.get(card.id)!)}
    })
  }, [unsortedTableGroups, parsedSearch.groupBy, parsedSearch.sort, customFields, project.priorityOptions, project.statusOptions, projectGroupsInCurrentMode, hasFlatSprintGrouping])

  const expandedGroupIds = useMemo(
    () => tableGroups.filter((group) => group.expanded).map((group) => group.id),
    [tableGroups],
  )

  const visibleTableTaskIds = useMemo(
    () => getVisibleTableTaskIds(tableGroups, expandedGroupIds, projectTaskMode),
    [expandedGroupIds, projectTaskMode, tableGroups],
  )

  const sortFieldOptions = useMemo(
    () => listTableSortFieldOptions(customFields, project.builtinFieldLabels),
    [customFields, project.builtinFieldLabels],
  )

  // Clear selection on groupBy/search/project change
  useEffect(() => {
    setSelectedTaskIds([])
  }, [parsedSearch.groupBy, activeSearchValue, projectTaskMode])

  // Arrow key card navigation when card sheet is open
  useEffect(() => {
    if (!isCardSheetOpen || !selectedCardId || visibleTableTaskIds.length === 0) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isEditableEventTarget(event.target)) return
      const offset = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
      if (offset === 0) return
      const currentIndex = visibleTableTaskIds.indexOf(selectedCardId)
      if (currentIndex === -1) return
      const nextTaskId = visibleTableTaskIds[currentIndex + offset]
      if (!nextTaskId) return
      event.preventDefault()
      void openCard(nextTaskId)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isCardSheetOpen, openCard, selectedCardId, visibleTableTaskIds])

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((current) =>
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId],
    )
  }

  const toggleTaskSelection = (taskId: string, shiftKey?: boolean) => {
    setSelectedTaskIds((current) => toggleTableTaskSelection(current, taskId, visibleTableTaskIds, shiftKey))
  }

  const handleAddGroup = async (label: string): Promise<string | undefined> => {
    const trimmedLabel = label.trim()
    if (!trimmedLabel) {
      return undefined
    }

    const tempId = crypto.randomUUID()
    const now = new Date().toISOString()
    patchProjectGroups(queryClient, projectId, (groups) => [
      ...groups,
      {createdAt: now, id: tempId, label: trimmedLabel, position: groups.length, projectId, updatedAt: now},
    ])

    try {
      await projectGroupRepository.createGroup({label: trimmedLabel, projectId})
    } finally {
      await invalidateProjectData()
    }

    return tempId
  }

  const handleTableMoveTask = useCallback(
    async (cardId: string, targetPosition: number, targetGroupId?: string | null) => {
      if (usesProjectGroupBuckets(parsedSearch.groupBy, projectTaskMode)) {
        await handleMoveCardToGroup(cardId, targetGroupId ?? null, targetPosition)
      } else if (parsedSearch.groupBy === 'status') {
        const card = cards.find((e) => e.id === cardId)
        if (!card) return
        await runMoveCardMutation(queryClient, {cardId, projectId, targetPosition, targetStatusOptionId: card.statusOptionId})
      }
    },
    [cards, handleMoveCardToGroup, parsedSearch.groupBy, projectId, projectTaskMode, queryClient],
  )

  const handleMoveSelectedTasksToGroup = useCallback(async (cardIds: string[], targetGroupId: string | null) => {
    await moveCardsToGroupSequentially({
      cardIds,
      moveCardToGroup: handleMoveCardToGroup,
      targetGroupId,
    })
  }, [handleMoveCardToGroup])

  const tableMoveTask = canEditProject && canMoveTasksWithinGroupView(parsedSearch.groupBy, projectTaskMode)
    ? handleTableMoveTask
    : undefined

  const handleSprintIdsChange = useCallback((sprintIds: string[]) => {
    setSprintPickerNudge(null)
    updateSearch({sprintIds})
  }, [updateSearch])

  return (
    <>
    {projectTaskModeReady ? (
      <>
        {/* ── Toolbar content (rendered via portal into ToolbarArea) ── */}
        <ToolbarPortal slot='leading'>
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
              ) : (
                <DropdownMenuItem disabled={!canEditProject} onClick={() => void openCardComposer()}>
                  <Plus className='h-4 w-4'/>
                  Add group
                </DropdownMenuItem>
              )}
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
            currentUserId={currentUser.id}
            eligibleUserIds={eligiblePersonFilterUserIds}
            onSelectPerson={(userId) => updateSearch({personFilterUserId: userId})}
            projectMembers={projectMembers}
            selectedUserId={parsedSearch.personFilterUserId}
          />
          <QuickFilterMenu filters={parsedSearch.filters} onFiltersChange={(filters) => updateSearch({filters})} priorityOptions={project.priorityOptions} statusOptions={project.statusOptions}/>
          <SortMenu onSortChange={(sort) => updateSearch({sort})} sort={parsedSearch.sort} sortFieldOptions={sortFieldOptions}/>
        </ToolbarPortal>

        <ToolbarPortal slot='trailing'>
          <div className='flex items-center gap-2'>
            <div className='relative inline-flex' ref={sprintPickerNudgeAnchorRef}>
              <TaskScopeToolbarControl
                dateRange={parsedSearch.dateRange}
                isSprintHistoryUnavailable={projectSprintsUnavailable}
                onDateRangeChange={(dateRange) => updateSearch({dateRange})}
                onSprintIdsChange={handleSprintIdsChange}
                sprintIds={effectiveSprintIds}
                sprints={projectSprints}
                taskMode={projectTaskMode}
              />
              {sprintPickerNudge ? (
                <SprintPickerNudge
                  anchorRef={sprintPickerNudgeAnchorRef}
                  description={sprintPickerNudge.description}
                  title={sprintPickerNudge.title}
                />
              ) : null}
            </div>
            <GroupByMenu
              groupBy={parsedSearch.groupBy}
              groupLabel={getGroupByMenuLabel(projectTaskMode)}
              options={tableGroupByOptions}
              onGroupByChange={(groupBy) => updateSearch({groupBy})}
            />
          </div>
        </ToolbarPortal>
        {/* ── End toolbar ── */}
      </>
    ) : null}

    <ToolbarPortal slot='view-tabs-trailing'>
      <ProjectTaskModeControl/>
    </ToolbarPortal>

    {projectTaskModeReady ? (
      <div className={`flex-1 min-w-0 bg-canvas ${!activeSearchValue ? 'flex min-h-0 flex-col overflow-hidden px-4 pt-2 pb-4 sm:px-6 sm:pt-3 sm:pb-6' : 'overflow-auto p-4 sm:p-6'}`}>
      {surfaceActionError ? (
        <div className='mb-4 rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error'>
          {surfaceActionError}
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
        <TableView
          activeTaskId={isCardSheetOpen ? selectedCardId : null}
          builtinFieldLabels={project.builtinFieldLabels}
          columnWidths={columnWidths}
          customFields={customFields}
          expandedGroups={expandedGroupIds}
          groupBy={parsedSearch.groupBy}
          isConfigurationDisabled={projectViewBackendUnavailable || !canEditProject}
          isSprintDataUnavailable={projectSprintsUnavailable}
          isTaskDetailOpen={isCardSheetOpen}
          mode={mode}
          onAddGroup={handleAddGroup}
          onCreateCustomColumn={(fieldType, name) => {
            createCustomFieldMutation.mutate(
              {fieldType, name, options: fieldType === 'single_select' ? ['Option 1'] : []},
              {
                onSuccess: (field) => {
                  updateSearch({visibleFieldKeys: [...parsedSearch.visibleFieldKeys, field.key]})
                },
              },
            )
          }}
          onDeleteGroup={async (groupId, deleteCards) => {
            await projectGroupRepository.deleteGroup({deleteCards, groupId})
            await invalidateProjectData()
          }}
          onMoveCardToGroup={handleMoveCardToGroup}
          onMoveSelectedCardsToGroup={handleMoveSelectedTasksToGroup}
          onMoveCardToSprint={handleMoveCardToSprint}
          onMoveTask={tableMoveTask}
          onViewAgentProfile={() => {
            // Deep-link to the AI Agent Profiles tab. Falls back to the
            // default kanban tab if the search param is stripped. TODO:
            // ship a `/users/<id>` route for human assignees and route
            // through here so AssigneeHoverCard can show a View profile
            // button for humans too.
            void rawNavigate({to: '/ai-agents', search: {tab: 'profiles'}} as never)
          }}
          onCompleteSprint={(sprintId, incompleteCount) => {
            const sprint = projectSprints.find((entry) => entry.id === sprintId)
            if (!sprint) return
            openCompleteSprintDialog({
              incompleteCount,
              sourceViewId: viewId,
              sprintId,
              sprintName: sprint.name,
            })
          }}
          onRenameGroup={(groupId, label) => {
            patchProjectGroups(queryClient, projectId, (groups) =>
              groups.map((g) => g.id === groupId ? {...g, label, updatedAt: new Date().toISOString()} : g),
            )
            void projectGroupRepository.renameGroup(groupId, label).finally(() => void invalidateProjectData())
          }}
          onRenameSprint={renameSprint}
          onReorderGroup={(draggedId, targetId) => {
            const nextGroups = [...projectGroups]
            const draggedIndex = nextGroups.findIndex((g) => g.id === draggedId)
            const targetIndex = nextGroups.findIndex((g) => g.id === targetId)
            if (draggedIndex === -1 || targetIndex === -1) return
            const [dragged] = nextGroups.splice(draggedIndex, 1)
            nextGroups.splice(targetIndex, 0, dragged)
            patchProjectGroups(queryClient, projectId, () =>
              nextGroups.map((g, i) => ({...g, position: i})),
            )
            void projectGroupRepository.reorderGroups(nextGroups.map((g) => g.id)).finally(() => void invalidateProjectData())
          }}
          onStartSprint={startSprint}
          onEditSprint={openEditSprintDialog}
          projectSprints={projectSprints}
          onCreateSprintClick={openCreateSprintDialog}
          onInlineCreateTask={canEditProject ? async (input, targetGroupId) => {
            const optimisticId = crypto.randomUUID()
            setPendingInlineCreateIds((c) => [...c, optimisticId])
            const statusOptionId = input.statusOptionId ?? getDefaultStatusOption(project.statusOptions)?.id ?? null
            const statusPosition = Math.max(0, ...cards.filter((c) => c.statusOptionId === statusOptionId).map((c) => c.statusPosition)) + 1
            const groupPosition = Math.max(0, ...cards.filter((c) => (c.groupId ?? null) === (targetGroupId ?? null)).map((c) => c.groupPosition)) + 1
            const optimisticCard: CardRecord = {
              assigneeName: currentUser.name,
              assigneeUserId: currentUser.id,
              bodyJson: {type: 'doc', content: [{type: 'paragraph'}]},
              bodyMd: '',
              completedAt: null,
              createdAt: new Date().toISOString(),
              customFieldValues: {},
              dueAt: input.dueAt ?? null,
              effort: input.effort ?? null,
              groupId: targetGroupId ?? null,
              groupPosition,
              id: optimisticId,
              initiativeId: input.initiativeId ?? null,
              priorityOptionId: input.priorityOptionId ?? null,
              projectId: input.projectId,
              sprintId: input.sprintId ?? null,
              startAt: input.startAt ?? null,
              statusOptionId,
              statusPosition,
              tags: input.tags ?? [],
              title: input.title,
            }
            patchProjectCards(queryClient, input.projectId, (c) => [...c, optimisticCard])
            try {
              await runCreateCardMutation(queryClient, {...input, groupId: targetGroupId ?? null})
            } finally {
              patchProjectCards(queryClient, input.projectId, (c) => c.filter((e) => e.id !== optimisticId))
              setPendingInlineCreateIds((c) => c.filter((id) => id !== optimisticId))
            }
          } : undefined}
          onOpenTask={openCard}
          pendingTaskIds={pendingInlineCreateIds}
          onSetCustomFieldValue={async (cardId, fieldDefinitionId, value) => {
            const field = customFields.find((f) => f.id === fieldDefinitionId)
            if (!field) return
            await setCardCustomFieldValueMutation.mutateAsync({
              cardId,
              fieldDefinitionId,
              fieldType: field.fieldType,
              projectId,
              ...value,
            })
          }}
          onToggleGroup={toggleGroup}
          onToggleTaskSelection={toggleTaskSelection}
          projectId={projectId}
          projectGroups={projectGroupsInCurrentMode}
          projectMembers={projectMembers}
          priorityOptions={project.priorityOptions}
          selectedTaskIds={selectedTaskIds}
          setDraft={setTableViewDraft}
          sort={parsedSearch.sort}
          statusOptions={project.statusOptions}
          taskMode={projectTaskMode}
          tableGroups={tableGroups}
          visibleFieldKeys={parsedSearch.visibleFieldKeys}
        />
      </Suspense>
      {selectedTaskIds.length > 0 ? (
        <LazySurfaceBoundary label='Bulk actions' variant='inline'>
          <BulkActionsBar
            groups={projectGroupsInCurrentMode.map((g) => ({id: g.id, label: g.label}))}
            onArchive={async () => {
              const ids = [...selectedTaskIds]
              const count = ids.length
              setSelectedTaskIds([])
              try {
                const archivedCards = await runArchiveCardsMutation(queryClient, {cardIds: ids, projectId})
                toast({
                  title: `Archived ${count} task${count === 1 ? '' : 's'}`,
                  action: {
                    label: 'Undo',
                    onClick: () => void runUnarchiveCardsMutation(queryClient, {
                      cardIds: ids,
                      cards: archivedCards,
                      projectId,
                    }).catch(() => {
                      toast({title: "Couldn't restore archived tasks", variant: 'error'})
                    }),
                  },
                })
              } catch {
                toast({title: "Couldn't archive — try again", variant: 'error'})
              }
            }}
            onClearSelection={() => setSelectedTaskIds([])}
            onDelete={async () => {
              if (!await confirm({title: `Move ${selectedTaskIds.length} task${selectedTaskIds.length === 1 ? '' : 's'} to trash?`, variant: 'destructive', confirmLabel: 'Move to trash'})) return
              const ids = [...selectedTaskIds]
              const count = ids.length
              setSelectedTaskIds([])
              try {
                const trashedCards = await runTrashCardsMutation(queryClient, {cardIds: ids, projectId})
                toast({
                  title: `Moved ${count} task${count === 1 ? '' : 's'} to trash`,
                  description: 'Will be permanently deleted after 30 days',
                  action: {
                    label: 'Undo',
                    onClick: () => void runRestoreCardsMutation(queryClient, {
                      cardIds: ids,
                      cards: trashedCards,
                      projectId,
                    }).catch(() => {
                      toast({title: "Couldn't restore trashed tasks", variant: 'error'})
                    }),
                  },
                })
              } catch {
                toast({title: "Couldn't move to trash — try again", variant: 'error'})
              }
            }}
            onDuplicate={async () => {
              const ids = [...selectedTaskIds]
              if (ids.length === 0) return
              const count = ids.length
              try {
                await runDuplicateCardsMutation(queryClient, {cardIds: ids, projectId})
                setSelectedTaskIds([])
                toast({title: `Duplicated ${count} task${count === 1 ? '' : 's'}`})
              } catch (error) {
                console.error('[duplicate-cards] Failed:', error)
                toast({title: "Couldn't duplicate — try again", variant: 'error'})
              }
            }}
            onMoveToGroup={async (groupId) => {
              const ids = [...selectedTaskIds]
              await handleMoveSelectedTasksToGroup(ids, groupId)
              setSelectedTaskIds([])
            }}
            onMoveToSprint={async (sprintId) => {
              const ids = [...selectedTaskIds]
              await Promise.all(ids.map(cardId => handleMoveCardToSprint(cardId, sprintId)))
              setSelectedTaskIds([])
            }}
            selectedCount={selectedTaskIds.length}
            sprints={projectSprints
              .filter((s) => s.status === 'active' || s.status === 'planned')
              .map((s) => ({id: s.id, label: s.name}))}
          />
        </LazySurfaceBoundary>
      ) : null}
    </div>
    ) : (
      <div className='flex-1 bg-canvas'>
        <ViewSkeleton viewType='table'/>
      </div>
    )}
      {bulkDeleteConfirmDialogProps ? <ConfirmDialog {...bulkDeleteConfirmDialogProps}/> : null}
    </>
  )
}
