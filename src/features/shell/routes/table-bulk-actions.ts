export async function moveCardsToGroupSequentially({
  cardIds,
  moveCardToGroup,
  targetGroupId,
}: {
  cardIds: string[]
  moveCardToGroup: (cardId: string, targetGroupId: string | null) => Promise<void>
  targetGroupId: string | null
}) {
  for (const cardId of cardIds) {
    await moveCardToGroup(cardId, targetGroupId)
  }
}
