// Wave 2 AI Kanban Phase 4 (PR 4-B) — D10 cross-surface assignee resolver.
//
// `cards.assignee_user_id` can point at either a human's auth.users
// row OR a persona's synthetic agent_user_id. Surfaces that render
// the assignee (BoardView card avatars, CardSheet summary line, the
// activity log, search filters) need to disambiguate so:
//   - the right kind of avatar renders (UserAvatar with photo for
//     humans; PersonaAvatar with accent color for agents)
//   - the right name displays ("Sara" not "agent-sara")
//   - the optional sparkle indicator surfaces only on agents
//
// Note on data sources: `provision_agent_user` (Phase 1) writes a
// `profiles` row with `full_name = persona.name` for the synthetic
// user, so server-side JOINs already resolve "Sara" correctly. The
// resolver's main job is the avatar dispatch + sparkle gating.

import type {AssignablePersona} from '../ai/agent.types'

import type {ProjectMember} from './access.types'

export type {AssignablePersona}

export type AssigneeIdentityResolved = {
  accentColor: string | null
  avatarUrl: string | null
  isAgent: boolean
  name: string
}

export type ResolveAssigneeIdentityContext = {
  assignablePersonas?: AssignablePersona[]
  projectMembers?: ProjectMember[]
}

export function resolveAssigneeIdentity(
  userId: string | null | undefined,
  context: ResolveAssigneeIdentityContext,
): AssigneeIdentityResolved {
  if (!userId) {
    return {accentColor: null, avatarUrl: null, isAgent: false, name: 'Unassigned'}
  }

  const persona = (context.assignablePersonas ?? []).find(
    (entry) => entry.agentUserId === userId,
  )
  if (persona) {
    return {
      accentColor: persona.accentColor,
      avatarUrl: persona.avatarUrl,
      isAgent: true,
      name: persona.name,
    }
  }

  const member = (context.projectMembers ?? []).find((entry) => entry.id === userId)
  if (member) {
    return {
      accentColor: null,
      avatarUrl: member.avatarUrl ?? null,
      isAgent: false,
      name: member.name,
    }
  }

  return {accentColor: null, avatarUrl: null, isAgent: false, name: 'Unknown'}
}
