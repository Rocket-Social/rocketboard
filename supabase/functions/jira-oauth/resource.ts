export type AtlassianAccessibleResource = {
  id: string
  name: string
  scopes: string[]
  url: string
}

const JIRA_WORK_SCOPE_VARIANTS = new Set([
  'jira-work',
  'read:jira-work',
])

export type JiraCloudResourceResolution =
  | {resources: AtlassianAccessibleResource[]; status: 'multiple'}
  | {resource: AtlassianAccessibleResource; status: 'single'}
  | {status: 'none'}

export function findJiraCloudResources(resources: AtlassianAccessibleResource[]) {
  return resources.filter(isJiraCloudResource)
}

export function resolveJiraCloudResource(resources: AtlassianAccessibleResource[]): JiraCloudResourceResolution {
  const candidates = findJiraCloudResources(resources)

  if (candidates.length === 0) return {status: 'none'}
  if (candidates.length === 1) return {resource: candidates[0], status: 'single'}
  return {resources: candidates, status: 'multiple'}
}

export function isJiraCloudResource(resource: AtlassianAccessibleResource) {
  return normalizeSiteUrl(resource.url).endsWith('.atlassian.net') && hasJiraWorkScope(resource.scopes)
}

export function hasJiraWorkScope(scopes: string[]) {
  return scopes.some((scope) => JIRA_WORK_SCOPE_VARIANTS.has(scope))
}

export function summarizeAccessibleResources(resources: AtlassianAccessibleResource[]) {
  return {
    atlassianNetResources: resources.filter((resource) =>
      normalizeSiteUrl(resource.url).endsWith('.atlassian.net')
    ).length,
    resources: resources.length,
    scopeFamilies: Array.from(new Set(resources.flatMap((resource) =>
      resource.scopes.map(scopeFamily)
    ))).sort(),
  }
}

export function normalizeSiteUrl(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function scopeFamily(scope: string) {
  if (scope.includes('jira')) return 'jira'
  if (scope.includes('confluence')) return 'confluence'
  if (scope.includes('servicedesk')) return 'servicedesk'
  if (scope === 'read:me') return 'identity'
  if (scope === 'offline_access') return 'offline'
  return 'other'
}
