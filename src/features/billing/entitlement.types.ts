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
  adminGrantStartsAt: number | null
  adminGrantEndsAt: number | null // epoch ms, null = VIP (no expiry)
  vipCancellationManaged: boolean
  vipCanceledSubscriptionId: string | null
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

export type GrantStateInput = Pick<
  OrganizationEntitlements,
  'adminGrantEndsAt' | 'adminGrantPlan' | 'adminGrantStartsAt' | 'plan' | 'planEndsAt' | 'planStatus'
>

export type PaidBaseTermState = 'none' | 'non-renewing' | 'renewing'

export type OrgAdminGrantState = {
  badgeLabel: 'Award' | 'VIP' | 'VIP On Hold' | 'VIP Scheduled' | null
  isActive: boolean
  isScheduled: boolean
  isVip: boolean
  kind: 'none' | 'award' | 'vip-active' | 'vip-blocked' | 'vip-scheduled'
  startsAt: number | null
  endsAt: number | null
}

export function getPaidBaseTermState(
  entitlements: Pick<OrganizationEntitlements, 'plan' | 'planEndsAt' | 'planStatus'> | null,
  now = Date.now(),
): PaidBaseTermState {
  if (!entitlements) return 'none'
  const isPaidPlan = entitlements.plan === 'pro' || entitlements.plan === 'enterprise'
  if (!isPaidPlan) return 'none'

  if (entitlements.planStatus === 'active' || entitlements.planStatus === 'past_due') {
    return 'renewing'
  }

  return entitlements.planStatus === 'canceled'
    && entitlements.planEndsAt !== null
    && entitlements.planEndsAt > now
    ? 'non-renewing'
    : 'none'
}

export function hasActivePaidBaseTerm(
  entitlements: Pick<OrganizationEntitlements, 'plan' | 'planEndsAt' | 'planStatus'> | null,
  now = Date.now(),
): boolean {
  return getPaidBaseTermState(entitlements, now) !== 'none'
}

export function getAdminGrantState(entitlements: GrantStateInput | null, now = Date.now()): OrgAdminGrantState {
  if (!entitlements?.adminGrantPlan) {
    return {
      badgeLabel: null,
      endsAt: null,
      isActive: false,
      isScheduled: false,
      isVip: false,
      kind: 'none',
      startsAt: null,
    }
  }

  const startsAt = entitlements.adminGrantStartsAt
  const endsAt = entitlements.adminGrantEndsAt
  const windowOpen = (startsAt == null || startsAt <= now) && (endsAt == null || endsAt > now)
  const paidBaseTermState = getPaidBaseTermState(entitlements, now)

  // Delayed activation is intentionally VIP-only in v1. Timed awards must be
  // immediate, and the DB rejects future starts when adminGrantEndsAt is set.
  if (endsAt == null) {
    const scheduledStartAt = startsAt ?? (paidBaseTermState === 'non-renewing' ? entitlements.planEndsAt : null)

    if (paidBaseTermState === 'renewing') {
      return {
        badgeLabel: 'VIP On Hold',
        endsAt,
        isActive: false,
        isScheduled: false,
        isVip: true,
        kind: 'vip-blocked',
        startsAt: scheduledStartAt,
      }
    }

    if (scheduledStartAt != null && (scheduledStartAt > now || paidBaseTermState === 'non-renewing')) {
      return {
        badgeLabel: 'VIP Scheduled',
        endsAt,
        isActive: false,
        isScheduled: true,
        isVip: true,
        kind: 'vip-scheduled',
        startsAt: scheduledStartAt,
      }
    }

    if (windowOpen) {
      return {
        badgeLabel: 'VIP',
        endsAt,
        isActive: true,
        isScheduled: false,
        isVip: true,
        kind: 'vip-active',
        startsAt: scheduledStartAt,
      }
    }
  }

  const active = windowOpen

  if (active) {
    return {
      badgeLabel: 'Award',
      endsAt,
      isActive: true,
      isScheduled: false,
      isVip: false,
      kind: 'award',
      startsAt,
    }
  }

  return {
    badgeLabel: null,
    endsAt,
    isActive: false,
    isScheduled: false,
    isVip: endsAt == null,
    kind: 'none',
    startsAt,
  }
}

// ============================================================
// Helpers
// ============================================================

export function getEffectivePlan(
  entitlements: GrantStateInput | null,
): PlanTier {
  if (!entitlements) return 'free'

  const grantState = getAdminGrantState(entitlements)
  if (grantState.kind === 'award' || grantState.kind === 'vip-active') {
    return entitlements.adminGrantPlan ?? entitlements.plan
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
