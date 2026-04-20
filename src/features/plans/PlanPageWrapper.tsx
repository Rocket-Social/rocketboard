import {useParams} from '@tanstack/react-router'

import {useSignedInAppFrame} from '../shell/SignedInAppFrame'
import {PlanPage} from './PlanPage'

export function PlanPageWrapper() {
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
    <PlanPage
      workspaceId={workspace.id}
      workspaceName={workspace.name}
    />
  )
}
