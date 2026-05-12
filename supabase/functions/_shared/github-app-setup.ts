import {GitHubAppCryptoError, importGitHubAppPrivateKey} from './github-crypto.ts'

export const REQUIRED_GITHUB_APP_SECRETS = [
  'GITHUB_APP_ID',
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_APP_SLUG',
  'GITHUB_WEBHOOK_SECRET',
] as const

export const REQUIRED_GITHUB_APP_PERMISSIONS = [
  'Pull requests: Read',
  'Issues: Read',
  'Contents: Read',
  'Metadata: Read',
] as const

export const REQUIRED_GITHUB_APP_EVENTS = [
  'pull_request',
  'pull_request_review',
  'issue_comment',
  'pull_request_review_comment',
  'push',
  'installation',
] as const

export type GitHubAppSetupEnv = {
  appUrl: string
  githubAppId: string | null | undefined
  githubAppPrivateKey: string | null | undefined
  githubAppSlug: string | null | undefined
  githubWebhookSecret: string | null | undefined
  supabaseUrl: string
}

export type GitHubAppInstallationSummary = {
  account_avatar_url: string | null
  account_login: string
  account_type: string
  created_at: string
  events: unknown[]
  id: string
  installation_id: number
  permissions: Record<string, unknown>
  updated_at: string
}

export type GitHubAppConfigStatus = {
  installable: boolean
  invalid_secrets: string[]
  missing_secrets: string[]
  present_secrets: string[]
}

function normalizeEnvValue(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

// Cache of per-key validity results so repeated readiness/status checks don't
// re-run WebCrypto importKey on every request. Keyed by the PEM string itself
// since it uniquely identifies the key material for this isolate's lifetime.
const privateKeyValidityCache = new Map<string, boolean>()

async function isGitHubAppPrivateKeyValid(privateKey: string): Promise<boolean> {
  const cached = privateKeyValidityCache.get(privateKey)
  if (cached !== undefined) {
    return cached
  }

  let valid: boolean
  try {
    await importGitHubAppPrivateKey(privateKey)
    valid = true
  } catch (error) {
    if (!(error instanceof GitHubAppCryptoError)) {
      throw error
    }
    valid = false
  }

  privateKeyValidityCache.set(privateKey, valid)
  return valid
}

export async function getGitHubAppConfigStatus(env: GitHubAppSetupEnv): Promise<GitHubAppConfigStatus> {
  const secretValues = {
    GITHUB_APP_ID: normalizeEnvValue(env.githubAppId),
    GITHUB_APP_PRIVATE_KEY: normalizeEnvValue(env.githubAppPrivateKey),
    GITHUB_APP_SLUG: normalizeEnvValue(env.githubAppSlug),
    GITHUB_WEBHOOK_SECRET: normalizeEnvValue(env.githubWebhookSecret),
  } as const

  const invalidSecrets = new Set<string>()

  if (secretValues.GITHUB_APP_PRIVATE_KEY) {
    const valid = await isGitHubAppPrivateKeyValid(secretValues.GITHUB_APP_PRIVATE_KEY)
    if (!valid) {
      invalidSecrets.add('GITHUB_APP_PRIVATE_KEY')
    }
  }

  const missingSecrets = REQUIRED_GITHUB_APP_SECRETS.filter((key) => !secretValues[key])
  const presentSecrets = REQUIRED_GITHUB_APP_SECRETS.filter((key) => Boolean(secretValues[key]) && !invalidSecrets.has(key))
  const invalidSecretList = REQUIRED_GITHUB_APP_SECRETS.filter((key) => invalidSecrets.has(key))

  return {
    installable: missingSecrets.length === 0 && invalidSecretList.length === 0,
    invalid_secrets: invalidSecretList,
    missing_secrets: missingSecrets,
    present_secrets: presentSecrets,
  }
}

export function getGitHubAppDerivedValues(env: Pick<GitHubAppSetupEnv, 'appUrl' | 'supabaseUrl'>) {
  const appUrl = normalizeEnvValue(env.appUrl) ?? 'https://rocketboard.app'
  const supabaseUrl = normalizeEnvValue(env.supabaseUrl) ?? ''

  return {
    callback_url: `${appUrl}/integrations/github/callback`,
    homepage_url: appUrl,
    setup_url: `${supabaseUrl}/functions/v1/github-install`,
    webhook_url: `${supabaseUrl}/functions/v1/github-webhook`,
  }
}

export async function buildGitHubAppStatusPayload(input: {
  env: GitHubAppSetupEnv
  installation: GitHubAppInstallationSummary | null
}) {
  const config = await getGitHubAppConfigStatus(input.env)

  return {
    can_manage: true,
    config,
    connected: Boolean(input.installation),
    derived: getGitHubAppDerivedValues(input.env),
    installation: input.installation,
    requirements: {
      events: [...REQUIRED_GITHUB_APP_EVENTS],
      permissions: [...REQUIRED_GITHUB_APP_PERMISSIONS],
    },
  }
}
