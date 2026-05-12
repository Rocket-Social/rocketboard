import { Lightbulb } from 'lucide-react'

import type { AiSurface } from '../ai.types'

const PROMPTS_BY_SURFACE: Record<AiSurface, string[]> = {
  card: [
    'Break this card into subtasks',
    'Write acceptance criteria',
    'Draft a technical spec',
  ],
  global: [
    'Summarize recent activity',
    'What should I focus on today?',
    'Find overdue items',
  ],
  notes: [
    'Organize notes in this folder',
    'Summarize today\u2019s meeting notes',
    'Find action items in my notes',
  ],
  project: [
    'Summarize project status',
    'Create sprint tasks from backlog',
    'Identify blocked items',
  ],
  wiki: [
    'Draft a wiki page from recent notes',
    'Summarize this document',
    'Suggest improvements to this page',
  ],
}

type SuggestedPromptsProps = {
  onSelect: (prompt: string) => void
  prompts?: string[]
  surface: AiSurface
}

export function SuggestedPrompts({ onSelect, prompts, surface }: SuggestedPromptsProps) {
  const resolvedPrompts = prompts ?? PROMPTS_BY_SURFACE[surface]

  return (
    <div className="flex flex-col items-center gap-3 px-4 py-6">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Lightbulb className="h-5 w-5" />
      </div>
      <p className="text-sm text-text-muted">Try asking...</p>
      <div className="flex flex-wrap justify-center gap-2">
        {resolvedPrompts.map((prompt) => (
          <button
            className="rounded-full border border-border-subtle bg-surface-elevated px-3 py-1.5 text-xs font-medium text-text-medium transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
            key={prompt}
            onClick={() => onSelect(prompt)}
            type="button"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  )
}
