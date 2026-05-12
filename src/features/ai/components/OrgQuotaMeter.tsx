// Wave 2 AI Kanban Phase 7-B — <OrgQuotaMeter>.
//
// Free-tier dispatch quota meter. Mounts on the /ai-agents shell below
// the <OrgBudgetMeter>. Renders only when:
//
//   1. The org is on the free plan (data.isPaidPlan === false), AND
//   2. The current viewer is an org admin — enforced server-side by
//      `get_org_quota_utilization` (RPC raises for non-admins). The
//      query catches the error by returning null, which causes this
//      component to silently render nothing.
//
// Visual design mirrors <OrgBudgetMeter> for consistency: horizontal
// bar + threshold-colored icon + text. Two rows: dispatches/month and
// active recurring schedules.

import {AlertTriangle, Info, OctagonAlert} from 'lucide-react'

import {useOrgQuotaUtilizationQuery} from '../ai.queries'

type OrgQuotaMeterProps = {
  organizationId: string | null
}

type ThresholdState = {
  barClassName: string
  textClassName: string
  icon: React.ComponentType<{className?: string; 'aria-hidden'?: 'true'}> | null
}

function classifyThreshold(percent: number): ThresholdState {
  if (percent >= 100) {
    return {
      barClassName: 'bg-rose-600',
      textClassName: 'text-rose-700',
      icon: OctagonAlert,
    }
  }
  if (percent >= 80) {
    return {
      barClassName: 'bg-orange-600',
      textClassName: 'text-orange-700',
      icon: AlertTriangle,
    }
  }
  if (percent >= 50) {
    return {
      barClassName: 'bg-amber-500',
      textClassName: 'text-text-medium',
      icon: Info,
    }
  }
  return {
    barClassName: 'bg-surface-muted',
    textClassName: 'text-text-medium',
    icon: null,
  }
}

export function OrgQuotaMeter({organizationId}: OrgQuotaMeterProps) {
  const utilizationQuery = useOrgQuotaUtilizationQuery(organizationId)

  if (utilizationQuery.isError) {
    return null
  }
  if (utilizationQuery.isPending) {
    return (
      <div
        aria-hidden='true'
        className='mb-6 h-8 w-full animate-pulse rounded-md bg-surface-muted'
        data-testid='org-quota-meter-loading'
      />
    )
  }

  const data = utilizationQuery.data
  if (!data || data.isPaidPlan) {
    // Paid orgs (or no data) don't see a meter.
    return null
  }

  const dispatchesUsed = Math.max(0, Number(data.dispatchesUsed))
  const dispatchesLimit = Number(data.dispatchesLimit)
  const dispatchPercent = dispatchesLimit > 0
    ? Math.min(100, (dispatchesUsed / dispatchesLimit) * 100)
    : 0
  const dispatchPercentRoundedForText = Math.round(dispatchPercent)

  const recurringUsed = Math.max(0, Number(data.recurringUsed))
  const recurringLimit = Number(data.recurringLimit)
  const recurringClampedForDisplay = Math.min(recurringUsed, recurringLimit)
  const recurringOverGrandfathered = recurringUsed > recurringLimit

  const dispatchThreshold = classifyThreshold(dispatchPercent)
  const DispatchIcon = dispatchThreshold.icon

  const dispatchCopy =
    dispatchesUsed >= dispatchesLimit
      ? `${dispatchesUsed} of ${dispatchesLimit} dispatches used this month — `
      : `${dispatchesUsed} of ${dispatchesLimit} dispatches used this month`

  return (
    <section
      aria-label='AI agent free-tier quota'
      className='mb-6 space-y-3'
      data-testid='org-quota-meter'
    >
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
        <div
          className='h-2 w-full overflow-hidden rounded-full bg-surface-muted sm:flex-1'
          aria-hidden='true'
        >
          <div
            className={
              'h-full rounded-full transition-[width] duration-300 ease-out '
              + dispatchThreshold.barClassName
            }
            style={{width: `${dispatchPercent}%`}}
          />
        </div>

        <div
          className='flex items-center gap-2 text-xs sm:flex-shrink-0'
          role='progressbar'
          aria-valuemin={0}
          aria-valuemax={dispatchesLimit}
          aria-valuenow={Math.min(dispatchesUsed, dispatchesLimit)}
          aria-valuetext={`${dispatchesUsed} of ${dispatchesLimit} dispatches used (${dispatchPercentRoundedForText}%)`}
        >
          {DispatchIcon ? (
            <DispatchIcon
              className={'h-3.5 w-3.5 ' + dispatchThreshold.textClassName}
              aria-hidden='true'
            />
          ) : null}
          <span className={dispatchThreshold.textClassName}>{dispatchCopy}</span>
          {dispatchesUsed >= dispatchesLimit ? (
            <a
              className='font-medium text-primary underline-offset-2 hover:underline'
              data-testid='org-quota-meter-upgrade-link'
              href='/settings/billing'
            >
              Upgrade →
            </a>
          ) : null}
        </div>
      </div>

      <div className='flex items-center gap-2 text-xs text-text-medium' data-testid='org-quota-meter-recurring'>
        <span>
          {recurringClampedForDisplay} of {recurringLimit} active recurring schedule
          {recurringLimit === 1 ? '' : 's'}
          {recurringOverGrandfathered
            ? ` (${recurringUsed} active — grandfathered)`
            : ''}
        </span>
        {recurringUsed >= recurringLimit ? (
          <a
            className='font-medium text-primary underline-offset-2 hover:underline'
            data-testid='org-quota-meter-recurring-upgrade-link'
            href='/settings/billing'
          >
            Upgrade →
          </a>
        ) : null}
      </div>
    </section>
  )
}
