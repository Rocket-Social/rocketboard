import {describe, expect, it} from 'vitest'

import {workspacePlansQueryOptions} from './plan.queries'

describe('workspace plan query options', () => {
  it('stay disabled until a workspace id exists', () => {
    expect(workspacePlansQueryOptions('').enabled).toBe(false)
    expect(workspacePlansQueryOptions('workspace-1').enabled).toBe(true)
  })
})
