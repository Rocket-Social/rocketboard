export function shouldBlockProjectShell(args: {
  hasResolvedProject: boolean
  hasWorkspace: boolean
  isAuthenticated: boolean
  workspacesPending: boolean
  fieldsPending: boolean
  statusPending: boolean
  priorityPending: boolean
  sessionPending: boolean
}) {
  return (
    args.workspacesPending
    || args.fieldsPending
    || args.statusPending
    || args.priorityPending
    || !args.hasResolvedProject
    || !args.hasWorkspace
    || args.sessionPending
    || !args.isAuthenticated
  )
}

export function shouldShowProjectShellSurfaceSkeleton(args: {
  cardsPending: boolean
  groupsPending: boolean
  sprintsPending: boolean
  tableViewStatesPending: boolean
}) {
  return (
    args.cardsPending
    || args.groupsPending
    || args.sprintsPending
    || args.tableViewStatesPending
  )
}
