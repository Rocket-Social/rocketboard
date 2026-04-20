import {useEffect, useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'

import {realtimeAdapter} from '../../platform/realtime/realtime-adapter'
import {canvasElementsQueryOptions, setCanvasElementsQueryData} from './canvas.queries'
import {mapCanvasElementRow, type CanvasElementRow} from './canvas.repository'
import {sortCanvasElements, type CanvasElement} from './canvas.types'

type CanvasRealtimeStatus = 'connecting' | 'ready' | 'reconnecting'

type RealtimePayload = {
  eventType?: 'DELETE' | 'INSERT' | 'UPDATE'
  new?: Record<string, unknown> | null
  old?: Record<string, unknown> | null
}

function isCanvasElementRow(value: Record<string, unknown> | null | undefined): value is CanvasElementRow {
  return Boolean(
    value
    && typeof value.id === 'string'
    && typeof value.project_view_id === 'string'
    && typeof value.element_type === 'string'
    && typeof value.x === 'number'
    && typeof value.y === 'number'
    && typeof value.width === 'number'
    && typeof value.height === 'number'
    && typeof value.z_index === 'number'
    && typeof value.created_at === 'string'
    && typeof value.updated_at === 'string',
  )
}

function upsertRealtimeElement(elements: CanvasElement[], nextElement: CanvasElement) {
  const nextElements = elements.some((element) => element.id === nextElement.id)
    ? elements.map((element) => (element.id === nextElement.id ? nextElement : element))
    : [...elements, nextElement]

  return sortCanvasElements(nextElements)
}

export function useCanvasRealtime(projectViewId: string) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<CanvasRealtimeStatus>('connecting')

  useEffect(() => {
    if (!projectViewId) {
      return
    }

    const channel = realtimeAdapter.channel(`canvas-elements-${projectViewId}`)

    channel.on('postgres_changes', {
      event: '*',
      filter: `project_view_id=eq.${projectViewId}`,
      schema: 'public',
      table: 'canvas_elements',
    }, (payload) => {
      const realtimePayload = payload as RealtimePayload

      if (realtimePayload.eventType === 'DELETE') {
        const deletedId = typeof realtimePayload.old?.id === 'string' ? realtimePayload.old.id : null

        if (!deletedId) {
          void queryClient.invalidateQueries({queryKey: canvasElementsQueryOptions(projectViewId).queryKey})
          return
        }

        setCanvasElementsQueryData(queryClient, projectViewId, (current) =>
          current.filter((element) => element.id !== deletedId),
        )
        return
      }

      if (!isCanvasElementRow(realtimePayload.new)) {
        void queryClient.invalidateQueries({queryKey: canvasElementsQueryOptions(projectViewId).queryKey})
        return
      }

      void mapCanvasElementRow(realtimePayload.new)
        .then((nextElement) => {
          setCanvasElementsQueryData(queryClient, projectViewId, (current) => upsertRealtimeElement(current, nextElement))
        })
        .catch(() => {
          void queryClient.invalidateQueries({queryKey: canvasElementsQueryOptions(projectViewId).queryKey})
        })
    })

    channel.subscribe((nextStatus) => {
      if (nextStatus === 'SUBSCRIBED') {
        setStatus('ready')
        return
      }

      if (nextStatus === 'CHANNEL_ERROR' || nextStatus === 'CLOSED' || nextStatus === 'TIMED_OUT') {
        setStatus('reconnecting')
        return
      }

      setStatus('connecting')
    })

    return () => {
      void realtimeAdapter.removeChannel(channel)
    }
  }, [projectViewId, queryClient])

  return status
}
