// Wave 2 AI Kanban Phase 4 (PR 4-A) — single comment row inside the
// CardSheet thread. Three variants:
//   1. human: classic bubble (`bg-canvas-accent`, no border accent).
//   2. agent-completed: persona accent left-border + persona name on
//      the byline. No animation.
//   3. agent-streaming: same as #2 but `bg-primary-soft/50` tint +
//      audio-wave indicator. Transitions to #2 styling when
//      `isStreaming` flips false (D8 patch path keeps the cache hot
//      so the transition feels live).
//
// D16 — visual conventions locked from approved variant A mockup.
// D18 — streaming bubble wraps in role=status + aria-live=polite so
//       screen readers announce streaming chunks incrementally.

import {useEffect, useId, useRef} from 'react'

import {ACCENT_BG} from '../ai/ai.constants'
import {cn} from '../../lib/cn'
import {UserAvatar} from '../../components/ui/user-avatar'
import type {ProjectMember} from '../access/access.types'
import type {SessionUser} from '../auth/data'
import type {CardComment} from './card.types'

function formatCommentTimestamp(value: string) {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      month: 'short',
    }).format(new Date(value))
  } catch {
    return ''
  }
}

function getInitials(name: string | null | undefined, fallback: string) {
  const initials = name
    ?.split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return initials || fallback
}

function AudioWaveIndicator({label}: {label: string}) {
  return (
    <span aria-label={label} className='inline-flex items-end gap-0.5 align-middle' role='img'>
      {[0, 120, 240].map((delayMs) => (
        <span
          aria-hidden='true'
          className='block h-2 w-0.5 rounded-full bg-primary motion-safe:animate-audio-wave'
          key={delayMs}
          style={{animationDelay: `${delayMs}ms`, transformOrigin: 'bottom'}}
        />
      ))}
    </span>
  )
}

type CardCommentItemProps = {
  comment: CardComment
  currentUser: SessionUser
  projectMembers: ProjectMember[]
}

export function CardCommentItem({comment, currentUser, projectMembers}: CardCommentItemProps) {
  const isAgent = !!comment.agentRunContext
  const isStreaming = isAgent && comment.isStreaming
  const accent = comment.agentRunContext?.personaAccentColor ?? 'blue'
  const accentBg = ACCENT_BG[accent] ?? ACCENT_BG.blue

  const announcedRef = useRef(false)
  const announcerId = useId()

  // D18 — one-shot completion announce when streaming flips off so
  // screen readers get a clean signal that the agent finished talking.
  useEffect(() => {
    if (!isAgent) return
    if (comment.isStreaming) {
      announcedRef.current = false
      return
    }
    if (announcedRef.current) return
    const region = document.getElementById(announcerId)
    if (!region) return
    const personaName = comment.agentRunContext?.personaName ?? 'Agent'
    const firstSentence = comment.bodyText.split(/[.!?\n]/)[0]?.trim() ?? ''
    region.textContent = firstSentence
      ? `${personaName} finished generating: ${firstSentence}`
      : `${personaName} finished generating.`
    announcedRef.current = true
  }, [announcerId, comment.agentRunContext?.personaName, comment.bodyText, comment.isStreaming, isAgent])

  const avatarUrl =
    comment.authorUserId === currentUser.id
      ? currentUser.avatarUrl ?? null
      : projectMembers.find((member) => member.id === comment.authorUserId)?.avatarUrl ?? null

  const wrapperClass = cn(
    'flex-1 rounded-2xl px-4 py-3 transition-colors duration-300',
    isStreaming
      ? 'border-l-2 border-primary bg-primary-soft/50 pl-3'
      : isAgent
      ? 'border-l-2 border-primary bg-canvas-accent pl-3'
      : 'bg-canvas-accent',
  )

  return (
    <div
      aria-atomic='false'
      aria-live={isStreaming ? 'polite' : undefined}
      className='flex gap-3'
      data-testid={`card-comment-${comment.id}`}
      role={isStreaming ? 'status' : undefined}
    >
      {isAgent ? (
        <div
          aria-hidden='true'
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
            accentBg,
          )}
        >
          {(comment.agentRunContext?.personaName ?? '?').charAt(0).toUpperCase()}
        </div>
      ) : (
        <UserAvatar
          avatarUrl={avatarUrl}
          className='h-8 w-8'
          fallback={getInitials(comment.authorName, '?')}
          name={comment.authorName}
        />
      )}
      <div className={wrapperClass}>
        <div className='flex items-center justify-between gap-3'>
          <span className='flex items-center gap-2 text-sm font-medium text-text-strong'>
            {comment.authorName}
            {isStreaming ? <AudioWaveIndicator label='Streaming response' /> : null}
          </span>
          <span className='text-xs text-text-muted'>{formatCommentTimestamp(comment.createdAt)}</span>
        </div>
        <p className='mt-2 whitespace-pre-wrap text-sm leading-relaxed text-text-medium'>
          {comment.bodyText}
        </p>
      </div>
      {/* Off-screen one-shot announcer for streaming completion. */}
      {isAgent ? (
        <span
          aria-atomic='true'
          aria-live='polite'
          className='sr-only'
          id={announcerId}
        />
      ) : null}
    </div>
  )
}
