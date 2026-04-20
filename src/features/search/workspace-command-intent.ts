import type {ProjectShellRouteParams} from '../projects/project-shell.types'

type OpenCardIntent = ProjectShellRouteParams & {
  cardId: string
  type: 'open-card'
}

const workspaceCommandIntentKey = 'rocketboard:workspace-command-intent'

function readWorkspaceCommandIntent(): OpenCardIntent | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const rawValue = window.sessionStorage.getItem(workspaceCommandIntentKey)

    if (!rawValue) {
      return null
    }

    const value = JSON.parse(rawValue) as Partial<OpenCardIntent>

    if (
      value.type !== 'open-card'
      || typeof value.cardId !== 'string'
      || typeof value.orgSlug !== 'string'
      || typeof value.projectSlug !== 'string'
      || typeof value.viewId !== 'string'
      || typeof value.workspaceSlug !== 'string'
    ) {
      return null
    }

    return value as OpenCardIntent
  } catch {
    return null
  }
}

export function clearWorkspaceCommandIntent() {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.removeItem(workspaceCommandIntentKey)
}

export function storeWorkspaceCommandOpenCardIntent(intent: OpenCardIntent) {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.setItem(workspaceCommandIntentKey, JSON.stringify(intent))
}

export function consumeWorkspaceCommandOpenCardIntent(
  route: Pick<ProjectShellRouteParams, 'orgSlug' | 'projectSlug' | 'workspaceSlug'>,
) {
  const intent = readWorkspaceCommandIntent()

  if (!intent) {
    return null
  }

  if (
    intent.orgSlug !== route.orgSlug
    || intent.projectSlug !== route.projectSlug
    || intent.workspaceSlug !== route.workspaceSlug
  ) {
    return null
  }

  clearWorkspaceCommandIntent()
  return intent
}
