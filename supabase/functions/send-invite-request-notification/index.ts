import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.99.3'

import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  errorResponseForException,
  getAuthenticatedUser,
  handleCors,
  jsonResponse,
  parseJsonBody,
  z,
} from '../_shared/supabase.ts'
import {withMonitoring} from '../_shared/monitoring.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const APP_URL = Deno.env.get('APP_URL') ?? 'https://rocketboard.app'

export const InviteRequestNotificationPayloadSchema = z.object({
  organizationId: z.string().min(1),
  requestId: z.string().min(1),
})

type InviteRequestNotificationPayload = z.infer<typeof InviteRequestNotificationPayloadSchema>

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

type ResolvedRequest = {
  organizationName: string
  organizationSlug: string
  requesterName: string
  requestedEmail: string
  requestedRole: string
  adminEmails: string[]
}

async function resolveRequestContext(
  supabase: ReturnType<typeof createClient>,
  payload: InviteRequestNotificationPayload,
): Promise<ResolvedRequest | null> {
  const {data: request} = await supabase
    .from('invite_requests')
    .select('organization_id, email, requested_role, requested_by_user_id, status')
    .eq('id', payload.requestId)
    .maybeSingle()

  if (!request) return null
  if (request.organization_id !== payload.organizationId) return null
  if (request.status !== 'pending') return null

  const {data: org} = await supabase
    .from('organizations')
    .select('name, slug')
    .eq('id', request.organization_id)
    .maybeSingle()

  if (!org) return null

  const {data: requesterProfile} = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('user_id', request.requested_by_user_id)
    .maybeSingle()

  const requesterName = requesterProfile?.full_name
    || (requesterProfile?.email ? requesterProfile.email.split('@')[0] : null)
    || 'Someone'

  const {data: admins} = await supabase
    .from('organization_members')
    .select('profiles!inner(email)')
    .eq('organization_id', request.organization_id)
    .eq('role', 'admin')

  const adminEmails = (admins ?? [])
    .map((row: unknown) => {
      const profile = (row as {profiles?: {email?: string | null} | Array<{email?: string | null}>})?.profiles
      if (!profile) return null
      if (Array.isArray(profile)) return profile[0]?.email ?? null
      return profile.email ?? null
    })
    .filter((email: string | null): email is string => typeof email === 'string' && email.length > 0)

  return {
    organizationName: org.name,
    organizationSlug: org.slug,
    requesterName,
    requestedEmail: request.email,
    requestedRole: request.requested_role,
    adminEmails,
  }
}

function buildEmailHtml(context: ResolvedRequest): string {
  const safeRequester = escapeHtml(context.requesterName)
  const safeOrg = escapeHtml(context.organizationName)
  const safeEmail = escapeHtml(context.requestedEmail)
  const safeRole = escapeHtml(context.requestedRole)
  const reviewUrl = `${APP_URL}/${encodeURIComponent(context.organizationSlug)}/settings?tab=members`

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; color: #17202b;">
  <div style="margin-bottom: 32px;">
    <strong style="font-size: 18px; color: #bf6224;">Rocketboard</strong>
  </div>

  <p style="font-size: 16px; line-height: 1.6;">
    <strong>${safeRequester}</strong> wants to invite someone to
  </p>
  <p style="font-size: 24px; font-weight: 600; margin: 8px 0 16px;">
    ${safeOrg}
  </p>

  <div style="margin: 24px 0; padding: 16px; background: #f3ede2; border-radius: 12px;">
    <p style="font-size: 14px; color: #455265; margin: 0 0 6px;">
      <strong>Email:</strong> ${safeEmail}
    </p>
    <p style="font-size: 14px; color: #455265; margin: 0;">
      <strong>Requested role:</strong> ${safeRole}
    </p>
  </div>

  <div style="margin: 32px 0;">
    <a href="${reviewUrl}" style="display: inline-block; padding: 12px 28px; background: #bf6224; color: white; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 14px;">
      Review request
    </a>
  </div>

  <p style="font-size: 12px; color: #667487; line-height: 1.5;">
    You're receiving this because you're an admin of ${safeOrg}.<br>
    Approve or decline from the org Access tab. Requests expire after 7 days.
  </p>
</body>
</html>`
}

Deno.serve(withMonitoring('send-invite-request-notification', async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    if (!RESEND_API_KEY) {
      return errorResponse('RESEND_API_KEY not configured', 500)
    }

    const user = await getAuthenticatedUser(req)
    if (!user) {
      return errorResponse('Invalid authorization', 401)
    }

    const supabase = createServiceClient()
    const payload = await parseJsonBody(req, InviteRequestNotificationPayloadSchema)

    const context = await resolveRequestContext(supabase, payload)
    if (!context) {
      return errorResponse('Invite request not found or not pending', 404)
    }

    if (context.adminEmails.length === 0) {
      return jsonResponse({success: true, sent: 0})
    }

    const subject = `[${context.organizationName}] New invite request from ${context.requesterName}`
    const html = buildEmailHtml(context)
    const text = `${context.requesterName} wants to invite ${context.requestedEmail} to ${context.organizationName} as ${context.requestedRole}.\n\nReview at: ${APP_URL}/${context.organizationSlug}/settings?tab=members\n\nRequests expire after 7 days.`

    const responses = await Promise.allSettled(
      context.adminEmails.map((adminEmail) =>
        fetch('https://api.resend.com/emails', {
          body: JSON.stringify({
            from: 'Rocketboard <invites@rocketboard.app>',
            html,
            reply_to: user.email,
            subject,
            text,
            to: [adminEmail],
          }),
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }),
      ),
    )

    const sent = responses.filter((response) => response.status === 'fulfilled' && response.value.ok).length
    const failed = responses.length - sent

    if (sent === 0 && responses.length > 0) {
      console.error('All admin notification deliveries failed for request', payload.requestId)
      return errorResponse('Email delivery failed for all admins', 502)
    }

    if (failed > 0) {
      console.warn(`Partial delivery: ${sent}/${responses.length} admin notifications sent for request ${payload.requestId}`)
    }

    return jsonResponse({success: true, sent, failed})
  } catch (err) {
    console.error('send-invite-request-notification error:', err)
    return errorResponseForException(err, 'Internal error', 'send-invite-request-notification')
  }
}))
