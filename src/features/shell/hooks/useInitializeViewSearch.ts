import {useEffect, useRef} from 'react'

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

  useEffect(() => {
    if (initializedRouteKeyRef.current === routeKey) {
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
      return
    }

    // Phase 1: Initialize from personal config immediately. If the shared
    // baseline is already ready, merge once and skip the intermediate bounce.
    if (getPersonalConfig && personalInitializedRef.current !== routeKey) {
      const personalConfig = getPersonalConfig()
      if (personalConfig) {
        personalInitializedRef.current = routeKey
        if (isBaselineReady && mergePersonalWithShared) {
          initializedRouteKeyRef.current = routeKey
          const merged = mergePersonalWithShared(personalConfig, sharedBaseline)
          void navigate({
            replace: true,
            search: () => buildSearchParams(merged),
          })
          return
        }

        void navigate({
          replace: true,
          search: () => buildSearchParams(personalConfig as TSharedBaseline),
        })
        return
      }
    }

    // Phase 2: Patch shared fields once baseline is ready, or full init if no
    // personal config exists.
    if (!isBaselineReady) {
      return
    }

    initializedRouteKeyRef.current = routeKey

    // If we already initialized from personal config, merge in shared-only fields
    if (personalInitializedRef.current === routeKey && mergePersonalWithShared) {
      const personalConfig = getPersonalConfig?.()
      if (personalConfig) {
        const merged = mergePersonalWithShared(personalConfig, sharedBaseline)
        void navigate({
          replace: true,
          search: () => buildSearchParams(merged),
        })
        return
      }
    }

    // No personal config — use shared baseline entirely (original behavior)
    personalInitializedRef.current = routeKey
    void navigate({
      replace: true,
      search: () => buildSearchParams(sharedBaseline),
    })
  }, [buildSearchParams, getPersonalConfig, isBaselineReady, mergePersonalWithShared, navigate, routeKey, search, sharedBaseline])
}
