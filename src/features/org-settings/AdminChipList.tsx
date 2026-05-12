import {useMemo, useState} from 'react'

import {Popover, PopoverContent, PopoverTrigger} from '../../components/ui/popover'

import type {OrgMember} from './org-settings.types'

const VISIBLE_BEFORE_TRUNCATE = 3

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
  return name.slice(0, 2).toUpperCase() || '?'
}

function displayNameFor(member: OrgMember): string {
  const trimmed = member.name?.trim()
  if (trimmed && trimmed.toLowerCase() !== 'unknown') return trimmed
  return member.email?.split('@')[0] ?? 'Unknown'
}

function buildMailtoHref(email: string, organizationName: string): string {
  const subject = `Can you invite someone to ${organizationName}?`
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`
}

type AdminChipListProps = {
  admins: OrgMember[]
  currentUserId: string | null
  emailVisibility: 'visible' | 'hidden'
  isLoading: boolean
  organizationName: string
}

export function AdminChipList({
  admins,
  currentUserId,
  emailVisibility,
  isLoading,
  organizationName,
}: AdminChipListProps) {
  const filteredAdmins = useMemo(
    () => admins.filter((admin) => admin.userId !== currentUserId),
    [admins, currentUserId],
  )
  const visible = filteredAdmins.slice(0, VISIBLE_BEFORE_TRUNCATE)
  const overflow = filteredAdmins.slice(VISIBLE_BEFORE_TRUNCATE)
  const [overflowOpen, setOverflowOpen] = useState(false)

  if (isLoading) {
    return (
      <div className='flex flex-wrap gap-2' data-testid='admin-chip-skeleton'>
        {[0, 1, 2].map((i) => (
          <span
            className='inline-flex h-7 w-32 animate-pulse rounded-full bg-surface-muted'
            key={i}
            aria-hidden='true'
          />
        ))}
      </div>
    )
  }

  if (filteredAdmins.length === 0) {
    return (
      <p className='text-sm text-text-muted'>
        This org has no active admins. Contact <a className='underline' href='mailto:support@rocketboard.app'>support@rocketboard.app</a>.
      </p>
    )
  }

  return (
    <div className='flex flex-wrap items-center gap-2'>
      {visible.map((admin) => {
        const name = displayNameFor(admin)
        const showEmail = emailVisibility === 'visible' && Boolean(admin.email)
        return showEmail ? (
          <a
            aria-label={`Email ${name}`}
            className='inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-base px-3 py-1 text-sm text-text-strong transition-colors hover:bg-canvas-accent'
            href={buildMailtoHref(admin.email, organizationName)}
            key={admin.userId}
          >
            <span
              aria-hidden='true'
              className='flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary'
            >
              {getInitials(name)}
            </span>
            <span className='font-medium'>{name}</span>
          </a>
        ) : (
          <span
            className='inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-base px-3 py-1 text-sm text-text-strong'
            key={admin.userId}
          >
            <span
              aria-hidden='true'
              className='flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary'
            >
              {getInitials(name)}
            </span>
            <span className='font-medium'>{name}</span>
          </span>
        )
      })}
      {overflow.length > 0 ? (
        <Popover open={overflowOpen} onOpenChange={setOverflowOpen}>
          <PopoverTrigger asChild>
            <button
              className='inline-flex items-center gap-1 rounded-full border border-border-subtle bg-surface-base px-3 py-1 text-sm font-medium text-text-medium transition-colors hover:bg-canvas-accent'
              type='button'
            >
              and {overflow.length} {overflow.length === 1 ? 'other' : 'others'}
            </button>
          </PopoverTrigger>
          <PopoverContent align='start' className='max-h-72 w-72 overflow-y-auto p-2'>
            <ul className='flex flex-col gap-1'>
              {overflow.map((admin) => {
                const name = displayNameFor(admin)
                const showEmail = emailVisibility === 'visible' && Boolean(admin.email)
                return (
                  <li key={admin.userId}>
                    {showEmail ? (
                      <a
                        className='flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-strong transition-colors hover:bg-canvas-accent'
                        href={buildMailtoHref(admin.email, organizationName)}
                      >
                        <span
                          aria-hidden='true'
                          className='flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary'
                        >
                          {getInitials(name)}
                        </span>
                        <span className='flex-1 truncate'>{name}</span>
                      </a>
                    ) : (
                      <span className='flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-strong'>
                        <span
                          aria-hidden='true'
                          className='flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary'
                        >
                          {getInitials(name)}
                        </span>
                        <span className='flex-1 truncate'>{name}</span>
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  )
}
