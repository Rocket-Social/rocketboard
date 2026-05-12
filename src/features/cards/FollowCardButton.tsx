import {Bell, BellOff, ChevronDown} from 'lucide-react'
import {useState} from 'react'

import {cn} from '../../lib/cn'
import {Popover, PopoverContent, PopoverTrigger} from '../../components/ui/popover'
import type {CardFollower, CardFollowerSource} from './card-followers.repository'
import {
  useCardFollowersListQuery,
  useFollowCardMutation,
  useIsFollowingCardQuery,
  useUnfollowCardMutation,
} from './card-followers.queries'

type FollowCardButtonProps = {
  cardId: string
  className?: string
  userId: string | null
}

const SOURCE_LABEL: Record<CardFollowerSource, string> = {
  assignee_auto: 'Assignee',
  comment_auto: 'Commented',
  creator_auto: 'Creator',
  manual: 'Following',
}

function initialsFromName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function FollowerRow({
  follower,
  isCurrentUser,
}: {
  follower: CardFollower
  isCurrentUser: boolean
}) {
  return (
    <li className='flex items-center gap-2.5 py-1.5'>
      {follower.avatarUrl ? (
        <img
          alt=''
          aria-hidden='true'
          className='h-6 w-6 shrink-0 rounded-full object-cover'
          src={follower.avatarUrl}
        />
      ) : (
        <span
          aria-hidden='true'
          className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-canvas-accent text-[10px] font-semibold text-text-muted'
        >
          {initialsFromName(follower.displayName)}
        </span>
      )}
      <span className='min-w-0 flex-1 truncate text-sm text-text-strong'>
        {follower.displayName}
        {isCurrentUser ? <span className='text-text-muted'> (you)</span> : null}
      </span>
      <span className='shrink-0 rounded-full bg-canvas-accent px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted'>
        {SOURCE_LABEL[follower.source]}
      </span>
    </li>
  )
}

export function FollowCardButton({cardId, className, userId}: FollowCardButtonProps) {
  const [open, setOpen] = useState(false)

  const isFollowingQuery = useIsFollowingCardQuery(cardId, userId)
  const followersListQuery = useCardFollowersListQuery(cardId, open)
  const followMutation = useFollowCardMutation(cardId, userId)
  const unfollowMutation = useUnfollowCardMutation(cardId, userId)

  const isFollowing = isFollowingQuery.data ?? false
  const isPending =
    followMutation.isPending || unfollowMutation.isPending

  const handleToggle = () => {
    if (!userId || isPending) return
    if (isFollowing) {
      unfollowMutation.mutate()
    } else {
      followMutation.mutate()
    }
  }

  const Icon = isFollowing ? Bell : BellOff
  const triggerLabel = isFollowing ? 'Following' : 'Follow'

  const followers = followersListQuery.data ?? []
  // Current user's row first, then everyone else by follow time. The RPC
  // already returns in created_at ascending order; we just promote the
  // self row.
  const sortedFollowers = userId
    ? [
        ...followers.filter((f) => f.userId === userId),
        ...followers.filter((f) => f.userId !== userId),
      ]
    : followers

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={triggerLabel}
          aria-pressed={isFollowing}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors',
            isFollowing
              ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15'
              : 'border-border-subtle text-text-muted hover:bg-canvas-accent hover:text-text-strong',
            className,
          )}
          data-testid='follow-card-button'
          type='button'
        >
          <Icon className={cn('h-3.5 w-3.5', isFollowing && 'fill-primary/20')}/>
          <span>{triggerLabel}</span>
          <ChevronDown className='h-3 w-3 opacity-60'/>
        </button>
      </PopoverTrigger>
      {/* CardSheet sits at z-[60] (project z-index hierarchy: confirm 90 >
          palette 80 > sidebar/dropdown 70 > CardSheet 60 > modals 50). The
          default popover z-50 lands behind the sheet — bump to z-[70] so
          the roster is visible and clickable. */}
      <PopoverContent
        align='end'
        className='z-[70] w-72 p-0'
        data-testid='follow-card-popover'
      >
        <div className='border-b border-border-subtle p-3'>
          <button
            className={cn(
              'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
              isFollowing
                ? 'bg-primary/10 text-primary hover:bg-primary/15'
                : 'bg-canvas-accent text-text-strong hover:bg-canvas-accent/70',
              isPending && 'opacity-60',
              !userId && 'pointer-events-none opacity-60',
            )}
            data-testid='follow-card-toggle'
            disabled={isPending || !userId}
            onClick={handleToggle}
            type='button'
          >
            <span className='inline-flex items-center gap-2'>
              <Icon className='h-4 w-4'/>
              {isFollowing ? 'Following — click to unfollow' : 'Follow this card'}
            </span>
          </button>
          <p className='mt-2 text-[11px] text-text-muted'>
            Followers see comments + future card-event notifications in their inbox.
          </p>
        </div>

        <div className='p-3'>
          <div className='mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-text-muted'>
            <span>People following</span>
            <span>{followers.length}</span>
          </div>
          {followersListQuery.isPending ? (
            <p className='py-2 text-xs text-text-muted'>Loading…</p>
          ) : followersListQuery.isError ? (
            <p className='py-2 text-xs text-text-muted'>Could not load followers.</p>
          ) : sortedFollowers.length === 0 ? (
            <p className='py-2 text-xs text-text-muted'>No one yet — be the first.</p>
          ) : (
            <ul className='max-h-64 divide-y divide-border-subtle overflow-y-auto'>
              {sortedFollowers.map((f) => (
                <FollowerRow
                  follower={f}
                  isCurrentUser={f.userId === userId}
                  key={f.userId}
                />
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
