/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {QueryClientProvider} from '@tanstack/react-query'
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import type {ComponentProps} from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createTestQueryClient} from '../../test/queryClient'
import type {SessionUser} from '../auth/data'
import type {InitiativeRecord} from '../initiatives/initiative.types'
import {plainTextToRichTextDocument} from '../rich-text/rich-text'
import {CardSheet} from './CardSheet'
import type {CardDetail, CardRecord, ProjectPriorityOption, ProjectStatusOption} from './card.types'

type MutationOptions = {
  onError?: () => void
  onSuccess?: (card: CardRecord) => void
}

function buildMockRichTextDocument(value: string) {
  if (!value.trim()) {
    return {
      content: [{type: 'paragraph'}],
      type: 'doc',
    }
  }

  return {
    content: value.split('\n').map((line) =>
      line
        ? {content: [{text: line, type: 'text'}], type: 'paragraph'}
        : {type: 'paragraph'},
    ),
    type: 'doc',
  }
}

function mockRichTextToPlainText(value: unknown): string {
  if (!value || typeof value !== 'object' || !Array.isArray((value as {content?: unknown[]}).content)) {
    return ''
  }

  return ((value as {content: Array<{content?: Array<{text?: string}>}>}).content ?? [])
    .map((node) => (node.content ?? []).map((entry) => entry.text ?? '').join(''))
    .join('\n\n')
}

const cardSheetMockState = vi.hoisted(() => {
  const state = {
    capturedAssigneeUpdate: null as {input: unknown; options: MutationOptions} | null,
    capturedCreate: null as {input: unknown; options: MutationOptions} | null,
    capturedUpdate: null as {input: unknown; options: MutationOptions} | null,
    detail: null as CardDetail | null,
  }

  return {
    assigneeMutation: {
      error: null,
      isPending: false,
      mutate: vi.fn((input: unknown, options: MutationOptions) => {
        state.capturedAssigneeUpdate = {input, options}
      }),
    },
    createMutation: {
      error: null,
      isPending: false,
      mutate: vi.fn((input: unknown, options: MutationOptions) => {
        state.capturedCreate = {input, options}
      }),
    },
    state,
    updateMutation: {
      error: null,
      isPending: false,
      mutate: vi.fn((input: unknown, options: MutationOptions) => {
        state.capturedUpdate = {input, options}
      }),
    },
  }
})

function createIdleMutation() {
  return {
    error: null,
    isPending: false,
    mutate: vi.fn(),
  }
}

vi.mock('./CardActivityLog', () => ({
  CardActivityLog: () => <div data-testid='card-activity-log' />,
}))

vi.mock('./card.realtime', () => ({
  useCardCommentsRealtime: vi.fn(),
}))

// Phase 4 PR 4-B — stub the new hooks so the test doesn't hit Supabase
// or the missing ToastProvider.
vi.mock('../ai/ai.queries', () => ({
  useAssignablePersonasForProjectQuery: () => ({data: [], isPending: false}),
  useUndoCancelAgentRunMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}))

vi.mock('../../components/ui/toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
    dismiss: vi.fn(),
  }),
}))

vi.mock('../github/components/CardGitHubSection', () => ({
  CardGitHubSection: () => <div data-testid='card-github-section' />,
}))

vi.mock('../fields/field.queries', () => ({
  useSetCardCustomFieldValueMutation: () => createIdleMutation(),
}))

const actionHistoryMockState = vi.hoisted(() => ({
  clear: vi.fn(),
  push: vi.fn(),
  redo: vi.fn(),
  undo: vi.fn(),
}))

vi.mock('./useActionHistory', () => ({
  useActionHistory: () => ({
    canRedo: false,
    canUndo: false,
    clear: actionHistoryMockState.clear,
    errorMessage: null,
    isPending: false,
    lastActionDescription: null,
    push: actionHistoryMockState.push,
    redo: actionHistoryMockState.redo,
    undo: actionHistoryMockState.undo,
  }),
}))

vi.mock('../rich-text/RichTextEditor', () => ({
  RichTextEditor: ({
    onChange,
    value,
  }: {
    onChange?: (value: ReturnType<typeof buildMockRichTextDocument>) => void
    value: unknown
  }) => (
    <textarea
      aria-label='Description'
      data-testid='rich-text-editor'
      onChange={(event) => onChange?.(buildMockRichTextDocument(event.target.value))}
      value={mockRichTextToPlainText(value)}
    />
  ),
}))

vi.mock('./card.queries', () => ({
  runSetCardAssigneeMutation: vi.fn(),
  runUpdateCardMutation: vi.fn(),
  useAddCardCommentMutation: () => createIdleMutation(),
  useCardDetailQuery: () => ({
    data: cardSheetMockState.state.detail,
    error: null,
    isPending: false,
  }),
  useCreateCardMutation: () => cardSheetMockState.createMutation,
  useSetCardAssigneeMutation: () => cardSheetMockState.assigneeMutation,
  useUpdateCardMutation: () => cardSheetMockState.updateMutation,
  useUploadCardAttachmentMutation: () => createIdleMutation(),
}))

const initiativeQueriesMockState = vi.hoisted(() => ({
  getWorkspaceInitiatives: vi.fn(),
}))

vi.mock('../initiatives/initiative.queries', () => ({
  workspaceInitiativesQueryOptions: (workspaceId: string) => ({
    enabled: !!workspaceId,
    queryFn: () => initiativeQueriesMockState.getWorkspaceInitiatives(workspaceId),
    queryKey: ['workspace-initiatives', workspaceId],
    staleTime: 30_000,
  }),
}))

const currentUser: SessionUser = {
  email: 'alex@example.com',
  githubLogin: null,
  id: 'user-1',
  initials: 'AL',
  isInternalAdmin: false,
  name: 'Alex Lane',
  weekStartsOn: 'sunday',
}

const projectMembers = [
  {
    email: currentUser.email,
    githubLogin: null,
    id: currentUser.id,
    name: currentUser.name,
    role: 'member' as const,
  },
  {
    email: 'taylor@example.com',
    githubLogin: null,
    id: 'user-2',
    name: 'Taylor Chen',
    role: 'member' as const,
  },
]

const priorityOptions: ProjectPriorityOption[] = []
const statusOptions: ProjectStatusOption[] = [
  {
    category: 'not_started',
    color: null,
    id: 'status-1',
    isDefault: true,
    key: 'todo',
    label: 'To Do',
    position: 0,
  },
]

function makeInitiativeRecord(overrides: Partial<InitiativeRecord> = {}): InitiativeRecord {
  return {
    createdAt: '2026-03-01T00:00:00.000Z',
    description: null,
    health: 'on_track',
    id: 'initiative-1',
    latestUpdateAt: null,
    latestUpdateText: null,
    leadName: null,
    leadUserId: null,
    name: 'D1 Retention > 35%',
    position: 0,
    status: 'active',
    targetDate: null,
    updatedAt: '2026-03-01T00:00:00.000Z',
    visibility: 'open',
    workspaceId: 'workspace-1',
    ...overrides,
  }
}

const defaultWorkspaceInitiatives = [
  makeInitiativeRecord(),
  makeInitiativeRecord({
    id: 'initiative-2',
    name: 'Onboarding Activation',
    position: 1,
    status: 'planned',
  }),
]

function makeCardRecord(bodyMd: string): CardRecord {
  return {
    assigneeName: 'Alex Lane',
    assigneeUserId: currentUser.id,
    bodyJson: plainTextToRichTextDocument(bodyMd),
    bodyMd,
    cardRef: null,
    completedAt: null,
    createdAt: '2026-04-01T17:30:00.000Z',
    customFieldValues: {},
    dueAt: null,
    effort: 3,
    groupId: null,
    groupPosition: 0,
    id: 'card-1',
    initiativeId: null,
    priorityOptionId: null,
    projectCardNumber: 1,
    projectId: 'project-1',
    projectKey: null,
    sprintId: null,
    startAt: null,
    statusOptionId: 'status-1',
    statusPosition: 0,
    tags: [],
    title: 'Rocketboard MVP feature complete',
  }
}

function makeCardDetail(bodyMd: string): CardDetail {
  return {
    ...makeCardRecord(bodyMd),
    agentRunSummary: null,
    attachments: [],
    comments: [],
  }
}

function renderCardSheet(
  overrides: Partial<ComponentProps<typeof CardSheet>> = {},
  options: {
    seedWorkspaceInitiatives?: boolean
    workspaceInitiatives?: InitiativeRecord[]
  } = {},
) {
  const queryClient = createTestQueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  const workspaceId = overrides.workspaceId ?? 'workspace-1'

  if (options.seedWorkspaceInitiatives !== false) {
    queryClient.setQueryData(
      ['workspace-initiatives', workspaceId],
      options.workspaceInitiatives ?? [],
    )
  }

  return render(
    <QueryClientProvider client={queryClient}>
      <CardSheet
        cardId='card-1'
        currentUser={currentUser}
        customFields={[]}
        isOpen
        onCardCreated={vi.fn()}
        onClose={vi.fn()}
        priorityOptions={priorityOptions}
        projectId='project-1'
        projectName='Rocketboard'
        statusOptions={statusOptions}
        workspaceId={workspaceId}
        {...overrides}
      />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  actionHistoryMockState.clear.mockReset()
  actionHistoryMockState.push.mockReset()
  actionHistoryMockState.redo.mockReset()
  actionHistoryMockState.undo.mockReset()
  cardSheetMockState.state.capturedAssigneeUpdate = null
  cardSheetMockState.state.capturedCreate = null
  cardSheetMockState.state.capturedUpdate = null
  cardSheetMockState.state.detail = makeCardDetail('Initial body')
  cardSheetMockState.assigneeMutation.mutate.mockClear()
  cardSheetMockState.createMutation.mutate.mockClear()
  cardSheetMockState.updateMutation.mutate.mockClear()
  initiativeQueriesMockState.getWorkspaceInitiatives.mockReset()
  initiativeQueriesMockState.getWorkspaceInitiatives.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('CardSheet autosave', () => {
  it('keeps newer local editor content when an older autosave resolves', () => {
    vi.useFakeTimers()
    renderCardSheet()

    const editor = screen.getByTestId('rich-text-editor')

    fireEvent.change(editor, {target: {value: 'Saved body'}})

    act(() => {
      vi.advanceTimersByTime(1200)
    })

    expect(cardSheetMockState.updateMutation.mutate).toHaveBeenCalledTimes(1)

    fireEvent.change(editor, {target: {value: 'Saved body with newer local edits'}})

    const pendingSave = cardSheetMockState.state.capturedUpdate
    expect(pendingSave).not.toBeNull()

    act(() => {
      pendingSave?.options.onSuccess?.(makeCardRecord('Saved body'))
    })

    expect(screen.getByTestId('rich-text-editor')).toHaveValue('Saved body with newer local edits')
  })

  it('autosaves manual complete date edits in sprint detail layout', () => {
    vi.useFakeTimers()
    cardSheetMockState.state.detail = {
      ...makeCardDetail('Initial body'),
      completedAt: '2026-03-28T09:15:00.000Z',
      sprintId: 'sprint-1',
    }

    renderCardSheet({
      detailLayout: 'sprint',
      projectSprints: [{
        completedAt: null,
        createdAt: '2026-03-01T00:00:00.000Z',
        endDate: '2026-03-30',
        goal: null,
        id: 'sprint-1',
        name: 'Sprint 1',
        position: 0,
        projectId: 'project-1',
        startDate: '2026-03-16',
        status: 'active',
        updatedAt: '2026-03-01T00:00:00.000Z',
      }],
    })

    const completeDateInput = screen.getByDisplayValue('2026-03-28')

    fireEvent.change(completeDateInput, {target: {value: '2026-04-01'}})

    act(() => {
      vi.advanceTimersByTime(1200)
    })

    expect(cardSheetMockState.updateMutation.mutate).toHaveBeenCalledTimes(1)
    expect(cardSheetMockState.state.capturedUpdate?.input).toEqual(
      expect.objectContaining({
        completedAt: '2026-04-01',
      }),
    )
  })

  it('autosaves initiative changes through the shared update mutation', () => {
    vi.useFakeTimers()
    cardSheetMockState.state.detail = {
      ...makeCardDetail('Initial body'),
      initiativeId: 'initiative-1',
    }

    renderCardSheet({}, {workspaceInitiatives: defaultWorkspaceInitiatives})

    const initiativeSelect = screen.getByDisplayValue('D1 Retention > 35%')

    fireEvent.change(initiativeSelect, {target: {value: 'initiative-2'}})

    act(() => {
      vi.advanceTimersByTime(1200)
    })

    expect(cardSheetMockState.updateMutation.mutate).toHaveBeenCalledTimes(1)
    expect(cardSheetMockState.state.capturedUpdate?.input).toEqual(
      expect.objectContaining({
        initiativeId: 'initiative-2',
      }),
    )
  })

  it('persists initiative selection when creating a new task', () => {
    renderCardSheet({cardId: null}, {workspaceInitiatives: defaultWorkspaceInitiatives})

    fireEvent.change(screen.getByPlaceholderText('What needs to happen next?'), {
      target: {value: 'Prepare launch checklist'},
    })
    fireEvent.change(screen.getByLabelText('Initiative'), {
      target: {value: 'initiative-2'},
    })
    fireEvent.click(screen.getByRole('button', {name: /create task/i}))

    expect(cardSheetMockState.createMutation.mutate).toHaveBeenCalledTimes(1)
    expect(cardSheetMockState.state.capturedCreate?.input).toEqual(
      expect.objectContaining({
        initiativeId: 'initiative-2',
        projectId: 'project-1',
        title: 'Prepare launch checklist',
      }),
    )
  })

  it('shows a loading placeholder while planning initiatives are fetching', () => {
    initiativeQueriesMockState.getWorkspaceInitiatives.mockImplementationOnce(() => new Promise(() => undefined))

    renderCardSheet({}, {seedWorkspaceInitiatives: false})

    expect(screen.getByLabelText('Initiative')).toBeDisabled()
    expect(screen.getByRole('option', {name: 'Loading initiatives...'})).toBeInTheDocument()
  })

  it('shows an empty planning state when no initiatives are available', () => {
    renderCardSheet()

    expect(screen.getByLabelText('Initiative')).toBeDisabled()
    expect(screen.getByRole('option', {name: 'No active initiatives'})).toBeInTheDocument()
    expect(screen.getByText('Planning has no active or planned initiatives right now.')).toBeInTheDocument()
  })

  it('shows an error state when the planning initiative query fails', async () => {
    initiativeQueriesMockState.getWorkspaceInitiatives.mockRejectedValueOnce(new Error('initiative query failed'))

    renderCardSheet({}, {seedWorkspaceInitiatives: false})

    await waitFor(() => {
      expect(screen.getByRole('option', {name: 'Could not load initiatives'})).toBeInTheDocument()
    })

    expect(screen.getByLabelText('Initiative')).toBeDisabled()
    expect(screen.getByText('Could not load planning initiatives for this workspace.')).toBeInTheDocument()
  })

  it('shows the default detail fields in gantt and kanban order', () => {
    cardSheetMockState.state.detail = {
      ...makeCardDetail('Initial body'),
      completedAt: '2026-04-01T09:15:00.000Z',
      dueAt: '2026-03-30',
      effort: 2,
      initiativeId: 'initiative-1',
      sprintId: 'sprint-1',
      tags: ['Strategy', 'QA', 'Docs'],
    }

    renderCardSheet({
      projectSprints: [{
        completedAt: null,
        createdAt: '2026-03-01T00:00:00.000Z',
        endDate: '2026-03-30',
        goal: null,
        id: 'sprint-1',
        name: 'Sprint 1',
        position: 0,
        projectId: 'project-1',
        startDate: '2026-03-16',
        status: 'active',
        updatedAt: '2026-03-01T00:00:00.000Z',
      }],
    }, {workspaceInitiatives: defaultWorkspaceInitiatives})

    const orderedLabels = [
      screen.getByText(/^Sprint$/i),
      screen.getByText(/^Initiative$/i),
      screen.getByText(/^Status$/i),
      screen.getByText(/^Priority$/i),
      screen.getByText(/^Effort$/i),
      screen.getByText(/^Due date$/i),
      screen.getByText(/^Start date$/i),
      screen.getByText(/^Complete Date$/i),
      screen.getByText(/^Tags$/i),
    ]

    for (let index = 0; index < orderedLabels.length - 1; index += 1) {
      expect(
        orderedLabels[index].compareDocumentPosition(orderedLabels[index + 1]) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    }
  })

  it('lets users reassign the card from the assignee avatar picker', async () => {
    vi.useFakeTimers()
    renderCardSheet({
      projectMembers,
    })

    // Picker is now a Popover (Phase 4 follow-up). Click the trigger
    // and flush the portal mount + autofocus rAF before searching for
    // the target row.
    fireEvent.click(screen.getByLabelText(/change assignee/i))
    act(() => {
      vi.runAllTimers()
    })

    fireEvent.click(screen.getByText('Taylor Chen'))

    expect(cardSheetMockState.assigneeMutation.mutate).toHaveBeenCalledTimes(1)
    expect(cardSheetMockState.state.capturedAssigneeUpdate?.input).toEqual({
      assigneeUserId: 'user-2',
      cardId: 'card-1',
      projectId: 'project-1',
    })
  })

  it('shows the sprint-specific detail field set', () => {
    cardSheetMockState.state.detail = {
      ...makeCardDetail('Initial body'),
      completedAt: '2026-03-28T09:15:00.000Z',
      initiativeId: 'initiative-1',
      sprintId: 'sprint-1',
      tags: ['Strategy', 'QA', 'Docs'],
    }

    renderCardSheet({
      customFields: [{fieldType: 'text', id: 'field-1', key: 'custom-notes', name: 'Notes', options: []}],
      detailLayout: 'sprint',
      projectSprints: [{
        completedAt: null,
        createdAt: '2026-03-01T00:00:00.000Z',
        endDate: '2026-03-30',
        goal: null,
        id: 'sprint-1',
        name: 'Sprint 1',
        position: 0,
        projectId: 'project-1',
        startDate: '2026-03-16',
        status: 'active',
        updatedAt: '2026-03-01T00:00:00.000Z',
      }],
    }, {workspaceInitiatives: defaultWorkspaceInitiatives})

    expect(screen.getByText(/^Sprint$/i)).toBeInTheDocument()
    expect(screen.getByText(/^Initiative$/i)).toBeInTheDocument()
    expect(screen.getByText(/^Start date$/i)).toBeInTheDocument()
    expect(screen.getByText(/^Complete Date$/i)).toBeInTheDocument()
    expect(screen.getByText(/^Tags$/i)).toBeInTheDocument()

    expect(screen.queryByText(/^Status$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Priority$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Due date$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Effort$/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Assigned in project')).not.toBeInTheDocument()
    expect(screen.queryByText('Project-specific metadata')).not.toBeInTheDocument()
    expect(screen.queryByTestId('card-github-section')).not.toBeInTheDocument()
    expect(screen.getByText(/Attachments \(0\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Comments \(0\)/i)).toBeInTheDocument()
  })

  it('shows the table-specific detail field set with group instead of sprint', () => {
    cardSheetMockState.state.detail = {
      ...makeCardDetail('Initial body'),
      completedAt: '2026-03-28T09:15:00.000Z',
      groupId: 'group-1',
      initiativeId: 'initiative-1',
    }

    renderCardSheet({
      detailLayout: 'table',
      projectGroups: [{
        createdAt: '2026-03-01T00:00:00.000Z',
        id: 'group-1',
        label: 'Product Team',
        position: 0,
        projectId: 'project-1',
        updatedAt: '2026-03-01T00:00:00.000Z',
      }],
      projectSprints: [{
        completedAt: null,
        createdAt: '2026-03-01T00:00:00.000Z',
        endDate: '2026-03-30',
        goal: null,
        id: 'sprint-1',
        name: 'Sprint 1',
        position: 0,
        projectId: 'project-1',
        startDate: '2026-03-16',
        status: 'active',
        updatedAt: '2026-03-01T00:00:00.000Z',
      }],
    }, {workspaceInitiatives: defaultWorkspaceInitiatives})

    expect(screen.getByText(/^Group$/i)).toBeInTheDocument()
    expect(screen.getByText(/^Initiative$/i)).toBeInTheDocument()
    expect(screen.getByText(/^Start date$/i)).toBeInTheDocument()
    expect(screen.getByText(/^Complete Date$/i)).toBeInTheDocument()
    expect(screen.getByText(/^Tags$/i)).toBeInTheDocument()

    expect(screen.queryByText(/^Sprint$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Status$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Priority$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Due date$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Effort$/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Attachments \(0\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Comments \(0\)/i)).toBeInTheDocument()
  })
})
