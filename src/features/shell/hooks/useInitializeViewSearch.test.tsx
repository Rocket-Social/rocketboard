/** @vitest-environment jsdom */

import {cleanup, renderHook, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {useInitializeViewSearch} from './useInitializeViewSearch'

type SearchParams = {
  person?: string
  sort?: string
}

type SharedBaseline = {
  person?: string
  sort?: string
}

describe('useInitializeViewSearch', () => {
  afterEach(() => {
    cleanup()
  })

  it('initializes empty search from the shared baseline once per route key', async () => {
    const navigate = vi.fn()
    const sharedBaseline = {person: 'user-1'}

    const {rerender} = renderHook(({routeKey}: {routeKey: string}) => useInitializeViewSearch<SearchParams, SharedBaseline>({
      buildSearchParams: (baseline) => baseline,
      navigate,
      routeKey,
      search: {},
      sharedBaseline,
    }), {
      initialProps: {routeKey: 'project-1:view-1'},
    })

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
    expect(navigate.mock.calls[0]?.[0].search()).toEqual(sharedBaseline)

    navigate.mockClear()
    rerender({routeKey: 'project-1:view-1'})
    expect(navigate).not.toHaveBeenCalled()

    rerender({routeKey: 'project-2:view-2'})
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
    expect(navigate.mock.calls[0]?.[0].search()).toEqual(sharedBaseline)
  })

  it('waits for the baseline to be ready before initializing', async () => {
    const navigate = vi.fn()

    const {rerender} = renderHook(({isBaselineReady}: {isBaselineReady: boolean}) => useInitializeViewSearch<SearchParams, SharedBaseline>({
      buildSearchParams: (baseline) => baseline,
      isBaselineReady,
      navigate,
      routeKey: 'project-1:view-1',
      search: {},
      sharedBaseline: {person: 'user-1'},
    }), {
      initialProps: {isBaselineReady: false},
    })

    expect(navigate).not.toHaveBeenCalled()

    rerender({isBaselineReady: true})
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
    expect(navigate.mock.calls[0]?.[0].search()).toEqual({person: 'user-1'})
  })

  it('does not overwrite a route entered with explicit search params', () => {
    const navigate = vi.fn()

    renderHook(() => useInitializeViewSearch<SearchParams, SharedBaseline>({
      buildSearchParams: (baseline) => baseline,
      isBaselineReady: true,
      navigate,
      routeKey: 'project-1:view-1',
      search: {person: 'user-1'},
      sharedBaseline: {sort: 'title:asc'},
    }))

    expect(navigate).not.toHaveBeenCalled()
  })

  it('merges shared-only fields after a personal bootstrap', async () => {
    const navigate = vi.fn()

    const {rerender} = renderHook(({isBaselineReady}: {isBaselineReady: boolean}) => useInitializeViewSearch<SearchParams, SharedBaseline>({
      buildSearchParams: (baseline) => baseline,
      getPersonalConfig: () => ({person: 'user-2'}),
      isBaselineReady,
      mergePersonalWithShared: (personal, shared) => ({...shared, ...personal}),
      navigate,
      routeKey: 'project-1:view-1',
      search: {},
      sharedBaseline: {sort: 'title:asc'},
    }), {
      initialProps: {isBaselineReady: false},
    })

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
    expect(navigate.mock.calls[0]?.[0].search()).toEqual({person: 'user-2'})

    rerender({isBaselineReady: true})

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(2))
    expect(navigate.mock.calls[1]?.[0].search()).toEqual({person: 'user-2', sort: 'title:asc'})
  })

  it('merges personal and shared fields in one navigation when the baseline is already ready', async () => {
    const navigate = vi.fn()

    renderHook(() => useInitializeViewSearch<SearchParams, SharedBaseline>({
      buildSearchParams: (baseline) => baseline,
      getPersonalConfig: () => ({person: 'user-2'}),
      isBaselineReady: true,
      mergePersonalWithShared: (personal, shared) => ({...shared, ...personal}),
      navigate,
      routeKey: 'project-1:view-1',
      search: {},
      sharedBaseline: {sort: 'title:asc'},
    }))

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
    expect(navigate.mock.calls[0]?.[0].search()).toEqual({person: 'user-2', sort: 'title:asc'})
  })
})
