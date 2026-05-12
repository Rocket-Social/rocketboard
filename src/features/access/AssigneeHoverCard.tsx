// Hover-card popup for assignee chips.
//
// Trigger: any node (the assignee chip in TableView, the avatar in
// CardSheet, etc.). On mouse-enter, after a short delay, the card
// opens showing avatar + display name + email/identifier. For agent
// assignees, a "View profile" button links to /ai-agents (the
// AgentProfilesTab). For human assignees, the button is omitted —
// there's no per-user profile route yet (TODO: ship `/users/<id>` and
// re-enable the button for humans).
//
// Built on Radix Popover with manual mouse-enter/leave handlers so we
// don't need a new @radix-ui/react-hover-card dependency for one
// surface. The 200ms open delay matches Radix's HoverCard default and
// prevents flicker when sweeping the cursor across the row.

import {ExternalLink, Sparkles} from 'lucide-react'
import {useEffect, useRef, useState, type ReactNode} from 'react'

import {Button} from '../../components/ui/button'
import {Popover, PopoverAnchor, PopoverContent} from '../../components/ui/popover'
import {UserAvatar} from '../../components/ui/user-avatar'
import {PersonaAvatar} from '../ai/components/PersonaAvatar'
import {resolveAssigneeIdentity} from './resolveAssigneeIdentity'
import {useIsAnyPickerOpen} from './assignee-interaction'
import type {AssignablePersona} from '../ai/agent.types'
import type {ProjectMember} from './access.types'

const OPEN_DELAY_MS = 200
const CLOSE_DELAY_MS = 100

export type AssigneeHoverCardProps = {
  assignablePersonas?: AssignablePersona[]
  children: ReactNode
  onViewAgentProfile?: () => void
  projectMembers?: ProjectMember[]
  userId: string | null | undefined
}

export function AssigneeHoverCard({
  assignablePersonas,
  children,
  onViewAgentProfile,
  projectMembers,
  userId,
}: AssigneeHoverCardProps) {
  const [open, setOpen] = useState(false)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isAnyPickerOpen = useIsAnyPickerOpen()

  // Clear any pending hover timers on unmount so a row scrolling out of
  // the virtualizer (or a route change mid-hover) doesn't fire setState
  // on an unmounted component. React only warns today, but the leak
  // compounds under heavy table scroll-and-hover.
  useEffect(() => () => {
    if (openTimer.current) clearTimeout(openTimer.current)
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }, [])

  // Force-close + suppress when any picker is active. Otherwise scanning
  // the cursor across the picker's portaled content fires sibling rows'
  // hover-card open timers, and once one of those popovers mounts its
  // focus shift dismisses the active picker (the regression fixed by
  // PR #479). Resets when the user closes the picker.
  useEffect(() => {
    if (!isAnyPickerOpen) return
    if (openTimer.current) {
      clearTimeout(openTimer.current)
      openTimer.current = null
    }
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setOpen(false)
  }, [isAnyPickerOpen])

  const persona = userId
    ? assignablePersonas?.find((p) => p.agentUserId === userId) ?? null
    : null
  const member = userId
    ? projectMembers?.find((m) => m.id === userId) ?? null
    : null
  const resolved = resolveAssigneeIdentity(userId, {assignablePersonas, projectMembers})

  // No data to show — render the trigger only.
  if (!userId || (!persona && !member)) {
    return <>{children}</>
  }

  const handleEnter = () => {
    // Bail entirely while a picker is open; the user is interacting
    // with it and we must not steal focus.
    if (isAnyPickerOpen) return
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    if (open || openTimer.current) return
    openTimer.current = setTimeout(() => {
      setOpen(true)
      openTimer.current = null
    }, OPEN_DELAY_MS)
  }

  const handleLeave = () => {
    if (openTimer.current) {
      clearTimeout(openTimer.current)
      openTimer.current = null
    }
    if (!open || closeTimer.current) return
    closeTimer.current = setTimeout(() => {
      setOpen(false)
      closeTimer.current = null
    }, CLOSE_DELAY_MS)
  }

  const isAgent = persona !== null
  const email = persona ? null : member?.email ?? null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <span
          className='inline-flex'
          onMouseDown={() => {
            // Closing on mousedown lets the picker (a separate Popover)
            // take over without two popovers stacking on top of each
            // other. The picker's trigger handles the click itself.
            if (openTimer.current) {
              clearTimeout(openTimer.current)
              openTimer.current = null
            }
            setOpen(false)
          }}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          {children}
        </span>
      </PopoverAnchor>
      <PopoverContent
        align='start'
        className='w-72 p-4'
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        side='top'
        sideOffset={8}
      >
        <div className='flex items-start gap-3'>
          {isAgent ? (
            <PersonaAvatar
              accentColor={persona.accentColor}
              className='!h-12 !w-12 !text-base'
              name={persona.name}
              size='md'
            />
          ) : (
            <UserAvatar
              avatarUrl={member?.avatarUrl ?? null}
              className='h-12 w-12 text-base'
              fallback={(resolved.name.charAt(0) || '?').toUpperCase()}
              name={resolved.name}
            />
          )}
          <div className='min-w-0 flex-1'>
            <p className='flex items-center gap-1.5 text-sm font-semibold text-text-strong'>
              <span className='truncate'>{resolved.name}</span>
              {isAgent && persona.role === 'assistant' ? (
                <Sparkles aria-label='AI agent' className='h-3.5 w-3.5 shrink-0 text-text-muted'/>
              ) : null}
            </p>
            {isAgent ? (
              <p className='mt-0.5 text-xs uppercase tracking-wider text-text-muted'>
                AI agent · {persona.role === 'monitor' ? 'monitor' : 'assistant'}
              </p>
            ) : email ? (
              <p className='mt-0.5 truncate text-xs text-text-muted'>{email}</p>
            ) : null}
          </div>
        </div>

        {isAgent ? (
          <div className='mt-3 flex justify-end'>
            <Button
              onClick={() => {
                setOpen(false)
                onViewAgentProfile?.()
              }}
              variant='secondary'
            >
              <ExternalLink className='h-3.5 w-3.5'/>
              View profile
            </Button>
          </div>
        ) : null}

        {/* TODO: ship a /users/<id> profile route and re-enable a "View profile"
            button here for human assignees. Until then, the card stays
            informational (avatar + name + email). */}
      </PopoverContent>
    </Popover>
  )
}
