import {describe, expect, it} from 'vitest'

import {getStripeCustomerId, getSubscriptionProjection, type StripeSubscriptionSnapshot} from './billing-projection'

function buildSubscription(overrides: Partial<StripeSubscriptionSnapshot> = {}): StripeSubscriptionSnapshot {
  return {
    cancel_at: null,
    cancel_at_period_end: false,
    current_period_end: null,
    customer: 'cus_test',
    id: 'sub_test',
    items: {
      data: [{
        price: {
          recurring: {
            interval: 'month',
          },
        },
        quantity: 1,
      }],
    },
    status: 'active',
    ...overrides,
  }
}

describe('billing projection helpers', () => {
  it('treats cancel-at-period-end subscriptions as non-renewing paid terms immediately', () => {
    const nextWeekSeconds = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60

    expect(getSubscriptionProjection(buildSubscription({
      cancel_at_period_end: true,
      current_period_end: nextWeekSeconds,
      status: 'active',
    }))).toMatchObject({
      billingPeriod: 'monthly',
      plan: 'pro',
      planStatus: 'canceled',
    })
  })

  it('keeps past-due subscriptions in the scheduled-cancel path once cancellation is set', () => {
    const nextWeekSeconds = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60

    expect(getSubscriptionProjection(buildSubscription({
      cancel_at_period_end: true,
      current_period_end: nextWeekSeconds,
      status: 'past_due',
    }))).toMatchObject({
      plan: 'pro',
      planStatus: 'canceled',
    })
  })

  it('extracts the customer id from string or expanded customer values', () => {
    expect(getStripeCustomerId('cus_direct')).toBe('cus_direct')
    expect(getStripeCustomerId({id: 'cus_expanded'})).toBe('cus_expanded')
    expect(getStripeCustomerId(null)).toBeNull()
  })
})

