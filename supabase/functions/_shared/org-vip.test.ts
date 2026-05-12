import {describe, expect, it} from 'vitest'

import {
  decideVipGrantApplication,
  getVipBillingBlock,
  getVipGrantState,
  hasActivePaidBaseTerm,
  isVipActive,
  isVipBlocked,
  isVipScheduled,
  shouldRestoreVipManagedCancellation,
  type OrgVipSnapshot,
} from './org-vip'

function buildOrgVipSnapshot(overrides: Partial<OrgVipSnapshot> = {}): OrgVipSnapshot {
  return {
    admin_grant_ends_at: null,
    admin_grant_plan: null,
    admin_grant_starts_at: null,
    plan: 'free',
    plan_ends_at: null,
    plan_status: 'canceled',
    stripe_subscription_id: null,
    vip_cancellation_managed: false,
    vip_canceled_subscription_id: null,
    ...overrides,
  }
}

describe('org-vip billing state helpers', () => {
  it('treats canceled paid plans with a future end date as an active paid term', () => {
    const futureEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    expect(hasActivePaidBaseTerm(buildOrgVipSnapshot({
      plan: 'pro',
      plan_ends_at: futureEnd,
      plan_status: 'canceled',
    }))).toBe(true)
  })

  it('classifies future-start VIP as scheduled', () => {
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const org = buildOrgVipSnapshot({
      admin_grant_plan: 'pro',
      admin_grant_starts_at: futureStart,
      plan: 'pro',
      plan_ends_at: futureStart,
      plan_status: 'canceled',
    })

    expect(isVipScheduled(org)).toBe(true)
    expect(isVipActive(org)).toBe(false)
  })

  it('keeps VIP inactive when renewal was restored before activation', () => {
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const org = buildOrgVipSnapshot({
      admin_grant_plan: 'pro',
      admin_grant_starts_at: nextWeek,
      plan: 'pro',
      plan_status: 'active',
      stripe_subscription_id: 'sub_live',
      vip_cancellation_managed: true,
      vip_canceled_subscription_id: 'sub_live',
    })

    expect(isVipActive(org)).toBe(false)
    expect(isVipScheduled(org)).toBe(false)
    expect(isVipBlocked(org)).toBe(true)
    expect(getVipGrantState(org)).toMatchObject({kind: 'vip-blocked', startsAt: nextWeek})
  })

  it('schedules Stripe cancellation for renewing paid orgs', () => {
    expect(decideVipGrantApplication(buildOrgVipSnapshot({
      plan: 'pro',
      plan_status: 'active',
      stripe_subscription_id: 'sub_live',
    }))).toMatchObject({
      cancellationManaged: true,
      kind: 'scheduled',
      requiresStripeCancellation: true,
      startsAt: null,
    })
  })

  it('re-schedules cancellation when a VIP grant is on hold behind a renewed paid term', () => {
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    expect(decideVipGrantApplication(buildOrgVipSnapshot({
      admin_grant_plan: 'pro',
      admin_grant_starts_at: nextWeek,
      plan: 'pro',
      plan_status: 'active',
      stripe_subscription_id: 'sub_live',
      vip_cancellation_managed: true,
      vip_canceled_subscription_id: 'sub_live',
    }))).toMatchObject({
      cancellationManaged: true,
      kind: 'scheduled',
      requiresStripeCancellation: true,
      startsAt: null,
    })
  })

  it('activates VIP immediately for free orgs even when the base plan status is active', () => {
    expect(decideVipGrantApplication(buildOrgVipSnapshot({
      plan: 'free',
      plan_status: 'active',
    }))).toMatchObject({
      cancellationManaged: false,
      kind: 'immediate',
      requiresStripeCancellation: false,
      startsAt: null,
    })
  })

  it('reuses the existing plan end date when cancellation is already scheduled', () => {
    const futureEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    expect(decideVipGrantApplication(buildOrgVipSnapshot({
      plan: 'pro',
      plan_ends_at: futureEnd,
      plan_status: 'canceled',
      stripe_subscription_id: 'sub_live',
    }))).toMatchObject({
      cancellationManaged: false,
      kind: 'scheduled',
      requiresStripeCancellation: false,
      startsAt: futureEnd,
    })
  })

  it('blocks self-serve billing while VIP is pending or active', () => {
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    expect(getVipBillingBlock(buildOrgVipSnapshot({
      admin_grant_plan: 'pro',
      admin_grant_starts_at: futureStart,
      plan: 'pro',
      plan_ends_at: futureStart,
      plan_status: 'canceled',
    }))?.code).toBe('VIP_BILLING_LOCKED')

    expect(getVipBillingBlock(buildOrgVipSnapshot({
      admin_grant_plan: 'pro',
      plan: 'free',
      plan_status: 'canceled',
    }))?.code).toBe('VIP_BILLING_LOCKED')
  })

  it('does not block billing controls when a VIP grant is on hold behind an active paid subscription', () => {
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    expect(getVipBillingBlock(buildOrgVipSnapshot({
      admin_grant_plan: 'pro',
      admin_grant_starts_at: futureStart,
      plan: 'pro',
      plan_status: 'active',
      stripe_subscription_id: 'sub_live',
      vip_cancellation_managed: true,
      vip_canceled_subscription_id: 'sub_live',
    }))).toBeNull()
  })

  it('restores renewal only for the managed subscription that is still current', () => {
    const futureEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    expect(shouldRestoreVipManagedCancellation(buildOrgVipSnapshot({
      admin_grant_plan: 'pro',
      admin_grant_starts_at: futureEnd,
      plan: 'pro',
      plan_ends_at: futureEnd,
      plan_status: 'canceled',
      stripe_subscription_id: 'sub_live',
      vip_cancellation_managed: true,
      vip_canceled_subscription_id: 'sub_live',
    }))).toBe(true)

    expect(shouldRestoreVipManagedCancellation(buildOrgVipSnapshot({
      admin_grant_plan: 'pro',
      admin_grant_starts_at: futureEnd,
      plan: 'pro',
      plan_ends_at: futureEnd,
      plan_status: 'canceled',
      stripe_subscription_id: 'sub_new',
      vip_cancellation_managed: true,
      vip_canceled_subscription_id: 'sub_old',
    }))).toBe(false)
  })
})
