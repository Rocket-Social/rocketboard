import {CalendarRange} from 'lucide-react'
import {useEffect, useMemo, useRef, useState} from 'react'

import type {ReleaseRecord} from '../plan.types'
import {formatReleaseDate, formatReleaseDrift, type ReleaseTimelineScale} from './release-utils'

type ReleaseTimelineViewProps = {
  onOpenRelease: (releaseId: string) => void
  onScaleChange: (scale: ReleaseTimelineScale) => void
  onUpdatePlannedDate?: (release: ReleaseRecord, plannedDate: string | null) => Promise<void>
  readOnly?: boolean
  releases: ReleaseRecord[]
  scale: ReleaseTimelineScale
}

type DragState = {
  originalDate: string
  pointerStartX: number
  previewDate: string
  releaseId: string
}

function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00Z`)
}

function dateToDayOffset(dateString: string, baseline: Date) {
  return Math.round((parseDateOnly(dateString).getTime() - baseline.getTime()) / (1000 * 60 * 60 * 24))
}

function addDays(dateString: string, days: number) {
  const date = parseDateOnly(dateString)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function formatHeaderDate(date: Date, scale: ReleaseTimelineScale) {
  return new Intl.DateTimeFormat('en-US', {
    day: scale === 'week' ? 'numeric' : undefined,
    month: 'short',
    timeZone: 'UTC',
    year: scale === 'quarter' ? 'numeric' : undefined,
  }).format(date)
}

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function ReleaseTimelineView({
  onOpenRelease,
  onScaleChange,
  onUpdatePlannedDate,
  readOnly = false,
  releases,
  scale,
}: ReleaseTimelineViewProps) {
  const dragStateRef = useRef<DragState | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)

  const metrics = useMemo(() => {
    const datedReleases = releases.filter((release) => release.plannedDate || release.actualDate)
    if (datedReleases.length === 0) {
      return null
    }

    const datedValues = datedReleases.flatMap((release) => [release.plannedDate, release.actualDate].filter(Boolean) as string[])
    const sortedDates = datedValues.map(parseDateOnly).sort((left, right) => left.getTime() - right.getTime())
    const paddingDays = scale === 'week' ? 14 : scale === 'month' ? 30 : 90
    const pixelsPerDay = scale === 'week' ? 20 : scale === 'month' ? 10 : 5
    const tickIntervalDays = scale === 'week' ? 7 : scale === 'month' ? 14 : 30
    const baseline = startOfDay(sortedDates[0])
    baseline.setUTCDate(baseline.getUTCDate() - paddingDays)
    const ceiling = startOfDay(sortedDates[sortedDates.length - 1])
    ceiling.setUTCDate(ceiling.getUTCDate() + paddingDays)
    const totalDays = Math.max(14, Math.round((ceiling.getTime() - baseline.getTime()) / (1000 * 60 * 60 * 24)))
    const ticks = Array.from({length: Math.floor(totalDays / tickIntervalDays) + 1}, (_, index) => {
      const dayOffset = index * tickIntervalDays
      const date = new Date(baseline)
      date.setUTCDate(date.getUTCDate() + dayOffset)
      return {
        date,
        dayOffset,
        key: `${scale}-${dayOffset}`,
      }
    })

    return {
      baseline,
      pixelsPerDay,
      ticks,
      totalDays,
      width: Math.max(760, totalDays * pixelsPerDay),
    }
  }, [releases, scale])

  useEffect(() => {
    dragStateRef.current = dragState
  }, [dragState])

  useEffect(() => {
    if (!dragState || !metrics) return

    const handlePointerMove = (event: PointerEvent) => {
      const current = dragStateRef.current
      if (!current) return
      const deltaDays = Math.round((event.clientX - current.pointerStartX) / metrics.pixelsPerDay)
      const previewDate = addDays(current.originalDate, deltaDays)
      setDragState({
        ...current,
        previewDate,
      })
    }

    const handlePointerUp = () => {
      const current = dragStateRef.current
      dragStateRef.current = null
      setDragState(null)

      if (!current) return
      if (current.previewDate === current.originalDate) return

      const release = releases.find((entry) => entry.id === current.releaseId)
      if (!release) return

      void onUpdatePlannedDate?.(release, current.previewDate)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp, {once: true})

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [dragState, metrics, onUpdatePlannedDate, releases])

  if (!metrics) {
    return (
      <div className='rounded-[28px] border border-border-subtle bg-surface-elevated p-12 text-center shadow-panel'>
        <div className='mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary'>
          <CalendarRange className='h-5 w-5'/>
        </div>
        <p className='text-sm font-medium text-text-strong'>Add planned or actual dates to unlock the timeline.</p>
        <p className='mt-1 text-xs text-text-muted'>The timeline visualizes drift once releases carry dates.</p>
      </div>
    )
  }

  return (
    <div className='rounded-[28px] border border-border-subtle bg-surface-elevated shadow-panel'>
      <div className='flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4'>
        <div>
          <h3 className='text-sm font-medium text-text-strong'>Release Timeline</h3>
          <p className='mt-1 text-xs text-text-muted'>
            {readOnly
              ? 'Filled markers show actual ship dates against the original plan.'
              : 'Drag hollow markers to adjust planned dates. Filled markers show actual ship dates.'}
          </p>
        </div>
        <div className='inline-flex rounded-full border border-border-subtle bg-surface-base p-1'>
          {(['week', 'month', 'quarter'] as const).map((option) => (
            <button
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                option === scale ? 'bg-primary text-white' : 'text-text-muted hover:text-text-strong'
              }`}
              key={option}
              onClick={() => onScaleChange(option)}
              type='button'
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className='overflow-x-auto'>
        <div className='min-w-[56rem] px-5 py-5' style={{width: metrics.width + 240}}>
          <div className='mb-4 ml-56 h-8 rounded-2xl bg-surface-base px-3'>
            <div className='relative h-full'>
              {metrics.ticks.map((tick) => (
                <div
                  className='absolute top-0 h-full border-l border-border-subtle/50 pl-2 pt-2'
                  key={tick.key}
                  style={{left: tick.dayOffset * metrics.pixelsPerDay}}
                >
                  <span className='font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted'>{formatHeaderDate(tick.date, scale)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className='space-y-3'>
            {releases.map((release) => {
              const plannedDate = dragState?.releaseId === release.id ? dragState.previewDate : release.plannedDate
              const plannedOffset = plannedDate ? dateToDayOffset(plannedDate, metrics.baseline) : null
              const actualOffset = release.actualDate ? dateToDayOffset(release.actualDate, metrics.baseline) : null
              const connectorLeft = plannedOffset != null && actualOffset != null ? Math.min(plannedOffset, actualOffset) * metrics.pixelsPerDay : null
              const connectorWidth = plannedOffset != null && actualOffset != null
                ? Math.abs(actualOffset - plannedOffset) * metrics.pixelsPerDay
                : null
              const drift = formatReleaseDrift(release)

              return (
                <div className='flex items-center gap-4 rounded-[24px] border border-border-subtle bg-surface-base px-4 py-4' key={release.id}>
                  <button
                    className='w-52 shrink-0 text-left'
                    onClick={() => onOpenRelease(release.id)}
                    type='button'
                  >
                    <p className='truncate text-sm font-medium text-text-strong'>{release.name}</p>
                    <p className='mt-1 text-xs text-text-muted'>
                      {release.plannedDate ? `Planned ${formatReleaseDate(release.plannedDate)}` : 'No planned date'}
                      {release.actualDate ? ` · Actual ${formatReleaseDate(release.actualDate)}` : ''}
                    </p>
                  </button>

                  <div className='relative h-12 flex-1 rounded-2xl bg-surface-elevated'>
                    {metrics.ticks.map((tick) => (
                      <div
                        className='absolute top-0 h-full border-l border-border-subtle/30'
                        key={`${release.id}-${tick.key}`}
                        style={{left: tick.dayOffset * metrics.pixelsPerDay}}
                      />
                    ))}

                    {connectorLeft != null && connectorWidth != null && connectorWidth > 0 ? (
                      <div
                        className='absolute top-1/2 h-px border-t border-dashed border-border-strong/60'
                        style={{
                          left: connectorLeft,
                          transform: 'translateY(-50%)',
                          width: connectorWidth,
                        }}
                      />
                    ) : null}

                    {plannedOffset != null ? (
                      <button
                        className='absolute top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-secondary bg-surface-base shadow-sm'
                        onClick={(event) => {
                          event.stopPropagation()
                          onOpenRelease(release.id)
                        }}
                        onPointerDown={readOnly || !onUpdatePlannedDate ? undefined : (event) => {
                          event.stopPropagation()
                          setDragState({
                            originalDate: plannedDate!,
                            pointerStartX: event.clientX,
                            previewDate: plannedDate!,
                            releaseId: release.id,
                          })
                        }}
                        style={{left: plannedOffset * metrics.pixelsPerDay}}
                        title={`${release.name} planned for ${formatReleaseDate(plannedDate)}`}
                        type='button'
                      />
                    ) : (
                      <div className='absolute left-3 top-1/2 -translate-y-1/2 text-xs text-text-muted'>No planned date</div>
                    )}

                    {actualOffset != null ? (
                      <button
                        className={`absolute top-1/2 z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-sm ${
                          drift.tone === 'error'
                            ? 'bg-error'
                            : drift.tone === 'warning'
                              ? 'bg-warning'
                              : 'bg-success'
                        }`}
                        onClick={() => onOpenRelease(release.id)}
                        style={{left: actualOffset * metrics.pixelsPerDay}}
                        title={`${release.name} shipped ${formatReleaseDate(release.actualDate)} (${drift.label})`}
                        type='button'
                      />
                    ) : null}
                  </div>

                  <div className='w-28 shrink-0 text-right'>
                    <p className='font-mono text-xs text-text-muted'>{drift.label}</p>
                    <p className='mt-1 text-[11px] text-text-muted'>{release.status.replace('_', ' ')}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
