// Wave 2 AI Kanban Phase 5 — react-query bindings for the schedule
// list + mutation surface.
//
// All mutations invalidate the schedule list on success. Pause/Resume
// optimistically flip `is_paused` for instant feedback (rollback on error).

import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {aiKeys} from './ai.queries'
import {
  agentScheduleRepository,
  type UpdateAgentScheduleInput,
} from './agent-schedule.repository'
import type {AgentSchedule} from './agent.types'

type MutationContext = {
  userId: string
}

export function useAgentSchedulesQuery(input: {
  userId: string | null
}) {
  return useQuery({
    enabled: Boolean(input.userId),
    queryFn: () => agentScheduleRepository.listForUser(input.userId!),
    queryKey: aiKeys.agentSchedules(input.userId ?? ''),
    staleTime: 30_000,
  })
}

export function useUpdateAgentScheduleMutation({userId}: MutationContext) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateAgentScheduleInput) =>
      agentScheduleRepository.update(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: aiKeys.agentSchedules(userId)})
    },
  })
}

export function usePauseAgentScheduleMutation({userId}: MutationContext) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (scheduleId: string) => agentScheduleRepository.pause(scheduleId),
    // Optimistic flip of is_paused so the row visually pauses on click.
    onMutate: async (scheduleId) => {
      const queryKey = aiKeys.agentSchedules(userId)
      await queryClient.cancelQueries({queryKey})
      const previous = queryClient.getQueryData<AgentSchedule[]>(queryKey)
      if (previous) {
        queryClient.setQueryData<AgentSchedule[]>(
          queryKey,
          previous.map((s) => (s.id === scheduleId ? {...s, isPaused: true} : s)),
        )
      }
      return {previous}
    },
    onError: (_err, _scheduleId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(aiKeys.agentSchedules(userId), context.previous)
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: aiKeys.agentSchedules(userId)})
    },
  })
}

export function useResumeAgentScheduleMutation({userId}: MutationContext) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (scheduleId: string) => agentScheduleRepository.resume(scheduleId),
    onMutate: async (scheduleId) => {
      const queryKey = aiKeys.agentSchedules(userId)
      await queryClient.cancelQueries({queryKey})
      const previous = queryClient.getQueryData<AgentSchedule[]>(queryKey)
      if (previous) {
        queryClient.setQueryData<AgentSchedule[]>(
          queryKey,
          previous.map((s) => (s.id === scheduleId ? {...s, isPaused: false} : s)),
        )
      }
      return {previous}
    },
    onError: (_err, _scheduleId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(aiKeys.agentSchedules(userId), context.previous)
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: aiKeys.agentSchedules(userId)})
    },
  })
}

export function useDeleteAgentScheduleMutation({userId}: MutationContext) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (scheduleId: string) => agentScheduleRepository.delete(scheduleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: aiKeys.agentSchedules(userId)})
    },
  })
}
