import {closestCenter, DndContext, type DragEndEvent} from '@dnd-kit/core'
import {arrayMove, SortableContext, verticalListSortingStrategy} from '@dnd-kit/sortable'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {useEffect, useMemo, useState} from 'react'

import {Button} from '../../../components/ui/button'
import {ConfirmDialog} from '../../../components/ui/confirm-dialog'
import {useToast} from '../../../components/ui/toast'
import {useConfirmDialog} from '../../../hooks/useConfirmDialog'
import {getErrorMessage} from '../../../platform/data/rpc-adapter'
import {realtimeAdapter} from '../../../platform/realtime/realtime-adapter'
import {
  planReleasesQueryOptions,
  useCreateReleaseMutation,
  useDeleteReleaseMutation,
  useReorderReleaseMutation,
  useUpdateReleaseChecklistMutation,
  useUpdateReleaseHealthMutation,
  useUpdateReleaseMutation,
  useUpdateReleaseNotesMutation,
  useUpdateReleaseStatusMutation,
} from '../plan.queries'
import type {ReleaseChecklistItem, ReleaseHealth, ReleaseRecord, ReleaseStatus, UpdateReleaseInput} from '../plan.types'
import {ReleaseDetailDrawer} from './ReleaseDetailDrawer'
import {ReleasesEmptyState} from './ReleasesEmptyState'
import {ReleaseRow} from './ReleaseRow'
import {ReleaseShareDialog} from './ReleaseShareDialog'
import {ReleaseTimelineView} from './ReleaseTimelineView'
import {ReleasesToolbar} from './ReleasesToolbar'
import {
  computeReleasesSummary,
  defaultVisibleReleaseColumns,
  groupReleases,
  sortReleases,
  type ReleaseColumnId,
  type ReleaseGroupBy,
  type ReleaseSortKey,
  type ReleaseTimelineScale,
  type ReleaseViewMode,
} from './release-utils'

const defaultStatuses = new Set<ReleaseStatus>(['draft', 'planned', 'in_progress', 'released'])
const defaultHealths = new Set<ReleaseHealth>(['on_track', 'at_risk', 'blocked'])

const columnTemplates: Record<ReleaseColumnId, string> = {
  actualDate: '8.5rem',
  buildNumber: '7rem',
  checklist: '6.5rem',
  drift: '7rem',
  forceUpgrade: '6rem',
  health: '7rem',
  linkedCards: '6rem',
  linkedSprints: '6rem',
  plannedDate: '8.5rem',
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

export function ReleasesView({planViewId, workspaceId}: {planViewId: string; workspaceId: string}) {
  const queryClient = useQueryClient()
  const {toast} = useToast()
  const {confirm, confirmDialogProps} = useConfirmDialog()
  const releasesQuery = useQuery(planReleasesQueryOptions(planViewId))
  const createReleaseMutation = useCreateReleaseMutation(planViewId)
  const updateReleaseMutation = useUpdateReleaseMutation(planViewId)
  const updateReleaseStatusMutation = useUpdateReleaseStatusMutation(planViewId)
  const updateReleaseHealthMutation = useUpdateReleaseHealthMutation(planViewId)
  const updateReleaseNotesMutation = useUpdateReleaseNotesMutation(planViewId)
  const updateReleaseChecklistMutation = useUpdateReleaseChecklistMutation(planViewId)
  const reorderReleaseMutation = useReorderReleaseMutation(planViewId)
  const deleteReleaseMutation = useDeleteReleaseMutation(planViewId)

  const [sortKey, setSortKey] = useState<ReleaseSortKey>('position')
  const [groupBy, setGroupBy] = useState<ReleaseGroupBy>('none')
  const [viewMode, setViewMode] = useState<ReleaseViewMode>('table')
  const [timelineScale, setTimelineScale] = useState<ReleaseTimelineScale>('month')
  const [selectedStatuses, setSelectedStatuses] = useState<Set<ReleaseStatus>>(new Set(defaultStatuses))
  const [selectedHealths, setSelectedHealths] = useState<Set<ReleaseHealth>>(new Set(defaultHealths))
  const [visibleColumns, setVisibleColumns] = useState<ReleaseColumnId[]>(defaultVisibleReleaseColumns)
  const [expandedReleaseId, setExpandedReleaseId] = useState<string | null>(null)
  const [focusReleaseId, setFocusReleaseId] = useState<string | null>(null)
  const [drawerReleaseId, setDrawerReleaseId] = useState<string | null>(null)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)

  useEffect(() => {
    const releasesChannel = realtimeAdapter.channel(`plan-releases:${planViewId}`)
    const linkedCardsChannel = realtimeAdapter.channel(`plan-release-cards:${planViewId}`)
    const linkedSprintsChannel = realtimeAdapter.channel(`plan-release-sprints:${planViewId}`)

    releasesChannel
      .on('postgres_changes', {
        event: '*',
        filter: `plan_view_id=eq.${planViewId}`,
        schema: 'public',
        table: 'plan_releases',
      }, () => {
        void queryClient.invalidateQueries({queryKey: ['plan-releases', planViewId]})
      })
      .subscribe()

    linkedCardsChannel
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'plan_release_cards',
      }, () => {
        void queryClient.invalidateQueries({queryKey: ['plan-releases', planViewId]})
      })
      .subscribe()

    linkedSprintsChannel
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'plan_release_sprints',
      }, () => {
        void queryClient.invalidateQueries({queryKey: ['plan-releases', planViewId]})
      })
      .subscribe()

    return () => {
      realtimeAdapter.removeChannel(releasesChannel)
      realtimeAdapter.removeChannel(linkedCardsChannel)
      realtimeAdapter.removeChannel(linkedSprintsChannel)
    }
  }, [planViewId, queryClient])

  const releases = releasesQuery.data ?? []

  const filteredReleases = useMemo(() => sortReleases(
    releases.filter((release) => selectedStatuses.has(release.status) && selectedHealths.has(release.health)),
    sortKey,
  ), [releases, selectedHealths, selectedStatuses, sortKey])

  const groupedReleases = useMemo(
    () => groupReleases(filteredReleases, groupBy),
    [filteredReleases, groupBy],
  )

  const summary = useMemo(
    () => computeReleasesSummary(filteredReleases),
    [filteredReleases],
  )

  const dragEnabled = viewMode === 'table' && sortKey === 'position' && groupBy === 'none'
  const gridTemplateColumns = useMemo(
    () => ['2.75rem', 'minmax(16rem, 2.2fr)', ...visibleColumns.map((column) => columnTemplates[column]), '2.75rem'].join(' '),
    [visibleColumns],
  )

  const activeDrawerRelease = drawerReleaseId
    ? releases.find((release) => release.id === drawerReleaseId) ?? null
    : null

  const handleAddRelease = async () => {
    try {
      const created = await createReleaseMutation.mutateAsync({
        name: 'Untitled release',
        planViewId,
      })
      setExpandedReleaseId(null)
      setFocusReleaseId(created.id)
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: 'Couldn’t create release',
        variant: 'error',
      })
    }
  }

  const handleUpdateRelease = async (input: UpdateReleaseInput, fieldLabel: string) => {
    try {
      await updateReleaseMutation.mutateAsync(input)
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: `Couldn’t save ${fieldLabel}`,
        variant: 'error',
      })
      throw error
    }
  }

  const handleStatusChange = async (release: ReleaseRecord, status: ReleaseStatus) => {
    if (status === 'archived') {
      handleArchiveRelease(release)
      return
    }

    try {
      await updateReleaseStatusMutation.mutateAsync({releaseId: release.id, status})
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: 'Couldn’t save status',
        variant: 'error',
      })
      throw error
    }
  }

  const handleHealthChange = async (release: ReleaseRecord, health: ReleaseHealth) => {
    try {
      await updateReleaseHealthMutation.mutateAsync({health, releaseId: release.id})
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: 'Couldn’t save health',
        variant: 'error',
      })
      throw error
    }
  }

  const handleSaveNotes = async (releaseId: string, noteSections: ReleaseRecord['noteSections']) => {
    await updateReleaseNotesMutation.mutateAsync({noteSections, releaseId})
  }

  const handleSaveChecklist = async (releaseId: string, checklistItems: ReleaseChecklistItem[]) => {
    await updateReleaseChecklistMutation.mutateAsync({checklistItems, releaseId})
  }

  const handleSaveRetro = async (
    releaseId: string,
    input: {
      abVariations: string | null
      releaseNotes: string | null
      retroNotes: string | null
      retroUrl: string | null
    },
  ) => {
    await handleUpdateRelease({...input, releaseId}, 'retro fields')
  }

  const handleArchiveRelease = (release: ReleaseRecord) => {
    void updateReleaseStatusMutation.mutateAsync({releaseId: release.id, status: 'archived'})
      .then(() => {
        if (expandedReleaseId === release.id) {
          setExpandedReleaseId(null)
        }
        toast({
          title: 'Release archived',
          action: {
            label: 'Undo',
            onClick: () => {
              void updateReleaseStatusMutation.mutateAsync({releaseId: release.id, status: release.status})
            },
          },
        })
      })
      .catch((error) => {
        toast({
          description: getErrorMessage(error),
          title: 'Couldn’t archive release',
          variant: 'error',
        })
      })
  }

  const handleDeleteRelease = async (release: ReleaseRecord) => {
    if (!await confirm({title: `Permanently delete "${release.name}"?`, description: 'This cannot be undone.', variant: 'destructive', confirmLabel: 'Delete'})) {
      return
    }

    void deleteReleaseMutation.mutateAsync(release.id)
      .then(() => {
        if (expandedReleaseId === release.id) {
          setExpandedReleaseId(null)
        }
        if (drawerReleaseId === release.id) {
          setDrawerReleaseId(null)
        }
        toast({title: 'Release deleted'})
      })
      .catch((error) => {
        toast({
          description: getErrorMessage(error),
          title: 'Couldn’t delete release',
          variant: 'error',
        })
      })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const {active, over} = event
    if (!over || active.id === over.id || !dragEnabled) {
      return
    }

    const current = queryClient.getQueryData<ReleaseRecord[]>(['plan-releases', planViewId]) ?? releases
    const oldIndex = current.findIndex((release) => release.id === active.id)
    const newIndex = current.findIndex((release) => release.id === over.id)

    if (oldIndex === -1 || newIndex === -1) {
      return
    }

    const previous = current
    const reordered = arrayMove(current, oldIndex, newIndex).map((release, index) => ({
      ...release,
      position: index,
    }))
    queryClient.setQueryData<ReleaseRecord[]>(['plan-releases', planViewId], reordered)

    const targetIndex = filteredReleases.findIndex((release) => release.id === over.id)
    if (targetIndex === -1) {
      return
    }

    void reorderReleaseMutation.mutateAsync({
      newPosition: filteredReleases[targetIndex].position,
      releaseId: active.id as string,
    }).catch(() => {
      queryClient.setQueryData(['plan-releases', planViewId], previous)
    })
  }

  const toggleStatusFilter = (status: ReleaseStatus) => {
    setSelectedStatuses((current) => {
      const next = new Set(current)
      if (next.has(status) && next.size > 1) {
        next.delete(status)
        return next
      }
      next.add(status)
      return next
    })
  }

  const toggleHealthFilter = (health: ReleaseHealth) => {
    setSelectedHealths((current) => {
      const next = new Set(current)
      if (next.has(health) && next.size > 1) {
        next.delete(health)
        return next
      }
      next.add(health)
      return next
    })
  }

  const toggleColumn = (column: ReleaseColumnId) => {
    setVisibleColumns((current) => (
      current.includes(column)
        ? current.filter((entry) => entry !== column)
        : [...current, column].sort((left, right) => defaultVisibleReleaseColumns.indexOf(left) - defaultVisibleReleaseColumns.indexOf(right))
    ))
  }

  if (releasesQuery.isPending) {
    return (
      <div className='space-y-4'>
        <div className='h-16 animate-pulse rounded-3xl bg-border-subtle/30'/>
        <div className='rounded-[28px] border border-border-subtle bg-surface-elevated p-3 shadow-panel'>
          <div className='grid gap-3 px-2 py-2' style={{gridTemplateColumns}}>
            <div className='h-4 rounded bg-border-subtle/30'/>
            <div className='h-4 rounded bg-border-subtle/30'/>
            {visibleColumns.map((column) => (
              <div className='h-4 rounded bg-border-subtle/30' key={column}/>
            ))}
            <div className='h-4 rounded bg-border-subtle/30'/>
          </div>
          <div className='space-y-3 pt-3'>
            {Array.from({length: 6}).map((_, index) => (
              <div className='h-14 animate-pulse rounded-[22px] bg-border-subtle/30' key={index}/>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (releasesQuery.error) {
    return (
      <div className='rounded-[28px] border border-border-subtle bg-surface-elevated p-6 shadow-panel'>
        <div className='space-y-2'>
          <p className='text-base font-medium text-text-strong'>Couldn’t load releases</p>
          <p className='text-sm text-text-medium'>{getErrorMessage(releasesQuery.error)}</p>
        </div>
        <div className='mt-4'>
          <Button onClick={() => void releasesQuery.refetch()} variant='secondary'>Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className='space-y-4 pb-10'>
        <ReleasesToolbar
          groupBy={groupBy}
          isCreating={createReleaseMutation.isPending}
          onAddRelease={handleAddRelease}
          onClearFilters={() => {
            setSelectedStatuses(new Set(defaultStatuses))
            setSelectedHealths(new Set(defaultHealths))
          }}
          onGroupByChange={setGroupBy}
          onOpenShareDialog={() => setShareDialogOpen(true)}
          onSortKeyChange={setSortKey}
          onToggleColumn={toggleColumn}
          onToggleHealthFilter={toggleHealthFilter}
          onToggleStatusFilter={toggleStatusFilter}
          onViewModeChange={setViewMode}
          selectedHealths={selectedHealths}
          selectedStatuses={selectedStatuses}
          sortKey={sortKey}
          viewMode={viewMode}
          visibleColumns={visibleColumns}
        />

        <div className='font-mono text-xs text-text-muted'>
          <span className='mr-3'>{summary.inProgressCount} in progress</span>
          <span className={`mr-3 ${summary.overdueCount > 0 ? 'text-error' : ''}`}>{summary.overdueCount} overdue</span>
          <span className={`mr-3 ${summary.shippedWithPlanCount > 0 && summary.onTimeCount / summary.shippedWithPlanCount >= 0.8 ? 'text-success' : ''}`}>
            {summary.onTimeCount}/{summary.shippedWithPlanCount} on time
          </span>
          <span>
            avg drift:{' '}
            {summary.averageDrift == null
              ? '—'
              : `${summary.averageDrift > 0 ? '+' : ''}${summary.averageDrift.toFixed(1)} days`}
          </span>
        </div>

        {releases.length === 0 ? (
          <ReleasesEmptyState
            onAddRelease={() => void handleAddRelease()}
          />
        ) : viewMode === 'timeline' ? (
          <ReleaseTimelineView
            onOpenRelease={(releaseId) => setDrawerReleaseId(releaseId)}
            onScaleChange={setTimelineScale}
            onUpdatePlannedDate={(release, plannedDate) => handleUpdateRelease({
              plannedDate,
              releaseId: release.id,
            }, 'planned date')}
            releases={filteredReleases}
            scale={timelineScale}
          />
        ) : (
          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className='rounded-[28px] border border-border-subtle bg-surface-elevated px-3 py-3 shadow-panel'>
              <div className='grid items-center gap-3 border-b border-border-subtle/70 px-3 pb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted' style={{gridTemplateColumns}}>
                <div/>
                <div>Name</div>
                {visibleColumns.map((column) => (
                  <div key={column}>{columnLabels[column]}</div>
                ))}
                <div/>
              </div>

              <div className='pt-3'>
                {groupedReleases.map((group) => (
                  <div className='space-y-3' key={group.id}>
                    {groupBy !== 'none' ? (
                      <div className='px-2 pt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted'>
                        {group.label}
                      </div>
                    ) : null}

                    <SortableContext items={group.releases.map((release) => release.id)} strategy={verticalListSortingStrategy}>
                      {group.releases.map((release) => (
                        <ReleaseRow
                          autoFocusName={focusReleaseId === release.id}
                          canDrag={dragEnabled}
                          gridTemplateColumns={gridTemplateColumns}
                          isExpanded={expandedReleaseId === release.id}
                          key={release.id}
                          onArchiveRelease={handleArchiveRelease}
                          onAutoFocusHandled={() => {
                            if (focusReleaseId === release.id) {
                              setFocusReleaseId(null)
                            }
                          }}
                          onDeleteRelease={handleDeleteRelease}
                          onOpenDetail={(targetRelease) => setDrawerReleaseId(targetRelease.id)}
                          onExpandToggle={() => {
                            setExpandedReleaseId((current) => (current === release.id ? null : release.id))
                          }}
                          onHealthChange={handleHealthChange}
                          onSaveChecklist={handleSaveChecklist}
                          onSaveNotes={handleSaveNotes}
                          onSaveRetro={handleSaveRetro}
                          onStatusChange={handleStatusChange}
                          onUpdateRelease={handleUpdateRelease}
                          planViewId={planViewId}
                          release={release}
                          visibleColumns={visibleColumns}
                          workspaceId={workspaceId}
                        />
                      ))}
                    </SortableContext>
                  </div>
                ))}
              </div>
            </div>
          </DndContext>
        )}
      </div>

      {shareDialogOpen ? (
        <ReleaseShareDialog onClose={() => setShareDialogOpen(false)} planViewId={planViewId}/>
      ) : null}

      {activeDrawerRelease ? (
        <ReleaseDetailDrawer
          onClose={() => setDrawerReleaseId(null)}
          onSaveChecklist={handleSaveChecklist}
          onSaveNotes={handleSaveNotes}
          onSaveRetro={handleSaveRetro}
          planViewId={planViewId}
          release={activeDrawerRelease}
          workspaceId={workspaceId}
        />
      ) : null}
      {confirmDialogProps ? <ConfirmDialog {...confirmDialogProps}/> : null}
    </>
  )
}
