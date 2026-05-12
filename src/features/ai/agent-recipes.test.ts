import {describe, expect, it} from 'vitest'

import {AGENT_JOBS, findJobBySlug, SOURCE_JOB_SLUG_KEY} from './agent-recipes'

describe('AGENT_JOBS', () => {
  it('uses unique slugs', () => {
    const slugs = AGENT_JOBS.map((j) => j.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('Triage New Bugs ships as a manual one-off pre-fill', () => {
    const triage = findJobBySlug('triage-new-bugs')
    expect(triage).toBeDefined()
    expect(triage?.recurringDisabled).toBe(true)
    expect(triage?.defaultRepeat.kind).toBe('one_off')
    expect(triage?.requiresUserInput).toEqual([])
  })

  it('Daily Crash Log Triage runs weekdays at 10am UTC and requires URL + top N', () => {
    const crash = findJobBySlug('daily-crash-log-triage')
    expect(crash).toBeDefined()
    expect(crash?.defaultRepeat).toEqual({
      cron: '0 10 * * 1-5',
      kind: 'cron',
      timezone: 'UTC',
    })
    expect(crash?.requiresUserInput).toHaveLength(2)
    expect(crash?.requiresUserInput[0]?.key).toBe('crash_log_source_url')
    expect(crash?.requiresUserInput[0]?.kind).toBe('url')
    expect(crash?.requiresUserInput[1]?.key).toBe('top_n')
    expect(crash?.requiresUserInput[1]?.kind).toBe('positive_integer')
  })

  it('Customer Feedback runs Friday at 4pm UTC and requires feedback URL', () => {
    const feedback = findJobBySlug('customer-feedback-to-cards')
    expect(feedback).toBeDefined()
    expect(feedback?.defaultRepeat).toEqual({
      cron: '0 16 * * 5',
      kind: 'cron',
      timezone: 'UTC',
    })
    expect(feedback?.requiresUserInput).toHaveLength(1)
    expect(feedback?.requiresUserInput[0]?.key).toBe('feedback_source_url')
  })
})

describe('findJobBySlug', () => {
  it('returns the job for a known slug', () => {
    const job = findJobBySlug('daily-crash-log-triage')
    expect(job?.name).toBe('Daily Crash Log Triage')
  })

  it('returns null for an unknown slug', () => {
    expect(findJobBySlug('nope')).toBeNull()
  })

  it('returns null for nullish input', () => {
    expect(findJobBySlug(null)).toBeNull()
    expect(findJobBySlug(undefined)).toBeNull()
    expect(findJobBySlug('')).toBeNull()
  })
})

describe('SOURCE_JOB_SLUG_KEY', () => {
  it('keeps the legacy "__source_template_slug" JSONB key for back-compat with already-persisted schedule rows', () => {
    expect(SOURCE_JOB_SLUG_KEY).toBe('__source_template_slug')
  })
})
