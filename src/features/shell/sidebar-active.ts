type ResolveActiveSidebarItemIdArgs = {
  initiativeId?: string | null;
  planId?: string | null;
  projectId?: string | null;
};

export function resolveActiveSidebarItemId({
  initiativeId,
  planId,
  projectId,
}: ResolveActiveSidebarItemIdArgs): string | null {
  if (projectId) return `project:${projectId}`;
  if (planId) return `plan:${planId}`;
  if (initiativeId) return `initiative:${initiativeId}`;
  return null;
}
