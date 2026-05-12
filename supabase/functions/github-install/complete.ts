import {
  createGitHubAppJwt,
  GitHubAppCryptoError,
} from '../_shared/github-crypto.ts'

export type GitHubConnectionInstallState = {
  expires_at: string
  organization_id: string
  requested_by: string
  return_path: string | null
  used_at: string | null
}

export type GitHubInstallationDetails = {
  account: {avatar_url: string | null; login: string; type: string}
  events?: unknown[]
  permissions?: Record<string, unknown>
}

export type GitHubInstallLookupErrorCode =
  | 'github_app_key_invalid'
  | 'github_app_jwt_sign_failed'
  | 'github_app_not_configured'
  | 'github_install_lookup_failed'

export type MarkInstallStateUsedResult = 'marked' | 'already_used' | 'error'

export type GitHubInstallLookupResult =
  | {
      data: GitHubInstallationDetails
      ok: true
    }
  | {
      error: GitHubInstallLookupErrorCode
      message: string
      ok: false
    }

export type GitHubInstallCompletionResult = {
  body: Record<string, unknown>
  status: number
}

type GitHubConnectionSourcePayload = {
  account_avatar_url: string | null
  account_login: string
  account_type: string
  auth_type: 'github_app'
  events: unknown[]
  installation_id: number
  installed_by: string
  last_validated_at: string
  organization_id: string
  owner_user_id: null
  permissions: Record<string, unknown>
  scope_type: 'organization'
  status: 'active'
  updated_at: string
}

export async function fetchInstallationDetailsFromGitHub(input: {
  appId: string
  fetchFn?: typeof fetch
  installationId: number
  privateKey: string
}): Promise<GitHubInstallLookupResult> {
  const fetchFn = input.fetchFn ?? fetch
  const genericMessage = 'Could not fetch installation details from GitHub.'

  try {
    const jwt = await createGitHubAppJwt({
      appId: input.appId,
      privateKey: input.privateKey,
    })

    const response = await fetchFn(`https://api.github.com/app/installations/${input.installationId}`, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${jwt}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })

    if (!response.ok) {
      console.error('[github-install] github_install_lookup_failed:', response.status)
      return {
        error: 'github_install_lookup_failed',
        message: genericMessage,
        ok: false,
      }
    }

    return {
      data: await response.json() as GitHubInstallationDetails,
      ok: true,
    }
  } catch (error) {
    if (error instanceof GitHubAppCryptoError) {
      console.error(`[github-install] ${error.code}:`, error.message)
      return {
        error: error.code,
        message: genericMessage,
        ok: false,
      }
    }

    console.error('[github-install] github_install_lookup_failed:', error)
    return {
      error: 'github_install_lookup_failed',
      message: genericMessage,
      ok: false,
    }
  }
}

function buildGitHubConnectionSourcePayload(input: {
  installationDetails: GitHubInstallationDetails
  installationId: number
  now: string
  organizationId: string
  userId: string
}): GitHubConnectionSourcePayload {
  return {
    account_avatar_url: input.installationDetails.account.avatar_url ?? null,
    account_login: input.installationDetails.account.login,
    account_type: input.installationDetails.account.type,
    auth_type: 'github_app',
    events: input.installationDetails.events ?? [],
    installation_id: input.installationId,
    installed_by: input.userId,
    last_validated_at: input.now,
    organization_id: input.organizationId,
    owner_user_id: null,
    permissions: input.installationDetails.permissions ?? {},
    scope_type: 'organization',
    status: 'active',
    updated_at: input.now,
  }
}

export async function completeGitHubAppInstallAction(input: {
  installationId: number
  state: string
  userId: string
}, dependencies: {
  canManageOrganization: (organizationId: string, userId: string) => Promise<boolean>
  fetchInstallState: (state: string) => Promise<GitHubConnectionInstallState | null>
  fetchInstallationDetails: (installationId: number) => Promise<GitHubInstallLookupResult>
  markInstallStateUsed: (state: string, usedAt: string) => Promise<MarkInstallStateUsedResult>
  now?: () => string
  // Must handle duplicate-callback races against the partial unique index on
  // github_connection_sources.installation_id (WHERE installation_id > 0).
  // A fetch-then-insert-or-update pre-check cannot prevent the race: both
  // callers can observe no existing row and then collide on insert. The
  // supabase wiring in github-install/index.ts does an insert-and-fall-back-
  // to-update-on-unique-violation dance; a real ON CONFLICT upsert would
  // also work if supabase-js ever emits the matching WHERE clause for partial
  // indexes.
  persistSource: (payload: GitHubConnectionSourcePayload) => Promise<boolean>
}): Promise<GitHubInstallCompletionResult> {
  const installState = await dependencies.fetchInstallState(input.state)

  if (!installState) {
    return {
      body: {
        error: 'invalid_state',
        message: 'GitHub install session was not found.',
      },
      status: 400,
    }
  }

  if (installState.used_at) {
    // State was already finalized by an earlier request. Be idempotent for
    // GitHub callback retries and browser refreshes so the user still sees a
    // success redirect. Gate on requester identity so a leaked state value
    // cannot redirect a different authenticated user.
    if (installState.requested_by !== input.userId) {
      return {
        body: {
          error: 'Forbidden',
          message: 'Only the user who initiated the install can complete it.',
        },
        status: 403,
      }
    }

    return {
      body: {
        return_path: installState.return_path ?? '/',
        success: true,
      },
      status: 200,
    }
  }

  if (new Date(String(installState.expires_at)).getTime() < Date.now()) {
    return {
      body: {
        error: 'expired_state',
        message: 'GitHub install session expired. Start the install again.',
      },
      status: 400,
    }
  }

  if (installState.requested_by !== input.userId) {
    return {
      body: {
        error: 'Forbidden',
        message: 'Only the user who initiated the install can complete it.',
      },
      status: 403,
    }
  }

  if (!(await dependencies.canManageOrganization(installState.organization_id, input.userId))) {
    return {
      body: {
        error: 'Forbidden',
        message: 'Only org admins can complete the GitHub App install.',
      },
      status: 403,
    }
  }

  const installationLookup = await dependencies.fetchInstallationDetails(input.installationId)
  if (!installationLookup.ok) {
    return {
      body: {
        error: installationLookup.error,
        message: installationLookup.message,
      },
      status: 500,
    }
  }

  const now = dependencies.now?.() ?? new Date().toISOString()
  const payload = buildGitHubConnectionSourcePayload({
    installationDetails: installationLookup.data,
    installationId: input.installationId,
    now,
    organizationId: installState.organization_id,
    userId: input.userId,
  })

  const persisted = await dependencies.persistSource(payload)

  if (!persisted) {
    return {
      body: {
        error: 'save_failed',
        message: 'Could not save GitHub App source.',
      },
      status: 500,
    }
  }

  const markResult = await dependencies.markInstallStateUsed(input.state, now)
  if (markResult === 'error') {
    return {
      body: {
        error: 'install_state_finalize_failed',
        message: 'GitHub install session could not be finalized. Please retry the install.',
      },
      status: 500,
    }
  }

  // Both 'marked' and 'already_used' succeed: persistSource is idempotent on
  // installation_id, so a concurrent callback that won the mark-used race still
  // left the source row in the correct state. Returning success avoids showing
  // the user a hard failure after the install was actually saved.
  return {
    body: {
      return_path: installState.return_path ?? '/',
      success: true,
    },
    status: 200,
  }
}
