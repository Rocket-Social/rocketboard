// Wave 2 AI Kanban Phase 6-B — org budget repository.
//
// Wraps the two RPCs that drive the <OrgBudgetMeter> + <EditOrgBudgetCapDialog>
// flow. Both RPCs enforce admin-only access server-side via
// `can_manage_organization` — the frontend gates UI on data presence,
// not on a separate role lookup, so non-admins simply see no meter.
//
// Per `reference_rpc_call_vs_callsingle.md` (PR #483 hotfix lesson):
//   - `get_org_budget_utilization` RETURNS TABLE → use `callSingle` so
//     the row is unwrapped + snake → camel transformed.
//   - `update_org_budget_cap` RETURNS numeric → use `call`. callSingle on
//     a scalar would index into the string and silently return the wrong
//     value.

import {rpcAdapter} from '../../platform/data/rpc-adapter'

export type OrgBudgetUtilization = {
  calendarMonthSpendUsd: number
  capUsd: number | null
  percentConsumed: number | null
  monthWindowStartTs: string
}

export const orgBudgetRepository = {
  /**
   * Fetch the current calendar-month spend + cap + percent for the
   * given org. Server-side gate: caller must be an org admin (else
   * the RPC throws `Organization admin access required`).
   *
   * Returns null when the RPC produced no row (shouldn't happen for a
   * valid org, but the type acknowledges callSingle's null-on-empty
   * contract).
   */
  async getUtilization(
    organizationId: string,
  ): Promise<OrgBudgetUtilization | null> {
    return rpcAdapter.callSingle<OrgBudgetUtilization | null>(
      'get_org_budget_utilization',
      {target_org_id: organizationId},
    )
  },

  /**
   * Update the org's `ai_run_budget_usd_monthly_cap`. Server-side gate:
   * admin role required. Bounds: [0, 999999.99] or null (clear).
   *
   * Returns the new cap value as a JS number. The RPC RETURNS numeric;
   * we use `rpcAdapter.call` (not callSingle) per scalar/table audit.
   */
  async updateCap(
    organizationId: string,
    newCapUsd: number | null,
  ): Promise<number | null> {
    const result = await rpcAdapter.call<number | string | null>(
      'update_org_budget_cap',
      {
        target_org_id: organizationId,
        new_cap_usd: newCapUsd,
      },
    )
    if (result === null || result === undefined) return null
    // Postgres numeric serializes as string in PostgREST; coerce defensively.
    const parsed = typeof result === 'string' ? Number(result) : result
    return Number.isFinite(parsed) ? parsed : null
  },
}
