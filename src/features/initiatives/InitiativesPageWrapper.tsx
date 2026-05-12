import {useNavigate, useParams} from '@tanstack/react-router'

import {useMode} from '../../app/mode'
import {useSignedInAppFrame} from '../shell/SignedInAppFrame'
import {workspaceInitiativeDetailRoutePath} from '../shell/route-helpers'
import {InitiativesListPage} from './InitiativesListPage'

export function InitiativesPageWrapper() {
  const navigate = useNavigate()
  const {mode} = useMode()
  const {orgSlug, workspaceSlug} = useParams({strict: false}) as {orgSlug: string; workspaceSlug: string}
  const {workspaces} = useSignedInAppFrame()
  const workspace = workspaces.find((w) => w.organizationSlug === orgSlug && w.slug === workspaceSlug)

  if (!workspace) {
    return (
      <div className='flex items-center justify-center py-20'>
        <p className='text-sm text-text-muted'>Loading...</p>
      </div>
    )
  }

  return (
    <InitiativesListPage
      mode={mode}
      onNavigateToDetail={(initiativeId) => {
        void navigate({
          params: {initiativeId, orgSlug, workspaceSlug},
          to: workspaceInitiativeDetailRoutePath,
        })
      }}
      workspaceId={workspace.id}
      workspaceName={workspace.name}
    />
  )
}
