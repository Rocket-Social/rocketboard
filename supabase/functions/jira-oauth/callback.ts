import {
  type AtlassianAccessibleResource,
  normalizeSiteUrl,
  resolveJiraCloudResource,
  summarizeAccessibleResources,
} from './resource.ts'

export type JiraSiteChoice = {
  cloud_id: string
  site_name: string
  site_url: string
}

export type JiraCallbackResourceDecision =
  | {
    resource: AtlassianAccessibleResource
    status: 'connect'
  }
  | {
    resources: AtlassianAccessibleResource[]
    status: 'select_site'
  }
  | {
    status: 'error'
    summary: ReturnType<typeof summarizeAccessibleResources>
  }

export type PendingJiraSiteSelectionInsert = {
  account_email: string | null
  account_id: string
  encrypted_access_token: string
  encrypted_refresh_token: string
  expires_at: string
  organization_id: string
  requested_by: string
  resources: JiraSiteChoice[]
  scopes: string[]
  state: string
  token_expires_at: string
}

export function resolveJiraCallbackResourceDecision(
  resources: AtlassianAccessibleResource[],
): JiraCallbackResourceDecision {
  const resolution = resolveJiraCloudResource(resources)

  if (resolution.status === 'none') {
    return {
      status: 'error',
      summary: summarizeAccessibleResources(resources),
    }
  }

  if (resolution.status === 'multiple') {
    return {
      resources: resolution.resources,
      status: 'select_site',
    }
  }

  return {
    resource: resolution.resource,
    status: 'connect',
  }
}

export function buildPendingJiraSiteSelection(input: {
  accountEmail: string | null
  accountId: string
  encryptedAccessToken: string
  encryptedRefreshToken: string
  expiresAt: string
  organizationId: string
  requestedBy: string
  resources: AtlassianAccessibleResource[]
  scopes: string[]
  state: string
  tokenExpiresAt: string
}): PendingJiraSiteSelectionInsert {
  return {
    account_email: input.accountEmail,
    account_id: input.accountId,
    encrypted_access_token: input.encryptedAccessToken,
    encrypted_refresh_token: input.encryptedRefreshToken,
    expires_at: input.expiresAt,
    organization_id: input.organizationId,
    requested_by: input.requestedBy,
    resources: input.resources.map(toJiraSiteChoice),
    scopes: input.scopes,
    state: input.state,
    token_expires_at: input.tokenExpiresAt,
  }
}

export function toJiraSiteChoice(resource: AtlassianAccessibleResource): JiraSiteChoice {
  return {
    cloud_id: resource.id,
    site_name: resource.name,
    site_url: normalizeSiteUrl(resource.url),
  }
}

export function parseJiraSiteChoices(value: unknown): JiraSiteChoice[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    if (
      typeof record.cloud_id !== 'string' ||
      typeof record.site_name !== 'string' ||
      typeof record.site_url !== 'string'
    ) {
      return []
    }

    return [{
      cloud_id: record.cloud_id,
      site_name: record.site_name,
      site_url: normalizeSiteUrl(record.site_url),
    }]
  })
}
