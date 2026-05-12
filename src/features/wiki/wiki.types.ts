import type {ContentDocument} from '../rich-text/content.types'
import type {RichTextDocument} from '../rich-text/rich-text'

// ============================================================
// Share types
// ============================================================

export type WikiShareRecord = {
  createdAt: string
  revokedAt: string | null
  shareToken: string
}

export type PublicWikiPageSnapshot = ContentDocument & {
  icon: string | null
  title: string
  updatedAt: string
}

// ============================================================
// Records
// ============================================================

export type WikiPageStatus = 'draft' | 'published' | 'needs_review' | 'archived'

export type WikiPageRecord = ContentDocument & {
  createdAt: string
  createdByUserId: string
  deletedAt: string | null
  icon: string | null
  id: string
  organizationId: string
  ownerUserId: string | null
  parentPageId: string | null
  position: number
  projectId: string | null
  slug: string
  status: WikiPageStatus
  title: string
  updatedAt: string
  updatedByUserId: string | null
  verifiedAt: string | null
  verifiedByUserId: string | null
  version: number
}

export type WikiPageListItem = Omit<WikiPageRecord, 'contentJson' | 'contentMd'>

export type WikiPageVersionRecord = {
  authorName: string
  createdAt: string
  id: string
  revisionNumber: number
  title: string
  version: number
}

export type WikiPageVersionContent = ContentDocument & {
  authorName: string
  createdAt: string
  id: string
  revisionNumber: number
  title: string
  version: number
}

export type WikiPageVersionMutationResult = ContentDocument & {
  pageId: string
  pageSlug: string
  pageStatus: WikiPageStatus
  pageTitle: string
  pageUpdatedAt: string
  pageVersion: number
  versionEntryAuthorName: string
  versionEntryCreatedAt: string
  versionEntryId: string
  versionEntryTitle: string
  versionEntryVersion: number
}

export type WikiPageCommentRecord = {
  authorAvatarUrl?: string | null
  authorName: string
  authorUserId: string
  bodyText: string
  createdAt: string
  id: string
  pageId: string
}

export type WikiPagePinRecord = {
  createdAt: string
  pageId: string
  position: number
}

export type WikiPinnedPageWithMetadata = {
  fullPath: string
  icon: string | null
  pageId: string
  pinPosition: number
  slug: string
  title: string
}

// ============================================================
// Inputs
// ============================================================

export type CreateWikiPageInput = {
  organizationId: string
  parentPageId?: string | null
  projectId?: string | null
  title?: string
}

export type UpdateWikiPageInput = {
  contentJson?: RichTextDocument
  contentMd?: string
  expectedVersion?: number
  icon?: string | null
  parentPageId?: string | null
  position?: number
  status?: WikiPageStatus
  title?: string
}

export type AddWikiCommentInput = {
  bodyText: string
  pageId: string
}

export type DeleteWikiPageVersionInput = {
  pageId: string
  versionId: string
}

export type GetWikiPageVersionContentInput = {
  pageId: string
  versionId: string
}

export type RestoreWikiPageVersionInput = {
  expectedVersion: number
  pageId: string
  versionId: string
}

// ============================================================
// Tree helpers
// ============================================================

export type WikiPageTreeNode = WikiPageListItem & {
  children: WikiPageTreeNode[]
}

export function buildWikiPageTree(pages: WikiPageListItem[]): WikiPageTreeNode[] {
  const nodeMap = new Map<string, WikiPageTreeNode>()
  const roots: WikiPageTreeNode[] = []

  for (const page of pages) {
    nodeMap.set(page.id, {...page, children: []})
  }

  for (const page of pages) {
    const node = nodeMap.get(page.id)!

    if (page.parentPageId && nodeMap.has(page.parentPageId)) {
      nodeMap.get(page.parentPageId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  // Sort children by position at each level
  const sortChildren = (nodes: WikiPageTreeNode[]) => {
    nodes.sort((a, b) => a.position - b.position)
    for (const node of nodes) {
      sortChildren(node.children)
    }
  }

  sortChildren(roots)

  return roots
}

// ============================================================
// Display helpers
// ============================================================

export function getWikiPageDisplayTitle(page: {title: string}): string {
  const trimmed = page.title.trim()
  return trimmed || 'Untitled'
}

export function formatWikiPageDate(dateString: string): string {
  const now = Date.now()
  const timestamp = new Date(dateString).getTime()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 7) {
    return new Date(timestamp).toLocaleDateString()
  }

  if (days > 0) {
    return `${days}d ago`
  }

  if (hours > 0) {
    return `${hours}h ago`
  }

  if (minutes > 0) {
    return `${minutes}m ago`
  }

  return 'Just now'
}

// ============================================================
// Slug helpers
// ============================================================

export function buildWikiPagePath(
  page: {slug: string; parentPageId: string | null},
  pages: {id: string; slug: string; parentPageId: string | null}[],
): string {
  const segments: string[] = [page.slug]
  let currentParentId = page.parentPageId
  const visited = new Set<string>()

  while (currentParentId && !visited.has(currentParentId)) {
    visited.add(currentParentId)
    const parent = pages.find((p) => p.id === currentParentId)
    if (!parent) break
    segments.unshift(parent.slug)
    currentParentId = parent.parentPageId
  }

  return segments.join('/')
}

export function buildWikiPagePathFromMap(
  page: {slug: string; parentPageId: string | null},
  pagesById: ReadonlyMap<string, {slug: string; parentPageId: string | null}>,
): string {
  const segments: string[] = [page.slug]
  let currentParentId = page.parentPageId
  const visited = new Set<string>()

  while (currentParentId && !visited.has(currentParentId)) {
    visited.add(currentParentId)
    const parent = pagesById.get(currentParentId)
    if (!parent) break
    segments.unshift(parent.slug)
    currentParentId = parent.parentPageId
  }

  return segments.join('/')
}

export function buildWikiPageBreadcrumbs(
  page: {id: string; title: string; parentPageId: string | null},
  pages: {id: string; title: string; slug: string; parentPageId: string | null}[],
): {id: string; title: string; slug: string}[] {
  const crumbs: {id: string; title: string; slug: string}[] = []
  let currentParentId = page.parentPageId
  const visited = new Set<string>()

  while (currentParentId && !visited.has(currentParentId)) {
    visited.add(currentParentId)
    const parent = pages.find((p) => p.id === currentParentId)
    if (!parent) break
    crumbs.unshift({id: parent.id, title: parent.title || 'Untitled', slug: parent.slug})
    currentParentId = parent.parentPageId
  }

  return crumbs
}
