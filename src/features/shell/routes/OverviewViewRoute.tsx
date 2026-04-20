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
import {normalizeCardDateString} from '../../cards/card-date'
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
  type OverviewWidgetConfig,
  type OverviewWidgetType,
  type OverviewWidgetWidth,
} from '../../projects/project-view.types'
import {useProjectChrome} from '../project/ProjectChromeContext'
import {useProjectData} from '../project/ProjectDataContext'
import {useProjectDialogs} from '../project/ProjectDialogContext'
import {ToolbarPortal} from '../ToolbarSlot'
import {OverviewDateRangePicker} from '../OverviewDateRangePicker'
import {SprintPicker} from '../SprintPicker'
import {isTaskBoardProjectView} from '../../projects/project-view.model'
import {parseOverviewSearchParams, buildOverviewSearchParams, type OverviewSearchParams} from '../view-search-params'
import {useAutoSavePersonalConfig} from '../hooks/useAutoSavePersonalConfig'
import {useInitializeViewSearch} from '../hooks/useInitializeViewSearch'
import {useLocalStorageSync} from '../hooks/useLocalStorageSync'
import {AddWidgetMenu} from '../views/widgets/AddWidgetMenu'

const OverviewView = lazyWithRetry(() => import('../views/OverviewView').then((m) => ({default: m.OverviewView})))

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
  const {cards, projectGroups, projectSprints, projectSprintsUnavailable} = useProjectData()
  const {openCard} = useProjectDialogs()
  const viewId = params.viewId
  const overviewConfigQuery = useOverviewSharedConfigQuery(viewId)
  const setOverviewConfigMutation = useSetOverviewSharedConfigMutation(viewId)

  // URL search params are the current filter config
  const parsedSearch = parseOverviewSearchParams(search)

  // Shared baseline from DB
  const sharedBaseline = useMemo(
    () => resolveProjectOverviewConfig(overviewConfigQuery.data ?? null),
    [overviewConfigQuery.data],
  )

  const getPersonalConfig = useCallback(
    () => getPersonalOverviewConfigFromStorage(viewId),
    [viewId],
  )

  // Two-phase init: personal filter config from localStorage, shared widget config from DB
  useInitializeViewSearch({
    buildSearchParams: buildOverviewSearchParams,
    getPersonalConfig,
    isBaselineReady: overviewConfigQuery.isSuccess,
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
    overviewSprintId: parsedSearch.overviewSprintId,
    overviewWidgets: sharedBaseline.overviewWidgets,
  }), [parsedSearch.overviewAssigneeIds, parsedSearch.overviewDateRange, parsedSearch.overviewGroupId, parsedSearch.overviewPanel, parsedSearch.overviewPriorityKeys, parsedSearch.overviewSprintId, sharedBaseline.overviewWidgets])

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

  const {overviewGroupId, overviewSprintId, overviewAssigneeIds, overviewPriorityKeys, overviewDateRange} = parsedSearch

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
  const isSprintMode = overviewSprintId !== null
  const effectiveSprintId = useMemo(() => {
    if (overviewSprintId) return overviewSprintId
    if (sprintHistoryUnavailable) return null
    const activeSprint = projectSprints.find((s) => s.status === 'active')
    return activeSprint?.id ?? null
  }, [overviewSprintId, projectSprints, sprintHistoryUnavailable])
  const taskScopeLabel = useMemo(() => getOverviewTaskScopeLabel({
    overviewGroupId,
    overviewSprintId,
    projectGroups,
    projectSprints,
    projectSprintsUnavailable: sprintHistoryUnavailable,
  }), [
    overviewGroupId,
    overviewSprintId,
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
  const overviewCards = useMemo(() => {
    let result = cards
    if (overviewSprintId) {
      result = result.filter((card) => card.sprintId === overviewSprintId)
    } else if (overviewGroupId) {
      result = result.filter((card) => card.groupId === overviewGroupId)
    }
    if (overviewAssigneeIds.length > 0) {
      result = result.filter((c) => c.assigneeUserId && overviewAssigneeIds.includes(c.assigneeUserId))
    }
    if (overviewPriorityKeys.length > 0) {
      result = result.filter((c) => c.priorityOptionId && overviewPriorityKeys.includes(c.priorityOptionId))
    }
    if (overviewDateRange.startDate && overviewDateRange.endDate) {
      const rangeStart = overviewDateRange.startDate
      const rangeEnd = overviewDateRange.endDate
      result = result.filter((c) => {
        if (!c.startAt && !c.dueAt) return false
        const cardStart = c.startAt ?? normalizeCardDateString(c.createdAt)
        if (!cardStart) return false
        const cardEnd = c.dueAt ?? '9999-12-31'
        return cardStart <= rangeEnd && cardEnd >= rangeStart
      })
    }
    return result
  }, [cards, overviewGroupId, overviewSprintId, overviewAssigneeIds, overviewPriorityKeys, overviewDateRange])

  const overviewAssigneeOptions = useMemo(() => {
    const groupCards = overviewSprintId
      ? cards.filter((card) => card.sprintId === overviewSprintId)
      : overviewGroupId
        ? cards.filter((card) => card.groupId === overviewGroupId)
        : cards
    const ids = new Set(groupCards.map((c) => c.assigneeUserId).filter(Boolean) as string[])
    return projectMembers.filter((m) => ids.has(m.id))
  }, [cards, overviewGroupId, overviewSprintId, projectMembers])

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
        <div className='flex items-center gap-2'>
          <span className='text-sm font-medium text-text-muted'>Tasks:</span>
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
              <DropdownMenuItem onClick={() => updateSearch({overviewGroupId: null, overviewSprintId: null, overviewAssigneeIds: []})}>
                All
              </DropdownMenuItem>
              {sprintHistoryUnavailable ? (
                <DropdownMenuItem disabled>
                  Sprint history is temporarily unavailable
                </DropdownMenuItem>
              ) : projectSprints.length > 0 ? (
                <>
                  {projectSprints
                    .filter((s) => s.status !== 'completed')
                    .map((sprint) => (
                      <DropdownMenuItem key={sprint.id} onClick={() => updateSearch({overviewSprintId: sprint.id, overviewGroupId: null, overviewAssigneeIds: []})}>
                        {sprint.name}
                      </DropdownMenuItem>
                    ))}
                </>
              ) : null}
              {projectGroups.map((group) => (
                <DropdownMenuItem key={group.id} onClick={() => updateSearch({overviewGroupId: group.id, overviewSprintId: null, overviewAssigneeIds: []})}>
                  {group.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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
        {isSprintMode ? (
          <SprintPicker
            isUnavailable={sprintHistoryUnavailable}
            onSelect={(sprintId) => {
              updateSearch({overviewSprintId: sprintId, overviewGroupId: null, overviewAssigneeIds: []})
            }}
            selectedSprintId={overviewSprintId ?? effectiveSprintId}
            sprints={projectSprints}
            unavailableLabel={sprintHistoryUnavailable ? 'Selected sprint' : undefined}
          />
        ) : (
          <OverviewDateRangePicker onChange={(dateRange) => updateSearch({overviewDateRange: dateRange})} value={overviewDateRange}/>
        )}
      </ToolbarPortal>

      <ToolbarPortal slot="trailing">
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
      </ToolbarPortal>

      <div className='flex-1 bg-canvas overflow-auto p-4 sm:p-6'>
      <Suspense fallback={null}>
        <OverviewView
          canEditProject={canEditProject}
          priorityOptions={project.priorityOptions}
          cards={overviewCards}
          currentUserId={currentUser.id}
          dateRange={(() => {
            if (isSprintMode) {
              const selectedSprint = projectSprints.find((s) => s.id === (overviewSprintId ?? effectiveSprintId))
              if (selectedSprint?.startDate && selectedSprint?.endDate) {
                return {endDate: selectedSprint.endDate, startDate: selectedSprint.startDate}
              }
              return null
            }
            return overviewDateRange.startDate && overviewDateRange.endDate ? {endDate: overviewDateRange.endDate, startDate: overviewDateRange.startDate} : null
          })()}
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
