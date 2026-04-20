import {AlertTriangle, ArrowRight, RefreshCcw} from 'lucide-react'
import {getRouteApi, useNavigate} from '@tanstack/react-router'
import {useQueryClient} from '@tanstack/react-query'
import {useEffect, useState} from 'react'

import {Button} from '../../components/ui/button'
import {authAdapter} from '../../platform/auth/auth-adapter'
import {
  buildAuthCallbackUrl,
  buildLoginHref,
  clearGoogleOAuthFlow,
  createGoogleOAuthFlow,
  isGoogleLinkCollisionRedirectError,
  isGoogleOAuthFlowMatch,
  openPostAuthDestination,
  persistGoogleOAuthFlow,
  readAuthRedirectResult,
  readGoogleOAuthFlow,
  type GoogleOAuthFlow,
} from './auth-flow'
import {authCallbackRoutePath} from './auth.routes'
import {sessionQueryOptions, type SessionState} from './data'
import {fetchInternalAdminFlag, mapSupabaseSession} from './session.repository'

const routeApi = getRouteApi(authCallbackRoutePath)
const googleIdentityPollDelaysMs = [0, 150, 250, 400, 700]

type CallbackErrorState = {
  canRetryLink: boolean
  kind: 'link' | 'sign-in'
  message: string
  returnTo?: string
}

function sleep(durationMs: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs)
  })
}

function hasAuthCallbackTokens() {
  if (typeof window === 'undefined') {
    return false
  }

  return (
    window.location.search.includes('code=')
    || window.location.hash.includes('access_token=')
    || window.location.hash.includes('refresh_token=')
  )
}

function getCallbackErrorKind(flow: GoogleOAuthFlow | null): CallbackErrorState['kind'] {
  return flow?.phase === 'oauth-link' ? 'link' : 'sign-in'
}

async function waitForGoogleIdentity() {
  let lastMessage: string | null = null

  for (const delayMs of googleIdentityPollDelaysMs) {
    if (delayMs > 0) {
      await sleep(delayMs)
    }

    const {data, error} = await authAdapter.getUserIdentities()

    if (error) {
      lastMessage = error.message
      continue
    }

    if (data.identities.some((identity: {provider?: string | null}) => identity.provider === 'google')) {
      return {
        linked: true,
        message: null,
      }
    }
  }

  return {
    linked: false,
    message: lastMessage ?? 'Google consent completed, but Rocketboard could not confirm the linked Google identity.',
  }
}

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const search = routeApi.useSearch()
  const [errorState, setErrorState] = useState<CallbackErrorState | null>(null)
  const [retryPending, setRetryPending] = useState(false)

  useEffect(() => {
    let active = true

    const finishOAuthFlow = async () => {
      const redirectResult = readAuthRedirectResult()
      const googleFlow = readGoogleOAuthFlow()
      const correlation = {
        oauthFlow: redirectResult?.oauthFlow ?? null,
        oauthNonce: redirectResult?.oauthNonce ?? null,
      }
      const hasCorrelationParams = Boolean(correlation.oauthFlow || correlation.oauthNonce)
      const flowMatches = googleFlow ? isGoogleOAuthFlowMatch(googleFlow, correlation) : false
      const sawCallbackTokens = hasAuthCallbackTokens()
      const resolvedReturnTo = googleFlow?.returnTo ?? redirectResult?.returnTo ?? search.r

      const showError = (options: {
        canRetryLink?: boolean
        kind?: CallbackErrorState['kind']
        message: string
      }) => {
        clearGoogleOAuthFlow()

        if (!active) {
          return
        }

        setErrorState({
          canRetryLink: Boolean(options.canRetryLink),
          kind: options.kind ?? getCallbackErrorKind(googleFlow),
          message: options.message,
          ...(resolvedReturnTo ? {returnTo: resolvedReturnTo} : {}),
        })
      }

      // Magic link callback: no Google flow correlation params and no stored Google flow
      if (!hasCorrelationParams && !googleFlow) {
        try {
          let {data, error} = await authAdapter.getSession()

          if (!data.session && !error && sawCallbackTokens) {
            await sleep(250)
            ;({data, error} = await authAdapter.getSession())
          }

          if (error) throw error

          const isAdmin = data.session?.user ? await fetchInternalAdminFlag() : false
          const sessionState = mapSupabaseSession(data.session ?? null, isAdmin)
          queryClient.setQueryData(sessionQueryOptions().queryKey, sessionState)

          if (sessionState.status === 'authenticated') {
            await openPostAuthDestination({
              navigate,
              queryClient,
              replace: true,
              returnTo: search.r,
              userName: sessionState.user.name,
            })
            return
          }

          // No session after magic link click
          if (!active) return
          setErrorState({
            canRetryLink: false,
            kind: 'sign-in',
            message: 'This sign-in link has expired or was already used. Request a new one.',
          })
          return
        } catch (error) {
          if (!active) return
          setErrorState({
            canRetryLink: false,
            kind: 'sign-in',
            message: error instanceof Error ? error.message : 'Sign-in could not be completed.',
          })
          return
        }
      }

      if (hasCorrelationParams && !flowMatches) {
        showError({
          kind: getCallbackErrorKind(googleFlow),
          message: 'Google returned to a stale or mismatched Rocketboard auth attempt. Start the sign-in flow again.',
        })
        return
      }

      try {
        let {data, error} = await authAdapter.getSession()

        if (!data.session && !error && sawCallbackTokens) {
          await sleep(250)
          ;({data, error} = await authAdapter.getSession())
        }

        if (error) {
          throw error
        }

        const isAdmin = data.session?.user ? await fetchInternalAdminFlag() : false
        const sessionState = mapSupabaseSession(data.session ?? null, isAdmin)
        queryClient.setQueryData(sessionQueryOptions().queryKey, sessionState)

        if (redirectResult && (redirectResult.code || redirectResult.description || redirectResult.error)) {
          if (
            flowMatches
            && googleFlow?.phase === 'oauth-sign-in'
            && isGoogleLinkCollisionRedirectError(redirectResult)
          ) {
            if (sessionState.status === 'authenticated') {
              showError({
                kind: 'sign-in',
                message:
                  'Google sign-in matched an existing password account, but another Rocketboard session is already active. Sign out and try again from the login page.',
              })
              return
            }

            persistGoogleOAuthFlow({
              createdAt: Date.now(),
              flowId: googleFlow.flowId,
              phase: 'password-auth',
              redirectNonce: null,
              ...(googleFlow.returnTo ? {returnTo: googleFlow.returnTo} : {}),
            })

            await navigate({
              href: buildLoginHref(googleFlow.returnTo ?? search.r, {
                mode: 'link-google',
              }),
              replace: true,
            })
            return
          }

          showError({
            canRetryLink: googleFlow?.phase === 'oauth-link' && sessionState.status === 'authenticated',
            kind: getCallbackErrorKind(googleFlow),
            message: redirectResult.message,
          })
          return
        }

        if (flowMatches && googleFlow?.phase === 'oauth-link') {
          if (sessionState.status !== 'authenticated') {
            showError({
              kind: 'link',
              message: 'Rocketboard lost the signed-in session before Google linking could be confirmed.',
            })
            return
          }

          if (googleFlow.linkingUserId && googleFlow.linkingUserId !== sessionState.user.id) {
            showError({
              kind: 'link',
              message: 'Google returned to a different Rocketboard session than the one that started the link flow.',
            })
            return
          }

          const linkState = await waitForGoogleIdentity()

          if (!linkState.linked) {
            showError({
              canRetryLink: true,
              kind: 'link',
              message: linkState.message ?? 'Rocketboard could not confirm the linked Google identity.',
            })
            return
          }

          clearGoogleOAuthFlow()
          await openPostAuthDestination({
            navigate,
            queryClient,
            replace: true,
            returnTo: googleFlow.returnTo ?? search.r,
            userName: sessionState.status === 'authenticated' ? sessionState.user.name : null,
          })
          return
        }

        if (flowMatches && googleFlow?.phase === 'password-auth') {
          showError({
            kind: 'link',
            message: 'Google linking did not resume correctly. Start the link flow again from login.',
          })
          return
        }

        if (sessionState.status === 'anonymous') {
          if (googleFlow || sawCallbackTokens) {
            showError({
              kind: getCallbackErrorKind(googleFlow),
              message: 'Rocketboard could not complete Google sign-in. Please try again from the login page.',
            })
            return
          }

          await navigate({
            href: buildLoginHref(search.r),
            replace: true,
          })
          return
        }

        clearGoogleOAuthFlow()
        await openPostAuthDestination({
          navigate,
          queryClient,
          replace: true,
          returnTo: resolvedReturnTo,
          userName: sessionState.status === 'authenticated' ? sessionState.user.name : null,
        })
      } catch (error) {
        clearGoogleOAuthFlow()

        if (!active) {
          return
        }

        setErrorState({
          canRetryLink: false,
          kind: getCallbackErrorKind(googleFlow),
          message: error instanceof Error ? error.message : 'Rocketboard could not complete Google sign-in.',
          ...(resolvedReturnTo ? {returnTo: resolvedReturnTo} : {}),
        })
      }
    }

    void finishOAuthFlow()

    return () => {
      active = false
    }
  }, [navigate, queryClient, search.r])

  const continueAfterFailure = async () => {
    const currentSession = queryClient.getQueryData(sessionQueryOptions().queryKey) as SessionState | undefined

    if (currentSession?.status === 'authenticated') {
      await openPostAuthDestination({
        navigate,
        queryClient,
        replace: true,
        returnTo: errorState?.returnTo ?? search.r,
        userName: currentSession.user.name,
      })
      return
    }

    await navigate({
      href: buildLoginHref(errorState?.returnTo ?? search.r),
      replace: true,
    })
  }

  const retryGoogleLink = async () => {
    setRetryPending(true)

    try {
      const {data, error} = await authAdapter.getUser()

      if (error) {
        throw error
      }

      if (!data.user) {
        await navigate({
          href: buildLoginHref(errorState?.returnTo ?? search.r),
          replace: true,
        })
        return
      }

      const retryFlow = createGoogleOAuthFlow({
        linkingUserId: data.user.id,
        phase: 'oauth-link',
        returnTo: errorState?.returnTo ?? search.r,
      })
      const redirectTo = buildAuthCallbackUrl({
        oauthFlow: retryFlow.flowId,
        oauthNonce: retryFlow.redirectNonce,
        returnTo: retryFlow.returnTo,
      })

      persistGoogleOAuthFlow(retryFlow)
      const {error: linkError} = await authAdapter.linkIdentity({
        provider: 'google',
        options: redirectTo ? {redirectTo} : undefined,
      })

      if (linkError) {
        throw linkError
      }
    } catch (error) {
      clearGoogleOAuthFlow()
      setRetryPending(false)
      setErrorState((currentState) => ({
        canRetryLink: true,
        kind: 'link',
        message: error instanceof Error ? error.message : 'Rocketboard could not restart Google linking.',
        ...(currentState?.returnTo ? {returnTo: currentState.returnTo} : {}),
      }))
    }
  }

  if (errorState) {
    return (
      <div className='min-h-screen bg-canvas'>
        <div className='mx-auto flex min-h-screen w-full max-w-3xl items-center px-6 py-16'>
          <section className='w-full rounded-[32px] border border-border-subtle bg-surface-elevated p-8 shadow-elevated sm:p-10'>
            <div className='inline-flex items-center gap-2 rounded-full bg-error/10 px-3 py-1 text-xs font-medium text-error'>
              <AlertTriangle className='h-3.5 w-3.5'/>
              Authentication Error
            </div>

            <h1 className='mt-6 font-display text-4xl font-semibold leading-[1.02] tracking-tight text-text-strong sm:text-5xl'>
              {errorState.kind === 'link'
                ? 'Google linking could not be completed.'
                : 'Google sign-in could not be completed.'}
            </h1>

            <div className='mt-6 rounded-2xl border border-error/20 bg-error/10 px-4 py-4 text-sm text-error'>
              {errorState.message}
            </div>

            {errorState.kind === 'link' ? (
              <div className='mt-6 flex flex-wrap items-center gap-3'>
                <Button
                  disabled={retryPending}
                  onClick={() => {
                    void continueAfterFailure()
                  }}
                  variant='secondary'
                >
                  Continue to app
                  <ArrowRight className='h-4 w-4'/>
                </Button>
                {errorState.canRetryLink ? (
                  <Button
                    disabled={retryPending}
                    onClick={() => {
                      void retryGoogleLink()
                    }}
                    variant='primary'
                  >
                    <RefreshCcw className='h-4 w-4'/>
                    {retryPending ? 'Redirecting to Google…' : 'Retry link'}
                  </Button>
                ) : null}
              </div>
            ) : (
              <Button
                className='mt-6'
                onClick={() => {
                  void navigate({
                    href: buildLoginHref(errorState.returnTo ?? search.r),
                    replace: true,
                  })
                }}
                variant='primary'
              >
                Back to login
                <ArrowRight className='h-4 w-4'/>
              </Button>
            )}
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className='min-h-screen bg-canvas'>
      <div className='mx-auto flex min-h-screen w-full max-w-3xl items-center px-6 py-16'>
        <section className='w-full rounded-[32px] border border-border-subtle bg-surface-elevated p-8 shadow-elevated sm:p-10'>
          <p className='font-mono text-xs uppercase tracking-[0.24em] text-text-muted'>Google Auth</p>
          <h1 className='mt-4 font-display text-4xl font-semibold leading-[1.02] tracking-tight text-text-strong sm:text-5xl'>
            Completing sign-in…
          </h1>
          <p className='mt-5 max-w-2xl text-base leading-relaxed text-text-medium sm:text-lg'>
            Rocketboard is finalizing your Google session and restoring the page you were trying to open.
          </p>

          <div className='mt-8 flex items-center gap-4 rounded-2xl bg-canvas-accent p-5'>
            <div className='h-8 w-8 animate-spin rounded-full border-[3px] border-border-subtle border-t-primary'/>
            <p className='text-sm text-text-medium'>This usually takes a second or two.</p>
          </div>
        </section>
      </div>
    </div>
  )
}
