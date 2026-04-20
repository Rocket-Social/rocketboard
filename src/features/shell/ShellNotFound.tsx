import {ArrowLeft} from 'lucide-react'
import {Link} from '@tanstack/react-router'

import {useWorkspaceSummariesQuery} from '../projects/project-shell.queries'
import {
  emptyShellRoutePath,
  getDefaultProjectRoute,
} from '../projects/project-shell.routes'
import {projectLayoutRoutePath} from './route-helpers'

export function ShellNotFound() {
  const workspaceQuery = useWorkspaceSummariesQuery()
  const providerError = workspaceQuery.error instanceof Error ? workspaceQuery.error.message : null
  const defaultRoute = workspaceQuery.data ? getDefaultProjectRoute(workspaceQuery.data) : null

  return (
    <div className='flex min-h-screen items-center justify-center bg-canvas p-6'>
      <div className='w-full max-w-xl rounded-[32px] border border-border-subtle bg-surface-elevated p-8 shadow-elevated'>
        <p className='font-mono text-xs uppercase tracking-[0.24em] text-text-muted'>Not Found</p>
        <h1 className='mt-3 font-display text-3xl font-semibold text-text-strong'>That workspace route does not exist.</h1>
        <p className='mt-4 max-w-lg text-sm leading-relaxed text-text-medium'>
          The project shell is now route-backed, so invalid workspace, project, or view paths should fail clearly instead of
          dropping you into a misleading mock state.
        </p>

        {providerError ? (
          <p className='mt-6 text-sm text-text-muted'>{providerError}</p>
        ) : defaultRoute ? (
          <Link
            className='mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110'
            params={{
              orgSlug: defaultRoute.orgSlug,
              projectSlug: defaultRoute.projectSlug,
              workspaceSlug: defaultRoute.workspaceSlug,
            }}
            to={projectLayoutRoutePath}
          >
            <ArrowLeft className='h-4 w-4'/>
            Open the default workspace
          </Link>
        ) : workspaceQuery.data ? (
          <Link
            className='mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110'
            to={emptyShellRoutePath}
          >
            <ArrowLeft className='h-4 w-4'/>
            Open onboarding
          </Link>
        ) : (
          <p className='mt-6 text-sm text-text-muted'>Loading the default workspace route…</p>
        )}
      </div>
    </div>
  )
}
