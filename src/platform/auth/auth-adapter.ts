import type {
  AuthChangeEvent,
  AuthResponse,
  OAuthResponse,
  Session,
  Subscription,
  User,
} from '@supabase/supabase-js'

import {getSupabaseBrowserClient} from '../supabase/client'

export type AuthSession = Session
export type AuthUser = User
export type AuthStateChangeSubscription = Subscription
export type GetAccessTokenOptions = {
  forceRefresh?: boolean
}

const ACCESS_TOKEN_REFRESH_BUFFER_SECONDS = 60

function isSessionAccessTokenUsable(session: Session | null | undefined) {
  if (!session?.access_token) {
    return false
  }

  if (!session.expires_at) {
    return true
  }

  const nowInSeconds = Math.floor(Date.now() / 1000)
  return session.expires_at > nowInSeconds + ACCESS_TOKEN_REFRESH_BUFFER_SECONDS
}

export const authAdapter = {
  async getAccessToken(options: GetAccessTokenOptions = {}) {
    const auth = getSupabaseBrowserClient().auth
    const {data: sessionData} = await auth.getSession()
    const currentSession = sessionData.session

    if (!options.forceRefresh) {
      if (isSessionAccessTokenUsable(currentSession)) {
        return currentSession!.access_token
      }
    }

    const {data: refreshedData, error: refreshError} = await auth.refreshSession()
    const refreshedSession = refreshedData.session

    if (!refreshError && isSessionAccessTokenUsable(refreshedSession)) {
      return refreshedSession!.access_token
    }

    if (isSessionAccessTokenUsable(currentSession)) {
      return currentSession!.access_token
    }

    return null
  },
  getSession() {
    return getSupabaseBrowserClient().auth.getSession()
  },
  getUser() {
    return getSupabaseBrowserClient().auth.getUser()
  },
  getUserIdentities() {
    return getSupabaseBrowserClient().auth.getUserIdentities()
  },
  linkIdentity(options: {
    options?: {
      redirectTo?: string
      skipBrowserRedirect?: boolean
    }
    provider: 'google'
  }): Promise<OAuthResponse> {
    return getSupabaseBrowserClient().auth.linkIdentity(options)
  },
  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void): AuthStateChangeSubscription {
    const {data} = getSupabaseBrowserClient().auth.onAuthStateChange(callback)
    return data.subscription
  },
  resetPasswordForEmail(email: string, options?: {redirectTo?: string}): Promise<{data: object; error: null} | {data: null; error: Error}> {
    return getSupabaseBrowserClient().auth.resetPasswordForEmail(email, options)
  },
  signInWithOAuth(options: {
    options?: {
      redirectTo?: string
      skipBrowserRedirect?: boolean
    }
    provider: 'google'
  }): Promise<OAuthResponse> {
    return getSupabaseBrowserClient().auth.signInWithOAuth(options)
  },
  signInWithOtp(options: {email: string; options?: {emailRedirectTo?: string}}) {
    return getSupabaseBrowserClient().auth.signInWithOtp(options)
  },
  signInWithPassword(credentials: {email: string; password: string}): Promise<AuthResponse> {
    return getSupabaseBrowserClient().auth.signInWithPassword(credentials)
  },
  signOut() {
    return getSupabaseBrowserClient().auth.signOut()
  },
  signUp(credentials: {
    email: string
    options?: {
      data?: {
        full_name?: string
        name?: string
      }
    }
    password: string
  }): Promise<AuthResponse> {
    return getSupabaseBrowserClient().auth.signUp(credentials)
  },
  updateUser(attributes: {
    data?: {
      full_name?: string
      name?: string
    }
    password?: string
  }) {
    return getSupabaseBrowserClient().auth.updateUser(attributes)
  },
}
