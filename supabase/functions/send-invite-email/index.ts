import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3'

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

export const InviteEmailPayloadSchema = z.object({
  acceptToken: z.string().min(1),
  email: z.string().email(),
  inviterName: z.string().min(1),
  message: z.string().optional(),
  resourceId: z.string().min(1),
  resourceName: z.string().min(1),
  role: z.string().min(1),
  type: z.enum(['organization', 'project', 'workspace']),
})

type InviteEmailPayload = z.infer<typeof InviteEmailPayloadSchema>

async function markInviteEmailSent(
  supabase: ReturnType<typeof createClient>,
  payload: InviteEmailPayload,
) {
  const sentAt = new Date().toISOString()

  if (payload.type === 'project') {
    const { data, error } = await supabase.rpc('mark_project_invite_email_sent', {
      target_accept_token: payload.acceptToken,
      target_sent_at: sentAt,
    })

    if (error) {
      throw new Error(`Failed to record project invite email_sent_at: ${error.message}`)
    }

    if (!data) {
      throw new Error('Failed to record project invite email_sent_at: invite not found')
    }

    return
  }

  const { data, error } = await supabase.rpc('mark_invitation_email_sent', {
    target_accept_token: payload.acceptToken,
    target_sent_at: sentAt,
  })

  if (error) {
    throw new Error(`Failed to record invite email_sent_at: ${error.message}`)
  }

  if (!data) {
    throw new Error('Failed to record invite email_sent_at: invite not found')
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

function buildAcceptUrl(token: string): string {
  return `${APP_URL}/accept-invite/${encodeURIComponent(token)}`
}

function buildEmailHtml(payload: InviteEmailPayload): string {
  const acceptUrl = buildAcceptUrl(payload.acceptToken)
  const safeInviterName = escapeHtml(payload.inviterName)
  const safeResourceName = escapeHtml(payload.resourceName)
  const safeRole = escapeHtml(payload.role)
  const safeEmail = escapeHtml(payload.email)

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; color: #17202b;">
  <div style="margin-bottom: 32px;">
    <strong style="font-size: 18px; color: #bf6224;">Rocketboard</strong>
  </div>

  <p style="font-size: 16px; line-height: 1.6;">
    <strong>${safeInviterName}</strong> invited you to join
  </p>
  <p style="font-size: 24px; font-weight: 600; margin: 8px 0 16px;">
    ${safeResourceName}
  </p>
  <p style="font-size: 14px; color: #667487;">on Rocketboard.</p>

  ${payload.message ? `
  <div style="margin: 24px 0; padding: 16px; background: #f3ede2; border-radius: 12px;">
    <p style="font-size: 14px; color: #455265; margin: 0;">${escapeHtml(payload.message)}</p>
  </div>
  ` : ''}

  <p style="font-size: 14px; color: #455265; margin: 16px 0;">
    Your role: <strong>${safeRole}</strong>
  </p>

  <div style="margin: 32px 0;">
    <a href="${acceptUrl}" style="display: inline-block; padding: 12px 28px; background: #bf6224; color: white; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 14px;">
      Accept Invitation
    </a>
  </div>

  <p style="font-size: 12px; color: #667487; line-height: 1.5;">
    This invitation was sent to ${safeEmail} and expires in 7 days.<br>
    If you don't want to join, you can ignore this email.
  </p>
</body>
</html>`
}

async function verifyInvitePermission(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  payload: InviteEmailPayload,
): Promise<boolean> {
  if (payload.type === 'organization') {
    const { data } = await supabase.rpc('can_manage_organization', {
      target_org_id: payload.resourceId,
      target_user_id: userId,
    })
    return data === true
  }

  if (payload.type === 'workspace') {
    const { data } = await supabase.rpc('can_manage_workspace', {
      target_workspace_id: payload.resourceId,
      target_user_id: userId,
    })
    return data === true
  }

  if (payload.type === 'project') {
    const { data } = await supabase.rpc('can_edit_project', {
      target_project_id: payload.resourceId,
      target_user_id: userId,
    })
    return data === true
  }

  return false
}

async function resolveServerSideTruth(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  payload: InviteEmailPayload,
): Promise<{ inviterName: string; resourceName: string }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('user_id', userId)
    .maybeSingle()

  const inviterName = profile?.full_name
    || (profile?.email ? profile.email.split('@')[0] : null)
    || payload.inviterName
    || 'Someone'

  let resourceName = payload.resourceName

  if (payload.type === 'organization') {
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', payload.resourceId)
      .maybeSingle()
    if (org?.name) resourceName = org.name
  } else if (payload.type === 'workspace') {
    const { data: ws } = await supabase
      .from('workspaces')
      .select('name')
      .eq('id', payload.resourceId)
      .maybeSingle()
    if (ws?.name) resourceName = ws.name
  } else if (payload.type === 'project') {
    const { data: proj } = await supabase
      .from('projects')
      .select('name')
      .eq('id', payload.resourceId)
      .maybeSingle()
    if (proj?.name) resourceName = proj.name
  }

  return { inviterName, resourceName }
}

Deno.serve(withMonitoring('send-invite-email', async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    if (!RESEND_API_KEY) {
      return errorResponse('RESEND_API_KEY not configured', 500)
    }

    // This function runs with verify_jwt=false because Supabase's legacy
    // gateway verifier rejects asymmetric user JWTs before the function runs.
    // Keep auth enforcement here so invite emails still require a valid user session.
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return errorResponse('Invalid authorization', 401)
    }

    const supabase = createServiceClient()
    const payload = await parseJsonBody(req, InviteEmailPayloadSchema)

    // Verify the caller has permission to invite to this resource
    const hasPermission = await verifyInvitePermission(supabase, user.id, payload)
    if (!hasPermission) {
      return errorResponse('You do not have permission to send invites for this resource', 403)
    }

    // Resolve inviter name and resource name from DB to prevent spoofing
    const resolved = await resolveServerSideTruth(supabase, user.id, payload)
    const trustedPayload = { ...payload, inviterName: resolved.inviterName, resourceName: resolved.resourceName }

    const subject = `${trustedPayload.inviterName} invited you to ${trustedPayload.resourceName} on Rocketboard`

    const resendResponse = await fetch('https://api.resend.com/emails', {
      body: JSON.stringify({
        from: 'Rocketboard <invites@rocketboard.app>',
        html: buildEmailHtml(trustedPayload),
        reply_to: user.email,
        subject,
        text: `${trustedPayload.inviterName} invited you to join ${trustedPayload.resourceName} on Rocketboard.\n\nAccept: ${buildAcceptUrl(trustedPayload.acceptToken)}\n\nThis invitation expires in 7 days.`,
        to: [trustedPayload.email],
      }),
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    if (!resendResponse.ok) {
      console.error('Resend API error:', await resendResponse.text())
      return errorResponse('Email delivery failed', 502)
    }

    const resendData = await resendResponse.json()

    await markInviteEmailSent(supabase, trustedPayload)

    return jsonResponse({ id: resendData.id, success: true })
  } catch (err) {
    console.error('send-invite-email error:', err)
    return errorResponseForException(err, 'Internal error', 'send-invite-email')
  }
}))
