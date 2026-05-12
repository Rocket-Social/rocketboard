import {useCallback, useState} from 'react'

import {useToast} from '../../../components/ui/toast'
import type {RoadmapData, RoadmapViewConfig} from '../plan.types'
import {defaultRoadmapViewConfig} from '../plan.types'
import {useUpdatePlanViewConfigMutation} from '../plan.queries'
import {RoadmapMatrixView} from './RoadmapMatrixView'
import {RoadmapTimelineView} from './RoadmapTimelineView'
import {RoadmapToolbar} from './RoadmapToolbar'

// ── Config parsing ──────────────────────────────────────────

export function parseRoadmapConfig(raw?: Record<string, unknown> | null): RoadmapViewConfig {
  if (!raw) return defaultRoadmapViewConfig
  return {
    bucketCutoffDays: Array.isArray(raw.bucketCutoffDays) && raw.bucketCutoffDays.length === 2
      ? (raw.bucketCutoffDays as [number, number])
      : defaultRoadmapViewConfig.bucketCutoffDays,
    bucketLabels: Array.isArray(raw.bucketLabels) && raw.bucketLabels.length === 3
      ? (raw.bucketLabels as [string, string, string])
      : defaultRoadmapViewConfig.bucketLabels,
    collapsedGroups: Array.isArray(raw.collapsedGroups)
      ? (raw.collapsedGroups as string[])
      : defaultRoadmapViewConfig.collapsedGroups,
    layoutMode: raw.layoutMode === 'matrix' ? 'matrix' : 'timeline',
    showMilestones: typeof raw.showMilestones === 'boolean' ? raw.showMilestones : defaultRoadmapViewConfig.showMilestones,
    showProgress: typeof raw.showProgress === 'boolean' ? raw.showProgress : defaultRoadmapViewConfig.showProgress,
    showTodayMarker: typeof raw.showTodayMarker === 'boolean' ? raw.showTodayMarker : defaultRoadmapViewConfig.showTodayMarker,
    timeMode: raw.timeMode === 'bucket' ? 'bucket' : 'calendar',
    timeScale: raw.timeScale === 'week' || raw.timeScale === 'quarter' ? raw.timeScale : (raw.timeScale === 'month' ? 'month' : defaultRoadmapViewConfig.timeScale),
    visibleEndDate: typeof raw.visibleEndDate === 'string' ? raw.visibleEndDate : null,
    visibleStartDate: typeof raw.visibleStartDate === 'string' ? raw.visibleStartDate : null,
  }
}

// ── Component ───────────────────────────────────────────────

type RoadmapViewProps = {
  data: RoadmapData | null
  initialConfig?: Record<string, unknown> | null
  isLoading: boolean
  planViewId: string
}

export function RoadmapView({data, initialConfig, isLoading, planViewId}: RoadmapViewProps) {
  const [config, setConfig] = useState<RoadmapViewConfig>(() => parseRoadmapConfig(initialConfig))
  const configMutation = useUpdatePlanViewConfigMutation()
  const {toast} = useToast()
  const [addingLane, setAddingLane] = useState(false)
  const [addingMilestone, setAddingMilestone] = useState(false)

  const persistConfig = useCallback(async (patch: Partial<RoadmapViewConfig>) => {
    const prev = config
    const nextConfig = {...config, ...patch}
    setConfig(nextConfig)
    try {
      await configMutation.mutateAsync({config: nextConfig as unknown as Record<string, unknown>, viewId: planViewId})
    } catch {
      setConfig(prev)
      toast({title: 'Could not save settings', variant: 'error'})
    }
  }, [config, configMutation, planViewId, toast])

  return (
    <div className='flex h-full flex-col'>
      <RoadmapToolbar
        config={config}
        onAddLane={() => setAddingLane(true)}
        onAddMilestone={() => setAddingMilestone(true)}
        onConfigChange={(patch) => void persistConfig(patch)}
      />
      <div className='flex-1 overflow-hidden'>
        {config.layoutMode === 'timeline' ? (
          <RoadmapTimelineView
            addingLane={addingLane}
            config={config}
            data={data}
            isLoading={isLoading}
            onAddingLaneChange={setAddingLane}
            onAddingMilestoneChange={setAddingMilestone}
            onConfigChange={(patch) => void persistConfig(patch)}
            planViewId={planViewId}
            showAddMilestone={addingMilestone}
          />
        ) : (
          <RoadmapMatrixView
            addingLane={addingLane}
            config={config}
            data={data}
            isLoading={isLoading}
            onAddingLaneChange={setAddingLane}
            onConfigChange={(patch) => void persistConfig(patch)}
            planViewId={planViewId}
          />
        )}
      </div>
    </div>
  )
}
