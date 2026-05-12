import type { QueryClient } from "@tanstack/react-query";
import { workspacePlansQueryOptions } from "../plans/plan.queries";
import { workspaceInitiativesQueryOptions } from "../initiatives/initiative.queries";
import { wikiPinnedPagesWithMetadataQueryOptions } from "../wiki/wiki.queries";

export function prefetchSidebarData(
  queryClient: QueryClient,
  workspaceId: string | undefined,
  userId: string,
): void {
  if (workspaceId) {
    void queryClient.prefetchQuery(workspacePlansQueryOptions(workspaceId));
    void queryClient.prefetchQuery(
      workspaceInitiativesQueryOptions(workspaceId),
    );
  }
  void queryClient.prefetchQuery(
    wikiPinnedPagesWithMetadataQueryOptions(userId),
  );
}
