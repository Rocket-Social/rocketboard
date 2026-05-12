export const sprintCompletedEventName = 'rocketboard:sprint-completed'
export const sprintStartedToastDuration = 5000
export const sprintStartedToastDescription = 'Click on the sprint picker to view past sprints.'

export type SprintCompletedEventDetail = {
  completedSprintId: string
  currentSprintId: string | null
  currentSprintName: string | null
  projectId: string
  sourceViewId?: string
}

export function formatSprintStartedToastTitle(sprintName: string) {
  return `A new sprint has started (${sprintName})`
}

export function dispatchSprintCompletedEvent(detail: SprintCompletedEventDetail) {
  if (typeof window === 'undefined') return

  window.dispatchEvent(
    new CustomEvent<SprintCompletedEventDetail>(sprintCompletedEventName, {
      detail,
    }),
  )
}

function isSprintCompletedEventDetail(value: unknown): value is SprintCompletedEventDetail {
  if (!value || typeof value !== 'object') return false

  const detail = value as Record<string, unknown>
  return typeof detail.completedSprintId === 'string'
    && typeof detail.projectId === 'string'
    && (detail.currentSprintId === null || typeof detail.currentSprintId === 'string')
    && (detail.currentSprintName === null || typeof detail.currentSprintName === 'string')
    && (detail.sourceViewId === undefined || typeof detail.sourceViewId === 'string')
}

export function addSprintCompletedEventListener(
  listener: (detail: SprintCompletedEventDetail) => void,
) {
  if (typeof window === 'undefined') return () => {}

  const handleEvent = (event: Event) => {
    if (!(event instanceof CustomEvent) || !isSprintCompletedEventDetail(event.detail)) {
      return
    }

    listener(event.detail)
  }

  window.addEventListener(sprintCompletedEventName, handleEvent)
  return () => window.removeEventListener(sprintCompletedEventName, handleEvent)
}
