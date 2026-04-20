import type {OverviewWidgetType} from '../../../projects/project-view.types'

export type WidgetRegistryEntry = {
  defaultTitle: string
  description: string
  icon: string
  type: OverviewWidgetType
}

export const widgetRegistry: WidgetRegistryEntry[] = [
  {
    defaultTitle: 'Progress by Status',
    description: 'Status breakdown with progress bar',
    icon: 'BarChart3',
    type: 'progress_status',
  },
  {
    defaultTitle: 'Burn-up',
    description: 'Completed work vs total scope over time',
    icon: 'TrendingUp',
    type: 'burn_up',
  },
  {
    defaultTitle: 'Priority Items + Assignees',
    description: 'High-priority tasks and team workload',
    icon: 'Activity',
    type: 'priority_assignees',
  },
  {
    defaultTitle: 'Burn-down',
    description: 'Remaining work over time with ideal guideline',
    icon: 'ArrowDownRight',
    type: 'burn_down',
  },
  {
    defaultTitle: 'Progress Bar',
    description: 'Overall completion percentage by status',
    icon: 'Gauge',
    type: 'progress_bar',
  },
]

export function getWidgetDefaultTitle(type: OverviewWidgetType): string {
  return widgetRegistry.find((w) => w.type === type)?.defaultTitle ?? type
}

export function getWidgetDisplayTitle(type: OverviewWidgetType, customTitle: string | null): string {
  return customTitle ?? getWidgetDefaultTitle(type)
}
