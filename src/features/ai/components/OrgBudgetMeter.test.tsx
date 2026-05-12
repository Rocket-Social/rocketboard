/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

import type {OrgBudgetUtilization} from '../org-budget.repository'

const updateMutateMock = vi.fn()
const toastMock = vi.fn()

const {state} = vi.hoisted(() => ({
  state: {
    data: null as OrgBudgetUtilization | null,
    isError: false as boolean,
    isPending: false as boolean,
  },
}))

vi.mock('../ai.queries', () => ({
  useOrgBudgetUtilizationQuery: () => ({
    data: state.data,
    isError: state.isError,
    isPending: state.isPending,
  }),
  useUpdateOrgBudgetCapMutation: () => ({
    isPending: false,
    mutate: updateMutateMock,
  }),
}))

vi.mock('../../../components/ui/toast', () => ({
  useToast: () => ({toast: toastMock}),
}))

import {OrgBudgetMeter} from './OrgBudgetMeter'

function setData(percent: number, capUsd: number = 100): void {
  state.data = {
    calendarMonthSpendUsd: (percent / 100) * capUsd,
    capUsd,
    percentConsumed: percent,
    monthWindowStartTs: '2026-05-01T00:00:00Z',
  }
  state.isError = false
  state.isPending = false
}

afterEach(() => {
  cleanup()
  updateMutateMock.mockReset()
  toastMock.mockReset()
  state.data = null
  state.isError = false
  state.isPending = false
})

describe('<OrgBudgetMeter>', () => {
  it('renders nothing when the query errors (admin gate failed for non-admins)', () => {
    state.isError = true
    state.data = null
    const {container} = render(<OrgBudgetMeter organizationId='org-1'/>)
    expect(container.querySelector('[data-testid="org-budget-meter"]')).toBeNull()
  })

  it('renders nothing when the org has no cap configured', () => {
    state.data = {
      calendarMonthSpendUsd: 5,
      capUsd: null,
      percentConsumed: null,
      monthWindowStartTs: '2026-05-01T00:00:00Z',
    }
    const {container} = render(<OrgBudgetMeter organizationId='org-1'/>)
    expect(container.querySelector('[data-testid="org-budget-meter"]')).toBeNull()
  })

  it('renders a skeleton row while loading', () => {
    state.isPending = true
    state.data = null
    render(<OrgBudgetMeter organizationId='org-1'/>)
    expect(screen.getByTestId('org-budget-meter-loading')).toBeInTheDocument()
  })

  it('shows gray bar + no icon at 0-49% (on track)', () => {
    setData(25)
    render(<OrgBudgetMeter organizationId='org-1'/>)
    expect(screen.getByTestId('org-budget-meter')).toBeInTheDocument()
    expect(screen.getByText(/\$25\.00 \/ \$100\.00 used \(25%\)/)).toBeInTheDocument()
  })

  it('shows amber bar + Info icon at 50-79%', () => {
    setData(60)
    const {container} = render(<OrgBudgetMeter organizationId='org-1'/>)
    expect(container.querySelector('.bg-amber-500')).toBeInTheDocument()
  })

  it('shows orange bar + AlertTriangle + "approaching limit" at 80-99%', () => {
    setData(85)
    const {container} = render(<OrgBudgetMeter organizationId='org-1'/>)
    expect(container.querySelector('.bg-orange-600')).toBeInTheDocument()
    expect(screen.getByText(/approaching limit/i)).toBeInTheDocument()
  })

  it('shows rose bar + OctagonAlert + "limit reached" at 100%+', () => {
    setData(100, 50)
    const {container} = render(<OrgBudgetMeter organizationId='org-1'/>)
    expect(container.querySelector('.bg-rose-600')).toBeInTheDocument()
    expect(screen.getByText(/limit reached/i)).toBeInTheDocument()
  })

  it('clamps the bar to 100% width when over-cap, but the text shows real numbers (D6-18)', () => {
    state.data = {
      calendarMonthSpendUsd: 51,
      capUsd: 50,
      percentConsumed: 102,
      monthWindowStartTs: '2026-05-01T00:00:00Z',
    }
    const {container} = render(<OrgBudgetMeter organizationId='org-1'/>)
    const fill = container.querySelector('div[style*="width"]') as HTMLElement | null
    expect(fill?.style.width).toBe('100%')
    expect(screen.getByText(/\$51\.00 \/ \$50\.00 used \(102%\)/)).toBeInTheDocument()
  })

  it('exposes role="progressbar" with aria-valuenow + aria-valuetext for screen readers', () => {
    setData(60)
    render(<OrgBudgetMeter organizationId='org-1'/>)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '60')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
    expect(bar.getAttribute('aria-valuetext')).toMatch(/\$60\.00 of \$100\.00 used \(60%\)/)
  })

  it('Edit button opens the EditOrgBudgetCapDialog', async () => {
    setData(25)
    const user = userEvent.setup()
    render(<OrgBudgetMeter organizationId='org-1'/>)
    await user.click(screen.getByTestId('org-budget-meter-edit'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByTestId('edit-org-budget-cap-input')).toHaveValue(100)
  })
})
