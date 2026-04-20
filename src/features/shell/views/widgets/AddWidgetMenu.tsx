import {Activity, ArrowDownRight, BarChart3, Check, Gauge, Plus, TrendingUp} from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../../components/ui/dropdown-menu'
import type {OverviewWidgetType} from '../../../projects/project-view.types'
import {widgetRegistry} from './widget-registry'

const iconMap: Record<string, typeof BarChart3> = {
  Activity,
  ArrowDownRight,
  BarChart3,
  Gauge,
  TrendingUp,
}

type AddWidgetMenuProps = {
  addedTypes: Set<OverviewWidgetType>
  onAdd: (type: OverviewWidgetType) => void
}

export function AddWidgetMenu({addedTypes, onAdd}: AddWidgetMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className='inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-text-medium transition-colors hover:bg-canvas-accent hover:text-text-strong'
          type='button'
        >
          <Plus className='h-4 w-4'/>
          Add widget
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start' className='w-64'>
        {widgetRegistry.map((entry) => {
          const isAdded = addedTypes.has(entry.type)
          const Icon = iconMap[entry.icon] ?? BarChart3
          return (
            <DropdownMenuItem
              disabled={isAdded}
              key={entry.type}
              onClick={() => !isAdded && onAdd(entry.type)}
            >
              <div className='flex flex-1 items-center gap-2.5'>
                <Icon className='h-4 w-4 shrink-0 text-text-muted'/>
                <div className='min-w-0 flex-1'>
                  <div className='text-sm font-medium'>{entry.defaultTitle}</div>
                  <div className='text-xs text-text-muted'>{entry.description}</div>
                </div>
                {isAdded ? <Check className='h-4 w-4 shrink-0 text-text-muted'/> : null}
              </div>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
