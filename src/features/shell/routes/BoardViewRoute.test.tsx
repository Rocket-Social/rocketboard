/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {act, cleanup, render, waitFor} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import type {ButtonHTMLAttributes, InputHTMLAttributes, ReactNode} from 'react'
import {useState} from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {ToastProvider} from '../../../components/ui/toast'

const {
  navigateMock,
  personalBoardConfigState,
  projectDataState,
  routerState,
  searchPipelineState,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  personalBoardConfigState: {
    current: null as Record<string, unknown> | null,
  },
  projectDataState: {
    current: null as Record<string, unknown> | null,
  },
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
      visibleCards: [],
    },
  },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useParams: () => ({viewId: 'view-1'}),
  useSearch: () => routerState.search,
}))

vi.mock('../../../app/lazyWithRetry', () => ({
  lazyWithRetry: vi.fn(() =>
    function MockLazySurface() {
      return <div data-testid='board-view'/>
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

vi.mock('../../../components/ui/dropdown-menu', () => ({
  DropdownMenu: ({children}: {children: ReactNode}) => <div>{children}</div>,
  DropdownMenuContent: ({children}: {children: ReactNode}) => <div>{children}</div>,
  DropdownMenuItem: ({children}: {children: ReactNode}) => <div>{children}</div>,
  DropdownMenuTrigger: ({children}: {children: ReactNode}) => <div>{children}</div>,
}))

vi.mock('../../../components/ui/input', () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props}/>,
}))

vi.mock('../../cards/card-view-mappers', () => ({
  buildBoardTasks: () => ({
    lanes: [],
    tasksByColumn: {},
  }),
  formatCardStatusLabel: () => 'Todo',
}))

vi.mock('../../cards/card-sorting', () => ({
  applyTableViewDraftToCards: (cards: unknown[]) => cards,
  sortCards: (cards: unknown[]) => cards,
}))

vi.mock('../../cards/card.queries', () => ({
  runMoveCardMutation: vi.fn(),
}))

vi.mock('../../cards/useActionHistory', () => ({
  useActionHistory: () => ({
    canRedo: false,
    canUndo: false,
    clear: vi.fn(),
    errorMessage: null,
    isPending: false,
    lastActionDescription: null,
    push: vi.fn(),
    redo: vi.fn(),
    undo: vi.fn(),
  }),
}))

vi.mock('../../../lib/dom', () => ({
  isEditableEventTarget: () => false,
}))

vi.mock('../../projects/personal-view-storage', () => ({
  getPersonalBoardViewConfigFromStorage: () => personalBoardConfigState.current,
  setPersonalBoardViewConfigToStorage: vi.fn(),
}))

vi.mock('../../search/ProjectSearchPanel', () => ({
  ProjectSearchPanel: () => <div data-testid='project-search-panel'/>,
}))

vi.mock('../project/ProjectChromeContext', () => ({
  useProjectChrome: () => ({
    canEditProject: false,
    currentUser: {id: 'user-1', name: 'Ada Lovelace'},
    mode: 'app',
    project: {
      builtinFieldLabels: {},
      priorityOptions: [],
      statusOptions: [{id: 'todo', label: 'Todo'}],
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
    openCard: vi.fn(),
    openCardComposer: vi.fn(),
    setSurfaceActionError: vi.fn(),
    surfaceActionError: null,
  }),
}))

vi.mock('../ProjectTaskModeControl', () => ({
  ProjectTaskModeControl: () => <div data-testid='task-mode-control'/>,
}))

vi.mock('../ToolbarSlot', () => ({
  ToolbarPortal: ({children}: {children: ReactNode}) => <>{children}</>,
}))

vi.mock('../PersonFilter', () => ({
  PersonFilter: () => <div data-testid='person-filter'/>,
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

vi.mock('../views/ViewSkeletons', () => ({
  ViewSkeleton: () => <div data-testid='view-skeleton'/>,
}))

vi.mock('../hooks/useAutoSavePersonalConfig', () => ({
  useAutoSavePersonalConfig: vi.fn(),
}))

vi.mock('../hooks/useLocalStorageSync', () => ({
  useLocalStorageSync: vi.fn(),
}))

vi.mock('../../projects/table-view-fields', () => ({
  listTableSortFieldOptions: () => [],
}))

vi.mock('../hooks/useViewSearchPipeline', () => ({
  useViewSearchPipeline: () => searchPipelineState.current,
}))

import {BoardViewRoute} from './BoardViewRoute'

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
        <ToastProvider>
          <BoardViewRoute/>
        </ToastProvider>
      </QueryClientProvider>
    )
  }

  return render(<RouteHarness/>)
}

describe('BoardViewRoute', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    navigateMock.mockImplementation(async ({search}: {search: () => Record<string, unknown>}) => {
      await act(async () => {
        routerState.setSearch(search())
      })
    })

    routerState.search = {}
    routerState.setSearch = () => {}

    personalBoardConfigState.current = {
      collapsedColumnIds: [],
      dateRange: {endDate: null, preset: 'this_week', startDate: null},
      filters: {priority: [], status: []},
      personFilterUserId: null,
      sprintIds: ['sprint-old'],
      sort: [{direction: 'desc', fieldKey: 'priority'}],
    }

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
      displayProjectSprintsInferred: false,
      handleMoveCardToSprint: vi.fn(),
      projectGroups: [],
      projectSprints,
      projectSprintsUnavailable: false,
      projectTaskMode: 'sprint',
      projectTaskModeReady: true,
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('restores the saved sprint scope before applying the current-sprint default', async () => {
    renderRoute()

    await waitFor(() => expect(routerState.search).toEqual({
      sort: 'priority:desc',
      sprints: 'sprint-old',
    }))

    expect(navigateMock).toHaveBeenCalledTimes(1)
  })
})
