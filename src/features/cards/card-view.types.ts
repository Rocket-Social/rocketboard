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
  avgTime?: string | null
  id: string
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
