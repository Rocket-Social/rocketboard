import {McpServer, ResourceTemplate} from '@modelcontextprotocol/sdk/server/mcp.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import * as z from 'zod/v4'

import {
  normalizeCardScope,
  normalizeDocumentScope,
  normalizeProjectScope,
  normalizeSprintScope,
} from './references.js'
import {RocketboardService} from './service.js'

const userSchema = z.object({
  email: z.string().nullable(),
  id: z.string(),
  name: z.string(),
})

const workspaceSummarySchema = z.object({
  colorToken: z.string(),
  id: z.string(),
  name: z.string(),
  organizationId: z.string(),
  organizationName: z.string(),
  projects: z.array(
    z.object({
      access: z.enum(['open', 'private']),
      icon: z.string(),
      id: z.string(),
      key: z.string(),
      memberCount: z.number(),
      name: z.string(),
      slug: z.string(),
      taskCount: z.number(),
      updatedAt: z.string(),
    }),
  ),
  slug: z.string(),
})

const projectContextSchema = z.object({
  canManageProject: z.boolean(),
  currentUser: userSchema,
  customFields: z.array(
    z.object({
      fieldType: z.enum(['date', 'number', 'single_select', 'text']),
      id: z.string(),
      key: z.string(),
      name: z.string(),
      options: z.array(
        z.object({
          color: z.string().nullable(),
          id: z.string(),
          label: z.string(),
        }),
      ),
    }),
  ),
  defaultPriorityId: z.string().nullable(),
  defaultStatusId: z.string().nullable(),
  groups: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      position: z.number(),
    }),
  ),
  members: z.array(
    z.object({
      email: z.string(),
      id: z.string(),
      name: z.string(),
      role: z.enum(['admin', 'member']),
    }),
  ),
  priorities: z.array(
    z.object({
      color: z.string().nullable(),
      id: z.string(),
      isDefault: z.boolean(),
      key: z.string(),
      label: z.string(),
      sortOrder: z.number(),
    }),
  ),
  project: z.object({
    access: z.enum(['open', 'private']),
    defaultProjectViewId: z.string().nullable(),
    icon: z.string(),
    id: z.string(),
    key: z.string(),
    memberCount: z.number(),
    name: z.string(),
    projectViews: z.array(z.record(z.string(), z.unknown())).nullable(),
    slug: z.string(),
    taskCount: z.number(),
    updatedAt: z.string(),
  }),
  sprints: z.array(
    z.object({
      completedAt: z.string().nullable(),
      endDate: z.string().nullable(),
      goal: z.string().nullable(),
      id: z.string(),
      name: z.string(),
      position: z.number(),
      startDate: z.string().nullable(),
      status: z.enum(['active', 'completed', 'planned']),
    }),
  ),
  statuses: z.array(
    z.object({
      category: z.enum(['completed', 'not_started', 'started']),
      color: z.string().nullable(),
      id: z.string(),
      isDefault: z.boolean(),
      key: z.string(),
      label: z.string(),
      position: z.number(),
    }),
  ),
  workspace: z.object({
    colorToken: z.string(),
    id: z.string(),
    name: z.string(),
    organizationId: z.string(),
    organizationName: z.string(),
    slug: z.string(),
  }),
})

const cardSummarySchema = z.object({
  assignee: z.object({id: z.string(), name: z.string()}).nullable(),
  cardId: z.string(),
  cardRef: z.string(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  customFieldValues: z.record(z.string(), z.unknown()),
  dueAt: z.string().nullable(),
  effort: z.number().nullable(),
  group: z.object({id: z.string(), label: z.string()}).nullable(),
  initiativeId: z.string().nullable(),
  priority: z
    .object({
      color: z.string().nullable(),
      id: z.string(),
      key: z.string(),
      label: z.string(),
    })
    .nullable(),
  projectCardNumber: z.number(),
  projectId: z.string(),
  projectKey: z.string(),
  sprint: z
    .object({
      id: z.string(),
      name: z.string(),
      status: z.enum(['active', 'completed', 'planned']),
    })
    .nullable(),
  startAt: z.string().nullable(),
  status: z
    .object({
      category: z.enum(['completed', 'not_started', 'started']),
      id: z.string(),
      key: z.string(),
      label: z.string(),
    })
    .nullable(),
  tags: z.array(z.string()),
  title: z.string(),
})

const cardDetailSchema = z.object({
  assignee: z.object({id: z.string(), name: z.string()}).nullable(),
  attachments: z.array(
    z.object({
      contentType: z.string().nullable(),
      createdAt: z.string(),
      fileName: z.string(),
      id: z.string(),
      sizeBytes: z.number(),
      storagePath: z.string(),
      uploadedByName: z.string(),
    }),
  ),
  bodyJson: z.unknown(),
  bodyText: z.string(),
  cardId: z.string(),
  cardRef: z.string(),
  comments: z.array(
    z.object({
      authorName: z.string(),
      bodyText: z.string(),
      createdAt: z.string(),
      id: z.string(),
    }),
  ),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  customFieldValues: z.record(z.string(), z.unknown()),
  dueAt: z.string().nullable(),
  effort: z.number().nullable(),
  group: z.object({id: z.string(), label: z.string()}).nullable(),
  initiativeId: z.string().nullable(),
  priority: z
    .object({
      color: z.string().nullable(),
      id: z.string(),
      key: z.string(),
      label: z.string(),
    })
    .nullable(),
  project: z.object({
    id: z.string(),
    key: z.string(),
    projectCardNumber: z.number(),
  }),
  recentActivity: z.array(
    z.object({
      actorId: z.string().nullable(),
      actorName: z.string(),
      createdAt: z.string(),
      eventAction: z.string(),
      eventType: z.string(),
      id: z.string(),
      metadata: z.record(z.string(), z.unknown()),
      title: z.string(),
    }),
  ),
  sprint: z
    .object({
      id: z.string(),
      name: z.string(),
      status: z.enum(['active', 'completed', 'planned']),
    })
    .nullable(),
  startAt: z.string().nullable(),
  status: z
    .object({
      category: z.enum(['completed', 'not_started', 'started']),
      id: z.string(),
      key: z.string(),
      label: z.string(),
    })
    .nullable(),
  tags: z.array(z.string()),
  title: z.string(),
})

const searchCardSchema = z.object({
  cardId: z.string(),
  cardRef: z.string().nullable(),
  priorityOptionId: z.string().nullable(),
  projectCardNumber: z.number().nullable(),
  projectId: z.string().nullable(),
  projectKey: z.string().nullable(),
  projectName: z.string().nullable(),
  projectSlug: z.string().nullable(),
  rank: z.number(),
  snippet: z.string(),
  statusOptionId: z.string().nullable(),
  title: z.string(),
  workspaceId: z.string().nullable(),
  workspaceName: z.string().nullable(),
  workspaceSlug: z.string().nullable(),
})

const searchDocumentSchema = z.object({
  documentId: z.string(),
  projectId: z.string().nullable(),
  projectKey: z.string().nullable(),
  projectName: z.string().nullable(),
  projectSlug: z.string().nullable(),
  projectViewId: z.string(),
  rank: z.number(),
  snippet: z.string(),
  source: z.enum(['comment', 'document']),
  title: z.string(),
  workspaceId: z.string().nullable(),
  workspaceName: z.string().nullable(),
  workspaceSlug: z.string().nullable(),
})

const sprintSummarySchema = z.object({
  atRisk: z.array(
    z.object({
      assigneeName: z.string().nullable(),
      cardId: z.string(),
      cardRef: z.string(),
      dueAt: z.string().nullable(),
      reasons: z.array(z.string()),
      statusCategory: z.enum(['completed', 'not_started', 'started']).nullable(),
      statusLabel: z.string().nullable(),
      title: z.string(),
    }),
  ),
  countsByStatus: z.array(
    z.object({
      category: z.enum(['completed', 'not_started', 'started']),
      count: z.number(),
      label: z.string(),
      statusId: z.string(),
    }),
  ),
  project: z.object({
    id: z.string(),
    key: z.string(),
    name: z.string(),
  }),
  sprint: z.object({
    completedAt: z.string().nullable(),
    endDate: z.string().nullable(),
    goal: z.string().nullable(),
    id: z.string(),
    name: z.string(),
    position: z.number(),
    startDate: z.string().nullable(),
    status: z.enum(['active', 'completed', 'planned']),
  }),
  totalCards: z.number(),
  totalEffort: z.number(),
})

const documentSnapshotSchema = z.object({
  attachments: z.array(
    z.object({
      contentType: z.string().nullable(),
      createdAt: z.string(),
      fileName: z.string(),
      id: z.string(),
      sizeBytes: z.number(),
      storagePath: z.string(),
      uploadedByName: z.string(),
    }),
  ),
  comments: z.array(
    z.object({
      authorName: z.string(),
      bodyText: z.string(),
      createdAt: z.string(),
      id: z.string(),
    }),
  ),
  document: z.object({
    contentJson: z.unknown(),
    contentMd: z.string(),
    id: z.string(),
    projectId: z.string(),
    projectKey: z.string().optional(),
    projectName: z.string().optional(),
    projectSlug: z.string().optional(),
    projectViewId: z.string().optional(),
    title: z.string(),
    updatedAt: z.string(),
    updatedByName: z.string(),
    version: z.number(),
  }),
  versions: z.array(
    z.object({
      authorName: z.string(),
      createdAt: z.string(),
      id: z.string(),
      title: z.string(),
      version: z.number(),
    }),
  ),
})

function jsonToolResult<T extends Record<string, unknown>>(payload: T) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload,
  }
}

const cursorSchema = z.string().nullable()
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200

type RocketboardMcpDistribution = 'hosted' | 'local'

type CreateRocketboardMcpServerOptions = {
  distribution?: RocketboardMcpDistribution
}

export function normalizePageLimit(limit: number | null | undefined, defaultLimit = DEFAULT_PAGE_SIZE) {
  if (typeof limit !== 'number' || Number.isNaN(limit)) {
    return defaultLimit
  }

  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.trunc(limit)))
}

export function decodeCursor(cursor: string | null | undefined) {
  if (!cursor) {
    return 0
  }

  const parsed = Number.parseInt(cursor, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid cursor "${cursor}". Expected a non-negative integer offset.`)
  }

  return parsed
}

export function encodeCursor(offset: number) {
  return String(offset)
}

export function paginateItems<T>(
  items: T[],
  cursor: string | null | undefined,
  limit: number | null | undefined,
  defaultLimit = DEFAULT_PAGE_SIZE,
) {
  const offset = decodeCursor(cursor)
  const pageSize = normalizePageLimit(limit, defaultLimit)
  const nextOffset = offset + pageSize

  return {
    items: items.slice(offset, nextOffset),
    nextCursor: nextOffset < items.length ? encodeCursor(nextOffset) : null,
  }
}

function paginateCardDetail(
  payload: Awaited<ReturnType<RocketboardService['getCard']>>,
  input: {
    activityCursor?: string | null
    activityLimit?: number | null
    commentCursor?: string | null
    commentLimit?: number | null
  },
) {
  const commentsPage = paginateItems(payload.card.comments, input.commentCursor, input.commentLimit)
  const activityPage = paginateItems(payload.card.recentActivity, input.activityCursor, input.activityLimit)

  return {
    card: {
      ...payload.card,
      comments: commentsPage.items,
      recentActivity: activityPage.items,
    },
    commentsNextCursor: commentsPage.nextCursor,
    recentActivityNextCursor: activityPage.nextCursor,
  }
}

function paginateDocumentSnapshot(
  payload: Awaited<ReturnType<RocketboardService['getDocument']>>,
  input: {
    commentCursor?: string | null
    commentLimit?: number | null
    versionCursor?: string | null
    versionLimit?: number | null
  },
) {
  const commentsPage = paginateItems(payload.document.comments, input.commentCursor, input.commentLimit)
  const versionsPage = paginateItems(payload.document.versions, input.versionCursor, input.versionLimit)

  return {
    commentsNextCursor: commentsPage.nextCursor,
    document: {
      ...payload.document,
      comments: commentsPage.items,
      versions: versionsPage.items,
    },
    versionsNextCursor: versionsPage.nextCursor,
  }
}

function paginateSearchResults(
  payload: Awaited<ReturnType<RocketboardService['search']>>,
  input: {cursor?: string | null; limit?: number | null},
) {
  const ranked = [
    ...payload.cards.map(card => ({kind: 'card' as const, rank: card.rank, value: card})),
    ...payload.documents.map(document => ({kind: 'document' as const, rank: document.rank, value: document})),
  ].sort((left, right) => right.rank - left.rank)

  const page = paginateItems(ranked, input.cursor, input.limit)

  return {
    cards: page.items.filter(item => item.kind === 'card').map(item => item.value),
    documents: page.items.filter(item => item.kind === 'document').map(item => item.value),
    nextCursor: page.nextCursor,
    scope: payload.scope,
  }
}

function jsonResourceResult(uri: string, payload: Record<string, unknown>) {
  return {
    contents: [
      {
        mimeType: 'application/json',
        text: JSON.stringify(payload, null, 2),
        uri,
      },
    ],
  }
}

function registerRocketboardResources(server: McpServer, service: RocketboardService) {
  server.registerResource(
    'project-context',
    new ResourceTemplate('rocketboard://project/{workspace}/{project}', {list: undefined}),
    {
      description: 'Resolve a Rocketboard project context by workspace slug and project slug.',
      mimeType: 'application/json',
      title: 'Project Context',
    },
    async (uri, variables) =>
      jsonResourceResult(
        uri.toString(),
        await service.getProjectContext({
          project: String(variables.project),
          workspace: String(variables.workspace),
        }),
      ),
  )

  server.registerResource(
    'card-detail',
    new ResourceTemplate('rocketboard://card/{workspace}/{project}/{card}', {list: undefined}),
    {
      description: 'Load a Rocketboard card by workspace/project scope and card identifier.',
      mimeType: 'application/json',
      title: 'Card Detail',
    },
    async (uri, variables) =>
      jsonResourceResult(
        uri.toString(),
        paginateCardDetail(
          await service.getCard({
            card: String(variables.card),
            project: String(variables.project),
            workspace: String(variables.workspace),
            writeMode: false,
          }),
          {},
        ),
      ),
  )

  server.registerResource(
    'document-detail',
    new ResourceTemplate('rocketboard://document/{workspace}/{project}/{document}', {list: undefined}),
    {
      description: 'Load a Rocketboard document by workspace/project scope and document identifier.',
      mimeType: 'application/json',
      title: 'Document Detail',
    },
    async (uri, variables) =>
      jsonResourceResult(
        uri.toString(),
        paginateDocumentSnapshot(
          await service.getDocument({
            document: String(variables.document),
            project: String(variables.project),
            workspace: String(variables.workspace),
          }),
          {},
        ),
      ),
  )

  server.registerResource(
    'sprint-summary',
    new ResourceTemplate('rocketboard://sprint/{workspace}/{project}/{sprint}', {list: undefined}),
    {
      description: 'Load a Rocketboard sprint summary by workspace/project scope and sprint identifier.',
      mimeType: 'application/json',
      title: 'Sprint Summary',
    },
    async (uri, variables) =>
      jsonResourceResult(
        uri.toString(),
        await service.getSprintSummary({
          project: String(variables.project),
          sprint: String(variables.sprint),
          workspace: String(variables.workspace),
        }),
      ),
  )
}

export function createRocketboardMcpServer(
  service: RocketboardService,
  options: CreateRocketboardMcpServerOptions = {},
) {
  const distribution = options.distribution ?? 'local'
  const server = new McpServer({
    name: 'rocketboard-mcp',
    version: '0.1.0',
  })
  registerRocketboardResources(server, service)

  server.registerTool(
    'list_workspaces',
    {
      annotations: {readOnlyHint: true},
      description: 'List workspaces and accessible projects for the signed-in Rocketboard user.',
      outputSchema: {
        currentUser: userSchema,
        workspaces: z.array(workspaceSummarySchema),
      },
    },
    async () => jsonToolResult(await service.listWorkspaces()),
  )

  server.registerTool(
    'get_project_context',
    {
      annotations: {readOnlyHint: true},
      description: 'Resolve a Rocketboard project and return the full project context needed for card workflows.',
      inputSchema: {
        project: z.string().describe('Project UUID, key, slug, exact name, or unique fuzzy match.'),
        workspace: z.string().optional().describe('Optional workspace UUID, slug, or name to disambiguate the project.'),
      },
      outputSchema: projectContextSchema,
    },
    async ({project, workspace}) => {
      const normalized = normalizeProjectScope({project, workspace})
      return jsonToolResult(await service.getProjectContext(normalized))
    },
  )

  server.registerTool(
    'list_cards',
    {
      annotations: {readOnlyHint: true},
      description: 'List cards in a project with human-readable status, priority, sprint, and group labels.',
      inputSchema: {
        assignee: z.string().optional(),
        cursor: z.string().optional().describe('Optional pagination cursor from a previous list_cards call.'),
        group: z.string().optional(),
        limit: z.number().int().positive().max(200).optional(),
        project: z.string(),
        query: z.string().optional(),
        sprint: z.string().optional(),
        status: z.string().optional(),
        workspace: z.string().optional(),
      },
      outputSchema: {
        cards: z.array(cardSummarySchema),
        nextCursor: cursorSchema,
        project: projectContextSchema.shape.project,
      },
    },
    async input => {
      const normalized = normalizeProjectScope({
        project: input.project,
        workspace: input.workspace,
      })
      const result = await service.listCards({
        ...input,
        limit: undefined,
        project: normalized.project,
        workspace: normalized.workspace,
      })
      const page = paginateItems(result.cards, input.cursor, input.limit)

      return jsonToolResult({
        cards: page.items,
        nextCursor: page.nextCursor,
        project: result.project,
      })
    },
  )

  server.registerTool(
    'get_card',
    {
      annotations: {readOnlyHint: true},
      description: 'Open a Rocketboard card by UUID, cardRef, or unique project-scoped title match.',
      inputSchema: {
        activityCursor: z.string().optional().describe('Optional pagination cursor for recent activity.'),
        activityLimit: z.number().int().positive().max(200).optional().describe('Maximum recent activity items to return.'),
        card: z.string().describe('Card UUID, cardRef like RB-142, or project-scoped title.'),
        commentCursor: z.string().optional().describe('Optional pagination cursor for comments.'),
        commentLimit: z.number().int().positive().max(200).optional().describe('Maximum comment items to return.'),
        project: z.string().optional(),
        workspace: z.string().optional(),
      },
      outputSchema: {
        card: cardDetailSchema,
        commentsNextCursor: cursorSchema,
        recentActivityNextCursor: cursorSchema,
      },
    },
    async input => {
      const normalized = normalizeCardScope({
        card: input.card,
        project: input.project,
        workspace: input.workspace,
      })

      return jsonToolResult(
        paginateCardDetail(
          await service.getCard({
            ...normalized,
            writeMode: false,
          }),
          input,
        ),
      )
    },
  )

  server.registerTool(
    'search',
    {
      annotations: {readOnlyHint: true},
      description: 'Search cards and documents in a project, workspace, or across all accessible Rocketboard content.',
      inputSchema: {
        cursor: z.string().optional().describe('Optional pagination cursor from a previous search call.'),
        limit: z.number().int().positive().max(200).optional().describe('Maximum combined search hits to return.'),
        project: z.string().optional(),
        query: z.string(),
        workspace: z.string().optional(),
      },
      outputSchema: {
        cards: z.array(searchCardSchema),
        documents: z.array(searchDocumentSchema),
        nextCursor: cursorSchema,
        scope: z.record(z.string(), z.unknown()),
      },
    },
    async input => {
      const normalizedProject = input.project
        ? normalizeProjectScope({
            project: input.project,
            workspace: input.workspace,
          })
        : null

      return jsonToolResult(
        paginateSearchResults(
          await service.search({
            project: normalizedProject?.project,
            query: input.query,
            workspace: normalizedProject?.workspace ?? input.workspace,
          }),
          input,
        ),
      )
    },
  )

  server.registerTool(
    'get_document',
    {
      annotations: {readOnlyHint: true},
      description: 'Open a Rocketboard document by document UUID or unique title match within a project or workspace.',
      inputSchema: {
        commentCursor: z.string().optional().describe('Optional pagination cursor for document comments.'),
        commentLimit: z.number().int().positive().max(200).optional().describe('Maximum document comments to return.'),
        document: z.string().optional().describe('Document UUID or title if title is unique within the selected scope.'),
        project: z.string().optional(),
        title: z.string().optional(),
        versionCursor: z.string().optional().describe('Optional pagination cursor for document versions.'),
        versionLimit: z.number().int().positive().max(200).optional().describe('Maximum document versions to return.'),
        workspace: z.string().optional(),
      },
      outputSchema: {
        document: documentSnapshotSchema,
        commentsNextCursor: cursorSchema,
        versionsNextCursor: cursorSchema,
      },
    },
    async input => jsonToolResult(paginateDocumentSnapshot(await service.getDocument(normalizeDocumentScope(input)), input)),
  )

  server.registerTool(
    'get_sprint_summary',
    {
      annotations: {readOnlyHint: true},
      description: 'Summarize a project sprint with counts by status, effort totals, and explicit risk rules.',
      inputSchema: {
        project: z.string(),
        sprint: z.string().optional().describe('Sprint UUID, exact name, or "active". Defaults to the active sprint when present.'),
        workspace: z.string().optional(),
      },
      outputSchema: sprintSummarySchema,
    },
    async input => jsonToolResult(await service.getSprintSummary(normalizeSprintScope(input))),
  )

  if (service.writesEnabled) {
    server.registerTool(
      'create_card',
      {
        description: 'Create a Rocketboard card with defaults derived from the target project context.',
        inputSchema: {
          assignee: z.string().nullable().optional(),
          bodyJson: z.unknown().nullable().optional(),
          bodyText: z.string().optional(),
          customFields: z.record(z.string(), z.unknown()).nullable().optional(),
          dueAt: z.string().nullable().optional(),
          effort: z.number().nullable().optional(),
          group: z.string().nullable().optional(),
          priority: z.string().nullable().optional(),
          project: z.string(),
          sprint: z.string().nullable().optional(),
          startAt: z.string().nullable().optional(),
          status: z.string().nullable().optional(),
          tags: z.array(z.string()).optional(),
          title: z.string(),
          workspace: z.string().nullable().optional(),
        },
        outputSchema: {
          card: cardDetailSchema,
        },
      },
      async input => {
        const normalized = normalizeProjectScope({
          project: input.project,
          workspace: input.workspace ?? undefined,
        })
        return jsonToolResult(
          await service.createCard({
            ...input,
            project: normalized.project,
            workspace: normalized.workspace ?? input.workspace,
          }),
        )
      },
    )

    server.registerTool(
      'update_card',
      {
        description: 'Update a Rocketboard card by UUID, cardRef, or unique project-scoped title match.',
        inputSchema: {
          assignee: z.string().nullable().optional(),
          bodyJson: z.unknown().nullable().optional(),
          bodyText: z.string().optional(),
          card: z.string(),
          customFields: z.record(z.string(), z.unknown()).nullable().optional(),
          dueAt: z.string().nullable().optional(),
          effort: z.number().nullable().optional(),
          group: z.string().nullable().optional(),
          priority: z.string().nullable().optional(),
          project: z.string().nullable().optional(),
          sprint: z.string().nullable().optional(),
          startAt: z.string().nullable().optional(),
          status: z.string().nullable().optional(),
          tags: z.array(z.string()).optional(),
          title: z.string().optional(),
          workspace: z.string().nullable().optional(),
        },
        outputSchema: {
          card: cardDetailSchema,
        },
      },
      async input => {
        const normalizedCard = normalizeCardScope({
          card: input.card,
          project: input.project ?? undefined,
          workspace: input.workspace ?? undefined,
        })
        const normalizedProject = input.project
          ? normalizeProjectScope({
              project: input.project,
              workspace: input.workspace ?? undefined,
            })
          : null

        return jsonToolResult(
          await service.updateCard({
            ...input,
            card: normalizedCard.card,
            project: normalizedProject?.project,
            workspace: normalizedCard.workspace ?? normalizedProject?.workspace ?? input.workspace,
          }),
        )
      },
    )

    server.registerTool(
      'add_card_comment',
      {
        description: 'Add a comment to a Rocketboard card.',
        inputSchema: {
          bodyText: z.string(),
          card: z.string(),
          project: z.string().nullable().optional(),
          workspace: z.string().nullable().optional(),
        },
        outputSchema: {
          cardId: z.string(),
          cardRef: z.string(),
          comment: z.object({
            authorName: z.string(),
            bodyText: z.string(),
            createdAt: z.string(),
            id: z.string(),
          }),
        },
      },
      async input => {
        const normalized = normalizeCardScope({
          card: input.card,
          project: input.project ?? undefined,
          workspace: input.workspace ?? undefined,
        })

        return jsonToolResult(
          await service.addCardComment({
            ...input,
            card: normalized.card,
            project: normalized.project,
            workspace: normalized.workspace,
          }),
        )
      },
    )

    if (distribution === 'local') {
      server.registerTool(
        'trash_card',
        {
          description: 'Move a Rocketboard card to trash.',
          inputSchema: {
            card: z.string(),
            project: z.string().nullable().optional(),
            workspace: z.string().nullable().optional(),
          },
          outputSchema: {
            trashedCard: z.object({
              cardId: z.string(),
              cardRef: z.string(),
              projectId: z.string(),
              title: z.string(),
            }),
          },
        },
        async input => {
          const normalized = normalizeCardScope({
            card: input.card,
            project: input.project ?? undefined,
            workspace: input.workspace ?? undefined,
          })

          return jsonToolResult(
            await service.trashCard({
              ...input,
              card: normalized.card,
              project: normalized.project,
              workspace: normalized.workspace,
            }),
          )
        },
      )
    }
  }

  return server
}

export async function serveRocketboardMcp(service: RocketboardService) {
  const server = createRocketboardMcpServer(service, {distribution: 'local'})
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
