// @vitest-environment jsdom
import {renderHook} from '@testing-library/react'
import type {KeyboardEvent} from 'react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {useInviteFormHandler} from './useInviteFormHandler'

const toastMock = vi.fn()

vi.mock('../../components/ui/toast', () => ({
  useToast: () => ({toast: toastMock}),
}))

function makeKeyEvent(key: string): KeyboardEvent<HTMLInputElement> {
  return {key} as unknown as KeyboardEvent<HTMLInputElement>
}

describe('useInviteFormHandler', () => {
  beforeEach(() => {
    toastMock.mockReset()
  })

  it('toasts and skips onValid when email is empty', () => {
    const onValid = vi.fn()
    const {result} = renderHook(() =>
      useInviteFormHandler({email: '   ', isPending: false, onValid}),
    )

    result.current.handleSubmit()

    expect(toastMock).toHaveBeenCalledWith({title: 'Enter an email address', variant: 'error'})
    expect(onValid).not.toHaveBeenCalled()
  })

  it('toasts and skips onValid when email is not a valid format', () => {
    const onValid = vi.fn()
    const {result} = renderHook(() =>
      useInviteFormHandler({email: 'Name <foo@bar.com>', isPending: false, onValid}),
    )

    result.current.handleSubmit()

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'That email format is not valid',
        variant: 'error',
      }),
    )
    expect(onValid).not.toHaveBeenCalled()
  })

  it('calls onValid with the trimmed email when valid', () => {
    const onValid = vi.fn()
    const {result} = renderHook(() =>
      useInviteFormHandler({email: '  alice@example.com  ', isPending: false, onValid}),
    )

    result.current.handleSubmit()

    expect(onValid).toHaveBeenCalledWith('alice@example.com')
    expect(toastMock).not.toHaveBeenCalled()
  })

  it('skips submission when isPending is true', () => {
    const onValid = vi.fn()
    const {result} = renderHook(() =>
      useInviteFormHandler({email: 'alice@example.com', isPending: true, onValid}),
    )

    result.current.handleSubmit()

    expect(onValid).not.toHaveBeenCalled()
    expect(toastMock).not.toHaveBeenCalled()
  })

  it('skips submission when guard is false', () => {
    const onValid = vi.fn()
    const {result} = renderHook(() =>
      useInviteFormHandler({email: 'alice@example.com', guard: false, isPending: false, onValid}),
    )

    result.current.handleSubmit()

    expect(onValid).not.toHaveBeenCalled()
  })

  it('handleKeyDown fires submit on Enter only', () => {
    const onValid = vi.fn()
    const {result} = renderHook(() =>
      useInviteFormHandler({email: 'alice@example.com', isPending: false, onValid}),
    )

    result.current.handleKeyDown(makeKeyEvent('a'))
    expect(onValid).not.toHaveBeenCalled()

    result.current.handleKeyDown(makeKeyEvent('Enter'))
    expect(onValid).toHaveBeenCalledWith('alice@example.com')
  })
})
