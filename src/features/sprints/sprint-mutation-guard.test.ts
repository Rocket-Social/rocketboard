import {describe, expect, it} from 'vitest'

import {isSprintMembershipMutationBlocked} from './sprint-mutation-guard'

describe('isSprintMembershipMutationBlocked', () => {
  it('blocks sprint membership changes while sprint metadata is inferred', () => {
    expect(isSprintMembershipMutationBlocked({
      displayProjectSprintsInferred: true,
      previousSprintId: 'sprint-1',
      targetSprintId: null,
    })).toBe(true)
  })

  it('allows unchanged sprint membership while sprint metadata is inferred', () => {
    expect(isSprintMembershipMutationBlocked({
      displayProjectSprintsInferred: true,
      previousSprintId: 'sprint-1',
      targetSprintId: 'sprint-1',
    })).toBe(false)
  })

  it('allows sprint membership changes when sprint metadata is authoritative', () => {
    expect(isSprintMembershipMutationBlocked({
      displayProjectSprintsInferred: false,
      previousSprintId: null,
      targetSprintId: 'sprint-1',
    })).toBe(false)
  })
})
