import {afterEach, describe, expect, it, vi} from 'vitest'

const {
  rpcCallMock,
  supabaseDeleteMock,
  supabaseEqAfterDeleteMock,
  supabaseSelectMock,
  supabaseEqAfterSelectMock,
  supabaseOrderFirstMock,
  supabaseOrderSecondMock,
} = vi.hoisted(() => ({
  rpcCallMock: vi.fn(),
  supabaseDeleteMock: vi.fn(),
  supabaseEqAfterDeleteMock: vi.fn(),
  supabaseSelectMock: vi.fn(),
  supabaseEqAfterSelectMock: vi.fn(),
  supabaseOrderFirstMock: vi.fn(),
  supabaseOrderSecondMock: vi.fn(),
}))

vi.mock('../../platform/data/rpc-adapter', () => ({
  rpcAdapter: {
    call: rpcCallMock,
  },
  snakeToCamel: <T,>(value: T) => value,
}))

vi.mock('../../platform/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from: () => ({
      delete: () => {
        supabaseDeleteMock()
        return {
          eq: (...args: unknown[]) => {
            supabaseEqAfterDeleteMock(...args)
            return Promise.resolve({error: null})
          },
        }
      },
      select: (...args: unknown[]) => {
        supabaseSelectMock(...args)
        return {
          eq: (...eqArgs: unknown[]) => {
            supabaseEqAfterSelectMock(...eqArgs)
            return {
              order: (...orderArgs: unknown[]) => {
                supabaseOrderFirstMock(...orderArgs)
                return {
                  order: (...orderArgs2: unknown[]) => {
                    supabaseOrderSecondMock(...orderArgs2)
                    return Promise.resolve({data: [{id: 'schedule-1'}], error: null})
                  },
                }
              },
            }
          },
        }
      },
    }),
  }),
}))

import {agentScheduleRepository} from './agent-schedule.repository'

afterEach(() => {
  rpcCallMock.mockReset()
  supabaseDeleteMock.mockReset()
  supabaseEqAfterDeleteMock.mockReset()
  supabaseSelectMock.mockReset()
  supabaseEqAfterSelectMock.mockReset()
  supabaseOrderFirstMock.mockReset()
  supabaseOrderSecondMock.mockReset()
})

describe('agentScheduleRepository.listForUser', () => {
  it('selects all columns scoped by created_by_user_id with paused-last + next_run_at ordering', async () => {
    await agentScheduleRepository.listForUser('user-1')

    expect(supabaseSelectMock).toHaveBeenCalledWith('*')
    expect(supabaseEqAfterSelectMock).toHaveBeenCalledWith('created_by_user_id', 'user-1')
    expect(supabaseOrderFirstMock).toHaveBeenCalledWith('is_paused', {ascending: true})
    expect(supabaseOrderSecondMock).toHaveBeenCalledWith('next_run_at', {ascending: true})
  })
})

describe('agentScheduleRepository.update', () => {
  it('forwards a full payload + nulls undefined fields', async () => {
    await agentScheduleRepository.update({
      cardTemplate: {title: 'Updated'},
      newCronExpression: '0 12 * * *',
      newPersonaId: 'persona-andy',
      newTimezone: 'America/Los_Angeles',
      scheduleId: 'schedule-1',
    })

    expect(rpcCallMock).toHaveBeenCalledWith('update_agent_schedule', {
      new_cron_expression: '0 12 * * *',
      new_persona_id: 'persona-andy',
      new_target_project_id: null,
      new_template: {title: 'Updated'},
      new_timezone: 'America/Los_Angeles',
      schedule_id: 'schedule-1',
    })
  })

  it('treats undefined fields as null (server leaves unchanged)', async () => {
    await agentScheduleRepository.update({scheduleId: 'schedule-1'})

    expect(rpcCallMock).toHaveBeenCalledWith('update_agent_schedule', {
      new_cron_expression: null,
      new_persona_id: null,
      new_target_project_id: null,
      new_template: null,
      new_timezone: null,
      schedule_id: 'schedule-1',
    })
  })
})

describe('agentScheduleRepository.pause / resume', () => {
  it('pause forwards the schedule id to pause_agent_schedule', async () => {
    await agentScheduleRepository.pause('schedule-1')
    expect(rpcCallMock).toHaveBeenCalledWith('pause_agent_schedule', {
      target_schedule_id: 'schedule-1',
    })
  })

  it('resume forwards the schedule id to resume_agent_schedule', async () => {
    await agentScheduleRepository.resume('schedule-2')
    expect(rpcCallMock).toHaveBeenCalledWith('resume_agent_schedule', {
      target_schedule_id: 'schedule-2',
    })
  })
})

describe('agentScheduleRepository.delete', () => {
  it('issues a direct DELETE under RLS', async () => {
    await agentScheduleRepository.delete('schedule-3')
    expect(supabaseDeleteMock).toHaveBeenCalledTimes(1)
    expect(supabaseEqAfterDeleteMock).toHaveBeenCalledWith('id', 'schedule-3')
  })
})
