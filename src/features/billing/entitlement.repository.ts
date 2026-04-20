import {rpcAdapter} from '../../platform/data/rpc-adapter'
import type {OrgUsage, OrganizationEntitlements, UsageLimits} from './entitlement.types'

type DbOrgUsageRow = {
  member_count: number
  project_count: number
  workspace_count: number
  storage_used_bytes: number
  effective_plan: string
  limits: Record<string, number>
}

type DbOrgBillingSummaryRow = {
  adminGrantEndsAt: string | null
  adminGrantPlan: OrganizationEntitlements['adminGrantPlan']
  billingPeriod: OrganizationEntitlements['billingPeriod']
  limits: Record<string, number> | null
  plan: OrganizationEntitlements['plan']
  planStatus: OrganizationEntitlements['planStatus']
  planEndsAt: string | null
  storageUsedBytes: number
}

type DbOrgBillingAdminRow = {
  hasBillingCustomer: boolean
}

function mapDbLimits(raw: Record<string, number> | null): UsageLimits {
  return {
    members: raw?.members ?? 5,
    projects: raw?.projects ?? 10,
    workspaces: raw?.workspaces ?? 1,
    storage_mb: raw?.storage_mb ?? 1024,
  }
}

export const entitlementRepository = {
  async getOrgUsage(orgId: string): Promise<OrgUsage> {
    const rows = await rpcAdapter.call<DbOrgUsageRow[]>('get_org_usage', {p_org_id: orgId})
    const row = Array.isArray(rows) ? rows[0] : rows
    if (!row) throw new Error('Failed to load organization usage')

    return {
      memberCount: row.member_count,
      projectCount: row.project_count,
      workspaceCount: row.workspace_count,
      storageUsedBytes: row.storage_used_bytes,
      effectivePlan: row.effective_plan,
      limits: mapDbLimits(row.limits),
    }
  },

  async getOrgEntitlements(
    orgId: string,
    options?: {includeAdminDetails?: boolean},
  ): Promise<OrganizationEntitlements> {
    const summary = await rpcAdapter.callSingle<DbOrgBillingSummaryRow | null>('get_org_billing_summary', {
      p_org_id: orgId,
    })
    if (!summary) throw new Error('Organization not found')

    const adminSnapshot = options?.includeAdminDetails
      ? await rpcAdapter.callSingle<DbOrgBillingAdminRow | null>('get_org_billing_admin_snapshot', {
        p_org_id: orgId,
      })
      : null

    return {
      plan: summary.plan ?? 'free',
      planStatus: summary.planStatus ?? 'active',
      planEndsAt: summary.planEndsAt ? new Date(summary.planEndsAt).getTime() : null,
      billingPeriod: summary.billingPeriod ?? 'monthly',
      hasBillingCustomer: adminSnapshot?.hasBillingCustomer ?? false,
      adminGrantPlan: summary.adminGrantPlan,
      adminGrantEndsAt: summary.adminGrantEndsAt ? new Date(summary.adminGrantEndsAt).getTime() : null,
      limits: mapDbLimits(summary.limits),
      storageUsedBytes: summary.storageUsedBytes ?? 0,
    }
  },

  async checkOrgLimit(orgId: string, limitKey: string): Promise<boolean> {
    const result = await rpcAdapter.call<boolean>('check_org_limit', {
      p_org_id: orgId,
      p_limit_key: limitKey,
    })
    return result === true
  },
}
