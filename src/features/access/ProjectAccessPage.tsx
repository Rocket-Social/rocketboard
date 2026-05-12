import {useParams} from '@tanstack/react-router'
import {Lock, ShieldCheck, Users} from 'lucide-react'

import {Badge} from '../../components/ui/badge'
import {useSessionQuery} from '../auth/session.queries'
import {ProjectAccessSection} from './ProjectAccessSection'
import {useProjectAccessQuery, useProjectAccessRouteContextQuery} from './access.queries'

export function ProjectAccessPage() {
  const params = useParams({strict: false}) as {
    orgSlug: string
    projectSlug: string
    workspaceSlug: string
  }
  const sessionQuery = useSessionQuery()
  const routeContextQuery = useProjectAccessRouteContextQuery(
    params.orgSlug ?? null,
    params.workspaceSlug ?? null,
    params.projectSlug ?? null,
  )
  const routeContext = routeContextQuery.data
  const snapshotQuery = useProjectAccessQuery(routeContext?.projectId ?? null)
  const snapshot = snapshotQuery.data

  const currentUserId = sessionQuery.data?.status === 'authenticated'
    ? sessionQuery.data.user.id
    : ''

  if (routeContextQuery.isPending) {
    return <div className='py-12 text-center text-sm text-text-muted'>Loading project access…</div>
  }

  if (!routeContext) {
    return <div className='py-12 text-center text-sm text-text-muted'>Project not found or you do not have access.</div>
  }

  if (snapshotQuery.isPending) {
    return <div className='py-12 text-center text-sm text-text-muted'>Loading project access…</div>
  }

  if (!snapshot) {
    return <div className='py-12 text-center text-sm text-text-muted'>Project not found or you do not have access.</div>
  }

  return (
    <div className='w-full max-w-none px-6 py-8'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div className='space-y-2'>
          <div className='flex items-center gap-2'>
            <Users className='h-5 w-5 text-text-muted'/>
            <h1 className='font-display text-2xl font-semibold text-text-strong'>{routeContext.projectName} Access</h1>
          </div>
          <p className='max-w-3xl text-sm text-text-medium'>
            Manage explicit membership for this project without opening the project shell.
          </p>
        </div>
        <div className='flex flex-wrap gap-2 text-xs'>
          <Badge variant='subtle'>{routeContext.projectAccess === 'open' ? 'Open project' : 'Private project'}</Badge>
          <Badge variant='subtle'>{routeContext.canAccessProject ? 'Content access' : 'Management only'}</Badge>
        </div>
      </div>

      {!routeContext.canAccessProject && routeContext.canManageProject ? (
        <div className='mt-4 rounded-2xl border border-border-subtle bg-surface-base px-4 py-3 text-sm text-text-medium'>
          <div className='flex items-start gap-2'>
            <Lock className='mt-0.5 h-4 w-4 shrink-0 text-text-muted'/>
            <div>
              <p className='font-medium text-text-strong'>Metadata-only admin view</p>
              <p className='mt-1'>
                You can manage access for this private project, but project content stays hidden until you are explicitly added.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {!snapshot.canManageProject ? (
        <div className='mt-4 rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning'>
          <div className='flex items-start gap-2'>
            <ShieldCheck className='mt-0.5 h-4 w-4 shrink-0'/>
            <p>
              {snapshot.canEditProject
                ? 'You can add local members here, but only project, workspace, or organization admins can grant project admin access, change existing roles, or remove people.'
                : 'You can review project membership here, but only project editors or admins can add people, and only project, workspace, or organization admins can change existing roles or remove people.'}
            </p>
          </div>
        </div>
      ) : null}

      <div className='mt-6'>
        <ProjectAccessSection
          currentUserId={currentUserId}
          projectId={routeContext.projectId}
          projectName={routeContext.projectName}
          snapshot={snapshot}
          workspaceId={routeContext.workspaceId}
          workspaceName={routeContext.workspaceName}
        />
      </div>
    </div>
  )
}
