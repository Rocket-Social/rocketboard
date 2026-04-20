import {useNavigate, useParams, useSearch} from '@tanstack/react-router'
import {Suspense, useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {Plus, ChevronDown, Search} from 'lucide-react'
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
import {ToolbarPortal} from '../ToolbarSlot'
import {parseTableSearchParams, buildTableSearchParams, type TableSearchParams} from '../view-search-params'
import {ViewSkeleton} from '../views/ViewSkeletons'
import {useAutoSavePersonalConfig} from '../hooks/useAutoSavePersonalConfig'
import {useInitializeViewSearch} from '../hooks/useInitializeViewSearch'
import {useLocalStorageSync} from '../hooks/useLocalStorageSync'
import {useViewSearchPipeline} from '../hooks/useViewSearchPipeline'
import {moveCardsToGroupSequentially} from './table-bulk-actions'
import {getVisibleTableTaskIds, toggleTableTaskSelection} from './table-selection'

const TableView = lazyWithRetry(() => import('../views/TableView').then((m) => ({default: m.TableView})))
const BulkActionsBar = lazyWithRetry(() => import('../views/BulkActionsBar').then((m) => ({default: m.BulkActionsBar})), {recovery: 'error-boundary'})

const tableGroupByOptions: TableGroupBy[] = ['group', 'status', 'priority', 'assignee', 'due_date']

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
  const sharedBaseline = useMemo(() => {
    const state = tableViewStates[viewId] ?? null
    return {
      filters: normalizeProjectTableFilters(state?.sharedConfig.filters),
      groupBy: normalizeProjectViewGroupBy(state?.sharedConfig.groupBy),
      personFilterUserId: state?.sharedConfig.personFilterUserId ?? null,
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
    (personal: Partial<typeof sharedBaseline>, shared: typeof sharedBaseline) => ({
      ...shared,
      ...personal,
      // Shared fields always come from the shared baseline.
      visibleFieldKeys: shared.visibleFieldKeys,
    }),
    [],
  )

  // Two-phase init: personal config from localStorage immediately, shared fields patched when ready
  useInitializeViewSearch({
    buildSearchParams: buildTableSearchParams,
    getPersonalConfig,
    isBaselineReady: Boolean(tableViewStates[viewId]),
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
    filters: parsedSearch.filters,
    groupBy: parsedSearch.groupBy,
    personFilterUserId: parsedSearch.personFilterUserId,
    sort: parsedSearch.sort,
    visibleFieldKeys: parsedSearch.visibleFieldKeys,
  }), [columnWidths, parsedSearch.filters, parsedSearch.groupBy, parsedSearch.personFilterUserId, parsedSearch.sort, parsedSearch.visibleFieldKeys])

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
          filters: next.filters,
          groupBy: next.groupBy,
          personFilterUserId: next.personFilterUserId,
          sort: next.sort,
          visibleFieldKeys: next.visibleFieldKeys,
        }),
        replace: true,
      })
    }
  }, [collapsedGroups, columnWidths, navigate, parsedSearch])

  const isSprintMode = projectTaskMode === 'sprint'

  const tableCards = useMemo(
    () => applyTableViewDraftToCards(visibleCards, tableViewDraft),
    [visibleCards, tableViewDraft],
  )

  const unsortedTableGroups = useMemo(
    () => buildTableGroups(
      tableCards,
      parsedSearch.groupBy,
      collapsedGroups,
      projectGroups,
      project.statusOptions,
      project.priorityOptions,
      displayProjectSprints,
      projectTaskMode,
    ),
    [tableCards, parsedSearch.groupBy, collapsedGroups, projectGroups,
     project.statusOptions, project.priorityOptions, displayProjectSprints, projectTaskMode],
  )

  const tableGroups = useMemo(() => {
    if (parsedSearch.sort.length === 0) return unsortedTableGroups
    return unsortedTableGroups.map((group) => {
      if (group.id === '__flat') return group
      const sortedCards = sortCards(
        group.tasks.map((t) => t.card),
        parsedSearch.sort,
        customFields,
        {groupBy: parsedSearch.groupBy, projectGroups},
      )
      const taskByCardId = new Map(group.tasks.map((t) => [t.card.id, t]))
      return {...group, tasks: sortedCards.map((card) => taskByCardId.get(card.id)!)}
    })
  }, [unsortedTableGroups, parsedSearch.groupBy, parsedSearch.sort, customFields, projectGroups])

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
      if (parsedSearch.groupBy === 'group') {
        await handleMoveCardToGroup(cardId, targetGroupId ?? null, targetPosition)
      } else if (parsedSearch.groupBy === 'status') {
        const card = cards.find((e) => e.id === cardId)
        if (!card) return
        await runMoveCardMutation(queryClient, {cardId, projectId, targetPosition, targetStatusOptionId: card.statusOptionId})
      }
    },
    [cards, handleMoveCardToGroup, parsedSearch.groupBy, projectId, queryClient],
  )

  const handleMoveSelectedTasksToGroup = useCallback(async (cardIds: string[], targetGroupId: string | null) => {
    await moveCardsToGroupSequentially({
      cardIds,
      moveCardToGroup: handleMoveCardToGroup,
      targetGroupId,
    })
  }, [handleMoveCardToGroup])

  const tableMoveTask = canEditProject && (parsedSearch.groupBy === 'group' || parsedSearch.groupBy === 'status')
    ? handleTableMoveTask
    : undefined

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
          <PersonFilter currentUserId={currentUser.id} onSelectPerson={(userId) => updateSearch({personFilterUserId: userId})} projectMembers={projectMembers} selectedUserId={parsedSearch.personFilterUserId}/>
          <QuickFilterMenu filters={parsedSearch.filters} onFiltersChange={(filters) => updateSearch({filters})} priorityOptions={project.priorityOptions} statusOptions={project.statusOptions}/>
          <SortMenu onSortChange={(sort) => updateSearch({sort})} sort={parsedSearch.sort} sortFieldOptions={sortFieldOptions}/>
        </ToolbarPortal>

        <ToolbarPortal slot='trailing'>
          <div className='flex items-center gap-2'>
            <GroupByMenu
              groupBy={parsedSearch.groupBy}
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
      <div className={`flex-1 bg-canvas ${!activeSearchValue ? 'flex min-h-0 flex-col overflow-hidden px-4 pt-2 pb-4 sm:px-6 sm:pt-3 sm:pb-6' : 'overflow-auto p-4 sm:p-6'}`}>
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
          onCompleteSprint={(sprintId, incompleteCount) => {
            const sprint = projectSprints.find((entry) => entry.id === sprintId)
            if (!sprint) return
            openCompleteSprintDialog({
              incompleteCount,
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
          projectGroups={projectGroups}
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
            groups={projectGroups.map((g) => ({id: g.id, label: g.label}))}
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
