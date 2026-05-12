import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const {
  rpcCallMock,
  supabaseInsertMock,
  supabaseSelectAfterInsertMock,
  supabaseSingleMock,
} = vi.hoisted(() => ({
  rpcCallMock: vi.fn(),
  supabaseInsertMock: vi.fn(),
  supabaseSelectAfterInsertMock: vi.fn(),
  supabaseSingleMock: vi.fn(),
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
      insert: (...args: unknown[]) => {
        supabaseInsertMock(...args)
        return {
          select: (...selectArgs: unknown[]) => {
            supabaseSelectAfterInsertMock(...selectArgs)
            return {
              single: () => supabaseSingleMock(),
            }
          },
        }
      },
    }),
  }),
}))

import {agentRepository, AGENT_RUN_WITH_CONTEXT_COLUMNS} from './agent.repository'

afterEach(() => {
  rpcCallMock.mockReset()
  supabaseInsertMock.mockReset()
  supabaseSelectAfterInsertMock.mockReset()
  supabaseSingleMock.mockReset()
})

describe('agentRepository.provisionAgentUser', () => {
  beforeEach(() => {
    rpcCallMock.mockReset()
  })

  it('forwards the persona id to the canonical RPC and returns the bot user uuid', async () => {
    rpcCallMock.mockResolvedValueOnce('11111111-1111-4111-8111-111111111111')

    await expect(
      agentRepository.provisionAgentUser('persona-1'),
    ).resolves.toBe('11111111-1111-4111-8111-111111111111')

    expect(rpcCallMock).toHaveBeenCalledWith('provision_agent_user', {
      target_persona_id: 'persona-1',
    })
  })

  it('throws when the RPC returns null (missing persona / unexpected shape)', async () => {
    rpcCallMock.mockResolvedValueOnce(null)

    await expect(
      agentRepository.provisionAgentUser('persona-missing'),
    ).rejects.toThrow('provision_agent_user returned no value')
  })

  it('rethrows postgrest errors verbatim', async () => {
    const error = {
      code: 'PGRST301',
      message: 'permission denied for function provision_agent_user',
    }
    rpcCallMock.mockRejectedValueOnce(error)

    await expect(
      agentRepository.provisionAgentUser('persona-1'),
    ).rejects.toEqual(error)
  })
})

describe('agentRepository.provisionPersonalAiWorkspace', () => {
  beforeEach(() => {
    rpcCallMock.mockReset()
  })

  it('forwards both ids to the canonical RPC and returns the project uuid', async () => {
    rpcCallMock.mockResolvedValueOnce('22222222-2222-4222-8222-222222222222')

    await expect(
      agentRepository.provisionPersonalAiWorkspace({
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    ).resolves.toBe('22222222-2222-4222-8222-222222222222')

    expect(rpcCallMock).toHaveBeenCalledWith('provision_personal_ai_workspace', {
      target_org_id: 'org-1',
      target_user_id: 'user-1',
    })
  })

  it('throws when the RPC returns null', async () => {
    rpcCallMock.mockResolvedValueOnce(null)

    await expect(
      agentRepository.provisionPersonalAiWorkspace({
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow('provision_personal_ai_workspace returned no value')
  })
})

describe('agentRepository.createOneOffPersonalTask', () => {
  it('clones the title + body via the SECURITY DEFINER RPC and returns the new card id', async () => {
    rpcCallMock.mockResolvedValueOnce('card-new')

    await expect(
      agentRepository.createOneOffPersonalTask({
        agentUserId: 'bot-sara',
        bodyMd: 'Look at the inbox',
        title: 'Triage inbox',
        workspaceProjectId: 'project-personal-1',
      }),
    ).resolves.toBe('card-new')

    expect(rpcCallMock).toHaveBeenCalledWith('clone_template_to_card', {
      target_assignee_user_id: 'bot-sara',
      target_project_id: 'project-personal-1',
      template: {
        body_md: 'Look at the inbox',
        title: 'Triage inbox',
      },
    })
  })

  it('throws when clone_template_to_card returns null', async () => {
    rpcCallMock.mockResolvedValueOnce(null)

    await expect(
      agentRepository.createOneOffPersonalTask({
        agentUserId: 'bot-sara',
        bodyMd: '',
        title: 'task',
        workspaceProjectId: 'project-1',
      }),
    ).rejects.toThrow('clone_template_to_card returned no value')
  })

  it('Phase 5: merges cardTemplateExtras into the card_template JSONB', async () => {
    rpcCallMock.mockResolvedValueOnce('card-new')

    await agentRepository.createOneOffPersonalTask({
      agentUserId: 'bot-sara',
      bodyMd: 'Read the crash log',
      cardTemplateExtras: {
        __source_template_slug: 'daily-crash-log-triage',
        crash_log_source_url: 'https://example.com/log.json',
        tags: ['crash-triage', 'automated'],
        top_n: 3,
      },
      title: 'Daily Crash Log Triage',
      workspaceProjectId: 'project-personal-1',
    })

    expect(rpcCallMock).toHaveBeenCalledWith('clone_template_to_card', {
      target_assignee_user_id: 'bot-sara',
      target_project_id: 'project-personal-1',
      template: {
        __source_template_slug: 'daily-crash-log-triage',
        body_md: 'Read the crash log',
        crash_log_source_url: 'https://example.com/log.json',
        tags: ['crash-triage', 'automated'],
        title: 'Daily Crash Log Triage',
        top_n: 3,
      },
    })
  })
})

describe('agentRepository.createRecurringPersonalTask', () => {
  it('computes next_run_at, inserts the schedule, and fires once when fireOnce=true', async () => {
    rpcCallMock
      .mockResolvedValueOnce('2026-05-06T09:00:00.000Z') // next_cron_fire
      .mockResolvedValueOnce('card-clone-1') // clone_template_to_card
    supabaseSingleMock.mockResolvedValueOnce({
      data: {id: 'schedule-1'},
      error: null,
    })

    const result = await agentRepository.createRecurringPersonalTask({
      agentUserId: 'bot-andy',
      bodyMd: 'Daily run',
      cronExpression: '0 9 * * *',
      fireOnce: true,
      organizationId: 'org-1',
      personaId: 'persona-andy',
      timezone: 'UTC',
      title: 'Daily summary',
      userId: 'user-1',
      workspaceProjectId: 'project-personal-1',
    })

    expect(result).toBe('schedule-1')

    expect(rpcCallMock).toHaveBeenNthCalledWith(1, 'next_cron_fire', {
      cron_expr: '0 9 * * *',
      from_ts: expect.any(String),
      tz: 'UTC',
    })

    expect(supabaseInsertMock).toHaveBeenCalledWith({
      card_template: {body_md: 'Daily run', title: 'Daily summary'},
      created_by_user_id: 'user-1',
      cron_expression: '0 9 * * *',
      is_paused: false,
      next_run_at: '2026-05-06T09:00:00.000Z',
      organization_id: 'org-1',
      persona_id: 'persona-andy',
      target_project_id: 'project-personal-1',
      timezone: 'UTC',
    })

    expect(rpcCallMock).toHaveBeenNthCalledWith(2, 'clone_template_to_card', {
      target_assignee_user_id: 'bot-andy',
      target_project_id: 'project-personal-1',
      template: {body_md: 'Daily run', title: 'Daily summary'},
    })
  })

  it('does not fire once when fireOnce=false', async () => {
    rpcCallMock.mockResolvedValueOnce('2026-05-06T09:00:00.000Z')
    supabaseSingleMock.mockResolvedValueOnce({
      data: {id: 'schedule-2'},
      error: null,
    })

    await agentRepository.createRecurringPersonalTask({
      agentUserId: 'bot-andy',
      bodyMd: 'Daily run',
      cronExpression: '0 9 * * *',
      fireOnce: false,
      organizationId: 'org-1',
      personaId: 'persona-andy',
      timezone: 'UTC',
      title: 'Daily summary',
      userId: 'user-1',
      workspaceProjectId: 'project-personal-1',
    })

    // Only next_cron_fire was called via rpcCallSingle, not clone_template_to_card.
    expect(rpcCallMock).toHaveBeenCalledTimes(1)
  })

  it('Phase 5: persists cardTemplateExtras on the schedule and the optional fire-once card', async () => {
    rpcCallMock
      .mockResolvedValueOnce('2026-05-06T10:00:00.000Z')
      .mockResolvedValueOnce('card-clone-extras')
    supabaseSingleMock.mockResolvedValueOnce({
      data: {id: 'schedule-extras'},
      error: null,
    })

    await agentRepository.createRecurringPersonalTask({
      agentUserId: 'bot-sara',
      bodyMd: 'Read the crash log at https://x',
      cardTemplateExtras: {
        __source_template_slug: 'daily-crash-log-triage',
        crash_log_source_url: 'https://x',
        tags: ['crash-triage', 'automated'],
        top_n: 5,
      },
      cronExpression: '0 10 * * 1-5',
      fireOnce: true,
      organizationId: 'org-1',
      personaId: 'persona-sara',
      timezone: 'UTC',
      title: 'Daily Crash Log Triage',
      userId: 'user-1',
      workspaceProjectId: 'project-personal-1',
    })

    const insertCall = supabaseInsertMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(insertCall.card_template).toEqual({
      __source_template_slug: 'daily-crash-log-triage',
      body_md: 'Read the crash log at https://x',
      crash_log_source_url: 'https://x',
      tags: ['crash-triage', 'automated'],
      title: 'Daily Crash Log Triage',
      top_n: 5,
    })

    expect(rpcCallMock).toHaveBeenNthCalledWith(2, 'clone_template_to_card', {
      target_assignee_user_id: 'bot-sara',
      target_project_id: 'project-personal-1',
      template: {
        __source_template_slug: 'daily-crash-log-triage',
        body_md: 'Read the crash log at https://x',
        crash_log_source_url: 'https://x',
        tags: ['crash-triage', 'automated'],
        title: 'Daily Crash Log Triage',
        top_n: 5,
      },
    })
  })

  it('throws when next_cron_fire returns null', async () => {
    rpcCallMock.mockResolvedValueOnce(null)

    await expect(
      agentRepository.createRecurringPersonalTask({
        agentUserId: 'bot-andy',
        bodyMd: '',
        cronExpression: 'invalid',
        fireOnce: false,
        organizationId: 'org-1',
        personaId: 'persona-andy',
        timezone: 'UTC',
        title: 'task',
        userId: 'user-1',
        workspaceProjectId: 'project-personal-1',
      }),
    ).rejects.toThrow('next_cron_fire returned no value')
  })

  it('rethrows the schedule INSERT error verbatim', async () => {
    rpcCallMock.mockResolvedValueOnce('2026-05-06T09:00:00.000Z')
    supabaseSingleMock.mockResolvedValueOnce({
      data: null,
      error: {code: 'PGRST106', message: 'rls denied'},
    })

    await expect(
      agentRepository.createRecurringPersonalTask({
        agentUserId: 'bot-andy',
        bodyMd: '',
        cronExpression: '0 9 * * *',
        fireOnce: false,
        organizationId: 'org-1',
        personaId: 'persona-andy',
        timezone: 'UTC',
        title: 'task',
        userId: 'user-1',
        workspaceProjectId: 'project-personal-1',
      }),
    ).rejects.toEqual({code: 'PGRST106', message: 'rls denied'})
  })
})

describe('AGENT_RUN_WITH_CONTEXT_COLUMNS', () => {
  // The single JOIN string is exported (Phase 3c) so this test can
  // substring-assert that the My AI Kanban grid will load card-side title,
  // persona, and project context in one round trip — without having to
  // mock the supabase chain.
  it('joins card, persona, and project context in a single nested select', () => {
    expect(AGENT_RUN_WITH_CONTEXT_COLUMNS).toContain('card:cards!card_id (id, title)')
    expect(AGENT_RUN_WITH_CONTEXT_COLUMNS).toContain(
      'persona:ai_personas!persona_id',
    )
    expect(AGENT_RUN_WITH_CONTEXT_COLUMNS).toContain(
      'project:projects!project_id',
    )
  })
})
