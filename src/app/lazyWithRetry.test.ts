import {describe, expect, it, vi} from 'vitest'

import {recoverLazyImportFailure} from './lazyWithRetry'

function buildLazyRetryKey(importSource: string) {
  return `lazyRetry:${importSource.slice(0, 120)}`
}

function createSessionStorageDouble(initialValue: string | null = null) {
  let value = initialValue

  return {
    getItem: vi.fn(() => value),
    removeItem: vi.fn(() => {
      value = null
    }),
    setItem: vi.fn((_: string, nextValue: string) => {
      value = nextValue
    }),
  }
}

describe('recoverLazyImportFailure', () => {
  it('reloads once for route-level lazy imports', () => {
    const location = {
      href: 'https://rocketboard.app/workspaces/test-workspace/projects/product-team/table/view-1',
      replace: vi.fn(),
    }
    const sessionStorage = createSessionStorageDouble()
    const result = recoverLazyImportFailure(
      new Error('Chunk load failed'),
      '() => import("./TableView")',
      {recovery: 'reload'},
      {location, sessionStorage},
    )

    expect(result).toBeInstanceOf(Promise)
    expect(sessionStorage.setItem).toHaveBeenCalledWith(buildLazyRetryKey('() => import("./TableView")'), '1')
    expect(location.replace).toHaveBeenCalledTimes(1)
    expect(location.replace.mock.calls[0]?.[0]).toMatch(/\?_cb=|\&_cb=/)
  })

  it('throws after the one-time reload guard has already been used', () => {
    const location = {
      href: 'https://rocketboard.app/workspaces/test-workspace/projects/product-team/table/view-1',
      replace: vi.fn(),
    }
    const sessionStorage = createSessionStorageDouble('1')

    expect(() =>
      recoverLazyImportFailure(
        new Error('Chunk load failed'),
        '() => import("./TableView")',
        {recovery: 'reload'},
        {location, sessionStorage},
      ),
    ).toThrow('Chunk load failed')

    expect(location.replace).not.toHaveBeenCalled()
    expect(sessionStorage.removeItem).toHaveBeenCalledWith(buildLazyRetryKey('() => import("./TableView")'))
  })

  it('fails locally for interactive surfaces instead of reloading the page', () => {
    const location = {
      href: 'https://rocketboard.app/workspaces/test-workspace/projects/product-team/table/view-1',
      replace: vi.fn(),
    }
    const sessionStorage = createSessionStorageDouble('1')

    expect(() =>
      recoverLazyImportFailure(
        new Error('Chunk load failed'),
        '() => import("./BulkActionsBar")',
        {recovery: 'error-boundary'},
        {location, sessionStorage},
      ),
    ).toThrow('Chunk load failed')

    expect(location.replace).not.toHaveBeenCalled()
    expect(sessionStorage.removeItem).toHaveBeenCalledWith(buildLazyRetryKey('() => import("./BulkActionsBar")'))
  })
})
