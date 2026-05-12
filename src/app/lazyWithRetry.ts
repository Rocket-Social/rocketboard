import {lazy} from 'react'
import type {ComponentType, LazyExoticComponent} from 'react'

export type LazyImportRecovery = 'reload' | 'error-boundary'

type LazyWithRetryOptions = {
  recovery?: LazyImportRecovery
}

type LazyImportFailureDeps = {
  location: Pick<Location, 'href' | 'replace'>
  sessionStorage: Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>
}

export function recoverLazyImportFailure<T>(
  error: unknown,
  importSource: string,
  options: LazyWithRetryOptions = {},
  deps: LazyImportFailureDeps = {
    location: window.location,
    sessionStorage: window.sessionStorage,
  },
) {
  const recovery = options.recovery ?? 'reload'
  const chunkKey = `lazyRetry:${importSource.slice(0, 120)}`

  if (recovery === 'reload') {
    const hasReloaded = deps.sessionStorage.getItem(chunkKey)

    if (!hasReloaded) {
      deps.sessionStorage.setItem(chunkKey, '1')
      // Cache-busting reload: append a timestamp query param to force
      // the browser to fetch a fresh index.html from the server.
      const url = new URL(deps.location.href)
      url.searchParams.set('_cb', Date.now().toString())
      deps.location.replace(url.toString())
      return new Promise<{default: T}>(() => {})
    }
  }

  deps.sessionStorage.removeItem(chunkKey)
  throw error
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{default: T}>,
  options?: LazyWithRetryOptions,
) {
  const importSource = importFn.toString()
  const load = () => importFn().catch((error: unknown) => recoverLazyImportFailure<T>(error, importSource, options))
  const component = lazy(load) as LazyExoticComponent<T> & {
    preload: () => Promise<void>
  }

  component.preload = () => importFn().then(() => {})

  return component
}
