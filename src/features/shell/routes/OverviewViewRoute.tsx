import {useNavigate, useParams, useSearch} from '@tanstack/react-router'
import {Suspense, useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {ChevronDown, LayoutDashboard} from 'lucide-react'

import {lazyWithRetry} from '../../../app/lazyWithRetry'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu'
import {
  getPersonalOverviewConfigFromStorage,
  setPersonalOverviewConfigToStorage,
} from '../../projects/personal-view-storage'
import {
  useOverviewSharedConfigQuery,
  useSetOverviewSharedConfigMutation,
} from '../../projects/project-view.queries'
import {
  defaultOverviewWidgets,
  resolveProjectOverviewConfig,
  type ProjectOverviewConfig,
  type OverviewWidgetConfig,
  type OverviewWidgetType,
  type OverviewWidgetWidth,
} from '../../projects/project-view.types'
import {useProjectChrome} from '../project/ProjectChromeContext'
import {useProjectData} from '../project/ProjectDataContext'
import {useProjectDialogs} from '../project/ProjectDialogContext'
import {ProjectTaskModeControl} from '../ProjectTaskModeControl'
import {TaskScopeToolbarControl} from '../TaskScopeToolbarControl'
import {ToolbarPortal} from '../ToolbarSlot'
import {isTaskBoardProjectView} from '../../projects/project-view.model'
import {
  applyExplicitOverviewSearchParams,
  parseOverviewSearchParams,
  buildOverviewSearchParams,
  type OverviewSearchParams,
} from '../view-search-params'
import {useAutoSavePersonalConfig} from '../hooks/useAutoSavePersonalConfig'
import {useInitializeViewSearch} from '../hooks/useInitializeViewSearch'
import {useLocalStorageSync} from '../hooks/useLocalStorageSync'
import {
  filterCardsByTaskScope,
  resolveDefaultTaskScopeSprintIds,
  resolveTaskScopeDateWindow,
} from '../task-scope'
import {AddWidgetMenu} from '../views/widgets/AddWidgetMenu'

const OverviewView = lazyWithRetry(() => import('../views/OverviewView').then((m) => ({default: m.OverviewView})))

type OverviewSearchState = ProjectOverviewConfig & {
  overviewPanel: 'access' | null
}

export function getOverviewTaskScopeLabel({
  overviewGroupId,
  overviewSprintId,
  projectGroups,
  projectSprints,
  projectSprintsUnavailable,
}: {
  overviewGroupId: string | null
  overviewSprintId: string | null
  projectGroups: Array<{id: string; label: string}>
  projectSprints: Array<{id: string; name: string}>
  projectSprintsUnavailable: boolean
}) {
  if (overviewSprintId) {
    return projectSprints.find((s) => s.id === overviewSprintId)?.name
      ?? (projectSprintsUnavailable ? 'Selected sprint' : 'All')
  }

  if (overviewGroupId) {
    return projectGroups.find((group) => group.id === overviewGroupId)?.label ?? 'All'
  }

  return 'All'
}

export function OverviewViewRoute() {
  const params = useParams({strict: false}) as {viewId: string}
  const search = useSearch({strict: false})
  const rawNavigate = useNavigate()
  const navigate = useCallback((options: {replace: true; search: () => OverviewSearchParams}) => {
    void rawNavigate({
      replace: options.replace,
      search: options.search as never,
    } as never)
  }, [rawNavigate])
  const {
    canEditProject,
    currentUser,
    mode,
    project,
    projectAccessSnapshot,
    projectId,
    projectMembers,
    workspace,
  } = useProjectChrome()
  const {
    cards,
    projectGroups,
    projectSprints,
    projectSprintsUnavailable,
    projectTaskMode,
    projectTaskModeReady,
  } = useProjectData()
  const {openCard} = useProjectDialogs()
  const viewId = params.viewId
  const overviewConfigQuery = useOverviewSharedConfigQuery(viewId)
  const setOverviewConfigMutation = useSetOverviewSharedConfigMutation(viewId)

  // URL search params are the current filter config
  const parsedSearch = parseOverviewSearchParams(search)

  // Shared baseline from DB
  const sharedBaseline = useMemo(
    (): OverviewSearchState => ({
      ...resolveProjectOverviewConfig(overviewConfigQuery.data ?? null),
      overviewPanel: null,
    }),
    [overviewConfigQuery.data],
  )

  const getPersonalConfig = useCallback(
    () => getPersonalOverviewConfigFromStorage(viewId),
    [viewId],
  )

  const buildOverviewSearch = useCallback(
    (config: OverviewSearchState) => buildOverviewSearchParams(config),
    [],
  )

  const mergePersonalWithShared = useCallback(
    (personal: Partial<typeof sharedBaseline>, shared: typeof sharedBaseline) =>
      applyExplicitOverviewSearchParams<OverviewSearchState>({
        ...shared,
        ...personal,
        overviewWidgets: shared.overviewWidgets,
      }, search),
    [search],
  )

  // Two-phase init: personal filter config from localStorage, shared widget config from DB
  const isViewSearchInitialized = useInitializeViewSearch({
    buildSearchParams: buildOverviewSearch,
    getPersonalConfig,
    isBaselineReady: overviewConfigQuery.isSuccess,
    mergePersonalWithShared,
    navigate,
    routeKey: `${projectId}:${viewId}`,
    search,
    sharedBaseline,
  })

  // Auto-save personal filter config to localStorage
  const personalFilterConfig = useMemo(() => ({
    overviewAssigneeIds: parsedSearch.overviewAssigneeIds,
    overviewDateRange: parsedSearch.overviewDateRange,
    overviewGroupId: parsedSearch.overviewGroupId,
    overviewPanel: parsedSearch.overviewPanel,
    overviewPriorityKeys: parsedSearch.overviewPriorityKeys,
    overviewSprintIds: parsedSearch.overviewSprintIds,
    overviewSprintId: parsedSearch.overviewSprintId,
    overviewWidgets: sharedBaseline.overviewWidgets,
  }), [parsedSearch.overviewAssigneeIds, parsedSearch.overviewDateRange, parsedSearch.overviewGroupId, parsedSearch.overviewPanel, parsedSearch.overviewPriorityKeys, parsedSearch.overviewSprintId, parsedSearch.overviewSprintIds, sharedBaseline.overviewWidgets])

  useAutoSavePersonalConfig(viewId, personalFilterConfig, setPersonalOverviewConfigToStorage)

  // Cross-tab sync for personal settings
  useLocalStorageSync(
    `rocketboard:personalOverviewView:${viewId}`,
    useCallback((newValue) => {
      if (!newValue) return
      try {
        const config = JSON.parse(newValue)
        void navigate({
          search: () => buildOverviewSearchParams({...parseOverviewSearchParams(search), ...config}),
          replace: true,
        })
      } catch { /* ignore corrupt data */ }
    }, [navigate, search]),
  )

  const updateSearch = useCallback((patch: Partial<ReturnType<typeof parseOverviewSearchParams>>) => {
    const current = parseOverviewSearchParams(search)
    const merged = {...current, ...patch}
    void navigate({
      search: () => buildOverviewSearchParams(merged),
      replace: true,
    })
  }, [navigate, search])

  const {
    overviewGroupId,
    overviewSprintIds,
    overviewAssigneeIds,
    overviewPriorityKeys,
    overviewDateRange,
  } = parsedSearch

  useEffect(() => {
    if (parsedSearch.overviewPanel !== 'access') {
      return
    }

    requestAnimationFrame(() => {
      const accessPanel = document.getElementById('project-access-panel')
      accessPanel?.scrollIntoView({behavior: 'smooth', block: 'start'})
    })
  }, [parsedSearch.overviewPanel])

  const sprintHistoryUnavailable = projectSprintsUnavailable && projectSprints.length === 0
  const isSprintMode = projectTaskMode === 'sprint'
  const effectiveOverviewSprintIds = useMemo(
    () => overviewSprintIds.length > 0
      ? overviewSprintIds
      : isViewSearchInitialized
        ? resolveDefaultTaskScopeSprintIds(projectSprints)
        : [],
    [isViewSearchInitialized, overviewSprintIds, projectSprints],
  )

  useEffect(() => {
    if (!isViewSearchInitialized || !projectTaskModeReady || !isSprintMode || overviewSprintIds.length > 0 || effectiveOverviewSprintIds.length === 0) {
      return
    }

    updateSearch({
      overviewSprintId: effectiveOverviewSprintIds[0] ?? null,
      overviewSprintIds: effectiveOverviewSprintIds,
    })
  }, [effectiveOverviewSprintIds, isSprintMode, isViewSearchInitialized, overviewSprintIds.length, projectTaskModeReady, updateSearch])

  const taskScopeLabel = useMemo(() => getOverviewTaskScopeLabel({
    overviewGroupId,
    overviewSprintId: null,
    projectGroups,
    projectSprints,
    projectSprintsUnavailable: sprintHistoryUnavailable,
  }), [
    overviewGroupId,
    projectGroups,
    projectSprints,
    sprintHistoryUnavailable,
  ])

  // ── Widget draft state (React state, not URL) ──────────────────
  const [widgetDraft, setWidgetDraft] = useState<OverviewWidgetConfig[]>(
    () => sharedBaseline.overviewWidgets ?? [...defaultOverviewWidgets],
  )
  const [isEditMode, setIsEditMode] = useState(false)

  // Re-sync widget draft when baseline changes (e.g., shared config loaded)
  const baselineWidgetsRef = useRef(sharedBaseline.overviewWidgets)
  useEffect(() => {
    if (JSON.stringify(baselineWidgetsRef.current) !== JSON.stringify(sharedBaseline.overviewWidgets)) {
      baselineWidgetsRef.current = sharedBaseline.overviewWidgets
      if (!isEditMode) {
        setWidgetDraft(sharedBaseline.overviewWidgets)
      }
    }
  }, [sharedBaseline.overviewWidgets, isEditMode])

  const handleAddWidget = useCallback((type: OverviewWidgetType) => {
    setWidgetDraft((prev) => [
      ...prev,
      {id: type, title: null, type, width: 1 as OverviewWidgetWidth},
    ])
  }, [])

  const handleRemoveWidget = useCallback((id: string) => {
    setWidgetDraft((prev) => prev.filter((w) => w.id !== id))
  }, [])

  const handleRenameWidget = useCallback((id: string, title: string | null) => {
    setWidgetDraft((prev) => prev.map((w) => w.id === id ? {...w, title} : w))
  }, [])

  const handleResizeWidget = useCallback((id: string, width: OverviewWidgetWidth) => {
    setWidgetDraft((prev) => prev.map((w) => w.id === id ? {...w, width} : w))
  }, [])

  const handleReorderWidgets = useCallback((reordered: OverviewWidgetConfig[]) => {
    setWidgetDraft(reordered)
  }, [])

  // ── Widget dirty detection (for beforeunload guard only) ────────
  const widgetsDirty = JSON.stringify(widgetDraft) !== JSON.stringify(sharedBaseline.overviewWidgets)

  // Unsaved changes guard: warn before browser navigation with dirty widget state
  useEffect(() => {
    if (!widgetsDirty) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [widgetsDirty])

  // ── Card filtering ─────────────────────────────────────────────
  const overviewScopedCards = useMemo(() => {
    let result = cards
    if (!isSprintMode && overviewGroupId) {
      result = result.filter((card) => card.groupId === overviewGroupId)
    }

    return filterCardsByTaskScope(result, {
      dateRange: overviewDateRange,
      sprintIds: effectiveOverviewSprintIds,
      taskMode: projectTaskMode,
    })
  }, [cards, effectiveOverviewSprintIds, isSprintMode, overviewDateRange, overviewGroupId, projectTaskMode])

  const overviewCards = useMemo(() => {
    let result = overviewScopedCards
    if (overviewAssigneeIds.length > 0) {
      result = result.filter((c) => c.assigneeUserId && overviewAssigneeIds.includes(c.assigneeUserId))
    }
    if (overviewPriorityKeys.length > 0) {
      result = result.filter((c) => c.priorityOptionId && overviewPriorityKeys.includes(c.priorityOptionId))
    }
    return result
  }, [overviewAssigneeIds, overviewPriorityKeys, overviewScopedCards])

  const overviewAssigneeOptions = useMemo(() => {
    const ids = new Set(overviewScopedCards.map((card) => card.assigneeUserId).filter(Boolean) as string[])
    return projectMembers.filter((m) => ids.has(m.id))
  }, [overviewScopedCards, projectMembers])

  const overviewSprintDateWindow = useMemo(
    () => resolveTaskScopeDateWindow(effectiveOverviewSprintIds, projectSprints),
    [effectiveOverviewSprintIds, projectSprints],
  )

  const visibleProjectViews = project.projectViews.filter((view) => !view.isHidden)
  const hasVisibleTaskBoardView = visibleProjectViews.some((view) => isTaskBoardProjectView(view.viewType))

  const addedWidgetTypes = useMemo(() => new Set(widgetDraft.map((w) => w.type)), [widgetDraft])

  const handleClickAssignee = useCallback((userId: string) => {
    const next = overviewAssigneeIds.includes(userId)
      ? overviewAssigneeIds.filter((id) => id !== userId)
      : [...overviewAssigneeIds, userId]
    updateSearch({overviewAssigneeIds: next})
  }, [overviewAssigneeIds, updateSearch])

  return (
    <>
      <ToolbarPortal slot="leading">
        {isEditMode ? (
          <AddWidgetMenu addedTypes={addedWidgetTypes} onAdd={handleAddWidget}/>
        ) : null}
        {!isSprintMode ? (
          <div className='flex items-center gap-2'>
            <span className='text-sm font-medium text-text-muted'>Group:</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className='inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-elevated px-3 py-1.5 text-sm font-medium text-text-strong shadow-sm transition-colors hover:bg-canvas-accent'
                  type='button'
                >
                  {taskScopeLabel}
                  <ChevronDown className='h-3.5 w-3.5 text-text-muted'/>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='start'>
                <DropdownMenuItem onClick={() => updateSearch({overviewAssigneeIds: [], overviewGroupId: null})}>
                  All
                </DropdownMenuItem>
                {projectGroups.map((group) => (
                  <DropdownMenuItem key={group.id} onClick={() => updateSearch({overviewAssigneeIds: [], overviewGroupId: group.id})}>
                    {group.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
        {overviewAssigneeOptions.length > 0 ? (
          <div className='flex items-center gap-2'>
            <span className='text-sm font-medium text-text-muted'>Assignee:</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className='inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-elevated px-3 py-1.5 text-sm font-medium text-text-strong shadow-sm transition-colors hover:bg-canvas-accent'
                  type='button'
                >
                  {overviewAssigneeIds.length === 0 ? 'All' : `${overviewAssigneeIds.length} selected`}
                  <ChevronDown className='h-3.5 w-3.5 text-text-muted'/>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='start'>
                <DropdownMenuItem onClick={() => updateSearch({overviewAssigneeIds: []})}>
                  All
                </DropdownMenuItem>
                {overviewAssigneeOptions.map((m) => (
                  <DropdownMenuItem
                    key={m.id}
                    onSelect={(e) => {
                      e.preventDefault()
                      const next = overviewAssigneeIds.includes(m.id)
                        ? overviewAssigneeIds.filter((x) => x !== m.id)
                        : [...overviewAssigneeIds, m.id]
                      updateSearch({overviewAssigneeIds: next})
                    }}
                  >
                    <span className='flex-1'>{m.name}</span>
                    {overviewAssigneeIds.includes(m.id) ? <span className='text-primary'>✓</span> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
        <div className='flex items-center gap-2'>
          <span className='text-sm font-medium text-text-muted'>Priority:</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className='inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-elevated px-3 py-1.5 text-sm font-medium text-text-strong shadow-sm transition-colors hover:bg-canvas-accent'
                type='button'
              >
                {overviewPriorityKeys.length === 0 ? 'All' : `${overviewPriorityKeys.length} selected`}
                <ChevronDown className='h-3.5 w-3.5 text-text-muted'/>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='start'>
              <DropdownMenuItem onClick={() => updateSearch({overviewPriorityKeys: []})}>
                All
              </DropdownMenuItem>
              {project.priorityOptions.map((option) => (
                <DropdownMenuItem
                  key={option.id}
                  onSelect={(e) => {
                    e.preventDefault()
                    const next = overviewPriorityKeys.includes(option.id)
                      ? overviewPriorityKeys.filter((k) => k !== option.id)
                      : [...overviewPriorityKeys, option.id]
                    updateSearch({overviewPriorityKeys: next})
                  }}
                >
                  <span className='flex-1'>{option.label}</span>
                  {overviewPriorityKeys.includes(option.id) ? <span className='text-primary'>✓</span> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ToolbarPortal>

      <ToolbarPortal slot="view-tabs-trailing">
        <ProjectTaskModeControl/>
      </ToolbarPortal>

      <ToolbarPortal slot="trailing">
        <div className='flex items-center gap-2'>
          {projectTaskModeReady ? (
            <TaskScopeToolbarControl
              dateRange={overviewDateRange}
              isSprintHistoryUnavailable={sprintHistoryUnavailable}
              onDateRangeChange={(dateRange) => updateSearch({overviewDateRange: dateRange})}
              onSprintIdsChange={(sprintIds) => updateSearch({
                overviewAssigneeIds: [],
                overviewSprintId: sprintIds[0] ?? null,
                overviewSprintIds: sprintIds.slice(0, 1),
              })}
              sprintIds={effectiveOverviewSprintIds.slice(0, 1)}
              sprintPickerMode='single'
              sprints={projectSprints}
              taskMode={projectTaskMode}
            />
          ) : null}
          {canEditProject ? (
            <button
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                isEditMode
                  ? 'bg-primary text-inverse shadow-sm hover:bg-primary-strong'
                  : 'text-text-medium hover:bg-canvas-accent hover:text-text-strong'
              }`}
              onClick={() => {
                if (isEditMode && widgetsDirty) {
                  setOverviewConfigMutation.mutate({
                    ...parsedSearch,
                    overviewWidgets: widgetDraft,
                  })
                }
                setIsEditMode((prev) => !prev)
              }}
              type='button'
            >
              <LayoutDashboard className='h-4 w-4'/>
              {isEditMode ? 'Done editing' : 'Edit dashboard'}
            </button>
          ) : null}
        </div>
      </ToolbarPortal>

      <div className='flex-1 bg-canvas overflow-auto p-4 sm:p-6'>
      <Suspense fallback={null}>
        <OverviewView
          canEditProject={canEditProject}
          priorityOptions={project.priorityOptions}
          cards={overviewCards}
          currentUserId={currentUser.id}
          dateRange={isSprintMode
            ? overviewSprintDateWindow
            : overviewDateRange.startDate && overviewDateRange.endDate
              ? {endDate: overviewDateRange.endDate, startDate: overviewDateRange.startDate}
              : null}
          hasVisibleTaskBoardView={hasVisibleTaskBoardView}
          isEditMode={isEditMode}
          isLoading={overviewConfigQuery.isLoading}
          mode={mode}
          organizationId={workspace.organizationId}
          onAddWidget={handleAddWidget}
          onClickAssignee={handleClickAssignee}
          onClickTask={openCard}
          onRemoveWidget={handleRemoveWidget}
          onRenameWidget={handleRenameWidget}
          onReorderWidgets={handleReorderWidgets}
          onResizeWidget={handleResizeWidget}
          projectAccessSnapshot={projectAccessSnapshot}
          projectId={projectId}
          projectName={project.name}
          statusOptions={project.statusOptions}
          widgets={widgetDraft}
          workspaceId={workspace.id}
          workspaceName={workspace.name}
        />
      </Suspense>
    </div>
    </>
  )
}
