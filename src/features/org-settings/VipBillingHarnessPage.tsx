import {useQueryClient} from '@tanstack/react-query'

import type {OrganizationEntitlements, OrgUsage} from '../billing/entitlement.types'
import {BillingTab} from './BillingTab'

const HARNESS_ORG_ID = '00000000-0000-0000-0000-000000000001'
const PENDING_VIP_START_AT = new Date('2099-05-05T12:00:00.000Z').getTime()

const pendingVipEntitlements: OrganizationEntitlements = {
  adminGrantEndsAt: null,
  adminGrantPlan: 'pro',
  adminGrantStartsAt: PENDING_VIP_START_AT,
  billingPeriod: 'monthly',
  hasBillingCustomer: true,
  limits: {members: -1, projects: -1, storage_mb: -1, workspaces: -1},
  plan: 'pro',
  planEndsAt: PENDING_VIP_START_AT,
  planStatus: 'canceled',
  storageUsedBytes: 0,
  vipCanceledSubscriptionId: 'sub_test_vip',
  vipCancellationManaged: true,
}

const pendingVipUsage: OrgUsage = {
  effectivePlan: 'pro',
  limits: {members: -1, projects: -1, storage_mb: -1, workspaces: -1},
  memberCount: 3,
  projectCount: 7,
  storageUsedBytes: 256 * 1024 * 1024,
  workspaceCount: 2,
}

function seedHarnessQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.setQueryData(['org-entitlements', HARNESS_ORG_ID, true], pendingVipEntitlements)
  queryClient.setQueryData(['org-usage', HARNESS_ORG_ID], pendingVipUsage)
}

export function VipBillingHarnessPage() {
  const queryClient = useQueryClient()
  seedHarnessQueries(queryClient)

  return (
    <div className='mx-auto max-w-5xl px-6 py-10'>
      <h1 className='font-display text-2xl font-semibold text-text-strong'>VIP Billing Harness</h1>
      <p className='mt-2 text-sm text-text-muted'>
        Pending VIP billing transition for browser verification.
      </p>
      <div className='mt-8'>
        <BillingTab canManage={true} orgId={HARNESS_ORG_ID}/>
      </div>
    </div>
  )
}
