import {describe, expect, it} from 'vitest'

import {
  compareProjectViewTypes,
  getProjectViewDefaultName,
  getProjectViewCountLabel,
  getMaxProjectViewCount,
  isProjectViewType,
  projectViewTypes,
} from './project-view.model'

describe('project view model', () => {
  it('registers canvas as a valid view type', () => {
    expect(projectViewTypes).toContain('canvas')
    expect(isProjectViewType('canvas')).toBe(true)
  })

  it('returns the Canvas default name', () => {
    expect(getProjectViewDefaultName('canvas')).toBe('Canvas')
  })

  it('uses the 10-board limit for document, GitHub, and canvas', () => {
    expect(getMaxProjectViewCount('document')).toBe(10)
    expect(getMaxProjectViewCount('github')).toBe(10)
    expect(getMaxProjectViewCount('canvas')).toBe(10)
    expect(getProjectViewCountLabel('document')).toBe('Up to 10 per project')
    expect(getProjectViewCountLabel('github')).toBe('Up to 10 per project')
    expect(getProjectViewCountLabel('canvas')).toBe('Up to 10 per project')
  })

  it('sorts canvas after gantt', () => {
    expect(compareProjectViewTypes('canvas', 'gantt')).toBeGreaterThan(0)
  })
})
