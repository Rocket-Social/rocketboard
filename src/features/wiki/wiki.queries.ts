import {queryOptions, useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {wikiPageRepository} from './wiki.repository'
import {removeRecentViews} from './wiki-recent-viewed'
import type {
  AddWikiCommentInput,
  CreateWikiPageInput,
  UpdateWikiPageInput,
  WikiPageListItem,
  WikiShareRecord,
} from './wiki.types'

// ============================================================
// Query keys
// ============================================================

export const wikiKeys = {
  all: ['wiki'] as const,
  orgPages: (orgId: string) => ['wiki', 'org-pages', orgId] as const,
  projectPages: (projectId: string) => ['wiki', 'project-pages', projectId] as const,
  page: (pageId: string) => ['wiki', 'page', pageId] as const,
  pins: (userId: string) => ['wiki', 'pins', userId] as const,
  pinnedWithMetadata: (userId: string) => ['wiki', 'pinned-metadata', userId] as const,
  comments: (pageId: string) => ['wiki', 'comments', pageId] as const,
  versions: (pageId: string) => ['wiki', 'versions', pageId] as const,
  recentOrgPages: (orgId: string) => ['wiki', 'recent-org-pages', orgId] as const,
  search: (orgId: string, query: string) => ['wiki', 'search', orgId, query] as const,
  share: (pageId: string) => ['wiki', 'share', pageId] as const,
  publicPage: (token: string) => ['wiki', 'public-page', token] as const,
}

function collectDeletedPageIds(pages: WikiPageListItem[], rootPageId: string): Set<string> {
  const deletedIds = new Set<string>([rootPageId])
  let changed = true

  while (changed) {
    changed = false

    for (const page of pages) {
      if (!deletedIds.has(page.id) && page.parentPageId && deletedIds.has(page.parentPageId)) {
        deletedIds.add(page.id)
        changed = true
      }
    }
  }

  return deletedIds
}

// ============================================================
// Query options (for prefetching / loader use)
// ============================================================

export function wikiOrgPagesQueryOptions(orgId: string) {
  return queryOptions({
    enabled: Boolean(orgId),
    queryFn: () => wikiPageRepository.listOrgPages(orgId),
    queryKey: wikiKeys.orgPages(orgId),
  })
}

export function wikiProjectPagesQueryOptions(projectId: string) {
  return queryOptions({
    enabled: Boolean(projectId),
    queryFn: () => wikiPageRepository.listProjectPages(projectId),
    queryKey: wikiKeys.projectPages(projectId),
  })
}

export function wikiPageQueryOptions(pageId: string) {
  return queryOptions({
    enabled: Boolean(pageId),
    queryFn: () => wikiPageRepository.getPage(pageId),
    queryKey: wikiKeys.page(pageId),
  })
}

export function wikiRecentOrgPagesQueryOptions(orgId: string) {
  return queryOptions({
    enabled: Boolean(orgId),
    queryFn: () => wikiPageRepository.listRecentOrgPages(orgId),
    queryKey: wikiKeys.recentOrgPages(orgId),
  })
}

export function wikiPinnedPagesWithMetadataQueryOptions(userId: string) {
  return queryOptions({
    enabled: Boolean(userId),
    queryFn: () => wikiPageRepository.listPinnedPagesWithMetadata(userId),
    queryKey: wikiKeys.pinnedWithMetadata(userId),
  })
}

// ============================================================
// Queries
// ============================================================

export function useWikiOrgPagesQuery(orgId: string | undefined) {
  return useQuery({
    enabled: Boolean(orgId),
    queryFn: () => wikiPageRepository.listOrgPages(orgId!),
    queryKey: wikiKeys.orgPages(orgId ?? ''),
  })
}

export function useWikiRecentOrgPagesQuery(orgId: string | undefined) {
  return useQuery({
    ...wikiRecentOrgPagesQueryOptions(orgId ?? ''),
    enabled: Boolean(orgId),
  })
}

export function useWikiProjectPagesQuery(projectId: string | undefined) {
  return useQuery({
    enabled: Boolean(projectId),
    queryFn: () => wikiPageRepository.listProjectPages(projectId!),
    queryKey: wikiKeys.projectPages(projectId ?? ''),
  })
}

export function useWikiPageQuery(pageId: string | null) {
  return useQuery({
    enabled: Boolean(pageId),
    queryFn: () => wikiPageRepository.getPage(pageId!),
    queryKey: wikiKeys.page(pageId ?? ''),
  })
}

export function useWikiPinsQuery(userId: string | undefined) {
  return useQuery({
    enabled: Boolean(userId),
    queryFn: () => wikiPageRepository.listPins(userId!),
    queryKey: wikiKeys.pins(userId ?? ''),
  })
}

export function useWikiPinnedPagesWithMetadataQuery(userId: string | undefined) {
  return useQuery({
    ...wikiPinnedPagesWithMetadataQueryOptions(userId ?? ''),
    enabled: Boolean(userId),
  })
}

export function useWikiCommentsQuery(pageId: string | null) {
  return useQuery({
    enabled: Boolean(pageId),
    queryFn: () => wikiPageRepository.listComments(pageId!),
    queryKey: wikiKeys.comments(pageId ?? ''),
  })
}

export function useWikiVersionsQuery(pageId: string | null) {
  return useQuery({
    enabled: Boolean(pageId),
    queryFn: () => wikiPageRepository.listVersions(pageId!),
    queryKey: wikiKeys.versions(pageId ?? ''),
  })
}

// ============================================================
// Mutations
// ============================================================

export function useCreateWikiPageMutation(_orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateWikiPageInput) => wikiPageRepository.createPage(input),
    onSuccess: (_, input) => {
      // Invalidate all wiki queries so orgPages, recentOrgPages, search, and
      // pinned metadata all refresh after a new page is created.
      void queryClient.invalidateQueries({queryKey: wikiKeys.all})
      if (input.projectId) {
        void queryClient.invalidateQueries({queryKey: wikiKeys.projectPages(input.projectId)})
      }
    },
  })
}

export function useUpdateWikiPageMutation(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({pageId, ...input}: UpdateWikiPageInput & {pageId: string}) =>
      wikiPageRepository.updatePage(pageId, input),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({queryKey: wikiKeys.page(variables.pageId)})
      void queryClient.invalidateQueries({queryKey: wikiKeys.orgPages(orgId)})
      void queryClient.invalidateQueries({queryKey: wikiKeys.versions(variables.pageId)})
    },
  })
}

export function useDeleteWikiPageMutation(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (pageId: string) => wikiPageRepository.deletePage(pageId),
    onSuccess: (_, pageId) => {
      const cachedOrgPages = queryClient.getQueryData<WikiPageListItem[]>(wikiKeys.orgPages(orgId)) ?? []
      const deletedIds = collectDeletedPageIds(cachedOrgPages, pageId)

      queryClient.setQueryData<WikiPageListItem[] | undefined>(
        wikiKeys.orgPages(orgId),
        (previous) => previous?.filter((page) => !deletedIds.has(page.id)),
      )
      queryClient.setQueryData<WikiPageListItem[] | undefined>(
        wikiKeys.recentOrgPages(orgId),
        (previous) => previous?.filter((page) => !deletedIds.has(page.id)),
      )

      for (const deletedId of deletedIds) {
        queryClient.setQueryData(wikiKeys.page(deletedId), null)
      }

      removeRecentViews(orgId, deletedIds)

      // Invalidate all wiki queries — deleted pages must disappear from
      // org page lists, pinned-page sidebar, recent-pages, and search results.
      void queryClient.invalidateQueries({queryKey: wikiKeys.all})
    },
  })
}

export function useRestoreWikiPageMutation(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (pageId: string) => wikiPageRepository.restorePage(pageId),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: wikiKeys.orgPages(orgId)})
    },
  })
}

export function useReorderWikiPagesMutation(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (updates: {pageId: string; parentPageId: string | null; position: number}[]) =>
      wikiPageRepository.reorderPages(updates),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: wikiKeys.orgPages(orgId)})
    },
  })
}

export function usePinWikiPageMutation(userId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (pageId: string) => wikiPageRepository.pinPage(pageId),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: wikiKeys.pins(userId)})
      void queryClient.invalidateQueries({queryKey: wikiKeys.pinnedWithMetadata(userId)})
    },
  })
}

export function useUnpinWikiPageMutation(userId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (pageId: string) => wikiPageRepository.unpinPage(pageId),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: wikiKeys.pins(userId)})
      void queryClient.invalidateQueries({queryKey: wikiKeys.pinnedWithMetadata(userId)})
    },
  })
}

export function useAddWikiCommentMutation(pageId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: AddWikiCommentInput) => wikiPageRepository.addComment(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: wikiKeys.comments(pageId)})
    },
  })
}

export function useSearchWikiPagesQuery(orgId: string | undefined, query: string) {
  return useQuery({
    enabled: Boolean(orgId) && query.length >= 2,
    queryFn: () => wikiPageRepository.searchPages(orgId!, query),
    queryKey: wikiKeys.search(orgId ?? '', query),
  })
}

// ============================================================
// Share link queries + mutations
// ============================================================

export function wikiShareQueryOptions(pageId: string) {
  return queryOptions({
    enabled: !!pageId,
    queryFn: () => wikiPageRepository.getShareSnapshot(pageId),
    queryKey: wikiKeys.share(pageId),
    staleTime: 30_000,
  })
}

export function useWikiShareQuery(pageId: string | undefined) {
  return useQuery({
    enabled: !!pageId,
    queryFn: () => wikiPageRepository.getShareSnapshot(pageId!),
    queryKey: wikiKeys.share(pageId ?? ''),
    staleTime: 30_000,
  })
}

export function publicWikiPageQueryOptions(shareToken: string) {
  return queryOptions({
    enabled: !!shareToken,
    queryFn: () => wikiPageRepository.getPublicPage(shareToken),
    queryKey: wikiKeys.publicPage(shareToken),
    staleTime: 30_000,
  })
}

export function useCreateWikiShareLinkMutation(pageId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => wikiPageRepository.createShareLink(pageId),
    onSuccess: (data) => {
      queryClient.setQueryData<WikiShareRecord | null>(wikiKeys.share(pageId), data)
    },
  })
}

export function useRevokeWikiShareLinkMutation(pageId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => wikiPageRepository.revokeShareLink(pageId),
    onSuccess: () => {
      queryClient.setQueryData<WikiShareRecord | null>(wikiKeys.share(pageId), null)
    },
  })
}
