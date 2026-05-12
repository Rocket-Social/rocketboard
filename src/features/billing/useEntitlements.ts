import {useCallback, useMemo} from 'react'

import {useOrgEntitlementsQuery, useOrgUsageQuery} from './entitlement.queries'
import {getEffectivePlan, isWithinLimit, type PlanTier, type UsageLimits} from './entitlement.types'

export type UseEntitlementsResult = {
  // Plan info
  effectivePlan: PlanTier
  isPro: boolean
  isLoading: boolean

  // Usage remaining (-1 = unlimited)
  membersRemaining: number
  projectsRemaining: number
  workspacesRemaining: number
  storageRemaining: number // MB

  // Limit checks
  isAtLimit: (limitKey: keyof UsageLimits) => boolean

  // Actions
  showUpgradeModal: () => void
}

// Module-level callback for upgrade modal
let upgradeModalCallback: (() => void) | null = null

export function setUpgradeModalCallback(callback: () => void): void {
  upgradeModalCallback = callback
}

export function clearUpgradeModalCallback(): void {
  upgradeModalCallback = null
}

function getRemaining(current: number, max: number): number {
  if (max === -1) return -1 // unlimited
  return Math.max(0, max - current)
}

export function useEntitlements(orgId: string): UseEntitlementsResult {
  const entitlementsQuery = useOrgEntitlementsQuery(orgId)
  const usageQuery = useOrgUsageQuery(orgId)

  const entitlements = entitlementsQuery.data
  const usage = usageQuery.data
  const isLoading = entitlementsQuery.isPending || usageQuery.isPending

  const effectivePlan = useMemo(
    () => (entitlements ? getEffectivePlan(entitlements) : 'free'),
    [entitlements],
  )

  const isPro = effectivePlan === 'pro' || effectivePlan === 'enterprise'

  const limits = useMemo(() => usage?.limits ?? {members: 5, projects: 10, workspaces: 1, storage_mb: 1024}, [usage])

  const membersRemaining = useMemo(
    () => (usage ? getRemaining(usage.memberCount, limits.members) : -1),
    [usage, limits],
  )

  const projectsRemaining = useMemo(
    () => (usage ? getRemaining(usage.projectCount, limits.projects) : -1),
    [usage, limits],
  )

  const workspacesRemaining = useMemo(
    () => (usage ? getRemaining(usage.workspaceCount, limits.workspaces) : -1),
    [usage, limits],
  )

  const storageRemaining = useMemo(() => {
    if (!usage) return -1
    if (limits.storage_mb === -1) return -1
    const usedMb = Math.round(usage.storageUsedBytes / (1024 * 1024))
    return Math.max(0, limits.storage_mb - usedMb)
  }, [usage, limits])

  const isAtLimit = useCallback(
    (limitKey: keyof UsageLimits): boolean => {
      if (!usage) return false // fail open
      const current =
        limitKey === 'members'
          ? usage.memberCount
          : limitKey === 'projects'
            ? usage.projectCount
            : limitKey === 'workspaces'
              ? usage.workspaceCount
              : limitKey === 'storage_mb'
                ? Math.round(usage.storageUsedBytes / (1024 * 1024))
                : 0
      return !isWithinLimit(limits, limitKey, current)
    },
    [usage, limits],
  )

  const showUpgradeModal = useCallback(() => {
    if (upgradeModalCallback) {
      upgradeModalCallback()
    } else {
      console.warn('Upgrade modal callback not set.')
    }
  }, [])

  return {
    effectivePlan,
    isPro,
    isLoading,
    membersRemaining,
    projectsRemaining,
    workspacesRemaining,
    storageRemaining,
    isAtLimit,
    showUpgradeModal,
  }
}
