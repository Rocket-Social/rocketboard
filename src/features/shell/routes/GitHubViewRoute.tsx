import {useParams} from '@tanstack/react-router'
import {Suspense} from 'react'

import {lazyWithRetry} from '../../../app/lazyWithRetry'
import {useProjectChrome} from '../project/ProjectChromeContext'
import {useProjectData} from '../project/ProjectDataContext'
import {useProjectDialogs} from '../project/ProjectDialogContext'

const GitHubBoardPage = lazyWithRetry(() => import('../../github/GitHubBoardPage').then((m) => ({default: m.GitHubBoardPage})))

export function GitHubViewRoute() {
  const params = useParams({strict: false}) as {viewId: string}
  const {
    canEditProject,
    currentUser,
    projectAccessSnapshot,
    projectId,
    projectMembers,
    project,
    workspace,
  } = useProjectChrome()
  const {cards, projectSprints} = useProjectData()
  const {openCreateSprintDialog} = useProjectDialogs()

  return (
    <div className='flex-1 bg-canvas overflow-auto p-4 sm:p-6'>
      <Suspense fallback={null}>
        <GitHubBoardPage
          canEditProject={canEditProject}
          canManageProject={projectAccessSnapshot?.canManageProject ?? false}
          cards={cards}
          currentUserId={currentUser.id}
          organizationId={workspace.organizationId}
          organizationSlug={workspace.organizationSlug}
          onCreateSprintClick={openCreateSprintDialog}
          onStartSprint={() => undefined}
          projectId={projectId}
          projectViewId={params.viewId}
          projectMembers={projectMembers}
          projectSprints={projectSprints}
          statusOptions={project.statusOptions}
        />
      </Suspense>
    </div>
  )
}
