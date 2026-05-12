import {
  buildWikiSurfaceResourceId,
  parseWikiSurfaceResourceId,
  type WikiSurfaceResource,
} from '../../../src/features/ai/ai-surface-resource.shared.ts'

export {
  buildWikiSurfaceResourceId,
  parseWikiSurfaceResourceId,
}

export type ExistingConversationScope = {
  persona_id: string | null
  surface: string | null
  surface_resource_id: string | null
  user_id: string | null
}

export type RequestedConversationScope = {
  personaId: string
  surface: string
  surfaceResourceId: string | null
  userId: string
}

export type WikiPageResourceScope = {
  organization_id: string | null
  project_id: string | null
}

type ScopeResult =
  | { ok: true }
  | { error: string; ok: false; status: 400 | 403 | 409 }

type ResourceIdResult =
  | { ok: true; resourceId: string | null }
  | { error: string; ok: false; status: 400 }

const MAX_RESOURCE_ID_LENGTH = 200
const GENERIC_RESOURCE_PATTERN = /^[a-z][a-z0-9-]*:[A-Za-z0-9:_-]+$/
const ORG_WIKI_ROLES = new Set(['admin', 'member'])

function sameUuid(left: string | null | undefined, right: string | null | undefined) {
  return typeof left === 'string'
    && typeof right === 'string'
    && left.toLowerCase() === right.toLowerCase()
}

export function deriveRequestedSurfaceResourceId(
  surface: string,
  surfaceContext?: Record<string, unknown>,
): ResourceIdResult {
  const rawResourceId = surfaceContext?.resourceId

  if (rawResourceId === undefined || rawResourceId === null) {
    if (surface === 'wiki') {
      return { error: 'Invalid wiki AI resource id', ok: false, status: 400 }
    }
    return { ok: true, resourceId: null }
  }

  if (typeof rawResourceId !== 'string') {
    return { error: 'Invalid AI surface resource id', ok: false, status: 400 }
  }

  const resourceId = rawResourceId.trim()
  if (resourceId.length === 0 || resourceId.length > MAX_RESOURCE_ID_LENGTH) {
    return { error: 'Invalid AI surface resource id', ok: false, status: 400 }
  }

  if (surface === 'wiki') {
    const wikiResource = parseWikiSurfaceResourceId(resourceId)
    return wikiResource
      ? { ok: true, resourceId: buildWikiSurfaceResourceId(wikiResource.kind, wikiResource.id) }
      : { error: 'Invalid wiki AI resource id', ok: false, status: 400 }
  }

  if (!GENERIC_RESOURCE_PATTERN.test(resourceId)) {
    return { error: 'Invalid AI surface resource id', ok: false, status: 400 }
  }

  return { ok: true, resourceId }
}

export function validateConversationResumeScope(
  existingConversation: ExistingConversationScope | null | undefined,
  requestedScope: RequestedConversationScope,
): ScopeResult {
  if (!existingConversation || existingConversation.user_id !== requestedScope.userId) {
    return { error: 'Conversation not found or not authorized', ok: false, status: 403 }
  }

  if (
    existingConversation.persona_id !== requestedScope.personaId
    || existingConversation.surface !== requestedScope.surface
    || (existingConversation.surface_resource_id ?? null) !== requestedScope.surfaceResourceId
  ) {
    return { error: 'Conversation does not match the current AI context', ok: false, status: 409 }
  }

  return { ok: true }
}

export function validateWikiSurfaceResourceScope(args: {
  membershipRole: string | null | undefined
  personaOrganizationId: string
  projectCanAccess?: boolean
  resourceId: string | null
  wikiPage?: WikiPageResourceScope | null
}): ScopeResult {
  const resource = parseWikiSurfaceResourceId(args.resourceId)
  if (!resource) {
    return { error: 'Invalid wiki AI resource id', ok: false, status: 400 }
  }

  if (resource.kind === 'index') {
    return sameUuid(resource.id, args.personaOrganizationId)
      && ORG_WIKI_ROLES.has(args.membershipRole ?? '')
      ? { ok: true }
      : { error: 'Wiki resource is not available to this AI agent', ok: false, status: 403 }
  }

  if (!args.wikiPage || !sameUuid(args.wikiPage.organization_id, args.personaOrganizationId)) {
    return { error: 'Wiki resource is not available to this AI agent', ok: false, status: 403 }
  }

  if (!args.wikiPage.project_id) {
    return ORG_WIKI_ROLES.has(args.membershipRole ?? '')
      ? { ok: true }
      : { error: 'Wiki resource is not available to this AI agent', ok: false, status: 403 }
  }

  return args.projectCanAccess === true
    ? { ok: true }
    : { error: 'Wiki resource is not available to this AI agent', ok: false, status: 403 }
}
