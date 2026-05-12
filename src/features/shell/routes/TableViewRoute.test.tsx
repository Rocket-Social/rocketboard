/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {act, cleanup, render, screen, waitFor} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import type {ButtonHTMLAttributes, InputHTMLAttributes, ReactNode} from 'react'
import {useState} from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import type {CardRecord} from '../../cards/card.types'

const {
  buildTableGroupsMock,
  navigateMock,
  personalTableConfigState,
  projectDataState,
  projectPriorityOptions,
  projectStatusOptions,
  routerState,
  searchPipelineState,
  sortCardsMock,
  toastMock,
} = vi.hoisted(() => ({
  buildTableGroupsMock: vi.fn((..._args: unknown[]): unknown[] => []),
  navigateMock: vi.fn(),
  personalTableConfigState: {
    current: null as Record<string, unknown> | null,
  },
  projectDataState: {
    current: null as Record<string, unknown> | null,
  },
  projectPriorityOptions: [
    {color: 'red', id: 'prio-urgent', isDefault: false, key: 'urgent', label: 'Urgent', sortOrder: 0},
    {color: 'amber', id: 'prio-high', isDefault: false, key: 'high', label: 'High', sortOrder: 1},
  ],
  projectStatusOptions: [
    {category: 'not_started', color: null, id: 'todo', isDefault: true, key: 'todo', label: 'Todo', position: 0},
  ],
  routerState: {
    search: {} as Record<string, unknown>,
    setSearch: (_nextSearch: Record<string, unknown>) => {},
  },
  searchPipelineState: {
    current: {
      activeSearchValue: '',
      searchOpen: false,
      searchQuery: {data: null, error: null, isPending: false},
      searchValue: '',
      setSearchOpen: vi.fn(),
      setSearchValue: vi.fn(),
      visibleCards: [] as CardRecord[],
    },
  },
  sortCardsMock: vi.fn((cards: unknown[]) => cards),
  toastMock: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useParams: () => ({viewId: 'view-1'}),
  useSearch: () => routerState.search,
}))

vi.mock('../../../app/lazyWithRetry', () => ({
  lazyWithRetry: vi.fn(() =>
    function MockLazySurface() {
      return <div data-testid='table-view'/>
    },
  ),
}))

vi.mock('../../../components/ui/button', () => ({
  Button: ({children, ...props}: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} type={props.type ?? 'button'}>
      {children}
    </button>
  ),
}))

vi.mock('../../../components/ui/confirm-dialog', () => ({
  ConfirmDialog: () => null,
}))

vi.mock('../../../hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    confirm: vi.fn(),
    confirmDialogProps: null,
  }),
}))

vi.mock('../../../components/ui/dropdown-menu', () => ({
  DropdownMenu: ({children}: {children: ReactNode}) => <div>{children}</div>,
  DropdownMenuContent: ({children}: {children: ReactNode}) => <div>{children}</div>,
  DropdownMenuItem: ({children}: {children: ReactNode}) => <div>{children}</div>,
  DropdownMenuTrigger: ({children}: {children: ReactNode}) => <div>{children}</div>,
}))

vi.mock('../../../components/ui/input', () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props}/>,
}))

vi.mock('../../../components/ui/toast', () => ({
  useToast: () => ({toast: toastMock}),
}))

vi.mock('../../cards/card-view-mappers', () => ({
  buildTableGroups: buildTableGroupsMock,
  getDefaultStatusOption: () => ({id: 'todo'}),
}))

vi.mock('../../cards/card-sorting', () => ({
  applyTableViewDraftToCards: (cards: unknown[]) => cards,
  sortCards: sortCardsMock,
}))

vi.mock('../../cards/card.queries', () => ({
  runArchiveCardsMutation: vi.fn(),
  runCreateCardMutation: vi.fn(),
  runDuplicateCardsMutation: vi.fn(),
  runMoveCardMutation: vi.fn(),
  runRestoreCardsMutation: vi.fn(),
  runTrashCardsMutation: vi.fn(),
  runUnarchiveCardsMutation: vi.fn(),
}))

vi.mock('../../../lib/dom', () => ({
  isEditableEventTarget: () => false,
}))

vi.mock('../../projects/personal-view-storage', () => ({
  getPersonalTableViewConfigFromStorage: () => personalTableConfigState.current,
  setPersonalTableViewConfigToStorage: vi.fn(),
}))

vi.mock('../../projects/project-view.queries', () => ({
  useSetTablePersonalLayoutMutation: () => ({mutate: vi.fn()}),
  useSetTableSharedConfigMutation: () => ({mutate: vi.fn()}),
}))

vi.mock('../../projects/project-data.cache', () => ({
  patchProjectCards: vi.fn(),
  patchProjectGroups: vi.fn(),
}))

vi.mock('../../projects/project-group.repository', () => ({
  projectGroupRepository: {
    deleteGroup: vi.fn(),
    renameGroup: vi.fn(),
    reorderGroups: vi.fn(),
  },
}))

vi.mock('../../projects/table-view-fields', () => ({
  listTableSortFieldOptions: () => [],
}))

vi.mock('../../fields/field.queries', () => ({
  useCreateCustomFieldMutation: () => ({mutate: vi.fn()}),
  useSetCardCustomFieldValueMutation: () => ({mutateAsync: vi.fn()}),
}))

vi.mock('../../search/ProjectSearchPanel', () => ({
  ProjectSearchPanel: () => <div data-testid='project-search-panel'/>,
}))

vi.mock('../project/ProjectChromeContext', () => ({
  useProjectChrome: () => ({
    canEditProject: false,
    currentUser: {id: 'user-1', name: 'Ada Lovelace'},
    invalidateProjectData: vi.fn(),
    mode: 'app',
    project: {
      builtinFieldLabels: {},
      priorityOptions: projectPriorityOptions,
      statusOptions: projectStatusOptions,
    },
    projectId: 'project-1',
    projectMembers: [],
  }),
}))

vi.mock('../project/ProjectDataContext', () => ({
  useProjectData: () => projectDataState.current,
}))

vi.mock('../project/ProjectDialogContext', () => ({
  useProjectDialogs: () => ({
    isCardSheetOpen: false,
    openCard: vi.fn(),
    openCardComposer: vi.fn(),
    openCompleteSprintDialog: vi.fn(),
    openCreateSprintDialog: vi.fn(),
    openEditSprintDialog: vi.fn(),
    renameSprint: vi.fn(),
    selectedCardId: null,
    startSprint: vi.fn(),
    surfaceActionError: null,
  }),
}))

vi.mock('../GroupByMenu', () => ({
  GroupByMenu: () => <div data-testid='group-by-menu'/>,
}))

vi.mock('../PersonFilter', () => ({
  PersonFilter: () => <div data-testid='person-filter'/>,
}))

vi.mock('../ProjectTaskModeControl', () => ({
  ProjectTaskModeControl: () => <div data-testid='task-mode-control'/>,
}))

vi.mock('../QuickFilterMenu', () => ({
  QuickFilterMenu: () => <div data-testid='quick-filter-menu'/>,
}))

vi.mock('../SortMenu', () => ({
  SortMenu: () => <div data-testid='sort-menu'/>,
}))

vi.mock('../TaskScopeToolbarControl', () => ({
  TaskScopeToolbarControl: () => <div data-testid='task-scope-control'/>,
}))

vi.mock('../ToolbarSlot', () => ({
  ToolbarPortal: ({children}: {children: ReactNode}) => <>{children}</>,
}))

vi.mock('../views/ViewSkeletons', () => ({
  ViewSkeleton: () => <div data-testid='view-skeleton'/>,
}))

vi.mock('../hooks/useAutoSavePersonalConfig', () => ({
  useAutoSavePersonalConfig: vi.fn(),
}))

vi.mock('../hooks/useLocalStorageSync', () => ({
  useLocalStorageSync: vi.fn(),
}))

vi.mock('../hooks/useViewSearchPipeline', () => ({
  useViewSearchPipeline: () => searchPipelineState.current,
}))

vi.mock('./table-bulk-actions', () => ({
  moveCardsToGroupSequentially: vi.fn(),
}))

vi.mock('./table-selection', () => ({
  getVisibleTableTaskIds: () => [],
  toggleTableTaskSelection: (_selected: string[], _taskId: string) => [],
}))

import {TableViewRoute} from './TableViewRoute'
import {dispatchSprintCompletedEvent, sprintCompletedEventName} from '../sprint-completion-events'

function buildSprint(overrides: Record<string, unknown>) {
  return {
    completedAt: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    endDate: '2026-03-14',
    goal: null,
    id: 'sprint',
    name: 'Sprint',
    position: 0,
    projectId: 'project-1',
    startDate: '2026-03-01',
    status: 'planned',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  }
}

function buildCard(overrides: Record<string, unknown> = {}) {
  return {
    assigneeName: 'Ada Lovelace',
    assigneeUserId: 'user-1',
    completedAt: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    customFieldValues: {},
    dueAt: null,
    effort: null,
    groupId: null,
    groupPosition: 0,
    id: 'card-1',
    initiativeId: null,
    priorityOptionId: null,
    projectId: 'project-1',
    sprintId: 'sprint-old',
    startAt: null,
    statusOptionId: 'todo',
    statusPosition: 0,
    tags: [],
    title: 'Assigned task',
    ...overrides,
  }
}

function buildDomRect({
  height,
  left,
  top,
  width,
}: {
  height: number
  left: number
  top: number
  width: number
}): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    toJSON: () => ({}),
    top,
    width,
    x: left,
    y: top,
  } as DOMRect
}

function renderRoute() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {retry: false},
    },
  })

  function RouteHarness() {
    const [search, setSearch] = useState(routerState.search)
    routerState.search = search
    routerState.setSearch = setSearch

    return (
      <QueryClientProvider client={queryClient}>
        <TableViewRoute/>
      </QueryClientProvider>
    )
  }

  return render(<RouteHarness/>)
}

describe('TableViewRoute', () => {
  beforeEach(() => {
    buildTableGroupsMock.mockReset()
    buildTableGroupsMock.mockReturnValue([])
    navigateMock.mockReset()
    sortCardsMock.mockReset()
    sortCardsMock.mockImplementation((cards: unknown[]) => cards)
    toastMock.mockReset()
    navigateMock.mockImplementation(async ({search}: {search: () => Record<string, unknown>}) => {
      await act(async () => {
        routerState.setSearch(search())
      })
    })

    routerState.search = {}
    routerState.setSearch = () => {}

    personalTableConfigState.current = null

    const projectSprints = [
      buildSprint({
        endDate: '2026-03-14',
        id: 'sprint-old',
        name: 'Sprint 8',
        startDate: '2026-03-01',
        status: 'completed',
      }),
      buildSprint({
        endDate: '2026-03-28',
        id: 'sprint-current',
        name: 'Sprint 9',
        position: 1,
        startDate: '2026-03-15',
        status: 'active',
      }),
    ]

    projectDataState.current = {
      cards: [],
      customFields: [],
      displayProjectSprints: projectSprints,
      handleMoveCardToGroup: vi.fn(),
      handleMoveCardToSprint: vi.fn(),
      projectGroups: [],
      projectSprints,
      projectSprintsUnavailable: false,
      projectTaskMode: 'sprint',
      projectTaskModeReady: true,
      projectViewBackendUnavailable: false,
      tableViewStates: {},
      tableViewStatesReady: true,
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('applies the current sprint on a fresh table view after the baseline query settles without a saved row', async () => {
    renderRoute()

    await waitFor(() => expect(routerState.search).toEqual({
      sprints: 'sprint-current',
    }))

    expect(navigateMock).toHaveBeenCalledTimes(1)
  })

  it('switches the sprint picker to the new current sprint after sprint completion', async () => {
    routerState.search = {sprints: 'sprint-old'}
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function getMockRect(this: HTMLElement) {
        const element = this
        if (element.querySelector('[data-testid="task-scope-control"]')) {
          return buildDomRect({
            height: 34,
            left: 656,
            top: 88,
            width: 160,
          })
        }

        return buildDomRect({
          height: 0,
          left: 0,
          top: 0,
          width: 0,
        })
      })

    try {
      renderRoute()

      await act(async () => {
        dispatchSprintCompletedEvent({
          completedSprintId: 'sprint-old',
          currentSprintId: 'sprint-current',
          currentSprintName: 'Sprint 9',
          projectId: 'project-1',
        })
      })

      await waitFor(() => expect(routerState.search).toEqual({
        sprints: 'sprint-current',
      }))
      const nudge = screen.getByTestId('sprint-picker-nudge')
      expect(nudge).toBeInTheDocument()
      expect(nudge).toHaveClass('z-40')
      const toast = screen.getByTestId('sprint-picker-nudge-toast')
      expect(toast).toHaveClass('top-4')
      expect(toast).toHaveClass('left-1/2')
      expect(toast).toHaveClass('-translate-x-1/2')
      expect(toast).toHaveClass('bg-slate-950')
      expect(toast).toHaveTextContent('A new sprint has started (Sprint 9)')
      expect(toast).toHaveTextContent('Click on the sprint picker to view past sprints.')
      await waitFor(() => expect(screen.getByTestId('sprint-picker-nudge-arrow')).toHaveStyle({
        left: '736px',
        top: '22px',
      }))
      expect(screen.getByTestId('sprint-picker-nudge-arrow-icon')).toHaveClass('lucide-arrow-down')
      expect(screen.getByTestId('task-scope-control').parentElement).toContainElement(nudge)
      expect(screen.getByTestId('group-by-menu')).not.toContainElement(nudge)
    } finally {
      rectSpy.mockRestore()
    }
  })

  it('does not switch away from an unrelated selected sprint after a same-project sprint completion', async () => {
    routerState.search = {sprints: 'sprint-other'}
    const projectSprints = [
      ...(projectDataState.current!.projectSprints as Array<Record<string, unknown>>),
      buildSprint({
        endDate: '2026-04-11',
        id: 'sprint-other',
        name: 'Sprint 10',
        position: 2,
        startDate: '2026-03-29',
        status: 'completed',
      }),
    ]
    projectDataState.current = {
      ...projectDataState.current,
      displayProjectSprints: projectSprints,
      projectSprints,
    }

    renderRoute()

    await act(async () => {
      dispatchSprintCompletedEvent({
        completedSprintId: 'sprint-old',
        currentSprintId: 'sprint-current',
        currentSprintName: 'Sprint 9',
        projectId: 'project-1',
      })
    })

    expect(routerState.search).toEqual({
      sprints: 'sprint-other',
    })
    expect(screen.queryByTestId('sprint-picker-nudge')).not.toBeInTheDocument()
  })

  it('shows the completion nudge for this view even if optimistic sprint data already moved the picker', async () => {
    routerState.search = {sprints: 'sprint-current'}

    renderRoute()

    await act(async () => {
      dispatchSprintCompletedEvent({
        completedSprintId: 'sprint-old',
        currentSprintId: 'sprint-current',
        currentSprintName: 'Sprint 9',
        projectId: 'project-1',
        sourceViewId: 'view-1',
      })
    })

    await waitFor(() => expect(screen.getByTestId('sprint-picker-nudge')).toBeInTheDocument())
    expect(screen.getByTestId('sprint-picker-nudge-toast')).toHaveTextContent('A new sprint has started (Sprint 9)')
    expect(routerState.search).toEqual({
      sprints: 'sprint-current',
    })
  })

  it('ignores malformed or unknown sprint completion events', async () => {
    routerState.search = {sprints: 'sprint-old'}

    renderRoute()

    await act(async () => {
      window.dispatchEvent(new Event(sprintCompletedEventName))
      dispatchSprintCompletedEvent({
        completedSprintId: 'other-sprint',
        currentSprintId: 'missing-sprint',
        currentSprintName: 'Missing Sprint',
        projectId: 'project-1',
      })
    })

    expect(routerState.search).toEqual({
      sprints: 'sprint-old',
    })
    expect(screen.queryByTestId('sprint-picker-nudge')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sprint-picker-nudge-toast')).not.toBeInTheDocument()
  })

  it('handles created-next-sprint events before the sprint list refreshes', async () => {
    routerState.search = {sprints: 'sprint-old'}

    renderRoute()

    await act(async () => {
      dispatchSprintCompletedEvent({
        completedSprintId: 'sprint-old',
        currentSprintId: 'sprint-created',
        currentSprintName: 'Sprint 10',
        projectId: 'project-1',
      })
    })

    await waitFor(() => expect(routerState.search).toEqual({
      sprints: 'sprint-created',
    }))
    expect(screen.getByTestId('sprint-picker-nudge')).toBeInTheDocument()
    expect(screen.getByTestId('sprint-picker-nudge-toast')).toHaveTextContent('A new sprint has started (Sprint 10)')
  })

  it('passes multi-selected sprints to table grouping in reverse chronological order', () => {
    routerState.search = {sprints: 'sprint-current,sprint-old,sprint-previous'}
    const projectSprints = [
      buildSprint({
        endDate: '2026-04-18',
        id: 'sprint-old',
        name: 'Sprint 1',
        startDate: '2026-04-12',
        status: 'completed',
      }),
      buildSprint({
        endDate: '2026-05-02',
        id: 'sprint-current',
        name: 'Sprint 3',
        position: 2,
        startDate: '2026-04-26',
        status: 'active',
      }),
      buildSprint({
        endDate: '2026-04-25',
        id: 'sprint-previous',
        name: 'Sprint 2',
        position: 1,
        startDate: '2026-04-19',
        status: 'completed',
      }),
    ]
    projectDataState.current = {
      ...projectDataState.current,
      displayProjectSprints: projectSprints,
      projectSprints,
    }

    renderRoute()

    const calls = buildTableGroupsMock.mock.calls
    const latestCall = calls[calls.length - 1]!
    const groupedSprints = latestCall[6] as Array<{id: string}>
    expect(groupedSprints.map((sprint) => sprint.id)).toEqual([
      'sprint-current',
      'sprint-previous',
      'sprint-old',
    ])
    expect(latestCall[8]).toEqual({sprintOrder: 'input'})
  })

  it('keeps backlog cards in the table when a sprint scope is selected', () => {
    routerState.search = {sprints: 'sprint-current'}
    const currentSprintCard = buildCard({id: 'card-current', sprintId: 'sprint-current'})
    const backlogCard = buildCard({id: 'card-backlog', sprintId: null})
    const otherSprintCard = buildCard({id: 'card-old', sprintId: 'sprint-old'})
    const visibleCards = [currentSprintCard, backlogCard, otherSprintCard]
    projectDataState.current = {
      ...projectDataState.current,
      cards: visibleCards,
    }
    searchPipelineState.current = {
      ...searchPipelineState.current,
      visibleCards,
    }

    renderRoute()

    const latestCall = buildTableGroupsMock.mock.calls.at(-1)!
    const groupedCards = latestCall[0] as Array<{id: string}>
    expect(groupedCards.map((card) => card.id)).toEqual(['card-current', 'card-backlog'])
  })

  it('passes project option metadata when sorting the default flat table group', () => {
    routerState.search = {sort: 'priority:desc'}
    projectDataState.current = {
      ...projectDataState.current,
      projectTaskMode: 'standard',
    }
    const urgentCard = buildCard({id: 'urgent-card', priorityOptionId: 'prio-urgent'})
    const highCard = buildCard({id: 'high-card', priorityOptionId: 'prio-high'})
    buildTableGroupsMock.mockReturnValue([{
      expanded: true,
      id: '__flat',
      kind: 'flat',
      level: 0,
      tasks: [
        {card: highCard, id: highCard.id, title: highCard.title},
        {card: urgentCard, id: urgentCard.id, title: urgentCard.title},
      ],
      title: '',
    }])

    renderRoute()

    expect(sortCardsMock).toHaveBeenCalled()
    expect(sortCardsMock).toHaveBeenLastCalledWith(
      [highCard, urgentCard],
      [{direction: 'desc', fieldKey: 'priority'}],
      [],
      expect.objectContaining({
        priorityOptions: projectPriorityOptions,
        statusOptions: projectStatusOptions,
      }),
    )
  })

  it('defaults assignees with a stale previous sprint selection to the new current sprint on arrival', async () => {
    routerState.search = {sprints: 'sprint-old'}
    projectDataState.current = {
      ...projectDataState.current,
      cards: [buildCard({sprintId: 'sprint-current'})],
    }

    renderRoute()

    await waitFor(() => expect(routerState.search).toEqual({
      sprints: 'sprint-current',
    }))

    expect(screen.getByTestId('sprint-picker-nudge')).toBeInTheDocument()
    expect(screen.getByTestId('sprint-picker-nudge-toast')).toHaveTextContent('A new sprint has started (Sprint 9)')
    expect(toastMock).not.toHaveBeenCalled()
  })

  it('handles a later sprint rotation in the same mounted table view', async () => {
    routerState.search = {sprints: 'sprint-old'}
    projectDataState.current = {
      ...projectDataState.current,
      cards: [buildCard({sprintId: 'sprint-current'})],
    }

    renderRoute()

    await waitFor(() => expect(routerState.search).toEqual({
      sprints: 'sprint-current',
    }))

    const nextProjectSprints = [
      buildSprint({
        completedAt: '2026-03-28T00:00:00.000Z',
        endDate: '2026-03-28',
        id: 'sprint-current',
        name: 'Sprint 9',
        position: 1,
        startDate: '2026-03-15',
        status: 'completed',
      }),
      buildSprint({
        endDate: '2026-04-11',
        id: 'sprint-next',
        name: 'Sprint 10',
        position: 2,
        startDate: '2026-03-29',
        status: 'active',
      }),
    ]
    projectDataState.current = {
      ...projectDataState.current,
      cards: [buildCard({sprintId: 'sprint-next'})],
      displayProjectSprints: nextProjectSprints,
      projectSprints: nextProjectSprints,
    }

    await act(async () => {
      routerState.setSearch({sprints: 'sprint-current'})
    })

    await waitFor(() => expect(routerState.search).toEqual({
      sprints: 'sprint-next',
    }))
    expect(screen.getByTestId('sprint-picker-nudge-toast')).toHaveTextContent('A new sprint has started (Sprint 10)')
    expect(toastMock).not.toHaveBeenCalled()
  })

  it('nudges assignees with no saved sprint selection when a new current sprint exists', async () => {
    projectDataState.current = {
      ...projectDataState.current,
      cards: [buildCard({sprintId: 'sprint-old'})],
    }

    renderRoute()

    await waitFor(() => expect(routerState.search).toEqual({
      sprints: 'sprint-current',
    }))

    expect(screen.getByTestId('sprint-picker-nudge')).toBeInTheDocument()
    expect(screen.getByTestId('sprint-picker-nudge-toast')).toHaveTextContent('A new sprint has started (Sprint 9)')
    expect(toastMock).not.toHaveBeenCalled()
  })
})
