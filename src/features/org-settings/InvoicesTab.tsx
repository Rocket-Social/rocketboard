import {Download, FileText} from 'lucide-react'
import {useEffect, useState} from 'react'

import {billingRepository, type BillingInvoice} from '../billing/billing.repository'

type InvoicesTabProps = {
  orgId: string
  canManage: boolean
}

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(cents / 100)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {year: 'numeric', month: 'short', day: 'numeric'})
}

function statusLabel(status: string | null): string {
  if (!status) return '\u2014'
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function InvoicesTab({orgId, canManage}: InvoicesTabProps) {
  const [invoices, setInvoices] = useState<BillingInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!canManage) return
    let cancelled = false
    setLoading(true)
    setError(null)
    billingRepository.getInvoices(orgId)
      .then(data => { if (!cancelled) setInvoices(data) })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load invoices') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [orgId, canManage])

  if (!canManage) {
    return <p className='py-8 text-sm text-text-muted'>Only organization admins can view invoices.</p>
  }

  if (loading) {
    return (
      <div className='space-y-3'>
        {[1, 2, 3].map(i => <div key={i} className='h-12 animate-pulse rounded-lg bg-surface-muted'/>)}
      </div>
    )
  }

  if (error) {
    return <p className='py-8 text-center text-sm text-error'>{error}</p>
  }

  if (invoices.length === 0) {
    return (
      <div className='rounded-xl border border-border-subtle bg-surface-base p-6'>
        <h3 className='text-xs font-semibold uppercase tracking-wider text-text-muted'>Invoices</h3>
        <div className='mt-6 py-8 text-center'>
          <FileText className='mx-auto h-10 w-10 text-text-muted/30'/>
          <p className='mt-3 text-sm text-text-medium'>No invoices yet</p>
          <p className='mt-1 text-xs text-text-muted'>
            Your first invoice will appear after your first billing cycle.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className='rounded-xl border border-border-subtle bg-surface-base'>
      <div className='px-6 py-4'>
        <h3 className='text-xs font-semibold uppercase tracking-wider text-text-muted'>Invoices</h3>
      </div>
      <table className='w-full'>
        <thead>
          <tr className='border-y border-border-subtle'>
            <th className='px-6 py-3 text-left text-xs font-medium text-text-muted'>Date</th>
            <th className='px-6 py-3 text-left text-xs font-medium text-text-muted'>Amount</th>
            <th className='px-6 py-3 text-left text-xs font-medium text-text-muted'>Type</th>
            <th className='px-6 py-3 text-left text-xs font-medium text-text-muted'>Status</th>
            <th className='px-6 py-3 text-left text-xs font-medium text-text-muted'>Actions</th>
          </tr>
        </thead>
        <tbody className='divide-y divide-border-subtle'>
          {invoices.map(inv => (
            <tr key={inv.id} className='hover:bg-canvas-accent'>
              <td className='whitespace-nowrap px-6 py-3 text-sm text-text-strong'>{formatDate(inv.createdAt)}</td>
              <td className='whitespace-nowrap px-6 py-3 text-sm text-text-strong'>
                {formatCurrency(inv.totalCents, inv.currency)}
              </td>
              <td className='px-6 py-3 text-sm text-text-muted'>{inv.typeLabel}</td>
              <td className='px-6 py-3'>
                <span className='inline-flex rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success'>
                  {statusLabel(inv.status)}
                </span>
              </td>
              <td className='px-6 py-3'>
                {(inv.invoicePdfUrl ?? inv.hostedInvoiceUrl) ? (
                  <a
                    className='inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-strong'
                    href={inv.invoicePdfUrl ?? inv.hostedInvoiceUrl ?? '#'}
                    rel='noreferrer'
                    target='_blank'
                  >
                    <Download className='h-3.5 w-3.5'/>
                    PDF
                  </a>
                ) : '\u2014'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
