import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {canvasRepository} from './canvas.repository'
import {mergeCanvasElement, sortCanvasElements, type CanvasElement, type CanvasElementCreateInput, type CanvasElementUpdateInput, type CanvasImageUploadInput} from './canvas.types'

export function canvasElementsQueryOptions(projectViewId: string) {
  return {
    queryFn: () => canvasRepository.listCanvasElements(projectViewId),
    queryKey: ['canvas-elements', projectViewId] as const,
  }
}

export function setCanvasElementsQueryData(
  queryClient: ReturnType<typeof useQueryClient>,
  projectViewId: string,
  updater: (current: CanvasElement[]) => CanvasElement[],
) {
  queryClient.setQueryData<CanvasElement[]>(
    canvasElementsQueryOptions(projectViewId).queryKey,
    (current) => updater(current ?? []),
  )
}

function upsertCanvasElement(elements: CanvasElement[], nextElement: CanvasElement) {
  const nextElements = elements.some((element) => element.id === nextElement.id)
    ? elements.map((element) => (element.id === nextElement.id ? nextElement : element))
    : [...elements, nextElement]

  return sortCanvasElements(nextElements)
}

export function useCanvasElements(projectViewId: string | null) {
  return useQuery({
    ...canvasElementsQueryOptions(projectViewId ?? ''),
    enabled: Boolean(projectViewId),
  })
}

export function useCreateCanvasElement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CanvasElementCreateInput) => canvasRepository.createCanvasElement(input),
    onSuccess: (element) => {
      setCanvasElementsQueryData(queryClient, element.projectViewId, (current) => upsertCanvasElement(current, element))
    },
  })
}

export function useUploadCanvasImageElement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CanvasImageUploadInput) => canvasRepository.uploadCanvasImage(input),
    onSuccess: (element) => {
      setCanvasElementsQueryData(queryClient, element.projectViewId, (current) => upsertCanvasElement(current, element))
    },
  })
}

export function useUpdateCanvasElement(projectViewId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {elementId: string; updates: CanvasElementUpdateInput}) =>
      canvasRepository.updateCanvasElement(input.elementId, input.updates),
    onMutate: async (input) => {
      await queryClient.cancelQueries({queryKey: canvasElementsQueryOptions(projectViewId).queryKey})

      const previousElements = queryClient.getQueryData<CanvasElement[]>(canvasElementsQueryOptions(projectViewId).queryKey) ?? []

      setCanvasElementsQueryData(queryClient, projectViewId, (current) =>
        current.map((element) => (
          element.id === input.elementId
            ? mergeCanvasElement(element, input.updates)
            : element
        )),
      )

      return {previousElements}
    },
    onError: (_error, _input, context) => {
      queryClient.setQueryData(canvasElementsQueryOptions(projectViewId).queryKey, context?.previousElements ?? [])
    },
    onSuccess: (element) => {
      setCanvasElementsQueryData(queryClient, projectViewId, (current) => upsertCanvasElement(current, element))
    },
  })
}

export function useDeleteCanvasElement(projectViewId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (elementId: string) => canvasRepository.deleteCanvasElement(elementId),
    onMutate: async (elementId) => {
      await queryClient.cancelQueries({queryKey: canvasElementsQueryOptions(projectViewId).queryKey})

      const previousElements = queryClient.getQueryData<CanvasElement[]>(canvasElementsQueryOptions(projectViewId).queryKey) ?? []

      setCanvasElementsQueryData(queryClient, projectViewId, (current) =>
        current.filter((element) => element.id !== elementId),
      )

      return {previousElements}
    },
    onError: (_error, _elementId, context) => {
      queryClient.setQueryData(canvasElementsQueryOptions(projectViewId).queryKey, context?.previousElements ?? [])
    },
  })
}
