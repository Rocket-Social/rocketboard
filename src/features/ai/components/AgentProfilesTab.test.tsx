/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {AI_PERSONA_PHASE1_DEFAULTS, type AiPersona} from '../ai.types'

const navigateMock = vi.fn()
const updateMutateMock = vi.fn()
const createMutateMock = vi.fn()
const toastMock = vi.fn()
const {keyStatusQueryState} = vi.hoisted(() => ({
  keyStatusQueryState: {
    data: {
      capabilities: {anthropicSubscriptionEnabled: false},
      orgKeys: [],
      userKeys: [],
    } as
      | {
          capabilities: {anthropicSubscriptionEnabled: boolean}
          orgKeys: unknown[]
          userKeys: unknown[]
        }
      | undefined,
    isPending: false,
    isSuccess: true,
  },
}))

const persona: AiPersona = {
  ...AI_PERSONA_PHASE1_DEFAULTS,
  accentColor: 'blue',
  avatarUrl: null,
  createdAt: '2026-04-11T00:00:00.000Z',
  createdBy: null,
  fallbackCredentialKind: null,
  fallbackModel: null,
  fallbackProvider: null,
  focusArea: 'Product Strategy',
  id: 'persona-1',
  isDefault: true,
  isEnabled: true,
  maxRunsPerHour: 60,
  model: 'gpt-5.4',
  name: 'Synthesis',
  organizationId: 'org-1',
  primaryCredentialKind: 'api_key',
  provider: 'openai',
  slug: 'synthesis',
  systemPrompt: 'Help the team ship cleanly.',
  updatedAt: '2026-04-11T00:00:00.000Z',
}

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('../../../components/ui/toast', () => ({
  useToast: () => ({toast: toastMock}),
}))

vi.mock('../../projects/project-shell.queries', () => ({
  useWorkspaceSummariesQuery: () => ({
    data: [
      {
        canManageWorkspace: true,
        colorToken: 'slate',
        defaultProjectSlug: 'project-1',
        icon: 'R',
        id: 'workspace-1',
        name: 'Rocketboard',
        organizationId: 'org-1',
        organizationName: 'Rocketboard Inc.',
        organizationSlug: 'rocketboard-inc',
        projects: [],
        slug: 'rocketboard',
        timezone: 'America/Los_Angeles',
      },
    ],
  }),
}))

vi.mock('../../shell/SignedInAppFrame', () => ({
  useSignedInAppFrame: () => ({
    currentWorkspace: {
      id: 'workspace-1',
      name: 'Rocketboard',
      organizationId: 'org-1',
      organizationName: 'Rocketboard Inc.',
      organizationSlug: 'rocketboard-inc',
      slug: 'rocketboard',
    },
    currentUser: {
      id: 'user-1',
      name: 'Test User',
    },
    workspaces: [
      {
        id: 'workspace-1',
        name: 'Rocketboard',
        organizationId: 'org-1',
        organizationName: 'Rocketboard Inc.',
        organizationSlug: 'rocketboard-inc',
        slug: 'rocketboard',
      },
    ],
  }),
}))

vi.mock('../ai.queries', () => ({
  usePersonasQuery: () => ({
    data: [persona],
    isPending: false,
  }),
  useSeedPersonasMutation: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
  useUpdatePersonaMutation: () => ({
    isPending: false,
    mutate: updateMutateMock,
  }),
  useCreatePersonaMutation: () => ({
    isPending: false,
    mutate: createMutateMock,
  }),
}))

vi.mock('../api-key.queries', () => ({
  useApiKeyStatusQuery: () => keyStatusQueryState,
}))

import {AgentProfilesTab} from './AgentProfilesTab'

afterEach(() => {
  cleanup()
  updateMutateMock.mockReset()
  createMutateMock.mockReset()
  navigateMock.mockReset()
  toastMock.mockReset()
  keyStatusQueryState.data = {
    capabilities: {anthropicSubscriptionEnabled: false},
    orgKeys: [],
    userKeys: [],
  }
  keyStatusQueryState.isPending = false
  keyStatusQueryState.isSuccess = true
})

describe('AgentProfilesTab', () => {
  it('renders the new agent action', () => {
    render(<AgentProfilesTab/>)

    expect(screen.getByRole('button', {name: 'New agent'})).toBeInTheDocument()
  })

  it('opens org API keys from the empty-state warning', async () => {
    const user = userEvent.setup()

    render(<AgentProfilesTab/>)

    await user.click(screen.getByRole('button', {name: 'API Keys'}))

    expect(navigateMock).toHaveBeenCalledWith({
      href: '/org/rocketboard-inc/settings/api-keys',
    })
  })

  it('does not show the no-key warning when key status failed to load', () => {
    keyStatusQueryState.data = undefined
    keyStatusQueryState.isPending = false
    keyStatusQueryState.isSuccess = false

    render(<AgentProfilesTab/>)

    expect(screen.queryByText(/no api key configured/i)).not.toBeInTheDocument()
  })

  it('opens the persona dialog and saves only the changed fields', async () => {
    const user = userEvent.setup()
    updateMutateMock.mockImplementation((_payload, options) => {
      options?.onSuccess?.()
    })

    render(<AgentProfilesTab/>)

    await user.click(screen.getByRole('button', {name: /synthesis product strategy active/i}))

    expect(screen.getByRole('dialog', {name: 'Synthesis'})).toBeInTheDocument()

    const nameInput = screen.getByDisplayValue('Synthesis')
    await user.clear(nameInput)
    await user.type(nameInput, 'Buddy 2')
    await user.click(screen.getByRole('button', {name: 'Save changes'}))

    expect(updateMutateMock).toHaveBeenCalledWith(
      {
        personaId: 'persona-1',
        updates: {
          accentColor: 'blue',
          fallbackCredentialKind: null,
          fallbackModel: null,
          fallbackProvider: null,
          focusArea: 'Product Strategy',
          maxRunsPerHour: 60,
          model: 'gpt-5.4',
          name: 'Buddy 2',
          primaryCredentialKind: 'api_key',
          provider: 'openai',
          systemPrompt: 'Help the team ship cleanly.',
        },
      },
      expect.objectContaining({
        onError: expect.any(Function),
        onSuccess: expect.any(Function),
      }),
    )
    expect(screen.queryByRole('dialog', {name: 'Synthesis'})).not.toBeInTheDocument()
  })

  it('creates a new persona with a generated slug from the header action', async () => {
    const user = userEvent.setup()
    createMutateMock.mockImplementation((_payload, options) => {
      options?.onSuccess?.()
    })

    render(<AgentProfilesTab/>)

    await user.click(screen.getByRole('button', {name: /new agent/i}))
    expect(screen.getByRole('dialog', {name: 'Create AI Agent'})).toBeInTheDocument()

    const nameInput = screen.getByRole('textbox', {name: 'Name'})
    await user.type(nameInput, 'Scout')
    await user.click(screen.getByRole('button', {name: 'Create agent'}))

    expect(createMutateMock).toHaveBeenCalledWith(
      {
        accentColor: 'blue',
        fallbackCredentialKind: null,
        fallbackModel: null,
        fallbackProvider: null,
        focusArea: null,
        maxRunsPerHour: 60,
        model: 'claude-sonnet-4-20250514',
        name: 'Scout',
        primaryCredentialKind: 'api_key',
        provider: 'anthropic',
        slug: 'scout',
        systemPrompt: 'You are a helpful AI assistant.',
      },
      expect.objectContaining({
        onError: expect.any(Function),
        onSuccess: expect.any(Function),
      }),
    )
  })
})
