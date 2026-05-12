import {getSupabaseBrowserClient} from '../../platform/supabase/client'
import {rpcAdapter} from '../../platform/data/rpc-adapter'
import {normalizeRichTextDocument, type RichTextDocument} from '../rich-text/rich-text'
import type {
  AddWikiCommentInput,
  CreateWikiPageInput,
  DeleteWikiPageVersionInput,
  GetWikiPageVersionContentInput,
  PublicWikiPageSnapshot,
  RestoreWikiPageVersionInput,
  UpdateWikiPageInput,
  WikiPageCommentRecord,
  WikiPageListItem,
  WikiPagePinRecord,
  WikiPageRecord,
  WikiPageVersionContent,
  WikiPageVersionMutationResult,
  WikiPageVersionRecord,
  WikiPinnedPageWithMetadata,
  WikiShareRecord,
} from './wiki.types'

// ============================================================
// DB row types
// ============================================================

type WikiPageRow = {
  content?: unknown
  content_json?: unknown
  content_md?: string
  content_text?: string
  created_at: string
  created_by_user_id: string
  deleted_at: string | null
  icon: string | null
  id: string
  organization_id: string
  owner_user_id: string | null
  parent_page_id: string | null
  position: number
  project_id: string | null
  slug: string
  status: string
  title: string
  updated_at: string
  updated_by_user_id: string | null
  verified_at: string | null
  verified_by_user_id: string | null
  version: number
}

type WikiPageListRow = Omit<WikiPageRow, 'content' | 'content_json' | 'content_md' | 'content_text'>

type WikiPageUpdateResult = {
  pageId: string
  pageTitle: string
  pageSlug: string
  pageStatus: string
  pageVersion: number
  pageUpdatedAt: string
  versionEntryId: string | null
  versionEntryVersion: number
  versionEntryCreatedAt: string
}

type WikiPageVersionMutationRow = {
  contentJson: unknown
  contentMd: string
  pageId: string
  pageSlug: string
  pageStatus: string
  pageTitle: string
  pageUpdatedAt: string
  pageVersion: number
  versionEntryAuthorName: string
  versionEntryCreatedAt: string
  versionEntryId: string
  versionEntryTitle: string
  versionEntryVersion: number
}

function rowToVersionMutation(row: WikiPageVersionMutationRow): WikiPageVersionMutationResult {
  return {
    contentJson: normalizeRichTextDocument(row.contentJson as RichTextDocument | null | undefined, row.contentMd),
    contentMd: row.contentMd,
    pageId: row.pageId,
    pageSlug: row.pageSlug,
    pageStatus: row.pageStatus as WikiPageVersionMutationResult['pageStatus'],
    pageTitle: row.pageTitle,
    pageUpdatedAt: row.pageUpdatedAt,
    pageVersion: row.pageVersion,
    versionEntryAuthorName: row.versionEntryAuthorName,
    versionEntryCreatedAt: row.versionEntryCreatedAt,
    versionEntryId: row.versionEntryId,
    versionEntryTitle: row.versionEntryTitle,
    versionEntryVersion: row.versionEntryVersion,
  }
}

function getWikiPageContent(row: WikiPageRow): RichTextDocument {
  return normalizeRichTextDocument(
    (row.content ?? row.content_json) as RichTextDocument | null | undefined,
    row.content_text ?? row.content_md ?? '',
  )
}

function buildWikiUpdateArgs(pageId: string, input: UpdateWikiPageInput) {
  return {
    expected_version: input.expectedVersion ?? null,
    target_content_json: input.contentJson ?? null,
    target_content_md: input.contentMd ?? null,
    target_icon: input.icon ?? null,
    target_page_id: pageId,
    target_parent_page_id: input.parentPageId ?? null,
    target_position: input.position ?? null,
    target_status: input.status ?? null,
    target_title: input.title ?? null,
  }
}

// ============================================================
// Converters
// ============================================================

function rowToPage(row: WikiPageRow): WikiPageRecord {
  return {
    contentJson: getWikiPageContent(row),
    contentMd: row.content_md ?? '',
    createdAt: row.created_at,
    createdByUserId: row.created_by_user_id,
    deletedAt: row.deleted_at,
    icon: row.icon,
    id: row.id,
    organizationId: row.organization_id,
    ownerUserId: row.owner_user_id,
    parentPageId: row.parent_page_id,
    position: row.position,
    projectId: row.project_id,
    slug: row.slug,
    status: row.status as WikiPageRecord['status'],
    title: row.title,
    updatedAt: row.updated_at,
    updatedByUserId: row.updated_by_user_id,
    verifiedAt: row.verified_at,
    verifiedByUserId: row.verified_by_user_id,
    version: row.version,
  }
}

function rowToListItem(row: WikiPageListRow): WikiPageListItem {
  return {
    createdAt: row.created_at,
    createdByUserId: row.created_by_user_id,
    deletedAt: row.deleted_at,
    icon: row.icon,
    id: row.id,
    organizationId: row.organization_id,
    ownerUserId: row.owner_user_id,
    parentPageId: row.parent_page_id,
    position: row.position,
    projectId: row.project_id,
    slug: row.slug,
    status: row.status as WikiPageListItem['status'],
    title: row.title,
    updatedAt: row.updated_at,
    updatedByUserId: row.updated_by_user_id,
    verifiedAt: row.verified_at,
    verifiedByUserId: row.verified_by_user_id,
    version: row.version,
  }
}

// ============================================================
// Wiki pages repository
// ============================================================

const LIST_COLUMNS = 'id, organization_id, project_id, parent_page_id, title, slug, icon, status, verified_at, verified_by_user_id, owner_user_id, position, version, created_by_user_id, updated_by_user_id, created_at, updated_at, deleted_at' as const

export const wikiPageRepository = {
  async getOrgStartupSnapshot(orgSlug: string, pagePath?: string | null): Promise<unknown> {
    return rpcAdapter.call<unknown>('get_org_wiki_startup_snapshot', {
      target_org_slug: orgSlug,
      target_page_path: pagePath ?? null,
    })
  },

  async listOrgPages(organizationId: string): Promise<WikiPageListItem[]> {
    const {data, error} = await getSupabaseBrowserClient()
      .from('wiki_pages')
      .select(LIST_COLUMNS)
      .eq('organization_id', organizationId)
      .is('project_id', null)
      .is('deleted_at', null)
      .order('position', {ascending: true})

    if (error) throw error
    return ((data ?? []) as WikiPageListRow[]).map(rowToListItem)
  },

  async listRecentOrgPages(organizationId: string, limit = 15): Promise<WikiPageListItem[]> {
    const {data, error} = await getSupabaseBrowserClient()
      .from('wiki_pages')
      .select(LIST_COLUMNS)
      .eq('organization_id', organizationId)
      .is('project_id', null)
      .is('deleted_at', null)
      .order('updated_at', {ascending: false})
      .limit(limit)

    if (error) throw error
    return ((data ?? []) as WikiPageListRow[]).map(rowToListItem)
  },

  async listProjectPages(projectId: string): Promise<WikiPageListItem[]> {
    const {data, error} = await getSupabaseBrowserClient()
      .from('wiki_pages')
      .select(LIST_COLUMNS)
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('position', {ascending: true})

    if (error) throw error
    return ((data ?? []) as WikiPageListRow[]).map(rowToListItem)
  },

  async getPage(pageId: string): Promise<WikiPageRecord | null> {
    const {data, error} = await getSupabaseBrowserClient()
      .from('wiki_pages')
      .select('*')
      .eq('id', pageId)
      .is('deleted_at', null)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    return data ? rowToPage(data as WikiPageRow) : null
  },

  async createPage(input: CreateWikiPageInput): Promise<WikiPageListItem> {
    const result = await rpcAdapter.callSingle<WikiPageListRow>('create_wiki_page', {
      target_org_id: input.organizationId,
      target_project_id: input.projectId ?? null,
      target_parent_page_id: input.parentPageId ?? null,
      target_title: input.title ?? '',
    })

    return rowToListItem(result)
  },

  async updatePage(pageId: string, input: UpdateWikiPageInput): Promise<WikiPageUpdateResult> {
    return rpcAdapter.callSingle<WikiPageUpdateResult>(
      'update_wiki_page',
      buildWikiUpdateArgs(pageId, input),
    )
  },

  async deletePage(pageId: string): Promise<void> {
    await rpcAdapter.call('delete_wiki_page', {
      target_page_id: pageId,
    })
  },

  async restorePage(pageId: string): Promise<void> {
    await rpcAdapter.call('restore_wiki_page', {
      target_page_id: pageId,
    })
  },

  async reorderPages(updates: {pageId: string; parentPageId: string | null; position: number}[]): Promise<void> {
    await rpcAdapter.call('reorder_wiki_pages', {
      updates: JSON.stringify(updates.map((u) => ({
        pageId: u.pageId,
        parentPageId: u.parentPageId,
        position: u.position,
      }))),
    })
  },

  async pinPage(pageId: string): Promise<void> {
    await rpcAdapter.call('pin_wiki_page', {
      target_page_id: pageId,
    })
  },

  async unpinPage(pageId: string): Promise<void> {
    await rpcAdapter.call('unpin_wiki_page', {
      target_page_id: pageId,
    })
  },

  async listPinnedPagesWithMetadata(userId: string): Promise<WikiPinnedPageWithMetadata[]> {
    const {data, error} = await getSupabaseBrowserClient()
      .rpc('list_pinned_pages_with_metadata', {target_user_id: userId})

    if (error) throw error

    type Row = {page_id: string; title: string; slug: string; full_path: string; icon: string | null; pin_position: number}
    return ((data ?? []) as Row[]).map((row) => ({
      fullPath: row.full_path,
      icon: row.icon,
      pageId: row.page_id,
      pinPosition: row.pin_position,
      slug: row.slug,
      title: row.title,
    }))
  },

  async listPins(userId: string): Promise<WikiPagePinRecord[]> {
    const {data, error} = await getSupabaseBrowserClient()
      .from('wiki_page_user_pins')
      .select('page_id, position, created_at')
      .eq('user_id', userId)
      .order('position', {ascending: true})

    if (error) throw error
    return ((data ?? []) as {page_id: string; position: number; created_at: string}[]).map((row) => ({
      createdAt: row.created_at,
      pageId: row.page_id,
      position: row.position,
    }))
  },

  async addComment(input: AddWikiCommentInput): Promise<WikiPageCommentRecord> {
    return rpcAdapter.callSingle('add_wiki_page_comment', {
      target_page_id: input.pageId,
      target_body_text: input.bodyText,
    })
  },

  async listComments(pageId: string): Promise<WikiPageCommentRecord[]> {
    return rpcAdapter.callAndTransform<WikiPageCommentRecord[]>('list_wiki_page_comments', {
      target_page_id: pageId,
    })
  },

  async listVersions(pageId: string): Promise<WikiPageVersionRecord[]> {
    return rpcAdapter.callAndTransform<WikiPageVersionRecord[]>('list_wiki_page_versions', {
      target_page_id: pageId,
    })
  },

  async getVersionContent(input: GetWikiPageVersionContentInput): Promise<WikiPageVersionContent> {
    const row = await rpcAdapter.callSingle<WikiPageVersionContent | null>('get_wiki_page_version_content', {
      target_page_id: input.pageId,
      target_version_id: input.versionId,
    })

    if (!row) {
      throw new Error('Version not found')
    }

    return {
      ...row,
      contentJson: normalizeRichTextDocument(row.contentJson, row.contentMd),
    }
  },

  async restoreVersion(input: RestoreWikiPageVersionInput): Promise<WikiPageVersionMutationResult> {
    const row = await rpcAdapter.callSingle<WikiPageVersionMutationRow>('restore_wiki_page_version', {
      expected_version: input.expectedVersion,
      target_page_id: input.pageId,
      target_version_id: input.versionId,
    })

    return rowToVersionMutation(row)
  },

  async deleteVersion(input: DeleteWikiPageVersionInput): Promise<void> {
    await rpcAdapter.call<null>('delete_wiki_page_version', {
      target_page_id: input.pageId,
      target_version_id: input.versionId,
    })
  },

  async searchPages(organizationId: string, query: string): Promise<{
    contentSnippet: string
    fullPath: string
    id: string
    parentPageId: string | null
    projectId: string | null
    rank: number
    slug: string
    status: string
    title: string
    updatedAt: string
  }[]> {
    return rpcAdapter.callAndTransform('search_wiki_pages', {
      target_org_id: organizationId,
      query_text: query,
      max_results: 20,
    })
  },

  // ============================================================
  // Share links
  // ============================================================

  async getShareSnapshot(pageId: string): Promise<WikiShareRecord | null> {
    return rpcAdapter.callSingle<WikiShareRecord | null>('get_wiki_share_snapshot', {
      target_page_id: pageId,
    })
  },

  async createShareLink(pageId: string): Promise<WikiShareRecord> {
    const result = await rpcAdapter.callSingle<WikiShareRecord>('create_wiki_share_link', {
      target_page_id: pageId,
    })
    return result!
  },

  async revokeShareLink(pageId: string): Promise<void> {
    await rpcAdapter.call('revoke_wiki_share_link', {
      target_page_id: pageId,
    })
  },

  async getPublicPage(shareToken: string): Promise<PublicWikiPageSnapshot | null> {
    return rpcAdapter.callSingle<PublicWikiPageSnapshot | null>('get_public_wiki_page', {
      target_share_token: shareToken,
    })
  },
}
