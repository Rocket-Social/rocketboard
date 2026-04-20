import {authAdapter, type AuthSession, type AuthUser} from '../../platform/auth/auth-adapter'
import {blobStore} from '../../platform/blob/blob-store'
import {rpcAdapter} from '../../platform/data/rpc-adapter'
import {resolveWeekStartsOn, type WeekStartsOn} from '../../lib/week-preferences'
import {
  buildAuthCallbackUrl,
  clearGoogleOAuthFlow,
  createGoogleOAuthFlow,
  persistGoogleOAuthFlow,
} from './auth-flow'
import {resetPasswordRoutePath} from './auth.routes'
import type {
  AccountPasswordInput,
  AccountPreferencesInput,
  AccountProfileInput,
  LinkGoogleIdentityInput,
  LoginCredentials,
  PasswordResetInput,
  RegistrationCredentials,
  SessionState,
  SessionUser,
} from './data'
import {minimumAccountPasswordLength} from './data'

export type SessionRepository = {
  getSession(): Promise<SessionState>
  linkGoogleIdentity(input: LinkGoogleIdentityInput): Promise<void>
  removeAccountAvatar(): Promise<SessionState>
  requestPasswordReset(input: PasswordResetInput): Promise<void>
  sendMagicLink(email: string): Promise<void>
  signInFromLoginScreen(credentials?: LoginCredentials): Promise<SessionState>
  signInWithGoogle(returnTo?: string): Promise<void>
  signUpFromLoginScreen(credentials: RegistrationCredentials): Promise<SessionState>
  signOut(): Promise<SessionState>
  uploadAccountAvatar(file: File): Promise<SessionState>
  updateAccountPassword(input: AccountPasswordInput): Promise<SessionState>
  updateAccountPreferences(input: AccountPreferencesInput): Promise<SessionState>
  updateAccountProfile(input: AccountProfileInput): Promise<SessionState>
}

function buildGoogleAuthStartError(intent: 'link' | 'sign-in', error: unknown) {
  if (error instanceof Error) {
    const normalizedMessage = error.message.trim().toLowerCase()

    if (
      normalizedMessage.includes('unsupported provider')
      || normalizedMessage.includes('provider is not enabled')
    ) {
      return new Error(
        intent === 'link'
          ? 'Google account linking is not enabled for this Supabase project. Enable Google under Authentication > Sign In / Providers, then try again.'
          : 'Google sign-in is not enabled for this Supabase project. Enable Google under Authentication > Sign In / Providers, or use email instead.',
      )
    }

    return error
  }

  return new Error(
    intent === 'link'
      ? 'Rocketboard could not start Google account linking.'
      : 'Rocketboard could not start Google sign-in.',
  )
}

function requireBrowserRedirectUrl(url: string | null | undefined, intent: 'link' | 'sign-in') {
  if (!url) {
    throw new Error(
      intent === 'link'
        ? 'Rocketboard could not start Google account linking.'
        : 'Rocketboard could not start Google sign-in.',
    )
  }

  if (typeof window === 'undefined') {
    throw new Error(
      intent === 'link'
        ? 'Google account linking must be started in a browser.'
        : 'Google sign-in must be started in a browser.',
    )
  }

  window.location.assign(url)
}

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean)

  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
  }

  return value.slice(0, 2).toUpperCase()
}

type CurrentProfileSummary = {
  avatarUrl: string | null
  githubLogin: string | null
  weekStartsOn: WeekStartsOn | null
}

function mapSupabaseUser(
  user: AuthUser,
  isInternalAdmin = false,
  githubLogin: string | null = null,
  weekStartsOn: WeekStartsOn | null = null,
  avatarUrl: string | null = null,
): SessionUser {
  const fallbackName = user.email?.split('@')[0] ?? 'Rocketboard User'
  const name =
    typeof user.user_metadata.full_name === 'string'
      ? user.user_metadata.full_name
      : typeof user.user_metadata.name === 'string'
        ? user.user_metadata.name
        : fallbackName
  const metadataAvatarUrl = typeof user.user_metadata.avatar_url === 'string' && user.user_metadata.avatar_url.trim()
    ? user.user_metadata.avatar_url
    : null

  return {
    avatarUrl: avatarUrl ?? metadataAvatarUrl,
    email: user.email ?? 'unknown@rocketboard.app',
    githubLogin,
    id: user.id,
    initials: getInitials(name),
    isInternalAdmin,
    name,
    weekStartsOn: resolveWeekStartsOn(weekStartsOn),
  }
}

export async function fetchInternalAdminFlag(): Promise<boolean> {
  try {
    return await rpcAdapter.call<boolean>('is_current_user_internal_admin')
  } catch {
    return false
  }
}

async function fetchCurrentProfileSummary(): Promise<CurrentProfileSummary> {
  try {
    return await rpcAdapter.callSingle<CurrentProfileSummary>('get_current_profile_settings') ?? {
      avatarUrl: null,
      githubLogin: null,
      weekStartsOn: null,
    }
  } catch {
    return {avatarUrl: null, githubLogin: null, weekStartsOn: null}
  }
}

export function mapSupabaseSession(
  session: AuthSession | null,
  isInternalAdmin = false,
  githubLogin: string | null = null,
  weekStartsOn: WeekStartsOn | null = null,
  avatarUrl: string | null = null,
): SessionState {
  if (!session?.user) {
    return {status: 'anonymous'}
  }

  return {
    status: 'authenticated',
    user: mapSupabaseUser(session.user, isInternalAdmin, githubLogin, weekStartsOn, avatarUrl),
  }
}

async function requireAuthenticatedSupabaseUser() {
  const {data, error} = await authAdapter.getUser()

  if (error) {
    throw error
  }

  if (!data.user) {
    throw new Error('You need to be signed in to manage this account.')
  }

  return data.user
}

async function upsertCurrentProfile(
  input: {
    avatarUrl?: string | null
    fullName: string | null
    githubLogin?: string | null
  },
  options?: {bestEffort?: boolean},
) {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const params: Record<string, unknown> = {
        target_full_name: input.fullName,
      }
      if (input.githubLogin !== undefined) {
        params.target_github_login = input.githubLogin
      }
      if (input.avatarUrl !== undefined) {
        params.target_avatar_url = input.avatarUrl
      }

      await rpcAdapter.call('upsert_current_profile', params)
      return true
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Profile setup could not be completed.')
    }
  }

  if (options?.bestEffort) {
    console.error('Rocketboard could not persist the initial profile row during sign-up.', lastError)
    return false
  }

  throw lastError ?? new Error('Profile setup could not be completed.')
}

async function buildAuthenticatedSession(user: AuthUser): Promise<SessionState> {
  const [isInternalAdmin, profileSummary] = await Promise.all([
    fetchInternalAdminFlag(),
    fetchCurrentProfileSummary(),
  ])

  return {
    status: 'authenticated',
    user: mapSupabaseUser(
      user,
      isInternalAdmin,
      profileSummary.githubLogin,
      profileSummary.weekStartsOn,
      profileSummary.avatarUrl,
    ),
  }
}

const maximumAccountAvatarSizeBytes = 5 * 1024 * 1024

function validateAccountAvatar(file: File) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose a PNG, JPG, WebP, or other image file.')
  }

  if (file.size > maximumAccountAvatarSizeBytes) {
    throw new Error('Profile photos must be 5 MB or smaller.')
  }
}

function getPasswordResetRedirectUrl() {
  if (typeof window === 'undefined') {
    return null
  }

  return `${window.location.origin}${resetPasswordRoutePath}`
}

export const sessionRepository: SessionRepository = {
  async getSession() {
    const {data, error} = await authAdapter.getSession()

    if (error) {
      throw error
    }

    if (!data.session?.user) {
      return mapSupabaseSession(data.session)
    }

    const [isAdmin, profileSummary] = await Promise.all([
      fetchInternalAdminFlag(),
      fetchCurrentProfileSummary(),
    ])

    return mapSupabaseSession(
      data.session,
      isAdmin,
      profileSummary.githubLogin,
      profileSummary.weekStartsOn,
      profileSummary.avatarUrl,
    )
  },
  async linkGoogleIdentity(input) {
    const redirectTo = buildAuthCallbackUrl({
      oauthFlow: input.flowId,
      oauthNonce: input.redirectNonce,
      returnTo: input.returnTo,
    })
    try {
      const {data, error} = await authAdapter.linkIdentity({
        options: {
          ...(redirectTo ? {redirectTo} : {}),
          skipBrowserRedirect: true,
        },
        provider: 'google',
      })

      if (error) {
        throw error
      }

      requireBrowserRedirectUrl(data.url, 'link')
    } catch (error) {
      clearGoogleOAuthFlow()
      throw buildGoogleAuthStartError('link', error)
    }
  },
  async sendMagicLink(email) {
    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail) {
      throw new Error('Email is required.')
    }

    const callbackUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback`
      : null

    const {error} = await authAdapter.signInWithOtp({
      email: normalizedEmail,
      ...(callbackUrl ? {options: {emailRedirectTo: callbackUrl}} : {}),
    })

    if (error) {
      throw error
    }
  },
  async requestPasswordReset(input) {
    const normalizedEmail = input.email.trim().toLowerCase()

    if (!normalizedEmail) {
      throw new Error('Enter your email address first.')
    }

    const redirectTo = getPasswordResetRedirectUrl()
    const {error} = await authAdapter.resetPasswordForEmail(normalizedEmail, redirectTo ? {redirectTo} : undefined)

    if (error) {
      throw error
    }
  },
  async signInFromLoginScreen(credentials) {
    if (!credentials?.email || !credentials.password) {
      throw new Error('Email and password are required to sign in.')
    }

    const {data, error} = await authAdapter.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    })

    if (error) {
      throw error
    }

    if (!data.session?.user) {
      return mapSupabaseSession(data.session ?? null)
    }

    const [isAdmin, profileSummary] = await Promise.all([
      fetchInternalAdminFlag(),
      fetchCurrentProfileSummary(),
    ])

    return mapSupabaseSession(
      data.session ?? null,
      isAdmin,
      profileSummary.githubLogin,
      profileSummary.weekStartsOn,
      profileSummary.avatarUrl,
    )
  },
  async signInWithGoogle(returnTo) {
    const googleFlow = createGoogleOAuthFlow({
      phase: 'oauth-sign-in',
      returnTo,
    })
    const redirectTo = buildAuthCallbackUrl({
      oauthFlow: googleFlow.flowId,
      oauthNonce: googleFlow.redirectNonce,
      returnTo: googleFlow.returnTo,
    })
    persistGoogleOAuthFlow(googleFlow)
    try {
      const {data, error} = await authAdapter.signInWithOAuth({
        options: {
          ...(redirectTo ? {redirectTo} : {}),
          skipBrowserRedirect: true,
        },
        provider: 'google',
      })

      if (error) {
        throw error
      }

      requireBrowserRedirectUrl(data.url, 'sign-in')
    } catch (error) {
      clearGoogleOAuthFlow()
      throw buildGoogleAuthStartError('sign-in', error)
    }
  },
  async signOut() {
    const {error} = await authAdapter.signOut()

    if (error) {
      throw error
    }

    clearGoogleOAuthFlow()
    return {status: 'anonymous'}
  },
  async removeAccountAvatar() {
    const [user, profileSummary] = await Promise.all([
      requireAuthenticatedSupabaseUser(),
      fetchCurrentProfileSummary(),
    ])

    if (!profileSummary.avatarUrl) {
      return buildAuthenticatedSession(user)
    }

    await upsertCurrentProfile({
      avatarUrl: null,
      fullName: null,
    })

    try {
      await blobStore.removeProfileAvatar(profileSummary.avatarUrl)
    } catch (error) {
      console.error('Rocketboard could not delete the old profile avatar.', error)
    }

    return buildAuthenticatedSession(user)
  },
  async signUpFromLoginScreen(credentials) {
    const normalizedEmail = credentials.email.trim().toLowerCase()
    const normalizedFullName = credentials.fullName?.trim() ?? ''
    const normalizedPassword = credentials.password.trim()

    if (!normalizedEmail || !normalizedPassword) {
      throw new Error('Email and password are required to create an account.')
    }

    if (normalizedPassword.length < minimumAccountPasswordLength) {
      throw new Error(`Passwords must be at least ${minimumAccountPasswordLength} characters.`)
    }

    const {data, error} = await authAdapter.signUp({
      email: normalizedEmail,
      password: normalizedPassword,
      ...(normalizedFullName ? {
        options: {
          data: {
            full_name: normalizedFullName,
            name: normalizedFullName,
          },
        },
      } : {}),
    })

    if (error) {
      throw error
    }

    const user = data.user ?? data.session?.user

    if (!data.session || !user) {
      throw new Error('Email confirmation is required before you can continue.')
    }

    await upsertCurrentProfile({fullName: normalizedFullName}, {bestEffort: true})

    return buildAuthenticatedSession(user)
  },
  async uploadAccountAvatar(file) {
    validateAccountAvatar(file)

    const [user, profileSummary] = await Promise.all([
      requireAuthenticatedSupabaseUser(),
      fetchCurrentProfileSummary(),
    ])

    const uploadedAvatar = await blobStore.uploadProfileAvatar({
      file,
      userId: user.id,
    })

    try {
      await upsertCurrentProfile({
        avatarUrl: uploadedAvatar.publicUrl,
        fullName: null,
      })
    } catch (error) {
      await blobStore.removeProfileAvatar(uploadedAvatar.storagePath)
      throw error
    }

    if (profileSummary.avatarUrl && profileSummary.avatarUrl !== uploadedAvatar.publicUrl) {
      try {
        await blobStore.removeProfileAvatar(profileSummary.avatarUrl)
      } catch (error) {
        console.error('Rocketboard could not delete the replaced profile avatar.', error)
      }
    }

    return buildAuthenticatedSession(user)
  },
  async updateAccountPassword(input) {
    const normalizedPassword = input.password.trim()

    if (!normalizedPassword) {
      throw new Error('A new password is required.')
    }

    if (normalizedPassword.length < minimumAccountPasswordLength) {
      throw new Error(`Passwords must be at least ${minimumAccountPasswordLength} characters.`)
    }

    const {data, error} = await authAdapter.updateUser({
      password: normalizedPassword,
    })

    if (error) {
      throw error
    }

    const user = data.user ?? await requireAuthenticatedSupabaseUser()

    return buildAuthenticatedSession(user)
  },
  async updateAccountPreferences(input) {
    if (input.weekStartsOn !== 'monday' && input.weekStartsOn !== 'sunday') {
      throw new Error('Choose Sunday or Monday for the week start.')
    }

    await rpcAdapter.call('set_current_week_start', {
      target_week_starts_on: input.weekStartsOn,
    })

    const user = await requireAuthenticatedSupabaseUser()
    return buildAuthenticatedSession(user)
  },
  async updateAccountProfile(input) {
    const normalizedFullName = input.fullName.trim()
    const normalizedGithubLogin = input.githubLogin.trim().toLowerCase()

    if (!normalizedFullName) {
      throw new Error('Full name is required.')
    }

    const {data, error} = await authAdapter.updateUser({
      data: {
        full_name: normalizedFullName,
        name: normalizedFullName,
      },
    })

    if (error) {
      throw error
    }

    await upsertCurrentProfile({
      fullName: normalizedFullName,
      githubLogin: normalizedGithubLogin || null,
    })

    const user = data.user ?? await requireAuthenticatedSupabaseUser()

    return buildAuthenticatedSession(user)
  },
}
