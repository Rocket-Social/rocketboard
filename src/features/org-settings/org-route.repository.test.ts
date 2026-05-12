import {beforeEach, describe, expect, it, vi} from 'vitest'

const {rpcCallSingleMock} = vi.hoisted(() => ({
  rpcCallSingleMock: vi.fn(),
}))

vi.mock('../../platform/data/rpc-adapter', () => ({
  rpcAdapter: {
    callSingle: rpcCallSingleMock,
  },
}))

import {orgRouteRepository} from './org-route.repository'

describe('orgRouteRepository.resolveOrganizationSlug', () => {
  beforeEach(() => {
    rpcCallSingleMock.mockReset()
  })

  it('resolves an organization slug through the canonical RPC', async () => {
    rpcCallSingleMock.mockResolvedValueOnce({
      id: 'org-1',
      name: 'Acme Org',
      slug: 'acme-org',
    })

    await expect(orgRouteRepository.resolveOrganizationSlug('acme-org')).resolves.toEqual({
      id: 'org-1',
      name: 'Acme Org',
      slug: 'acme-org',
    })

    expect(rpcCallSingleMock).toHaveBeenCalledWith('resolve_organization_slug', {
      target_org_slug: 'acme-org',
    })
  })

  it('rethrows missing-function errors from resolve_organization_slug', async () => {
    const missingFunctionError = {
      code: 'PGRST202',
      message:
        'Could not find the function public.resolve_organization_slug with parameter target_org_slug in the schema cache',
    }

    rpcCallSingleMock.mockRejectedValueOnce(missingFunctionError)

    await expect(orgRouteRepository.resolveOrganizationSlug('acme-org')).rejects.toEqual(
      missingFunctionError,
    )
  })
})
