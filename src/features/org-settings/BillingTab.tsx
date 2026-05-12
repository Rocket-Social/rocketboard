import {CreditCard, ExternalLink} from 'lucide-react'
import {useEffect, useState} from 'react'

import {Badge} from '../../components/ui/badge'
import {Button} from '../../components/ui/button'
import {useToast} from '../../components/ui/toast'
import {UpgradeModal} from '../billing/UpgradeModal'
import {UsageBar} from '../billing/UsageBar'
import {billingRepository} from '../billing/billing.repository'
import {useOrgEntitlementsQuery, useOrgUsageQuery} from '../billing/entitlement.queries'
import {type BillingPeriod, getAdminGrantState, getEffectivePlan, getPlanName} from '../billing/entitlement.types'
import {setUpgradeModalCallback, clearUpgradeModalCallback} from '../billing/useEntitlements'

type BillingTabProps = {
  orgId: string
  canManage: boolean
}

const BILLING_PERIOD_END_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

export function BillingTab({orgId, canManage}: BillingTabProps) {
  const entitlementsQuery = useOrgEntitlementsQuery(orgId, {includeAdminDetails: canManage})
  const usageQuery = useOrgUsageQuery(orgId)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const {toast} = useToast()

  useEffect(() => {
    setUpgradeModalCallback(() => setUpgradeOpen(true))
    return () => clearUpgradeModalCallback()
  }, [])

  const entitlements = entitlementsQuery.data
  const usage = usageQuery.data

  if (entitlementsQuery.isPending || usageQuery.isPending) {
    return (
      <div className='space-y-4'>
        <div className='h-48 animate-pulse rounded-xl bg-surface-muted'/>
      </div>
    )
  }

  if (!entitlements || !usage) {
    return <p className='py-8 text-center text-sm text-text-muted'>Couldn&apos;t load plan info. Try refreshing.</p>
  }

  const effectivePlan = getEffectivePlan(entitlements)
  const isPro = effectivePlan === 'pro' || effectivePlan === 'enterprise'
  const grantState = getAdminGrantState(entitlements)
  const isBlockedVip = grantState.kind === 'vip-blocked'
  const isPendingVip = grantState.kind === 'vip-scheduled'
  const isActiveVip = grantState.kind === 'vip-active'
  const displayPlan = isPendingVip ? entitlements.plan : effectivePlan
  const planBadgeLabel = grantState.badgeLabel ?? getPlanName(displayPlan)
  const planBadgeVariant = grantState.kind === 'award'
    ? 'plan-award'
    : grantState.kind === 'none'
      ? 'plan-pro'
      : 'plan-vip'
  const formattedPlanEndsAt = entitlements.planEndsAt == null
    ? null
    : BILLING_PERIOD_END_DATE_FORMATTER.format(entitlements.planEndsAt)
  const formattedGrantStart = grantState.startsAt == null
    ? null
    : BILLING_PERIOD_END_DATE_FORMATTER.format(grantState.startsAt)

  const handleOpenPortal = async () => {
    if (!canManage) return
    setPortalLoading(true)
    try {
      const url = await billingRepository.createPortalSession(orgId)
      window.location.assign(url)
    } catch (err) {
      toast({title: 'Failed to open billing portal', description: err instanceof Error ? err.message : undefined, variant: 'error'})
      setPortalLoading(false)
    }
  }

  const handleUpgrade = async (period: BillingPeriod) => {
    if (!canManage) return
    try {
      const url = await billingRepository.createCheckoutSession(orgId, period)
      window.location.assign(url)
    } catch (err) {
      toast({title: 'Failed to start checkout', description: err instanceof Error ? err.message : undefined, variant: 'error'})
    }
    setUpgradeOpen(false)
  }

  // Free user layout: usage bars + upgrade CTA
  if (!isPro && grantState.kind === 'none') {
    return (
      <>
        <div className='rounded-xl border border-border-subtle bg-surface-base p-6'>
          <div className='flex items-center gap-3'>
            <h3 className='font-display text-lg font-semibold text-text-strong'>Free Plan</h3>
            <Badge variant='plan-free'>Free</Badge>
          </div>

          <div className='mt-6 space-y-4'>
            <UsageBar label='Members' current={usage.memberCount} max={usage.limits.members}/>
            <UsageBar label='Projects' current={usage.projectCount} max={usage.limits.projects}/>
            <UsageBar label='Workspaces' current={usage.workspaceCount} max={usage.limits.workspaces}/>
            <UsageBar
              label='Storage'
              current={Math.round(usage.storageUsedBytes / (1024 * 1024))}
              max={usage.limits.storage_mb}
            />
          </div>

          <div className='mt-6'>
            {canManage ? (
              <>
                <Button onClick={() => setUpgradeOpen(true)} variant='primary'>
                  Upgrade to Pro &mdash; $7/user/mo
                </Button>
                <p className='mt-2 text-xs text-text-muted'>or $60/year (save 29%)</p>
              </>
            ) : (
              <p className='text-sm text-text-muted'>An organization admin can manage billing and upgrades.</p>
            )}
          </div>
        </div>

        <UpgradeModal
          open={upgradeOpen}
          onClose={() => setUpgradeOpen(false)}
          currentMemberCount={usage.memberCount}
          onUpgrade={handleUpgrade}
        />
      </>
    )
  }

  // Pro / Award / VIP layout: plan card + payment management
  return (
    <>
      <div className='space-y-6'>
        {isPendingVip && canManage && formattedGrantStart ? (
          <div className='rounded-xl border border-primary/20 bg-primary/5 p-5'>
            <p className='text-sm font-medium text-text-strong'>VIP is scheduled for this organization.</p>
            <p className='mt-2 text-sm text-text-medium'>
              You stay on paid Pro until <span className='font-medium text-text-strong'>{formattedGrantStart}</span>.
              Billing will not renew after that date, and VIP activates automatically on the same day.
            </p>
            <p className='mt-2 text-xs text-text-muted'>
              Invoices for the current paid term remain available until the switch happens.
            </p>
          </div>
        ) : null}

        {isBlockedVip && canManage ? (
          <div className='rounded-xl border border-warning/30 bg-warning/5 p-5'>
            <p className='text-sm font-medium text-text-strong'>VIP is on hold for this organization.</p>
            <p className='mt-2 text-sm text-text-medium'>
              This organization still has an active paid subscription, so VIP will not activate while billing remains active.
              Manage in Stripe if you want the paid term to end and let VIP take over afterward.
            </p>
            <p className='mt-2 text-xs text-text-muted'>
              Billing and invoices stay available while the paid subscription remains active.
            </p>
          </div>
        ) : null}

        {/* Plan status card */}
        <div className='rounded-xl border border-border-subtle bg-surface-base p-6'>
          <div className='flex items-center gap-3'>
            <h3 className='font-display text-lg font-semibold text-text-strong'>
              {getPlanName(displayPlan)} Plan
            </h3>
            <Badge variant={planBadgeVariant}>{planBadgeLabel}</Badge>
          </div>

          {(grantState.kind === 'none' || isPendingVip || isBlockedVip) && (
            <div className='mt-3 space-y-1'>
              <p className='text-sm text-text-medium'>
                $7/user/mo &middot; {usage.memberCount} seats &middot; ${(usage.memberCount * 7).toFixed(0)}/mo
              </p>
              {entitlements.billingPeriod === 'yearly' && (
                <p className='text-xs text-text-muted'>Billed annually at $60/user/yr</p>
              )}
            </div>
          )}

          {grantState.kind === 'none' && entitlements.planStatus === 'canceled' && effectivePlan === 'pro' && (
            <div className='mt-3 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-text-medium'>
              Subscription canceled &mdash; your plan ends{' '}
              <span className='font-medium text-text-strong'>
                {formattedPlanEndsAt
                  ? `on ${formattedPlanEndsAt}`
                  : 'at the end of the current billing period'}
              </span>
              . Resubscribe from Manage in Stripe to keep Pro.
            </div>
          )}

          {grantState.kind === 'award' && entitlements.adminGrantEndsAt && (
            <p className='mt-3 text-sm text-text-medium'>
              Award expires {new Date(entitlements.adminGrantEndsAt).toLocaleDateString()}
            </p>
          )}

          {isActiveVip && (
            <p className='mt-3 text-sm text-text-medium'>No expiration</p>
          )}

          {isPendingVip && formattedGrantStart ? (
            <p className='mt-3 text-sm text-text-medium'>
              VIP begins on {formattedGrantStart}. Billing controls are locked until then.
            </p>
          ) : null}

          {isBlockedVip ? (
            <p className='mt-3 text-sm text-text-medium'>
              VIP is on hold while this organization still has an active paid subscription.
            </p>
          ) : null}
        </div>

        {/* Payment method (not shown for Award/VIP) */}
        {canManage && (grantState.kind === 'none' || isBlockedVip) && (
          <div className='rounded-xl border border-border-subtle bg-surface-base p-6'>
            <h3 className='mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted'>Payment Method</h3>
            <div className='flex items-center gap-3'>
              <CreditCard className='h-5 w-5 text-text-muted'/>
              <span className='text-sm text-text-medium'>
                {entitlements.hasBillingCustomer ? 'Billing account connected' : 'No billing account on file'}
              </span>
            </div>
            <Button
              className='mt-4'
              disabled={portalLoading}
              onClick={() => void handleOpenPortal()}
              size='compact'
              variant='secondary'
            >
              <ExternalLink className='h-3.5 w-3.5'/>
              {portalLoading ? 'Opening...' : 'Manage in Stripe'}
            </Button>
          </div>
        )}
      </div>

      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        currentMemberCount={usage.memberCount}
        onUpgrade={handleUpgrade}
      />
    </>
  )
}
