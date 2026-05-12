import { ChevronDown } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu'
import { ACCENT_BG } from '../ai.constants'
import type { AiPersona } from '../ai.types'

type PersonaSwitcherProps = {
  currentPersona: AiPersona
  onSwitch: (persona: AiPersona) => void
  personas: AiPersona[]
}

export function PersonaSwitcher({
  currentPersona,
  onSwitch,
  personas,
}: PersonaSwitcherProps) {
  const enabledPersonas = personas.filter((p) => p.isEnabled)
  const avatarBg = ACCENT_BG[currentPersona.accentColor ?? 'blue'] ?? ACCENT_BG.blue
  const initial = currentPersona.name.charAt(0).toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-xl px-2 py-1 transition-colors hover:bg-canvas-accent"
          type="button"
        >
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-xl text-sm font-bold text-white ${avatarBg}`}
          >
            {initial}
          </div>
          <div className="min-w-0 text-left">
            <p className="text-sm font-semibold text-text-strong">
              {currentPersona.name}
            </p>
            {currentPersona.focusArea ? (
              <p className="text-[11px] text-text-muted">
                {currentPersona.focusArea}
              </p>
            ) : null}
          </div>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {enabledPersonas.map((persona) => {
          const bg = ACCENT_BG[persona.accentColor ?? 'blue'] ?? ACCENT_BG.blue
          const isCurrent = persona.id === currentPersona.id
          return (
            <DropdownMenuItem
              className={isCurrent ? 'bg-canvas-accent' : ''}
              key={persona.id}
              onClick={() => {
                if (!isCurrent) onSwitch(persona)
              }}
            >
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold text-white ${bg}`}
              >
                {persona.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium">{persona.name}</span>
                {persona.focusArea ? (
                  <span className="ml-1.5 text-xs text-text-muted">
                    {persona.focusArea}
                  </span>
                ) : null}
              </div>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
