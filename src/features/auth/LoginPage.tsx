import {ArrowLeft, ArrowRight, Link2, Mail} from 'lucide-react'
import {getRouteApi, useNavigate} from '@tanstack/react-router'
import {useQueryClient} from '@tanstack/react-query'
import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react'

import {Button} from '../../components/ui/button'
import {Input} from '../../components/ui/input'
import {appConfig} from '../../app/config'
import {
  buildLoginHref,
  clearGoogleOAuthFlow,
  createGoogleOAuthFlow,
  openPostAuthDestination,
  persistGoogleOAuthFlow,
  readGoogleOAuthFlow,
} from './auth-flow'
import {loginRoutePath} from './data'
import {GoogleIcon} from './GoogleIcon'
import {
  useLinkGoogleIdentityMutation,
  useRequestPasswordResetMutation,
  useSendMagicLinkMutation,
  useSessionQuery,
  useSignInMutation,
  useSignInWithGoogleMutation,
} from './session.queries'

const LOCAL_DEMO_EMAIL = 'demo@rocketboard.io'
const LOCAL_DEMO_PASSWORD = 'demo-password'
const RESEND_COOLDOWN_MS = 60_000
const routeApi = getRouteApi(loginRoutePath)

type LoginView = 'magic-link' | 'check-email' | 'password'

export function LoginPage() {
  const navigate = useNavigate()
  const search = routeApi.useSearch()
  const queryClient = useQueryClient()
  const sessionQuery = useSessionQuery()
  const signInMutation = useSignInMutation()
  const signInWithGoogleMutation = useSignInWithGoogleMutation()
  const linkGoogleIdentityMutation = useLinkGoogleIdentityMutation()
  const passwordResetMutation = useRequestPasswordResetMutation()
  const magicLinkMutation = useSendMagicLinkMutation()
  const isLocalSupabaseProject = Boolean(
    appConfig.supabase.url?.includes('127.0.0.1')
    || appConfig.supabase.url?.includes('localhost'),
  )

  const [view, setView] = useState<LoginView>(isLocalSupabaseProject ? 'password' : 'magic-link')
  const [email, setEmail] = useState(isLocalSupabaseProject ? LOCAL_DEMO_EMAIL : '')
  const [password, setPassword] = useState(isLocalSupabaseProject ? LOCAL_DEMO_PASSWORD : '')
  const [sentEmail, setSentEmail] = useState('')
  const [resendCooldownEnd, setResendCooldownEnd] = useState(0)
  const [resendTick, setResendTick] = useState(0)
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isAuthenticated = sessionQuery.data?.status === 'authenticated'
  const isGoogleLinkMode = search.mode === 'link-google'
  const returnTo = search.r
  const googleLinkFlow = isGoogleLinkMode ? readGoogleOAuthFlow() : null
  const hasActivePasswordLinkFlow = googleLinkFlow?.phase === 'password-auth'

  // Cooldown timer for resend button
  useEffect(() => {
    if (resendCooldownEnd <= Date.now()) return
    cooldownTimerRef.current = setInterval(() => {
      if (Date.now() >= resendCooldownEnd) {
        if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current)
        setResendTick((t) => t + 1)
      } else {
        setResendTick((t) => t + 1)
      }
    }, 1000)
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current)
    }
  }, [resendCooldownEnd])

  const resendSecondsLeft = Math.max(0, Math.ceil((resendCooldownEnd - Date.now()) / 1000))
  void resendTick // referenced to trigger re-render

  const openWorkspace = useCallback(async () => {
    const session = sessionQuery.data
    await openPostAuthDestination({
      navigate,
      queryClient,
      returnTo,
      userName: session?.status === 'authenticated' ? session.user.name : null,
    })
  }, [navigate, queryClient, returnTo, sessionQuery.data])

  const resetAuthState = () => {
    signInMutation.reset()
    signInWithGoogleMutation.reset()
    linkGoogleIdentityMutation.reset()
    passwordResetMutation.reset()
    magicLinkMutation.reset()
  }

  // --- Google link mode helpers (unchanged) ---

  const startGoogleLinkRedirect = (options: {
    flowId?: string
    userId: string
  }) => {
    const nextFlow = createGoogleOAuthFlow({
      ...(options.flowId ? {flowId: options.flowId} : {}),
      linkingUserId: options.userId,
      phase: 'oauth-link',
      returnTo: googleLinkFlow?.returnTo ?? returnTo,
    })

    persistGoogleOAuthFlow(nextFlow)
    linkGoogleIdentityMutation.mutate(
      {
        flowId: nextFlow.flowId,
        redirectNonce: nextFlow.redirectNonce ?? '',
        returnTo: nextFlow.returnTo,
      },
      {
        onError: () => {
          clearGoogleOAuthFlow()
        },
      },
    )
  }

  const startGoogleSignIn = () => {
    resetAuthState()
    signInWithGoogleMutation.mutate(returnTo)
  }

  const retryGoogleLink = () => {
    if (sessionQuery.data?.status !== 'authenticated') return
    resetAuthState()
    startGoogleLinkRedirect({userId: sessionQuery.data.user.id})
  }

  // --- Magic link ---

  const handleSendMagicLink = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!email.trim()) return

    magicLinkMutation.mutate(email.trim(), {
      onSuccess: () => {
        setSentEmail(email.trim())
        setResendCooldownEnd(Date.now() + RESEND_COOLDOWN_MS)
        setView('check-email')
      },
    })
  }

  const handleResend = () => {
    if (resendSecondsLeft > 0 || !sentEmail) return
    magicLinkMutation.mutate(sentEmail, {
      onSuccess: () => {
        setResendCooldownEnd(Date.now() + RESEND_COOLDOWN_MS)
      },
    })
  }

  // --- Password sign-in ---

  const handlePasswordSignIn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (isGoogleLinkMode) {
      signInMutation.mutate(
        {email, password},
        {
          onSuccess: (session) => {
            const activeFlow = readGoogleOAuthFlow()
            if (!activeFlow || activeFlow.phase !== 'password-auth') {
              clearGoogleOAuthFlow()
              linkGoogleIdentityMutation.reset()
              return
            }
            if (session.status !== 'authenticated') {
              clearGoogleOAuthFlow()
              return
            }
            startGoogleLinkRedirect({flowId: activeFlow.flowId, userId: session.user.id})
          },
        },
      )
      return
    }

    signInMutation.mutate(
      {email, password},
      {
        onSuccess: () => {
          void openWorkspace()
        },
      },
    )
  }

  // --- Error message ---

  const errorMessage = (() => {
    if (isGoogleLinkMode && !isAuthenticated && !hasActivePasswordLinkFlow) {
      return 'Your Google linking session expired. Start with Google again.'
    }
    if (linkGoogleIdentityMutation.error instanceof Error) return linkGoogleIdentityMutation.error.message
    if (signInWithGoogleMutation.error instanceof Error) return signInWithGoogleMutation.error.message
    if (signInMutation.error instanceof Error) return signInMutation.error.message
    if (magicLinkMutation.error instanceof Error) return magicLinkMutation.error.message
    if (passwordResetMutation.error instanceof Error) return passwordResetMutation.error.message
    if (passwordResetMutation.isSuccess) return 'If this email is registered, a reset link was sent.'
    return null
  })()

  useEffect(() => {
    if (!passwordResetMutation.isError && !passwordResetMutation.isSuccess) return
    passwordResetMutation.reset()
  }, [email, passwordResetMutation])

  useEffect(() => {
    if (isGoogleLinkMode) setView('password')
  }, [isGoogleLinkMode])

  // --- Google link mode: authenticated user ---
  if (isGoogleLinkMode && isAuthenticated) {
    return (
      <AuthShell>
        <div className='space-y-4'>
          <h2 className='font-display text-xl font-semibold text-text-strong'>Link your Google account</h2>
          <p className='text-sm leading-relaxed text-text-medium'>
            Your Rocketboard account is signed in. Continue to the app or retry the Google link.
          </p>
          <div className='flex flex-wrap items-center gap-3'>
            <Button disabled={linkGoogleIdentityMutation.isPending} onClick={retryGoogleLink} variant='primary'>
              <GoogleIcon className='h-4 w-4'/>
              {linkGoogleIdentityMutation.isPending ? 'Redirecting…' : 'Retry link'}
            </Button>
            <Button disabled={linkGoogleIdentityMutation.isPending} onClick={() => void openWorkspace()} variant='secondary'>
              Continue to app <ArrowRight className='h-4 w-4'/>
            </Button>
          </div>
          <button
            className='text-sm font-medium text-primary transition-colors hover:text-primary-strong'
            onClick={() => {
              clearGoogleOAuthFlow()
              resetAuthState()
              void navigate({href: buildLoginHref(returnTo), replace: true})
            }}
            type='button'
          >
            Cancel linking
          </button>
        </div>
        <ErrorBanner message={errorMessage}/>
      </AuthShell>
    )
  }

  // --- Check your email interstitial ---
  if (view === 'check-email') {
    return (
      <AuthShell>
        <div className='space-y-5'>
          <div className='flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft'>
            <Mail className='h-5 w-5 text-primary'/>
          </div>
          <h2 className='font-display text-xl font-semibold text-text-strong'>Check your email</h2>
          <p className='text-sm leading-relaxed text-text-medium'>
            We sent a sign-in link to{' '}
            <span className='font-mono font-medium text-text-strong'>{sentEmail}</span>
          </p>
          <p className='text-sm text-text-medium'>
            Click the link in the email to continue. It expires in 60 minutes.
          </p>
          <p className='text-xs text-text-muted'>
            Check your spam folder if you don't see it.
          </p>

          <div className='flex flex-wrap items-center gap-3'>
            <Button
              disabled={resendSecondsLeft > 0 || magicLinkMutation.isPending}
              onClick={handleResend}
              variant='secondary'
            >
              {magicLinkMutation.isPending
                ? 'Sending…'
                : resendSecondsLeft > 0
                  ? `Resend (${resendSecondsLeft}s)`
                  : 'Resend'}
            </Button>
            <button
              className='text-sm font-medium text-primary transition-colors hover:text-primary-strong'
              onClick={() => {
                magicLinkMutation.reset()
                setView('magic-link')
              }}
              type='button'
            >
              Use a different email
            </button>
          </div>

          <button
            className='flex items-center gap-1 text-sm text-text-muted transition-colors hover:text-text-strong'
            onClick={() => {
              magicLinkMutation.reset()
              setView('magic-link')
            }}
            type='button'
          >
            <ArrowLeft className='h-3.5 w-3.5'/> Back
          </button>
        </div>
        <ErrorBanner message={magicLinkMutation.error instanceof Error ? magicLinkMutation.error.message : null}/>
      </AuthShell>
    )
  }

  // --- Password fallback view ---
  if (view === 'password') {
    return (
      <AuthShell>
        <form className='space-y-5' onSubmit={handlePasswordSignIn}>
          {isGoogleLinkMode ? (
            <div className='flex flex-wrap items-center gap-3 rounded-xl bg-canvas-accent p-3'>
              <Button
                disabled={linkGoogleIdentityMutation.isPending || signInMutation.isPending}
                onClick={() => {
                  clearGoogleOAuthFlow()
                  resetAuthState()
                  void navigate({href: buildLoginHref(returnTo), replace: true})
                }}
                type='button'
                variant='secondary'
              >
                Back to login
              </Button>
              <p className='text-sm text-text-muted'>Sign in with your password to link Google.</p>
            </div>
          ) : (
            <h2 className='font-display text-lg font-semibold text-text-strong'>Sign in with password</h2>
          )}

          <div className='space-y-4'>
            <label className='block space-y-2'>
              <span className='text-sm font-medium text-text-strong'>Email</span>
              <Input
                autoComplete='email'
                onChange={(e) => setEmail(e.target.value)}
                placeholder={isLocalSupabaseProject ? LOCAL_DEMO_EMAIL : 'you@company.com'}
                type='email'
                value={email}
              />
            </label>
            <label className='block space-y-2'>
              <span className='text-sm font-medium text-text-strong'>Password</span>
              <Input
                autoComplete='current-password'
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isLocalSupabaseProject ? LOCAL_DEMO_PASSWORD : 'Your password'}
                type='password'
                value={password}
              />
            </label>
          </div>

          <ErrorBanner message={errorMessage}/>

          <Button
            className='w-full justify-center'
            disabled={signInMutation.isPending || !email.trim() || !password.trim()}
            type='submit'
            variant='primary'
          >
            {isGoogleLinkMode ? <Link2 className='h-4 w-4'/> : <Mail className='h-4 w-4'/>}
            {signInMutation.isPending
              ? 'Signing in…'
              : isGoogleLinkMode
                ? 'Sign in and link Google'
                : 'Sign in'}
          </Button>

          <div className='text-center'>
            <button
              className='text-sm font-medium text-primary transition-colors hover:text-primary-strong disabled:text-text-muted'
              disabled={!email.trim() || passwordResetMutation.isPending}
              onClick={() => passwordResetMutation.mutate({email})}
              type='button'
            >
              {passwordResetMutation.isPending ? 'Sending reset link…' : 'Forgot password?'}
            </button>
          </div>

          {!isGoogleLinkMode ? (
            <button
              className='flex items-center gap-1 text-sm text-text-muted transition-colors hover:text-text-strong'
              onClick={() => {
                resetAuthState()
                setView('magic-link')
              }}
              type='button'
            >
              <ArrowLeft className='h-3.5 w-3.5'/> Back to magic link
            </button>
          ) : null}
        </form>

        {isAuthenticated && !isGoogleLinkMode ? (
          <div className='mt-4 rounded-xl border border-border-subtle bg-surface-muted p-4'>
            <p className='text-sm text-text-medium'>You're already signed in.</p>
            <Button className='mt-3 w-full' onClick={() => void openWorkspace()} variant='secondary'>
              Continue to workspace <ArrowRight className='h-4 w-4'/>
            </Button>
          </div>
        ) : null}
      </AuthShell>
    )
  }

  // --- Default: Magic link view (primary) ---
  return (
    <AuthShell>
      <div className='space-y-5'>
        {/* Google button */}
        <Button
          className='w-full justify-center'
          disabled={magicLinkMutation.isPending || signInWithGoogleMutation.isPending}
          onClick={startGoogleSignIn}
          type='button'
          variant='secondary'
        >
          <GoogleIcon className='h-4 w-4'/>
          {signInWithGoogleMutation.isPending ? 'Redirecting to Google…' : 'Continue with Google'}
        </Button>

        <div className='flex items-center gap-3'>
          <div className='h-px flex-1 bg-border-subtle'/>
          <span className='text-xs font-medium text-text-muted'>or</span>
          <div className='h-px flex-1 bg-border-subtle'/>
        </div>

        {/* Magic link email form */}
        <form className='space-y-4' onSubmit={handleSendMagicLink}>
          <label className='block space-y-2'>
            <span className='text-sm font-medium text-text-strong'>Email</span>
            <Input
              autoComplete='email'
              onChange={(e) => setEmail(e.target.value)}
              placeholder='you@company.com'
              type='email'
              value={email}
            />
          </label>

          <ErrorBanner message={errorMessage}/>

          <Button
            className='w-full justify-center'
            disabled={!email.trim() || magicLinkMutation.isPending}
            type='submit'
            variant='primary'
          >
            <Mail className='h-4 w-4'/>
            {magicLinkMutation.isPending ? 'Sending…' : 'Continue with email'}
          </Button>
        </form>

        <div className='text-center'>
          <button
            className='text-sm font-medium text-text-muted transition-colors hover:text-text-strong'
            onClick={() => {
              resetAuthState()
              setView('password')
            }}
            type='button'
          >
            Use password instead
          </button>
        </div>
      </div>

      {isAuthenticated ? (
        <div className='mt-4 rounded-xl border border-border-subtle bg-surface-muted p-4'>
          <p className='text-sm text-text-medium'>You're already signed in.</p>
          <Button className='mt-3 w-full' onClick={() => void openWorkspace()} variant='secondary'>
            Continue to workspace <ArrowRight className='h-4 w-4'/>
          </Button>
        </div>
      ) : null}
    </AuthShell>
  )
}

function ErrorBanner({message}: {message: string | null}) {
  if (!message) return null
  return (
    <div className='rounded-xl border border-border-subtle bg-surface-muted p-3' role='alert'>
      <p className='text-sm text-text-medium'>{message}</p>
    </div>
  )
}

function AuthShell({children}: {children: React.ReactNode}) {
  return (
    <div className='flex min-h-screen items-center justify-center bg-canvas px-4 py-16'>
      <div className='grid w-full max-w-4xl overflow-hidden rounded-3xl border border-border-subtle lg:grid-cols-[2fr_3fr]'>
        <div className='flex flex-col justify-center bg-canvas px-8 py-10 lg:px-12 lg:py-16'>
          <h1 className='font-display text-3xl font-semibold tracking-tight text-text-strong lg:text-4xl'>
            Rocketboard
          </h1>
          <p className='mt-4 text-base leading-relaxed text-text-medium lg:text-lg'>
            Run projects, boards, and docs from one operating surface.
          </p>
        </div>
        <div className='bg-surface-elevated px-8 py-10 lg:px-12 lg:py-16'>
          {children}
        </div>
      </div>
    </div>
  )
}
