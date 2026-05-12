// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import {cleanup, render, screen} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {BillingTab} from './BillingTab'
import type {OrganizationEntitlements} from '../billing/entitlement.types'

function buildEntitlements(overrides: Partial<OrganizationEntitlements> = {}): OrganizationEntitlements {
  return {
    adminGrantEndsAt: null,
    adminGrantPlan: null,
    adminGrantStartsAt: null,
    billingPeriod: 'monthly',
    hasBillingCustomer: true,
    limits: {members: -1, projects: -1, storage_mb: -1, workspaces: -1},
    plan: 'pro',
    planStatus: 'active',
    planEndsAt: null,
    storageUsedBytes: 0,
    vipCanceledSubscriptionId: null,
    vipCancellationManaged: false,
    ...overrides,
  }
}

const state = {
  entitlements: buildEntitlements(),
  usage: {
    limits: {members: 10, projects: 10, storage_mb: 1024, workspaces: 10},
    memberCount: 1,
    projectCount: 2,
    storageUsedBytes: 128 * 1024 * 1024,
    workspaceCount: 1,
  },
}

function futureDateMs(): number {
  return Date.now() + 7 * 24 * 60 * 60 * 1000
}

vi.mock('../../components/ui/toast', () => ({
  useToast: () => ({toast: vi.fn()}),
}))

vi.mock('../billing/UpgradeModal', () => ({
  UpgradeModal: () => null,
}))

vi.mock('../billing/UsageBar', () => ({
  UsageBar: () => null,
}))

vi.mock('../billing/billing.repository', () => ({
  billingRepository: {
    createCheckoutSession: vi.fn(),
    createPortalSession: vi.fn(),
  },
}))

vi.mock('../billing/entitlement.queries', () => ({
  useOrgEntitlementsQuery: () => ({
    data: state.entitlements,
    isPending: false,
  }),
  useOrgUsageQuery: () => ({
    data: state.usage,
    isPending: false,
  }),
}))

vi.mock('../billing/useEntitlements', () => ({
  clearUpgradeModalCallback: vi.fn(),
  setUpgradeModalCallback: vi.fn(),
}))

describe('BillingTab', () => {
  afterEach(() => {
    cleanup()
    state.entitlements = buildEntitlements()
  })

  it('shows the exact billing-period end date for canceled subscriptions', () => {
    const planEndsAt = new Date('2026-05-05T12:00:00.000Z').getTime()
    const formattedDate = new Date(planEndsAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

    state.entitlements = buildEntitlements({
      planEndsAt,
      planStatus: 'canceled',
    })

    render(<BillingTab canManage={true} orgId='org-1'/>)

    expect(screen.getByText(/Subscription canceled/)).toHaveTextContent(
      `Subscription canceled — your plan ends on ${formattedDate}. Resubscribe from Manage in Stripe to keep Pro.`,
    )
  })

  it('shows the pending VIP billing notice and hides billing controls', () => {
    const startsAt = futureDateMs()
    const formattedDate = new Date(startsAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

    state.entitlements = buildEntitlements({
      adminGrantPlan: 'pro',
      adminGrantStartsAt: startsAt,
      plan: 'pro',
      planEndsAt: startsAt,
      planStatus: 'canceled',
    })

    render(<BillingTab canManage={true} orgId='org-1'/>)

    expect(screen.getByText('VIP is scheduled for this organization.')).toBeInTheDocument()
    expect(screen.getByText('Invoices for the current paid term remain available until the switch happens.')).toBeInTheDocument()
    expect(screen.getByText(`VIP begins on ${formattedDate}. Billing controls are locked until then.`)).toBeInTheDocument()
    expect(screen.queryByRole('button', {name: /Manage in Stripe/i})).not.toBeInTheDocument()
  })

  it('shows VIP on hold copy and keeps Stripe management available when the paid term is active again', () => {
    const startsAt = new Date('2026-05-05T12:00:00.000Z').getTime()

    state.entitlements = buildEntitlements({
      adminGrantPlan: 'pro',
      adminGrantStartsAt: startsAt,
      plan: 'pro',
      planEndsAt: null,
      planStatus: 'active',
    })

    render(<BillingTab canManage={true} orgId='org-1'/>)

    expect(screen.getByText('VIP is on hold for this organization.')).toBeInTheDocument()
    expect(screen.getByText('VIP On Hold')).toBeInTheDocument()
    expect(screen.getByRole('button', {name: /Manage in Stripe/i})).toBeInTheDocument()
    expect(screen.queryByText(/VIP begins on/)).not.toBeInTheDocument()
  })
})
