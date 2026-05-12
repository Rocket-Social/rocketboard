/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { OrgQuotaMeter } from './OrgQuotaMeter'

const utilizationQueryState: {
  data: {
    isPaidPlan: boolean
    dispatchesUsed: number
    dispatchesLimit: number
    recurringUsed: number
    recurringLimit: number
    monthWindowStartTs: string
  } | null | undefined
  isError: boolean
  isPending: boolean
} = {
  data: undefined,
  isError: false,
  isPending: false,
}

vi.mock('../ai.queries', () => ({
  useOrgQuotaUtilizationQuery: () => utilizationQueryState,
}))

afterEach(() => {
  cleanup()
  utilizationQueryState.data = undefined
  utilizationQueryState.isError = false
  utilizationQueryState.isPending = false
})

describe('OrgQuotaMeter', () => {
  it('renders nothing when the query errors (non-admin path)', () => {
    utilizationQueryState.isError = true
    const { container } = render(<OrgQuotaMeter organizationId='org-1' />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for paid orgs', () => {
    utilizationQueryState.data = {
      isPaidPlan: true,
      dispatchesUsed: 0,
      dispatchesLimit: -1,
      recurringUsed: 0,
      recurringLimit: -1,
      monthWindowStartTs: '2026-05-01T00:00:00.000Z',
    }
    const { container } = render(<OrgQuotaMeter organizationId='org-1' />)
    expect(container.firstChild).toBeNull()
  })

  it('renders text and meter for free org under threshold', () => {
    utilizationQueryState.data = {
      isPaidPlan: false,
      dispatchesUsed: 12,
      dispatchesLimit: 100,
      recurringUsed: 0,
      recurringLimit: 1,
      monthWindowStartTs: '2026-05-01T00:00:00.000Z',
    }
    render(<OrgQuotaMeter organizationId='org-1' />)
    expect(screen.getByText('12 of 100 dispatches used this month')).toBeInTheDocument()
    expect(screen.queryByTestId('org-quota-meter-upgrade-link')).not.toBeInTheDocument()
  })

  it('renders Upgrade link when dispatches at limit (free org)', () => {
    utilizationQueryState.data = {
      isPaidPlan: false,
      dispatchesUsed: 100,
      dispatchesLimit: 100,
      recurringUsed: 1,
      recurringLimit: 1,
      monthWindowStartTs: '2026-05-01T00:00:00.000Z',
    }
    render(<OrgQuotaMeter organizationId='org-1' />)
    expect(screen.getByTestId('org-quota-meter-upgrade-link')).toBeInTheDocument()
    expect(screen.getByTestId('org-quota-meter-recurring-upgrade-link')).toBeInTheDocument()
  })

  it('shows grandfathered active count when recurring exceeds limit', () => {
    utilizationQueryState.data = {
      isPaidPlan: false,
      dispatchesUsed: 5,
      dispatchesLimit: 100,
      recurringUsed: 3,  // grandfathered: more than the limit
      recurringLimit: 1,
      monthWindowStartTs: '2026-05-01T00:00:00.000Z',
    }
    render(<OrgQuotaMeter organizationId='org-1' />)
    const recurringLine = screen.getByTestId('org-quota-meter-recurring')
    expect(recurringLine).toHaveTextContent('1 of 1 active recurring schedule')
    expect(recurringLine).toHaveTextContent('(3 active — grandfathered)')
  })

  it('renders loading skeleton while query is pending', () => {
    utilizationQueryState.isPending = true
    render(<OrgQuotaMeter organizationId='org-1' />)
    expect(screen.getByTestId('org-quota-meter-loading')).toBeInTheDocument()
  })
})
