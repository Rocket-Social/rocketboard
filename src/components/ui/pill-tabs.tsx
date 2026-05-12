import type {LucideIcon} from 'lucide-react'

import {cn} from '../../lib/cn'

export type PillTab = {
  icon: LucideIcon
  id: string
  label: string
}

type PillTabsProps = {
  activeTab: string
  ariaLabel?: string
  onTabChange: (tabId: string) => void
  tabs: PillTab[]
}

export function PillTabs({activeTab, ariaLabel, onTabChange, tabs}: PillTabsProps) {
  return (
    <div
      aria-label={ariaLabel}
      className='inline-flex items-center gap-1 rounded-full bg-canvas-accent p-1'
      role='tablist'
    >
      {tabs.map((tab) => {
        const Icon = tab.icon
        const active = tab.id === activeTab

        return (
          <button
            aria-selected={active}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all',
              active
                ? 'bg-surface-elevated text-text-strong shadow-panel'
                : 'text-text-muted hover:text-text-strong',
            )}
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            role='tab'
            type='button'
          >
            <Icon className='h-4 w-4'/>
            <span>{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}
