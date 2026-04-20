import {Check, Minus} from 'lucide-react'
import {useState} from 'react'

import {Button} from '../../components/ui/button'
import {Dialog, DialogContent, DialogTitle} from '../../components/ui/dialog'
import {type BillingPeriod, formatPrice, getYearlySavings, PLAN_PRICING} from './entitlement.types'

type UpgradeModalProps = {
  open: boolean
  onClose: () => void
  currentMemberCount: number
  onUpgrade: (billingPeriod: BillingPeriod) => void
}

const FREE_LIMITS = [
  {label: '5 members', included: true},
  {label: '10 projects', included: true},
  {label: '1 workspace', included: true},
  {label: '1 GB storage', included: true},
  {label: 'All views & features', included: true},
  {label: 'Basic automations', included: true},
  {label: 'Priority support', included: false},
]

const PRO_FEATURES = [
  {label: 'Unlimited members', included: true},
  {label: 'Unlimited workspaces', included: true},
  {label: 'Unlimited projects', included: true},
  {label: 'Unlimited storage', included: true},
  {label: 'All views & features', included: true},
  {label: 'All automations', included: true},
  {label: 'Priority support', included: true},
]

export function UpgradeModal({open, onClose, currentMemberCount, onUpgrade}: UpgradeModalProps) {
  const [period, setPeriod] = useState<BillingPeriod>('monthly')

  const pricePerUser = period === 'monthly' ? PLAN_PRICING.pro.monthly : Math.round(PLAN_PRICING.pro.yearly / 12)
  const savings = getYearlySavings(PLAN_PRICING.pro.monthly, PLAN_PRICING.pro.yearly)
  const seatCount = Math.max(currentMemberCount, 1)
  const totalCents = period === 'monthly'
    ? PLAN_PRICING.pro.monthly * seatCount
    : PLAN_PRICING.pro.yearly * seatCount
  const totalDollars = totalCents / 100
  const totalSuffix = period === 'monthly' ? '/mo' : '/year'

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className='w-full max-w-[680px] rounded-2xl bg-surface-elevated p-8 shadow-lg'>
        <DialogTitle className='text-center font-display text-xl'>
          Upgrade to Pro
        </DialogTitle>

        <div className='mt-4 flex items-center justify-center gap-2'>
          <div className='inline-flex rounded-full border border-border-subtle bg-surface-muted p-0.5'>
            <button
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                period === 'monthly'
                  ? 'bg-surface-elevated text-text-strong shadow-sm'
                  : 'text-text-muted hover:text-text-strong'
              }`}
              onClick={() => setPeriod('monthly')}
              type='button'
            >
              Monthly
            </button>
            <button
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                period === 'yearly'
                  ? 'bg-surface-elevated text-text-strong shadow-sm'
                  : 'text-text-muted hover:text-text-strong'
              }`}
              onClick={() => setPeriod('yearly')}
              type='button'
            >
              Annual
            </button>
          </div>
          {period === 'yearly' && (
            <span className='rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success'>
              {savings}% off
            </span>
          )}
        </div>

        <div className='mt-6 grid gap-4 sm:grid-cols-2'>
          <div className='rounded-xl border border-border-subtle bg-surface-base p-5'>
            <h3 className='font-display text-lg font-semibold text-text-strong'>Free</h3>
            <p className='mt-1 font-display text-2xl font-bold text-text-strong'>$0</p>
            <p className='mt-1 text-xs text-text-muted'>Current plan</p>
            <ul className='mt-4 space-y-2.5'>
              {FREE_LIMITS.map((item) => (
                <li key={item.label} className='flex items-center gap-2 text-sm text-text-medium'>
                  {item.included ? (
                    <Check className='h-4 w-4 shrink-0 text-text-muted'/>
                  ) : (
                    <Minus className='h-4 w-4 shrink-0 text-text-muted/40'/>
                  )}
                  <span className={item.included ? '' : 'text-text-muted/60'}>{item.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className='rounded-xl border-2 border-primary bg-surface-base p-5'>
            <h3 className='font-display text-lg font-semibold text-text-strong'>Pro</h3>
            <p className='mt-1 font-display text-2xl font-bold text-text-strong'>
              {formatPrice(pricePerUser, 'monthly')}
              <span className='text-sm font-normal text-text-muted'>/user</span>
            </p>
            <p className='mt-1 text-xs text-text-muted'>
              {period === 'yearly' ? `${formatPrice(PLAN_PRICING.pro.yearly, 'yearly')}/user billed annually` : 'billed monthly'}
            </p>
            <ul className='mt-4 space-y-2.5'>
              {PRO_FEATURES.map((item) => (
                <li key={item.label} className='flex items-center gap-2 text-sm text-text-medium'>
                  <Check className='h-4 w-4 shrink-0 text-primary'/>
                  {item.label}
                </li>
              ))}
            </ul>
            <Button
              className='mt-6 w-full'
              onClick={() => onUpgrade(period)}
              variant='primary'
            >
              Upgrade to Pro
            </Button>
          </div>
        </div>

        <p className='mt-4 text-center text-sm text-text-muted'>
          For your team of {currentMemberCount} = ${totalDollars.toFixed(0)}{totalSuffix}
        </p>

        <button
          className='mt-2 block w-full text-center text-sm text-text-muted underline-offset-2 hover:underline'
          onClick={onClose}
          type='button'
        >
          Maybe later
        </button>
      </DialogContent>
    </Dialog>
  )
}
