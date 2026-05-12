import {useEffect, useRef, useState} from 'react'

import {hasExplicitSearchParams} from '../view-search-params'

type UseInitializeViewSearchOptions<TSearch extends Record<string, unknown>, TSharedBaseline> = {
  buildSearchParams: (sharedBaseline: TSharedBaseline) => TSearch
  getPersonalConfig?: () => Partial<TSharedBaseline> | null
  isBaselineReady?: boolean
  mergePersonalWithShared?: (personal: Partial<TSharedBaseline>, shared: TSharedBaseline) => TSharedBaseline
  navigate: (options: {replace: true; search: () => TSearch}) => void | Promise<void>
  routeKey: string
  search: TSearch
  sharedBaseline: TSharedBaseline
}

function getSearchInitializationKey(search: Record<string, unknown>) {
  return JSON.stringify(
    Object.entries(search)
      .filter(([, value]) => value !== undefined)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey)),
  )
}

/**
 * Applies the shared baseline to routes that were entered without explicit
 * search params. Supports two-phase initialization:
 *
 * Phase 1: If getPersonalConfig returns data, initialize immediately from
 *          personal config (before isBaselineReady).
 * Phase 2: When isBaselineReady becomes true, patch in shared-only fields
 *          from the shared baseline using mergePersonalWithShared.
 *
 * If no personal config exists, falls back to waiting for the shared baseline
 * (original behavior).
 *
 * Returns true once the current route's initial search resolution has settled,
 * including any navigate needed to restore personal or shared state.
 */
export function useInitializeViewSearch<TSearch extends Record<string, unknown>, TSharedBaseline>({
  buildSearchParams,
  getPersonalConfig,
  isBaselineReady = true,
  mergePersonalWithShared,
  navigate,
  routeKey,
  search,
  sharedBaseline,
}: UseInitializeViewSearchOptions<TSearch, TSharedBaseline>) {
  const initializedRouteKeyRef = useRef<string | null>(null)
  const personalInitializedRef = useRef<string | null>(null)
  const pendingNavigationRouteKeyRef = useRef<string | null>(null)
  const pendingSearchKeyRef = useRef<string | null>(null)
  const [initializedSearchRouteKey, setInitializedSearchRouteKey] = useState<string | null>(null)
  const currentSearchKey = getSearchInitializationKey(search)

  useEffect(() => {
    const clearInitializedState = () => {
      if (initializedSearchRouteKey === routeKey) {
        setInitializedSearchRouteKey(null)
      }
    }

    const markInitializedState = () => {
      if (initializedSearchRouteKey !== routeKey) {
        setInitializedSearchRouteKey(routeKey)
      }
    }

    const navigateToSearch = (
      nextSearch: TSearch,
      {
        finalize,
        markPersonalInitialized = false,
      }: {
        finalize: boolean
        markPersonalInitialized?: boolean
      },
    ) => {
      if (markPersonalInitialized) {
        personalInitializedRef.current = routeKey
      }

      if (finalize) {
        initializedRouteKeyRef.current = routeKey
      }

      const nextSearchKey = getSearchInitializationKey(nextSearch)
      if (nextSearchKey === currentSearchKey) {
        pendingNavigationRouteKeyRef.current = null
        pendingSearchKeyRef.current = null
        if (finalize) {
          markInitializedState()
        } else {
          clearInitializedState()
        }
        return
      }

      pendingNavigationRouteKeyRef.current = routeKey
      pendingSearchKeyRef.current = nextSearchKey
      clearInitializedState()
      void navigate({
        replace: true,
        search: () => nextSearch,
      })
    }

    if (pendingNavigationRouteKeyRef.current === routeKey) {
      if (pendingSearchKeyRef.current !== currentSearchKey) {
        clearInitializedState()
        return
      }

      pendingNavigationRouteKeyRef.current = null
      pendingSearchKeyRef.current = null
    }

    if (initializedRouteKeyRef.current === routeKey) {
      markInitializedState()
      return
    }

    const enteredWithExplicitSearch = hasExplicitSearchParams(search)

    // Explicit URL params trump personal config except when a `mergePersonalWithShared`
    // is provided — in that case we still layer personal over shared so partial URLs
    // (e.g. a stale `?groupBy=status` link) don't wipe the user's persisted dateRange
    // / timeScale. The merge fn is expected to let URL params win over personal for
    // fields that *are* present in the URL (see GanttViewRoute for the pattern).
    if (enteredWithExplicitSearch && personalInitializedRef.current !== routeKey && !mergePersonalWithShared) {
      initializedRouteKeyRef.current = routeKey
      personalInitializedRef.current = routeKey
      markInitializedState()
      return
    }

    // When a route provides mergePersonalWithShared, we need the original explicit
    // search object to survive until the shared baseline is ready. Otherwise phase 1
    // would rewrite the URL to raw personal config and we would lose the explicit
    // keys before the merge function has a chance to reapply them.
    if (enteredWithExplicitSearch && mergePersonalWithShared && !isBaselineReady) {
      clearInitializedState()
      return
    }

    // Phase 1: Initialize from personal config immediately. If the shared
    // baseline is already ready, merge once and skip the intermediate bounce.
    if (getPersonalConfig && personalInitializedRef.current !== routeKey) {
      const personalConfig = getPersonalConfig()
      if (personalConfig) {
        if (isBaselineReady && mergePersonalWithShared) {
          const merged = mergePersonalWithShared(personalConfig, sharedBaseline)
          navigateToSearch(buildSearchParams(merged), {
            finalize: true,
            markPersonalInitialized: true,
          })
          return
        }

        navigateToSearch(buildSearchParams(personalConfig as TSharedBaseline), {
          finalize: false,
          markPersonalInitialized: true,
        })
        return
      }
    }

    // Phase 2: Patch shared fields once baseline is ready, or full init if no
    // personal config exists.
    if (!isBaselineReady) {
      clearInitializedState()
      return
    }

    // If we already initialized from personal config, merge in shared-only fields
    if (personalInitializedRef.current === routeKey && mergePersonalWithShared) {
      const personalConfig = getPersonalConfig?.()
      if (personalConfig) {
        const merged = mergePersonalWithShared(personalConfig, sharedBaseline)
        navigateToSearch(buildSearchParams(merged), {
          finalize: true,
        })
        return
      }
    }

    // No personal config — use shared baseline entirely (original behavior)
    if (enteredWithExplicitSearch && mergePersonalWithShared) {
      personalInitializedRef.current = routeKey
      const merged = mergePersonalWithShared({}, sharedBaseline)
      navigateToSearch(buildSearchParams(merged), {
        finalize: true,
      })
      return
    }

    // No personal config and no explicit search to preserve — use the shared
    // baseline entirely.
    personalInitializedRef.current = routeKey
    navigateToSearch(buildSearchParams(sharedBaseline), {
      finalize: true,
    })
  }, [
    buildSearchParams,
    currentSearchKey,
    getPersonalConfig,
    initializedSearchRouteKey,
    isBaselineReady,
    mergePersonalWithShared,
    navigate,
    routeKey,
    search,
    sharedBaseline,
  ])

  return initializedSearchRouteKey === routeKey
}
