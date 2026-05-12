// Read-only frontend access to the per-org `organization_ai_fetch_allowlist`
// table. RLS is org-scoped on SELECT, admin-only on INSERT/DELETE; v1
// editing UX (allowlist add/remove) is a Phase 6 concern. The Phase 5
// template config inputs use this list to render an inline warning when
// a user-supplied URL's hostname isn't allowlisted.

import {getSupabaseBrowserClient} from '../../platform/supabase/client'
import {snakeToCamel} from '../../platform/data/rpc-adapter'
import type {FetchUrlAllowlistEntry} from './fetch-url-allowlist'

export const fetchUrlAllowlistRepository = {
  async listForOrganization(organizationId: string): Promise<FetchUrlAllowlistEntry[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types lag behind Phase 2c migration
    const client = getSupabaseBrowserClient() as any
    const {data, error} = await client
      .from('organization_ai_fetch_allowlist')
      .select('domain_pattern')
      .eq('organization_id', organizationId)

    if (error) throw error
    return ((data as Array<{domain_pattern: string}>) ?? []).map((row) =>
      snakeToCamel<FetchUrlAllowlistEntry>(row),
    )
  },
}
