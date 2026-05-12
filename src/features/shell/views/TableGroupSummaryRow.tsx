import {useCallback, useRef, useState} from 'react'

import type {Mode} from '../../../app/mode'
import type {ProjectTableTask} from '../../cards/card-view-mappers'
import type {ProjectPriorityOption, ProjectStatusOption, TableGroupBy} from '../../cards/card.types'
import type {BuiltinTableFieldKey} from '../../projects/builtin-fields'
import type {TableColumnDefinition} from '../../projects/table-view-fields'
import {OPTION_COLOR_PALETTE, type OptionColorKey, statusCategoryColor} from '../theme'
import {DistributionBar, type DistributionSegment} from './DistributionBar'
import {NumericCalculationPopup, type CalculationConfig} from './NumericCalculationPopup'

// --- Calculation helpers ---

function computeNumeric(
  values: number[],
  calculation: CalculationConfig['calculation'],
): number | null {
  if (values.length === 0 || calculation === 'none') return null

  switch (calculation) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0)
    case 'average':
      return values.reduce((a, b) => a + b, 0) / values.length
    case 'median': {
      const sorted = [...values].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    }
    case 'min':
      return Math.min(...values)
    case 'max':
      return Math.max(...values)
    case 'count':
      return values.length
    default:
      return null
  }
}

function formatNumericValue(raw: number | null, config: CalculationConfig): string {
  if (raw === null) return ''
  const rounded = Math.round(raw * 100) / 100
  const str = String(rounded)
  const unit = config.unit
  if (!unit) return str
  return config.unitPosition === 'right' ? `${str}${unit}` : `${unit}${str}`
}

function getEffortValues(tasks: ProjectTableTask[]): number[] {
  return tasks.filter((t) => t.card.effort != null).map((t) => t.card.effort!)
}

function getCustomNumberValues(tasks: ProjectTableTask[], fieldKey: string): number[] {
  const values: number[] = []
  for (const task of tasks) {
    const cv = task.card.customFieldValues[fieldKey]
    if (cv?.numberValue != null) {
      values.push(cv.numberValue)
    }
  }
  return values
}

// --- Distribution helpers ---

function buildStatusSegments(
  tasks: ProjectTableTask[],
  mode: Mode,
  statusOptions: ProjectStatusOption[],
): DistributionSegment[] {
  const counts = new Map<string, number>()
  for (const task of tasks) {
    const key = task.card.statusOptionId ?? '__no_status'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return statusOptions.map((option) => {
    const label = option.label
    const category = option.category
    return {color: statusCategoryColor(mode, category), count: counts.get(option.id) ?? 0, key: option.id, label}
  })
}

function buildPrioritySegments(
  tasks: ProjectTableTask[],
  _mode: Mode,
  priorityOptions: ProjectPriorityOption[],
): DistributionSegment[] {
  const counts = new Map<string, number>()
  for (const task of tasks) {
    const key = task.card.priorityOptionId ?? '__none'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return priorityOptions.map((option) => {
    const palette = option.color ? OPTION_COLOR_PALETTE[option.color as OptionColorKey] : OPTION_COLOR_PALETTE.gray
    return {color: palette?.text ?? 'var(--color-text-muted)', count: counts.get(option.id) ?? 0, key: option.id, label: option.label}
  })
}

function buildCustomSelectSegments(tasks: ProjectTableTask[], column: TableColumnDefinition): DistributionSegment[] {
  if (!column.fieldDefinition || column.fieldDefinition.fieldType !== 'single_select') return []

  const options = column.fieldDefinition.options
  const counts = new Map<string, number>()
  for (const task of tasks) {
    const cv = task.card.customFieldValues[column.key]
    if (cv?.optionId) {
      counts.set(cv.optionId, (counts.get(cv.optionId) ?? 0) + 1)
    }
  }

  return options
    .map((opt) => ({
      color: '#3B82F6',
      count: counts.get(opt.id) ?? 0,
      key: opt.id,
      label: opt.label,
    }))
    .filter((s) => s.count > 0)
}

// --- Column type classification ---

function isEmptyColumn(column: TableColumnDefinition): boolean {
  if (column.kind === 'builtin') {
    const key = column.key as BuiltinTableFieldKey
    return key === 'assignee' || key === 'due_date' || key === 'group' || key === 'start_date'
  }

  if (column.kind === 'custom' && column.fieldDefinition) {
    const ft = column.fieldDefinition.fieldType
    return ft === 'text' || ft === 'date'
  }

  return true
}

function isDistributionColumn(column: TableColumnDefinition, groupBy: TableGroupBy): boolean {
  if (column.kind === 'builtin') {
    const key = column.key as BuiltinTableFieldKey
    if (key === 'status') return groupBy !== 'status'
    if (key === 'priority') return groupBy !== 'priority'
  }

  if (column.kind === 'custom' && column.fieldDefinition?.fieldType === 'single_select') {
    return true
  }

  return false
}

function isNumericColumn(column: TableColumnDefinition): boolean {
  if (column.kind === 'builtin' && column.key === 'effort') return true
  if (column.kind === 'custom' && column.fieldDefinition?.fieldType === 'number') return true
  return false
}

// --- Component ---

export const defaultCalcConfig: CalculationConfig = {calculation: 'sum', unitPosition: 'left'}

type TableGroupSummaryRowProps = {
  allTasks: ProjectTableTask[]
  calcConfigs: Record<string, CalculationConfig>
  columns: TableColumnDefinition[]
  groupBy: TableGroupBy
  mode: Mode
  onCalcConfigChange: (columnKey: string, config: CalculationConfig) => void
  priorityOptions: ProjectPriorityOption[]
  statusOptions: ProjectStatusOption[]
  tasks: ProjectTableTask[]
}

export function TableGroupSummaryRow({
  allTasks,
  calcConfigs,
  columns,
  groupBy,
  mode,
  onCalcConfigChange,
  priorityOptions,
  statusOptions,
  tasks,
}: TableGroupSummaryRowProps) {
  const [popupColumnKey, setPopupColumnKey] = useState<string | null>(null)
  const popupAnchorRef = useRef<HTMLDivElement | null>(null)

  const getConfig = useCallback((columnKey: string) => calcConfigs[columnKey] ?? defaultCalcConfig, [calcConfigs])

  return (
    <div
      className='grid items-end gap-4 border-b border-border-subtle bg-surface-muted/50 px-4 py-2'
      style={{gridTemplateColumns: 'var(--table-grid-columns)'}}
    >
      {/* Title column — task count (frozen) */}
      <div className='sticky left-0 z-10 flex items-center bg-surface-muted/50'>
        <span className='text-xs font-medium text-text-muted'>
          {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
        </span>
      </div>

      {/* Per-column summaries */}
      {columns.map((column) => {
        // Empty columns (person, date, text)
        if (isEmptyColumn(column)) {
          return <div key={column.key}/>
        }

        // Distribution columns (status, priority, custom select)
        if (isDistributionColumn(column, groupBy)) {
          let segments: DistributionSegment[]
          if (column.kind === 'builtin' && column.key === 'status') {
            segments = buildStatusSegments(tasks, mode, statusOptions)
          } else if (column.kind === 'builtin' && column.key === 'priority') {
            segments = buildPrioritySegments(tasks, mode, priorityOptions)
          } else {
            segments = buildCustomSelectSegments(tasks, column)
          }

          return (
            <div className='flex items-center pb-0.5' key={column.key}>
              <div className='w-full'>
                <DistributionBar segments={segments} total={tasks.length}/>
              </div>
            </div>
          )
        }

        // Numeric columns (effort, custom number)
        if (isNumericColumn(column)) {
          const config = getConfig(column.key)
          const groupValues = column.key === 'effort'
            ? getEffortValues(tasks)
            : getCustomNumberValues(tasks, column.key)
          const allValues = column.key === 'effort'
            ? getEffortValues(allTasks)
            : getCustomNumberValues(allTasks, column.key)

          const groupResult = computeNumeric(groupValues, config.calculation)
          const allResult = computeNumeric(allValues, config.calculation)
          const displayValue = formatNumericValue(groupResult, config)
          const overallValue = formatNumericValue(allResult, config)
          const calcLabel = config.calculation === 'none' ? '' : config.calculation

          return (
            <div
              className='relative flex cursor-pointer flex-col items-center justify-center'
              key={column.key}
              onClick={(e) => {
                e.stopPropagation()
                popupAnchorRef.current = e.currentTarget as HTMLDivElement
                setPopupColumnKey(popupColumnKey === column.key ? null : column.key)
              }}
              ref={popupColumnKey === column.key ? popupAnchorRef : undefined}
            >
              {displayValue ? (
                <>
                  <span className='text-xs font-medium text-text-medium'>{displayValue}</span>
                  {calcLabel ? (
                    <span className='text-[10px] leading-tight text-text-muted'>{calcLabel}</span>
                  ) : null}
                </>
              ) : (
                <span className='text-xs text-text-muted'>—</span>
              )}

              {popupColumnKey === column.key && popupAnchorRef.current ? (
                <NumericCalculationPopup
                  config={config}
                  onClose={() => setPopupColumnKey(null)}
                  onConfigChange={(c) => onCalcConfigChange(column.key, c)}
                  overallValue={overallValue || undefined}
                  position={{
                    x: popupAnchorRef.current.getBoundingClientRect().left,
                    y: popupAnchorRef.current.getBoundingClientRect().top,
                  }}
                />
              ) : null}
            </div>
          )
        }

        // Fallback — empty
        return <div key={column.key}/>
      })}

      {/* Trailing cell for "+" column */}
      <div/>
    </div>
  )
}
