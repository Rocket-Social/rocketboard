import {useParams} from '@tanstack/react-router'
import {Suspense} from 'react'

import {lazyWithRetry} from '../../../app/lazyWithRetry'
import {useProjectDocumentQuery} from '../../documents/document.queries'
import {useProjectChrome} from '../project/ProjectChromeContext'
import {useProjectDialogs} from '../project/ProjectDialogContext'
import {ToolbarPortal} from '../ToolbarSlot'
import {Button} from '../../../components/ui/button'
import {FileText, Paperclip, Users} from 'lucide-react'

const DocumentProjectView = lazyWithRetry(() => import('../../documents/DocumentProjectView').then((m) => ({default: m.DocumentProjectView})))

function FeatureLoadingPanel({label}: {label: string}) {
  return (
    <div className='rounded-3xl border border-border-subtle bg-surface-elevated p-6 text-sm text-text-medium shadow-panel'>
      Loading {label}…
    </div>
  )
}

export function DocumentViewRoute() {
  const params = useParams({strict: false}) as {viewId: string}
  const {canEditProject, currentUser, projectId, project, projectMembers} = useProjectChrome()
  const {setCardHasUnsavedChanges} = useProjectDialogs()
  const documentQuery = useProjectDocumentQuery(params.viewId)
  const snapshot = documentQuery.data ?? null

  if (!snapshot) {
    if (documentQuery.error instanceof Error) {
      throw documentQuery.error
    }
    return <FeatureLoadingPanel label='document workspace'/>
  }

  return (
    <>
      <ToolbarPortal slot="leading">
        <Button disabled variant='primary'>
          <FileText className='h-4 w-4'/>
          Document
        </Button>
        <Button disabled variant='secondary'>
          <Paperclip className='h-4 w-4'/>
          Files: {snapshot?.attachments.length ?? 0}
        </Button>
        <Button disabled variant='secondary'>
          <Users className='h-4 w-4'/>
          Comments: {snapshot?.comments.length ?? 0}
        </Button>
      </ToolbarPortal>

      <div className='flex-1 bg-canvas overflow-auto p-4 sm:p-6'>
        <Suspense fallback={<FeatureLoadingPanel label='document workspace'/>}>
          <DocumentProjectView
            canEditProject={canEditProject}
            currentUser={currentUser}
            initialSnapshot={snapshot}
            onDirtyStateChange={setCardHasUnsavedChanges}
            projectId={projectId}
            projectMembers={projectMembers}
            projectName={project.name}
            projectViewId={params.viewId}
          />
        </Suspense>
      </div>
    </>
  )
}
