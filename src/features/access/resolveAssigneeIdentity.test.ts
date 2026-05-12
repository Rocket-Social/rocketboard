import {describe, expect, it} from 'vitest'

import {resolveAssigneeIdentity} from './resolveAssigneeIdentity'
import type {AssignablePersona} from '../ai/agent.types'
import type {ProjectMember} from './access.types'

const PROJECT_MEMBERS: ProjectMember[] = [
  {
    avatarUrl: 'https://example.com/joe.png',
    email: 'joe@example.com',
    githubLogin: null,
    id: 'human-1',
    name: 'Joe',
  },
]

const PERSONAS: AssignablePersona[] = [
  {
    accentColor: 'orange',
    agentUserId: 'agent-1',
    avatarUrl: null,
    id: 'persona-1',
    name: 'Sara',
    role: 'assistant',
    slug: 'sara',
  },
]

describe('resolveAssigneeIdentity (D10)', () => {
  it('returns Unassigned for null userId', () => {
    expect(
      resolveAssigneeIdentity(null, {projectMembers: PROJECT_MEMBERS, assignablePersonas: PERSONAS}),
    ).toEqual({accentColor: null, avatarUrl: null, isAgent: false, name: 'Unassigned'})
  })

  it('resolves a human assignee to their name + avatar', () => {
    expect(
      resolveAssigneeIdentity('human-1', {projectMembers: PROJECT_MEMBERS, assignablePersonas: PERSONAS}),
    ).toEqual({
      accentColor: null,
      avatarUrl: 'https://example.com/joe.png',
      isAgent: false,
      name: 'Joe',
    })
  })

  it('resolves an agent assignee to the persona name + accent color + isAgent=true', () => {
    expect(
      resolveAssigneeIdentity('agent-1', {projectMembers: PROJECT_MEMBERS, assignablePersonas: PERSONAS}),
    ).toEqual({
      accentColor: 'orange',
      avatarUrl: null,
      isAgent: true,
      name: 'Sara',
    })
  })

  it('returns Unknown when the userId matches neither bucket', () => {
    expect(
      resolveAssigneeIdentity('does-not-exist', {projectMembers: PROJECT_MEMBERS, assignablePersonas: PERSONAS}),
    ).toEqual({
      accentColor: null,
      avatarUrl: null,
      isAgent: false,
      name: 'Unknown',
    })
  })
})
