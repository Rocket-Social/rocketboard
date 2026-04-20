import {useEffect, useState} from 'react'
import {useNavigate} from '@tanstack/react-router'
import {Check, AlertCircle, Loader2} from 'lucide-react'

import {completeGitHubAppInstall} from './github.connect'

type CallbackStatus = 'loading' | 'success' | 'error'

/**
 * Validate that a server-supplied returnPath points back inside our origin.
 * Rejects absolute URLs, protocol-relative URLs (`//evil.com/...`), and any
 * malformed string. Returns the safe path+search+hash to assign to
 * window.location.href, or null if the path is untrustworthy.
 */
export function resolveSameOriginPath(returnPath: unknown): string | null {
  if (typeof returnPath !== 'string' || returnPath.length === 0) return null
  try {
    const target = new URL(returnPath, window.location.origin)
    if (target.origin !== window.location.origin) return null
    return target.pathname + target.search + target.hash
  } catch {
    return null
  }
}

export function GitHubCallbackPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<CallbackStatus>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    handleCallback()

    async function handleCallback() {
      const urlParams = new URLSearchParams(window.location.search)
      const error = urlParams.get('error')
      const state = urlParams.get('state')
      const installationId = Number(urlParams.get('installation_id') ?? '')

      if (error) {
        setStatus('error')
        setErrorMessage(error)
        return
      }

      if (state && Number.isFinite(installationId) && installationId > 0) {
        try {
          const result = await completeGitHubAppInstall(state, installationId)

          setStatus('success')
          const returnPath = result.return_path

          setTimeout(() => {
            // Resolve returnPath relative to our own origin and accept only
            // same-origin results. `startsWith('/')` is NOT sufficient:
            // protocol-relative URLs like `//evil.com/x` also start with
            // `/`, and `window.location.href = "//evil.com/x"` redirects
            // off-site. Round-tripping through URL normalizes away the
            // origin, so we set href to just path + search + hash.
            const resolved = resolveSameOriginPath(returnPath)
            if (resolved) {
              window.location.href = resolved
            } else {
              navigate({to: '/'})
            }
          }, 1500)
        } catch (err) {
          setStatus('error')
          setErrorMessage(err instanceof Error ? err.message : 'Failed to save GitHub connection')
        }
        return
      }

      setStatus('error')
      setErrorMessage('Invalid callback parameters')
    }
  }, [navigate])

  return (
    <div className="flex items-center justify-center min-h-screen bg-canvas">
      <div className="bg-surface-elevated rounded-sm shadow-sm p-8 max-w-md w-full mx-4 text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="w-10 h-10 text-[#335c8f] mx-auto mb-4 animate-spin" />
            <h2 className="text-lg font-semibold text-text-strong mb-2">
              Connecting GitHub...
            </h2>
            <p className="text-sm text-text-medium">
              Please wait while we complete the connection.
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-12 h-12 bg-[#2f7a55]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-6 h-6 text-[#2f7a55]" />
            </div>
            <h2 className="text-lg font-semibold text-text-strong mb-2">
              GitHub Connected!
            </h2>
            <p className="text-sm text-text-medium">
              Redirecting you back to your project...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-12 h-12 bg-[#a13d34]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6 text-[#a13d34]" />
            </div>
            <h2 className="text-lg font-semibold text-text-strong mb-2">
              Connection Failed
            </h2>
            <p className="text-sm text-text-medium mb-4">
              {errorMessage || 'An error occurred while connecting to GitHub.'}
            </p>
            <button
              onClick={() => navigate({to: '/'})}
              className="px-4 py-2 text-sm font-medium rounded-sm bg-[#bf6224] text-white hover:bg-[#9f4d17] transition-colors"
            >
              Go Home
            </button>
          </>
        )}
      </div>
    </div>
  )
}
