/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {AutomationManagerDialog} from './AutomationManagerDialog'
import type {ProjectPriorityOption, ProjectStatusOption} from '../cards/card.types'
import type {ProjectGroupRecord} from '../projects/project-group.types'
import type {ProjectMember} from '../access/access.types'
import {automationActionPlaceholder, type AutomationRule, type AutomationRun} from './automation.types'

type MockMutation = {
  error: null
  isPending: boolean
  mutate: ReturnType<typeof vi.fn>
  reset: ReturnType<typeof vi.fn>
}

const automationState = vi.hoisted(() => ({
  rules: [] as AutomationRule[],
  runs: [] as AutomationRun[],
}))

function createMutationMock(): MockMutation {
  return {
    error: null,
    isPending: false,
    mutate: vi.fn(),
    reset: vi.fn(),
  }
}

vi.mock('../../components/ui/toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}))

vi.mock('./automation.queries', () => ({
  useCreateProjectAutomationMutation: () => createMutationMock(),
  useDeleteProjectAutomationMutation: () => createMutationMock(),
  usePauseProjectAutomationMutation: () => createMutationMock(),
  useProjectAutomationRunsQuery: () => ({
    data: automationState.runs,
    isLoading: false,
  }),
  useProjectAutomationsQuery: () => ({
    data: automationState.rules,
    isLoading: false,
  }),
  useReorderProjectAutomationsMutation: () => createMutationMock(),
  useResumeProjectAutomationMutation: () => createMutationMock(),
  useUpdateProjectAutomationMutation: () => createMutationMock(),
}))

const members: ProjectMember[] = [
  {
    email: 'avery@example.com',
    githubLogin: null,
    id: 'user-1',
    name: 'Avery',
    role: 'admin',
  },
]

const groups: ProjectGroupRecord[] = [
  {
    createdAt: '2026-03-31T15:00:00.000Z',
    id: 'group-1',
    label: 'Backlog',
    position: 0,
    projectId: 'project-1',
    updatedAt: '2026-03-31T15:00:00.000Z',
  },
]

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

const priorityOptions: ProjectPriorityOption[] = [
  {
    color: null,
    id: 'priority-1',
    isDefault: true,
    key: 'medium',
    label: 'Medium',
    sortOrder: 0,
  },
]

const rule: AutomationRule = {
  actions: [
    {
      actionConfig: {
        bodyTemplate: 'Check assignment',
      },
      actionType: 'add_comment',
    },
  ],
  brokenReason: null,
  conditionClauses: [],
  createdAt: '2026-03-31T15:00:00.000Z',
  createdByUserId: 'user-1',
  id: 'automation-1',
  isBroken: false,
  position: 0,
  projectId: 'project-1',
  status: 'active',
  triggerConfig: {},
  triggerType: 'card_created',
  updatedAt: '2026-03-31T15:00:00.000Z',
  updatedByUserId: 'user-1',
}

const run: AutomationRun = {
  actionsExecuted: [{actionType: 'add_comment'}],
  automationId: 'automation-1',
  cardId: 'card-1',
  cardTitle: 'Launch homepage',
  createdAt: '2026-03-31T15:05:00.000Z',
  id: 'run-1',
  metadata: {},
  outcome: 'applied',
  projectId: 'project-1',
  reasonCode: 'actions_applied',
  triggerType: 'card_created',
}

function renderDialog() {
  return render(
    <AutomationManagerDialog
      canEditProject
      customFields={[]}
      groups={groups}
      isOpen
      members={members}
      onClose={vi.fn()}
      priorityOptions={priorityOptions}
      projectId='project-1'
      projectName='Product Team'
      statusOptions={statusOptions}
    />,
  )
}

beforeEach(() => {
  automationState.rules = [rule]
  automationState.runs = [run]
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AutomationManagerDialog', () => {
  it('distinguishes starting a new draft from saving it and uses an action placeholder', () => {
    automationState.rules = []
    renderDialog()

    expect(screen.getByRole('button', {name: 'New rule'})).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Save rule'})).toBeDisabled()
    expect(screen.getByRole('heading', {name: 'Create automation'})).toBeInTheDocument()
    expect(screen.getByRole('combobox', {name: 'Action'})).toHaveValue(automationActionPlaceholder)
    expect(screen.getByText('Choose an action to configure its details.')).toBeInTheDocument()
    expect(screen.queryByText('Comment actions need a message template.')).not.toBeInTheDocument()
  })

  it('defaults to the editor tab and hides the run log until selected', () => {
    renderDialog()

    expect(screen.getByRole('tab', {name: 'Edit'})).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', {name: 'Edit automation'})).toBeInTheDocument()
    expect(screen.queryByText('Latest executions')).not.toBeInTheDocument()
    expect(screen.queryByText('Launch homepage')).not.toBeInTheDocument()
  })

  it('switches to the run log tab and shows project-wide execution history', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('tab', {name: 'Run Log'}))

    expect(screen.getByRole('tab', {name: 'Run Log'})).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', {name: 'Latest executions'})).toBeInTheDocument()
    expect(screen.getByText(/Card: Launch homepage/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', {name: 'Edit automation'})).not.toBeInTheDocument()
  })

  it('returns to the editor tab when creating a new rule or selecting a rule', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('tab', {name: 'Run Log'}))
    await user.click(screen.getByRole('button', {name: 'New rule'}))

    expect(screen.getByRole('tab', {name: 'Create'})).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', {name: 'Create automation'})).toBeInTheDocument()
    expect(screen.queryByText('Latest executions')).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', {name: 'Run Log'}))
    await user.click(screen.getByRole('button', {name: /When a card is created/i}))

    expect(screen.getByRole('tab', {name: 'Edit'})).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', {name: 'Edit automation'})).toBeInTheDocument()
    expect(screen.queryByText('Latest executions')).not.toBeInTheDocument()
  })

  it('shows a read-only access message when the user lacks project write access', () => {
    render(
      <AutomationManagerDialog
        canEditProject={false}
        customFields={[]}
        groups={groups}
        isOpen
        members={members}
        onClose={vi.fn()}
        priorityOptions={priorityOptions}
        projectId='project-1'
        projectName='Product Team'
        statusOptions={statusOptions}
      />,
    )

    expect(screen.getByText('Automation access requires project write access')).toBeInTheDocument()
    expect(screen.getByText('Ask someone with project write access to create or edit automation rules for this project.')).toBeInTheDocument()
  })
})
