import {ArrowRight, Building2, CheckCircle2, Clock, FolderOpen, Link2, LogOut, Mail, UserPlus2, XCircle} from 'lucide-react'
import {getRouteApi, useNavigate} from '@tanstack/react-router'
import {useQueryClient} from '@tanstack/react-query'
import {useEffect, useRef, useState, type FormEvent} from 'react'

import {Button} from '../../components/ui/button'
import {Input} from '../../components/ui/input'
import {loginRoutePath} from '../auth/data'
import {GoogleIcon} from '../auth/GoogleIcon'
import {
  useSessionQuery,
  useSignInMutation,
  useSignInWithGoogleMutation,
  useSignOutMutation,
  useSignUpMutation,
} from '../auth/session.queries'
import {workspaceSummariesQueryOptions} from '../projects/project-shell.queries'
import {emptyShellRoutePath, getDefaultProjectRoute, isProjectRouteTarget, resolveProjectRouteTarget} from '../projects/project-shell.routes'
import {buildProjectRouteHref} from '../search/workspace-palette-navigation'
import {projectLayoutRoutePath} from '../shell/route-helpers'
import {acceptInviteRoutePath, buildAcceptInviteHref} from './setup.routes'
import {useAcceptInviteMutation, useInviteSnapshotQuery} from './setup.queries'
import type {InviteAcceptResult, InviteAcceptSnapshot, ProjectRouteTarget} from './setup.types'

const routeApi = getRouteApi(acceptInviteRoutePath)

function describeOrganizationRole(role: string) {
  switch (role) {
    case 'admin':
      return 'Organization admin · can manage members, guests, and settings'
    case 'member':
      return 'Organization member · can edit work in the scopes you can access'
    case 'guest':
      return 'Organization guest · view only in the scopes you can access'
    default:
      return `${role} access`
  }
}

function describeScopedRole(resourceType: 'project' | 'workspace', role: string) {
  if (role === 'admin') {
    return resourceType === 'workspace' ? 'Workspace admin' : 'Project admin'
  }

  if (role === 'member') {
    return resourceType === 'workspace' ? 'Workspace member' : 'Project member'
  }

  return resourceType === 'workspace' ? 'Workspace guest' : 'Project guest'
}

function badgeConfig(snapshot: InviteAcceptSnapshot) {
  switch (snapshot.resourceType) {
    case 'organization':
      return {bg: 'bg-primary-soft', icon: Building2, label: 'Organization Invite', text: 'text-primary'}
    case 'workspace':
      return {bg: 'bg-secondary-soft', icon: FolderOpen, label: 'Workspace Invite', text: 'text-secondary'}
    default:
      return {bg: 'bg-primary-soft', icon: Link2, label: 'Project Invite', text: 'text-primary'}
  }
}

function headlineText(snapshot: InviteAcceptSnapshot) {
  switch (snapshot.resourceType) {
    case 'organization':
      return `Join ${snapshot.organization?.name ?? 'this organization'} on Rocketboard.`
    case 'workspace':
      return `Join ${snapshot.workspace?.name ?? 'this workspace'}${snapshot.organization?.name ? ` in ${snapshot.organization.name}` : ''}.`
    default:
      return `Join ${snapshot.project?.name ?? 'this project'}${snapshot.workspace?.name ? ` in ${snapshot.workspace.name}` : ''}.`
  }
}

function detailCard(snapshot: InviteAcceptSnapshot) {
  switch (snapshot.resourceType) {
    case 'organization':
      return {
        icon: snapshot.organization?.icon || 'O',
        name: snapshot.organization?.name ?? '',
        subtitle: describeOrganizationRole(snapshot.role),
      }
    case 'workspace':
      return {
        icon: snapshot.workspace?.icon || 'W',
        name: snapshot.workspace?.name ?? '',
        subtitle: `${snapshot.organization?.name ?? ''} · ${describeScopedRole('workspace', snapshot.role)}`,
      }
    default:
      return {
        icon: snapshot.project?.icon || '📋',
        name: snapshot.project?.name ?? '',
        subtitle: `${snapshot.workspace?.name ?? ''} · ${describeScopedRole('project', snapshot.role)}`,
      }
  }
}

function acceptDetailText(snapshot: InviteAcceptSnapshot) {
  switch (snapshot.resourceType) {
    case 'organization':
      return snapshot.role === 'guest'
        ? 'This invite makes you an organization guest. Guests can view work but cannot create or edit tasks.'
        : snapshot.role === 'admin'
        ? 'This invite makes you an organization admin. Admins can manage organization settings and access.'
        : 'This invite makes you an organization member. Members can create and edit work in the scopes they can access.'
    case 'workspace':
      return snapshot.role === 'guest'
        ? 'This invite adds workspace guest access. If this email is not already in the organization, accepting also creates an organization guest.'
        : 'This invite adds workspace membership. Your organization role still determines whether you can edit or only view shared content.'
    default:
      return snapshot.role === 'guest'
        ? 'This invite adds project guest access. If this email is not already in the organization, accepting also creates the required guest memberships above it.'
        : 'This invite adds project membership. Your organization role still determines whether you can edit or only view shared content.'
  }
}

function normalizeStatusMessage(message: string | null) {
  if (message === 'External workspace invites can only create guest access.' || message === 'External project invites can only create guest access.') {
    return 'External workspace and project invites create guest access in Phase 1.'
  }

  return message
}

function WelcomeInterstitial({onContinue, result}: {onContinue: () => void; result: InviteAcceptResult}) {
  return (
    <div className='flex flex-col items-center justify-center py-12 text-center'>
      <h2 className='font-display text-3xl font-semibold text-text-strong'>
        Welcome to {result.organizationName}!
      </h2>
      <p className='mt-4 text-base text-text-medium'>
        You&apos;ve been added to {result.workspaceCount ?? 0} workspace{(result.workspaceCount ?? 0) !== 1 ? 's' : ''}.
      </p>
      <Button className='mt-8' onClick={onContinue} variant='primary'>
        Get started
        <ArrowRight className='h-4 w-4'/>
      </Button>
    </div>
  )
}

export function AcceptInvitePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const params = routeApi.useParams()
  const search = routeApi.useSearch()
  const sessionQuery = useSessionQuery()
  const inviteQuery = useInviteSnapshotQuery(params.inviteToken)
  const acceptInviteMutation = useAcceptInviteMutation()
  const signInMutation = useSignInMutation()
  const signInWithGoogleMutation = useSignInWithGoogleMutation()
  const signOutMutation = useSignOutMutation()
  const signUpMutation = useSignUpMutation()
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-up')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [showWelcome, setShowWelcome] = useState(false)
  const [acceptResult, setAcceptResult] = useState<InviteAcceptResult | null>(null)

  const invite = inviteQuery.data
  const session = sessionQuery.data
  const isAuthenticated = session?.status === 'authenticated'
  const currentUser = isAuthenticated ? session.user : null
  const inviteEmail = invite?.email ?? ''
  const currentEmail = currentUser?.email.trim().toLowerCase() ?? ''
  const inviteEmailMismatch = Boolean(invite && currentUser && currentEmail !== invite.email)
  const authError =
    signInWithGoogleMutation.error instanceof Error
      ? signInWithGoogleMutation.error.message
      : authMode === 'sign-in'
      ? signInMutation.error instanceof Error
        ? signInMutation.error.message
        : null
      : signUpMutation.error instanceof Error
        ? signUpMutation.error.message
        : null
  const inviteError =
    acceptInviteMutation.error instanceof Error ? acceptInviteMutation.error.message : null
  const queryError = inviteQuery.error instanceof Error ? inviteQuery.error.message : null
  const statusMessage = normalizeStatusMessage(inviteError ?? authError ?? queryError)
  const inviteReturnTo = buildAcceptInviteHref(params.inviteToken, {autoAccept: true})
  const supportsGoogleAuth = true
  const autoAcceptAttemptedRef = useRef(false)

  const navigateToRoute = async (route?: ProjectRouteTarget | null) => {
    const workspaces = await queryClient.fetchQuery({
      ...workspaceSummariesQueryOptions(),
      staleTime: 0,
    })
    const resolvedRoute = resolveProjectRouteTarget(workspaces, route) ?? getDefaultProjectRoute(workspaces)

    if (resolvedRoute) {
      void navigate({href: buildProjectRouteHref(resolvedRoute)})
      return
    }

    if (isProjectRouteTarget(route)) {
      void navigate({
        params: {
          orgSlug: route.orgSlug,
          projectSlug: route.projectSlug,
          workspaceSlug: route.workspaceSlug,
        },
        to: projectLayoutRoutePath,
      })
      return
    }

    void navigate({to: emptyShellRoutePath})
  }

  const openInviteResource = () => {
    void navigateToRoute(invite?.route ?? null)
  }

  const acceptInvite = () => {
    acceptInviteMutation.mutate(params.inviteToken, {
      onSuccess: (result) => {
        if (result.resourceType === 'organization' && result.organizationName) {
          setAcceptResult(result)
          setShowWelcome(true)
        } else {
          void navigateToRoute(result.route)
        }
      },
    })
  }

  const handleAuthSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!invite) return

    if (authMode === 'sign-in') {
      signInMutation.mutate({email: invite.email, password}, {onSuccess: () => acceptInvite()})
      return
    }

    signUpMutation.mutate({email: invite.email, fullName, password}, {onSuccess: () => acceptInvite()})
  }

  const authPending =
    acceptInviteMutation.isPending
    || signInWithGoogleMutation.isPending
    || signInMutation.isPending
    || signUpMutation.isPending
  const authSubmitLabel =
    authMode === 'sign-in'
      ? authPending ? 'Signing in…' : 'Sign in and accept'
      : authPending ? 'Creating account…' : 'Create account and accept'

  const handleGoogleAuth = () => {
    if (!invite) return
    acceptInviteMutation.reset()
    signInMutation.reset()
    signUpMutation.reset()
    signInWithGoogleMutation.reset()
    signInWithGoogleMutation.mutate(inviteReturnTo)
  }

  useEffect(() => {
    if (!search.autoAccept || autoAcceptAttemptedRef.current || !invite || !isAuthenticated) return
    if (invite.status !== 'pending' || inviteEmailMismatch || acceptInviteMutation.isPending) return
    autoAcceptAttemptedRef.current = true
    acceptInvite()
  }, [acceptInviteMutation.isPending, invite, inviteEmailMismatch, isAuthenticated, search.autoAccept])

  if (showWelcome && acceptResult) {
    return (
      <div className='min-h-screen bg-canvas'>
        <div className='mx-auto flex min-h-screen w-full max-w-2xl items-center justify-center px-6 py-16'>
          <div className='w-full rounded-[32px] border border-border-subtle bg-surface-elevated p-10 shadow-elevated'>
            <WelcomeInterstitial
              onContinue={() => void navigateToRoute(acceptResult.route)}
              result={acceptResult}
            />
          </div>
        </div>
      </div>
    )
  }

  const badge = invite ? badgeConfig(invite) : null
  const detail = invite ? detailCard(invite) : null
  const BadgeIcon = badge?.icon ?? Link2

  return (
    <div className='min-h-screen bg-canvas'>
      <div className='mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-16'>
        <div className='grid w-full gap-10 lg:grid-cols-[1.05fr_0.95fr]'>
          <section className='rounded-[32px] border border-border-subtle bg-surface-elevated p-8 shadow-elevated sm:p-10'>
            {badge ? (
              <div className={`inline-flex items-center gap-2 rounded-full ${badge.bg} px-3 py-1 text-xs font-medium ${badge.text}`}>
                <BadgeIcon className='h-3.5 w-3.5'/>
                {badge.label}
              </div>
            ) : null}

            <h1 className='mt-6 max-w-3xl font-display text-4xl font-semibold leading-[1.02] tracking-tight text-text-strong sm:text-5xl'>
              {invite ? headlineText(invite) : 'Open your Rocketboard invite.'}
            </h1>

            <p className='mt-5 max-w-2xl text-base leading-relaxed text-text-medium sm:text-lg'>
              Sign in with the invited email and accept to join.
            </p>

            <div className='mt-8 rounded-3xl border border-border-subtle bg-surface-base p-5 shadow-panel'>
              {inviteQuery.isPending ? (
                <p className='text-sm text-text-medium'>Loading invite details…</p>
              ) : invite && detail ? (
                <div className='space-y-4'>
                  <div className='flex items-center gap-3'>
                    <div className='flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft text-lg text-primary'>
                      <span>{detail.icon}</span>
                    </div>
                    <div>
                      <p className='text-lg font-semibold text-text-strong'>{detail.name}</p>
                      <p className='text-sm text-text-medium'>{detail.subtitle}</p>
                    </div>
                  </div>

                  <div className='rounded-2xl bg-canvas-accent p-4'>
                    <p className='font-mono text-xs uppercase tracking-[0.2em] text-text-muted'>Invited Email</p>
                    <p className='mt-2 text-sm font-medium text-text-strong'>{invite.email}</p>
                    <p className='mt-2 text-sm text-text-medium'>Shared by {invite.inviterName}</p>
                  </div>

                  {statusMessage ? (
                    <div className='rounded-2xl border border-error/20 bg-error/10 px-3 py-2 text-sm text-error'>
                      {statusMessage}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className='rounded-2xl border border-error/20 bg-error/10 px-4 py-5 text-sm text-error'>
                  Invite not found. The token may be invalid or the invite may have been deleted.
                </div>
              )}
            </div>
          </section>

          <aside className='rounded-[32px] border border-border-subtle bg-surface-base p-8 shadow-panel sm:p-10'>
            {inviteQuery.isPending ? (
              <>
                <p className='font-mono text-xs uppercase tracking-[0.24em] text-text-muted'>Invite</p>
                <h2 className='mt-4 font-display text-2xl font-semibold text-text-strong'>Loading access details…</h2>
                <p className='mt-4 text-sm leading-relaxed text-text-medium'>
                  Verifying the invite token and resolving the target route.
                </p>
              </>
            ) : !invite ? (
              <>
                <div className='inline-flex items-center gap-2 rounded-full bg-error/10 px-3 py-1 text-xs font-medium text-error'>
                  <XCircle className='h-3.5 w-3.5'/>
                  Invite Unavailable
                </div>
                <p className='mt-4 text-sm leading-relaxed text-text-medium'>
                  This invite could not be resolved. Ask the sender to issue a new invite.
                </p>
                <Button className='mt-6' onClick={() => navigate({to: loginRoutePath})} variant='secondary'>
                  Back to login
                </Button>
              </>
            ) : invite.status === 'expired' ? (
              <>
                <div className='inline-flex items-center gap-2 rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning'>
                  <Clock className='h-3.5 w-3.5'/>
                  Invite Expired
                </div>
                <p className='mt-4 text-sm leading-relaxed text-text-medium'>
                  This invitation has expired. Ask {invite.inviterName} to send a new one.
                </p>
              </>
            ) : invite.status === 'revoked' ? (
              <>
                <div className='inline-flex items-center gap-2 rounded-full bg-error/10 px-3 py-1 text-xs font-medium text-error'>
                  <XCircle className='h-3.5 w-3.5'/>
                  Invite Revoked
                </div>
                <p className='mt-4 text-sm leading-relaxed text-text-medium'>
                  This invite is no longer active. Ask the sender to issue a new one if you still need access.
                </p>
              </>
            ) : invite.status === 'accepted' ? (
              <>
                <div className='inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success'>
                  <CheckCircle2 className='h-3.5 w-3.5'/>
                  Invite Accepted
                </div>
                <p className='mt-4 text-sm leading-relaxed text-text-medium'>
                  This invite has already been accepted. Open your resource below.
                </p>
                {invite.route ? (
                  <Button className='mt-6' onClick={openInviteResource} variant='primary'>
                    {invite.resourceType === 'organization' ? 'Go to workspace' : invite.resourceType === 'workspace' ? 'Go to workspace' : 'Open project'}
                    <ArrowRight className='h-4 w-4'/>
                  </Button>
                ) : null}
              </>
            ) : isAuthenticated ? (
              <>
                <p className='font-mono text-xs uppercase tracking-[0.24em] text-text-muted'>Accept Invite</p>
                <h2 className='mt-4 font-display text-2xl font-semibold text-text-strong'>
                  {invite.resourceType === 'organization' ? 'Join this organization.' : invite.resourceType === 'workspace' ? 'Join this workspace.' : 'Finish joining this project.'}
                </h2>
                <p className='mt-3 text-sm leading-relaxed text-text-medium'>
                  {acceptDetailText(invite)}
                </p>

                <div className='mt-6 rounded-2xl border border-border-subtle bg-surface-elevated p-4'>
                  <p className='font-medium text-text-strong'>{currentUser?.name}</p>
                  <p className='mt-1 font-mono text-xs text-text-muted'>{currentUser?.email}</p>
                </div>

                {inviteEmailMismatch ? (
                  <>
                    <div className='mt-4 rounded-2xl border border-error/20 bg-error/10 px-3 py-2 text-sm text-error'>
                      You&apos;re signed in as {currentEmail}. This invite is for {invite.email}. Sign out below to switch to the right account.
                    </div>
                    <Button
                      className='mt-6'
                      disabled={signOutMutation.isPending}
                      onClick={() => signOutMutation.mutate(undefined)}
                      variant='secondary'
                    >
                      <LogOut className='h-4 w-4'/>
                      Sign out and switch
                    </Button>
                  </>
                ) : (
                  <>
                    {statusMessage ? (
                      <div className='mt-4 rounded-2xl border border-error/20 bg-error/10 px-3 py-2 text-sm text-error'>
                        {statusMessage}
                      </div>
                    ) : null}
                    <Button
                      className='mt-6'
                      disabled={acceptInviteMutation.isPending}
                      onClick={acceptInvite}
                      variant='primary'
                    >
                      {acceptInviteMutation.isPending ? 'Accepting…' : 'Accept invite'}
                      <ArrowRight className='h-4 w-4'/>
                    </Button>
                  </>
                )}
              </>
            ) : (
              <>
                <div className='flex items-center gap-2 rounded-full bg-canvas-accent p-1'>
                  <button
                    className={[
                      'rounded-full px-4 py-2 text-sm font-medium transition-all',
                      authMode === 'sign-up'
                        ? 'bg-surface-elevated text-text-strong shadow-panel'
                        : 'text-text-muted hover:text-text-strong',
                    ].join(' ')}
                    onClick={() => setAuthMode('sign-up')}
                    type='button'
                  >
                    Create account
                  </button>
                  <button
                    className={[
                      'rounded-full px-4 py-2 text-sm font-medium transition-all',
                      authMode === 'sign-in'
                        ? 'bg-surface-elevated text-text-strong shadow-panel'
                        : 'text-text-muted hover:text-text-strong',
                    ].join(' ')}
                    onClick={() => setAuthMode('sign-in')}
                    type='button'
                  >
                    Sign in
                  </button>
                </div>

                <h2 className='mt-6 font-display text-2xl font-semibold text-text-strong'>
                  {authMode === 'sign-up' ? 'Create your account to accept.' : 'Sign in with the invited email.'}
                </h2>

                {supportsGoogleAuth ? (
                  <>
                    <Button
                      className='mt-6 w-full justify-center'
                      disabled={authPending}
                      onClick={handleGoogleAuth}
                      type='button'
                      variant='primary'
                    >
                      <GoogleIcon className='h-4 w-4'/>
                      {signInWithGoogleMutation.isPending ? 'Redirecting to Google…' : 'Continue with Google'}
                    </Button>

                    <p className='mt-3 text-sm text-text-muted'>
                      Use the invited email in Google and Rocketboard will bring you back to this invite automatically.
                    </p>

                    <div className='mt-4 flex items-center gap-3'>
                      <div className='h-px flex-1 bg-border-subtle'/>
                      <span className='text-xs font-medium uppercase tracking-[0.18em] text-text-muted'>
                        Or use email and password
                      </span>
                      <div className='h-px flex-1 bg-border-subtle'/>
                    </div>
                  </>
                ) : null}

                <form className='mt-6 space-y-4' onSubmit={handleAuthSubmit}>
                  {authMode === 'sign-up' ? (
                    <label className='space-y-2'>
                      <span className='text-sm font-medium text-text-strong'>Full name</span>
                      <Input
                        autoComplete='name'
                        onChange={(event) => setFullName(event.target.value)}
                        placeholder='Morgan Lee'
                        value={fullName}
                      />
                    </label>
                  ) : null}

                  <label className='space-y-2'>
                    <span className='text-sm font-medium text-text-strong'>Email</span>
                    <Input readOnly type='email' value={inviteEmail}/>
                  </label>

                  <label className='space-y-2'>
                    <span className='text-sm font-medium text-text-strong'>Password</span>
                    <Input
                      autoComplete={authMode === 'sign-up' ? 'new-password' : 'current-password'}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder='••••••••'
                      type='password'
                      value={password}
                    />
                  </label>

                  {statusMessage ? (
                    <div className='rounded-2xl border border-error/20 bg-error/10 px-3 py-2 text-sm text-error'>
                      {statusMessage}
                    </div>
                  ) : null}

                  <Button
                    className='w-full'
                    disabled={!password.trim() || (authMode === 'sign-up' && !fullName.trim()) || authPending}
                    type='submit'
                    variant='primary'
                  >
                    {authMode === 'sign-up' ? <UserPlus2 className='h-4 w-4'/> : <Mail className='h-4 w-4'/>}
                    {authSubmitLabel}
                  </Button>
                </form>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
