import {rpcAdapter} from '../../platform/data/rpc-adapter'

export type OrganizationRouteContext = {
  id: string
  name: string
  slug: string
}

export const orgRouteRepository = {
  async resolveOrganizationSlug(orgSlug: string): Promise<OrganizationRouteContext | null> {
    return rpcAdapter.callSingle<OrganizationRouteContext>('resolve_organization_slug', {
      target_org_slug: orgSlug,
    })
  },
}
