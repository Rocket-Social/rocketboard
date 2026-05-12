// Wave 2 AI Kanban Phase 4 (PR 4-B) — D10 cross-surface assignee
// identity. Pairs the right avatar (PersonaAvatar for agents,
// UserAvatar for humans) with the resolved name and an optional
// sparkle indicator.
//
// Used by:
//   - BoardView card avatars
//   - CardSheet assignee summary line below the picker
//   - assignee picker rows (in PEOPLE / AI AGENTS sections)
//   - (follow-up) TableView assignee column, GanttView labels,
//     CardActivityLog references — those still render correctly
//     today via the profiles JOIN; this component will be wired
//     in a subsequent PR.

import {Sparkles} from 'lucide-react'

import {PersonaAvatar} from '../ai/components/PersonaAvatar'
import {UserAvatar} from '../../components/ui/user-avatar'
import {cn} from '../../lib/cn'
import {resolveAssigneeIdentity, type ResolveAssigneeIdentityContext} from './resolveAssigneeIdentity'

type AssigneeIdentitySize = 'sm' | 'md'

const AVATAR_CLASS: Record<AssigneeIdentitySize, string> = {
  sm: 'h-5 w-5',
  md: 'h-7 w-7',
}

const SIZE_LABEL_TEXT: Record<AssigneeIdentitySize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
}

export type AssigneeIdentityProps = {
  className?: string
  hideName?: boolean
  hideSparkle?: boolean
  size?: AssigneeIdentitySize
  userId: string | null | undefined
} & ResolveAssigneeIdentityContext

export function AssigneeIdentity({
  assignablePersonas,
  className,
  hideName,
  hideSparkle,
  projectMembers,
  size = 'md',
  userId,
}: AssigneeIdentityProps) {
  const resolved = resolveAssigneeIdentity(userId, {assignablePersonas, projectMembers})

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      {resolved.isAgent ? (
        <PersonaAvatar
          accentColor={resolved.accentColor}
          name={resolved.name}
          size={size}
        />
      ) : (
        <UserAvatar
          avatarUrl={resolved.avatarUrl}
          className={AVATAR_CLASS[size]}
          fallback={resolved.name.charAt(0).toUpperCase() || '?'}
          name={resolved.name}
        />
      )}
      {hideName ? null : (
        <span className={cn('truncate font-medium text-text-strong', SIZE_LABEL_TEXT[size])}>
          {resolved.name}
        </span>
      )}
      {resolved.isAgent && !hideSparkle ? (
        <Sparkles aria-label='AI agent' className='h-3.5 w-3.5 shrink-0 text-text-muted' />
      ) : null}
    </span>
  )
}
