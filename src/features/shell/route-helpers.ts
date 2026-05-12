import type {ProjectViewType} from '../projects/project-view.model'

const viewTypeToSegmentMap: Record<ProjectViewType, string> = {
  canvas: 'canvas',
  document: 'doc',
  gantt: 'gantt',
  github: 'github',
  kanban: 'board',
  overview: 'overview',
  table: 'table',
}

const segmentToViewTypeMap: Record<string, ProjectViewType> = {}
for (const [viewType, segment] of Object.entries(viewTypeToSegmentMap)) {
  segmentToViewTypeMap[segment] = viewType as ProjectViewType
}

export function viewTypeToSegment(viewType: ProjectViewType): string {
  return viewTypeToSegmentMap[viewType] ?? viewType
}

export function segmentToViewType(segment: string): ProjectViewType | null {
  return segmentToViewTypeMap[segment] ?? null
}

export const orgRoutePrefix = '/org/$orgSlug' as const
export const orgSettingsRoutePath = `${orgRoutePrefix}/settings` as const
export const orgApiKeysRoutePath = `${orgRoutePrefix}/settings/api-keys` as const
export const orgWikiRoutePath = `${orgRoutePrefix}/wiki/$` as const
export const workspaceRoutePrefix = `${orgRoutePrefix}/workspaces/$workspaceSlug` as const
export const workspaceTrashRoutePath = `${workspaceRoutePrefix}/trash` as const
export const workspaceArchiveRoutePath = `${workspaceRoutePrefix}/archive` as const
export const workspaceAccessRoutePath = `${workspaceRoutePrefix}/access` as const
export const workspaceInitiativesRoutePath = `${workspaceRoutePrefix}/initiatives` as const
export const workspaceInitiativeDetailRoutePath = `${workspaceInitiativesRoutePath}/$initiativeId` as const
export const workspacePlanDetailRoutePath = `${workspaceRoutePrefix}/plans/$planId` as const
export const projectLayoutRoutePath = `${workspaceRoutePrefix}/projects/$projectSlug` as const
export const projectAccessRoutePath = `${projectLayoutRoutePath}/access` as const

function encodeRouteSegment(value: string) {
  return encodeURIComponent(value)
}

function normalizeWikiPath(value: string | null | undefined) {
  const trimmed = value?.trim().replace(/^\/+|\/+$/g, '')
  return trimmed ? trimmed.split('/').map(encodeRouteSegment).join('/') : ''
}

export function buildOrgSettingsHref(orgSlug: string) {
  return `/org/${encodeRouteSegment(orgSlug)}/settings`
}

export function buildOrgApiKeysHref(orgSlug: string) {
  return `/org/${encodeRouteSegment(orgSlug)}/settings/api-keys`
}

export function buildOrgWikiHref(orgSlug: string, pagePath = '') {
  const normalizedPagePath = normalizeWikiPath(pagePath)
  return normalizedPagePath
    ? `/org/${encodeRouteSegment(orgSlug)}/wiki/${normalizedPagePath}`
    : `/org/${encodeRouteSegment(orgSlug)}/wiki/`
}

export function buildWorkspaceBaseHref(orgSlug: string, workspaceSlug: string) {
  return `/org/${encodeRouteSegment(orgSlug)}/workspaces/${encodeRouteSegment(workspaceSlug)}`
}

export function buildProjectBaseHref(orgSlug: string, workspaceSlug: string, projectSlug: string) {
  return `${buildWorkspaceBaseHref(orgSlug, workspaceSlug)}/projects/${encodeRouteSegment(projectSlug)}`
}

export function buildProjectAccessHref(orgSlug: string, workspaceSlug: string, projectSlug: string) {
  return `${buildProjectBaseHref(orgSlug, workspaceSlug, projectSlug)}/access`
}

export function buildWorkspaceAccessHref(orgSlug: string, workspaceSlug: string) {
  return `${buildWorkspaceBaseHref(orgSlug, workspaceSlug)}/access`
}

export function buildWorkspaceArchiveHref(orgSlug: string, workspaceSlug: string) {
  return `${buildWorkspaceBaseHref(orgSlug, workspaceSlug)}/archive`
}

export function buildWorkspaceTrashHref(orgSlug: string, workspaceSlug: string) {
  return `${buildWorkspaceBaseHref(orgSlug, workspaceSlug)}/trash`
}

export function buildWorkspaceInitiativesHref(orgSlug: string, workspaceSlug: string) {
  return `${buildWorkspaceBaseHref(orgSlug, workspaceSlug)}/initiatives`
}

export function buildWorkspaceInitiativeHref(orgSlug: string, workspaceSlug: string, initiativeId: string) {
  return `${buildWorkspaceInitiativesHref(orgSlug, workspaceSlug)}/${encodeRouteSegment(initiativeId)}`
}

export function buildWorkspacePlanHref(orgSlug: string, workspaceSlug: string, planId: string) {
  return `${buildWorkspaceBaseHref(orgSlug, workspaceSlug)}/plans/${encodeRouteSegment(planId)}`
}
