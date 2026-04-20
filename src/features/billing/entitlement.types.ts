// Plan tiers (scale-gate model: all features free, Pro removes caps)
export type PlanTier = 'free' | 'pro' | 'enterprise'

export type BillingPeriod = 'monthly' | 'yearly'

export type PlanStatus = 'active' | 'past_due' | 'canceled'

// Usage limits (keys match organizations.limits JSONB)
export type UsageLimits = {
  members: number // -1 = unlimited
  projects: number
  workspaces: number
  storage_mb: number
}

// Organization entitlements (from organizations table)
export type OrganizationEntitlements = {
  plan: PlanTier
  planStatus: PlanStatus
  planEndsAt: number | null // epoch ms, set when planStatus='canceled' during grace period
  billingPeriod: BillingPeriod
  hasBillingCustomer: boolean
  adminGrantPlan: PlanTier | null
  adminGrantEndsAt: number | null // epoch ms, null = VIP (no expiry)
  limits: UsageLimits
  storageUsedBytes: number
}

// Usage counts returned by get_org_usage RPC
export type OrgUsage = {
  memberCount: number
  projectCount: number
  workspaceCount: number
  storageUsedBytes: number
  effectivePlan: string
  limits: UsageLimits
}

// ============================================================
// Default Limits by Plan
// ============================================================

export const DEFAULT_LIMITS: Record<PlanTier, UsageLimits> = {
  free: {
    members: 5,
    projects: 10,
    workspaces: 1,
    storage_mb: 1024, // 1 GB
  },
  pro: {
    members: -1,
    projects: -1,
    workspaces: -1,
    storage_mb: -1,
  },
  enterprise: {
    members: -1,
    projects: -1,
    workspaces: -1,
    storage_mb: -1,
  },
}

// ============================================================
// Plan Pricing (cents)
// ============================================================

export const PLAN_PRICING: Record<PlanTier, {monthly: number; yearly: number}> = {
  free: {monthly: 0, yearly: 0},
  pro: {monthly: 700, yearly: 6000}, // $7/user/mo, $60/user/yr
  enterprise: {monthly: 1400, yearly: 14400},
}

// ============================================================
// Helpers
// ============================================================

export function getEffectivePlan(
  entitlements: Pick<OrganizationEntitlements, 'plan' | 'adminGrantPlan' | 'adminGrantEndsAt'> | null,
): PlanTier {
  if (!entitlements) return 'free'

  if (entitlements.adminGrantPlan) {
    // VIP: no expiry (adminGrantEndsAt is null)
    if (entitlements.adminGrantEndsAt == null) return entitlements.adminGrantPlan
    // Timed award: check if still active
    if (entitlements.adminGrantEndsAt > Date.now()) return entitlements.adminGrantPlan
  }

  return entitlements.plan
}

export function isWithinLimit(limits: UsageLimits, limitKey: keyof UsageLimits, currentValue: number): boolean {
  const maxValue = limits[limitKey]
  if (maxValue === -1) return true // unlimited
  return currentValue < maxValue
}

export function getUsagePercent(limits: UsageLimits, limitKey: keyof UsageLimits, currentValue: number): number {
  const maxValue = limits[limitKey]
  if (maxValue === -1) return 0 // unlimited
  return Math.min(100, Math.round((currentValue / maxValue) * 100))
}

export function formatLimitValue(value: number): string {
  if (value === -1) return 'Unlimited'
  return value.toLocaleString()
}

export function formatStorageSize(mb: number): string {
  if (mb === -1) return 'Unlimited'
  if (mb >= 1024) return `${(mb / 1024).toFixed(0)} GB`
  return `${mb} MB`
}

export function formatPrice(cents: number, period: BillingPeriod = 'monthly'): string {
  if (cents === 0) return 'Free'
  const dollars = cents / 100
  const suffix = period === 'monthly' ? '/mo' : '/yr'
  return `$${dollars.toFixed(0)}${suffix}`
}

export function getYearlySavings(monthlyPrice: number, yearlyPrice: number): number {
  if (monthlyPrice === 0) return 0
  const fullYearly = monthlyPrice * 12
  return Math.round(((fullYearly - yearlyPrice) / fullYearly) * 100)
}

export function getPlanName(plan: PlanTier): string {
  switch (plan) {
    case 'free': return 'Free'
    case 'pro': return 'Pro'
    case 'enterprise': return 'Enterprise'
    default: return 'Unknown'
  }
}
