import {describe, expect, it} from 'vitest'

import {
  type AtlassianAccessibleResource,
  findJiraCloudResources,
  hasJiraWorkScope,
  isJiraCloudResource,
  resolveJiraCloudResource,
  summarizeAccessibleResources,
} from './resource'

function resource(overrides: Partial<AtlassianAccessibleResource> = {}): AtlassianAccessibleResource {
  return {
    id: 'cloud-1',
    name: 'Example Org',
    scopes: ['read:jira-work'],
    url: 'https://example.atlassian.net',
    ...overrides,
  }
}

describe('jira-oauth resource matching', () => {
  it('accepts Jira resources with read:jira-work', () => {
    expect(isJiraCloudResource(resource({scopes: ['read:jira-work']}))).toBe(true)
  })

  it('accepts Jira resources with classic jira-work', () => {
    expect(isJiraCloudResource(resource({scopes: ['jira-work']}))).toBe(true)
  })

  it('rejects write-only Jira resources because sync needs read access', () => {
    expect(hasJiraWorkScope(['write:jira-work'])).toBe(false)
    expect(isJiraCloudResource(resource({scopes: ['write:jira-work']}))).toBe(false)
  })

  it('rejects non-Jira resources', () => {
    expect(isJiraCloudResource(resource({
      scopes: ['read:jira-work'],
      url: 'https://example.atlassian.com',
    }))).toBe(false)
  })

  it('rejects Jira resources without Jira work scope', () => {
    expect(isJiraCloudResource(resource({scopes: ['read:me', 'read:jira-user']}))).toBe(false)
  })

  it('returns all matching Jira resources instead of picking an arbitrary first site', () => {
    const matching = resource({id: 'cloud-2', scopes: ['jira-work'], url: 'https://example.atlassian.net/'})

    expect(findJiraCloudResources([
      resource({id: 'cloud-1', scopes: ['read:me'], url: 'https://example.atlassian.net'}),
      matching,
    ])).toEqual([matching])
  })

  it('requires explicit selection when multiple Jira resources match', () => {
    const first = resource({id: 'cloud-1', scopes: ['jira-work'], url: 'https://one.atlassian.net'})
    const second = resource({id: 'cloud-2', scopes: ['read:jira-work'], url: 'https://two.atlassian.net'})

    expect(resolveJiraCloudResource([first, second])).toEqual({
      resources: [first, second],
      status: 'multiple',
    })
  })

  it('summarizes only redacted counts and scope families for diagnostics', () => {
    expect(summarizeAccessibleResources([
      resource({scopes: ['jira-work'], url: 'https://example.atlassian.net/'}),
      resource({scopes: ['read:confluence-content.all'], url: 'https://docs.atlassian.net/'}),
    ])).toEqual({
      atlassianNetResources: 2,
      resources: 2,
      scopeFamilies: ['confluence', 'jira'],
    })
  })
})
