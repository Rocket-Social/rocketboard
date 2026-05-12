/** @vitest-environment jsdom */

import {act, cleanup, renderHook} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {useAutoSavePersonalConfig} from './useAutoSavePersonalConfig'

type HookProps = {
  config: {value: number}
  options?: {
    debounceMs?: number
    enabled?: boolean
    flushOnViewChange?: boolean
  }
  viewId: string
}

function renderAutoSaveHook(saveFn: ReturnType<typeof vi.fn>, initialProps: HookProps) {
  return renderHook((props: HookProps) =>
    useAutoSavePersonalConfig(props.viewId, props.config, saveFn, props.options),
  {
    initialProps,
  })
}

describe('useAutoSavePersonalConfig', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('debounces saves and skips the initial render', async () => {
    const saveFn = vi.fn()
    const {rerender} = renderAutoSaveHook(saveFn, {
      config: {value: 1},
      options: {debounceMs: 200},
      viewId: 'view-1',
    })

    rerender({
      config: {value: 2},
      options: {debounceMs: 200},
      viewId: 'view-1',
    })
    rerender({
      config: {value: 3},
      options: {debounceMs: 200},
      viewId: 'view-1',
    })

    expect(saveFn).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(199)
    })

    expect(saveFn).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(saveFn).toHaveBeenCalledTimes(1)
    expect(saveFn).toHaveBeenLastCalledWith('view-1', {value: 3})
  })

  it('flushes pending saves on unmount', () => {
    const saveFn = vi.fn()
    const {rerender, unmount} = renderAutoSaveHook(saveFn, {
      config: {value: 1},
      options: {debounceMs: 200},
      viewId: 'view-1',
    })

    rerender({
      config: {value: 2},
      options: {debounceMs: 200},
      viewId: 'view-1',
    })

    unmount()

    expect(saveFn).toHaveBeenCalledTimes(1)
    expect(saveFn).toHaveBeenLastCalledWith('view-1', {value: 2})
  })

  it('flushes the previous view before a board switch and skips the first render after re-enabling', async () => {
    const saveFn = vi.fn()
    const {rerender} = renderAutoSaveHook(saveFn, {
      config: {value: 1},
      options: {debounceMs: 200, enabled: true, flushOnViewChange: true},
      viewId: 'view-1',
    })

    rerender({
      config: {value: 2},
      options: {debounceMs: 200, enabled: true, flushOnViewChange: true},
      viewId: 'view-1',
    })

    rerender({
      config: {value: 10},
      options: {debounceMs: 200, enabled: false, flushOnViewChange: true},
      viewId: 'view-2',
    })

    expect(saveFn).toHaveBeenCalledTimes(1)
    expect(saveFn).toHaveBeenLastCalledWith('view-1', {value: 2})

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })

    expect(saveFn).toHaveBeenCalledTimes(1)

    rerender({
      config: {value: 10},
      options: {debounceMs: 200, enabled: true, flushOnViewChange: true},
      viewId: 'view-2',
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })

    expect(saveFn).toHaveBeenCalledTimes(1)

    rerender({
      config: {value: 11},
      options: {debounceMs: 200, enabled: true, flushOnViewChange: true},
      viewId: 'view-2',
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(saveFn).toHaveBeenCalledTimes(2)
    expect(saveFn).toHaveBeenLastCalledWith('view-2', {value: 11})
  })

  it('keeps flush-on-view-change opt-in', () => {
    const saveFn = vi.fn()
    const {rerender} = renderAutoSaveHook(saveFn, {
      config: {value: 1},
      options: {debounceMs: 200},
      viewId: 'view-1',
    })

    rerender({
      config: {value: 2},
      options: {debounceMs: 200},
      viewId: 'view-1',
    })
    rerender({
      config: {value: 10},
      options: {debounceMs: 200, enabled: false},
      viewId: 'view-2',
    })

    expect(saveFn).not.toHaveBeenCalled()
  })
})
