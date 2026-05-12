import {describe, expect, it} from 'vitest'

import type {WorkspaceSummary} from '../projects/project-shell.types'
import {resolveShellWorkspace} from './workspace-sidebar-shell.utils'

const workspaces: WorkspaceSummary[] = [
  {
    canManageWorkspace: true,
    colorToken: 'blue',
    defaultProjectSlug: 'alpha-board',
    icon: 'A',
    id: 'workspace-1',
    name: 'Alpha',
    organizationId: 'org-1',
    organizationName: 'Org One',
    organizationSlug: 'org-one',
    projects: [],
    slug: 'alpha',
    timezone: 'America/Los_Angeles',
  },
  {
    canManageWorkspace: true,
    colorToken: 'green',
    defaultProjectSlug: 'beta-board',
    icon: 'B',
    id: 'workspace-2',
    name: 'Beta',
    organizationId: 'org-2',
    organizationName: 'Org Two',
    organizationSlug: 'org-two',
    projects: [],
    slug: 'beta',
    timezone: 'America/Los_Angeles',
  },
]

describe('resolveShellWorkspace', () => {
  it('prefers the route workspace slug when it is present', () => {
    expect(resolveShellWorkspace(workspaces, 'beta', undefined)?.id).toBe('workspace-2')
  })

  it('falls back to the organization workspace on org-level routes', () => {
    expect(resolveShellWorkspace(workspaces, undefined, 'org-one')?.id).toBe('workspace-1')
  })

  it('returns undefined when the user has no accessible workspace for the org', () => {
    expect(resolveShellWorkspace(workspaces, undefined, 'org-missing')).toBeUndefined()
  })

  it('falls back to first workspace when no slug or orgSlug is provided', () => {
    expect(resolveShellWorkspace(workspaces, undefined, undefined)?.id).toBe('workspace-1')
  })

  it('returns undefined when no workspaces exist', () => {
    expect(resolveShellWorkspace([], undefined, undefined)).toBeUndefined()
  })
})
