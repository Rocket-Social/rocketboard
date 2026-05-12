import {describe, expect, it} from 'vitest'

import {
  formatLimitValue,
  formatPrice,
  formatStorageSize,
  getAdminGrantState,
  getEffectivePlan,
  getPlanName,
  getYearlySavings,
  hasActivePaidBaseTerm,
  isWithinLimit,
  type GrantStateInput,
  type UsageLimits,
} from './entitlement.types'

function buildGrantInput(overrides: Partial<GrantStateInput> = {}): GrantStateInput {
  return {
    adminGrantEndsAt: null,
    adminGrantPlan: null,
    adminGrantStartsAt: null,
    plan: 'free',
    planEndsAt: null,
    planStatus: 'active',
    ...overrides,
  }
}

describe('getEffectivePlan', () => {
  it('returns free when no entitlements', () => {
    expect(getEffectivePlan(null)).toBe('free')
  })

  it('returns base plan when no grant', () => {
    expect(getEffectivePlan(buildGrantInput({plan: 'free'}))).toBe('free')
    expect(getEffectivePlan(buildGrantInput({plan: 'pro'}))).toBe('pro')
  })

  it('returns grant plan when VIP (no expiry)', () => {
    expect(getEffectivePlan(buildGrantInput({adminGrantPlan: 'pro', adminGrantStartsAt: null}))).toBe('pro')
  })

  it('returns grant plan when award is active', () => {
    const future = Date.now() + 86400000 // tomorrow
    expect(getEffectivePlan(buildGrantInput({adminGrantEndsAt: future, adminGrantPlan: 'pro'}))).toBe('pro')
  })

  it('returns base plan when award has expired', () => {
    const past = Date.now() - 86400000 // yesterday
    expect(getEffectivePlan(buildGrantInput({adminGrantEndsAt: past, adminGrantPlan: 'pro'}))).toBe('free')
  })

  it('returns the base plan for future-start VIP while the current paid term is still active', () => {
    const nextWeek = Date.now() + 7 * 24 * 60 * 60 * 1000

    expect(getEffectivePlan(buildGrantInput({
      adminGrantEndsAt: null,
      adminGrantPlan: 'pro',
      adminGrantStartsAt: nextWeek,
      plan: 'enterprise',
      planEndsAt: nextWeek,
      planStatus: 'canceled',
    }))).toBe('enterprise')
  })

  it('returns the base plan when a paid term is restored after VIP was scheduled', () => {
    const yesterday = Date.now() - 24 * 60 * 60 * 1000

    expect(getEffectivePlan(buildGrantInput({
      adminGrantEndsAt: null,
      adminGrantPlan: 'pro',
      adminGrantStartsAt: yesterday,
      plan: 'enterprise',
      planEndsAt: null,
      planStatus: 'active',
    }))).toBe('enterprise')
  })
})

describe('getAdminGrantState', () => {
  it('classifies pending VIP separately from active VIP', () => {
    const nextWeek = Date.now() + 7 * 24 * 60 * 60 * 1000

    expect(getAdminGrantState(buildGrantInput({
      adminGrantEndsAt: null,
      adminGrantPlan: 'pro',
      adminGrantStartsAt: nextWeek,
      plan: 'pro',
      planEndsAt: nextWeek,
      planStatus: 'canceled',
    }))).toMatchObject({badgeLabel: 'VIP Scheduled', kind: 'vip-scheduled'})
  })

  it('falls back to the current paid-term end date when admin-only startsAt is unavailable', () => {
    const nextWeek = Date.now() + 7 * 24 * 60 * 60 * 1000

    expect(getAdminGrantState(buildGrantInput({
      adminGrantEndsAt: null,
      adminGrantPlan: 'pro',
      adminGrantStartsAt: null,
      plan: 'pro',
      planEndsAt: nextWeek,
      planStatus: 'canceled',
    }))).toMatchObject({kind: 'vip-scheduled', startsAt: nextWeek})
  })

  it('classifies renewed paid terms as VIP on hold instead of scheduled', () => {
    const nextWeek = Date.now() + 7 * 24 * 60 * 60 * 1000

    expect(getAdminGrantState(buildGrantInput({
      adminGrantEndsAt: null,
      adminGrantPlan: 'pro',
      adminGrantStartsAt: nextWeek,
      plan: 'pro',
      planEndsAt: null,
      planStatus: 'active',
    }))).toMatchObject({badgeLabel: 'VIP On Hold', kind: 'vip-blocked'})
  })

  it('keeps VIP on hold even when the admin-only startsAt is unavailable', () => {
    expect(getAdminGrantState(buildGrantInput({
      adminGrantEndsAt: null,
      adminGrantPlan: 'pro',
      adminGrantStartsAt: null,
      plan: 'pro',
      planEndsAt: null,
      planStatus: 'active',
    }))).toMatchObject({badgeLabel: 'VIP On Hold', kind: 'vip-blocked'})
  })
})

describe('hasActivePaidBaseTerm', () => {
  it('treats canceled paid plans with a future end date as still active', () => {
    const nextWeek = Date.now() + 7 * 24 * 60 * 60 * 1000
    expect(hasActivePaidBaseTerm(buildGrantInput({
      plan: 'pro',
      planEndsAt: nextWeek,
      planStatus: 'canceled',
    }))).toBe(true)
  })
})

describe('isWithinLimit', () => {
  const limits: UsageLimits = {members: 5, projects: 10, workspaces: 1, storage_mb: 1024}

  it('returns true when below limit', () => {
    expect(isWithinLimit(limits, 'members', 3)).toBe(true)
  })

  it('returns false when at limit', () => {
    expect(isWithinLimit(limits, 'members', 5)).toBe(false)
  })

  it('returns false when above limit', () => {
    expect(isWithinLimit(limits, 'members', 7)).toBe(false)
  })

  it('returns true when unlimited (-1)', () => {
    const unlimitedLimits: UsageLimits = {members: -1, projects: -1, workspaces: -1, storage_mb: -1}
    expect(isWithinLimit(unlimitedLimits, 'members', 100)).toBe(true)
  })
})

describe('formatPrice', () => {
  it('returns Free for zero', () => {
    expect(formatPrice(0)).toBe('Free')
  })

  it('formats monthly price', () => {
    expect(formatPrice(700, 'monthly')).toBe('$7/mo')
  })

  it('formats yearly price', () => {
    expect(formatPrice(6000, 'yearly')).toBe('$60/yr')
  })
})

describe('getYearlySavings', () => {
  it('returns 0 for free plan', () => {
    expect(getYearlySavings(0, 0)).toBe(0)
  })

  it('calculates savings percentage', () => {
    // $7/mo monthly, $5/mo yearly. Full yearly = $7*12 = $84. Actual = $5*12 = $60.
    // Savings = (84-60)/84 = 29%
    expect(getYearlySavings(700, 6000)).toBe(29)
  })
})

describe('formatLimitValue', () => {
  it('returns Unlimited for -1', () => {
    expect(formatLimitValue(-1)).toBe('Unlimited')
  })

  it('formats numbers', () => {
    expect(formatLimitValue(5)).toBe('5')
  })
})

describe('formatStorageSize', () => {
  it('returns Unlimited for -1', () => {
    expect(formatStorageSize(-1)).toBe('Unlimited')
  })

  it('formats MB', () => {
    expect(formatStorageSize(512)).toBe('512 MB')
  })

  it('formats GB', () => {
    expect(formatStorageSize(1024)).toBe('1 GB')
    expect(formatStorageSize(5120)).toBe('5 GB')
  })
})

describe('getPlanName', () => {
  it('returns correct names', () => {
    expect(getPlanName('free')).toBe('Free')
    expect(getPlanName('pro')).toBe('Pro')
    expect(getPlanName('enterprise')).toBe('Enterprise')
  })
})
