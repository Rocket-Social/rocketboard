import {describe, expect, it} from 'vitest'

import {
  formatLimitValue,
  formatPrice,
  formatStorageSize,
  getEffectivePlan,
  getPlanName,
  getYearlySavings,
  isWithinLimit,
  type UsageLimits,
} from './entitlement.types'

describe('getEffectivePlan', () => {
  it('returns free when no entitlements', () => {
    expect(getEffectivePlan(null)).toBe('free')
  })

  it('returns base plan when no grant', () => {
    expect(getEffectivePlan({plan: 'free', adminGrantPlan: null, adminGrantEndsAt: null})).toBe('free')
    expect(getEffectivePlan({plan: 'pro', adminGrantPlan: null, adminGrantEndsAt: null})).toBe('pro')
  })

  it('returns grant plan when VIP (no expiry)', () => {
    expect(getEffectivePlan({plan: 'free', adminGrantPlan: 'pro', adminGrantEndsAt: null})).toBe('pro')
  })

  it('returns grant plan when award is active', () => {
    const future = Date.now() + 86400000 // tomorrow
    expect(getEffectivePlan({plan: 'free', adminGrantPlan: 'pro', adminGrantEndsAt: future})).toBe('pro')
  })

  it('returns base plan when award has expired', () => {
    const past = Date.now() - 86400000 // yesterday
    expect(getEffectivePlan({plan: 'free', adminGrantPlan: 'pro', adminGrantEndsAt: past})).toBe('free')
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
