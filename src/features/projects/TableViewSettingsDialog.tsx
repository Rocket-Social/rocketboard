import {Columns3, Filter, SlidersHorizontal} from 'lucide-react'

import {Button} from '../../components/ui/button'
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '../../components/ui/dialog'
import {Input} from '../../components/ui/input'
import type {ProjectStatusOption} from '../cards/card.types'
import type {CustomFieldDefinition} from '../fields/field.types'
import type {ProjectBuiltinFieldLabels} from './builtin-fields'
import {
  defaultTableTitleWidth,
  getDefaultColumnWidth,
  listAvailableTableColumns,
  listTableSortFieldOptions,
} from './table-view-fields'
import type {ProjectTableViewDraft, TableSortFieldKey} from './project-view.types'

type TableViewSettingsDialogProps = {
  builtinFieldLabels?: ProjectBuiltinFieldLabels | null
  customFields: CustomFieldDefinition[]
  draft: ProjectTableViewDraft
  isDisabled?: boolean
  isOpen: boolean
  onClose: () => void
  onDraftChange: (draft: ProjectTableViewDraft) => void
  statusOptions: ProjectStatusOption[]
}

const priorityFilterOptions = [
  {label: 'Urgent', value: 'urgent'},
  {label: 'High', value: 'high'},
  {label: 'Medium', value: 'medium'},
  {label: 'Low', value: 'low'},
] as const

function parseWidth(value: string) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed)) {
    return null
  }

  return Math.round(parsed)
}

export function TableViewSettingsDialog({
  builtinFieldLabels,
  customFields,
  draft,
  isDisabled = false,
  isOpen,
  onClose,
  onDraftChange,
  statusOptions,
}: TableViewSettingsDialogProps) {
  const availableColumns = listAvailableTableColumns(customFields, builtinFieldLabels)
  const tableSortFieldOptions = listTableSortFieldOptions(customFields, builtinFieldLabels)
  const widthFieldKeys = ['title', ...draft.visibleFieldKeys]

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className='h-[min(46rem,calc(100vh-2rem))] w-[min(54rem,calc(100vw-2rem))] overflow-hidden rounded-[28px] bg-surface-base p-0'>
        <DialogHeader className='px-6 py-5'>
          <p className='font-mono text-xs uppercase tracking-[0.24em] text-text-muted'>Table View</p>
          <DialogTitle className='mt-1 font-display text-2xl'>Configure this table</DialogTitle>
          <DialogDescription className='mt-2'>Configure how this table looks.</DialogDescription>
        </DialogHeader>

        <div className='grid h-[calc(100%-5.5rem)] gap-6 overflow-y-auto px-6 py-5 lg:grid-cols-2'>
          <section className='rounded-3xl border border-border-subtle bg-surface-elevated p-5 shadow-panel'>
            <div className='flex items-center gap-2'>
              <Filter className='h-4 w-4 text-text-muted'/>
              <h3 className='font-display text-lg font-semibold text-text-strong'>Table configuration</h3>
            </div>

            <div className='mt-4 space-y-5'>
              <label className='space-y-2'>
                <span className='text-sm font-medium text-text-strong'>Group by</span>
                <select
                  className='h-10 w-full rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                  disabled={isDisabled}
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      groupBy: event.target.value === 'priority' ? 'priority' : 'status',
                    })
                  }
                  value={draft.groupBy}
                >
                  <option value='status'>Status</option>
                  <option value='priority'>Priority</option>
                </select>
              </label>

              <div className='space-y-2'>
                <span className='text-sm font-medium text-text-strong'>Sort</span>
                <div className='grid gap-3 sm:grid-cols-[1fr_auto]'>
                  <select
                    className='h-10 w-full rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                    disabled={isDisabled}
                    onChange={(event) => {
                      const nextFieldKey = event.target.value

                      onDraftChange({
                              ...draft,
                              sort:
                                nextFieldKey === 'none'
                                  ? []
                                  : [{
                                      direction: draft.sort[0]?.direction ?? 'asc',
                                      fieldKey: nextFieldKey as TableSortFieldKey,
                                    }],
                            })
                    }}
                    value={draft.sort[0]?.fieldKey ?? 'none'}
                  >
                    <option value='none'>No sort</option>
                    {tableSortFieldOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className='h-10 w-full rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                    disabled={isDisabled || draft.sort.length === 0}
                    onChange={(event) => {
                      if (draft.sort.length === 0) return

                      onDraftChange({
                        ...draft,
                        sort: [{
                          ...draft.sort[0],
                          direction: event.target.value === 'desc' ? 'desc' : 'asc',
                        }],
                      })
                    }}
                    value={draft.sort[0]?.direction ?? 'asc'}
                  >
                    <option value='asc'>Ascending</option>
                    <option value='desc'>Descending</option>
                  </select>
                </div>
              </div>

              <div className='space-y-3'>
                <span className='text-sm font-medium text-text-strong'>Filter by status</span>
                <div className='grid gap-2 sm:grid-cols-2'>
                  {statusOptions.map((option) => {
                    const checked = draft.filters.status.includes(option.id)

                    return (
                      <label className='flex items-center gap-2 text-sm text-text-medium' key={option.id}>
                        <input
                          checked={checked}
                          className='h-4 w-4 rounded border-border-subtle'
                          disabled={isDisabled}
                          onChange={(event) =>
                            onDraftChange({
                              ...draft,
                              filters: {
                                ...draft.filters,
                                status: event.target.checked
                                  ? [...draft.filters.status, option.id]
                                  : draft.filters.status.filter((entry) => entry !== option.id),
                              },
                            })
                          }
                          type='checkbox'
                        />
                        <span>{option.label}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className='space-y-3'>
                <span className='text-sm font-medium text-text-strong'>Filter by priority</span>
                <div className='grid gap-2 sm:grid-cols-2'>
                  {priorityFilterOptions.map((option) => {
                    const checked = draft.filters.priority.includes(option.value)

                    return (
                      <label className='flex items-center gap-2 text-sm text-text-medium' key={option.value}>
                        <input
                          checked={checked}
                          className='h-4 w-4 rounded border-border-subtle'
                          disabled={isDisabled}
                          onChange={(event) =>
                            onDraftChange({
                              ...draft,
                              filters: {
                                ...draft.filters,
                                priority: event.target.checked
                                  ? [...draft.filters.priority, option.value]
                                  : draft.filters.priority.filter((entry) => entry !== option.value),
                              },
                            })
                          }
                          type='checkbox'
                        />
                        <span>{option.label}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className='rounded-2xl border border-border-subtle bg-canvas-accent px-4 py-3 text-sm text-text-muted'>
                Visible columns, column order, and column names now live in the table header menu. Use this panel for grouping, filters, sort, and widths.
              </div>
            </div>
          </section>

          <section className='rounded-3xl border border-border-subtle bg-surface-elevated p-5 shadow-panel'>
            <div className='flex items-center gap-2'>
              <SlidersHorizontal className='h-4 w-4 text-text-muted'/>
              <h3 className='font-display text-lg font-semibold text-text-strong'>Personal layout</h3>
            </div>

            <div className='mt-4 space-y-5'>
              <div className='space-y-3'>
                <span className='text-sm font-medium text-text-strong'>Column widths</span>
                <div className='space-y-3'>
                  {widthFieldKeys.map((fieldKey) => {
                    const column = availableColumns.find((entry) => entry.key === fieldKey)
                    const label = fieldKey === 'title' ? 'Title' : column?.label ?? fieldKey
                    const defaultWidth =
                      fieldKey === 'title'
                        ? defaultTableTitleWidth
                        : getDefaultColumnWidth(fieldKey, customFields)
                    const currentWidth = draft.columnWidths[fieldKey] ?? defaultWidth

                    return (
                      <label className='grid gap-2 sm:grid-cols-[1fr_8rem]' key={fieldKey}>
                        <span className='flex items-center text-sm text-text-medium'>{label}</span>
                        <Input
                          disabled={isDisabled}
                          min='96'
                          onChange={(event) => {
                            const parsedWidth = parseWidth(event.target.value)
                            const nextColumnWidths = {...draft.columnWidths}

                            if (!parsedWidth) {
                              delete nextColumnWidths[fieldKey]
                            } else {
                              nextColumnWidths[fieldKey] = parsedWidth
                            }

                            onDraftChange({
                              ...draft,
                              columnWidths: nextColumnWidths,
                            })
                          }}
                          type='number'
                          value={currentWidth}
                        />
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className='rounded-2xl border border-border-subtle bg-canvas-accent px-4 py-3 text-sm text-text-muted'>
                {isDisabled
                  ? 'Project view settings are temporarily read-only while Rocketboard reconnects to the project view backend.'
                  : 'Column widths and collapsed groups are saved for you. Other settings are shared with your team.'}
              </div>

              <div className='flex items-center justify-between gap-2'>
                <div className='flex items-center gap-2 text-xs uppercase tracking-wide text-text-muted'>
                  <Columns3 className='h-3.5 w-3.5'/>
                  {draft.visibleFieldKeys.length} visible columns
                </div>
                <Button onClick={onClose} variant='primary'>
                  Done
                </Button>
              </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
