import type {Mode} from '../../app/mode'
import type {ProjectPriorityOption, ProjectStatusOption, StatusCategory} from '../cards/card.types'

export type OptionColorKey =
  | 'red' | 'rose' | 'orange' | 'amber' | 'yellow' | 'lime' | 'emerald'
  | 'teal' | 'cyan' | 'sky' | 'blue' | 'indigo' | 'violet' | 'purple'
  | 'fuchsia' | 'pink' | 'slate' | 'gray' | 'stone' | 'zinc' | 'brown'

export const OPTION_COLOR_PALETTE: Record<OptionColorKey, {bg: string; border: string; text: string}> = {
  // Row 1: warm spectrum
  red:     {bg: 'rgba(239, 68, 68, 0.1)',  border: 'rgba(239, 68, 68, 0.2)',  text: '#dc2626'},
  rose:    {bg: 'rgba(244, 63, 94, 0.1)',  border: 'rgba(244, 63, 94, 0.2)',  text: '#e11d48'},
  orange:  {bg: 'rgba(249, 115, 22, 0.1)', border: 'rgba(249, 115, 22, 0.2)', text: '#ea580c'},
  amber:   {bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.2)', text: '#d97706'},
  yellow:  {bg: 'rgba(234, 179, 8, 0.1)',  border: 'rgba(234, 179, 8, 0.2)',  text: '#ca8a04'},
  lime:    {bg: 'rgba(132, 204, 22, 0.1)', border: 'rgba(132, 204, 22, 0.2)', text: '#65a30d'},
  emerald: {bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.2)', text: '#059669'},
  // Row 2: cool spectrum
  teal:    {bg: 'rgba(20, 184, 166, 0.1)', border: 'rgba(20, 184, 166, 0.2)', text: '#0d9488'},
  cyan:    {bg: 'rgba(6, 182, 212, 0.1)',  border: 'rgba(6, 182, 212, 0.2)',  text: '#0891b2'},
  sky:     {bg: 'rgba(14, 165, 233, 0.1)', border: 'rgba(14, 165, 233, 0.2)', text: '#0284c7'},
  blue:    {bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.2)', text: '#2563eb'},
  indigo:  {bg: 'rgba(99, 102, 241, 0.1)', border: 'rgba(99, 102, 241, 0.2)', text: '#4f46e5'},
  violet:  {bg: 'rgba(139, 92, 246, 0.1)', border: 'rgba(139, 92, 246, 0.2)', text: '#7c3aed'},
  purple:  {bg: 'rgba(168, 85, 247, 0.1)', border: 'rgba(168, 85, 247, 0.2)', text: '#9333ea'},
  // Row 3: accent + neutrals
  fuchsia: {bg: 'rgba(217, 70, 239, 0.1)', border: 'rgba(217, 70, 239, 0.2)', text: '#c026d3'},
  pink:    {bg: 'rgba(236, 72, 153, 0.1)', border: 'rgba(236, 72, 153, 0.2)', text: '#db2777'},
  brown:   {bg: 'rgba(180, 120, 60, 0.1)', border: 'rgba(180, 120, 60, 0.2)', text: '#92400e'},
  stone:   {bg: 'rgba(168, 162, 158, 0.1)',border: 'rgba(168, 162, 158, 0.2)', text: '#78716c'},
  gray:    {bg: 'rgba(148, 163, 184, 0.1)',border: 'rgba(148, 163, 184, 0.2)', text: '#64748b'},
  slate:   {bg: 'rgba(100, 116, 139, 0.1)',border: 'rgba(100, 116, 139, 0.2)', text: '#475569'},
  zinc:    {bg: 'rgba(113, 113, 122, 0.1)',border: 'rgba(113, 113, 122, 0.2)', text: '#52525b'},
}

export const OPTION_COLOR_KEYS = Object.keys(OPTION_COLOR_PALETTE) as OptionColorKey[]

// Legacy aliases
export type StatusColorKey = OptionColorKey
export const STATUS_COLOR_PALETTE = OPTION_COLOR_PALETTE
export const STATUS_COLOR_KEYS = OPTION_COLOR_KEYS

const sidebarDarkModes: Mode[] = ['ember', 'dark']

export function isDarkSidebar(mode: Mode) {
  return sidebarDarkModes.includes(mode)
}

export function workspaceColorClass(colorToken: string) {
  switch (colorToken) {
    case 'amber':
      return 'bg-amber-500'
    case 'blue':
      return 'bg-blue-500'
    case 'indigo':
      return 'bg-indigo-500'
    case 'emerald':
      return 'bg-emerald-500'
    case 'rose':
      return 'bg-rose-500'
    default:
      return 'bg-slate-500'
  }
}

export function resolvePriorityOptionStyles(_mode: Mode, option: ProjectPriorityOption | null) {
  if (!option) return null
  if (option.color && OPTION_COLOR_PALETTE[option.color as OptionColorKey]) {
    const palette = OPTION_COLOR_PALETTE[option.color as OptionColorKey]
    return {
      backgroundColor: palette.bg,
      borderColor: palette.border,
      color: palette.text,
    }
  }
  // Default gray style for options without a color
  const gray = OPTION_COLOR_PALETTE.gray
  return {
    backgroundColor: gray.bg,
    borderColor: gray.border,
    color: gray.text,
  }
}

export function dueDateColor(mode: Mode, dueIn: number) {
  if (dueIn < 0) return 'var(--color-error)'
  if (dueIn === 0) return mode === 'ember' ? 'var(--color-primary)' : 'var(--color-warning)'
  if (dueIn <= 2) return 'var(--color-warning)'
  return 'var(--color-text-muted)'
}

export function statusCategoryColor(mode: Mode, category: StatusCategory | null) {
  switch (category) {
    case 'completed':
      return 'var(--color-success)'
    case 'started':
      return mode === 'ember' ? 'var(--color-primary)' : 'var(--color-info)'
    case 'not_started':
    default:
      return 'var(--color-text-muted)'
  }
}

export function resolveStatusOptionStyles(mode: Mode, option: ProjectStatusOption) {
  if (option.color && STATUS_COLOR_PALETTE[option.color as StatusColorKey]) {
    const palette = STATUS_COLOR_PALETTE[option.color as StatusColorKey]
    return {
      backgroundColor: palette.bg,
      borderColor: palette.border,
      color: palette.text,
    }
  }
  return statusCategoryStyles(mode, option.category)
}

export function statusCategoryStyles(mode: Mode, category: StatusCategory | null) {
  switch (category) {
    case 'completed':
      return {
        backgroundColor: mode === 'dark' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.1)',
        borderColor: mode === 'dark' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.2)',
        color: 'var(--color-success)',
      }
    case 'started':
      return {
        backgroundColor: mode === 'dark' ? 'rgba(96, 165, 250, 0.2)' : 'rgba(59, 130, 246, 0.1)',
        borderColor: mode === 'dark' ? 'rgba(96, 165, 250, 0.3)' : 'rgba(59, 130, 246, 0.2)',
        color: mode === 'ember' ? 'var(--color-primary)' : 'var(--color-info)',
      }
    case 'not_started':
    default:
      return {
        backgroundColor: mode === 'dark' ? 'rgba(156, 163, 175, 0.2)' : 'rgba(148, 163, 184, 0.1)',
        borderColor: mode === 'dark' ? 'rgba(156, 163, 175, 0.3)' : 'rgba(148, 163, 184, 0.2)',
        color: 'var(--color-text-muted)',
      }
  }
}
