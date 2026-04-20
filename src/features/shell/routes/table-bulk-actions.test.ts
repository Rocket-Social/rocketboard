import {describe, expect, it, vi} from 'vitest'

import {moveCardsToGroupSequentially} from './table-bulk-actions'

function createDeferred() {
  let resolve!: () => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return {promise, reject, resolve}
}

describe('moveCardsToGroupSequentially', () => {
  it('waits for each move before starting the next one', async () => {
    const firstMove = createDeferred()
    const secondMove = createDeferred()
    const moveCardToGroup = vi.fn((cardId: string) => {
      if (cardId === 'card-1') return firstMove.promise
      return secondMove.promise
    })

    const movePromise = moveCardsToGroupSequentially({
      cardIds: ['card-1', 'card-2'],
      moveCardToGroup,
      targetGroupId: 'group-1',
    })

    expect(moveCardToGroup).toHaveBeenCalledTimes(1)
    expect(moveCardToGroup).toHaveBeenNthCalledWith(1, 'card-1', 'group-1')

    firstMove.resolve()

    await vi.waitFor(() => {
      expect(moveCardToGroup).toHaveBeenCalledTimes(2)
    })
    expect(moveCardToGroup).toHaveBeenNthCalledWith(2, 'card-2', 'group-1')

    secondMove.resolve()
    await expect(movePromise).resolves.toBeUndefined()
  })

  it('stops when a move fails', async () => {
    const moveCardToGroup = vi.fn()
      .mockRejectedValueOnce(new Error('move failed'))
      .mockResolvedValue(undefined)

    await expect(moveCardsToGroupSequentially({
      cardIds: ['card-1', 'card-2'],
      moveCardToGroup,
      targetGroupId: 'group-1',
    })).rejects.toThrow('move failed')

    expect(moveCardToGroup).toHaveBeenCalledTimes(1)
    expect(moveCardToGroup).toHaveBeenCalledWith('card-1', 'group-1')
  })
})
