import {QueryClient} from '@tanstack/react-query'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const {
  bootstrapWorkspaceMock,
  getPendingInviteForCurrentUserMock,
  listWorkspacesMock,
} = vi.hoisted(() => ({
  bootstrapWorkspaceMock: vi.fn(),
  getPendingInviteForCurrentUserMock: vi.fn(),
  listWorkspacesMock: vi.fn(),
}))

vi.mock('../projects/project-shell.queries', () => ({
  workspaceSummariesQueryOptions: () => ({
    queryFn: listWorkspacesMock,
    queryKey: ['project', 'workspace-summaries'],
  }),
}))

vi.mock('../projects/project-shell.routes', () => ({
  getDefaultProjectRoute: vi.fn((workspaces: Array<{defaultRoute?: unknown}>) => workspaces[0]?.defaultRoute ?? null),
  isProjectRouteTarget: vi.fn((route: Record<string, unknown> | null | undefined) =>
    Boolean(route?.orgSlug && route?.projectSlug && route?.workspaceSlug),
  ),
  resolveProjectRouteTarget: vi.fn((_: unknown, route: unknown) => route ?? null),
}))

vi.mock('../search/workspace-palette-navigation', () => ({
  buildProjectRouteHref: vi.fn((route: {orgSlug: string; projectSlug: string; workspaceSlug: string}) =>
    `/org/${route.orgSlug}/workspaces/${route.workspaceSlug}/projects/${route.projectSlug}`,
  ),
}))

vi.mock('../setup/setup.repository', () => ({
  setupRepository: {
    bootstrapWorkspace: bootstrapWorkspaceMock,
    getPendingInviteForCurrentUser: getPendingInviteForCurrentUserMock,
  },
}))

vi.mock('../setup/setup.routes', () => ({
  buildAcceptInviteHref: vi.fn((inviteToken: string, options?: {autoAccept?: boolean}) =>
    options?.autoAccept ? `/accept-invite/${inviteToken}?autoAccept=1` : `/accept-invite/${inviteToken}`,
  ),
  onboardingRoutePath: '/onboarding',
}))

vi.mock('../shell/route-helpers', () => ({
  projectLayoutRoutePath: '/org/$orgSlug/workspaces/$workspaceSlug/projects/$projectSlug',
}))

import {openPostAuthDestination} from './auth-flow'

describe('openPostAuthDestination', () => {
  let navigateMock: ReturnType<typeof vi.fn>
  let queryClient: QueryClient
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    bootstrapWorkspaceMock.mockReset()
    getPendingInviteForCurrentUserMock.mockReset()
    listWorkspacesMock.mockReset()
    navigateMock = vi.fn().mockResolvedValue(undefined)
    queryClient = new QueryClient()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    queryClient.clear()
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  it('routes to a pending invite before auto-bootstrapping a new workspace', async () => {
    listWorkspacesMock.mockResolvedValue([])
    getPendingInviteForCurrentUserMock.mockResolvedValue({
      acceptToken: 'invite-token',
      resourceType: 'organization',
    })

    await openPostAuthDestination({
      navigate: navigateMock,
      queryClient,
    })

    expect(getPendingInviteForCurrentUserMock).toHaveBeenCalledTimes(1)
    expect(bootstrapWorkspaceMock).not.toHaveBeenCalled()
    expect(navigateMock).toHaveBeenCalledWith({
      href: '/accept-invite/invite-token?autoAccept=1',
      replace: undefined,
    })
  })

  it('prefers returnTo before checking pending invites', async () => {
    getPendingInviteForCurrentUserMock.mockResolvedValue({
      acceptToken: 'invite-token',
      resourceType: 'organization',
    })

    await openPostAuthDestination({
      navigate: navigateMock,
      queryClient,
      returnTo: '/org/lila-games/workspaces/main/projects/product-board',
    })

    expect(getPendingInviteForCurrentUserMock).not.toHaveBeenCalled()
    expect(listWorkspacesMock).not.toHaveBeenCalled()
    expect(bootstrapWorkspaceMock).not.toHaveBeenCalled()
    expect(navigateMock).toHaveBeenCalledWith({
      href: '/org/lila-games/workspaces/main/projects/product-board',
      replace: undefined,
    })
  })

  it('routes to a pending invite before opening the default workspace', async () => {
    listWorkspacesMock.mockResolvedValue([
      {
        defaultRoute: {
          orgSlug: 'personal-org',
          projectSlug: 'personal-board',
          workspaceSlug: 'personal-workspace',
        },
      },
    ])
    getPendingInviteForCurrentUserMock.mockResolvedValue({
      acceptToken: 'invite-token',
      resourceType: 'organization',
    })

    await openPostAuthDestination({
      navigate: navigateMock,
      queryClient,
    })

    expect(bootstrapWorkspaceMock).not.toHaveBeenCalled()
    expect(navigateMock).toHaveBeenCalledWith({
      href: '/accept-invite/invite-token?autoAccept=1',
      replace: undefined,
    })
  })

  it('falls back to the default workspace when the pending invite lookup fails', async () => {
    listWorkspacesMock.mockResolvedValue([
      {
        defaultRoute: {
          orgSlug: 'personal-org',
          projectSlug: 'personal-board',
          workspaceSlug: 'personal-workspace',
        },
      },
    ])
    getPendingInviteForCurrentUserMock.mockRejectedValue(new Error('invite lookup failed'))

    await openPostAuthDestination({
      navigate: navigateMock,
      queryClient,
    })

    expect(bootstrapWorkspaceMock).not.toHaveBeenCalled()
    expect(navigateMock).toHaveBeenCalledWith({
      href: '/org/personal-org/workspaces/personal-workspace/projects/personal-board',
      replace: undefined,
    })
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
  })

  it('falls back to bootstrap when the pending invite lookup fails and no workspace exists', async () => {
    listWorkspacesMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    bootstrapWorkspaceMock.mockResolvedValue({
      orgSlug: 'fresh-org',
      projectSlug: 'fresh-board',
      workspaceSlug: 'fresh-workspace',
    })
    getPendingInviteForCurrentUserMock.mockRejectedValue(new Error('invite lookup failed'))

    await openPostAuthDestination({
      navigate: navigateMock,
      queryClient,
    })

    expect(bootstrapWorkspaceMock).toHaveBeenCalledWith({
      projectName: 'Main Workspace Board',
      workspaceName: 'Main Workspace',
    })
    expect(navigateMock).toHaveBeenCalledWith({
      href: '/org/fresh-org/workspaces/fresh-workspace/projects/fresh-board',
      replace: undefined,
    })
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
  })

  it('recovers to a newly visible workspace when bootstrap races with another creation', async () => {
    listWorkspacesMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          defaultRoute: {
            orgSlug: 'race-org',
            projectSlug: 'race-board',
            workspaceSlug: 'race-workspace',
          },
        },
      ])
    getPendingInviteForCurrentUserMock.mockResolvedValue(null)
    bootstrapWorkspaceMock.mockRejectedValue(new Error('workspace already exists'))

    await openPostAuthDestination({
      navigate: navigateMock,
      queryClient,
    })

    expect(getPendingInviteForCurrentUserMock).toHaveBeenCalledTimes(1)
    expect(listWorkspacesMock).toHaveBeenCalledTimes(2)
    expect(bootstrapWorkspaceMock).toHaveBeenCalledWith({
      projectName: 'Main Workspace Board',
      workspaceName: 'Main Workspace',
    })
    expect(navigateMock).toHaveBeenCalledWith({
      href: '/org/race-org/workspaces/race-workspace/projects/race-board',
      replace: undefined,
    })
  })

  it('falls back cleanly when the pending invite RPC is missing during rollout', async () => {
    listWorkspacesMock.mockResolvedValue([
      {
        defaultRoute: {
          orgSlug: 'personal-org',
          projectSlug: 'personal-board',
          workspaceSlug: 'personal-workspace',
        },
      },
    ])
    getPendingInviteForCurrentUserMock.mockRejectedValue({
      code: 'PGRST202',
      message: 'Could not find the function public.get_pending_invite_for_current_user',
    })

    await openPostAuthDestination({
      navigate: navigateMock,
      queryClient,
    })

    expect(bootstrapWorkspaceMock).not.toHaveBeenCalled()
    expect(navigateMock).toHaveBeenCalledWith({
      href: '/org/personal-org/workspaces/personal-workspace/projects/personal-board',
      replace: undefined,
    })
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })
})
