import {AlertTriangle, ArrowLeft, RefreshCw} from 'lucide-react'
import {Link} from '@tanstack/react-router'

function isChunkLoadError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message
    return msg.includes('dynamically imported module') || msg.includes('Loading chunk') || msg.includes('Loading CSS chunk')
  }
  return false
}

function getAppErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  if (error && typeof error === 'object') {
    const objectError = error as Record<string, unknown>

    if (typeof objectError.message === 'string' && objectError.message.trim().length > 0) {
      return objectError.message
    }

    if (typeof objectError.details === 'string' && objectError.details.trim().length > 0) {
      return objectError.details
    }

    if (typeof objectError.hint === 'string' && objectError.hint.trim().length > 0) {
      return objectError.hint
    }

    if (typeof objectError.code === 'string' && objectError.code.trim().length > 0) {
      return `Unexpected error (${objectError.code}).`
    }
  }

  return 'An unknown runtime error occurred.'
}

function handleHardReload() {
  // Clear all chunk reload flags
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const key = sessionStorage.key(i)
    if (key && (key.startsWith('lazyRetry:') || key === '__chunk_reload')) {
      sessionStorage.removeItem(key)
    }
  }
  // Cache-busting reload
  const url = new URL(window.location.href)
  url.searchParams.set('_cb', Date.now().toString())
  window.location.replace(url.toString())
}

export function AppErrorPage({error}: {error: unknown}) {
  const isChunkError = isChunkLoadError(error)

  return (
    <div className='flex min-h-screen items-center justify-center bg-canvas p-6'>
      <div className='w-full max-w-2xl rounded-[32px] border border-border-subtle bg-surface-elevated p-8 shadow-elevated sm:p-10'>
        <div className='inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary'>
          <AlertTriangle className='h-3.5 w-3.5'/>
          {isChunkError ? 'New Version Available' : 'Unexpected Error'}
        </div>

        <h1 className='mt-5 font-display text-3xl font-semibold tracking-tight text-text-strong sm:text-4xl'>
          {isChunkError
            ? 'Rocketboard was just updated.'
            : 'Rocketboard hit an unexpected error.'}
        </h1>

        <p className='mt-4 max-w-xl text-sm leading-relaxed text-text-medium sm:text-base'>
          {isChunkError
            ? 'A new version was deployed while you had the page open. Reload to get the latest version.'
            : getAppErrorMessage(error)}
        </p>

        <div className='mt-8 flex flex-wrap items-center gap-3'>
          {isChunkError ? (
            <button
              className='inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110'
              onClick={handleHardReload}
              type='button'
            >
              <RefreshCw className='h-4 w-4'/>
              Reload Rocketboard
            </button>
          ) : (
            <Link
              className='inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110'
              to='/'
            >
              <ArrowLeft className='h-4 w-4'/>
              Back to app entry
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
