import {describe, expect, it} from 'vitest'

import {getOrgAccessMetrics, isAgentOrgMember, isGuestOrgMember} from './org-members.metrics'

describe('org access metrics', () => {
  it('treats guests as people with access but not member seats', () => {
    const metrics = getOrgAccessMetrics([
      {role: 'admin'},
      {role: 'member'},
      {role: 'guest'},
      {role: 'guest'},
    ])

    expect(metrics).toEqual({
      adminCount: 1,
      guestCount: 2,
      memberSeatCount: 2,
      peopleCount: 4,
    })
  })

  it('only classifies explicit guest roles as guests', () => {
    expect(isGuestOrgMember({role: 'guest'})).toBe(true)
    expect(isGuestOrgMember({role: 'member'})).toBe(false)
    expect(isGuestOrgMember({role: 'admin'})).toBe(false)
  })

  it('excludes AI agents from people count and seat count (HOTFIX 2026-05-07)', () => {
    // Defense in depth alongside `get_organization_members` filtering
    // role='agent' rows out at the SQL layer. If a stale snapshot somehow
    // includes an agent, the metrics still report the correct human count.
    const metrics = getOrgAccessMetrics([
      {role: 'admin'},
      {role: 'agent'},
      {role: 'agent'},
      {role: 'agent'},
    ])

    expect(metrics).toEqual({
      adminCount: 1,
      guestCount: 0,
      memberSeatCount: 1,
      peopleCount: 1,
    })
  })

  it('isAgentOrgMember matches only the agent role', () => {
    expect(isAgentOrgMember({role: 'agent'})).toBe(true)
    expect(isAgentOrgMember({role: 'admin'})).toBe(false)
    expect(isAgentOrgMember({role: 'member'})).toBe(false)
    expect(isAgentOrgMember({role: 'guest'})).toBe(false)
  })
})
