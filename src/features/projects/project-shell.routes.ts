import {onboardingRoutePath} from '../setup/setup.routes'
import {isProjectViewType, sortProjectViews, type ProjectViewNavItem} from './project-view.model'
import type {ProjectRouteTarget, ProjectShellRouteParams, WorkspaceProjectSummary, WorkspaceSummary} from './project-shell.types'

export const emptyShellRoutePath = onboardingRoutePath

function isValidRouteSegment(value: string | null | undefined): value is string {
  return Boolean(value && value.trim().length > 0 && value !== 'null' && value !== 'undefined')
}

function isRoutableProjectView(view: ProjectViewNavItem | null | undefined): view is ProjectViewNavItem {
  return Boolean(view && isValidRouteSegment(view.id))
}

function isRoutableProject(project: WorkspaceProjectSummary | null | undefined): project is WorkspaceProjectSummary {
  return Boolean(project && isValidRouteSegment(project.slug))
}

function isRoutableWorkspace(workspace: WorkspaceSummary | null | undefined): workspace is WorkspaceSummary {
  return Boolean(
    workspace
    && isValidRouteSegment(workspace.slug)
    && isValidRouteSegment(workspace.organizationSlug),
  )
}

function resolveDefaultProjectView(project: WorkspaceProjectSummary): ProjectViewNavItem | null {
  const sortedViews = sortProjectViews(project.projectViews).filter(isRoutableProjectView)
  const visibleViews = sortedViews.filter((view) => !view.isHidden)

  return (
    visibleViews.find((view) => view.id === project.defaultProjectViewId)
    ?? visibleViews[0]
    ?? sortedViews.find((view) => view.id === project.defaultProjectViewId)
    ?? sortedViews[0]
    ?? null
  )
}

function resolveProjectView(project: WorkspaceProjectSummary, preferredView?: string): ProjectViewNavItem | null {
  const sortedViews = sortProjectViews(project.projectViews).filter(isRoutableProjectView)
  const visibleViews = sortedViews.filter((view) => !view.isHidden)

  if (isValidRouteSegment(preferredView)) {
    const matchingView = project.projectViews.find((view) => view.id === preferredView)
    if (isRoutableProjectView(matchingView)) return matchingView

    if (isProjectViewType(preferredView)) {
      const visibleTypeMatch = visibleViews.find((view) => view.viewType === preferredView)
      if (visibleTypeMatch) return visibleTypeMatch
    }
  }

  return resolveDefaultProjectView(project)
}

function resolveDefaultProject(workspace: WorkspaceSummary): WorkspaceProjectSummary | null {
  const routableProjects = workspace.projects.filter(isRoutableProject)
  return routableProjects.find((item) => item.slug === workspace.defaultProjectSlug) ?? routableProjects[0] ?? null
}

function getMatchingWorkspace(
  workspaces: WorkspaceSummary[],
  orgSlug: string,
  workspaceSlug: string,
) {
  return workspaces.find((item) => item.organizationSlug === orgSlug && item.slug === workspaceSlug)
}

export function isProjectRouteTarget(value: unknown): value is ProjectRouteTarget {
  if (!value || typeof value !== 'object') {
    return false
  }

  const route = value as Partial<ProjectRouteTarget>

  return (
    isValidRouteSegment(route.orgSlug)
    && isValidRouteSegment(route.workspaceSlug)
    && isValidRouteSegment(route.projectSlug)
    && isValidRouteSegment(route.viewId)
  )
}

export function resolveProjectRouteTarget(
  workspaces: WorkspaceSummary[],
  route: unknown,
): ProjectShellRouteParams | null {
  if (!isProjectRouteTarget(route)) {
    return null
  }

  return getProjectRoute(workspaces, route.orgSlug, route.workspaceSlug, route.projectSlug, route.viewId)
}

export function getDefaultProjectRoute(workspaces: WorkspaceSummary[]): ProjectShellRouteParams | null {
  const workspace = workspaces.find(isRoutableWorkspace) ?? null
  if (!workspace) return null
  const project = resolveDefaultProject(workspace)
  if (!project) return null
  const view = resolveProjectView(project)
  if (!view) return null

  return {
    orgSlug: workspace.organizationSlug,
    projectSlug: project.slug,
    viewId: view.id,
    viewType: view.viewType,
    workspaceSlug: workspace.slug,
  }
}

export function getWorkspaceRoute(
  workspaces: WorkspaceSummary[],
  orgSlug: string,
  workspaceSlug: string,
  preferredView?: string,
): ProjectShellRouteParams | null {
  if (!isValidRouteSegment(orgSlug) || !isValidRouteSegment(workspaceSlug)) return null
  const workspace = getMatchingWorkspace(workspaces, orgSlug, workspaceSlug)
  if (!isRoutableWorkspace(workspace)) return null
  const project = resolveDefaultProject(workspace)
  if (!project) return null
  const view = resolveProjectView(project, preferredView)
  if (!view) return null

  return {
    orgSlug: workspace.organizationSlug,
    projectSlug: project.slug,
    viewId: view.id,
    viewType: view.viewType,
    workspaceSlug: workspace.slug,
  }
}

export function getProjectRoute(
  workspaces: WorkspaceSummary[],
  orgSlug: string,
  workspaceSlug: string,
  projectSlug: string,
  preferredView?: string,
): ProjectShellRouteParams | null {
  if (!isValidRouteSegment(orgSlug) || !isValidRouteSegment(workspaceSlug) || !isValidRouteSegment(projectSlug)) {
    return null
  }

  const workspace = getMatchingWorkspace(workspaces, orgSlug, workspaceSlug)
  if (!isRoutableWorkspace(workspace)) return null
  const project = workspace.projects.find((item) => item.slug === projectSlug)
  if (!isRoutableProject(project)) return null
  const view = resolveProjectView(project, preferredView)
  if (!view) return null

  return {
    orgSlug: workspace.organizationSlug,
    projectSlug: project.slug,
    viewId: view.id,
    viewType: view.viewType,
    workspaceSlug: workspace.slug,
  }
}
