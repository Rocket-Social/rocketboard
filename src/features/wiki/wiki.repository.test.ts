import {beforeEach, describe, expect, it, vi} from 'vitest'

const {
  callSingleMock,
  eqMock,
  fromMock,
  getSupabaseBrowserClientMock,
  isMock,
  selectMock,
  singleMock,
} = vi.hoisted(() => ({
  callSingleMock: vi.fn(),
  eqMock: vi.fn(),
  fromMock: vi.fn(),
  getSupabaseBrowserClientMock: vi.fn(),
  isMock: vi.fn(),
  selectMock: vi.fn(),
  singleMock: vi.fn(),
}))

vi.mock('../../platform/data/rpc-adapter', () => ({
  rpcAdapter: {
    call: vi.fn(),
    callAndTransform: vi.fn(),
    callSingle: callSingleMock,
  },
}))

vi.mock('../../platform/supabase/client', () => ({
  getSupabaseBrowserClient: getSupabaseBrowserClientMock,
}))

import {wikiPageRepository} from './wiki.repository'

describe('wikiPageRepository', () => {
  beforeEach(() => {
    callSingleMock.mockReset()
    eqMock.mockReset()
    fromMock.mockReset()
    getSupabaseBrowserClientMock.mockReset()
    isMock.mockReset()
    selectMock.mockReset()
    singleMock.mockReset()

    selectMock.mockReturnValue({eq: eqMock})
    eqMock.mockReturnValue({is: isMock})
    isMock.mockReturnValue({single: singleMock})

    fromMock.mockReturnValue({select: selectMock})
    getSupabaseBrowserClientMock.mockReturnValue({from: fromMock})
  })

  it('sends the update_wiki_page RPC with arguments matching the SQL signature', async () => {
    callSingleMock.mockResolvedValue({
      pageId: 'page-1',
      pageSlug: 'updated-title',
      pageStatus: 'draft',
      pageTitle: 'Updated title',
      pageUpdatedAt: '2026-04-08T18:00:00.000Z',
      pageVersion: 2,
      versionEntryCreatedAt: '2026-04-08T18:00:00.000Z',
      versionEntryId: null,
      versionEntryVersion: 2,
    })

    await wikiPageRepository.updatePage('page-1', {
      title: 'Updated title',
    })

    expect(callSingleMock).toHaveBeenCalledTimes(1)
    expect(callSingleMock).toHaveBeenCalledWith('update_wiki_page', {
      expected_version: null,
      target_content_json: null,
      target_content_md: null,
      target_icon: null,
      target_page_id: 'page-1',
      target_parent_page_id: null,
      target_position: null,
      target_status: null,
      target_title: 'Updated title',
    })
  })

  it('hydrates page content from the live wiki content column', async () => {
    singleMock.mockResolvedValue({
      data: {
        content: {
          content: [
            {
              content: [{text: 'Invoice instructions', type: 'text'}],
              type: 'paragraph',
            },
          ],
          type: 'doc',
        },
        content_md: 'Invoice instructions',
        content_text: 'Invoice instructions',
        created_at: '2026-04-08T18:00:00.000Z',
        created_by_user_id: 'user-1',
        deleted_at: null,
        icon: null,
        id: 'page-1',
        organization_id: 'org-1',
        owner_user_id: null,
        parent_page_id: null,
        position: 0,
        project_id: null,
        slug: 'invoice-instructions',
        status: 'draft',
        title: 'Invoicing Instructions',
        updated_at: '2026-04-08T18:00:00.000Z',
        updated_by_user_id: 'user-1',
        verified_at: null,
        verified_by_user_id: null,
        version: 1,
      },
      error: null,
    })

    const result = await wikiPageRepository.getPage('page-1')

    expect(fromMock).toHaveBeenCalledWith('wiki_pages')
    expect(result?.contentJson).toEqual({
      content: [
        {
          content: [{text: 'Invoice instructions', type: 'text'}],
          type: 'paragraph',
        },
      ],
      type: 'doc',
    })
    expect(result?.contentMd).toBe('Invoice instructions')
  })
})
