export const projectViewTypes = ['overview', 'table', 'kanban', 'gantt', 'document', 'github', 'canvas'] as const

export type ProjectViewType = (typeof projectViewTypes)[number]
export type AddableProjectViewType = Exclude<ProjectViewType, 'overview'>

export const defaultBoardStarterViewTypes = ['overview', 'table', 'kanban'] as const

export const defaultBoardStarterViewType: ProjectViewType = 'table'

export const maxProjectViewCountByType: Record<AddableProjectViewType, number> = {
  canvas: 10,
  document: 10,
  gantt: 1,
  github: 10,
  kanban: 1,
  table: 1,
}

export type ProjectViewNavItem = {
  id: string
  isDefault: boolean
  isHidden: boolean
  name: string
  position: number
  viewType: ProjectViewType
}

export function isProjectViewType(value: string): value is ProjectViewType {
  return projectViewTypes.includes(value as ProjectViewType)
}

export function compareProjectViewTypes(left: ProjectViewType, right: ProjectViewType) {
  return projectViewTypes.indexOf(left) - projectViewTypes.indexOf(right)
}

export function getMaxProjectViewCount(viewType: AddableProjectViewType) {
  return maxProjectViewCountByType[viewType]
}

export function getProjectViewCountLabel(viewType: AddableProjectViewType) {
  const maxViewCount = getMaxProjectViewCount(viewType)

  return maxViewCount === 1 ? '1 per project' : `Up to ${maxViewCount} per project`
}

export function getProjectViewDefaultName(viewType: ProjectViewType) {
  switch (viewType) {
    case 'kanban':
      return 'Kanban'
    case 'document':
      return 'Document'
    case 'gantt':
      return 'Gantt'
    case 'overview':
      return 'Overview'
    case 'table':
      return 'Table'
    case 'github':
      return 'GitHub'
    case 'canvas':
      return 'Canvas'
    default:
      return viewType
  }
}

export function getProjectViewDisplayName(viewType: ProjectViewType, name?: string | null) {
  return normalizeProjectViewName(name, getProjectViewDefaultName(viewType), viewType)
}

export function isDocumentProjectView(viewType: ProjectViewType) {
  return viewType === 'document'
}

export function isTaskBoardProjectView(viewType: ProjectViewType) {
  return viewType === 'table' || viewType === 'kanban' || viewType === 'gantt'
}

export function normalizeProjectViewName(
  name: string | null | undefined,
  fallback: string,
  viewType?: ProjectViewType,
) {
  const normalized = name?.trim()

  if (!normalized || normalized.length === 0) {
    return fallback
  }

  if (viewType === 'kanban' && (normalized === 'Board' || normalized === 'Kanban')) {
    return 'Kanban'
  }

  return normalized
}

export function normalizeBoardStarterViewTypes(
  viewTypes: readonly ProjectViewType[] | null | undefined,
): ProjectViewType[] {
  const uniqueViewTypes = new Set<ProjectViewType>(['overview'])

  for (const viewType of viewTypes ?? defaultBoardStarterViewTypes) {
    if (viewType === 'overview') {
      continue
    }

    uniqueViewTypes.add(viewType)
  }

  return [...uniqueViewTypes].sort(compareProjectViewTypes)
}

export function resolveDefaultBoardStarterViewType(
  viewTypes: readonly ProjectViewType[],
  preferredViewType?: ProjectViewType | null,
): ProjectViewType {
  if (preferredViewType && viewTypes.includes(preferredViewType)) {
    return preferredViewType
  }

  if (viewTypes.length > 1 && viewTypes.includes('table')) {
    return 'table'
  }

  return viewTypes.find((viewType) => viewType !== 'overview') ?? viewTypes[0] ?? 'overview'
}

export function sortProjectViews<T extends Pick<ProjectViewNavItem, 'id' | 'position'>>(views: T[]) {
  return [...views].sort((left, right) => {
    if (left.position !== right.position) {
      return left.position - right.position
    }

    return left.id.localeCompare(right.id)
  })
}
