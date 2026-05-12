export const onboardingRoutePath = '/onboarding' as const
export const acceptInviteRoutePath = '/accept-invite/$inviteToken' as const

export type AcceptInviteRouteSearch = {
  autoAccept?: true
}

function readBooleanSearchParam(value: unknown) {
  if (value === true || value === 'true' || value === '1') {
    return true
  }

  if (Array.isArray(value)) {
    return value.some((entry) => entry === true || entry === 'true' || entry === '1')
  }

  return false
}

export function validateAcceptInviteSearch(search: Record<string, unknown>): AcceptInviteRouteSearch {
  return readBooleanSearchParam(search.autoAccept) ? {autoAccept: true} : {}
}

export function buildAcceptInviteHref(inviteToken: string, options?: {autoAccept?: boolean}) {
  const normalizedToken = encodeURIComponent(inviteToken)
  const url = new URL(`/accept-invite/${normalizedToken}`, 'https://rocketboard.app')

  if (options?.autoAccept) {
    url.searchParams.set('autoAccept', '1')
  }

  return `${url.pathname}${url.search}`
}
