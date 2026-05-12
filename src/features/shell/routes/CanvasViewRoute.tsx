import {useParams} from '@tanstack/react-router'
import {Suspense} from 'react'

import {lazyWithRetry} from '../../../app/lazyWithRetry'
import {useProjectChrome} from '../project/ProjectChromeContext'

const CanvasView = lazyWithRetry(() => import('../../canvas/CanvasView').then((m) => ({default: m.CanvasView})))

export function CanvasViewRoute() {
  const params = useParams({strict: false}) as {viewId: string}
  const {canEditProject, projectId} = useProjectChrome()

  return (
    <div className='min-h-0 overflow-hidden p-0 flex-1 bg-canvas'>
      <Suspense fallback={null}>
        <CanvasView
          canEdit={canEditProject}
          projectId={projectId}
          projectViewId={params.viewId}
        />
      </Suspense>
    </div>
  )
}
