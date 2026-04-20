import { describe, expect, it, vi } from 'vitest'

describe('buildOrgApiKeysHref', () => {
  it('builds the dedicated API keys settings URL', async () => {
    const { buildOrgApiKeysHref } = await vi.importActual<typeof import('./route-helpers')>('./route-helpers')

    expect(buildOrgApiKeysHref('rocketboard')).toBe('/org/rocketboard/settings/api-keys')
  })

  it('encodes the org slug when needed', async () => {
    const { buildOrgApiKeysHref } = await vi.importActual<typeof import('./route-helpers')>('./route-helpers')

    expect(buildOrgApiKeysHref('rocket board')).toBe('/org/rocket%20board/settings/api-keys')
  })
})

describe('buildProjectAccessHref', () => {
  it('builds the dedicated project access URL', async () => {
    const { buildProjectAccessHref } = await vi.importActual<typeof import('./route-helpers')>('./route-helpers')

    expect(buildProjectAccessHref('rocketboard', 'product-team', 'launchpad')).toBe(
      '/org/rocketboard/workspaces/product-team/projects/launchpad/access',
    )
  })

  it('encodes each route segment when needed', async () => {
    const { buildProjectAccessHref } = await vi.importActual<typeof import('./route-helpers')>('./route-helpers')

    expect(buildProjectAccessHref('rocket board', 'product team', 'secret launch')).toBe(
      '/org/rocket%20board/workspaces/product%20team/projects/secret%20launch/access',
    )
  })
})
