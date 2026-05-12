import {describe, expect, it, vi} from 'vitest'

// Must mock env before importing the module
vi.stubEnv('VITE_SELF_HOSTED', 'true')

const {billingRepository} = await import('./billing.repository')

describe('billingRepository (self-hosted mode)', () => {
  it('createCheckoutSession returns pricing page URL', async () => {
    const url = await billingRepository.createCheckoutSession('org-1', 'monthly')
    expect(url).toBe('https://rocketboard.app/pricing')
  })

  it('createPortalSession returns pricing page URL', async () => {
    const url = await billingRepository.createPortalSession('org-1')
    expect(url).toBe('https://rocketboard.app/pricing')
  })

  it('getPaymentMethod returns null', async () => {
    const result = await billingRepository.getPaymentMethod('org-1')
    expect(result).toBeNull()
  })

  it('getInvoices returns empty array', async () => {
    const result = await billingRepository.getInvoices('org-1')
    expect(result).toEqual([])
  })
})
