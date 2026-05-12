import {describe, expect, it} from 'vitest'

import type {ProjectMember} from '../access/access.types'
import type {CardRecord} from '../cards/card.types'
import {
  collectAssignedPersonFilterUserIds,
  getPersonFilterMembers,
} from './person-filter-options'

function createMember(overrides: Partial<ProjectMember>): ProjectMember {
  return {
    email: 'person@example.com',
    githubLogin: null,
    id: 'user-1',
    name: 'Ada Lovelace',
    ...overrides,
  }
}

function createCard(overrides: Partial<CardRecord>): CardRecord {
  return {
    assigneeName: 'Ada Lovelace',
    assigneeUserId: 'user-1',
    completedAt: null,
    createdAt: '2026-04-20T00:00:00.000Z',
    customFieldValues: {},
    dueAt: null,
    effort: null,
    groupId: null,
    groupPosition: 0,
    id: 'card-1',
    initiativeId: null,
    priorityOptionId: null,
    projectId: 'project-1',
    sprintId: null,
    startAt: null,
    statusOptionId: null,
    statusPosition: 0,
    tags: [],
    title: 'Task',
    ...overrides,
  }
}

describe('person filter options', () => {
  it('collects only assigned user ids from board cards', () => {
    const userIds = collectAssignedPersonFilterUserIds([
      createCard({assigneeUserId: 'user-1'}),
      createCard({assigneeUserId: 'user-2', id: 'card-2'}),
      createCard({assigneeUserId: null, id: 'card-3'}),
      createCard({assigneeUserId: 'user-1', id: 'card-4'}),
    ])

    expect([...userIds]).toEqual(['user-1', 'user-2'])
  })

  it('returns only eligible members and keeps the current user first', () => {
    const members = [
      createMember({id: 'user-3', name: 'Tarun R'}),
      createMember({id: 'user-1', name: 'A Carter'}),
      createMember({id: 'user-2', name: 'Anishka Gupta'}),
    ]

    const filteredMembers = getPersonFilterMembers(members, new Set(['user-2', 'user-1']), 'user-1', null)

    expect(filteredMembers.map((member) => member.id)).toEqual(['user-1', 'user-2'])
  })

  it('keeps the selected member available so an active filter does not disappear', () => {
    const members = [
      createMember({id: 'user-1', name: 'A Carter'}),
      createMember({id: 'user-2', name: 'Anishka Gupta'}),
      createMember({id: 'user-3', name: 'Sristy Sharma'}),
    ]

    const filteredMembers = getPersonFilterMembers(members, new Set(['user-2']), 'user-1', 'user-3')

    expect(filteredMembers.map((member) => member.id)).toEqual(['user-2', 'user-3'])
  })
})
