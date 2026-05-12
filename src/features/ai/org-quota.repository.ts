// Wave 2 AI Kanban Phase 7-B — org dispatch + recurring schedule quota repository.
//
// Wraps `get_org_quota_utilization` which drives the <OrgQuotaMeter> for
// free-tier orgs. Server-side gate: caller must be an org admin (non-admins
// receive a thrown error, which the meter catches by returning null).
//
// Per `reference_rpc_call_vs_callsingle.md`:
//   - get_org_quota_utilization RETURNS TABLE → use callSingle so the row
//     is unwrapped + snake → camel transformed.

import {rpcAdapter} from '../../platform/data/rpc-adapter'

export type OrgQuotaUtilization = {
  isPaidPlan: boolean
  dispatchesUsed: number
  dispatchesLimit: number  // -1 = unlimited
  recurringUsed: number
  recurringLimit: number  // -1 = unlimited
  monthWindowStartTs: string
}

export const orgQuotaRepository = {
  async getUtilization(
    organizationId: string,
  ): Promise<OrgQuotaUtilization | null> {
    return rpcAdapter.callSingle<OrgQuotaUtilization | null>(
      'get_org_quota_utilization',
      {target_org_id: organizationId},
    )
  },
}
