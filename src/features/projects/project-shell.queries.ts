import type {QueryClient} from '@tanstack/react-query'
import {queryOptions, useQuery} from '@tanstack/react-query'

import {projectTaskModeQueryOptions} from './project-task-mode.queries'
import {projectShellRepository} from './project-shell.repository'

export const projectKeys = {
  // Hierarchical key factory — every subkey starts with ['project', ...] so
  // invalidateQueries({queryKey: projectKeys.all}) nukes the entire subtree.
  all: ['project'] as const,
  workspaceSummaries: () => ['project', 'workspace-summaries'] as const,
  cards: (projectId: string) => ['project', 'cards', projectId] as const,
  fields: (projectId: string) => ['project', 'fields', projectId] as const,
  statusOptions: (projectId: string) => ['project', 'status-options', projectId] as const,
  priorityOptions: (projectId: string) => ['project', 'priority-options', projectId] as const,
  groups: (projectId: string) => ['project', 'groups', projectId] as const,
  sprints: (projectId: string) => ['project', 'sprints', projectId] as const,
  tableViewStates: (projectId: string) => ['project', 'table-view-states', projectId] as const,
}

// ── Workspace-level queries ────────────────────────────────────────

export function workspaceSummariesQueryOptions() {
  return queryOptions({
    gcTime: Infinity,
    queryFn: () => projectShellRepository.listWorkspaces(),
    queryKey: projectKeys.workspaceSummaries(),
    staleTime: 5 * 60_000, // 5 min — workspaces/projects change rarely
  })
}

export function useWorkspaceSummariesQuery(options?: {enabled?: boolean}) {
  return useQuery({
    ...workspaceSummariesQueryOptions(),
    enabled: options?.enabled,
  })
}

// ── Decomposed project-level queries ─────────────────────────────

export function projectCardsQueryOptions(projectId: string) {
  return queryOptions({
    queryFn: () => projectShellRepository.getProjectCards(projectId),
    queryKey: projectKeys.cards(projectId),
    staleTime: 30_000, // 30 sec — cards change frequently
  })
}

export function useProjectCardsQuery(projectId: string, options?: {enabled?: boolean}) {
  return useQuery({
    ...projectCardsQueryOptions(projectId),
    enabled: options?.enabled,
  })
}

export function projectFieldsQueryOptions(projectId: string) {
  return queryOptions({
    queryFn: () => projectShellRepository.getProjectCustomFields(projectId),
    queryKey: projectKeys.fields(projectId),
    staleTime: 5 * 60_000, // 5 min — field definitions change rarely
  })
}

export function useProjectFieldsQuery(projectId: string, options?: {enabled?: boolean}) {
  return useQuery({
    ...projectFieldsQueryOptions(projectId),
    enabled: options?.enabled,
  })
}

export function projectStatusOptionsQueryOptions(projectId: string) {
  return queryOptions({
    queryFn: () => projectShellRepository.getProjectStatusOptions(projectId),
    queryKey: projectKeys.statusOptions(projectId),
    staleTime: 5 * 60_000, // 5 min — status options change rarely
  })
}

export function projectPriorityOptionsQueryOptions(projectId: string) {
  return queryOptions({
    queryFn: () => projectShellRepository.getProjectPriorityOptions(projectId),
    queryKey: projectKeys.priorityOptions(projectId),
    staleTime: 5 * 60_000, // 5 min — priority options change rarely
  })
}

export function projectGroupsQueryOptions(projectId: string) {
  return queryOptions({
    queryFn: () => projectShellRepository.getProjectGroups(projectId),
    queryKey: projectKeys.groups(projectId),
    staleTime: 2 * 60_000, // 2 min — groups change occasionally
  })
}

export function projectSprintsQueryOptions(projectId: string) {
  return queryOptions({
    queryFn: () => projectShellRepository.getProjectSprints(projectId),
    queryKey: projectKeys.sprints(projectId),
    staleTime: 2 * 60_000, // 2 min — sprints change occasionally
  })
}

export function projectTableViewStatesQueryOptions(projectId: string) {
  return queryOptions({
    queryFn: () => projectShellRepository.getProjectTableViewStates(projectId),
    queryKey: projectKeys.tableViewStates(projectId),
    staleTime: 2 * 60_000, // 2 min — view config changes occasionally
  })
}

// ── Invalidation utility ─────────────────────────────────────────

export type ProjectDataSlice =
  | 'cards'
  | 'fields'
  | 'groups'
  | 'priority-options'
  | 'sprints'
  | 'status-options'
  | 'task-mode'
  | 'table-view-states'
  | 'workspace-summaries'

const allProjectDataSlices: ProjectDataSlice[] = [
  'cards',
  'fields',
  'status-options',
  'priority-options',
  'groups',
  'sprints',
  'task-mode',
  'table-view-states',
  'workspace-summaries',
]

export function invalidateProjectDataSlices(
  qc: QueryClient,
  projectId: string,
  slices: readonly ProjectDataSlice[],
) {
  return Promise.all(
    slices.map((slice) => {
      switch (slice) {
        case 'cards':
          return qc.invalidateQueries({queryKey: projectCardsQueryOptions(projectId).queryKey})
        case 'fields':
          return qc.invalidateQueries({queryKey: projectFieldsQueryOptions(projectId).queryKey})
        case 'status-options':
          return qc.invalidateQueries({queryKey: projectStatusOptionsQueryOptions(projectId).queryKey})
        case 'priority-options':
          return qc.invalidateQueries({queryKey: projectPriorityOptionsQueryOptions(projectId).queryKey})
        case 'groups':
          return qc.invalidateQueries({queryKey: projectGroupsQueryOptions(projectId).queryKey})
        case 'sprints':
          return qc.invalidateQueries({queryKey: projectSprintsQueryOptions(projectId).queryKey})
        case 'task-mode':
          return qc.invalidateQueries({queryKey: projectTaskModeQueryOptions(projectId).queryKey})
        case 'table-view-states':
          return qc.invalidateQueries({queryKey: projectTableViewStatesQueryOptions(projectId).queryKey})
        case 'workspace-summaries':
          return qc.invalidateQueries({queryKey: workspaceSummariesQueryOptions().queryKey})
      }
    }),
  )
}

export function invalidateAllProjectData(qc: QueryClient, projectId: string) {
  return invalidateProjectDataSlices(qc, projectId, allProjectDataSlices)
}

/**
 * Invalidate all project data across ALL projects using the hierarchical
 * key prefix. Use this when the affected project ID is unknown (e.g., after
 * workspace creation, invite acceptance, or trash restore). Every subkey
 * on `projectKeys` starts with `['project', ...]` so one call nukes the
 * whole subtree.
 */
export function invalidateAllProjectDataGlobal(qc: QueryClient) {
  return qc.invalidateQueries({queryKey: projectKeys.all})
}
