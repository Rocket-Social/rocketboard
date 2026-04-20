export type InitiativeStatus = 'planned' | 'active' | 'completed' | 'paused' | 'cancelled'

export type InitiativeHealth = 'on_track' | 'at_risk' | 'off_track'

export type InitiativeVisibility = 'open' | 'private'

export type InitiativeRecord = {
  createdAt: string
  description: string | null
  health: InitiativeHealth
  id: string
  latestUpdateAt: string | null
  latestUpdateText: string | null
  leadName: string | null
  leadUserId: string | null
  name: string
  position: number
  status: InitiativeStatus
  targetDate: string | null
  updatedAt: string
  visibility: InitiativeVisibility
  workspaceId: string
}

export type InitiativeSummary = {
  cardsCompleted: number
  cardsCompletedThisWeek: number
  cardsNotStarted: number
  cardsStarted: number
  initiativeId: string
  projectCount: number
  totalCards: number
}

export type InitiativeCardRecord = {
  assigneeName: string
  assigneeUserId: string | null
  cardId: string
  completedAt: string | null
  createdAt: string
  dueAt: string | null
  effort: number | null
  priorityOptionId: string | null
  projectId: string
  projectName: string
  startAt: string | null
  statusCategory: string
  statusLabel: string
  statusOptionId: string | null
  title: string
}

export type InitiativePickerCard = {
  assigneeName: string
  cardId: string
  initiativeId: string | null
  projectId: string
  projectName: string
  statusCategory: string
  statusLabel: string
  title: string
}

export type InitiativeUpdateRecord = {
  authorName: string
  bodyText: string
  createdAt: string
  createdByUserId: string
  healthSnapshot: InitiativeHealth | null
  id: string
  initiativeId: string
}

export type CreateInitiativeInput = {
  description?: string | null
  leadUserId?: string | null
  name: string
  targetDate?: string | null
  visibility?: InitiativeVisibility
  workspaceId: string
}

export type UpdateInitiativeInput = {
  description?: string | null
  health?: InitiativeHealth
  id: string
  leadUserId?: string | null
  name?: string
  status?: InitiativeStatus
  targetDate?: string | null
  visibility?: InitiativeVisibility
}

export type InitiativeSparklinePoint = {
  cardsCompletedCumulative: number
  day: string
  initiativeId: string
  totalScope: number
}

export type PostInitiativeUpdateInput = {
  bodyText: string
  health: InitiativeHealth
  initiativeId: string
}
