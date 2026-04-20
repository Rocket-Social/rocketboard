import {Diamond, LayoutGrid, Plus, Settings, Timer} from 'lucide-react'
import {useState} from 'react'

import {Button} from '../../../components/ui/button'
import type {RoadmapViewConfig} from '../plan.types'

type RoadmapToolbarProps = {
  config: RoadmapViewConfig
  onAddLane: () => void
  onAddMilestone: () => void
  onConfigChange: (patch: Partial<RoadmapViewConfig>) => void
}

export function RoadmapToolbar({config, onAddLane, onAddMilestone, onConfigChange}: RoadmapToolbarProps) {
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className='flex items-center gap-2 border-b border-border-subtle bg-surface-elevated px-4 py-2'>
      {/* Layout mode toggle */}
      <div className='inline-flex rounded-[10px] border border-border-subtle bg-surface-base p-0.5'>
        <button
          className={`inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary-soft focus-visible:outline-none ${
            config.layoutMode === 'timeline'
              ? 'bg-primary text-white shadow-sm'
              : 'text-text-medium hover:text-text-strong'
          }`}
          onClick={() => onConfigChange({layoutMode: 'timeline'})}
          type='button'
        >
          <Timer className='h-3.5 w-3.5'/>
          Timeline
        </button>
        <button
          className={`inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary-soft focus-visible:outline-none ${
            config.layoutMode === 'matrix'
              ? 'bg-primary text-white shadow-sm'
              : 'text-text-medium hover:text-text-strong'
          }`}
          onClick={() => onConfigChange({layoutMode: 'matrix'})}
          type='button'
        >
          <LayoutGrid className='h-3.5 w-3.5'/>
          Matrix
        </button>
      </div>

      {/* Time scale toggle (only in timeline mode) */}
      {config.layoutMode === 'timeline' ? (
        <div className='inline-flex rounded-[10px] border border-border-subtle bg-surface-base p-0.5'>
          {(['week', 'month', 'quarter'] as const).map((scale) => (
            <button
              className={`rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary-soft focus-visible:outline-none ${
                config.timeScale === scale
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-medium hover:text-text-strong'
              }`}
              key={scale}
              onClick={() => onConfigChange({timeScale: scale})}
              type='button'
            >
              {scale.charAt(0).toUpperCase() + scale.slice(1)}
            </button>
          ))}
        </div>
      ) : null}

      {/* Settings popover */}
      <div className='relative'>
        <Button
          className='focus-visible:ring-2 focus-visible:ring-primary-soft'
          onClick={() => setShowSettings(!showSettings)}
          variant='ghost'
        >
          <Settings className='h-4 w-4'/>
        </Button>
        {showSettings ? (
          <>
            <button
              aria-label='Close settings'
              className='fixed inset-0 z-40'
              onClick={() => setShowSettings(false)}
              type='button'
            />
            <div className='absolute left-0 top-full z-50 mt-1 w-56 rounded-2xl border border-border-subtle bg-surface-elevated p-3 shadow-md'>
              <p className='mb-2 text-[10px] font-medium uppercase tracking-[0.24em] text-text-muted'>Display</p>
              <label className='flex items-center justify-between py-1.5'>
                <span className='text-sm text-text-strong'>Show milestones</span>
                <input
                  checked={config.showMilestones}
                  className='h-4 w-4 accent-primary'
                  onChange={(e) => onConfigChange({showMilestones: e.target.checked})}
                  type='checkbox'
                />
              </label>
              <label className='flex items-center justify-between py-1.5'>
                <span className='text-sm text-text-strong'>Show today marker</span>
                <input
                  checked={config.showTodayMarker}
                  className='h-4 w-4 accent-primary'
                  onChange={(e) => onConfigChange({showTodayMarker: e.target.checked})}
                  type='checkbox'
                />
              </label>
              <label className='flex items-center justify-between py-1.5'>
                <span className='text-sm text-text-strong'>Show progress</span>
                <input
                  checked={config.showProgress}
                  className='h-4 w-4 accent-primary'
                  onChange={(e) => onConfigChange({showProgress: e.target.checked})}
                  type='checkbox'
                />
              </label>
            </div>
          </>
        ) : null}
      </div>

      <div className='flex-1'/>

      <Button onClick={onAddMilestone} variant='ghost'>
        <Diamond className='h-4 w-4'/>
        Milestone
      </Button>

      <Button onClick={onAddLane} variant='ghost'>
        <Plus className='h-4 w-4'/>
        Add lane
      </Button>
    </div>
  )
}
