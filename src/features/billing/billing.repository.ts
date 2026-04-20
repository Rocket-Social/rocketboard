import {IS_SELF_HOSTED} from '../../app/config'
import {callEdgeFunction} from '../../platform/edge/edge-client'

export type BillingInvoice = {
  id: string
  number: string | null
  status: string | null
  typeLabel: string
  currency: string
  totalCents: number
  amountDueCents: number
  amountPaidCents: number
  createdAt: string
  hostedInvoiceUrl: string | null
  invoicePdfUrl: string | null
}

export type PaymentMethodSummary = {
  id: string
  brand: string | null
  last4: string | null
  expMonth: number | null
  expYear: number | null
  billingName: string | null
  billingEmail: string | null
}

export const billingRepository = {
  async createCheckoutSession(orgId: string, billingPeriod: 'monthly' | 'yearly'): Promise<string> {
    if (IS_SELF_HOSTED) return 'https://rocketboard.app/pricing'
    const {url} = await callEdgeFunction<{url: string}>('billing-checkout', {body: {orgId, billingPeriod}})
    return url
  },

  async createPortalSession(orgId: string): Promise<string> {
    if (IS_SELF_HOSTED) return 'https://rocketboard.app/pricing'
    const {url} = await callEdgeFunction<{url: string}>('billing-portal-session', {body: {orgId}})
    return url
  },

  async getPaymentMethod(orgId: string): Promise<PaymentMethodSummary | null> {
    if (IS_SELF_HOSTED) return null
    const {paymentMethod} = await callEdgeFunction<{paymentMethod: PaymentMethodSummary | null}>(
      'billing-payment-method',
      {body: {orgId}},
    )
    return paymentMethod
  },

  async getInvoices(orgId: string): Promise<BillingInvoice[]> {
    if (IS_SELF_HOSTED) return []
    const {invoices} = await callEdgeFunction<{invoices: BillingInvoice[]}>('billing-invoices', {body: {orgId}})
    return invoices ?? []
  },
}
