import {useQueryClient} from '@tanstack/react-query'
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from '@dnd-kit/sortable'
import {CSS} from '@dnd-kit/utilities'
import {Check, ChevronRight, Plus} from 'lucide-react'
import {useToast} from '../../../components/ui/toast'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu'
import {useVirtualizer} from '@tanstack/react-virtual'
import {useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction, type SyntheticEvent} from 'react'

import type {Mode} from '../../../app/mode'
import {Badge} from '../../../components/ui/badge'
import type {ProjectTableGroup} from '../../cards/card-view-mappers'
import {formatCardPriorityLabel, formatCardStatusLabel, formatShortDate, getFirstOptionInCategory, getStatusOptionCategory} from '../../cards/card-view-mappers'
import {formatEffortValue, parseEffortInput} from '../../cards/effort'
import {
  runArchiveCardsMutation,
  runDuplicateCardsMutation,
  runRestoreCardsMutation,
  runTrashCardsMutation,
  runUnarchiveCardsMutation,
} from '../../cards/card.queries'
import {useSetCardAssigneeMutation, useUpdateCardMutation} from '../../cards/card.queries'
import type {
  CardRecord,
  CreateCardInput,
  ProjectPriorityOption,
  ProjectStatusOption,
  TableGroupBy,
  TaskBoardMode,
  UpdateCardInput,
} from '../../cards/card.types'
import type {ProjectGroupRecord} from '../../projects/project-group.types'
import type {ProjectMember} from '../../access/access.types'
import type {ProjectSprintRecord} from '../../sprints/sprint.types'
import {isInferredProjectSprint} from '../../sprints/sprint-fallbacks'
import {sprintReassignmentUnavailableMessage} from '../../sprints/sprint-mutation-guard'
import type {CustomFieldDefinition} from '../../fields/field.types'
import {
  buildTableColumnDefinitions,
  defaultTableTitleWidth,
  getDefaultColumnWidth,
  listAvailableTableColumns,
} from '../../projects/table-view-fields'
import {TableColumnHeader} from '../../projects/TableColumnHeader'
import {
  useAddPriorityOptionMutation,
  useAddStatusOptionMutation,
  useDeletePriorityOptionMutation,
  useDeleteStatusOptionMutation,
  useRenamePriorityOptionMutation,
  useRenameStatusOptionMutation,
  useSetPriorityOptionColorMutation,
  useSetProjectBuiltinFieldLabelMutation,
  useSetStatusOptionColorMutation,
} from '../../projects/project-metadata.queries'
import type {ProjectBuiltinFieldLabels, BuiltinTableFieldKey} from '../../projects/builtin-fields'
import type {ProjectTableSort, ProjectTableViewDraft} from '../../projects/project-view.types'
import {
  useAddFieldOptionMutation,
  useArchiveCustomFieldMutation,
  useDeleteFieldOptionMutation,
  useSetFieldOptionColorMutation,
  useRenameCustomFieldMutation,
  useRenameFieldOptionMutation,
} from '../../fields/field.queries'
import {reorderVisibleFieldKey} from '../../projects/table-column-operations'
import {type OptionColorKey, OPTION_COLOR_KEYS, OPTION_COLOR_PALETTE, resolvePriorityOptionStyles, resolveStatusOptionStyles, statusCategoryStyles} from '../theme'
import {DeleteGroupDialog} from './DeleteGroupDialog'
import {TableTaskRow} from './TableTaskRow'
import {SprintGroupHeader, BacklogGroupHeader} from './SprintGroupHeader'
import {PropertySelectMenu} from './PropertySelectMenu'
import {TaskContextMenu} from './TaskContextMenu'
import {type CalculationConfig} from './NumericCalculationPopup'
import {defaultCalcConfig, TableGroupSummaryRow} from './TableGroupSummaryRow'
import {useColumnResize} from './useColumnResize'
import {DateFieldCell} from './DateFieldCell'

type TableViewProps = {
  activeTaskId?: string | null
  builtinFieldLabels?: ProjectBuiltinFieldLabels | null
  columnWidths: Record<string, number>
  customFields: CustomFieldDefinition[]
  expandedGroups: string[]
  groupBy: TableGroupBy
  isConfigurationDisabled?: boolean
  isSprintDataUnavailable?: boolean
  isTaskDetailOpen?: boolean
  mode?: Mode
  onAddGroup?: (label: string) => Promise<string | undefined> | string | undefined
  onCompleteSprint?: (sprintId: string, incompleteCount: number) => void
  onDeleteGroup?: (groupId: string, deleteCards: boolean) => Promise<void>
  onCreateCustomColumn?: (fieldType: 'text' | 'number' | 'date' | 'single_select', name: string) => void
  onEditSprint?: (sprintId: string) => void
  onInlineCreateTask?: (input: CreateCardInput, targetGroupId?: string | null) => Promise<void>
  onMoveCardToGroup?: (cardId: string, targetGroupId: string | null) => Promise<void> | void
  onMoveSelectedCardsToGroup?: (cardIds: string[], targetGroupId: string | null) => Promise<void> | void
  onMoveCardToSprint?: (cardId: string, targetSprintId: string | null) => void
  onMoveTask?: (cardId: string, targetPosition: number, targetGroupId?: string | null) => void
  onOpenTask: (taskId: string) => void
  onRenameGroup?: (groupId: string, label: string) => void
  onRenameSprint?: (sprintId: string, name: string) => void
  onReorderGroup?: (draggedGroupId: string, targetGroupId: string) => void
  onStartSprint?: (sprintId: string) => void
  onCreateSprintClick?: () => void
  onSetCustomFieldValue?: (
    cardId: string,
    fieldDefinitionId: string,
    value: {
      dateValue?: string | null
      numberValue?: number | null
      optionId?: string | null
      textValue?: string | null
    },
  ) => void
  pendingTaskIds?: string[]
  priorityOptions: ProjectPriorityOption[]
  projectGroups: ProjectGroupRecord[]
  projectMembers?: ProjectMember[]
  projectSprints?: ProjectSprintRecord[]
  onToggleGroup: (groupId: string) => void
  onToggleTaskSelection: (taskId: string, shiftKey?: boolean) => void
  projectId: string
  selectedTaskIds: string[]
  setDraft: Dispatch<SetStateAction<ProjectTableViewDraft>>
  sort: ProjectTableSort
  statusOptions: ProjectStatusOption[]
  taskMode?: TaskBoardMode
  tableGroups: ProjectTableGroup[]
  visibleFieldKeys: string[]
}

function groupTitleToDefaults(groupId: string, groupBy: TableGroupBy, group?: ProjectTableGroup): Partial<CreateCardInput> {
  if (group?.createDefaults) {
    return group.createDefaults
  }

  if (groupBy === 'priority') {
    return {
      priorityOptionId: groupId,
    }
  }

  if (groupBy === 'assignee' || groupBy === 'due_date' || groupBy === 'group') {
    return {}
  }

  // 'status' maps to statusOptionId
  return {
    statusOptionId: groupId,
  }
}

function SortableColumnHeaderWrapper({children, fieldKey}: {children: ReactNode; fieldKey: string}) {
  const {attributes, isDragging, listeners, setNodeRef, transform, transition} = useSortable({id: fieldKey})

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  )
}


function stopProp(e: SyntheticEvent) { e.stopPropagation() }

function parseTagsInput(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function tagsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((tag, index) => tag === right[index])
}

function buildCardUpdate(card: CardRecord, patch: Partial<UpdateCardInput>): UpdateCardInput {
  return {
    dueAt: card.dueAt,
    effort: card.effort,
    id: card.id,
    priorityOptionId: card.priorityOptionId,
    startAt: card.startAt,
    statusOptionId: card.statusOptionId,
    tags: card.tags,
    title: card.title,
    // Only include body fields if available (not loaded in list view)
    ...(card.bodyJson !== undefined ? {bodyJson: card.bodyJson} : {}),
    ...(card.bodyMd !== undefined ? {bodyMd: card.bodyMd} : {}),
    ...patch,
  }
}

function FieldEditor({
  calcConfig,
  card,
  fieldKey,
  mode,
  onAddPriorityOption,
  onAddStatusOption,
  onChangePriorityOptionColor,
  onChangeStatusOptionColor,
  onDeletePriorityOption,
  onDeleteStatusOption,
  onRenamePriorityOption,
  onRenameStatusOption,
  onSetAssignee,
  onSetGroup,
  onUpdateCard,
  priorityOptions = [],
  projectGroups,
  projectMembers,
  statusOptions = [],
}: {
  calcConfig?: CalculationConfig
  card: CardRecord
  fieldKey: BuiltinTableFieldKey
  mode: Mode
  onAddPriorityOption?: () => void
  onAddStatusOption?: (label: string, category: string) => void
  onChangePriorityOptionColor?: (optionId: string, color: string | null) => void
  onChangeStatusOptionColor?: (optionId: string, color: string | null) => void
  onDeletePriorityOption?: (optionId: string) => void
  onDeleteStatusOption?: (optionId: string) => void
  onRenamePriorityOption?: (optionId: string, label: string) => void
  onRenameStatusOption?: (optionId: string, label: string) => void
  onSetAssignee: (assigneeUserId: string | null) => void
  onSetGroup?: (groupId: string | null) => void
  onUpdateCard: (input: UpdateCardInput) => void
  priorityOptions?: ProjectPriorityOption[]
  projectGroups: ProjectGroupRecord[]
  projectMembers: ProjectMember[]
  statusOptions?: ProjectStatusOption[]
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  // --- Assignee ---
  if (fieldKey === 'assignee') {
    return (
      <div className='w-full cursor-pointer' onClick={stopProp}>
        <select
          className='h-8 w-full cursor-pointer appearance-none bg-transparent text-center text-sm outline-none'
          onChange={(e) => {
            onSetAssignee(e.target.value || null)
          }}
          value={card.assigneeUserId ?? ''}
        >
          <option value=''>—</option>
          {projectMembers.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>
    )
  }

  if (fieldKey === 'group') {
    return (
      <div className='w-full cursor-pointer' onClick={stopProp}>
        <select
          className='h-8 w-full cursor-pointer appearance-none bg-transparent text-center text-sm outline-none'
          onChange={(event) => {
            onSetGroup?.(event.target.value || null)
          }}
          value={card.groupId ?? ''}
        >
          <option value=''>—</option>
          {projectGroups.map((group) => (
            <option key={group.id} value={group.id}>{group.label}</option>
          ))}
        </select>
      </div>
    )
  }

  // --- Status ---
  if (fieldKey === 'status') {
    const label = formatCardStatusLabel(card.statusOptionId, statusOptions)
    const matchedOption = statusOptions.find(o => o.id === card.statusOptionId)
    const styles = matchedOption ? resolveStatusOptionStyles(mode, matchedOption) : statusCategoryStyles(mode, null)
    return (
      <div onClick={stopProp}>
        <PropertySelectMenu
          /* Status is required — no clear option */
          editMenu={onAddStatusOption && onRenameStatusOption && onDeleteStatusOption ? {
            categories: [
              {key: 'not_started', label: 'Not started', onAdd: () => {
                const labels = new Set(statusOptions.map(o => o.label.toLowerCase()))
                let label = 'New Status'; let c = 2
                while (labels.has(label.toLowerCase())) { label = `New Status ${c}`; c++ }
                onAddStatusOption(label, 'not_started')
              }},
              {key: 'started', label: 'In progress', onAdd: () => {
                const labels = new Set(statusOptions.map(o => o.label.toLowerCase()))
                let label = 'New Status'; let c = 2
                while (labels.has(label.toLowerCase())) { label = `New Status ${c}`; c++ }
                onAddStatusOption(label, 'started')
              }},
              {key: 'completed', label: 'Completed', onAdd: () => {
                const labels = new Set(statusOptions.map(o => o.label.toLowerCase()))
                let label = 'New Status'; let c = 2
                while (labels.has(label.toLowerCase())) { label = `New Status ${c}`; c++ }
                onAddStatusOption(label, 'completed')
              }},
            ],
            colorPalette: OPTION_COLOR_KEYS.map(key => ({key, color: OPTION_COLOR_PALETTE[key].text})),
            onColorChange: onChangeStatusOptionColor,
            onDelete: onDeleteStatusOption,
            onRename: onRenameStatusOption,
            options: statusOptions.map((option) => ({
              canDelete: statusOptions.length > 1 && !(option.category === 'completed' && statusOptions.filter(o => o.category === 'completed').length <= 1),
              category: option.category,
              colorKey: option.color,
              deleteDisabledReason: statusOptions.length <= 1 ? 'Cannot delete the only status' : option.category === 'completed' && statusOptions.filter(o => o.category === 'completed').length <= 1 ? 'At least one completed status is required' : undefined,
              id: option.id,
              isCompleted: option.category === 'completed',
              label: option.label,
              style: resolveStatusOptionStyles(mode, option),
            })),
            title: 'Manage Statuses',
          } : undefined}
          onSelect={(optionId) => {
            onUpdateCard(buildCardUpdate(card, {statusOptionId: optionId}))
          }}
          options={statusOptions.map((option) => ({
            id: option.id,
            label: option.label,
            style: statusCategoryStyles(mode, option.category),
          }))}
          selectedId={card.statusOptionId}
          trigger={(
            <button
              className='inline-flex cursor-pointer rounded-full border px-2.5 py-0.5 text-xs font-medium'
              style={styles}
              type='button'
            >
              {label}
            </button>
          )}
        />
      </div>
    )
  }

  // --- Priority ---
  if (fieldKey === 'priority') {
    const priorityOption = priorityOptions.find((o) => o.id === card.priorityOptionId) ?? null
    const label = formatCardPriorityLabel(card.priorityOptionId, priorityOptions)
    const styles = resolvePriorityOptionStyles(mode, priorityOption)
    return (
      <div onClick={stopProp}>
        <PropertySelectMenu
          clearOption={{id: null, label: '—'}}
          editMenu={{
            colorPalette: OPTION_COLOR_KEYS.map(key => ({key, color: OPTION_COLOR_PALETTE[key].text})),
            onAdd: onAddPriorityOption,
            onColorChange: (optionId, colorKey) => onChangePriorityOptionColor?.(optionId, colorKey),
            onDelete: (optionId) => onDeletePriorityOption?.(optionId),
            onRename: (optionId, nextLabel) => onRenamePriorityOption?.(optionId, nextLabel),
            options: priorityOptions.map((option) => {
              const optionStyles = resolvePriorityOptionStyles(mode, option)
              return {
                colorKey: option.color ?? null,
                id: option.id,
                label: option.label,
                style: optionStyles ?? undefined,
              }
            }),
            title: 'Edit Priority Labels',
          }}
          onSelect={(optionId) =>
            onUpdateCard(buildCardUpdate(card, {priorityOptionId: optionId ?? null}))
          }
          options={priorityOptions.map((option) => ({
            id: option.id,
            label: option.label,
            style: resolvePriorityOptionStyles(mode, option) ?? undefined,
          }))}
          selectedId={card.priorityOptionId}
          trigger={!card.priorityOptionId ? (
            <button className='cursor-pointer text-sm text-text-muted' type='button'>—</button>
          ) : (
            <button
              className='inline-flex cursor-pointer rounded-full border px-2.5 py-0.5 text-xs font-medium'
              style={styles ?? undefined}
              type='button'
            >
              {label}
            </button>
          )}
        />
      </div>
    )
  }

  // --- Due Date / Start Date ---
  if (fieldKey === 'due_date' || fieldKey === 'start_date') {
    const value = fieldKey === 'due_date' ? card.dueAt : card.startAt

    return (
      <DateFieldCell
        fieldKey={fieldKey}
        onChange={(nextValue) => {
          onUpdateCard(buildCardUpdate(card, fieldKey === 'due_date' ? {dueAt: nextValue} : {startAt: nextValue}))
        }}
        value={value}
      />
    )
  }

  // --- Effort ---
  if (fieldKey === 'effort') {
    if (editing) {
      return (
        <div onClick={stopProp}>
          <input
            autoFocus
            className='h-8 w-full bg-transparent text-center text-sm outline-none'
            onBlur={() => {
              const parsed = parseEffortInput(draft)
              if (parsed !== undefined && parsed !== card.effort) {
                onUpdateCard(buildCardUpdate(card, {effort: parsed}))
              }
              setEditing(false)
            }}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') setEditing(false)
            }}
            type='number'
            value={draft}
          />
        </div>
      )
    }
    return (
      <span
        className='w-full cursor-pointer text-center text-sm text-text-strong'
        onClick={(e) => {
          e.stopPropagation()
          setDraft(formatEffortValue(card.effort))
          setEditing(true)
        }}
      >
        {card.effort != null
          ? (() => {
            const raw = formatEffortValue(card.effort)
            if (!raw || !calcConfig?.unit) return raw || '—'
            return calcConfig.unitPosition === 'right' ? `${raw}${calcConfig.unit}` : `${calcConfig.unit}${raw}`
          })()
          : '—'}
      </span>
    )
  }

  if (fieldKey === 'tags') {
    if (editing) {
      return (
        <div className='w-full px-1' onClick={stopProp}>
          <input
            autoFocus
            className='h-8 w-full rounded border border-primary bg-surface-base px-2 text-sm text-text-strong outline-none'
            onBlur={() => {
              const nextTags = parseTagsInput(draft)
              if (!tagsEqual(nextTags, card.tags)) {
                onUpdateCard(buildCardUpdate(card, {tags: nextTags}))
              }
              setEditing(false)
            }}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') {
                setDraft(card.tags.join(', '))
                setEditing(false)
              }
            }}
            placeholder='Strategy, QA, Docs'
            value={draft}
          />
        </div>
      )
    }

    return (
      <button
        className='max-w-full cursor-text truncate px-1 text-sm text-text-strong'
        onClick={(event) => {
          event.stopPropagation()
          setDraft(card.tags.join(', '))
          setEditing(true)
        }}
        type='button'
      >
        {card.tags.length > 0 ? card.tags.join(', ') : <span className='text-text-muted'>—</span>}
      </button>
    )
  }

  return <span className='text-xs text-text-muted'>—</span>
}

function CustomFieldCell({
  card,
  field,
  onAddOption,
  onColorChange,
  onDeleteOption,
  onRenameOption,
  onSetValue,
}: {
  card: CardRecord
  field: CustomFieldDefinition
  onAddOption?: (fieldDefinitionId: string) => void
  onColorChange?: (optionId: string, colorKey: string | null) => void
  onDeleteOption?: (optionId: string) => void
  onRenameOption?: (optionId: string, label: string) => void
  onSetValue?: (
    cardId: string,
    fieldDefinitionId: string,
    value: {
      dateValue?: string | null
      numberValue?: number | null
      optionId?: string | null
      textValue?: string | null
    },
  ) => void
}) {
  const value = card.customFieldValues[field.key]
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  if (field.fieldType === 'single_select') {
    const option = value ? field.options.find((o) => o.id === value.optionId) : null
    return (
      <div onClick={stopProp}>
        <PropertySelectMenu
          clearOption={{id: null, label: '—'}}
          editMenu={{
            colorPalette: OPTION_COLOR_KEYS.map(key => ({key, color: OPTION_COLOR_PALETTE[key].text})),
            onAdd: () => onAddOption?.(field.id),
            onColorChange: onColorChange,
            onDelete: onDeleteOption,
            onRename: (optionId, label) => onRenameOption?.(optionId, label),
            options: field.options.map((fieldOption) => ({
              canDelete: field.options.length > 1,
              colorKey: fieldOption.color,
              deleteDisabledReason: field.options.length <= 1 ? 'Cannot delete the last label' : undefined,
              id: fieldOption.id,
              label: fieldOption.label,
              style: fieldOption.color && OPTION_COLOR_PALETTE[fieldOption.color as OptionColorKey]
                ? {backgroundColor: OPTION_COLOR_PALETTE[fieldOption.color as OptionColorKey].bg, borderColor: OPTION_COLOR_PALETTE[fieldOption.color as OptionColorKey].border, color: OPTION_COLOR_PALETTE[fieldOption.color as OptionColorKey].text}
                : undefined,
            })),
            title: `Edit ${field.name} Labels`,
          }}
          onSelect={(optionId) => onSetValue?.(card.id, field.id, {optionId})}
          options={field.options.map((fieldOption) => ({
            id: fieldOption.id,
            label: fieldOption.label,
          }))}
          selectedId={option?.id ?? null}
          selectorWidth={220}
          trigger={(
            <button className='text-sm text-text-strong' type='button'>
              {option?.label ?? <span className='text-text-muted'>—</span>}
            </button>
          )}
        />
      </div>
    )
  }

  if (field.fieldType === 'date') {
    return <span className='text-sm text-text-strong'>{value?.dateValue ? formatShortDate(value.dateValue) : '—'}</span>
  }

  // Inline-editable text and number fields
  if (field.fieldType === 'text' || field.fieldType === 'number') {
    const displayValue = field.fieldType === 'number'
      ? (value?.numberValue != null ? String(value.numberValue) : '')
      : (value?.textValue ?? '')

    if (editing) {
      return (
        <input
          autoFocus
          className='w-full rounded border border-primary bg-surface-base px-1.5 py-0.5 text-sm text-text-strong outline-none'
          onBlur={() => {
            setEditing(false)
            if (onSetValue && draft !== displayValue) {
              if (field.fieldType === 'number') {
                const num = draft.trim() === '' ? null : Number(draft)
                onSetValue(card.id, field.id, {numberValue: num != null && !Number.isNaN(num) ? num : null})
              } else {
                onSetValue(card.id, field.id, {textValue: draft.trim() || null})
              }
            }
          }}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') { setDraft(displayValue); setEditing(false) }
          }}
          type={field.fieldType === 'number' ? 'number' : 'text'}
          value={draft}
        />
      )
    }

    return (
      <span
        className='cursor-text text-sm text-text-strong'
        onClick={() => {
          setDraft(displayValue)
          setEditing(true)
        }}
      >
        {displayValue || <span className='text-xs text-text-muted'>—</span>}
      </span>
    )
  }

  return <span className='text-sm text-text-strong'>{value?.textValue || '—'}</span>
}

type VirtualGroupHeader = {type: 'group-header'; group: ProjectTableGroup}
type VirtualTaskRow = {type: 'task-row'; task: ProjectTableGroup['tasks'][number]; group: ProjectTableGroup}
type VirtualInlineCreate = {type: 'inline-create'; group: ProjectTableGroup}
type VirtualGroupSummary = {type: 'group-summary'; group: ProjectTableGroup}
type VirtualFlatItem = VirtualGroupHeader | VirtualTaskRow | VirtualInlineCreate | VirtualGroupSummary
type InlineCreateSubmissionGuard = {canRetry: boolean; submissionId: number; title: string}

function getVirtualFlatItemKey(item: VirtualFlatItem) {
  switch (item.type) {
    case 'group-header':
      return `group-header:${item.group.id}`
    case 'task-row':
      return `task-row:${item.task.id}`
    case 'inline-create':
      return `inline-create:${item.group.id}`
    case 'group-summary':
      return `group-summary:${item.group.id}`
  }
}

export function TableView({
  activeTaskId = null,
  builtinFieldLabels,
  columnWidths,
  customFields,
  expandedGroups,
  groupBy,
  isConfigurationDisabled = false,
  isSprintDataUnavailable = false,
  isTaskDetailOpen = false,
  mode = 'light',
  onAddGroup,
  onCompleteSprint,
  onCreateCustomColumn,
  onDeleteGroup,
  onEditSprint,
  onInlineCreateTask,
  onMoveCardToGroup,
  onMoveSelectedCardsToGroup,
  onMoveCardToSprint,
  onMoveTask,
  onOpenTask,
  onRenameGroup,
  onRenameSprint,
  onReorderGroup,
  onSetCustomFieldValue,
  onStartSprint,
  onCreateSprintClick,
  pendingTaskIds = [],
  onToggleGroup,
  onToggleTaskSelection,
  priorityOptions,
  projectId,
  projectGroups,
  projectMembers = [],
  projectSprints = [],
  selectedTaskIds,
  setDraft,
  sort,
  statusOptions,
  taskMode = 'standard',
  tableGroups,
  visibleFieldKeys,
}: TableViewProps) {
  const queryClient = useQueryClient()
  const {toast} = useToast()
  const [addTaskDrafts, setAddTaskDrafts] = useState<Record<string, string>>({})
  const [calcConfigs, setCalcConfigs] = useState<Record<string, CalculationConfig>>({})
  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null)
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null)
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{cardId: string; position: {x: number; y: number}} | null>(null)
  const [deleteGroupDialog, setDeleteGroupDialog] = useState<{groupId: string; groupTitle: string; taskCount: number} | null>(null)
  const [groupContextMenu, setGroupContextMenu] = useState<{groupId: string; groupTitle: string; position: {x: number; y: number}; taskCount: number} | null>(null)
  const [addGroupDraft, setAddGroupDraft] = useState<string | null>(null)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const addGroupInputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const addTaskInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const addGroupSubmissionInFlightRef = useRef(false)
  const inlineCreateSubmissionGuardsRef = useRef<Record<string, InlineCreateSubmissionGuard | undefined>>({})
  const nextInlineCreateSubmissionIdRef = useRef(0)
  const gridContainerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const updateCardMutation = useUpdateCardMutation()
  const setCardAssigneeMutation = useSetCardAssigneeMutation()
  const pendingTaskIdSet = new Set(pendingTaskIds)
  const addFieldOptionMutation = useAddFieldOptionMutation(projectId)
  const archiveCustomFieldMutation = useArchiveCustomFieldMutation(projectId)
  const deleteFieldOptionMutation = useDeleteFieldOptionMutation(projectId)
  const setFieldOptionColorMutation = useSetFieldOptionColorMutation(projectId)
  const renameCustomFieldMutation = useRenameCustomFieldMutation(projectId)
  const renameFieldOptionMutation = useRenameFieldOptionMutation(projectId)
  const setProjectBuiltinFieldLabelMutation = useSetProjectBuiltinFieldLabelMutation(projectId)
  const addStatusOptionMutation = useAddStatusOptionMutation(projectId)
  const renameStatusOptionMutation = useRenameStatusOptionMutation(projectId)
  const deleteStatusOptionMutation = useDeleteStatusOptionMutation(projectId)
  const addPriorityOptionMutation = useAddPriorityOptionMutation(projectId)
  const renamePriorityOptionMutation = useRenamePriorityOptionMutation(projectId)
  const deletePriorityOptionMutation = useDeletePriorityOptionMutation(projectId)
  const setPriorityOptionColorMutation = useSetPriorityOptionColorMutation(projectId)
  const setStatusOptionColorMutation = useSetStatusOptionColorMutation(projectId)
  const effectiveVisibleFieldKeys = groupBy === 'group'
    ? visibleFieldKeys.filter((key) => key !== 'group')
    : visibleFieldKeys
  const availableColumns = listAvailableTableColumns(customFields, builtinFieldLabels)
  const columns = buildTableColumnDefinitions(customFields, effectiveVisibleFieldKeys, builtinFieldLabels)
  const leafGroups = useMemo(
    () => tableGroups.filter((group) => taskMode !== 'sprint' || group.parentGroupId != null || group.kind === 'flat'),
    [tableGroups, taskMode],
  )
  const allTasks = leafGroups.flatMap((g) => g.tasks)
  const columnKeys = ['title', ...effectiveVisibleFieldKeys]
  const titleWidth = columnWidths.title ?? defaultTableTitleWidth
  const gridTemplateColumns = [
    `${titleWidth}px`,
    ...columns.map((column) => `${columnWidths[column.key] ?? getDefaultColumnWidth(column.key, customFields)}px`),
    'minmax(48px, 1fr)',
  ].join(' ')
  const {startResize} = useColumnResize({
    columnKeys,
    columnWidths,
    containerRef: gridContainerRef,
    customFields,
    setDraft,
  })
  const columnDndSensors = useSensors(
    useSensor(PointerSensor, {activationConstraint: {distance: 8}}),
  )
  const handleColumnDragEnd = useCallback((event: DragEndEvent) => {
    const {active, over} = event
    if (!over || active.id === over.id) return

    const activeKey = String(active.id)
    const overKey = String(over.id)
    const overIndex = visibleFieldKeys.indexOf(overKey)
    if (overIndex === -1) return

    setDraft((current) => ({
      ...current,
      visibleFieldKeys: reorderVisibleFieldKey(current.visibleFieldKeys, activeKey, overIndex),
    }))
  }, [visibleFieldKeys, setDraft])
  const fieldErrorMessage =
    [
      updateCardMutation.error,
      addFieldOptionMutation.error,
      deleteFieldOptionMutation.error,
      renameCustomFieldMutation.error,
      archiveCustomFieldMutation.error,
      renameFieldOptionMutation.error,
      setProjectBuiltinFieldLabelMutation.error,
    ].find((error): error is Error => error instanceof Error)?.message ?? null
  const headerMutationPending =
    renameCustomFieldMutation.isPending
    || archiveCustomFieldMutation.isPending
    || setProjectBuiltinFieldLabelMutation.isPending
  const canAppendTaskToGroup = useCallback((group: ProjectTableGroup) => {
    if (!draggedTaskId || !onMoveTask || taskMode !== 'standard' || groupBy !== 'group') {
      return false
    }

    return group.kind === 'flat' || group.kind === 'group'
  }, [draggedTaskId, groupBy, onMoveTask, taskMode])
  const canDropTaskIntoEmptyGroupHeader = useCallback((group: ProjectTableGroup) => {
    return canAppendTaskToGroup(group) && group.tasks.length === 0
  }, [canAppendTaskToGroup])
  const moveDraggedTaskToGroupEnd = useCallback((group: ProjectTableGroup) => {
    if (!draggedTaskId || !onMoveTask) {
      return
    }

    onMoveTask(draggedTaskId, group.tasks.length, group.moveTarget?.groupId ?? null)
    setDraggedTaskId(null)
    setDragOverGroupId(null)
    setDragOverTaskId(null)
  }, [draggedTaskId, onMoveTask])

  const flatList = useMemo<VirtualFlatItem[]>(() => {
    const items: VirtualFlatItem[] = []
    const groupById = new Map(tableGroups.map((group) => [group.id, group]))
    for (let index = 0; index < tableGroups.length; index++) {
      const group = tableGroups[index]
      const isFlat = group.kind === 'flat'
      const isRootSprintGroup = taskMode === 'sprint' && (group.kind === 'sprint' || group.kind === 'backlog')
      const parentExpanded = !group.parentGroupId || expandedGroups.includes(group.parentGroupId)
      if (!parentExpanded) {
        continue
      }
      const expanded = expandedGroups.includes(group.id)

      // Group header (skip for flat/ungrouped mode)
      if (!isFlat || isRootSprintGroup) {
        items.push({type: 'group-header', group})
      }

      // Task rows + inline create + summary only when expanded (or flat)
      if (expanded || isFlat) {
        if (!isRootSprintGroup) {
          const parentGroup = group.parentGroupId ? groupById.get(group.parentGroupId) : null
          const belongsToSprintParent =
            taskMode === 'sprint'
            && (parentGroup?.kind === 'sprint' || parentGroup?.kind === 'backlog')

          for (const task of group.tasks) {
            items.push({type: 'task-row', task, group})
          }
          if (onInlineCreateTask && !isInferredProjectSprint(group.sprint)) {
            items.push({type: 'inline-create', group})
          }

          // Summary row only for named groups with tasks
          if (group.tasks.length > 0 && !isFlat && !belongsToSprintParent) {
            items.push({type: 'group-summary', group})
          }
        }
      }

      if (taskMode === 'sprint' && group.parentGroupId) {
        const parentGroup = groupById.get(group.parentGroupId)
        const nextSibling = tableGroups[index + 1]
        const isLastChildInSprint = !nextSibling || nextSibling.parentGroupId !== group.parentGroupId

        if (
          (parentGroup?.kind === 'sprint' || parentGroup?.kind === 'backlog')
          && parentGroup.tasks.length > 0
          && isLastChildInSprint
        ) {
          items.push({type: 'group-summary', group: parentGroup})
        }
      }
    }
    return items
  }, [expandedGroups, onInlineCreateTask, tableGroups, taskMode])

  const focusInlineCreateInput = useCallback((groupId: string) => {
    requestAnimationFrame(() => {
      const input = addTaskInputRefs.current[groupId]
      if (!input) {
        return
      }

      input.focus()
      const cursor = input.value.length
      input.setSelectionRange(cursor, cursor)
    })
  }, [])

  const focusAddGroupInput = useCallback(() => {
    requestAnimationFrame(() => {
      const input = addGroupInputRef.current
      if (!input) {
        return
      }

      input.focus()
      const cursor = input.value.length
      input.setSelectionRange(cursor, cursor)
    })
  }, [])

  const submitAddGroup = useCallback(async () => {
    if (!onAddGroup || addGroupDraft === null || addGroupSubmissionInFlightRef.current) {
      return
    }

    const rawLabel = addGroupDraft
    const label = rawLabel.trim()

    if (!label) {
      setAddGroupDraft(null)
      return
    }

    addGroupSubmissionInFlightRef.current = true
    setAddGroupDraft(null)

    try {
      await onAddGroup(label)
    } catch (error) {
      setAddGroupDraft(rawLabel)
      toast({
        description: error instanceof Error ? error.message : undefined,
        title: 'Could not create group',
        variant: 'error',
      })
      focusAddGroupInput()
    } finally {
      addGroupSubmissionInFlightRef.current = false
    }
  }, [addGroupDraft, focusAddGroupInput, onAddGroup, toast])

  const submitInlineTask = useCallback(async (group: ProjectTableGroup) => {
    if (!onInlineCreateTask) {
      return
    }

    if (isInferredProjectSprint(group.sprint)) {
      toast({title: sprintReassignmentUnavailableMessage, variant: 'error'})
      return
    }

    const rawTitle = addTaskDrafts[group.id] ?? ''
    const title = rawTitle.trim()
    const activeGuard = inlineCreateSubmissionGuardsRef.current[group.id]

    if (!title || (activeGuard && activeGuard.title === rawTitle && !activeGuard.canRetry)) {
      return
    }

    nextInlineCreateSubmissionIdRef.current += 1
    const submissionId = nextInlineCreateSubmissionIdRef.current
    inlineCreateSubmissionGuardsRef.current[group.id] = {
      canRetry: false,
      submissionId,
      title: rawTitle,
    }
    setAddTaskDrafts((current) => ({...current, [group.id]: ''}))

    // submitInlineTask:
    // draft empty -> return
    // same draft already submitted -> return
    // submit + clear draft
    // failure -> restore draft + toast + refocus
    try {
      const fallbackGroupId = groupBy === 'group' && group.kind === 'group'
        ? group.id
        : null
      await onInlineCreateTask(
        {projectId, title, ...groupTitleToDefaults(group.id, groupBy, group)},
        group.moveTarget?.groupId ?? fallbackGroupId,
      )
      if (inlineCreateSubmissionGuardsRef.current[group.id]?.submissionId === submissionId) {
        focusInlineCreateInput(group.id)
      }
    } catch (error) {
      if (inlineCreateSubmissionGuardsRef.current[group.id]?.submissionId === submissionId) {
        inlineCreateSubmissionGuardsRef.current[group.id] = {
          canRetry: true,
          submissionId,
          title: rawTitle,
        }
        setAddTaskDrafts((current) => {
          const currentValue = current[group.id] ?? ''
          if (currentValue.length > 0) {
            return current
          }
          return {...current, [group.id]: rawTitle}
        })
        focusInlineCreateInput(group.id)
      }
      toast({
        description: error instanceof Error ? error.message : undefined,
        title: 'Could not create task',
        variant: 'error',
      })
    }
  }, [addTaskDrafts, focusInlineCreateInput, groupBy, onInlineCreateTask, projectId, toast])

  const virtualizer = useVirtualizer({
    count: flatList.length,
    estimateSize: (index) => {
      const item = flatList[index]
      if (item.type === 'group-header') return 48
      if (item.type === 'group-summary') return 40
      return 40
    },
    getItemKey: (index) => getVirtualFlatItemKey(flatList[index]!),
    getScrollElement: () => scrollRef.current,
    overscan: 10,
  })

  useEffect(() => {
    if (!activeTaskId) {
      return
    }

    // Find the index of the active task in the flat list
    const index = flatList.findIndex(
      (item) => item.type === 'task-row' && item.task.id === activeTaskId,
    )
    if (index >= 0) {
      virtualizer.scrollToIndex(index, {align: 'auto'})
    }
  }, [activeTaskId, flatList, virtualizer])

  const startEditing = (card: CardRecord) => {
    setEditingTaskId(card.id)
    setEditingTitle(card.title)
    requestAnimationFrame(() => editInputRef.current?.focus())
  }

  const saveTitle = () => {
    if (!editingTaskId) return

    const trimmed = editingTitle.trim()
    const currentTask = tableGroups
      .flatMap((g) => g.tasks)
      .find((t) => t.card.id === editingTaskId)

    if (trimmed && currentTask && trimmed !== currentTask.card.title) {
      updateCardMutation.mutate({
        dueAt: currentTask.card.dueAt,
        effort: currentTask.card.effort,
        id: currentTask.card.id,
        priorityOptionId: currentTask.card.priorityOptionId,
        startAt: currentTask.card.startAt,
        statusOptionId: currentTask.card.statusOptionId,
        tags: currentTask.card.tags,
        ...(currentTask.card.bodyJson !== undefined ? {bodyJson: currentTask.card.bodyJson} : {}),
        ...(currentTask.card.bodyMd !== undefined ? {bodyMd: currentTask.card.bodyMd} : {}),
        title: trimmed,
      })
    }

    setEditingTaskId(null)
    setEditingTitle('')
  }

  const cancelEdit = () => {
    setEditingTaskId(null)
    setEditingTitle('')
  }

  const toggleComplete = (card: CardRecord) => {
    const isCompleted = getStatusOptionCategory(card.statusOptionId, statusOptions) === 'completed'
    const targetOption = isCompleted
      ? getFirstOptionInCategory('started', statusOptions)
      : getFirstOptionInCategory('completed', statusOptions)
    updateCardMutation.mutate(buildCardUpdate(card, {statusOptionId: targetOption?.id ?? null}))
  }

  const makeToggleSort = useCallback((targetFieldKey: string) => () => {
    setDraft((current) => {
      const existingIndex = current.sort.findIndex((s) => s.fieldKey === targetFieldKey)
      if (existingIndex >= 0) {
        // Toggle direction of existing sort
        const next = [...current.sort]
        next[existingIndex] = {
          ...next[existingIndex],
          direction: next[existingIndex].direction === 'asc' ? 'desc' : 'asc',
        }
        return {...current, sort: next}
      }
      // Add new sort at the end (lowest priority)
      return {...current, sort: [...current.sort, {fieldKey: targetFieldKey, direction: 'asc'}]}
    })
  }, [setDraft])

  const makeClearSort = useCallback((targetFieldKey: string) => () => {
    setDraft((current) => ({
      ...current,
      sort: current.sort.filter((s) => s.fieldKey !== targetFieldKey),
    }))
  }, [setDraft])

  const handleSaveSort = useCallback(() => {
    // No-op — save is handled by auto-save
  }, [])

  const handleRowDragEnd = useCallback(() => {
    setDraggedTaskId(null)
    setDragOverGroupId(null)
    setDragOverTaskId(null)
  }, [])

  const handleRowContextMenu = useCallback((taskId: string, position: {x: number; y: number}) => {
    setContextMenu({cardId: taskId, position})
  }, [])

  const handleToggleComplete = useCallback((taskId: string) => {
    const task = tableGroups.flatMap((g) => g.tasks).find((t) => t.id === taskId)
    if (task) toggleComplete(task.card)
  }, [tableGroups, statusOptions]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStartEditing = useCallback((taskId: string) => {
    const task = tableGroups.flatMap((g) => g.tasks).find((t) => t.id === taskId)
    if (task) startEditing(task.card)
  }, [tableGroups]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className='flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-elevated shadow-panel'
      ref={gridContainerRef}
      style={{'--table-grid-columns': gridTemplateColumns} as React.CSSProperties}
    >
      {fieldErrorMessage ? (
        <div className='border-b border-error/20 bg-error/10 px-4 py-3 text-sm text-error'>
          Table changes could not be saved. {fieldErrorMessage}
        </div>
      ) : null}

      {/* Single scroll area — header sticks at top, groups scroll below */}
      <div ref={scrollRef} className='min-h-0 flex-1 overflow-auto'>
        <div className='min-w-max'>
          {/* Column header row — sticky within the scroll container */}
          <div
            className='sticky top-0 z-30 grid gap-4 border-b border-border-subtle bg-surface-muted px-4 pt-3 pb-[3px] font-mono text-xs font-medium uppercase tracking-wider text-text-muted'
            style={{gridTemplateColumns: 'var(--table-grid-columns)'}}
          >
            <div className='sticky left-0 z-20 bg-surface-muted'>
              <TableColumnHeader
                availableColumns={availableColumns}
                builtinFieldLabels={builtinFieldLabels}
                column={null}
                isConfigurationDisabled={isConfigurationDisabled}
                isMutationPending={headerMutationPending}
                onClearSort={makeClearSort('title')}
                onRenameBuiltinField={(fieldKey, label) =>
                  setProjectBuiltinFieldLabelMutation.mutate({fieldKey, label})}
                onResizeStart={startResize}
                onSaveSort={handleSaveSort}
                onToggleSort={makeToggleSort('title')}
                setDraft={setDraft}
                sort={sort}
                visibleFieldKeys={visibleFieldKeys}
              />
            </div>
            <DndContext
              collisionDetection={closestCenter}
              onDragEnd={handleColumnDragEnd}
              sensors={columnDndSensors}
            >
              <SortableContext items={visibleFieldKeys} strategy={horizontalListSortingStrategy}>
                {columns.map((column) => (
                  <SortableColumnHeaderWrapper fieldKey={column.key} key={column.key}>
                    <TableColumnHeader
                      availableColumns={availableColumns}
                      builtinFieldLabels={builtinFieldLabels}
                      column={column}
                      isConfigurationDisabled={isConfigurationDisabled}
                      isMutationPending={headerMutationPending}
                      onArchiveCustomField={(fieldDefinitionId) => {
                        archiveCustomFieldMutation.mutate(
                          {fieldDefinitionId},
                          {
                            onSuccess: () => {
                              setDraft((current) => ({
                                ...current,
                                visibleFieldKeys: current.visibleFieldKeys.filter((entry) => entry !== column.key),
                              }))
                            },
                          },
                        )
                      }}
                      onClearSort={makeClearSort(column.key)}
                      onRenameBuiltinField={(fieldKey, label) =>
                        setProjectBuiltinFieldLabelMutation.mutate({fieldKey, label})}
                      onRenameCustomField={(fieldDefinitionId, name) =>
                        renameCustomFieldMutation.mutate({fieldDefinitionId, name})}
                      onResizeStart={startResize}
                      onSaveSort={handleSaveSort}
                      onToggleSort={makeToggleSort(column.key)}
                      setDraft={setDraft}
                      sort={sort}
                      visibleFieldKeys={visibleFieldKeys}
                    />
                  </SortableColumnHeaderWrapper>
                ))}
              </SortableContext>
            </DndContext>

            {/* Add column "+" button — always last column, sticky right */}
            <div className='sticky right-0 z-20 flex items-start justify-center bg-surface-muted'>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className='flex items-center justify-center rounded p-1 text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong'
                    title='Add column'
                    type='button'
                  >
                    <Plus className='h-4 w-4'/>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='start' className='w-72'>
                  <DropdownMenuLabel>Built-in</DropdownMenuLabel>
                  {availableColumns.filter((c) => c.kind === 'builtin').map((col) => {
                    const isVisible = visibleFieldKeys.includes(col.key)
                    return (
                      <DropdownMenuItem
                        key={col.key}
                        onSelect={(e) => {
                          e.preventDefault()
                          setDraft((current) => {
                            const keys = isVisible
                              ? current.visibleFieldKeys.filter((k) => k !== col.key)
                              : [...current.visibleFieldKeys, col.key]
                            return {...current, visibleFieldKeys: keys}
                          })
                        }}
                      >
                        {isVisible ? <Check className='h-4 w-4'/> : <Plus className='h-4 w-4'/>}
                        <span>{col.label}</span>
                      </DropdownMenuItem>
                    )
                  })}
                  {/* Existing custom fields — toggle visibility */}
                  {availableColumns.some((c) => c.kind === 'custom') ? (
                    <>
                      <DropdownMenuSeparator/>
                      <DropdownMenuLabel>Custom columns</DropdownMenuLabel>
                      {availableColumns.filter((c) => c.kind === 'custom').map((col) => {
                        const isVisible = visibleFieldKeys.includes(col.key)
                        return (
                          <DropdownMenuItem
                            key={col.key}
                            onSelect={(e) => {
                              e.preventDefault()
                              setDraft((current) => {
                                const keys = isVisible
                                  ? current.visibleFieldKeys.filter((k) => k !== col.key)
                                  : [...current.visibleFieldKeys, col.key]
                                return {...current, visibleFieldKeys: keys}
                              })
                            }}
                          >
                            {isVisible ? <Check className='h-4 w-4'/> : <Plus className='h-4 w-4'/>}
                            <span>{col.label}</span>
                          </DropdownMenuItem>
                        )
                      })}
                    </>
                  ) : null}

                  {/* Add new custom column types */}
                  {onCreateCustomColumn ? (
                    <>
                      <DropdownMenuSeparator/>
                      <DropdownMenuLabel>Add custom column</DropdownMenuLabel>
                      {([
                        {label: 'Text', type: 'text' as const},
                        {label: 'Number', type: 'number' as const},
                        {label: 'Date', type: 'date' as const},
                        {label: 'Dropdown', type: 'single_select' as const},
                      ]).map((ct) => (
                        <DropdownMenuItem
                          key={ct.type}
                          onSelect={() => onCreateCustomColumn(ct.type, ct.label)}
                        >
                          <Plus className='h-4 w-4'/>
                          <span>{ct.label}</span>
                        </DropdownMenuItem>
                      ))}
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Sprint empty state */}
          {taskMode === 'sprint' && projectSprints.length === 0 && !isSprintDataUnavailable ? (
            <div className='flex flex-col items-center justify-center py-12'>
              <h3 className='font-display text-lg font-semibold text-text-strong'>No sprints yet</h3>
              <p className='mt-2 max-w-xs text-center text-sm text-text-medium'>
                Sprints help you scope work into time-boxed iterations. Create your first sprint to get started.
              </p>
              {onCreateSprintClick ? (
                <button
                  className='mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110'
                  onClick={onCreateSprintClick}
                  type='button'
                >
                  Create Sprint
                </button>
              ) : null}
            </div>
          ) : null}

          {/* Virtualized groups + task rows */}
          <div style={{height: `${virtualizer.getTotalSize()}px`, position: 'relative'}}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const item = flatList[virtualItem.index]

              return (
                <div
                  key={virtualItem.key}
                  style={{
                    height: `${virtualItem.size}px`,
                    left: 0,
                    position: 'absolute',
                    top: 0,
                    transform: `translateY(${virtualItem.start}px)`,
                    width: '100%',
                  }}
                >
                  {item.type === 'group-header' ? (() => {
                    const group = item.group
                    const expanded = expandedGroups.includes(group.id)
                    const isRootSprintGroup = taskMode === 'sprint' && (group.kind === 'sprint' || group.kind === 'backlog')
                    const canDragGroupHeader = !group.parentGroupId && taskMode === 'standard'
                    const canDropTaskIntoThisGroupHeader = canDropTaskIntoEmptyGroupHeader(group)

                    if (taskMode === 'sprint' && group.kind === 'sprint' && group.sprint) {
                      return (
                        <SprintGroupHeader
                          expanded={expanded}
                          isConfigurationDisabled={isConfigurationDisabled || isInferredProjectSprint(group.sprint)}
                          mode={mode}
                          onCompleteSprint={() => {
                            const incompleteTasks = group.tasks.filter(
                              (t) => {
                                const opt = statusOptions.find((o) => o.id === t.card.statusOptionId)
                                return !opt || opt.category !== 'completed'
                              },
                            )
                            onCompleteSprint?.(
                              group.sprint!.id,
                              incompleteTasks.length,
                            )
                          }}
                          onEditSprint={() => onEditSprint?.(group.sprint!.id)}
                          onRenameSprint={(name) => onRenameSprint?.(group.sprint!.id, name)}
                          onStartSprint={() => onStartSprint?.(group.sprint!.id)}
                          onToggle={() => onToggleGroup(group.id)}
                          sprint={group.sprint}
                          statusOptions={statusOptions}
                          taskCount={group.tasks.length}
                          tasks={group.tasks}
                        />
                      )
                    }

                    if (taskMode === 'sprint' && group.kind === 'backlog') {
                      return (
                        <BacklogGroupHeader
                          expanded={expanded}
                          onToggle={() => onToggleGroup(group.id)}
                          taskCount={group.tasks.length}
                        />
                      )
                    }

                    return (
                      <div
                        className={`group/grouprow border-b border-border-subtle bg-surface-base transition-colors hover:bg-canvas-accent ${
                          draggedGroupId === group.id ? 'opacity-40' : ''
                        } ${dragOverGroupId === group.id ? 'border-t-2 border-t-primary' : ''}`}
                        draggable={canDragGroupHeader}
                        onContextMenu={(e) => {
                          if (group.parentGroupId) return
                          e.preventDefault()
                          e.stopPropagation()
                          setGroupContextMenu({groupId: group.id, groupTitle: group.title, position: {x: e.clientX, y: e.clientY}, taskCount: group.tasks.length})
                        }}
                        onDragEnd={() => { setDraggedGroupId(null); setDragOverGroupId(null) }}
                        onDragLeave={() => { if (dragOverGroupId === group.id) setDragOverGroupId(null) }}
                        onDragOver={(e) => {
                          const acceptsTaskDrop = draggedTaskId && (isRootSprintGroup || canDropTaskIntoThisGroupHeader)
                          if (!draggedGroupId && !acceptsTaskDrop) return
                          e.preventDefault()
                          if (draggedGroupId && draggedGroupId !== group.id) setDragOverGroupId(group.id)
                          if (acceptsTaskDrop) setDragOverGroupId(group.id)
                        }}
                        onDragStart={(e) => {
                          if (!canDragGroupHeader) return
                          setDraggedGroupId(group.id)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          if (draggedTaskId && isRootSprintGroup && onMoveCardToSprint) {
                            const targetSprintId = group.moveTarget?.sprintId ?? null
                            onMoveCardToSprint(draggedTaskId, targetSprintId)
                            setDraggedTaskId(null)
                            setDragOverGroupId(null)
                            setDragOverTaskId(null)
                            return
                          }
                          if (draggedTaskId && canDropTaskIntoThisGroupHeader) {
                            moveDraggedTaskToGroupEnd(group)
                            return
                          }
                          if (draggedGroupId && draggedGroupId !== group.id) {
                            onReorderGroup?.(draggedGroupId, group.id)
                          }
                          setDraggedGroupId(null)
                          setDragOverGroupId(null)
                        }}
                      >
                       <div className='sticky left-0 z-10 flex w-fit items-center gap-1 bg-surface-base px-2 py-3 group-hover/grouprow:bg-canvas-accent'>
                        <div className={`flex h-6 w-6 shrink-0 items-center justify-center text-text-muted opacity-0 transition-opacity group-hover/grouprow:opacity-100 ${canDragGroupHeader ? 'cursor-grab' : 'pointer-events-none opacity-0'}`}>
                          <svg className='h-4 w-4' fill='currentColor' viewBox='0 0 16 16'>
                            <circle cx='5' cy='3' r='1.5'/><circle cx='11' cy='3' r='1.5'/>
                            <circle cx='5' cy='8' r='1.5'/><circle cx='11' cy='8' r='1.5'/>
                            <circle cx='5' cy='13' r='1.5'/><circle cx='11' cy='13' r='1.5'/>
                          </svg>
                        </div>
                        <button
                          className='flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong'
                          onClick={(e) => {
                            e.stopPropagation()
                            onToggleGroup(group.id)
                          }}
                          type='button'
                        >
                          <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                        </button>
                        <div className='group/name flex items-center gap-2'>
                          {editingGroupId === group.id && !group.parentGroupId ? (
                            <input
                              autoFocus
                              className='h-7 bg-transparent font-display text-base font-semibold text-text-strong outline-none'
                              defaultValue={group.title}
                              onBlur={(e) => {
                                setEditingGroupId(null)
                                const newName = e.target.value.trim()
                                if (newName && newName !== group.title) {
                                  onRenameGroup?.(group.id, newName)
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  ;(e.target as HTMLInputElement).blur()
                                }
                                if (e.key === 'Escape') {
                                  setEditingGroupId(null)
                                }
                              }}
                            />
                          ) : (
                            <span
                              className={`${group.parentGroupId ? 'pl-6 text-sm font-medium' : 'cursor-text font-display text-base font-semibold'} text-text-strong`}
                              onClick={(e) => {
                                if (group.parentGroupId) return
                                e.stopPropagation()
                                setEditingGroupId(group.id)
                              }}
                            >
                              {group.title}
                            </span>
                          )}
                          <Badge variant='count'>{group.tasks.length}</Badge>
                        </div>
                       </div>
                      </div>
                    )
                  })() : item.type === 'task-row' ? (() => {
                    const {task, group} = item
                    const selected = selectedTaskIds.includes(task.id)
                    const isActiveTask = isTaskDetailOpen && activeTaskId === task.id
                    const isEditing = editingTaskId === task.id
                    const isPendingTask = pendingTaskIdSet.has(task.id)

                    return (
                      <TableTaskRow
                        activeTaskId={activeTaskId}
                        editInputRef={editInputRef}
                        editingTitle={editingTitle}
                        isActiveTask={isActiveTask}
                        isDragOver={dragOverTaskId === task.id}
                        isDragged={draggedTaskId === task.id}
                        isEditing={isEditing}
                        isPendingTask={isPendingTask}
                        isTaskDetailOpen={isTaskDetailOpen}
                        mode={mode}
                        onCancelEdit={cancelEdit}
                        onContextMenu={handleRowContextMenu}
                        onDragEnd={handleRowDragEnd}
                        onDragLeave={() => {
                          if (dragOverTaskId === task.id) setDragOverTaskId(null)
                        }}
                        onDragOver={(e) => {
                          e.preventDefault()
                          if (draggedTaskId && draggedTaskId !== task.id) {
                            setDragOverTaskId(task.id)
                          }
                        }}
                        onDragStart={(e) => {
                          setDraggedTaskId(task.id)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          if (draggedTaskId && draggedTaskId !== task.id) {
                            if (taskMode === 'sprint' && onMoveCardToSprint) {
                              const draggedCard = leafGroups
                                .flatMap((g) => g.tasks)
                                .find((t) => t.id === draggedTaskId)
                              if (draggedCard && (draggedCard.card.sprintId ?? null) !== (group.moveTarget?.sprintId ?? null)) {
                                const targetSprintId = group.moveTarget?.sprintId ?? null
                                onMoveCardToSprint(draggedTaskId, targetSprintId)
                                setDraggedTaskId(null)
                                setDragOverGroupId(null)
                                setDragOverTaskId(null)
                                return
                              }
                            }
                            if (onMoveTask) {
                              onMoveTask(
                                draggedTaskId,
                                groupBy === 'group' ? task.card.groupPosition : task.card.statusPosition,
                                groupBy === 'group' ? task.card.groupId : undefined,
                              )
                            }
                          }
                          setDraggedTaskId(null)
                          setDragOverGroupId(null)
                          setDragOverTaskId(null)
                        }}
                        onEditTitle={setEditingTitle}
                        onOpenTask={onOpenTask}
                        onSaveTitle={saveTitle}
                        onStartEditing={handleStartEditing}
                        onToggleComplete={handleToggleComplete}
                        onToggleTaskSelection={onToggleTaskSelection}
                        selected={selected}
                        task={task}
                        titleWidth={titleWidth}
                      >
                        {/* Field columns -- inline editors */}
                        {columns.map((column) => (
                          <div className='flex min-w-0 items-center justify-center' key={`${task.id}-${column.key}`}>
                              {column.kind === 'builtin' ? (
                                <FieldEditor
                                  calcConfig={column.key === 'effort' ? (calcConfigs[column.key] ?? defaultCalcConfig) : undefined}
                                  card={task.card}
                                  fieldKey={column.key as BuiltinTableFieldKey}
                                  mode={mode}
                                  onSetAssignee={(assigneeUserId) => {
                                    const targetIds = selected && selectedTaskIds.length > 1
                                      ? selectedTaskIds
                                      : [task.card.id]
                                    for (const cardId of targetIds) {
                                      setCardAssigneeMutation.mutate({assigneeUserId, cardId, projectId})
                                    }
                                  }}
                                  onSetGroup={(groupId) => {
                                    const targetIds = selected && selectedTaskIds.length > 1
                                      ? selectedTaskIds
                                      : [task.card.id]
                                    if (targetIds.length > 1 && onMoveSelectedCardsToGroup) {
                                      void onMoveSelectedCardsToGroup(targetIds, groupId)
                                      return
                                    }
                                    for (const cardId of targetIds) {
                                      void onMoveCardToGroup?.(cardId, groupId)
                                    }
                                  }}
                                  onUpdateCard={(input) => {
                                    if (selected && selectedTaskIds.length > 1) {
                                    // Apply the same change to all selected cards
                                    const allTasks = tableGroups.flatMap((g) => g.tasks)
                                    for (const id of selectedTaskIds) {
                                      const t = allTasks.find((tt) => tt.id === id)
                                      if (t) {
                                        updateCardMutation.mutate(buildCardUpdate(t.card, {
                                          ...(input.statusOptionId !== task.card.statusOptionId ? {statusOptionId: input.statusOptionId} : {}),
                                          ...(input.priorityOptionId !== task.card.priorityOptionId ? {priorityOptionId: input.priorityOptionId} : {}),
                                          ...(input.dueAt !== task.card.dueAt ? {dueAt: input.dueAt} : {}),
                                          ...(input.startAt !== task.card.startAt ? {startAt: input.startAt} : {}),
                                          ...(input.effort !== task.card.effort ? {effort: input.effort} : {}),
                                          ...(JSON.stringify(input.tags) !== JSON.stringify(task.card.tags) ? {tags: input.tags} : {}),
                                        }))
                                      }
                                    }
                                  } else {
                                    updateCardMutation.mutate(input)
                                  }
                                  }}
                                  onAddPriorityOption={() => {
                                    const existingLabels = new Set(statusOptions.map(o => o.label.toLowerCase()))
                                    let label = 'New Priority'
                                    let counter = 2
                                    while (existingLabels.has(label.toLowerCase())) {
                                      label = `New Priority ${counter}`
                                      counter++
                                    }
                                    addPriorityOptionMutation.mutate({label})
                                  }}
                                  onAddStatusOption={(label, category) =>
                                    addStatusOptionMutation.mutate({category: category as 'not_started' | 'started' | 'completed', label})
                                  }
                                  onChangePriorityOptionColor={(optionId, color) =>
                                    setPriorityOptionColorMutation.mutate({color, optionId})
                                  }
                                  onChangeStatusOptionColor={(optionId, color) =>
                                    setStatusOptionColorMutation.mutate({color, optionId})
                                  }
                                  onDeletePriorityOption={(optionId) => deletePriorityOptionMutation.mutate(optionId)}
                                  onDeleteStatusOption={(optionId) => deleteStatusOptionMutation.mutate(optionId)}
                                  onRenamePriorityOption={(optionId, label) => renamePriorityOptionMutation.mutate({newLabel: label, optionId})}
                                  onRenameStatusOption={(optionId, label) => renameStatusOptionMutation.mutate({newLabel: label, optionId})}
                                  priorityOptions={priorityOptions}
                                  projectGroups={projectGroups}
                                  projectMembers={projectMembers}
                                  statusOptions={statusOptions}
                                />
                            ) : column.fieldDefinition ? (
                              <CustomFieldCell
                                card={task.card}
                                field={column.fieldDefinition}
                                onAddOption={(fieldDefinitionId) => {
                                  const existingLabels = new Set((column.fieldDefinition?.options ?? []).map(o => o.label.toLowerCase()))
                                  let label = 'New Label'
                                  let counter = 2
                                  while (existingLabels.has(label.toLowerCase())) {
                                    label = `New Label ${counter}`
                                    counter++
                                  }
                                  addFieldOptionMutation.mutate({fieldDefinitionId, label})
                                }}
                                onColorChange={(optionId, color) => setFieldOptionColorMutation.mutate({color, optionId})}
                                onDeleteOption={(optionId) => deleteFieldOptionMutation.mutate(optionId)}
                                onRenameOption={(optionId, label) => renameFieldOptionMutation.mutate({label, optionId})}
                                onSetValue={(cardId, fieldDefinitionId, value) => {
                                  const targetIds = selected && selectedTaskIds.length > 1
                                    ? selectedTaskIds
                                    : [cardId]
                                  for (const targetId of targetIds) {
                                    onSetCustomFieldValue?.(targetId, fieldDefinitionId, value)
                                  }
                                }}
                              />
                            ) : (
                              <span className='text-xs text-text-muted'>—</span>
                            )}
                          </div>
                        ))}
                      </TableTaskRow>
                    )
                  })() : item.type === 'inline-create' ? (() => {
                    const group = item.group
                    const canDropTaskIntoThisGroup = canAppendTaskToGroup(group)
                    const isTaskDropTarget = draggedTaskId !== null && canDropTaskIntoThisGroup

                    return (
                      <div
                        className={`border-b border-border-subtle bg-surface-base transition-colors ${
                          isTaskDropTarget && dragOverGroupId === group.id ? 'border-t-2 border-t-primary bg-primary-soft/30' : ''
                        }`}
                        data-inline-create-group-id={group.id}
                        onDragLeave={() => {
                          if (dragOverGroupId === group.id) {
                            setDragOverGroupId(null)
                          }
                        }}
                        onDragOver={(event) => {
                          if (!isTaskDropTarget) {
                            return
                          }
                          event.preventDefault()
                          setDragOverGroupId(group.id)
                        }}
                        onDrop={(event) => {
                          if (!isTaskDropTarget) {
                            return
                          }
                          event.preventDefault()
                          moveDraggedTaskToGroupEnd(group)
                        }}
                      >
                        <div
                          className={`sticky left-0 z-10 flex items-center gap-2 px-4 py-2 transition-colors ${
                            isTaskDropTarget && dragOverGroupId === group.id ? 'bg-primary-soft/30' : 'bg-surface-base'
                          }`}
                          style={{width: `${titleWidth}px`}}
                        >
                          <Plus className='h-4 w-4 shrink-0 text-text-muted' />
                          <input
                            className='h-7 flex-1 bg-transparent text-sm text-text-strong placeholder:text-text-muted outline-none'
                            onChange={(event) => {
                              const value = event.target.value
                              const activeGuard = inlineCreateSubmissionGuardsRef.current[group.id]
                              if (activeGuard && value !== activeGuard.title) {
                                delete inlineCreateSubmissionGuardsRef.current[group.id]
                              }
                              setAddTaskDrafts((current) => ({...current, [group.id]: value}))
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                void submitInlineTask(group)
                              }

                              if (event.key === 'Escape') {
                                setAddTaskDrafts((current) => ({...current, [group.id]: ''}))
                                event.currentTarget.blur()
                              }
                            }}
                            onBlur={() => {
                              void submitInlineTask(group)
                            }}
                            placeholder='Add task...'
                            ref={(node) => {
                              if (node) {
                                addTaskInputRefs.current[group.id] = node
                                return
                              }
                              delete addTaskInputRefs.current[group.id]
                            }}
                            type='text'
                            value={addTaskDrafts[group.id] ?? ''}
                          />
                        </div>
                      </div>
                    )
                  })() : item.type === 'group-summary' ? (
                    <TableGroupSummaryRow
                      allTasks={allTasks}
                      priorityOptions={priorityOptions}
                      calcConfigs={calcConfigs}
                      columns={columns}
                      groupBy={groupBy}
                      mode={mode}
                      onCalcConfigChange={(columnKey, config) =>
                        setCalcConfigs((prev) => ({...prev, [columnKey]: config}))
                      }
                      statusOptions={statusOptions}
                      tasks={item.group.tasks}
                    />
                  ) : null}
                </div>
              )
            })}
          </div>

          {/* Add Group / New Sprint button */}
          {taskMode === 'sprint' && onCreateSprintClick ? (
            <button
              className='sticky left-0 z-10 flex w-fit items-center gap-2 px-4 py-3 text-sm font-medium text-text-muted transition-colors hover:text-text-strong'
              onClick={onCreateSprintClick}
              type='button'
            >
              <Plus className='h-4 w-4'/>
              New Sprint
            </button>
          ) : onAddGroup ? (
            addGroupDraft !== null ? (
              <div className='sticky left-0 z-10 flex w-fit items-center gap-2 px-4 py-3 text-sm font-medium text-text-muted'>
                <Plus className='h-4 w-4 shrink-0'/>
                <input
                  ref={addGroupInputRef}
                  autoFocus
                  className='h-7 min-w-[12rem] bg-transparent text-sm font-medium text-text-strong placeholder:text-text-muted outline-none'
                  onBlur={() => { void submitAddGroup() }}
                  onChange={(e) => setAddGroupDraft(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void submitAddGroup()
                    }
                    if (e.key === 'Escape') {
                      setAddGroupDraft(null)
                    }
                  }}
                  placeholder='Add group...'
                  type='text'
                  value={addGroupDraft}
                />
              </div>
            ) : (
              <button
                className='sticky left-0 z-10 flex w-fit items-center gap-2 px-4 py-3 text-sm font-medium text-text-muted transition-colors hover:text-text-strong'
                onClick={() => setAddGroupDraft('')}
                type='button'
              >
                <Plus className='h-4 w-4'/>
                Add group
              </button>
            )
          ) : null}
        </div>
      </div>

      {contextMenu ? (() => {
        const contextCard = tableGroups
          .flatMap((g) => g.tasks)
          .find((t) => t.id === contextMenu.cardId)

        if (!contextCard) return null

        return (
          <TaskContextMenu
            cardSprintId={contextCard.card.sprintId}
            isCompleted={contextCard.completed}
            isOpen
            onArchive={async () => {
              setContextMenu(null)
              try {
                const archivedCards = await runArchiveCardsMutation(queryClient, {cardIds: [contextCard.id], projectId})
                toast({
                  title: `Archived '${contextCard.title || 'Untitled'}'`,
                  action: {
                    label: 'Undo',
                    onClick: () => void runUnarchiveCardsMutation(queryClient, {
                      cardIds: [contextCard.id],
                      cards: archivedCards,
                      projectId,
                    }).catch(() => {
                      toast({title: "Couldn't restore archived task", variant: 'error'})
                    }),
                  },
                })
              } catch (error) {
                console.error('[archive-card] Failed:', error)
                toast({title: "Couldn't archive — try again", variant: 'error'})
              }
            }}
            onClose={() => setContextMenu(null)}
            onCopyLink={() => {
              void navigator.clipboard.writeText(`${window.location.href}`)
            }}
            onDelete={async () => {
              setContextMenu(null)
              try {
                const trashedCards = await runTrashCardsMutation(queryClient, {cardIds: [contextCard.id], projectId})
                toast({
                  title: `Moved '${contextCard.title || 'Untitled'}' to trash`,
                  description: 'Will be permanently deleted after 30 days',
                  action: {
                    label: 'Undo',
                    onClick: () => void runRestoreCardsMutation(queryClient, {
                      cardIds: [contextCard.id],
                      cards: trashedCards,
                      projectId,
                    }).catch(() => {
                      toast({title: "Couldn't restore trashed task", variant: 'error'})
                    }),
                  },
                })
              } catch (error) {
                console.error('[trash-card] Failed:', error)
                toast({title: "Couldn't move to trash — try again", variant: 'error'})
              }
            }}
            onDuplicate={async () => {
              setContextMenu(null)
              try {
                await runDuplicateCardsMutation(queryClient, {cardIds: [contextCard.id], projectId})
                toast({title: `Duplicated '${contextCard.title || 'Untitled'}'`})
              } catch (error) {
                console.error('[duplicate-card] Failed:', error)
                toast({title: "Couldn't duplicate — try again", variant: 'error'})
              }
            }}
            onMoveToSprint={onMoveCardToSprint ? (sprintId) => onMoveCardToSprint(contextCard.id, sprintId) : undefined}
            onOpenDetails={() => onOpenTask(contextCard.id)}
            onToggleComplete={() => toggleComplete(contextCard.card)}
            position={contextMenu.position}
            projectSprints={projectSprints}
          />
        )
      })() : null}

      {/* Group context menu (right-click) */}
      {groupContextMenu ? (
        <>
          <div className='fixed inset-0 z-50' onClick={() => setGroupContextMenu(null)}/>
          <div
            className='fixed z-50 min-w-[180px] rounded-xl border border-border-subtle bg-surface-elevated p-1.5 shadow-float'
            style={{
              left: Math.min(groupContextMenu.position.x, window.innerWidth - 200),
              top: groupContextMenu.position.y + 100 > window.innerHeight
                ? groupContextMenu.position.y - 100
                : groupContextMenu.position.y,
            }}
          >
            <button
              className='flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-medium hover:bg-canvas-accent'
              onClick={() => {
                setEditingGroupId(groupContextMenu.groupId)
                setGroupContextMenu(null)
              }}
              type='button'
            >
              Rename group
            </button>
            <button
              className='flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-error hover:bg-canvas-accent'
              onClick={() => {
                const {groupId, groupTitle, taskCount} = groupContextMenu
                setGroupContextMenu(null)
                if (taskCount === 0) {
                  onDeleteGroup?.(groupId, false)
                } else {
                  setDeleteGroupDialog({groupId, groupTitle, taskCount})
                }
              }}
              type='button'
            >
              Delete group
            </button>
          </div>
        </>
      ) : null}

      {/* Delete group confirmation dialog */}
      {deleteGroupDialog ? (
        <DeleteGroupDialog
          groupName={deleteGroupDialog.groupTitle}
          onClose={() => setDeleteGroupDialog(null)}
          onDeleteKeepTasks={() => {
            onDeleteGroup?.(deleteGroupDialog.groupId, false)
            setDeleteGroupDialog(null)
          }}
          onDeleteWithTasks={() => {
            onDeleteGroup?.(deleteGroupDialog.groupId, true)
            setDeleteGroupDialog(null)
          }}
          taskCount={deleteGroupDialog.taskCount}
        />
      ) : null}
    </div>
  )
}
