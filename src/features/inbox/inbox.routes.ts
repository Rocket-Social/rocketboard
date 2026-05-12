export const inboxRoutePath = '/inbox' as const

export type InboxRouteSearch = {
  tab?: 'inbox' | 'all'
}

function readSearchString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return null
}

export function validateInboxSearch(
  search: Record<string, unknown>,
): InboxRouteSearch {
  const raw = readSearchString(search.tab)
  return raw === 'all' ? {tab: 'all'} : {}
}
