import {useQuery} from '@tanstack/react-query'
import {useParams} from '@tanstack/react-router'
import {BarChart3, Map as MapIcon, Package} from 'lucide-react'
import {useMemo, useState} from 'react'

import {roadmapDataQueryOptions, workspacePlansQueryOptions} from './plan.queries'
import type {PlanRecord, PlanViewRecord} from './plan.types'
import {RoadmapView} from './components/RoadmapView'
import {ReleasesView} from './releases/ReleasesView'
import {ScorecardView} from './scorecard/ScorecardView'

type PlanPageProps = {
  workspaceId: string
  workspaceName: string
}

export function PlanPage({workspaceId, workspaceName}: PlanPageProps) {
  const {planId} = useParams({strict: false}) as {planId: string}
  const plansQuery = useQuery(workspacePlansQueryOptions(workspaceId))
  const plan = plansQuery.data?.find((p: PlanRecord) => p.id === planId) ?? null

  const [activeViewId, setActiveViewId] = useState<string | null>(null)

  const activeView = useMemo(() => {
    if (!plan) return null
    if (activeViewId) return plan.views.find((v: PlanViewRecord) => v.id === activeViewId) ?? plan.views[0] ?? null
    return plan.views[0] ?? null
  }, [plan, activeViewId])

  const roadmapQuery = useQuery(roadmapDataQueryOptions(activeView?.viewType === 'roadmap' ? activeView.id : ''))
  const releaseView = plan?.views.find((view) => view.viewType === 'releases') ?? null
  const roadmapView = plan?.views.find((view) => view.viewType === 'roadmap') ?? null

  const viewIcons = {
    releases: Package,
    roadmap: MapIcon,
    scorecard: BarChart3,
  } as const

  if (plansQuery.isLoading) {
    return (
      <div className='mx-auto max-w-6xl px-6 py-8'>
        <div className='mb-6 h-6 w-48 animate-pulse rounded bg-border-subtle/30'/>
        <div className='mb-4 flex gap-2'>
          {[1, 2, 3].map((i) => (
            <div className='h-9 w-24 animate-pulse rounded-lg bg-border-subtle/30' key={i}/>
          ))}
        </div>
        <div className='h-96 animate-pulse rounded-2xl bg-border-subtle/30'/>
      </div>
    )
  }

  if (!plan) {
    return (
      <div className='mx-auto max-w-6xl px-6 py-8'>
        <div className='rounded-2xl border border-dashed border-border-subtle px-6 py-16 text-center'>
          <p className='text-sm text-text-muted'>Plan not found.</p>
        </div>
      </div>
    )
  }

  return (
    <div className='flex h-full flex-col'>
      {/* Plan header */}
      <div className='border-b border-border-subtle px-6 py-4'>
        <p className='font-mono text-xs uppercase tracking-[0.24em] text-text-muted'>{workspaceName}</p>
        <h1 className='mt-1 font-display text-xl font-semibold text-text-strong'>{plan.name}</h1>
      </div>

      {/* View tabs */}
      {plan.views.length > 1 ? (
        <div className='flex gap-1 border-b border-border-subtle px-6'>
          {plan.views.map((view: PlanViewRecord) => (
            <button
              className={`inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                (activeView?.id === view.id)
                  ? 'border-primary text-text-strong'
                  : 'border-transparent text-text-muted hover:text-text-medium'
              }`}
              key={view.id}
              onClick={() => setActiveViewId(view.id)}
              type='button'
            >
              {(() => {
                const Icon = viewIcons[view.viewType]
                return <Icon className='h-4 w-4'/>
              })()}
              {view.name}
            </button>
          ))}
        </div>
      ) : null}

      {/* View content */}
      <div className='flex-1 overflow-hidden'>
        {activeView?.viewType === 'roadmap' ? (
          <RoadmapView
            data={roadmapQuery.data ?? null}
            initialConfig={activeView.configJson}
            isLoading={roadmapQuery.isLoading}
            planViewId={activeView.id}
          />
        ) : activeView?.viewType === 'releases' ? (
          <div className='h-full overflow-y-auto'>
            <div className='mx-auto max-w-6xl px-6 py-6'>
              <ReleasesView planViewId={activeView.id} workspaceId={workspaceId}/>
            </div>
          </div>
        ) : activeView?.viewType === 'scorecard' ? (
          <div className='h-full overflow-y-auto'>
            <div className='mx-auto max-w-6xl px-6 py-6'>
              <ScorecardView
                initialConfig={activeView.configJson}
                planViewId={activeView.id}
                releaseViewId={releaseView?.id}
                roadmapViewId={roadmapView?.id}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
