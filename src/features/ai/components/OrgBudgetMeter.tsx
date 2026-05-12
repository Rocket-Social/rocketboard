// Wave 2 AI Kanban Phase 6-B — <OrgBudgetMeter>.
//
// Single-line horizontal meter that mounts on the /ai-agents shell
// between the page title and the PillTabs strip. Renders only when:
//
//   1. The org has a cap configured (cap_usd is not null), AND
//   2. The current viewer is an org admin — enforced server-side by
//      `get_org_budget_utilization` (RPC raises for non-admins). The
//      query catches the error by returning null, which causes this
//      component to silently render nothing.
//
// Per Phase 6 plan:
//   - §1.6 four threshold states (0-49 / 50-79 / 80-99 / 100+) with
//     bar color, Lucide icon, and text-only state name (D6-17 — never
//     color alone, WCAG 1.4.1).
//   - §1.6.5 admin journey arc — the "Edit" button opens
//     <EditOrgBudgetCapDialog> directly so the admin can self-serve
//     the cap bump without leaving the surface.
//   - D6-18 over-cap clamping: bar visual stays at 100% width when
//     percent_consumed > 100; text says "$X.XX / $Y.YY used. limit
//     reached."
//   - §4.3 a11y: role="progressbar" + aria-valuenow/min/max/text.

import {useState} from 'react'
import {AlertTriangle, HelpCircle, Info, OctagonAlert} from 'lucide-react'

import {Button} from '../../../components/ui/button'
import {useOrgBudgetUtilizationQuery} from '../ai.queries'
import {EditOrgBudgetCapDialog} from './EditOrgBudgetCapDialog'
import {AI_AGENTS_DOC_URL} from './HelpCallout'

type OrgBudgetMeterProps = {
  organizationId: string | null
}

type ThresholdState = {
  label: string
  copyPrefix: string
  barClassName: string
  textClassName: string
  icon: React.ComponentType<{className?: string; 'aria-hidden'?: 'true'}> | null
}

function classifyThreshold(percent: number): ThresholdState {
  if (percent >= 100) {
    return {
      label: 'limit reached',
      copyPrefix: 'limit reached — new runs paused. ',
      barClassName: 'bg-rose-600',
      textClassName: 'text-rose-700',
      icon: OctagonAlert,
    }
  }
  if (percent >= 80) {
    return {
      label: 'approaching limit',
      copyPrefix: 'approaching limit — ',
      barClassName: 'bg-orange-600',
      textClassName: 'text-orange-700',
      icon: AlertTriangle,
    }
  }
  if (percent >= 50) {
    return {
      label: 'on track',
      copyPrefix: '',
      barClassName: 'bg-amber-500',
      textClassName: 'text-text-medium',
      icon: Info,
    }
  }
  return {
    label: 'on track',
    copyPrefix: '',
    barClassName: 'bg-surface-muted',
    textClassName: 'text-text-medium',
    icon: null,
  }
}

function formatUsd(value: number): string {
  return '$' + value.toFixed(2)
}

export function OrgBudgetMeter({organizationId}: OrgBudgetMeterProps) {
  const [editOpen, setEditOpen] = useState(false)
  const utilizationQuery = useOrgBudgetUtilizationQuery(organizationId)

  // Non-admin or RPC error → null silently. Loading → small skeleton.
  if (utilizationQuery.isError) {
    return null
  }
  if (utilizationQuery.isPending) {
    return (
      <div
        aria-hidden='true'
        className='mb-6 h-8 w-full animate-pulse rounded-md bg-surface-muted'
        data-testid='org-budget-meter-loading'
      />
    )
  }

  const data = utilizationQuery.data
  if (!data || data.capUsd === null || data.capUsd === undefined) {
    // No cap configured for this org; meter doesn't apply. Render
    // nothing so the page doesn't shift around.
    return null
  }

  const spend = Number(data.calendarMonthSpendUsd ?? 0)
  const cap = Number(data.capUsd)
  const rawPercent = data.percentConsumed === null ? 0 : Number(data.percentConsumed)
  const percentClampedForBar = Math.min(rawPercent, 100)
  const percentRoundedForText = Math.max(0, Math.round(rawPercent))

  const threshold = classifyThreshold(rawPercent)
  const Icon = threshold.icon

  const usageCopy =
    threshold.copyPrefix
    + `${formatUsd(spend)} / ${formatUsd(cap)} used (${percentRoundedForText}%)`

  return (
    <>
      <section
        aria-label='AI agent monthly budget'
        className='mb-6 flex flex-col gap-2 sm:flex-row sm:items-center'
        data-testid='org-budget-meter'
      >
        <div
          className='h-2 w-full overflow-hidden rounded-full bg-surface-muted sm:flex-1'
          aria-hidden='true'
        >
          <div
            className={
              'h-full rounded-full transition-[width] duration-300 ease-out '
              + threshold.barClassName
            }
            style={{width: `${percentClampedForBar}%`}}
          />
        </div>

        <div
          className='flex items-center gap-2 text-xs sm:flex-shrink-0'
          role='progressbar'
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(rawPercent, 100)}
          aria-valuetext={`${formatUsd(spend)} of ${formatUsd(cap)} used (${percentRoundedForText}%)`}
        >
          {Icon ? (
            <Icon
              className={'h-3.5 w-3.5 ' + threshold.textClassName}
              aria-hidden='true'
            />
          ) : null}
          <span className={threshold.textClassName}>{usageCopy}</span>
          <a
            aria-label='How the cost cap works'
            className='inline-flex h-3.5 w-3.5 items-center justify-center text-text-muted hover:text-text-strong'
            data-testid='org-budget-meter-help'
            href={`${AI_AGENTS_DOC_URL}#cost-cap`}
            rel='noopener noreferrer'
            target='_blank'
            title='How the cost cap works'
          >
            <HelpCircle aria-hidden='true' className='h-3.5 w-3.5'/>
          </a>
          <Button
            data-testid='org-budget-meter-edit'
            onClick={() => setEditOpen(true)}
            size='compact'
            variant='ghost'
          >
            Edit
          </Button>
        </div>
      </section>

      <EditOrgBudgetCapDialog
        currentCapUsd={cap}
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        organizationId={organizationId ?? ''}
      />
    </>
  )
}
