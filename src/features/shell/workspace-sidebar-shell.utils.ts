import type {WorkspaceSummary} from '../projects/project-shell.types'

export function resolveShellWorkspace(
  workspaces: WorkspaceSummary[] | undefined,
  workspaceSlug?: string,
  orgSlug?: string,
): WorkspaceSummary | undefined {
  if (!workspaces?.length) return undefined

  if (workspaceSlug) {
    const matchingWorkspace = workspaces.find(
      (workspace) => workspace.slug === workspaceSlug && (!orgSlug || workspace.organizationSlug === orgSlug),
    )
    if (matchingWorkspace) return matchingWorkspace
  }

  if (orgSlug) {
    return workspaces.find((workspace) => workspace.organizationSlug === orgSlug)
  }

  // Fallback: return first workspace (for routes without workspace/org context like /account)
  return workspaces[0]
}
