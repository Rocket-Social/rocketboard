import type {ProjectMember} from '../access/access.types'
import type {AssignablePersona} from '../ai/agent.types'
import type {CardRecord} from '../cards/card.types'

export function collectAssignedPersonFilterUserIds(cards: CardRecord[]) {
  const assignedUserIds = new Set<string>()

  for (const card of cards) {
    if (card.assigneeUserId) {
      assignedUserIds.add(card.assigneeUserId)
    }
  }

  return assignedUserIds
}

export function getPersonFilterMembers(
  projectMembers: ProjectMember[],
  eligibleUserIds: ReadonlySet<string>,
  currentUserId: string,
  selectedUserId: string | null,
) {
  return projectMembers
    .filter((member) => eligibleUserIds.has(member.id) || member.id === selectedUserId)
    .sort((left, right) => {
      if (left.id === currentUserId) return -1
      if (right.id === currentUserId) return 1
      return left.name.localeCompare(right.name)
    })
}

// Phase 4 PR 4-B-2 (D10): personas eligible for the person filter.
// Returns agents whose `agent_user_id` matches an assigned card OR is
// the currently-selected filter (so a stale URL ?person=<agent> still
// renders the chip). Agents are sorted by display name independent of
// humans — the picker renders them in a separate "AI agents" section.
export type AssignablePersonFilterEntry = {
  agentUserId: string
  accentColor: string | null
  name: string
}

export function getAssignablePersonFilterEntries(
  assignablePersonas: AssignablePersona[],
  eligibleUserIds: ReadonlySet<string>,
  selectedUserId: string | null,
): AssignablePersonFilterEntry[] {
  return assignablePersonas
    .filter((persona) =>
      eligibleUserIds.has(persona.agentUserId) || persona.agentUserId === selectedUserId,
    )
    .map((persona) => ({
      accentColor: persona.accentColor,
      agentUserId: persona.agentUserId,
      name: persona.name,
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
}
