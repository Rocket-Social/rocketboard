// send-agent-email — invoked by SQL dispatcher when a send_email tool
// call is approved. Service-role-only (verified via JWT role claim,
// matching drift-watcher).
//
// Caller chain:
//   1. LLM in ai-agent-run proposes a send_email tool_use.
//   2. Worker queues it as awaiting_approval.
//   3. User approves via approve_tool_call(...) RPC.
//   4. dispatch_agent_tool_call_internal sees name='send_email' and
//      calls net.http_post → this function (fire-and-forget).
//   5. We render the HTML template, look up the target's email + the
//      persona's display name, check the user's inbox_preferences,
//      and POST to Resend.
//
// Inbox preferences semantic for `agent_inbox_message`: OPT-OUT model.
// `inbox_preferences.email_kinds` lists kinds the user has muted. An
// empty array (or missing row) means "deliver everything". This matches
// the founder direction (default ON for Sprint Manager emails).

import {
  createServiceClient,
  errorResponse,
  errorResponseForException,
  handleCors,
  jsonResponse,
  parseJsonBody,
  z,
} from '../_shared/supabase.ts'
import {withMonitoring} from '../_shared/monitoring.ts'
import {verifyServiceRoleAuth} from '../_shared/service-role-auth.ts'
import {buildAgentEmailHtml, type EmailSection} from './email-template.ts'

const FUNCTION_NAME = 'send-agent-email'
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const APP_URL = Deno.env.get('APP_URL') ?? 'https://rocketboard.app'
const FROM_ADDRESS = 'Rocketboard <agents@rocketboard.app>'
const MAX_SECTIONS = 10
const MAX_ITEMS_PER_SECTION = 30

const SectionItemSchema = z.object({
  text: z.string().min(1).max(500),
  action_label: z.string().max(80).optional(),
  action_url: z.string().max(2048).optional(),
})

const SectionSchema = z.object({
  heading: z.string().min(1).max(200),
  items: z.array(SectionItemSchema).max(MAX_ITEMS_PER_SECTION),
})

const PayloadSchema = z.object({
  run_id: z.string().uuid(),
  tool_call_index: z.number().int().nonnegative(),
  target_user_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  persona_agent_user_id: z.string().uuid(),
  subject: z.string().min(1).max(200),
  sections: z.array(SectionSchema).min(1).max(MAX_SECTIONS),
})

type Payload = z.infer<typeof PayloadSchema>

Deno.serve(withMonitoring(FUNCTION_NAME, async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  const authResult = verifyServiceRoleAuth(req)
  if (!authResult.ok) {
    return errorResponse('Forbidden', 403)
  }

  if (!RESEND_API_KEY) {
    return errorResponse('RESEND_API_KEY not configured', 500)
  }

  try {
    const payload = await parseJsonBody(req, PayloadSchema)
    const supabase = createServiceClient()

    // Look up the target user's email. auth.admin.getUserById is the
    // canonical source — profiles.email may lag.
    const {data: userData, error: userErr} =
      await supabase.auth.admin.getUserById(payload.target_user_id)
    if (userErr || !userData?.user?.email) {
      return jsonResponse({
        ok: false,
        suppressed: true,
        reason: userErr ? 'user_lookup_failed' : 'no_email_on_record',
      })
    }
    const recipientEmail = userData.user.email

    // Persona display name for the From: prefix.
    const {data: personaData} = await supabase
      .from('ai_personas')
      .select('name')
      .eq('agent_user_id', payload.persona_agent_user_id)
      .maybeSingle()
    const personaName = personaData?.name ?? 'Rocketboard agent'

    // Opt-out check. inbox_preferences.email_kinds lists muted kinds
    // for this user — if 'agent_inbox_message' is in the list,
    // suppress. Default empty / missing row = send.
    const {data: prefs} = await supabase
      .from('inbox_preferences')
      .select('email_kinds')
      .eq('user_id', payload.target_user_id)
      .maybeSingle()
    const mutedKinds: string[] = Array.isArray(prefs?.email_kinds) ? prefs.email_kinds : []
    if (mutedKinds.includes('agent_inbox_message')) {
      return jsonResponse({ok: true, suppressed: true, reason: 'user_opt_out'})
    }

    const html = buildAgentEmailHtml({
      appOrigin: APP_URL,
      fromPersonaName: personaName,
      sections: payload.sections as EmailSection[],
      subject: payload.subject,
    })
    const text = buildPlainText(payload, APP_URL)

    const resendResponse = await fetch('https://api.resend.com/emails', {
      body: JSON.stringify({
        from: FROM_ADDRESS,
        html,
        subject: payload.subject,
        text,
        to: [recipientEmail],
      }),
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    if (!resendResponse.ok) {
      const errBody = await resendResponse.text()
      console.error(`${FUNCTION_NAME}: Resend error ${resendResponse.status}: ${errBody}`)
      return errorResponse(`Email delivery failed (${resendResponse.status})`, 502)
    }

    const resendData = await resendResponse.json()
    return jsonResponse({
      ok: true,
      email_id: resendData?.id ?? null,
      run_id: payload.run_id,
      tool_call_index: payload.tool_call_index,
    })
  } catch (err) {
    return errorResponseForException(err, `${FUNCTION_NAME} failed`, FUNCTION_NAME)
  }
}))

function buildPlainText(payload: Payload, appOrigin: string): string {
  const lines: string[] = [payload.subject, '']
  for (const section of payload.sections) {
    lines.push(section.heading)
    for (const item of section.items) {
      const action = item.action_url
        ? ` (${appOrigin}${item.action_url})`
        : ''
      lines.push(`  - ${item.text}${action}`)
    }
    lines.push('')
  }
  lines.push('--')
  lines.push('Sent by your Rocketboard AI agent. Mute via your inbox preferences.')
  return lines.join('\n')
}
