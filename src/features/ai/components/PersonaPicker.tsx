// Persona picker for the AI Agents dispatch flow.
//
// Patterned after the AssigneePicker (Table View) — same popover
// shell, same search-and-list rhythm — but agent-only and without the
// project-membership gate (the AI Kanban dispatcher accepts any
// dispatchable persona in the org).
//
// Trigger renders the currently-picked persona as an avatar + name
// chip. Popover content is a search input + scrollable persona list
// with focus_area as a subtitle so the user can pick by role at a
// glance.
//
// Loading + empty states match the AI Kanban "no agents available"
// guidance: when no personas are dispatchable, the picker is disabled
// and a hint points to AI Agent Profiles.

import {ChevronDown, Search, Sparkles} from 'lucide-react'
import {useMemo, useRef, useState} from 'react'

import {Popover, PopoverContent, PopoverTrigger} from '../../../components/ui/popover'
import {cn} from '../../../lib/cn'
import type {AssignablePersona} from '../agent.types'
import {PersonaAvatar} from './PersonaAvatar'

export type PersonaPickerProps = {
  disabled?: boolean
  isLoading?: boolean
  onSelect: (personaId: string) => void
  personas: AssignablePersona[]
  selectedPersonaId: string
}

export function PersonaPicker({
  disabled,
  isLoading,
  onSelect,
  personas,
  selectedPersonaId,
}: PersonaPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  const selected = useMemo(
    () => personas.find((p) => p.id === selectedPersonaId) ?? null,
    [personas, selectedPersonaId],
  )

  const filtered = useMemo(() => {
    const sorted = [...personas].sort((a, b) => a.name.localeCompare(b.name))
    if (!query.trim()) return sorted
    const needle = query.trim().toLowerCase()
    return sorted.filter((p) => p.name.toLowerCase().includes(needle))
  }, [personas, query])

  const triggerLabel = isLoading
    ? 'Loading…'
    : selected
      ? selected.name
      : personas.length === 0
        ? 'No agents available'
        : 'Pick an agent'

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
        if (next) {
          requestAnimationFrame(() => inputRef.current?.focus())
        }
      }}
    >
      <PopoverTrigger asChild disabled={disabled || isLoading || personas.length === 0}>
        <button
          aria-label='Pick an AI agent'
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm outline-none transition-colors',
            'hover:border-border-strong focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary-soft',
            'disabled:cursor-not-allowed disabled:opacity-60',
            !selected && 'text-text-muted',
          )}
          data-testid='persona-picker-trigger'
          disabled={disabled || isLoading || personas.length === 0}
          type='button'
        >
          <span className='flex min-w-0 flex-1 items-center gap-2'>
            {selected ? (
              <PersonaAvatar
                accentColor={selected.accentColor}
                name={selected.name}
                size='sm'
              />
            ) : null}
            <span className='truncate text-text-strong'>{triggerLabel}</span>
          </span>
          <ChevronDown aria-hidden='true' className='h-4 w-4 shrink-0 text-text-muted'/>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        // z-[70] so the popover renders above NewTaskDialog's z-[60]
        // overlay. The shared PopoverContent defaults to z-50, which is
        // fine for table-cell pickers but invisible / uninteractable
        // inside the dialog. Matches the project z-index hierarchy
        // (sidebar/dropdown layer = z-[70]).
        className='z-[70] w-[var(--radix-popover-trigger-width)] min-w-72 max-w-[90vw] p-0'
        data-testid='persona-picker-popover'
      >
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
          {filtered.length === 0 ? (
            <div className='px-3 py-3 text-xs text-text-muted'>
              {personas.length === 0 ? 'No agents are dispatchable yet.' : 'No matches.'}
            </div>
          ) : (
            <>
              <div className='px-3 pb-1 pt-2 text-[10px] uppercase tracking-[0.18em] text-text-muted'>
                AI agents
              </div>
              {filtered.map((persona) => {
                const isSelected = persona.id === selectedPersonaId
                return (
                  <button
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-canvas-accent focus-visible:bg-canvas-accent focus-visible:outline-none',
                      isSelected ? 'bg-primary-soft/40 text-text-strong' : 'text-text-strong',
                    )}
                    data-testid={`persona-picker-option-${persona.slug}`}
                    key={persona.id}
                    onClick={() => {
                      onSelect(persona.id)
                      setOpen(false)
                      setQuery('')
                    }}
                    type='button'
                  >
                    <PersonaAvatar
                      accentColor={persona.accentColor}
                      name={persona.name}
                      size='md'
                    />
                    <span className='min-w-0 flex-1'>
                      <span className='block truncate text-sm font-medium text-text-strong'>
                        {persona.name}
                      </span>
                      {persona.role === 'monitor' ? (
                        <span className='block truncate text-xs text-text-muted'>monitor</span>
                      ) : null}
                    </span>
                    {persona.role === 'assistant' ? (
                      <Sparkles
                        aria-label='AI agent'
                        className='h-3.5 w-3.5 shrink-0 text-text-muted'
                      />
                    ) : null}
                  </button>
                )
              })}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
