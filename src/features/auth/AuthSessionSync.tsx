import {useQueryClient} from '@tanstack/react-query'
import {useEffect} from 'react'

import {authAdapter} from '../../platform/auth/auth-adapter'
import {identifyUser, resetIdentity} from '../../platform/monitoring'
import {acceptInviteRoutePath} from '../setup/setup.routes'
import {buildLoginHref, clearGoogleOAuthFlow, getCurrentLocationHref} from './auth-flow'
import {authCallbackRoutePath, loginRoutePath, resetPasswordRoutePath} from './auth.routes'
import {sessionQueryOptions, type SessionState} from './data'
import {fetchInternalAdminFlag, mapSupabaseSession} from './session.repository'

function shouldRedirectToLogin(pathname: string) {
  if (
    pathname === loginRoutePath
    || pathname === resetPasswordRoutePath
    || pathname === authCallbackRoutePath
  ) {
    return false
  }

  return !pathname.startsWith(acceptInviteRoutePath.replace('$inviteToken', ''))
}

function isExactQueryKeyMatch(left: readonly unknown[], right: readonly unknown[]) {
  return left.length === right.length && left.every((segment, index) => segment === right[index])
}

export function AuthSessionSync() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const sessionQueryKey = sessionQueryOptions().queryKey
    const authListener = authAdapter.onAuthStateChange((event, session) => {
      // Preserve isInternalAdmin flag — check it async, update immediately with current value
      const currentSession = queryClient.getQueryData<SessionState>(sessionQueryKey)
      const currentAdminFlag = currentSession?.status === 'authenticated'
        ? currentSession.user.isInternalAdmin
        : false
      queryClient.setQueryData(sessionQueryKey, mapSupabaseSession(session, currentAdminFlag))
      // Refresh the admin flag in the background if we have a session
      if (session?.user) {
        void fetchInternalAdminFlag().then((isAdmin) => {
          if (isAdmin !== currentAdminFlag) {
            queryClient.setQueryData(sessionQueryKey, mapSupabaseSession(session, isAdmin))
          }
        })
      }

      if (session) {
        identifyUser(session.user.id, {email: session.user.email})
        return
      }

      if (event === 'SIGNED_OUT') {
        clearGoogleOAuthFlow()
        resetIdentity()
      }

      queryClient.removeQueries({
        predicate: (query) => !isExactQueryKeyMatch(query.queryKey, sessionQueryKey),
      })

      if (typeof window !== 'undefined' && shouldRedirectToLogin(window.location.pathname)) {
        window.location.assign(buildLoginHref(getCurrentLocationHref()))
      }
    })

    return () => {
      authListener.unsubscribe()
    }
  }, [queryClient])

  return null
}
