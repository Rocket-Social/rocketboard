export type OrgVipSnapshot = {
  admin_grant_ends_at: string | null
  admin_grant_plan: string | null
  admin_grant_starts_at: string | null
  plan: string | null
  plan_ends_at: string | null
  plan_status: string | null
  stripe_subscription_id: string | null
  vip_cancellation_managed: boolean | null
  vip_canceled_subscription_id: string | null
}

export type VipGrantState =
  | {
    kind: 'none'
    startsAt: null
  }
  | {
    kind: 'vip-active'
    startsAt: string | null
  }
  | {
    kind: 'vip-blocked'
    startsAt: string | null
  }
  | {
    kind: 'vip-scheduled'
    startsAt: string
  }

type PaidBaseTermState = 'none' | 'non-renewing' | 'renewing'

export type VipGrantDecision =
  | {
    cancellationManaged: false
    kind: 'immediate'
    requiresStripeCancellation: false
    startsAt: null
  }
  | {
    cancellationManaged: boolean
    kind: 'scheduled'
    requiresStripeCancellation: false
    startsAt: string
  }
  | {
    cancellationManaged: true
    kind: 'scheduled'
    requiresStripeCancellation: true
    startsAt: null
  }

function toTime(value: string | null): number | null {
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? null : parsed
}

function isPaidPlan(plan: string | null): boolean {
  return plan === 'pro' || plan === 'enterprise'
}

function getPaidBaseTermState(
  org: Pick<OrgVipSnapshot, 'plan' | 'plan_ends_at' | 'plan_status'>,
  now = Date.now(),
): PaidBaseTermState {
  if (!isPaidPlan(org.plan)) return 'none'

  if (org.plan_status === 'active' || org.plan_status === 'past_due') {
    return 'renewing'
  }

  const planEndsAt = toTime(org.plan_ends_at)
  return org.plan_status === 'canceled' && planEndsAt !== null && planEndsAt > now
    ? 'non-renewing'
    : 'none'
}

export function hasActivePaidBaseTerm(org: Pick<OrgVipSnapshot, 'plan' | 'plan_ends_at' | 'plan_status'>, now = Date.now()): boolean {
  return getPaidBaseTermState(org, now) !== 'none'
}

function hasGrantWindowRemaining(org: Pick<OrgVipSnapshot, 'admin_grant_ends_at' | 'admin_grant_plan'>, now = Date.now()): boolean {
  if (!org.admin_grant_plan) return false

  const endsAt = toTime(org.admin_grant_ends_at)
  if (endsAt !== null && endsAt <= now) return false

  return true
}

export function getVipGrantState(org: OrgVipSnapshot, now = Date.now()): VipGrantState {
  if (org.admin_grant_plan !== 'pro' || org.admin_grant_ends_at !== null) {
    return {kind: 'none', startsAt: null}
  }

  if (!hasGrantWindowRemaining(org, now)) {
    return {kind: 'none', startsAt: null}
  }

  const startsAt = org.admin_grant_starts_at
  const scheduledStartAt = startsAt ?? org.plan_ends_at

  const paidBaseTermState = getPaidBaseTermState(org, now)
  if (!startsAt && paidBaseTermState === 'none') {
    return {kind: 'vip-active', startsAt: null}
  }

  const startsAtTime = toTime(scheduledStartAt)

  if (paidBaseTermState === 'renewing') {
    return {kind: 'vip-blocked', startsAt: scheduledStartAt}
  }

  if (scheduledStartAt && (startsAtTime === null || startsAtTime > now || paidBaseTermState === 'non-renewing')) {
    return {kind: 'vip-scheduled', startsAt: scheduledStartAt}
  }

  return {kind: 'vip-active', startsAt}
}

export function isVipActive(org: OrgVipSnapshot, now = Date.now()): boolean {
  return getVipGrantState(org, now).kind === 'vip-active'
}

export function isVipBlocked(org: OrgVipSnapshot, now = Date.now()): boolean {
  return getVipGrantState(org, now).kind === 'vip-blocked'
}

export function isVipScheduled(org: OrgVipSnapshot, now = Date.now()): boolean {
  return getVipGrantState(org, now).kind === 'vip-scheduled'
}

export function decideVipGrantApplication(org: OrgVipSnapshot, now = Date.now()): VipGrantDecision {
  const grantState = getVipGrantState(org, now)
  const paidBaseTermState = getPaidBaseTermState(org, now)

  if (grantState.kind === 'vip-active') {
    return {
      kind: 'immediate',
      startsAt: null,
      cancellationManaged: false,
      requiresStripeCancellation: false,
    }
  }

  if (grantState.kind === 'vip-scheduled' && grantState.startsAt) {
    return {
      kind: 'scheduled',
      startsAt: grantState.startsAt,
      cancellationManaged: Boolean(org.vip_cancellation_managed),
      requiresStripeCancellation: false,
    }
  }

  if (paidBaseTermState === 'renewing' && isPaidPlan(org.plan)) {
    return {
      kind: 'scheduled',
      startsAt: null,
      cancellationManaged: true,
      requiresStripeCancellation: true,
    }
  }

  if (paidBaseTermState !== 'none' && org.plan_ends_at) {
    return {
      kind: 'scheduled',
      startsAt: org.plan_ends_at,
      cancellationManaged: Boolean(org.vip_cancellation_managed),
      requiresStripeCancellation: false,
    }
  }

  return {
    kind: 'immediate',
    startsAt: null,
    cancellationManaged: false,
    requiresStripeCancellation: false,
  }
}

export function shouldRestoreVipManagedCancellation(org: OrgVipSnapshot, now = Date.now()): boolean {
  return Boolean(
    org.vip_cancellation_managed
    && org.stripe_subscription_id
    && org.vip_canceled_subscription_id
    && org.stripe_subscription_id === org.vip_canceled_subscription_id
    && org.plan_status === 'canceled'
    && hasActivePaidBaseTerm(org, now),
  )
}

export function getVipBillingBlock(org: OrgVipSnapshot, now = Date.now()): {code: string; message: string} | null {
  const grantState = getVipGrantState(org, now)

  if (grantState.kind === 'vip-active') {
    return {
      code: 'VIP_BILLING_LOCKED',
      message: 'This organization is on VIP. Self-serve billing changes are disabled while VIP is active.',
    }
  }

  if (grantState.kind === 'vip-scheduled') {
    const startsAt = new Date(grantState.startsAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    return {
      code: 'VIP_BILLING_LOCKED',
      message: `VIP is scheduled to activate on ${startsAt}. Self-serve billing changes are disabled until the transition completes.`,
    }
  }

  return null
}
