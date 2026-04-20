export const sprintReassignmentUnavailableMessage =
  'Sprint details are temporarily unavailable. Sprint changes are disabled until sprint history loads again.'

export function isSprintMembershipMutationBlocked({
  displayProjectSprintsInferred,
  previousSprintId,
  targetSprintId,
}: {
  displayProjectSprintsInferred: boolean
  previousSprintId: string | null
  targetSprintId: string | null
}) {
  return displayProjectSprintsInferred && previousSprintId !== targetSprintId
}
