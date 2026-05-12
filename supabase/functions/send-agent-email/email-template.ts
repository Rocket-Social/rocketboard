// Render an actionable agent email from a structured `sections` array.
//
// The LLM emits sections via the send_email tool's input_schema:
//
//   sections: [
//     {heading: 'Cards needing your attention', items: [
//       {text: '#42 Onboarding flow — missing assignee', action_label: 'View card', action_url: '/p/web/c/42'},
//       {text: '#51 Sprint goal — overdue 2d', action_label: 'View card', action_url: '/p/web/c/51'},
//     ]},
//     {heading: 'Sprint summary', items: [{text: 'Sprint Q2-W19 starts today. 12 cards in scope.'}]},
//   ]
//
// Each item with both `action_label` and `action_url` becomes a button.
// Items with only `text` render as plain bullets. URLs are joined to the
// caller-supplied origin (e.g. https://rocketboard.app) so the LLM can
// emit relative paths and the runtime decides which origin to use.
//
// Sections + items must arrive sanitized of HTML — we escape every text
// fragment here. The LLM's outputs are never trusted as raw HTML.

export type EmailSectionItem = {
  text: string
  action_label?: string
  action_url?: string
}

export type EmailSection = {
  heading: string
  items: EmailSectionItem[]
}

export type EmailTemplateInput = {
  appOrigin: string
  fromPersonaName: string
  sections: EmailSection[]
  subject: string
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

// Hard limit on action_url so a malformed value can't blow up the
// rendered HTML or the email client. Action URLs are expected to be
// short site-relative paths.
const MAX_ACTION_URL_LENGTH = 2048

function buildActionHref(appOrigin: string, actionUrl: string): string {
  if (actionUrl.length > MAX_ACTION_URL_LENGTH) return ''
  // Allow only same-origin relative paths. Anything that looks like an
  // absolute URL or a protocol-relative URL is rejected — the agent
  // should never be linking out to third-party sites.
  if (!actionUrl.startsWith('/') || actionUrl.startsWith('//')) return ''
  return `${appOrigin}${actionUrl}`
}

function renderItem(item: EmailSectionItem, appOrigin: string): string {
  const safeText = escapeHtml(item.text)
  if (item.action_label && item.action_url) {
    const href = buildActionHref(appOrigin, item.action_url)
    if (href) {
      const safeLabel = escapeHtml(item.action_label)
      return `
        <li style="margin: 0 0 12px; padding: 0; line-height: 1.6;">
          <span style="color: #17202b;">${safeText}</span>
          <div style="margin-top: 6px;">
            <a href="${escapeHtml(href)}" style="display: inline-block; padding: 6px 14px; background: #bf6224; color: white; text-decoration: none; border-radius: 8px; font-weight: 500; font-size: 13px;">
              ${safeLabel}
            </a>
          </div>
        </li>`
    }
  }
  return `<li style="margin: 0 0 8px; padding: 0; line-height: 1.6; color: #17202b;">${safeText}</li>`
}

function renderSection(section: EmailSection, appOrigin: string): string {
  const safeHeading = escapeHtml(section.heading)
  const items = section.items.map((item) => renderItem(item, appOrigin)).join('\n')
  return `
    <section style="margin: 28px 0;">
      <h2 style="margin: 0 0 12px; font-size: 16px; font-weight: 600; color: #17202b;">
        ${safeHeading}
      </h2>
      <ul style="list-style: disc; padding-left: 22px; margin: 0;">
        ${items}
      </ul>
    </section>`
}

export function buildAgentEmailHtml(input: EmailTemplateInput): string {
  const safeSubject = escapeHtml(input.subject)
  const safePersona = escapeHtml(input.fromPersonaName)
  const sectionsHtml = input.sections.map((s) => renderSection(s, input.appOrigin)).join('\n')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${safeSubject}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #17202b;">
  <div style="margin-bottom: 24px;">
    <strong style="font-size: 18px; color: #bf6224;">Rocketboard</strong>
    <span style="font-size: 13px; color: #667487; margin-left: 8px;">via ${safePersona}</span>
  </div>

  ${sectionsHtml}

  <hr style="border: 0; border-top: 1px solid #e6e1d5; margin: 32px 0;">
  <p style="font-size: 12px; color: #667487; line-height: 1.5;">
    Sent by your AI agent. Approved by you in the Rocketboard inbox.
    To stop receiving this kind of email, mute it in
    <a href="${escapeHtml(input.appOrigin)}/inbox" style="color: #667487;">your inbox preferences</a>.
  </p>
</body>
</html>`
}
