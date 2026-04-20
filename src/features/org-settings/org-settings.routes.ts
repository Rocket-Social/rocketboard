export const orgSettingsTabValues = ['overview', 'members', 'billing', 'invoices', 'github'] as const
export type OrgSettingsTab = (typeof orgSettingsTabValues)[number]

export type OrgSettingsRouteSearch = {
  tab?: OrgSettingsTab
}

export function validateOrgSettingsSearch(search: Record<string, unknown>): OrgSettingsRouteSearch {
  const raw = typeof search.tab === 'string' ? search.tab : undefined
  if (raw === 'organization') return {tab: 'overview'}
  const tab = orgSettingsTabValues.includes(raw as OrgSettingsTab) ? (raw as OrgSettingsTab) : undefined

  return tab ? {tab} : {}
}
