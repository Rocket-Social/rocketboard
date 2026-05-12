// Wave 2 AI Kanban Phase 4 (PR 4-B) — shared persona avatar.
//
// Used by:
//   - MyAiKanbanRunCard (the grid card)
//   - the assignee picker (PEOPLE / AI AGENTS sections)
//   - <AssigneeIdentity> (cross-surface resolver D10)
//   - <AgentStatusPill> (CardSheet status pill, D16)
//
// Accent-color keys match `ai.constants.ACCENT_BG`. Null falls back
// to OPTION_COLOR_PALETTE.slate so an unconfigured persona reads as
// neutral gray instead of accidentally adopting whichever color the
// previous default happened to be (D16).

import {ACCENT_BG} from '../ai.constants'
import {cn} from '../../../lib/cn'

const SLATE_FALLBACK = 'bg-[#475569]'

type PersonaAvatarSize = 'sm' | 'md'

const SIZE_CLASS: Record<PersonaAvatarSize, string> = {
  sm: 'h-5 w-5 text-[10px]',
  md: 'h-7 w-7 text-xs',
}

export type PersonaAvatarProps = {
  accentColor: string | null | undefined
  className?: string
  name: string | null | undefined
  size?: PersonaAvatarSize
}

export function PersonaAvatar({accentColor, className, name, size = 'md'}: PersonaAvatarProps) {
  const initial = (name ?? '?').charAt(0).toUpperCase()
  const accentClass = accentColor ? ACCENT_BG[accentColor] ?? null : null
  return (
    <div
      aria-hidden='true'
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        SIZE_CLASS[size],
        accentClass ?? SLATE_FALLBACK,
        className,
      )}
    >
      {initial}
    </div>
  )
}
