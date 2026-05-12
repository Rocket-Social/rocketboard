import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {canvasRepository} from './canvas.repository'
import {mergeCanvasElement, sortCanvasElements, type CanvasElement, type CanvasElementBatchUpdateInput, type CanvasElementCreateInput, type CanvasElementUpdateInput, type CanvasImageUploadInput} from './canvas.types'

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

export function useUpdateCanvasElements(projectViewId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (inputs: CanvasElementBatchUpdateInput[]) =>
      canvasRepository.updateCanvasElements(projectViewId, inputs),
    onMutate: async (inputs) => {
      await queryClient.cancelQueries({queryKey: canvasElementsQueryOptions(projectViewId).queryKey})

      const previousElements = queryClient.getQueryData<CanvasElement[]>(canvasElementsQueryOptions(projectViewId).queryKey) ?? []
      const updatesById = new Map(inputs.map((input) => [input.elementId, input.updates]))

      setCanvasElementsQueryData(queryClient, projectViewId, (current) =>
        current.map((element) => {
          const updates = updatesById.get(element.id)

          return updates ? mergeCanvasElement(element, updates) : element
        }),
      )

      return {previousElements}
    },
    onError: (_error, _inputs, context) => {
      queryClient.setQueryData(canvasElementsQueryOptions(projectViewId).queryKey, context?.previousElements ?? [])
    },
    onSuccess: (elements) => {
      setCanvasElementsQueryData(queryClient, projectViewId, (current) => {
        const updatedById = new Map(elements.map((element) => [element.id, element]))
        const currentIdSet = new Set(current.map((element) => element.id))
        const currentWithUpdates = current.map((element) => updatedById.get(element.id) ?? element)
        const insertedUpdates = elements.filter((element) => !currentIdSet.has(element.id))

        return sortCanvasElements([...currentWithUpdates, ...insertedUpdates])
      })
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

export function useDeleteCanvasElements(projectViewId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (elementIds: string[]) => canvasRepository.deleteCanvasElements(projectViewId, elementIds),
    onMutate: async (elementIds) => {
      await queryClient.cancelQueries({queryKey: canvasElementsQueryOptions(projectViewId).queryKey})

      const previousElements = queryClient.getQueryData<CanvasElement[]>(canvasElementsQueryOptions(projectViewId).queryKey) ?? []
      const deletedElementIdSet = new Set(elementIds)

      setCanvasElementsQueryData(queryClient, projectViewId, (current) =>
        current.filter((element) => !deletedElementIdSet.has(element.id)),
      )

      return {previousElements}
    },
    onError: (_error, _elementIds, context) => {
      queryClient.setQueryData(canvasElementsQueryOptions(projectViewId).queryKey, context?.previousElements ?? [])
    },
  })
}
