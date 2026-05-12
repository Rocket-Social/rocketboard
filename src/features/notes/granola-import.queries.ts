import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import type {GranolaConnectionMode} from './granola-import.shared'
import {granolaImportRepository} from './granola-import.repository'

const granolaImportKeys = {
  all: ['notes', 'granola-import'] as const,
  connection: (userId: string) => ['notes', 'granola-import', 'connection', userId] as const,
}

export function useGranolaConnectionQuery(userId: string | undefined) {
  return useQuery({
    enabled: Boolean(userId),
    queryFn: () => granolaImportRepository.getConnection(userId!),
    queryKey: granolaImportKeys.connection(userId ?? ''),
  })
}

export function useGranolaConnectMutation(userId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({token, mode}: {token: string; mode?: GranolaConnectionMode}) =>
      granolaImportRepository.connect(token, mode),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: granolaImportKeys.connection(userId)})
      void queryClient.invalidateQueries({queryKey: ['notes', 'folders', userId]})
    },
  })
}

export function useGranolaDisconnectMutation(userId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => granolaImportRepository.disconnect(),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: granolaImportKeys.connection(userId)})
    },
  })
}

export function useGranolaSyncMutation(userId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: granolaImportRepository.sync,
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: granolaImportKeys.connection(userId)})
      void queryClient.invalidateQueries({queryKey: ['notes', 'folders', userId]})
      void queryClient.invalidateQueries({queryKey: ['notes', 'list', userId]})
    },
  })
}

export function useGranolaSetModeMutation(userId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({mode, convertExisting}: {mode: GranolaConnectionMode; convertExisting?: boolean}) =>
      granolaImportRepository.setMode(mode, convertExisting),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: granolaImportKeys.connection(userId)})
      void queryClient.invalidateQueries({queryKey: ['notes', 'list', userId]})
    },
  })
}

export {granolaImportKeys}

