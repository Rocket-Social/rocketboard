import type { SurfaceContext, WikiSurfacePageReference, WikiSurfaceTreeReference } from '../ai/ai.types'
import { buildWikiSurfaceResourceId } from '../ai/ai-surface-resource.shared'
import { prepareContentForSave } from '../rich-text/prepare-content'
import type { RichTextDocument } from '../rich-text/rich-text'
import type { WikiPageListItem, WikiPageRecord, WikiPinnedPageWithMetadata } from './wiki.types'
import {
  buildWikiPageBreadcrumbs,
  buildWikiPagePath,
  buildWikiPageTree,
  getWikiPageDisplayTitle,
} from './wiki.types'

const MAX_INDEX_PAGE_REFERENCES = 12
const MAX_PINNED_REFERENCES = 5
const MAX_PAGE_CONTENT_CHARS = 4000
const MAX_RECENT_REFERENCES = 5

export const WIKI_EMPTY_INDEX_PROMPTS = [
  'What should this wiki document first?',
  'Draft starter wiki pages for this workspace',
  'Suggest a lightweight knowledge map',
]

export const WIKI_INDEX_PROMPTS = [
  'Summarize pinned and recently updated wiki pages',
  'As a product manager, which wiki pages should I read first?',
  'What knowledge gaps should we document next?',
]

export const WIKI_PAGE_PROMPTS = [
  'Summarize this wiki page',
  'Identify gaps or outdated assumptions',
  'Suggest a clearer structure',
]

function buildTreeReferences(pages: WikiPageListItem[]): WikiSurfaceTreeReference[] {
  const references: WikiSurfaceTreeReference[] = []
  const tree = buildWikiPageTree(pages)

  const visit = (nodes: ReturnType<typeof buildWikiPageTree>, depth: number) => {
    for (const node of nodes) {
      if (references.length >= MAX_INDEX_PAGE_REFERENCES) return
      references.push({
        depth,
        fullPath: buildWikiPagePath(node, pages),
        title: getWikiPageDisplayTitle(node),
      })
      visit(node.children, depth + 1)
      if (references.length >= MAX_INDEX_PAGE_REFERENCES) return
    }
  }

  visit(tree, 0)
  return references
}

function buildPageReference(fullPath: string, title: string, updatedAt?: string): WikiSurfacePageReference {
  return {
    fullPath,
    title: title.trim() || 'Untitled',
    updatedAt,
  }
}

function truncateContent(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

export function buildWikiIndexAiContext(args: {
  organizationId: string
  pages: WikiPageListItem[]
  pinnedPages: WikiPinnedPageWithMetadata[]
  recentPages: WikiPageListItem[]
}): SurfaceContext {
  return {
    resourceId: buildWikiSurfaceResourceId('index', args.organizationId),
    wikiPageCount: args.pages.length,
    wikiPageList: buildTreeReferences(args.pages),
    wikiPinnedPages: args.pinnedPages
      .slice(0, MAX_PINNED_REFERENCES)
      .map((page) => buildPageReference(page.fullPath, page.title)),
    wikiRecentPages: args.recentPages
      .slice(0, MAX_RECENT_REFERENCES)
      .map((page) => buildPageReference(
        buildWikiPagePath(page, args.pages),
        page.title,
        page.updatedAt,
      )),
    wikiView: args.pages.length === 0 ? 'empty-index' : 'index',
  }
}

export function buildWikiPageAiContext(args: {
  allPages: WikiPageListItem[]
  content: RichTextDocument
  page: WikiPageRecord
  title: string
}): SurfaceContext {
  const wikiPageTitle = args.title.trim() || 'Untitled'
  const wikiPagePath = buildWikiPagePath(args.page, args.allPages)
  const wikiBreadcrumbs = buildWikiPageBreadcrumbs(args.page, args.allPages).map((crumb) => crumb.title || 'Untitled')
  const preparedContent = prepareContentForSave(args.content)

  return {
    resourceId: buildWikiSurfaceResourceId('page', args.page.id),
    wikiBreadcrumbs,
    wikiPageContentMd: truncateContent(preparedContent.contentMd, MAX_PAGE_CONTENT_CHARS),
    wikiPagePath,
    wikiPageStatus: args.page.status,
    wikiPageTitle,
    wikiPageUpdatedAt: args.page.updatedAt,
    wikiView: 'page',
  }
}
