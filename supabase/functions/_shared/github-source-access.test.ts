import {describe, expect, it, vi} from 'vitest'

import {canAccessGitHubSource} from './github-source-access'

function createDependencies() {
  return {
    canAccessOrganization: vi.fn(async () => false),
    canAccessProjectBoundSource: vi.fn(async () => false),
    canManageOrganization: vi.fn(async () => false),
  }
}

describe('github source access helper', () => {
  it('keeps personal sources owner-only in project mode', async () => {
    const dependencies = createDependencies()

    await expect(canAccessGitHubSource({
      dependencies,
      mode: 'project',
      projectId: 'project-1',
      source: {
        id: 'source-1',
        owner_user_id: 'owner-1',
        scope_type: 'personal',
      },
      userId: 'viewer-1',
    })).resolves.toBe(false)

    expect(dependencies.canAccessOrganization).not.toHaveBeenCalled()
    expect(dependencies.canAccessProjectBoundSource).not.toHaveBeenCalled()
  })

  it('requires org admin rights in manage mode', async () => {
    const dependencies = createDependencies()
    dependencies.canManageOrganization.mockResolvedValue(true)

    await expect(canAccessGitHubSource({
      dependencies,
      mode: 'manage',
      source: {
        id: 'source-1',
        organization_id: 'org-1',
        scope_type: 'organization',
      },
      userId: 'user-1',
    })).resolves.toBe(true)

    expect(dependencies.canManageOrganization).toHaveBeenCalledWith('org-1', 'user-1')
    expect(dependencies.canAccessOrganization).not.toHaveBeenCalled()
    expect(dependencies.canAccessProjectBoundSource).not.toHaveBeenCalled()
  })

  it('allows organization members to access org sources in project mode', async () => {
    const dependencies = createDependencies()
    dependencies.canAccessOrganization.mockResolvedValue(true)

    await expect(canAccessGitHubSource({
      dependencies,
      mode: 'project',
      projectId: 'project-1',
      source: {
        id: 'source-1',
        organization_id: 'org-1',
        scope_type: 'organization',
      },
      userId: 'user-1',
    })).resolves.toBe(true)

    expect(dependencies.canAccessOrganization).toHaveBeenCalledWith('org-1', 'user-1')
    expect(dependencies.canAccessProjectBoundSource).not.toHaveBeenCalled()
  })

  it('allows project viewers to use a bound organization source even without direct org membership', async () => {
    const dependencies = createDependencies()
    dependencies.canAccessProjectBoundSource.mockResolvedValue(true)

    await expect(canAccessGitHubSource({
      dependencies,
      mode: 'project',
      projectId: 'project-1',
      source: {
        id: 'source-1',
        organization_id: 'org-1',
        scope_type: 'organization',
      },
      userId: 'user-1',
    })).resolves.toBe(true)

    expect(dependencies.canAccessOrganization).toHaveBeenCalledWith('org-1', 'user-1')
    expect(dependencies.canAccessProjectBoundSource).toHaveBeenCalledWith({
      projectId: 'project-1',
      sourceId: 'source-1',
      userId: 'user-1',
    })
  })

  it('denies project-mode access when the organization source is not bound to the project', async () => {
    const dependencies = createDependencies()

    await expect(canAccessGitHubSource({
      dependencies,
      mode: 'project',
      projectId: 'project-1',
      source: {
        id: 'source-1',
        organization_id: 'org-1',
        scope_type: 'organization',
      },
      userId: 'user-1',
    })).resolves.toBe(false)

    expect(dependencies.canAccessProjectBoundSource).toHaveBeenCalledOnce()
  })
})
