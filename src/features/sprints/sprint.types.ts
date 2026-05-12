export type SprintStatus = 'planned' | 'active' | 'completed'

export type ProjectSprintRecord = {
  completedAt: string | null
  createdAt: string
  endDate: string | null
  goal: string | null
  id: string
  name: string
  position: number
  projectId: string
  startDate: string | null
  status: SprintStatus
  updatedAt: string
}

export type CreateSprintInput = {
  endDate?: string | null
  goal?: string | null
  name: string
  projectId: string
  startDate?: string | null
}

export type UpdateSprintInput = {
  endDate: string | null
  goal: string | null
  id: string
  name: string
  startDate: string | null
}

export type CompleteSprintAction = 'move_to_next' | 'return_to_backlog' | 'keep'

export type CompleteSprintMoveTarget =
  | {
      kind: 'existing'
      sprintId: string
      sprintName: string
    }
  | {
      endDate: string | null
      goal: string | null
      kind: 'create'
      sprintName: string
      startDate: string | null
    }

export type CompleteSprintInput = {
  action: CompleteSprintAction
  nextSprint?: CompleteSprintMoveTarget | null
  sprintId: string
}
