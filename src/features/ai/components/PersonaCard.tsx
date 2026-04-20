import { MoreHorizontal } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu'
import { ACCENT_BG } from '../ai.constants'
import type { AiPersona } from '../ai.types'

const ACCENT_GRADIENTS: Record<string, string> = {
  amber: 'from-amber-500 to-amber-400',
  blue: 'from-blue-500 to-blue-400',
  green: 'from-emerald-500 to-emerald-400',
  purple: 'from-violet-500 to-violet-400',
  red: 'from-red-500 to-red-400',
  teal: 'from-teal-500 to-teal-400',
}

type PersonaCardProps = {
  onEdit?: () => void
  onToggle: () => void
  persona: AiPersona
}

export function PersonaCard({ onEdit, onToggle, persona }: PersonaCardProps) {
  const gradient = ACCENT_GRADIENTS[persona.accentColor ?? 'blue'] ?? ACCENT_GRADIENTS.blue
  const avatarBg = ACCENT_BG[persona.accentColor ?? 'blue'] ?? ACCENT_BG.blue
  const initial = persona.name.charAt(0).toUpperCase()

  return (
    <div
      className="group relative cursor-pointer overflow-hidden rounded-3xl border border-border-subtle bg-surface-elevated shadow-panel transition-all hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      onClick={onEdit}
      role={onEdit ? 'button' : undefined}
      tabIndex={onEdit ? 0 : undefined}
      onKeyDown={onEdit ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit() } } : undefined}
    >
      {/* Gradient header stripe */}
      <div className={`h-12 bg-gradient-to-r ${gradient}`} />

      {/* Avatar overlapping the stripe */}
      <div className="relative -mt-7 flex justify-center">
        <div
          className={`flex h-14 w-14 items-center justify-center rounded-2xl border-4 border-surface-elevated font-display text-xl font-bold text-white ${avatarBg}`}
        >
          {initial}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-4 pt-2 text-center">
        <h3 className="font-display text-base font-semibold text-text-strong">
          {persona.name}
        </h3>
        {persona.focusArea ? (
          <p className="mt-0.5 text-xs font-medium text-text-muted">
            {persona.focusArea}
          </p>
        ) : null}

        {/* Toggle */}
        <button
          className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            persona.isEnabled
              ? 'bg-primary/10 text-primary'
              : 'bg-canvas-accent text-text-muted'
          }`}
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          type="button"
        >
          <span
            className={`h-2 w-2 rounded-full ${
              persona.isEnabled ? 'bg-primary' : 'bg-text-muted'
            }`}
          />
          {persona.isEnabled ? 'Active' : 'Inactive'}
        </button>
      </div>

      {/* More menu */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="absolute right-2 top-14" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Persona actions"
              className="rounded-xl p-1.5 text-text-muted opacity-0 transition-all hover:bg-canvas-accent hover:text-text-strong group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-elevated"
              type="button"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onEdit ? <DropdownMenuItem onClick={onEdit}>Edit persona</DropdownMenuItem> : null}
            <DropdownMenuItem onClick={onToggle}>
              {persona.isEnabled ? 'Disable' : 'Enable'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
