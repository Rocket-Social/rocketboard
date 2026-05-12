// AI Kanban Phase 7-E — in-product help callout.
//
// Single anchor surfacing the public AI_AGENTS.md doc. Mounts at the
// bottom of /ai-agents so members hitting unfamiliar copy (cost cap,
// quota meter, persona rate cap, approvals) have a one-click handoff
// to the canonical reference instead of asking in Slack.
//
// Doc lives at docs/public/AI_AGENTS.md and renders on GitHub. We
// link to the GitHub blob URL since Rocketboard doesn't ship a
// static-docs route in v1; the README's other public docs follow the
// same convention (relative paths in README; absolute external URLs
// in-product since the bundle has no doc viewer).

import {ExternalLink, HelpCircle} from 'lucide-react'

export const AI_AGENTS_DOC_URL =
  'https://github.com/Rocket-Social/rocketboard/blob/main/docs/AI_AGENTS.md'

type HelpCalloutProps = {
  className?: string
}

export function HelpCallout({className}: HelpCalloutProps) {
  return (
    <div
      className={
        'mt-8 flex items-center gap-2 rounded-md border border-border-subtle bg-surface-elevated px-3 py-2 text-xs text-text-muted'
        + (className ? ' ' + className : '')
      }
      data-testid='ai-agents-help-callout'
    >
      <HelpCircle aria-hidden='true' className='h-3.5 w-3.5'/>
      <span>Need help?</span>
      <a
        className='inline-flex items-center gap-1 underline hover:text-text-strong'
        href={AI_AGENTS_DOC_URL}
        rel='noopener noreferrer'
        target='_blank'
      >
        Read the AI Agents guide
        <ExternalLink aria-hidden='true' className='h-3 w-3'/>
      </a>
    </div>
  )
}
