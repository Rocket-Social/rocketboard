import {useQuery} from '@tanstack/react-query'
import {useParams} from '@tanstack/react-router'
import {ChevronDown, ChevronRight, Globe2} from 'lucide-react'
import {useMemo, useState} from 'react'

import {Button} from '../../../components/ui/button'
import {getErrorMessage} from '../../../platform/data/rpc-adapter'
import {stripMarkdown} from '../../rich-text/prepare-content'
import {tiptapJsonToMarkdown} from '../../rich-text/tiptap-to-markdown'
import {publicReleaseShareQueryOptions} from '../plan.queries'
import type {ReleaseRecord} from '../plan.types'
import {ReleaseTimelineView} from './ReleaseTimelineView'
import {
  computeReleasesSummary,
  defaultVisibleReleaseColumns,
  formatReleaseChecklistProgress,
  formatReleaseDrift,
  type ReleaseColumnId,
  type ReleaseTimelineScale,
  type ReleaseViewMode,
} from './release-utils'

const columnTemplates: Record<ReleaseColumnId, string> = {
  actualDate: '8rem',
  buildNumber: '7rem',
  checklist: '6.5rem',
  drift: '7rem',
  forceUpgrade: '6rem',
  health: '7rem',
  linkedCards: '6rem',
  linkedSprints: '6rem',
  plannedDate: '8rem',
  status: '8rem',
}

const columnLabels: Record<ReleaseColumnId, string> = {
  actualDate: 'Actual Date',
  buildNumber: 'Build #',
  checklist: 'Checklist',
  drift: 'Drift',
  forceUpgrade: 'Force',
  health: 'Health',
  linkedCards: 'Cards',
  linkedSprints: 'Sprints',
  plannedDate: 'Planned Date',
  status: 'Status',
}

function PublicReleaseDetailPanel({release}: {release: ReleaseRecord}) {
  return (
    <div className='border-t border-border-subtle bg-surface-base px-4 py-4'>
      <div className='grid gap-4 lg:grid-cols-2'>
        <div className='rounded-3xl border border-border-subtle bg-surface-elevated p-4'>
          <p className='text-xs font-medium uppercase tracking-[0.18em] text-text-muted'>Change Notes</p>
          <div className='mt-3 space-y-3'>
            {release.noteSections.length > 0 ? release.noteSections.map((section) => (
              <div key={section.label}>
                <p className='text-sm font-medium text-text-strong'>{section.label}</p>
                <p className='mt-1 whitespace-pre-wrap text-sm text-text-medium'>{stripMarkdown(tiptapJsonToMarkdown(section.content)) || 'No notes yet.'}</p>
              </div>
            )) : (
              <p className='text-sm text-text-muted'>No internal notes captured.</p>
            )}
          </div>
        </div>

        <div className='rounded-3xl border border-border-subtle bg-surface-elevated p-4'>
          <p className='text-xs font-medium uppercase tracking-[0.18em] text-text-muted'>Checklist</p>
          <div className='mt-3 space-y-2'>
            {release.checklistItems.length > 0 ? release.checklistItems.map((item) => (
              <div className='flex items-center justify-between rounded-2xl border border-border-subtle bg-surface-base px-3 py-2.5' key={item.id}>
                <span className='text-sm text-text-strong'>{item.label}</span>
                <span className='font-mono text-[11px] text-text-muted'>{item.checked ? 'Done' : 'Open'}</span>
              </div>
            )) : (
              <p className='text-sm text-text-muted'>No checklist items captured.</p>
            )}
          </div>

          {(release.releaseNotes || release.abVariations || release.retroNotes || release.retroUrl) ? (
            <div className='mt-4 space-y-3 border-t border-border-subtle pt-4'>
              {release.releaseNotes ? (
                <div>
                  <p className='text-xs font-medium uppercase tracking-[0.18em] text-text-muted'>Release Notes</p>
                  <p className='mt-1 whitespace-pre-wrap text-sm text-text-medium'>{release.releaseNotes}</p>
                </div>
              ) : null}
              {release.abVariations ? (
                <div>
                  <p className='text-xs font-medium uppercase tracking-[0.18em] text-text-muted'>A/B Variations</p>
                  <p className='mt-1 whitespace-pre-wrap text-sm text-text-medium'>{release.abVariations}</p>
                </div>
              ) : null}
              {release.retroNotes ? (
                <div>
                  <p className='text-xs font-medium uppercase tracking-[0.18em] text-text-muted'>Retro Notes</p>
                  <p className='mt-1 whitespace-pre-wrap text-sm text-text-medium'>{release.retroNotes}</p>
                </div>
              ) : null}
              {release.retroUrl ? (
                <div>
                  <p className='text-xs font-medium uppercase tracking-[0.18em] text-text-muted'>Retro URL</p>
                  <a className='mt-1 inline-block text-sm text-primary underline' href={release.retroUrl} rel='noreferrer' target='_blank'>
                    {release.retroUrl}
                  </a>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function PublicReleaseSharePage() {
  const {shareToken} = useParams({strict: false}) as {shareToken: string}
  const shareQuery = useQuery(publicReleaseShareQueryOptions(shareToken))
  const [expandedReleaseId, setExpandedReleaseId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ReleaseViewMode>('table')
  const [timelineScale, setTimelineScale] = useState<ReleaseTimelineScale>('month')

  const releases = shareQuery.data?.releases ?? []
  const summary = useMemo(() => computeReleasesSummary(releases), [releases])
  const gridTemplateColumns = ['minmax(14rem, 2fr)', ...defaultVisibleReleaseColumns.map((column) => columnTemplates[column]), '2.75rem'].join(' ')

  if (shareQuery.isPending) {
    return (
      <div className='mx-auto max-w-6xl px-6 py-10'>
        <div className='h-14 animate-pulse rounded-3xl bg-border-subtle/30'/>
      </div>
    )
  }

  if (shareQuery.error) {
    return (
      <div className='mx-auto max-w-3xl px-6 py-16'>
        <div className='rounded-[28px] border border-border-subtle bg-surface-elevated p-8 text-center shadow-panel'>
          <p className='font-display text-xl font-semibold text-text-strong'>Release share unavailable</p>
          <p className='mt-3 text-sm text-text-medium'>{getErrorMessage(shareQuery.error)}</p>
        </div>
      </div>
    )
  }

  return (
    <div className='min-h-screen bg-canvas px-6 py-10'>
      <div className='mx-auto max-w-6xl space-y-4'>
        <div className='flex flex-wrap items-start justify-between gap-4 border-b border-border-subtle pb-5'>
          <div>
            <div className='inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-base px-3 py-1.5 text-xs font-medium text-text-muted'>
              <Globe2 className='h-3.5 w-3.5'/>
              Shared release board
            </div>
            <h1 className='mt-4 font-display text-3xl font-semibold text-text-strong'>{shareQuery.data?.planName}</h1>
            <p className='mt-2 text-sm text-text-medium'>{shareQuery.data?.workspaceName}</p>
          </div>

          <div className='inline-flex rounded-full border border-border-subtle bg-surface-base p-1'>
            <button
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'table' ? 'bg-primary text-white' : 'text-text-muted hover:text-text-strong'}`}
              onClick={() => setViewMode('table')}
              type='button'
            >
              Table
            </button>
            <button
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'timeline' ? 'bg-primary text-white' : 'text-text-muted hover:text-text-strong'}`}
              onClick={() => setViewMode('timeline')}
              type='button'
            >
              Timeline
            </button>
          </div>
        </div>

        <div className='font-mono text-xs text-text-muted'>
          <span className='mr-3'>{summary.inProgressCount} in progress</span>
          <span className={`mr-3 ${summary.overdueCount > 0 ? 'text-error' : ''}`}>{summary.overdueCount} overdue</span>
          <span className='mr-3'>{summary.onTimeCount}/{summary.shippedWithPlanCount} on time</span>
          <span>
            avg drift:{' '}
            {summary.averageDrift == null
              ? '—'
              : `${summary.averageDrift > 0 ? '+' : ''}${summary.averageDrift.toFixed(1)} days`}
          </span>
        </div>

        {viewMode === 'timeline' ? (
          <ReleaseTimelineView
            onOpenRelease={(releaseId) => setExpandedReleaseId(releaseId)}
            onScaleChange={setTimelineScale}
            readOnly
            releases={releases}
            scale={timelineScale}
          />
        ) : (
          <div className='rounded-[28px] border border-border-subtle bg-surface-elevated px-3 py-3 shadow-panel'>
            <div className='grid items-center gap-3 border-b border-border-subtle/70 px-3 pb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted' style={{gridTemplateColumns}}>
              <div>Name</div>
              {defaultVisibleReleaseColumns.map((column) => (
                <div key={column}>{columnLabels[column]}</div>
              ))}
              <div/>
            </div>

            <div className='space-y-3 pt-3'>
              {releases.map((release) => {
                const drift = formatReleaseDrift(release)
                return (
                  <div className='overflow-hidden rounded-[24px] border border-border-subtle bg-surface-base shadow-panel' key={release.id}>
                    <div className='grid items-center gap-3 px-3 py-3' style={{gridTemplateColumns}}>
                      <div className='text-sm font-medium text-text-strong'>{release.name}</div>
                      <div className='rounded-full border border-border-subtle bg-surface-base px-2.5 py-1 text-center text-[11px] font-medium text-text-muted'>{release.status.replace('_', ' ')}</div>
                      <div className='font-mono text-xs text-text-muted'>{release.buildNumber ?? '—'}</div>
                      <div className='font-mono text-xs text-text-muted'>{release.plannedDate ?? '—'}</div>
                      <div className='font-mono text-xs text-text-muted'>{release.actualDate ?? '—'}</div>
                      <div className='font-mono text-xs text-text-muted'>{drift.label}</div>
                      <div className='font-mono text-xs text-text-muted'>{release.linkedCardCount}</div>
                      <div className='font-mono text-xs text-text-muted'>{release.linkedSprintCount}</div>
                      <div className='font-mono text-xs text-text-muted'>{formatReleaseChecklistProgress(release)}</div>
                      <div className='font-mono text-xs text-text-muted'>{release.health.replace('_', ' ')}</div>
                      <div className='font-mono text-xs text-text-muted'>{release.forceUpgrade ? 'Yes' : 'No'}</div>
                      <button
                        className='flex items-center justify-center rounded-lg p-1 text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong'
                        onClick={() => setExpandedReleaseId((current) => current === release.id ? null : release.id)}
                        type='button'
                      >
                        {expandedReleaseId === release.id ? <ChevronDown className='h-4 w-4'/> : <ChevronRight className='h-4 w-4'/>}
                      </button>
                    </div>
                    {expandedReleaseId === release.id ? <PublicReleaseDetailPanel release={release}/> : null}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className='pt-4 text-center text-xs text-text-muted'>
          <Button onClick={() => window.location.reload()} variant='ghost'>Refresh snapshot</Button>
        </div>
      </div>
    </div>
  )
}
