/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

const updateMutateMock = vi.fn()
const toastMock = vi.fn()

vi.mock('../ai.queries', () => ({
  useUpdateOrgBudgetCapMutation: () => ({
    isPending: false,
    mutate: updateMutateMock,
  }),
}))

vi.mock('../../../components/ui/toast', () => ({
  useToast: () => ({toast: toastMock}),
}))

import {EditOrgBudgetCapDialog} from './EditOrgBudgetCapDialog'

afterEach(() => {
  cleanup()
  updateMutateMock.mockReset()
  toastMock.mockReset()
})

describe('<EditOrgBudgetCapDialog>', () => {
  it('hydrates the input from currentCapUsd on open', () => {
    render(
      <EditOrgBudgetCapDialog
        currentCapUsd={50}
        isOpen
        onClose={() => undefined}
        organizationId='org-1'
      />,
    )
    expect(screen.getByTestId('edit-org-budget-cap-input')).toHaveValue(50)
  })

  it('submits the parsed numeric value via the mutation', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <EditOrgBudgetCapDialog
        currentCapUsd={50}
        isOpen
        onClose={onClose}
        organizationId='org-1'
      />,
    )
    const input = screen.getByTestId('edit-org-budget-cap-input')
    await user.clear(input)
    await user.type(input, '75.50')
    await user.click(screen.getByTestId('edit-org-budget-cap-save'))

    expect(updateMutateMock).toHaveBeenCalledTimes(1)
    expect(updateMutateMock.mock.calls[0][0]).toEqual({
      organizationId: 'org-1',
      newCapUsd: 75.5,
    })
  })

  it('submits null when the input is cleared (removes the cap)', async () => {
    const user = userEvent.setup()
    render(
      <EditOrgBudgetCapDialog
        currentCapUsd={50}
        isOpen
        onClose={() => undefined}
        organizationId='org-1'
      />,
    )
    await user.clear(screen.getByTestId('edit-org-budget-cap-input'))
    await user.click(screen.getByTestId('edit-org-budget-cap-save'))

    expect(updateMutateMock).toHaveBeenCalledTimes(1)
    expect(updateMutateMock.mock.calls[0][0]).toEqual({
      organizationId: 'org-1',
      newCapUsd: null,
    })
  })

  it('rejects negative values inline without firing the mutation', async () => {
    const user = userEvent.setup()
    render(
      <EditOrgBudgetCapDialog
        currentCapUsd={50}
        isOpen
        onClose={() => undefined}
        organizationId='org-1'
      />,
    )
    const input = screen.getByTestId('edit-org-budget-cap-input')
    await user.clear(input)
    await user.type(input, '-5')
    await user.click(screen.getByTestId('edit-org-budget-cap-save'))

    expect(updateMutateMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/0 or greater/i)
  })

  it('rejects values above $999,999.99 inline', async () => {
    const user = userEvent.setup()
    render(
      <EditOrgBudgetCapDialog
        currentCapUsd={50}
        isOpen
        onClose={() => undefined}
        organizationId='org-1'
      />,
    )
    const input = screen.getByTestId('edit-org-budget-cap-input')
    await user.clear(input)
    await user.type(input, '1000000')
    await user.click(screen.getByTestId('edit-org-budget-cap-save'))

    expect(updateMutateMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/cannot exceed/i)
  })
})
