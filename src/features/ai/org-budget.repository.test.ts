import {beforeEach, describe, expect, it, vi} from 'vitest'

import {rpcAdapter} from '../../platform/data/rpc-adapter'
import {orgBudgetRepository} from './org-budget.repository'

describe('orgBudgetRepository', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('getUtilization uses rpcAdapter.callSingle and returns the camelCased row', async () => {
    const callSingleSpy = vi.spyOn(rpcAdapter, 'callSingle').mockResolvedValueOnce({
      calendarMonthSpendUsd: 12.5,
      capUsd: 50,
      percentConsumed: 25,
      monthWindowStartTs: '2026-05-01T00:00:00Z',
    })

    const result = await orgBudgetRepository.getUtilization('org-1')

    expect(callSingleSpy).toHaveBeenCalledWith('get_org_budget_utilization', {
      target_org_id: 'org-1',
    })
    expect(result).toEqual({
      calendarMonthSpendUsd: 12.5,
      capUsd: 50,
      percentConsumed: 25,
      monthWindowStartTs: '2026-05-01T00:00:00Z',
    })
  })

  it('updateCap uses rpcAdapter.call (NOT callSingle) for the scalar return', async () => {
    const callSpy = vi.spyOn(rpcAdapter, 'call').mockResolvedValueOnce(75.5)

    const result = await orgBudgetRepository.updateCap('org-1', 75.5)

    expect(callSpy).toHaveBeenCalledWith('update_org_budget_cap', {
      target_org_id: 'org-1',
      new_cap_usd: 75.5,
    })
    expect(result).toBe(75.5)
  })

  it('updateCap coerces string-typed numeric returns from PostgREST to number', async () => {
    vi.spyOn(rpcAdapter, 'call').mockResolvedValueOnce('100.00')

    const result = await orgBudgetRepository.updateCap('org-1', 100)

    expect(result).toBe(100)
  })

  it('updateCap passes null through to clear the cap', async () => {
    const callSpy = vi.spyOn(rpcAdapter, 'call').mockResolvedValueOnce(null)

    const result = await orgBudgetRepository.updateCap('org-1', null)

    expect(callSpy).toHaveBeenCalledWith('update_org_budget_cap', {
      target_org_id: 'org-1',
      new_cap_usd: null,
    })
    expect(result).toBeNull()
  })
})
