export type TableTask = {
  assignee: string
  completed: boolean
  dueDate: string
  effort: number | null
  id: string
  priority: string
  status: string
  title: string
}

export type BoardTask = {
  assignee: string
  dueIn: number | null
  id: string
  priority: string
  tags: string[]
  title: string
}

export type BoardColumn = {
  // Phase 4 PR 4-B-2: explicit accent color for assignee groupBy. Status
  // columns leave this undefined and fall back to category color via
  // theme.statusCategoryColor.
  accentColor?: string | null
  avgTime?: string | null
  id: string
  // Phase 4 PR 4-B-2: tag the column kind so render-time rules (e.g. WIP
  // limits, +Add task defaults) can branch without duplicating the
  // groupBy prop down through every render path.
  kind?: 'status' | 'assignee'
  title: string
  wipLimit?: number | null
}

export type GanttTask = {
  assignee: string
  completed: boolean
  endWeek: number
  id: string
  startWeek: number
  status: string
  title: string
}
