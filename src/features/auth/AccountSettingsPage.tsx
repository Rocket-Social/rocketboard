import {useNavigate} from '@tanstack/react-router'

import {useWorkspaceSummariesQuery} from '../projects/project-shell.queries'
import {emptyShellRoutePath, getDefaultProjectRoute} from '../projects/project-shell.routes'
import {buildProjectRouteHref} from '../search/workspace-palette-navigation'
import {AccountSettingsDialog} from './AccountSettingsDialog'
import {useSessionQuery} from './session.queries'

function AccountSettingsLoadingState() {
  return (
    <div className='flex min-h-screen items-center justify-center bg-canvas p-6'>
      <div className='w-full max-w-md rounded-3xl border border-border-subtle bg-surface-elevated p-8 text-center shadow-panel'>
        <p className='font-mono text-xs uppercase tracking-[0.24em] text-text-muted'>Loading</p>
        <h1 className='mt-3 font-display text-3xl font-semibold text-text-strong'>Opening profile</h1>
        <p className='mt-3 text-sm leading-relaxed text-text-medium'>
          Hydrating your session context.
        </p>
      </div>
    </div>
  )
}

export function AccountSettingsPage() {
  const navigate = useNavigate()
  const sessionQuery = useSessionQuery()
  const workspacesQuery = useWorkspaceSummariesQuery()

  if (sessionQuery.isPending || workspacesQuery.isPending) {
    return <AccountSettingsLoadingState/>
  }

  if (sessionQuery.data?.status !== 'authenticated') {
    return null
  }

  const workspaces = workspacesQuery.data ?? []

  const handleClose = () => {
    const defaultRoute = getDefaultProjectRoute(workspaces)

    if (defaultRoute) {
      void navigate({
        href: buildProjectRouteHref(defaultRoute),
      })
      return
    }

    void navigate({to: emptyShellRoutePath})
  }

  return (
    <div className='min-h-screen bg-canvas'>
      <AccountSettingsDialog
        currentUser={sessionQuery.data.user}
        isOpen
        onClose={handleClose}
      />
    </div>
  )
}
