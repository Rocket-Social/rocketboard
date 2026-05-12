import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { normalizeRichTextDocument, type RichTextDocument } from "../rich-text/rich-text";
import type { OrganizationRouteContext } from "../org-settings/org-route.repository";
import { organizationRouteContextQueryOptions } from "../org-settings/org-route.queries";
import { wikiPageRepository } from "./wiki.repository";
import {
  wikiOrgPagesQueryOptions,
  wikiPageQueryOptions,
  wikiPinnedPagesWithMetadataQueryOptions,
  wikiRecentOrgPagesQueryOptions,
} from "./wiki.queries";
import type {
  WikiPageListItem,
  WikiPageRecord,
  WikiPinnedPageWithMetadata,
} from "./wiki.types";

/*
wiki loader
   |
   v
single startup snapshot fetch
   |
   +--> valid: hydrate org/pages/recent/pins/page
   |
   '--> invalid: skip writes, fall back to legacy query fan-out
*/

const organizationRouteContextSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});

const wikiPageListItemSchema = z.object({
  createdAt: z.string(),
  createdByUserId: z.string(),
  deletedAt: z.string().nullable(),
  icon: z.string().nullable(),
  id: z.string(),
  organizationId: z.string(),
  ownerUserId: z.string().nullable(),
  parentPageId: z.string().nullable(),
  position: z.number(),
  projectId: z.string().nullable(),
  slug: z.string(),
  status: z.enum(["draft", "published", "needs_review", "archived"]),
  title: z.string(),
  updatedAt: z.string(),
  updatedByUserId: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  verifiedByUserId: z.string().nullable(),
  version: z.number(),
});

const wikiPinnedPageSchema = z.object({
  fullPath: z.string(),
  icon: z.string().nullable(),
  pageId: z.string(),
  pinPosition: z.number(),
  slug: z.string(),
  title: z.string(),
});

const wikiPageRecordSchema = wikiPageListItemSchema
  .extend({
    contentJson: z.unknown(),
    contentMd: z.string(),
  })
  .transform((value) => ({
    ...value,
    contentJson: normalizeRichTextDocument(
      value.contentJson as RichTextDocument | null | undefined,
      value.contentMd,
    ),
  }) satisfies WikiPageRecord);

const wikiStartupSnapshotSchema = z
  .object({
    organization: organizationRouteContextSchema,
    page: wikiPageRecordSchema.nullable(),
    pageFound: z.boolean(),
    pages: z.array(wikiPageListItemSchema),
    pinnedPages: z.array(wikiPinnedPageSchema),
    recentPages: z.array(wikiPageListItemSchema),
    resolvedPageId: z.string().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.resolvedPageId && !value.pages.some((page) => page.id === value.resolvedPageId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "resolvedPageId must exist in pages",
        path: ["resolvedPageId"],
      });
    }

    if (value.page && value.page.id !== value.resolvedPageId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "page must match resolvedPageId",
        path: ["page"],
      });
    }
  });

export type WikiStartupSnapshot = z.infer<typeof wikiStartupSnapshotSchema>;

export function hydrateWikiStartupSnapshot(
  queryClient: QueryClient,
  orgSlug: string,
  userId: string | null | undefined,
  snapshot: WikiStartupSnapshot,
) {
  queryClient.setQueryData(
    organizationRouteContextQueryOptions(orgSlug).queryKey,
    snapshot.organization,
  );
  queryClient.setQueryData(
    wikiOrgPagesQueryOptions(snapshot.organization.id).queryKey,
    snapshot.pages,
  );
  queryClient.setQueryData(
    wikiRecentOrgPagesQueryOptions(snapshot.organization.id).queryKey,
    snapshot.recentPages,
  );

  if (userId) {
    queryClient.setQueryData(
      wikiPinnedPagesWithMetadataQueryOptions(userId).queryKey,
      snapshot.pinnedPages,
    );
  }

  if (snapshot.page) {
    queryClient.setQueryData(
      wikiPageQueryOptions(snapshot.page.id).queryKey,
      snapshot.page,
    );
  }
}

export async function fetchWikiStartupSnapshot(
  orgSlug: string,
  pagePath?: string | null,
): Promise<WikiStartupSnapshot | null> {
  const rawSnapshot = await wikiPageRepository.getOrgStartupSnapshot(orgSlug, pagePath);

  if (!rawSnapshot) {
    return null;
  }

  const parsedSnapshot = wikiStartupSnapshotSchema.safeParse(rawSnapshot);

  if (!parsedSnapshot.success) {
    return null;
  }

  return parsedSnapshot.data;
}

export async function warmWikiStartupSnapshot(
  queryClient: QueryClient,
  orgSlug: string,
  userId?: string | null,
  pagePath?: string | null,
) {
  try {
    const snapshot = await fetchWikiStartupSnapshot(orgSlug, pagePath);

    if (!snapshot) {
      return null;
    }

    hydrateWikiStartupSnapshot(queryClient, orgSlug, userId, snapshot);
    return snapshot;
  } catch {
    return null;
  }
}

export function buildWikiFallbackSnapshot(args: {
  organization: OrganizationRouteContext;
  page: WikiPageRecord | null;
  pageFound: boolean;
  pages: WikiPageListItem[];
  pinnedPages: WikiPinnedPageWithMetadata[];
  recentPages: WikiPageListItem[];
  resolvedPageId: string | null;
}): WikiStartupSnapshot {
  return args;
}
