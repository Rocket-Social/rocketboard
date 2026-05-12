export type StripeSubscriptionSnapshot = {
  id: string
  cancel_at?: number | null
  cancel_at_period_end?: boolean
  created?: number
  customer?: string | {id?: string} | null
  current_period_end?: number | null
  items?: {
    data?: Array<{
      price?: {
        recurring?: {
          interval?: 'month' | 'year' | null
        } | null
      } | null
      quantity?: number
    }>
  }
  status?: string
}

export type StripeBillingPeriod = 'monthly' | 'yearly'

export type BillingProjection = {
  billingPeriod: StripeBillingPeriod | null
  isEntitled: boolean
  plan: 'free' | 'pro'
  planEndsAt: string | null
  planStatus: 'active' | 'past_due' | 'canceled'
}

export const PRO_LIMITS = {members: -1, projects: -1, workspaces: -1, storage_mb: -1}
export const FREE_LIMITS = {members: 5, projects: 10, workspaces: 1, storage_mb: 1024}

export function getStripeCustomerId(customer: StripeSubscriptionSnapshot['customer']): string | null {
  if (!customer) return null
  if (typeof customer === 'string') return customer
  return customer.id ?? null
}

export function getBillingPeriod(
  subscription: Pick<StripeSubscriptionSnapshot, 'items'>,
): StripeBillingPeriod | null {
  const interval = subscription.items?.data?.[0]?.price?.recurring?.interval
  if (interval === 'year') return 'yearly'
  if (interval === 'month') return 'monthly'
  return null
}

export function getSubscriptionProjection(
  subscription: Pick<
    StripeSubscriptionSnapshot,
    'cancel_at' | 'cancel_at_period_end' | 'current_period_end' | 'items' | 'status'
  >,
  nowMs = Date.now(),
): BillingProjection {
  const status = subscription.status ?? null
  const cancelAtPeriodEnd = subscription.cancel_at_period_end === true
  const nowSeconds = Math.floor(nowMs / 1000)
  const cancelAtFuture = typeof subscription.cancel_at === 'number' && subscription.cancel_at > nowSeconds
  const cancellationScheduled = cancelAtPeriodEnd || cancelAtFuture
  const isEntitled = status === 'active' || status === 'trialing' || status === 'past_due'

  let planStatus: BillingProjection['planStatus'] = 'active'
  if (cancellationScheduled) {
    planStatus = 'canceled'
  } else if (status === 'past_due') {
    planStatus = 'past_due'
  } else if (!isEntitled) {
    planStatus = 'canceled'
  }

  let planEndsAt: string | null = null
  if (cancelAtFuture && typeof subscription.cancel_at === 'number') {
    planEndsAt = new Date(subscription.cancel_at * 1000).toISOString()
  } else if (cancelAtPeriodEnd && typeof subscription.current_period_end === 'number') {
    planEndsAt = new Date(subscription.current_period_end * 1000).toISOString()
  }

  return {
    billingPeriod: getBillingPeriod(subscription),
    isEntitled,
    plan: isEntitled ? 'pro' : 'free',
    planEndsAt,
    planStatus,
  }
}

