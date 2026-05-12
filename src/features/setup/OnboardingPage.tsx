import {LogOut, Loader2, ArrowRight} from 'lucide-react'
import {useNavigate} from '@tanstack/react-router'
import {useQueryClient} from '@tanstack/react-query'
import {useEffect, useRef, useState, type FormEvent} from 'react'

import {Button} from '../../components/ui/button'
import {Input} from '../../components/ui/input'
import {loginRoutePath} from '../auth/data'
import {useSessionQuery, useSignOutMutation} from '../auth/session.queries'
import {workspaceSummariesQueryOptions} from '../projects/project-shell.queries'
import {buildProjectRouteHref} from '../search/workspace-palette-navigation'
import {getDefaultProjectRoute, resolveProjectRouteTarget} from '../projects/project-shell.routes'
import type {ProjectRouteTarget} from './setup.types'
import {useBootstrapWorkspaceMutation} from './setup.queries'

const consumerDomains = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com',
  'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'protonmail.com', 'proton.me', 'mail.com', 'zoho.com',
  'yandex.com', 'fastmail.com', 'hey.com', 'tutanota.com',
])

function deriveDefaultName(name: string | undefined, email: string | undefined): string {
  // Try email domain first (for work emails)
  if (email) {
    const domain = email.split('@')[1]?.toLowerCase()
    if (domain && !consumerDomains.has(domain)) {
      const company = domain.split('.')[0]
      if (company && company.length > 1) {
        return company.charAt(0).toUpperCase() + company.slice(1)
      }
    }
  }

  // Fall back to first name
  const firstName = name?.split(' ')[0]
  if (firstName) {
    return `${firstName}'s Team`
  }

  return ''
}

export function OnboardingPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const sessionQuery = useSessionQuery()
  const signOutMutation = useSignOutMutation()
  const bootstrapMutation = useBootstrapWorkspaceMutation()

  const currentUser = sessionQuery.data?.status === 'authenticated' ? sessionQuery.data.user : null

  const [teamName, setTeamName] = useState('')
  const hasPreFilled = useRef(false)

  const openProjectRoute = async (route?: ProjectRouteTarget | null) => {
    const workspaces = await queryClient.fetchQuery({
      ...workspaceSummariesQueryOptions(),
      staleTime: 0,
    })
    const resolvedRoute = resolveProjectRouteTarget(workspaces, route) ?? getDefaultProjectRoute(workspaces)
    if (!resolvedRoute) {
      return false
    }

    void navigate({href: buildProjectRouteHref(resolvedRoute)})
    return true
  }

  // Pre-fill when user data arrives (session loads async)
  useEffect(() => {
    if (currentUser && !hasPreFilled.current) {
      hasPreFilled.current = true
      const derived = deriveDefaultName(currentUser.name, currentUser.email)
      if (derived) setTeamName(derived)
    }
  }, [currentUser])

  // If bootstrap fails (e.g. ONBOARDING_ALREADY_COMPLETED), check if a workspace
  // already exists and redirect there instead of showing an error.
  const tryNavigateToExistingWorkspace = async () => {
    return openProjectRoute(null)
  }

  const bootstrapCallbacks = {
    onSuccess: (route: ProjectRouteTarget) => {
      void queryClient.invalidateQueries({queryKey: workspaceSummariesQueryOptions().queryKey})
      void openProjectRoute(route)
    },
    onError: () => {
      void tryNavigateToExistingWorkspace()
    },
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const name = teamName.trim()
    if (!name) return
    bootstrapMutation.mutate(
      {projectName: `${name} Board`, workspaceName: name},
      bootstrapCallbacks,
    )
  }

  const handleRetry = () => {
    const name = teamName.trim() || 'My Team'
    bootstrapMutation.mutate(
      {projectName: `${name} Board`, workspaceName: name},
      bootstrapCallbacks,
    )
  }

  const errorMessage =
    bootstrapMutation.error instanceof Error ? bootstrapMutation.error.message : null

  const isSubmitting = bootstrapMutation.isPending || bootstrapMutation.isSuccess

  return (
    <div className='min-h-screen bg-canvas'>
      <div className='mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-6 py-16'>
        <div className='w-full space-y-6 text-center'>
          {bootstrapMutation.isError ? (
            <>
              <h1 className='font-display text-2xl font-semibold text-text-strong'>
                Workspace setup failed
              </h1>
              {errorMessage ? (
                <div className='rounded-2xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error'>
                  {errorMessage}
                </div>
              ) : null}
              <div className='flex items-center justify-center gap-3'>
                <Button onClick={handleRetry} variant='primary'>
                  Retry
                </Button>
                <Button onClick={() => bootstrapMutation.reset()} variant='secondary'>
                  Back
                </Button>
                <Button
                  disabled={signOutMutation.isPending}
                  onClick={() => {
                    signOutMutation.mutate(undefined, {
                      onSuccess: () => {
                        void navigate({to: loginRoutePath})
                      },
                    })
                  }}
                  variant='ghost'
                >
                  <LogOut className='h-4 w-4'/>
                  Sign out
                </Button>
              </div>
            </>
          ) : isSubmitting ? (
            <>
              <Loader2 className='mx-auto h-8 w-8 animate-spin text-primary'/>
              <h1 className='font-display text-2xl font-semibold text-text-strong'>
                Setting up your workspace…
              </h1>
              <p className='text-sm text-text-muted'>
                {currentUser?.name ? `Welcome, ${currentUser.name}.` : 'One moment.'}
              </p>
            </>
          ) : (
            <form className='space-y-6' onSubmit={handleSubmit}>
              <div className='space-y-2'>
                <h1 className='font-display text-2xl font-semibold text-text-strong'>
                  {currentUser?.name ? `Welcome, ${currentUser.name}` : 'Welcome'}
                </h1>
                <p className='text-sm text-text-muted'>
                  Your workspace is where your team's projects and tasks live. What should we call yours?
                </p>
              </div>
              <div className='space-y-1.5 text-left'>
                <Input
                  autoFocus
                  maxLength={100}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder='e.g., Acme Inc, Design Guild'
                  value={teamName}
                />
                <p className='text-xs text-text-muted'>
                  You can change this anytime in settings.
                </p>
              </div>
              <Button
                className='w-full'
                disabled={!teamName.trim() || isSubmitting}
                type='submit'
                variant='primary'
              >
                Get started
                <ArrowRight className='ml-1.5 h-4 w-4'/>
              </Button>
              <Button
                className='w-full'
                disabled={signOutMutation.isPending}
                onClick={() => {
                  signOutMutation.mutate(undefined, {
                    onSuccess: () => {
                      void navigate({to: loginRoutePath})
                    },
                  })
                }}
                type='button'
                variant='ghost'
              >
                <LogOut className='h-4 w-4'/>
                Sign out
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
