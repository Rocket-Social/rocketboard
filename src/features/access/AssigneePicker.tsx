// Shared assignee picker — Monday-style.
//
// Trigger: AssigneeIdentity (avatar + optional name) or "—" when unassigned.
// Content (Popover):
//   - Current-assignee chip with × to clear (only when assigned)
//   - Search input filtering by name (case-insensitive)
//   - "Suggested people" section: human project_members
//   - "AI agents" section: ONLY agents who are already project members
//     (no auto-populate of org-level personas — same rule as humans)
//   - Empty state when nothing matches the search
//
// The picker does not auto-add agents to a project. To make an agent
// assignable, they must first become a project member (via Overview
// access UI, schedule-fire path, or a one-off task in My AI Kanban
// that auto-adds the bot).

import {Search, Sparkles, X} from 'lucide-react'
import {useEffect, useMemo, useRef, useState, type ReactNode} from 'react'

import {Popover, PopoverContent, PopoverTrigger} from '../../components/ui/popover'
import {UserAvatar} from '../../components/ui/user-avatar'
import {cn} from '../../lib/cn'
import {PersonaAvatar} from '../ai/components/PersonaAvatar'
import type {AssignablePersona} from '../ai/agent.types'
import type {ProjectMember} from './access.types'
import {AssigneeIdentity} from './AssigneeIdentity'
import {notifyPickerClosed, notifyPickerOpened} from './assignee-interaction'

type AssigneePickerSize = 'sm' | 'md'

export type AssigneePickerProps = {
  align?: 'start' | 'center' | 'end'
  assignablePersonas?: AssignablePersona[]
  currentAssigneeUserId: string | null
  disabled?: boolean
  // Optional override for the trigger render. Defaults to a chip with
  // avatar + name; pass a custom node for cell-specific layouts.
  trigger?: ReactNode
  onSelect: (userId: string | null) => void
  projectMembers: ProjectMember[]
  size?: AssigneePickerSize
}

export function AssigneePicker({
  align = 'start',
  assignablePersonas = [],
  currentAssigneeUserId,
  disabled,
  trigger,
  onSelect,
  projectMembers,
  size = 'sm',
}: AssigneePickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Publish open state so AssigneeHoverCard instances on other rows
  // can suppress their hover-to-open while a picker is active. Without
  // this, scanning the cursor across the picker's portaled content
  // crosses other rows' chips and their hover cards' focus shifts
  // dismiss the active picker.
  useEffect(() => {
    if (open) {
      notifyPickerOpened()
      return () => notifyPickerClosed()
    }
    return undefined
  }, [open])

  const agentUserIdSet = useMemo(
    () => new Set(assignablePersonas.map((persona) => persona.agentUserId)),
    [assignablePersonas],
  )

  const humanMembers = useMemo(
    () =>
      projectMembers
        .filter((member) => !agentUserIdSet.has(member.id))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [projectMembers, agentUserIdSet],
  )

  // Agents must already be project members — same rule as humans.
  const agentMembers = useMemo(
    () =>
      assignablePersonas
        .filter((persona) =>
          projectMembers.some((member) => member.id === persona.agentUserId),
        )
        .sort((left, right) => left.name.localeCompare(right.name)),
    [assignablePersonas, projectMembers],
  )

  const filteredHumans = useMemo(() => {
    if (!query.trim()) return humanMembers
    const needle = query.trim().toLowerCase()
    return humanMembers.filter((member) => member.name.toLowerCase().includes(needle))
  }, [humanMembers, query])

  const filteredAgents = useMemo(() => {
    if (!query.trim()) return agentMembers
    const needle = query.trim().toLowerCase()
    return agentMembers.filter((persona) => persona.name.toLowerCase().includes(needle))
  }, [agentMembers, query])

  const hasMatches = filteredHumans.length > 0 || filteredAgents.length > 0
  const hasAnyMembers = humanMembers.length > 0 || agentMembers.length > 0

  const triggerNode = trigger ?? (
    <DefaultTrigger
      assignablePersonas={assignablePersonas}
      currentAssigneeUserId={currentAssigneeUserId}
      projectMembers={projectMembers}
      size={size}
    />
  )

  const handleSelect = (userId: string | null) => {
    onSelect(userId)
    setOpen(false)
    setQuery('')
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
        if (next) {
          // Defer focus so Radix has time to mount the content.
          requestAnimationFrame(() => inputRef.current?.focus())
        }
      }}
    >
      <PopoverTrigger asChild disabled={disabled}>
        <button
          aria-label='Change assignee'
          className='inline-flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-sm transition-colors hover:bg-canvas-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-soft disabled:cursor-not-allowed disabled:opacity-60'
          disabled={disabled}
          type='button'
        >
          {triggerNode}
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className='w-72 max-w-[90vw] p-0'>
        {currentAssigneeUserId ? (
          <div className='border-b border-border-subtle px-3 py-2'>
            <span className='inline-flex max-w-full items-center gap-1.5 rounded-full border border-border-subtle bg-surface-base py-0.5 pl-1 pr-1 text-sm'>
              <AssigneeIdentity
                assignablePersonas={assignablePersonas}
                hideSparkle
                projectMembers={projectMembers}
                size='sm'
                userId={currentAssigneeUserId}
              />
              <button
                aria-label='Remove assignee'
                className='ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong'
                onClick={() => handleSelect(null)}
                type='button'
              >
                <X className='h-3.5 w-3.5'/>
              </button>
            </span>
          </div>
        ) : null}

        <div className='border-b border-border-subtle p-2'>
          <div className='relative'>
            <Search className='pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted'/>
            <input
              autoFocus
              className='h-8 w-full rounded-lg border border-border-subtle bg-surface-base pl-8 pr-2 text-sm text-text-strong outline-none transition-all placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary-soft'
              onChange={(event) => setQuery(event.target.value)}
              placeholder='Search names'
              ref={inputRef}
              type='text'
              value={query}
            />
          </div>
        </div>

        <div className='max-h-72 overflow-y-auto py-1'>
          {!hasAnyMembers ? (
            <div className='px-3 py-3 text-xs text-text-muted'>
              No assignees in this project yet.
            </div>
          ) : !hasMatches ? (
            <div className='px-3 py-3 text-xs text-text-muted'>No matches.</div>
          ) : (
            <>
              {filteredHumans.length > 0 ? (
                <SectionLabel>Suggested people</SectionLabel>
              ) : null}
              {filteredHumans.map((member) => (
                <PickerRow
                  key={member.id}
                  isSelected={member.id === currentAssigneeUserId}
                  onSelect={() => handleSelect(member.id)}
                >
                  <UserAvatar
                    avatarUrl={member.avatarUrl}
                    className='h-6 w-6 shrink-0'
                    fallback={(member.name.charAt(0) || '?').toUpperCase()}
                    name={member.name}
                  />
                  <span className='min-w-0 flex-1 truncate'>{member.name}</span>
                </PickerRow>
              ))}

              {filteredAgents.length > 0 ? (
                <>
                  {filteredHumans.length > 0 ? <Separator/> : null}
                  <SectionLabel>AI agents</SectionLabel>
                  {filteredAgents.map((persona) => (
                    <PickerRow
                      key={persona.id}
                      isSelected={persona.agentUserId === currentAssigneeUserId}
                      onSelect={() => handleSelect(persona.agentUserId)}
                    >
                      <PersonaAvatar
                        accentColor={persona.accentColor}
                        name={persona.name}
                        size='sm'
                      />
                      <span className='min-w-0 flex-1 truncate'>{persona.name}</span>
                      {persona.role === 'assistant' ? (
                        <Sparkles aria-label='AI agent' className='h-3.5 w-3.5 shrink-0 text-text-muted'/>
                      ) : (
                        <span className='shrink-0 text-[10px] uppercase tracking-wider text-text-muted'>
                          monitor
                        </span>
                      )}
                    </PickerRow>
                  ))}
                </>
              ) : null}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function DefaultTrigger({
  assignablePersonas,
  currentAssigneeUserId,
  projectMembers,
  size,
}: {
  assignablePersonas?: AssignablePersona[]
  currentAssigneeUserId: string | null
  projectMembers: ProjectMember[]
  size: AssigneePickerSize
}) {
  if (!currentAssigneeUserId) {
    return <span className={cn('text-text-muted', size === 'sm' ? 'text-sm' : 'text-base')}>—</span>
  }
  return (
    <AssigneeIdentity
      assignablePersonas={assignablePersonas}
      hideSparkle
      projectMembers={projectMembers}
      size={size}
      userId={currentAssigneeUserId}
    />
  )
}

function SectionLabel({children}: {children: ReactNode}) {
  return (
    <div className='px-3 pb-1 pt-2 text-[10px] uppercase tracking-[0.18em] text-text-muted'>
      {children}
    </div>
  )
}

function Separator() {
  return <div className='my-1 h-px bg-border-subtle'/>
}

function PickerRow({
  children,
  isSelected,
  onSelect,
}: {
  children: ReactNode
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-canvas-accent focus-visible:bg-canvas-accent focus-visible:outline-none',
        isSelected ? 'bg-primary-soft/40 text-text-strong' : 'text-text-strong',
      )}
      onClick={onSelect}
      type='button'
    >
      {children}
    </button>
  )
}
