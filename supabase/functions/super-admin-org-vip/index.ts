import {decideVipGrantApplication, getVipGrantState, shouldRestoreVipManagedCancellation} from '../_shared/org-vip.ts'
import {getStripeCustomerId, getSubscriptionProjection, type BillingProjection} from '../_shared/billing-projection.ts'
import {
  createServiceClient,
  errorResponse,
  errorResponseForException,
  handleCors,
  HttpError,
  jsonResponse,
  parseJsonBody,
  requireInternalAdmin,
  z,
} from '../_shared/supabase.ts'
import {withMonitoring} from '../_shared/monitoring.ts'
import {setStripeSubscriptionCancelAtPeriodEnd} from '../_shared/stripe.ts'

export const SuperAdminOrgVipBodySchema = z.object({
  action: z.enum(['grant', 'revoke']),
  orgId: z.string().uuid(),
})

type OrgVipRow = {
  admin_grant_ends_at: string | null
  admin_grant_plan: string | null
  admin_grant_starts_at: string | null
  id: string
  plan: string | null
  plan_ends_at: string | null
  plan_status: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  vip_cancellation_managed: boolean | null
  vip_canceled_subscription_id: string | null
}

const ORG_VIP_SELECT = [
  'id',
  'plan',
  'plan_status',
  'plan_ends_at',
  'stripe_customer_id',
  'stripe_subscription_id',
  'admin_grant_plan',
  'admin_grant_starts_at',
  'admin_grant_ends_at',
  'vip_cancellation_managed',
  'vip_canceled_subscription_id',
].join(', ')

async function loadOrganization(orgId: string): Promise<OrgVipRow> {
  const supabase = createServiceClient()
  const {data: organization} = await supabase
    .from('organizations')
    .select(ORG_VIP_SELECT)
    .eq('id', orgId)
    .single()

  if (!organization) {
    throw new HttpError('Organization not found', 404, 'ORG_NOT_FOUND')
  }

  return organization
}

type VipBillingProjectionMutation = {
  projection: BillingProjection
  stripeCustomerId: string | null
  stripeSubscriptionId: string
}

async function persistVipGrant(args: {
  adminUserId: string
  billingProjection?: VipBillingProjectionMutation
  cancellationManaged: boolean
  canceledSubscriptionId: string | null
  orgId: string
  startsAt: string | null
}) {
  const supabase = createServiceClient()
  const {error} = await supabase.rpc('internal_admin_set_org_vip_grant', {
    p_admin_user_id: args.adminUserId,
    p_canceled_subscription_id: args.canceledSubscriptionId,
    p_cancellation_managed: args.cancellationManaged,
    p_org_id: args.orgId,
    p_starts_at: args.startsAt,
    p_apply_billing_projection: Boolean(args.billingProjection),
    p_base_billing_period: args.billingProjection?.projection.billingPeriod ?? null,
    p_base_plan: args.billingProjection?.projection.plan ?? null,
    p_base_plan_ends_at: args.billingProjection?.projection.planEndsAt ?? null,
    p_base_plan_status: args.billingProjection?.projection.planStatus ?? null,
    p_base_stripe_customer_id: args.billingProjection?.stripeCustomerId ?? null,
    p_base_stripe_subscription_id: args.billingProjection?.stripeSubscriptionId ?? null,
  })

  if (error) throw error
}

async function revokeVipGrant(args: {
  adminUserId: string
  billingProjection?: VipBillingProjectionMutation
  orgId: string
}) {
  const supabase = createServiceClient()
  const {error} = await supabase.rpc('internal_admin_revoke_org_vip_grant', {
    p_admin_user_id: args.adminUserId,
    p_apply_billing_projection: Boolean(args.billingProjection),
    p_base_billing_period: args.billingProjection?.projection.billingPeriod ?? null,
    p_base_plan: args.billingProjection?.projection.plan ?? null,
    p_base_plan_ends_at: args.billingProjection?.projection.planEndsAt ?? null,
    p_base_plan_status: args.billingProjection?.projection.planStatus ?? null,
    p_base_stripe_customer_id: args.billingProjection?.stripeCustomerId ?? null,
    p_base_stripe_subscription_id: args.billingProjection?.stripeSubscriptionId ?? null,
    p_org_id: args.orgId,
  })

  if (error) throw error
}

// VIP scheduling flow:
// paid + renewing -> schedule cancel_at_period_end -> pending VIP
// pending VIP -> term ends -> active VIP
// revoke pending -> restore renewal only if this flow created the cancellation
async function handleGrant(orgId: string, adminUserId: string) {
  const organization = await loadOrganization(orgId)
  const grantState = getVipGrantState(organization)

  if (grantState.kind === 'vip-active') {
    return jsonResponse({
      action: 'grant',
      cancellationManaged: false,
      mode: 'immediate',
      startsAt: null,
    })
  }

  if (grantState.kind === 'vip-scheduled') {
    return jsonResponse({
      action: 'grant',
      cancellationManaged: Boolean(organization.vip_cancellation_managed),
      mode: 'scheduled',
      startsAt: grantState.startsAt,
    })
  }

  const decision = decideVipGrantApplication(organization)
  if (decision.requiresStripeCancellation) {
    if (!organization.stripe_subscription_id) {
      throw new HttpError(
        'Rocketboard could not find the canonical Stripe subscription for this organization.',
        409,
        'VIP_SUBSCRIPTION_MISSING',
      )
    }

    const updatedSubscription = await setStripeSubscriptionCancelAtPeriodEnd(organization.stripe_subscription_id, true)
    const billingProjection = getSubscriptionProjection(updatedSubscription)
    const startsAt = billingProjection.planEndsAt

    if (!startsAt) {
      await setStripeSubscriptionCancelAtPeriodEnd(organization.stripe_subscription_id, false)
      throw new HttpError(
        'Stripe did not return the end of the current billing period.',
        502,
        'VIP_STRIPE_PERIOD_END_MISSING',
      )
    }

    try {
      await persistVipGrant({
        adminUserId,
        billingProjection: {
          projection: billingProjection,
          stripeCustomerId: getStripeCustomerId(updatedSubscription.customer) ?? organization.stripe_customer_id,
          stripeSubscriptionId: updatedSubscription.id,
        },
        cancellationManaged: true,
        canceledSubscriptionId: organization.stripe_subscription_id,
        orgId,
        startsAt,
      })
    } catch (error) {
      await setStripeSubscriptionCancelAtPeriodEnd(organization.stripe_subscription_id, false)
      throw error
    }

    return jsonResponse({
      action: 'grant',
      cancellationManaged: true,
      mode: 'scheduled',
      startsAt,
    })
  }

  const startsAt = decision.kind === 'scheduled' ? decision.startsAt : null
  await persistVipGrant({
    adminUserId,
    cancellationManaged: decision.cancellationManaged,
    canceledSubscriptionId: organization.stripe_subscription_id,
    orgId,
    startsAt,
  })

  return jsonResponse({
    action: 'grant',
    cancellationManaged: decision.cancellationManaged,
    mode: decision.kind,
    startsAt,
  })
}

async function handleRevoke(orgId: string, adminUserId: string) {
  const organization = await loadOrganization(orgId)
  const grantState = getVipGrantState(organization)

  if (grantState.kind === 'none') {
    throw new HttpError('This organization does not currently have VIP.', 409, 'VIP_NOT_PRESENT')
  }

  const shouldRestoreRenewal = shouldRestoreVipManagedCancellation(organization)
  if (shouldRestoreRenewal && !organization.stripe_subscription_id) {
    throw new HttpError(
      'Rocketboard could not restore renewal because the Stripe subscription is missing.',
      409,
      'VIP_SUBSCRIPTION_MISSING',
    )
  }

  let billingProjection: VipBillingProjectionMutation | undefined
  if (shouldRestoreRenewal && organization.stripe_subscription_id) {
    const updatedSubscription = await setStripeSubscriptionCancelAtPeriodEnd(organization.stripe_subscription_id, false)
    billingProjection = {
      projection: getSubscriptionProjection(updatedSubscription),
      stripeCustomerId: getStripeCustomerId(updatedSubscription.customer) ?? organization.stripe_customer_id,
      stripeSubscriptionId: updatedSubscription.id,
    }
  }

  try {
    await revokeVipGrant({adminUserId, billingProjection, orgId})
  } catch (error) {
    if (shouldRestoreRenewal && organization.stripe_subscription_id) {
      await setStripeSubscriptionCancelAtPeriodEnd(organization.stripe_subscription_id, true)
    }
    throw error
  }

  return jsonResponse({
    action: 'revoke',
    cancellationManaged: false,
    mode: 'revoked',
    renewalRestored: shouldRestoreRenewal,
    startsAt: null,
  })
}

Deno.serve(withMonitoring('super-admin-org-vip', async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  try {
    const {action, orgId} = await parseJsonBody(req, SuperAdminOrgVipBodySchema)
    const {userId} = await requireInternalAdmin(req)

    if (action === 'grant') {
      return await handleGrant(orgId, userId)
    }

    return await handleRevoke(orgId, userId)
  } catch (err) {
    console.error('super-admin-org-vip error:', err)
    return errorResponseForException(err, 'Failed to manage VIP grant', 'super-admin-org-vip')
  }
}))
