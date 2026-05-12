import {ArrowRight, LockKeyhole, RotateCcw} from 'lucide-react'
import {useNavigate} from '@tanstack/react-router'
import {useEffect, useState} from 'react'

import {Button} from '../../components/ui/button'
import {Input} from '../../components/ui/input'
import {authAdapter} from '../../platform/auth/auth-adapter'
import {loginRoutePath} from './auth.routes'
import {useSessionQuery, useUpdateAccountPasswordMutation} from './session.queries'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const sessionQuery = useSessionQuery()
  const {refetch} = sessionQuery
  const updatePasswordMutation = useUpdateAccountPasswordMutation()
  const [confirmPassword, setConfirmPassword] = useState('')
  const [password, setPassword] = useState('')
  const [ready, setReady] = useState(false)
  const [wasUpdated, setWasUpdated] = useState(false)

  useEffect(() => {
    let cancelled = false

    const bootstrapRecoverySession = async () => {
      await authAdapter.getSession()

      if (cancelled) {
        return
      }

      await refetch()
      setReady(true)
    }

    void bootstrapRecoverySession()

    return () => {
      cancelled = true
    }
  }, [refetch])

  const errorMessage =
    updatePasswordMutation.error instanceof Error ? updatePasswordMutation.error.message : null
  const passwordsMatch = password.trim() && password === confirmPassword

  const handleSubmit = () => {
    if (!passwordsMatch) {
      return
    }

    updatePasswordMutation.mutate(
      {
        password,
      },
      {
        onSuccess: () => {
          setConfirmPassword('')
          setPassword('')
          setWasUpdated(true)
        },
      },
    )
  }

  if (!ready || sessionQuery.isPending) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-canvas p-6'>
        <div className='w-full max-w-lg rounded-[32px] border border-border-subtle bg-surface-elevated p-8 shadow-elevated'>
          <p className='font-mono text-xs uppercase tracking-[0.24em] text-text-muted'>Account Recovery</p>
          <h1 className='mt-4 font-display text-3xl font-semibold text-text-strong'>Preparing password reset…</h1>
          <p className='mt-3 text-sm leading-relaxed text-text-medium'>
            Rocketboard is validating the recovery link and opening a temporary reset session.
          </p>
        </div>
      </div>
    )
  }

  if (sessionQuery.data?.status !== 'authenticated') {
    return (
      <div className='flex min-h-screen items-center justify-center bg-canvas p-6'>
        <div className='w-full max-w-lg rounded-[32px] border border-border-subtle bg-surface-elevated p-8 shadow-elevated'>
          <p className='font-mono text-xs uppercase tracking-[0.24em] text-text-muted'>Account Recovery</p>
          <h1 className='mt-4 font-display text-3xl font-semibold text-text-strong'>This reset link is not usable.</h1>
          <p className='mt-3 text-sm leading-relaxed text-text-medium'>
            The password-reset session is missing or expired. Request a new reset email from the sign-in screen.
          </p>
          <Button className='mt-6' onClick={() => void navigate({to: loginRoutePath})} variant='primary'>
            Back to sign in
            <ArrowRight className='h-4 w-4'/>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className='flex min-h-screen items-center justify-center bg-canvas p-6'>
      <div className='w-full max-w-xl rounded-[32px] border border-border-subtle bg-surface-elevated p-8 shadow-elevated'>
        <p className='font-mono text-xs uppercase tracking-[0.24em] text-text-muted'>Account Recovery</p>
        <h1 className='mt-4 font-display text-3xl font-semibold text-text-strong'>Choose a new password</h1>
        <p className='mt-3 text-sm leading-relaxed text-text-medium'>
          This recovery session is active for {sessionQuery.data.user.email}. Set a new password, then go back into the app.
        </p>

        <div className='mt-8 space-y-4'>
          <label className='space-y-2'>
            <span className='text-sm font-medium text-text-strong'>New password</span>
            <Input
              autoComplete='new-password'
              onChange={(event) => setPassword(event.target.value)}
              placeholder='At least 8 characters'
              type='password'
              value={password}
            />
          </label>

          <label className='space-y-2'>
            <span className='text-sm font-medium text-text-strong'>Confirm password</span>
            <Input
              autoComplete='new-password'
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder='Repeat the new password'
              type='password'
              value={confirmPassword}
            />
          </label>

          {!passwordsMatch && confirmPassword ? (
            <div className='rounded-2xl border border-error/20 bg-error/10 px-3 py-2 text-sm text-error'>
              The passwords need to match before you can save them.
            </div>
          ) : null}

          {errorMessage ? (
            <div className='rounded-2xl border border-error/20 bg-error/10 px-3 py-2 text-sm text-error'>
              {errorMessage}
            </div>
          ) : null}

          {wasUpdated ? (
            <div className='rounded-2xl border border-success/20 bg-success/10 px-3 py-2 text-sm text-success'>
              Your password has been updated. You can open Rocketboard directly now.
            </div>
          ) : null}
        </div>

        <div className='mt-6 flex flex-wrap justify-end gap-3'>
          <Button onClick={() => void navigate({to: loginRoutePath})} variant='ghost'>
            <RotateCcw className='h-4 w-4'/>
            Back to sign in
          </Button>
          <Button
            disabled={!passwordsMatch || password.trim().length < 8 || updatePasswordMutation.isPending}
            onClick={handleSubmit}
            variant='primary'
          >
            <LockKeyhole className='h-4 w-4'/>
            {updatePasswordMutation.isPending ? 'Updating…' : 'Update password'}
          </Button>
        </div>
      </div>
    </div>
  )
}
