import type {ProjectGroupRecord} from '../projects/project-group.types'
import type {ProjectSprintRecord} from '../sprints/sprint.types'
import type {BoardTask, GanttTask, TableTask} from './card-view.types'

import {parseCardDate} from './card-date'
import {
  compareCardsByCreatedAt,
  compareCardsByGroupPosition,
  makeCompareCardsByStatusDisplayOrder,
} from './card-display-order'
import type {
  CardRecord,
  CreateCardInput,
  ProjectPriorityOption,
  ProjectStatusOption,
  StatusCategory,
  TableGroupBy,
  TaskBoardMode,
} from './card.types'

export const taskBoardBacklogId = '__backlog'
export const taskBoardStandardLaneId = '__all_tasks'

export type ProjectBoardTask = BoardTask & {
  card: CardRecord
  columnId: string
}

export type ProjectBoardLane = {
  id: string
  sprint: ProjectSprintRecord | null
  title: string
}

export type ProjectBoardLayout = {
  lanes: ProjectBoardLane[]
  tasksByColumn: Record<string, Record<string, ProjectBoardTask[]>>
}

export type ProjectTableTask = TableTask & {
  card: CardRecord
}

export type ProjectTableGroup = {
  createDefaults?: Partial<CreateCardInput>
  expanded?: boolean
  id: string
  kind?: 'backlog' | 'flat' | 'group' | 'sprint' | 'subgroup'
  level?: 0 | 1
  moveTarget?: {
    groupId?: string | null
    sprintId?: string | null
    statusOptionId?: string | null
  }
  parentGroupId?: string | null
  sprint?: ProjectSprintRecord | null
  tasks: ProjectTableTask[]
  title: string
}

export type ProjectGanttTask = GanttTask & {
  card: CardRecord
}

type SprintPartition<T> = {
  id: string
  items: T[]
  sprint: ProjectSprintRecord | null
  title: string
}

function resolveStatusOption(statusOptionId: string | null, statusOptions: ProjectStatusOption[]): ProjectStatusOption | null {
  if (!statusOptionId) return null
  return statusOptions.find((o) => o.id === statusOptionId) ?? null
}

function resolveStatusCategory(statusOptionId: string | null, statusOptions: ProjectStatusOption[]): StatusCategory | null {
  return resolveStatusOption(statusOptionId, statusOptions)?.category ?? null
}

function resolvePriorityOption(priorityOptionId: string | null, priorityOptions: ProjectPriorityOption[]): ProjectPriorityOption | null {
  if (!priorityOptionId) return null
  return priorityOptions.find((o) => o.id === priorityOptionId) ?? null
}

export function formatCardStatusLabel(statusOptionId: string | null, statusOptions: ProjectStatusOption[]) {
  if (!statusOptionId) return '—'
  const option = statusOptions.find((o) => o.id === statusOptionId)
  return option?.label ?? '—'
}

export function formatCardPriorityLabel(priorityOptionId: string | null, priorityOptions: ProjectPriorityOption[]) {
  if (!priorityOptionId) return '—'
  const option = resolvePriorityOption(priorityOptionId, priorityOptions)
  return option?.label ?? '—'
}

export function isCardCompletedStatus(statusOptionId: string | null, statusOptions: ProjectStatusOption[]) {
  return resolveStatusCategory(statusOptionId, statusOptions) === 'completed'
}

export function getStatusOptionCategory(statusOptionId: string | null, statusOptions: ProjectStatusOption[]): StatusCategory | null {
  return resolveStatusCategory(statusOptionId, statusOptions)
}

export function getFirstOptionInCategory(category: StatusCategory, statusOptions: ProjectStatusOption[]): ProjectStatusOption | null {
  return statusOptions
    .filter((o) => o.category === category)
    .sort((a, b) => a.position - b.position)[0] ?? null
}

export function getDefaultStatusOption(statusOptions: ProjectStatusOption[]): ProjectStatusOption | null {
  return statusOptions.find((o) => o.isDefault) ?? getFirstOptionInCategory('not_started', statusOptions)
}

function parseDate(value: string | null) {
  return parseCardDate(value)
}

function toInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean)

  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
  }

  return value.slice(0, 2).toUpperCase()
}

export function formatShortDate(value: string | null) {
  const parsed = parseDate(value)

  if (!parsed) {
    return 'No date'
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
  }).format(parsed)
}

const msPerDay = 24 * 60 * 60 * 1000

export function daysUntil(value: string | null) {
  const target = parseDate(value)

  if (!target) {
    return null
  }

  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  return Math.round((target.getTime() - today.getTime()) / msPerDay)
}

const ganttBaseline = new Date('2026-03-04T00:00:00Z')

function toWeekOffset(value: string | null) {
  const parsed = parseDate(value)

  if (!parsed) {
    return null
  }

  return Math.max(0, Math.round((parsed.getTime() - ganttBaseline.getTime()) / (msPerDay * 7)))
}

export function weekOffsetToDateString(value: number) {
  const normalizedOffset = Math.max(0, Math.round(value))
  const target = new Date(ganttBaseline.getTime() + normalizedOffset * 7 * msPerDay)

  return target.toISOString().slice(0, 10)
}

function toTableTask(
  card: CardRecord,
  statusOptions: ProjectStatusOption[],
  priorityOptions: ProjectPriorityOption[],
): ProjectTableTask {
  return {
    assignee: toInitials(card.assigneeName),
    card,
    completed: isCardCompletedStatus(card.statusOptionId, statusOptions),
    dueDate: formatShortDate(card.dueAt),
    effort: card.effort,
    id: card.id,
    priority: formatCardPriorityLabel(card.priorityOptionId, priorityOptions),
    status: formatCardStatusLabel(card.statusOptionId, statusOptions),
    title: card.title,
  }
}

export function buildBoardTasks(
  cards: CardRecord[],
  statusOptions: ProjectStatusOption[],
  priorityOptions: ProjectPriorityOption[],
  taskMode: TaskBoardMode = 'standard',
  projectSprints: ProjectSprintRecord[] = [],
): ProjectBoardLayout {
  // status column x sprint lane grid
  const grouped: Record<string, Record<string, ProjectBoardTask[]>> = {}
  const lanes = taskMode === 'sprint'
    ? buildSprintPartitions(cards, (card) => card.sprintId, projectSprints).map((partition) => ({
        id: partition.id,
        sprint: partition.sprint,
        title: partition.title,
      }))
    : [{id: taskBoardStandardLaneId, sprint: null, title: 'All tasks'}]

  for (const option of statusOptions) {
    grouped[option.id] = {}
  }
  grouped.__no_status = {}

  for (const columnId of Object.keys(grouped)) {
    for (const lane of lanes) {
      grouped[columnId][lane.id] = []
    }
  }

  for (const card of cards) {
    const columnId = card.statusOptionId ?? '__no_status'
    const laneId = taskMode === 'sprint'
      ? (card.sprintId && lanes.some((lane) => lane.id === card.sprintId) ? card.sprintId : taskBoardBacklogId)
      : taskBoardStandardLaneId

    if (!grouped[columnId]) {
      grouped[columnId] = {}
    }
    if (!grouped[columnId][laneId]) {
      grouped[columnId][laneId] = []
    }

    grouped[columnId][laneId].push({
      assignee: toInitials(card.assigneeName),
      card,
      columnId,
      dueIn: daysUntil(card.dueAt),
      id: card.id,
      priority: formatCardPriorityLabel(card.priorityOptionId, priorityOptions),
      tags: card.tags,
      title: card.title,
    })
  }

  return {lanes, tasksByColumn: grouped}
}

const tableGroupOrderByDateBucket = ['Past', 'Last Week', 'Yesterday', 'Today', 'Tomorrow', 'This Week', 'Future', 'No Date'] as const

function getDateBucket(dateValue: string | null): string {
  if (!dateValue) return 'No Date'

  const parsed = new Date(dateValue)
  if (Number.isNaN(parsed.getTime())) return 'No Date'

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  const dayOfWeek = today.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const thisWeekStart = new Date(today)
  thisWeekStart.setDate(today.getDate() + mondayOffset)
  const thisWeekEnd = new Date(thisWeekStart)
  thisWeekEnd.setDate(thisWeekStart.getDate() + 6)

  const lastWeekStart = new Date(thisWeekStart)
  lastWeekStart.setDate(thisWeekStart.getDate() - 7)
  const lastWeekEnd = new Date(thisWeekStart)
  lastWeekEnd.setDate(thisWeekStart.getDate() - 1)

  const cardDate = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())

  if (cardDate.getTime() === today.getTime()) return 'Today'
  if (cardDate.getTime() === yesterday.getTime()) return 'Yesterday'
  if (cardDate.getTime() === tomorrow.getTime()) return 'Tomorrow'
  if (cardDate >= thisWeekStart && cardDate <= thisWeekEnd) return 'This Week'
  if (cardDate >= lastWeekStart && cardDate <= lastWeekEnd) return 'Last Week'
  if (cardDate > thisWeekEnd) return 'Future'
  return 'Past'
}

function getStatusGroupOrder(statusOptions: ProjectStatusOption[]): ProjectStatusOption[] {
  const categoryOrder: StatusCategory[] = ['started', 'not_started', 'completed']
  return categoryOrder.flatMap((category) =>
    statusOptions
      .filter((o) => o.category === category)
      .sort((a, b) => a.position - b.position),
  )
}

export function sortProjectSprints(projectSprints: ProjectSprintRecord[]) {
  const statusOrder: Record<string, number> = {active: 0, planned: 1, completed: 2}
  return [...projectSprints].sort((a, b) => {
    const diff = (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1)
    if (diff !== 0) return diff
    const aTime = a.startDate ? new Date(a.startDate).getTime() : Infinity
    const bTime = b.startDate ? new Date(b.startDate).getTime() : Infinity
    return aTime - bTime
  })
}

export function buildSprintPartitions<T>(
  items: T[],
  getSprintId: (item: T) => string | null,
  projectSprints: ProjectSprintRecord[],
): SprintPartition<T>[] {
  const grouped = new Map<string, T[]>()
  const backlogItems: T[] = []
  const sortedSprints = sortProjectSprints(projectSprints)

  for (const sprint of sortedSprints) {
    grouped.set(sprint.id, [])
  }

  for (const item of items) {
    const sprintId = getSprintId(item)
    if (sprintId && grouped.has(sprintId)) {
      grouped.get(sprintId)!.push(item)
    } else {
      backlogItems.push(item)
    }
  }

  const partitions: SprintPartition<T>[] = []
  for (const sprint of sortedSprints.filter((entry) => entry.status !== 'completed')) {
    partitions.push({
      id: sprint.id,
      items: grouped.get(sprint.id) ?? [],
      sprint,
      title: sprint.name,
    })
  }

  partitions.push({
    id: taskBoardBacklogId,
    items: backlogItems,
    sprint: null,
    title: 'Backlog',
  })

  for (const sprint of sortedSprints.filter((entry) => entry.status === 'completed')) {
    partitions.push({
      id: sprint.id,
      items: grouped.get(sprint.id) ?? [],
      sprint,
      title: sprint.name,
    })
  }

  return partitions
}

export function buildTableGroups(
  cards: CardRecord[],
  groupBy: TableGroupBy,
  collapsedGroups: string[] = [],
  projectGroups: ProjectGroupRecord[] = [],
  statusOptions: ProjectStatusOption[] = [],
  priorityOptions: ProjectPriorityOption[] = [],
  projectSprints: ProjectSprintRecord[] = [],
  taskMode: TaskBoardMode = 'standard',
): ProjectTableGroup[] {
  const collapsedGroupSet = new Set(collapsedGroups)
  const isCollapsed = (stableId: string, label: string) =>
    collapsedGroupSet.has(stableId)
    || collapsedGroupSet.has(label.toLowerCase().replace(/\s+/g, '-'))
  const sortByCreatedAt = (tasks: ProjectTableTask[]) =>
    [...tasks].sort((left, right) => compareCardsByCreatedAt(left.card, right.card))
  const sortByGroupPosition = (tasks: ProjectTableTask[]) =>
    [...tasks].sort((left, right) => compareCardsByGroupPosition(left.card, right.card))
  const compareByStatus = makeCompareCardsByStatusDisplayOrder(statusOptions)
  const sortByStatusPosition = (tasks: ProjectTableTask[]) =>
    [...tasks].sort((left, right) => compareByStatus(left.card, right.card))

  if (taskMode === 'sprint') {
    return buildSprintPartitions(cards, (card) => card.sprintId, projectSprints).flatMap((partition) => {
      const rootTasks = sortByCreatedAt(partition.items.map((card) => toTableTask(card, statusOptions, priorityOptions)))
      const rootGroup: ProjectTableGroup = {
        createDefaults: {sprintId: partition.sprint?.id ?? null},
        expanded: !collapsedGroupSet.has(partition.id),
        id: partition.id,
        kind: partition.sprint ? 'sprint' : 'backlog',
        level: 0,
        moveTarget: {sprintId: partition.sprint?.id ?? null},
        sprint: partition.sprint,
        tasks: rootTasks,
        title: partition.title,
      }

      const childGroups = buildTableGroups(
        partition.items,
        groupBy,
        collapsedGroups,
        projectGroups,
        statusOptions,
        priorityOptions,
        projectSprints,
        'standard',
      ).map((group) => ({
        ...group,
        createDefaults: {
          ...group.createDefaults,
          sprintId: partition.sprint?.id ?? null,
        },
        id: `${partition.id}::${group.id}`,
        kind: group.kind === 'flat' ? 'flat' as const : 'subgroup' as const,
        level: 1 as const,
        moveTarget: {
          ...group.moveTarget,
          sprintId: partition.sprint?.id ?? null,
        },
        parentGroupId: partition.id,
        sprint: partition.sprint,
      }))

      return [rootGroup, ...childGroups]
    })
  }

  if (groupBy === 'group') {
    const grouped = new Map<string, ProjectTableTask[]>()
    const ungroupedTasks: ProjectTableTask[] = []

    for (const group of projectGroups) {
      grouped.set(group.id, [])
    }

    for (const card of cards) {
      const task = toTableTask(card, statusOptions, priorityOptions)
      if (card.groupId && grouped.has(card.groupId)) {
        grouped.get(card.groupId)!.push(task)
      } else {
        ungroupedTasks.push(task)
      }
    }

    const result: ProjectTableGroup[] = []

    if (ungroupedTasks.length > 0 || projectGroups.length === 0) {
      result.push({
        createDefaults: {groupId: null},
        expanded: true,
        id: '__flat',
        kind: 'flat',
        level: 0,
        moveTarget: {groupId: null},
        tasks: sortByGroupPosition(ungroupedTasks),
        title: '',
      })
    }

    for (const group of projectGroups) {
      result.push({
        createDefaults: {groupId: group.id},
        expanded: !collapsedGroupSet.has(group.id),
        id: group.id,
        kind: 'group',
        level: 0,
        moveTarget: {groupId: group.id},
        tasks: sortByGroupPosition(grouped.get(group.id) ?? []),
        title: group.label,
      })
    }

    return result
  }

  if (groupBy === 'assignee') {
    const grouped = new Map<string, ProjectTableTask[]>()
    const unassigned: ProjectTableTask[] = []

    for (const card of cards) {
      const task = toTableTask(card, statusOptions, priorityOptions)
      if (card.assigneeUserId && card.assigneeName) {
        if (!grouped.has(card.assigneeUserId)) {
          grouped.set(card.assigneeUserId, [])
        }
        grouped.get(card.assigneeUserId)!.push(task)
      } else {
        unassigned.push(task)
      }
    }

    const assigneeEntries = [...grouped.entries()].map(([userId, tasks]) => ({
      name: tasks[0].card.assigneeName,
      tasks,
      userId,
    }))
    assigneeEntries.sort((a, b) => a.name.localeCompare(b.name))

    const result: ProjectTableGroup[] = assigneeEntries.map((entry) => ({
      createDefaults: {},
      expanded: !collapsedGroupSet.has(entry.userId),
      id: entry.userId,
      kind: 'group',
      level: 0,
      tasks: sortByCreatedAt(entry.tasks),
      title: entry.name,
    }))

    if (unassigned.length > 0) {
      result.push({
        createDefaults: {},
        expanded: !collapsedGroupSet.has('unassigned'),
        id: 'unassigned',
        kind: 'group',
        level: 0,
        tasks: sortByCreatedAt(unassigned),
        title: 'Unassigned',
      })
    }

    return result
  }

  if (groupBy === 'priority') {
    // Group by priority options in sort_order, plus a "No priority" group at the end
    const groups = new Map<string, ProjectTableTask[]>()
    const noPriorityTasks: ProjectTableTask[] = []

    for (const option of priorityOptions) {
      groups.set(option.id, [])
    }

    for (const card of cards) {
      const task = toTableTask(card, statusOptions, priorityOptions)
      if (card.priorityOptionId && groups.has(card.priorityOptionId)) {
        groups.get(card.priorityOptionId)!.push(task)
      } else {
        noPriorityTasks.push(task)
      }
    }

    const sortedOptions = [...priorityOptions].sort((a, b) => a.sortOrder - b.sortOrder)
    const result: ProjectTableGroup[] = sortedOptions.map((option) => ({
      createDefaults: {priorityOptionId: option.id},
      expanded: !isCollapsed(option.id, option.label),
      id: option.id,
      kind: 'group',
      level: 0,
      tasks: sortByCreatedAt(groups.get(option.id) ?? []),
      title: option.label,
    }))

    if (noPriorityTasks.length > 0) {
      result.push({
        createDefaults: {priorityOptionId: null},
        expanded: !collapsedGroupSet.has('__no_priority'),
        id: '__no_priority',
        kind: 'group',
        level: 0,
        tasks: sortByCreatedAt(noPriorityTasks),
        title: '—',
      })
    }

    return result
  }

  if (groupBy === 'due_date') {
    const groups = new Map<string, ProjectTableTask[]>()

    for (const bucket of tableGroupOrderByDateBucket) {
      groups.set(bucket, [])
    }

    for (const card of cards) {
      const task = toTableTask(card, statusOptions, priorityOptions)
      const bucket = getDateBucket(card.dueAt)
      groups.get(bucket)?.push(task)
    }

    return tableGroupOrderByDateBucket
      .map((bucket) => ({
        createDefaults: {},
        expanded: !collapsedGroupSet.has(bucket.toLowerCase().replace(/\s+/g, '-')),
        id: bucket.toLowerCase().replace(/\s+/g, '-'),
        kind: 'group',
        level: 0,
        tasks: sortByCreatedAt(groups.get(bucket) ?? []),
        title: bucket,
      }))
  }

  // 'status' — group by status options in category order
  const orderedOptions = getStatusGroupOrder(statusOptions)
  const groups = new Map<string, ProjectTableTask[]>()

  for (const option of orderedOptions) {
    groups.set(option.id, [])
  }
  groups.set('__no_status', [])

  for (const card of cards) {
    const key = card.statusOptionId ?? '__no_status'
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(toTableTask(card, statusOptions, priorityOptions))
  }

  const result: ProjectTableGroup[] = orderedOptions
    .map((option) => {
      return {
        createDefaults: {statusOptionId: option.id},
        expanded: !isCollapsed(option.id, option.label),
        id: option.id,
        kind: 'group',
        level: 0,
        moveTarget: {statusOptionId: option.id},
        tasks: sortByStatusPosition(groups.get(option.id) ?? []),
        title: option.label,
      }
    })

  // Add unset-status group at the beginning if there are legacy cards with no status
  const noStatusTasks = groups.get('__no_status') ?? []
  if (noStatusTasks.length > 0) {
    result.unshift({
      createDefaults: {statusOptionId: null},
      expanded: !collapsedGroupSet.has('__no_status'),
      id: '__no_status',
      kind: 'group',
      level: 0,
      moveTarget: {statusOptionId: null},
      tasks: sortByCreatedAt(noStatusTasks),
      title: '—',
    })
  }

  return result
}

export function buildGanttTasks(
  cards: CardRecord[],
  statusOptions: ProjectStatusOption[],
): ProjectGanttTask[] {
  return cards.flatMap((card) => {
    const startWeek = toWeekOffset(card.startAt)
    const dueWeek = toWeekOffset(card.dueAt)
    const createdWeek = toWeekOffset(card.createdAt)

    if (startWeek == null && dueWeek == null) {
      return []
    }

    const normalizedStartWeek = startWeek ?? createdWeek ?? dueWeek ?? 0
    const normalizedEndWeek = dueWeek ?? startWeek ?? normalizedStartWeek

    return [{
      assignee: toInitials(card.assigneeName),
      card,
      completed: isCardCompletedStatus(card.statusOptionId, statusOptions),
      endWeek: Math.max(normalizedStartWeek, normalizedEndWeek),
      id: card.id,
      startWeek: Math.min(normalizedStartWeek, normalizedEndWeek),
      status: formatCardStatusLabel(card.statusOptionId, statusOptions),
      title: card.title,
    }]
  })
}

export function filterCards(cards: CardRecord[], query: string, statusOptions: ProjectStatusOption[], priorityOptions: ProjectPriorityOption[]) {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return cards
  }

  return cards.filter((card) => {
    const statusLabel = formatCardStatusLabel(card.statusOptionId, statusOptions)
    const priorityLabel = formatCardPriorityLabel(card.priorityOptionId, priorityOptions)
    const haystack = [
      card.title,
      card.bodyMd,
      card.assigneeName,
      priorityLabel,
      statusLabel,
      ...card.tags,
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(normalizedQuery)
  })
}
