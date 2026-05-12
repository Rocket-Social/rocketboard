import type {QueryClient} from '@tanstack/react-query'

import {workspaceSummariesQueryOptions} from '../projects/project-shell.queries'
import {getDefaultProjectRoute, isProjectRouteTarget, resolveProjectRouteTarget} from '../projects/project-shell.routes'
import {buildProjectRouteHref} from '../search/workspace-palette-navigation'
import {setupRepository} from '../setup/setup.repository'
import {buildAcceptInviteHref, onboardingRoutePath} from '../setup/setup.routes'
import {projectLayoutRoutePath} from '../shell/route-helpers'
import {authCallbackRoutePath, loginRoutePath} from './auth.routes'

export type AuthRouteSearch = {
  mode?: 'link-google'
  r?: string
}

export type GoogleOAuthFlowPhase = 'oauth-sign-in' | 'password-auth' | 'oauth-link'

export type GoogleOAuthFlow = {
  createdAt: number
  flowId: string
  linkingUserId?: string
  phase: GoogleOAuthFlowPhase
  redirectNonce: string | null
  returnTo?: string
}

export type AuthRedirectResult = {
  code: string | null
  description: string | null
  error: string | null
  message: string
  oauthFlow: string | null
  oauthNonce: string | null
  returnTo?: string
}

type NavigateFn = (options: any) => Promise<void>
const GOOGLE_OAUTH_FLOW_STORAGE_KEY = 'rocketboard.auth.google-flow'
const googleOAuthFlowTtlMs = 15 * 60 * 1000
const googleLinkCollisionErrorCodes = new Set([
  'email_exists',
  'user_already_exists',
])

const googleLinkCollisionMessageSnippets = [
  'already exists',
  'already registered',
  'existing account',
]

function readStringSearchParam(value: unknown) {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0]
  }

  return null
}

function readAuthRouteMode(value: unknown): AuthRouteSearch['mode'] {
  return readStringSearchParam(value) === 'link-google' ? 'link-google' : undefined
}

function isBlockedReturnTarget(value: string) {
  return (
    value === loginRoutePath
    || value.startsWith(`${loginRoutePath}?`)
    || value.startsWith(`${loginRoutePath}#`)
    || value === authCallbackRoutePath
    || value.startsWith(`${authCallbackRoutePath}?`)
    || value.startsWith(`${authCallbackRoutePath}#`)
  )
}

export function sanitizeReturnTo(value: unknown) {
  const normalizedValue = readStringSearchParam(value)?.trim()

  if (!normalizedValue || !normalizedValue.startsWith('/') || normalizedValue.startsWith('//')) {
    return undefined
  }

  if (isBlockedReturnTarget(normalizedValue)) {
    return undefined
  }

  return normalizedValue
}

export function validateAuthSearch(search: Record<string, unknown>): AuthRouteSearch {
  const returnTo = sanitizeReturnTo(search.r)
  const mode = readAuthRouteMode(search.mode)

  return {
    ...(mode ? {mode} : {}),
    ...(returnTo ? {r: returnTo} : {}),
  }
}

export function buildLoginHref(
  returnTo?: unknown,
  options?: {
    mode?: AuthRouteSearch['mode']
  },
) {
  const normalizedReturnTo = sanitizeReturnTo(returnTo)
  const normalizedMode = options?.mode

  if (!normalizedReturnTo && !normalizedMode) {
    return loginRoutePath
  }

  const params = new URLSearchParams()
  if (normalizedMode) {
    params.set('mode', normalizedMode)
  }

  if (normalizedReturnTo) {
    params.set('r', normalizedReturnTo)
  }

  return `${loginRoutePath}?${params.toString()}`
}

export function buildAuthCallbackUrl(options?: {
  oauthFlow?: string | null
  oauthNonce?: string | null
  returnTo?: unknown
}) {
  if (typeof window === 'undefined') {
    return null
  }

  const url = new URL(authCallbackRoutePath, window.location.origin)
  const normalizedReturnTo = sanitizeReturnTo(options?.returnTo)

  if (normalizedReturnTo) {
    url.searchParams.set('r', normalizedReturnTo)
  }

  if (options?.oauthFlow) {
    url.searchParams.set('oauth_flow', options.oauthFlow)
  }

  if (options?.oauthNonce) {
    url.searchParams.set('oauth_nonce', options.oauthNonce)
  }

  return url.toString()
}

export function getCurrentLocationHref() {
  if (typeof window === 'undefined') {
    return '/'
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function readCallbackParam(name: string) {
  if (typeof window === 'undefined') {
    return null
  }

  const queryParams = new URLSearchParams(window.location.search)
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))

  return hashParams.get(name) ?? queryParams.get(name)
}

function humanizeAuthErrorCode(value: string | null) {
  if (!value) {
    return null
  }

  return value.replaceAll('_', ' ')
}

function hasOwnProperty<ObjectShape extends object, Key extends PropertyKey>(
  object: ObjectShape,
  key: Key,
): object is ObjectShape & Record<Key, unknown> {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function createFlowId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizeGoogleOAuthFlow(value: Partial<GoogleOAuthFlow>) {
  const normalizedReturnTo = sanitizeReturnTo(value.returnTo)

  if (
    typeof value.createdAt !== 'number'
    || typeof value.flowId !== 'string'
    || (
      value.phase !== 'oauth-sign-in'
      && value.phase !== 'password-auth'
      && value.phase !== 'oauth-link'
    )
    || (
      value.redirectNonce !== null
      && typeof value.redirectNonce !== 'string'
    )
    || (
      value.linkingUserId !== undefined
      && typeof value.linkingUserId !== 'string'
    )
    || Date.now() - value.createdAt > googleOAuthFlowTtlMs
  ) {
    return null
  }

  return {
    createdAt: value.createdAt,
    flowId: value.flowId,
    ...(value.linkingUserId ? {linkingUserId: value.linkingUserId} : {}),
    phase: value.phase,
    redirectNonce: value.redirectNonce,
    ...(normalizedReturnTo ? {returnTo: normalizedReturnTo} : {}),
  } satisfies GoogleOAuthFlow
}

export function readAuthRedirectResult(): AuthRedirectResult | null {
  const code = readCallbackParam('error_code')
  const description = readCallbackParam('error_description')
  const error = readCallbackParam('error')
  const oauthFlow = readCallbackParam('oauth_flow')
  const oauthNonce = readCallbackParam('oauth_nonce')
  const returnTo = sanitizeReturnTo(readCallbackParam('r'))
  const message = description ?? error ?? humanizeAuthErrorCode(code)

  if (!code && !description && !error && !oauthFlow && !oauthNonce && !returnTo) {
    return null
  }

  return {
    code,
    description,
    error,
    message: message ?? 'Rocketboard could not complete Google sign-in.',
    oauthFlow,
    oauthNonce,
    ...(returnTo ? {returnTo} : {}),
  }
}

export function readAuthRedirectError() {
  return readAuthRedirectResult()?.message ?? null
}

export function createGoogleOAuthFlow(options?: {
  flowId?: string
  linkingUserId?: string
  phase?: GoogleOAuthFlowPhase
  returnTo?: unknown
}) {
  const normalizedReturnTo = sanitizeReturnTo(options?.returnTo)

  return {
    createdAt: Date.now(),
    ...(options?.flowId ? {flowId: options.flowId} : {flowId: createFlowId()}),
    ...(options?.linkingUserId ? {linkingUserId: options.linkingUserId} : {}),
    phase: options?.phase ?? 'oauth-sign-in',
    redirectNonce: createFlowId(),
    ...(normalizedReturnTo ? {returnTo: normalizedReturnTo} : {}),
  } satisfies GoogleOAuthFlow
}

export function persistGoogleOAuthFlow(flow: GoogleOAuthFlow) {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.setItem(GOOGLE_OAUTH_FLOW_STORAGE_KEY, JSON.stringify(flow))
}

export function clearGoogleOAuthFlow() {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.removeItem(GOOGLE_OAUTH_FLOW_STORAGE_KEY)
}

export function readGoogleOAuthFlow() {
  if (typeof window === 'undefined') {
    return null
  }

  const rawValue = window.sessionStorage.getItem(GOOGLE_OAUTH_FLOW_STORAGE_KEY)

  if (!rawValue) {
    return null
  }

  try {
    const parsedValue = normalizeGoogleOAuthFlow(JSON.parse(rawValue) as Partial<GoogleOAuthFlow>)

    if (!parsedValue) {
      clearGoogleOAuthFlow()
      return null
    }

    return parsedValue
  } catch {
    clearGoogleOAuthFlow()
    return null
  }
}

export function updateGoogleOAuthFlow(
  updates: Partial<{
    linkingUserId: string | undefined
    phase: GoogleOAuthFlowPhase
    redirectNonce: string | null
    returnTo: unknown
  }>,
) {
  const currentFlow = readGoogleOAuthFlow()
  const normalizedUpdatedReturnTo = hasOwnProperty(updates, 'returnTo')
    ? sanitizeReturnTo(updates.returnTo)
    : undefined

  if (!currentFlow) {
    return null
  }

  const nextFlow = {
    ...currentFlow,
    ...(hasOwnProperty(updates, 'linkingUserId') ? {linkingUserId: updates.linkingUserId} : {}),
    ...(updates.phase ? {phase: updates.phase} : {}),
    ...(hasOwnProperty(updates, 'redirectNonce') ? {redirectNonce: updates.redirectNonce ?? null} : {}),
    ...(hasOwnProperty(updates, 'returnTo') ? {returnTo: normalizedUpdatedReturnTo} : {}),
  } satisfies GoogleOAuthFlow

  persistGoogleOAuthFlow(nextFlow)

  return nextFlow
}

export function isGoogleOAuthFlowMatch(
  flow: GoogleOAuthFlow,
  correlation: {
    oauthFlow: string | null
    oauthNonce: string | null
  },
) {
  return (
    flow.flowId === correlation.oauthFlow
    && flow.redirectNonce !== null
    && flow.redirectNonce === correlation.oauthNonce
  )
}

export function isGoogleLinkCollisionRedirectError(result: AuthRedirectResult | null) {
  if (!result) {
    return false
  }

  if (result.code && googleLinkCollisionErrorCodes.has(result.code.toLowerCase())) {
    return true
  }

  const normalizedMessage = `${result.error ?? ''} ${result.description ?? ''}`.toLowerCase()

  return (
    normalizedMessage.includes('email')
    && googleLinkCollisionMessageSnippets.some((snippet) => normalizedMessage.includes(snippet))
  )
}

function isMissingRpcFunction(error: unknown, functionName: string) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const objectError = error as Record<string, unknown>
  const code = typeof objectError.code === 'string' ? objectError.code : null
  const message = typeof objectError.message === 'string' ? objectError.message : null
  const hint = typeof objectError.hint === 'string' ? objectError.hint : null
  const details = typeof objectError.details === 'string' ? objectError.details : null

  if (code !== 'PGRST202') {
    return false
  }

  return [message, hint, details].some((value) => value?.includes(functionName))
}

async function getPendingInviteRedirect() {
  try {
    return await setupRepository.getPendingInviteForCurrentUser()
  } catch (error) {
    if (isMissingRpcFunction(error, 'get_pending_invite_for_current_user')) {
      console.warn(
        'Rocketboard pending invite redirect RPC is unavailable. Continuing with standard post-auth routing.',
      )
      return null
    }

    console.error(
      'Rocketboard could not resolve pending invite redirect. Continuing with standard post-auth routing.',
      error,
    )
    return null
  }
}

export async function openPostAuthDestination(options: {
  navigate: NavigateFn
  queryClient: QueryClient
  replace?: boolean
  returnTo?: unknown
  userName?: string | null
}) {
  const normalizedReturnTo = sanitizeReturnTo(options.returnTo)

  if (normalizedReturnTo) {
    await options.navigate({
      href: normalizedReturnTo,
      replace: options.replace,
    })
    return
  }

  const pendingInvite = await getPendingInviteRedirect()

  if (pendingInvite?.acceptToken) {
    await options.navigate({
      href: buildAcceptInviteHref(pendingInvite.acceptToken, {autoAccept: true}),
      replace: options.replace,
    })
    return
  }

  const workspaces = await options.queryClient.fetchQuery(workspaceSummariesQueryOptions())
  const defaultRoute = getDefaultProjectRoute(workspaces)

  if (defaultRoute) {
    await options.navigate({
      href: buildProjectRouteHref(defaultRoute),
      replace: options.replace,
    })
    return
  }

  // Auto-bootstrap: create workspace with defaults and go straight to the shell
  try {
    const route = await setupRepository.bootstrapWorkspace({
      projectName: 'Main Workspace Board',
      workspaceName: 'Main Workspace',
    })
    const refreshed = await options.queryClient.fetchQuery({
      ...workspaceSummariesQueryOptions(),
      staleTime: 0,
    })
    const resolvedRoute = resolveProjectRouteTarget(refreshed, route) ?? getDefaultProjectRoute(refreshed)

    if (resolvedRoute) {
      await options.navigate({
        href: buildProjectRouteHref(resolvedRoute),
        replace: options.replace,
      })
      return
    }

    if (isProjectRouteTarget(route)) {
      await options.navigate({
        params: {
          orgSlug: route.orgSlug,
          projectSlug: route.projectSlug,
          workspaceSlug: route.workspaceSlug,
        },
        replace: options.replace,
        to: projectLayoutRoutePath,
      })
      return
    }

    await options.navigate({
      replace: options.replace,
      to: onboardingRoutePath,
    })
  } catch {
    // Bootstrap may have failed because a workspace was already created (race condition).
    // Re-fetch and try to route. Never show the onboarding form.
    const refreshed = await options.queryClient.fetchQuery({
      ...workspaceSummariesQueryOptions(),
      staleTime: 0,
    })
    const retryRoute = getDefaultProjectRoute(refreshed)

    if (retryRoute) {
      await options.navigate({
        href: buildProjectRouteHref(retryRoute),
        replace: options.replace,
      })
    } else {
      // Truly no workspace and bootstrap failed. Go to onboarding as last resort.
      await options.navigate({
        replace: options.replace,
        to: onboardingRoutePath,
      })
    }
  }
}
