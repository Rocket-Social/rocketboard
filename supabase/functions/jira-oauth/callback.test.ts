import {describe, expect, it} from 'vitest'

import type {AtlassianAccessibleResource} from './resource'
import {
  buildPendingJiraSiteSelection,
  parseJiraSiteChoices,
  resolveJiraCallbackResourceDecision,
} from './callback'

function resource(overrides: Partial<AtlassianAccessibleResource> = {}): AtlassianAccessibleResource {
  return {
    id: 'cloud-1',
    name: 'Example Org',
    scopes: ['read:jira-work'],
    url: 'https://example.atlassian.net/',
    ...overrides,
  }
}

describe('jira-oauth callback behavior helpers', () => {
  it('selects the direct connect branch for one matching Jira resource', () => {
    const jira = resource()

    expect(resolveJiraCallbackResourceDecision([jira])).toEqual({
      resource: jira,
      status: 'connect',
    })
  })

  it('selects the explicit site picker branch for multiple matching Jira resources', () => {
    const first = resource({id: 'cloud-1', name: 'Example Org', url: 'https://example.atlassian.net'})
    const second = resource({id: 'cloud-2', name: 'Rocketboard', url: 'https://rocketboard.atlassian.net'})

    expect(resolveJiraCallbackResourceDecision([first, second])).toEqual({
      resources: [first, second],
      status: 'select_site',
    })
  })

  it('builds the pending selection payload with encrypted tokens and normalized site choices', () => {
    expect(buildPendingJiraSiteSelection({
      accountEmail: 'jk@example.com',
      accountId: 'atlassian-account-1',
      encryptedAccessToken: 'encrypted-access',
      encryptedRefreshToken: 'encrypted-refresh',
      expiresAt: '2026-05-03T17:30:00.000Z',
      organizationId: 'org-1',
      requestedBy: 'user-1',
      resources: [
        resource({id: 'cloud-1', name: 'Example Org', url: 'https://example.atlassian.net/'}),
      ],
      scopes: ['read:jira-work', 'read:jira-user'],
      state: 'state-1',
      tokenExpiresAt: '2026-05-03T18:00:00.000Z',
    })).toEqual({
      account_email: 'jk@example.com',
      account_id: 'atlassian-account-1',
      encrypted_access_token: 'encrypted-access',
      encrypted_refresh_token: 'encrypted-refresh',
      expires_at: '2026-05-03T17:30:00.000Z',
      organization_id: 'org-1',
      requested_by: 'user-1',
      resources: [{
        cloud_id: 'cloud-1',
        site_name: 'Example Org',
        site_url: 'https://example.atlassian.net',
      }],
      scopes: ['read:jira-work', 'read:jira-user'],
      state: 'state-1',
      token_expires_at: '2026-05-03T18:00:00.000Z',
    })
  })

  it('returns a redacted diagnostic summary for no-match callbacks', () => {
    expect(resolveJiraCallbackResourceDecision([
      resource({scopes: ['read:me'], url: 'https://example.atlassian.net'}),
      resource({scopes: ['read:confluence-content.all'], url: 'https://docs.atlassian.net'}),
    ])).toEqual({
      status: 'error',
      summary: {
        atlassianNetResources: 2,
        resources: 2,
        scopeFamilies: ['confluence', 'identity'],
      },
    })
  })

  it('normalizes pending site choices read back from storage', () => {
    expect(parseJiraSiteChoices([{
      cloud_id: 'cloud-1',
      site_name: 'Example Org',
      site_url: 'https://example.atlassian.net/',
    }])).toEqual([{
      cloud_id: 'cloud-1',
      site_name: 'Example Org',
      site_url: 'https://example.atlassian.net',
    }])
  })
})
