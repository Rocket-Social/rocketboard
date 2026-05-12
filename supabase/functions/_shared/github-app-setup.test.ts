import {generateKeyPairSync, webcrypto} from 'node:crypto'

import {beforeAll, describe, expect, it, vi} from 'vitest'

import {
  buildGitHubAppStatusPayload,
  getGitHubAppConfigStatus,
  getGitHubAppDerivedValues,
} from './github-app-setup'

const {privateKey: validPrivateKey} = generateKeyPairSync('rsa', {
  modulusLength: 1024,
  privateKeyEncoding: {
    format: 'pem',
    type: 'pkcs8',
  },
})

const baseEnv = {
  appUrl: 'https://app.example.com',
  githubAppId: '12345',
  githubAppPrivateKey: validPrivateKey,
  githubAppSlug: 'rocketboard-staging',
  githubWebhookSecret: 'secret',
  supabaseUrl: 'https://example.supabase.co',
}

describe('github app setup helpers', () => {
  beforeAll(() => {
    vi.stubGlobal('crypto', webcrypto)
  })

  it('marks all secrets missing when no deployment config exists', async () => {
    await expect(getGitHubAppConfigStatus({
      ...baseEnv,
      githubAppId: '',
      githubAppPrivateKey: null,
      githubAppSlug: '   ',
      githubWebhookSecret: undefined,
    })).resolves.toEqual({
      installable: false,
      invalid_secrets: [],
      missing_secrets: [
        'GITHUB_APP_ID',
        'GITHUB_APP_PRIVATE_KEY',
        'GITHUB_APP_SLUG',
        'GITHUB_WEBHOOK_SECRET',
      ],
      present_secrets: [],
    })
  })

  it('reports partial configuration accurately', async () => {
    await expect(getGitHubAppConfigStatus({
      ...baseEnv,
      githubAppPrivateKey: '',
      githubWebhookSecret: '',
    })).resolves.toEqual({
      installable: false,
      invalid_secrets: [],
      missing_secrets: ['GITHUB_APP_PRIVATE_KEY', 'GITHUB_WEBHOOK_SECRET'],
      present_secrets: ['GITHUB_APP_ID', 'GITHUB_APP_SLUG'],
    })
  })

  it('marks the deployment installable when all secrets are present and valid', async () => {
    await expect(getGitHubAppConfigStatus(baseEnv)).resolves.toEqual({
      installable: true,
      invalid_secrets: [],
      missing_secrets: [],
      present_secrets: [
        'GITHUB_APP_ID',
        'GITHUB_APP_PRIVATE_KEY',
        'GITHUB_APP_SLUG',
        'GITHUB_WEBHOOK_SECRET',
      ],
    })
  })

  it('treats an unusable private key as invalid configuration', async () => {
    await expect(getGitHubAppConfigStatus({
      ...baseEnv,
      githubAppPrivateKey: '-----BEGIN PRIVATE KEY-----not-valid-----END PRIVATE KEY-----',
    })).resolves.toEqual({
      installable: false,
      invalid_secrets: ['GITHUB_APP_PRIVATE_KEY'],
      missing_secrets: [],
      present_secrets: [
        'GITHUB_APP_ID',
        'GITHUB_APP_SLUG',
        'GITHUB_WEBHOOK_SECRET',
      ],
    })
  })

  it('reports an invalid private key even before the app id is configured', async () => {
    await expect(getGitHubAppConfigStatus({
      ...baseEnv,
      githubAppId: '',
      githubAppPrivateKey: '-----BEGIN PRIVATE KEY-----not-valid-----END PRIVATE KEY-----',
    })).resolves.toEqual({
      installable: false,
      invalid_secrets: ['GITHUB_APP_PRIVATE_KEY'],
      missing_secrets: ['GITHUB_APP_ID'],
      present_secrets: [
        'GITHUB_APP_SLUG',
        'GITHUB_WEBHOOK_SECRET',
      ],
    })
  })

  it('derives GitHub App URLs from app and Supabase base URLs', () => {
    expect(getGitHubAppDerivedValues(baseEnv)).toEqual({
      callback_url: 'https://app.example.com/integrations/github/callback',
      homepage_url: 'https://app.example.com',
      setup_url: 'https://example.supabase.co/functions/v1/github-install',
      webhook_url: 'https://example.supabase.co/functions/v1/github-webhook',
    })
  })

  it('includes connected installation metadata in the readiness payload', async () => {
    await expect(buildGitHubAppStatusPayload({
      env: baseEnv,
      installation: {
        account_avatar_url: 'https://avatars.githubusercontent.com/u/1',
        account_login: 'lila',
        account_type: 'Organization',
        created_at: '2026-04-02T00:00:00.000Z',
        events: ['pull_request', 'pull_request_review', 'issue_comment', 'pull_request_review_comment', 'push', 'installation'],
        id: 'source-1',
        installation_id: 42,
        permissions: {
          contents: 'read',
          issues: 'read',
          metadata: 'read',
          pull_requests: 'read',
        },
        updated_at: '2026-04-02T01:00:00.000Z',
      },
    })).resolves.toMatchObject({
      can_manage: true,
      connected: true,
      config: {
        installable: true,
        invalid_secrets: [],
        missing_secrets: [],
      },
      installation: {
        account_login: 'lila',
        events: ['pull_request', 'pull_request_review', 'issue_comment', 'pull_request_review_comment', 'push', 'installation'],
        installation_id: 42,
        permissions: {
          contents: 'read',
          issues: 'read',
          metadata: 'read',
          pull_requests: 'read',
        },
      },
      requirements: {
        events: ['pull_request', 'pull_request_review', 'issue_comment', 'pull_request_review_comment', 'push', 'installation'],
        permissions: ['Pull requests: Read', 'Issues: Read', 'Contents: Read', 'Metadata: Read'],
      },
    })
  })
})
