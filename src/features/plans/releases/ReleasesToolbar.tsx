import type {ReactNode} from 'react'
import {ArrowUpDown, CalendarRange, Columns3, Filter, LayoutList, Plus, Share2, TableProperties} from 'lucide-react'

import {Button} from '../../../components/ui/button'
import {DropdownMenu, DropdownMenuContent, DropdownMenuTrigger} from '../../../components/ui/dropdown-menu'
import type {ReleaseHealth, ReleaseStatus} from '../plan.types'
import type {ReleaseColumnId, ReleaseViewMode} from './release-utils'
import {
  releaseHealthLabels,
  releaseStatusLabels,
  type ReleaseGroupBy,
  type ReleaseSortKey,
} from './release-utils'

const sortLabels: Record<ReleaseSortKey, string> = {
  actualDate: 'Actual date',
  name: 'Name',
  plannedDate: 'Planned date',
  position: 'Manual order',
}

const groupLabels: Record<ReleaseGroupBy, string> = {
  health: 'Health',
  none: 'None',
  status: 'Status',
}

const columnLabels: Record<ReleaseColumnId, string> = {
  actualDate: 'Actual Date',
  buildNumber: 'Build #',
  checklist: 'Checklist',
  drift: 'Drift',
  forceUpgrade: 'Force Upgrade',
  health: 'Health',
  linkedCards: 'Linked Cards',
  linkedSprints: 'Linked Sprints',
  plannedDate: 'Planned Date',
  status: 'Status',
}

const releaseStatuses: ReleaseStatus[] = ['draft', 'planned', 'in_progress', 'released', 'archived']
const releaseHealths: ReleaseHealth[] = ['on_track', 'at_risk', 'blocked']
const defaultStatusSelection = new Set<ReleaseStatus>(['draft', 'planned', 'in_progress', 'released'])
const defaultHealthSelection = new Set<ReleaseHealth>(['on_track', 'at_risk', 'blocked'])

type ReleasesToolbarProps = {
  groupBy: ReleaseGroupBy
  isCreating: boolean
  onAddRelease: () => void
  onClearFilters: () => void
  onGroupByChange: (groupBy: ReleaseGroupBy) => void
  onSortKeyChange: (sortKey: ReleaseSortKey) => void
  onOpenShareDialog: () => void
  onToggleColumn: (column: ReleaseColumnId) => void
  onToggleHealthFilter: (health: ReleaseHealth) => void
  onToggleStatusFilter: (status: ReleaseStatus) => void
  onViewModeChange: (mode: ReleaseViewMode) => void
  selectedHealths: Set<ReleaseHealth>
  selectedStatuses: Set<ReleaseStatus>
  sortKey: ReleaseSortKey
  viewMode: ReleaseViewMode
  visibleColumns: ReleaseColumnId[]
}

function FilterButton({active, children}: {active?: boolean; children: ReactNode}) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${active ? 'border-primary/20 bg-primary/10 text-primary' : 'border-border-subtle bg-surface-base text-text-muted'}`}>
      {children}
    </span>
  )
}

export function ReleasesToolbar({
  groupBy,
  isCreating,
  onAddRelease,
  onClearFilters,
  onGroupByChange,
  onOpenShareDialog,
  onSortKeyChange,
  onToggleColumn,
  onToggleHealthFilter,
  onToggleStatusFilter,
  onViewModeChange,
  selectedHealths,
  selectedStatuses,
  sortKey,
  viewMode,
  visibleColumns,
}: ReleasesToolbarProps) {
  const hasCustomFilters = releaseStatuses.some((status) => selectedStatuses.has(status) !== defaultStatusSelection.has(status))
    || releaseHealths.some((health) => selectedHealths.has(health) !== defaultHealthSelection.has(health))
  const hiddenColumnCount = Object.keys(columnLabels).length - visibleColumns.length

  return (
    <div className='flex flex-col gap-3 border-b border-border-subtle pb-4 sm:flex-row sm:items-start sm:justify-between'>
      <div>
        <h2 className='font-display text-xl font-semibold text-text-strong'>Releases</h2>
        <p className='mt-1 text-sm text-text-medium'>A spreadsheet replacement for planning, shipping, and retros.</p>
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <div className='inline-flex rounded-full border border-border-subtle bg-surface-base p-1'>
          <button
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'table' ? 'bg-primary text-white' : 'text-text-muted hover:text-text-strong'
            }`}
            onClick={() => onViewModeChange('table')}
            type='button'
          >
            <TableProperties className='h-3.5 w-3.5'/>
            Table
          </button>
          <button
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'timeline' ? 'bg-primary text-white' : 'text-text-muted hover:text-text-strong'
            }`}
            onClick={() => onViewModeChange('timeline')}
            type='button'
          >
            <CalendarRange className='h-3.5 w-3.5'/>
            Timeline
          </button>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='secondary'>
              <Filter className='h-4 w-4'/>
              Filter
              {hasCustomFilters ? <FilterButton active>Live</FilterButton> : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-72'>
            <div className='px-3 py-2 text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted'>Status</div>
            <div className='space-y-1 px-1 pb-2'>
              {releaseStatuses.map((status) => (
                <button
                  className='flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-text-medium transition-colors hover:bg-canvas-accent hover:text-text-strong'
                  key={status}
                  onClick={() => onToggleStatusFilter(status)}
                  type='button'
                >
                  <span>{releaseStatusLabels[status]}</span>
                  <span className='text-xs text-text-muted'>{selectedStatuses.has(status) ? '✓' : ''}</span>
                </button>
              ))}
            </div>

            <div className='border-t border-border-subtle px-3 py-2 text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted'>Health</div>
            <div className='space-y-1 px-1 pb-2'>
              {releaseHealths.map((health) => (
                <button
                  className='flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-text-medium transition-colors hover:bg-canvas-accent hover:text-text-strong'
                  key={health}
                  onClick={() => onToggleHealthFilter(health)}
                  type='button'
                >
                  <span>{releaseHealthLabels[health]}</span>
                  <span className='text-xs text-text-muted'>{selectedHealths.has(health) ? '✓' : ''}</span>
                </button>
              ))}
            </div>

            <div className='border-t border-border-subtle p-1'>
              <button
                className='w-full rounded-xl px-3 py-2 text-left text-sm text-text-medium transition-colors hover:bg-canvas-accent hover:text-text-strong'
                onClick={onClearFilters}
                type='button'
              >
                Reset filters
              </button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='secondary'>
              <ArrowUpDown className='h-4 w-4'/>
              {sortLabels[sortKey]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-48 p-1'>
            {(Object.keys(sortLabels) as ReleaseSortKey[]).map((key) => (
              <button
                className='flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-text-medium transition-colors hover:bg-canvas-accent hover:text-text-strong'
                key={key}
                onClick={() => onSortKeyChange(key)}
                type='button'
              >
                <span>{sortLabels[key]}</span>
                <span className='text-xs text-text-muted'>{key === sortKey ? '✓' : ''}</span>
              </button>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='secondary'>
              <LayoutList className='h-4 w-4'/>
              Group
              {groupBy !== 'none' ? <FilterButton>{groupLabels[groupBy]}</FilterButton> : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-44 p-1'>
            {(Object.keys(groupLabels) as ReleaseGroupBy[]).map((key) => (
              <button
                className='flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-text-medium transition-colors hover:bg-canvas-accent hover:text-text-strong'
                key={key}
                onClick={() => onGroupByChange(key)}
                type='button'
              >
                <span>{groupLabels[key]}</span>
                <span className='text-xs text-text-muted'>{key === groupBy ? '✓' : ''}</span>
              </button>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='secondary'>
              <Columns3 className='h-4 w-4'/>
              Columns
              {hiddenColumnCount > 0 ? <FilterButton>{hiddenColumnCount} hidden</FilterButton> : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-56 p-1'>
            {visibleColumns.map((column) => (
              <button
                className='flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-text-medium transition-colors hover:bg-canvas-accent hover:text-text-strong'
                key={column}
                onClick={() => onToggleColumn(column)}
                type='button'
              >
                <span>{columnLabels[column]}</span>
                <span className='text-xs text-text-muted'>✓</span>
              </button>
            ))}
            {(Object.keys(columnLabels) as ReleaseColumnId[])
              .filter((column) => !visibleColumns.includes(column))
              .map((column) => (
                <button
                  className='flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-text-medium transition-colors hover:bg-canvas-accent hover:text-text-strong'
                  key={column}
                  onClick={() => onToggleColumn(column)}
                  type='button'
                >
                  <span>{columnLabels[column]}</span>
                  <span className='text-xs text-text-muted'>Show</span>
                </button>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button disabled={isCreating} onClick={onAddRelease} variant='primary'>
          <Plus className='h-4 w-4'/>
          {isCreating ? 'Adding…' : 'Add release'}
        </Button>

        <Button onClick={onOpenShareDialog} variant='secondary'>
          <Share2 className='h-4 w-4'/>
          Share
        </Button>
      </div>
    </div>
  )
}
