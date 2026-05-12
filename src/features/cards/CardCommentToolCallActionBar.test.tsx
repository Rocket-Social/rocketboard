/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {act, fireEvent, render, screen} from '@testing-library/react'
import {beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'

import {ToastProvider} from '../../components/ui/toast'
import {CardCommentToolCallActionBar} from './CardCommentToolCallActionBar'
import type {AgentToolCallAuditEntry} from './card.types'

beforeAll(() => {
  // jsdom doesn't ship matchMedia; the toast component uses it for
  // prefers-reduced-motion. Stub a permissive default so it returns
  // false (i.e. animations enabled).
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  }
})

const {rpcCallMock} = vi.hoisted(() => ({
  rpcCallMock: vi.fn(),
}))

vi.mock('../../platform/data/rpc-adapter', async () => {
  const actual =
    await vi.importActual<typeof import('../../platform/data/rpc-adapter')>(
      '../../platform/data/rpc-adapter',
    )
  return {
    ...actual,
    rpcAdapter: {
      ...actual.rpcAdapter,
      call: rpcCallMock,
    },
  }
})

function makeAuditEntry(overrides: Partial<AgentToolCallAuditEntry> = {}): AgentToolCallAuditEntry {
  return {
    name: 'set_card_priority',
    args: {priority: 'p1'},
    status: 'awaiting_approval',
    queuedAt: '2026-05-05T12:00:00.000Z',
    toolUseId: 'toolu_1',
    ...overrides,
  }
}

function renderBar(props: Partial<React.ComponentProps<typeof CardCommentToolCallActionBar>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {mutations: {retry: false}, queries: {retry: false}},
  })
  return render(
    <ToastProvider>
      <QueryClientProvider client={queryClient}>
        <CardCommentToolCallActionBar
          canEdit
          cardId='card-1'
          runId='run-1'
          toolCalls={[makeAuditEntry()]}
          {...props}
        />
      </QueryClientProvider>
    </ToastProvider>,
  )
}

describe('CardCommentToolCallActionBar', () => {
  beforeEach(() => {
    rpcCallMock.mockReset()
  })

  it('renders nothing when there are no awaiting_approval entries', () => {
    renderBar({toolCalls: [makeAuditEntry({status: 'executed'})]})
    expect(screen.queryByText('Proposed actions')).toBeNull()
  })

  it('renders one row per awaiting_approval entry', () => {
    renderBar({
      toolCalls: [
        makeAuditEntry({toolUseId: 'toolu_1'}),
        makeAuditEntry({toolUseId: 'toolu_2', name: 'set_card_status', args: {status_label: 'Investigating'}}),
        makeAuditEntry({toolUseId: 'toolu_3', status: 'executed'}),
      ],
    })

    expect(screen.getByText('Proposed actions')).toBeInTheDocument()
    expect(screen.getByTestId('tool-call-row-toolu_1')).toBeInTheDocument()
    expect(screen.getByTestId('tool-call-row-toolu_2')).toBeInTheDocument()
    expect(screen.queryByTestId('tool-call-row-toolu_3')).toBeNull()
    expect(screen.getByText('Set status to Investigating')).toBeInTheDocument()
  })

  it('approve calls approve_tool_call RPC with the JSONB array index (D12 stable identity)', async () => {
    rpcCallMock.mockResolvedValue(undefined)
    renderBar({
      toolCalls: [
        makeAuditEntry({toolUseId: 'toolu_a', status: 'executed'}),
        makeAuditEntry({toolUseId: 'toolu_b'}),
      ],
    })

    fireEvent.click(screen.getByRole('button', {name: /Approve Set/i}))

    await act(async () => {
      await Promise.resolve()
    })

    expect(rpcCallMock).toHaveBeenCalledWith('approve_tool_call', {
      run_id: 'run-1',
      tool_call_index: 1,
      edited_args: null,
    })
  })

  it('reject calls reject_tool_call RPC with the JSONB array index', async () => {
    rpcCallMock.mockResolvedValue(undefined)
    renderBar()

    fireEvent.click(screen.getByRole('button', {name: /Reject Set/i}))

    await act(async () => {
      await Promise.resolve()
    })

    expect(rpcCallMock).toHaveBeenCalledWith('reject_tool_call', {
      run_id: 'run-1',
      tool_call_index: 0,
      reason: null,
    })
  })

  it('honors D11 canEdit=false (renders muted permission row, no buttons)', () => {
    renderBar({canEdit: false})
    expect(screen.getByText('Awaiting review by an editor.')).toBeInTheDocument()
    expect(screen.queryByRole('button', {name: /Approve/i})).toBeNull()
    expect(screen.queryByRole('button', {name: /Reject/i})).toBeNull()
  })

  it('expired entries do not render buttons', () => {
    renderBar({
      toolCalls: [makeAuditEntry({status: 'expired'})],
    })
    expect(screen.queryByText('Proposed actions')).toBeNull()
  })

  it('keyboard: Cmd+Enter approves, Esc rejects (D18)', async () => {
    rpcCallMock.mockResolvedValue(undefined)
    renderBar()

    const row = screen.getByTestId('tool-call-row-toolu_1')
    row.focus()
    fireEvent.keyDown(row, {key: 'Enter', metaKey: true})

    await act(async () => {
      await Promise.resolve()
    })

    expect(rpcCallMock).toHaveBeenLastCalledWith('approve_tool_call', expect.objectContaining({
      run_id: 'run-1',
      tool_call_index: 0,
    }))

    fireEvent.keyDown(row, {key: 'Escape'})
    await act(async () => {
      await Promise.resolve()
    })
    expect(rpcCallMock).toHaveBeenLastCalledWith('reject_tool_call', expect.objectContaining({
      run_id: 'run-1',
      tool_call_index: 0,
    }))
  })

  it('D9 race: tool_call_no_longer_pending error fires info toast + suppresses error toast', async () => {
    rpcCallMock.mockRejectedValue(new Error('tool_call_no_longer_pending: tool call 0 is no longer pending'))
    renderBar()

    fireEvent.click(screen.getByRole('button', {name: /Approve Set/i}))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    // The race info toast surfaces the friendly copy.
    expect(screen.getByText('This action was already resolved')).toBeInTheDocument()
    // Error variant is NOT shown.
    expect(screen.queryByText('Action failed')).toBeNull()
  })

  it('D12 transient state: button label flips to Approving... while the mutation is in flight', async () => {
    let resolveApprove: (() => void) | null = null
    rpcCallMock.mockImplementation(
      () => new Promise<undefined>((resolve) => {
        resolveApprove = () => resolve(undefined)
      }),
    )

    renderBar()
    fireEvent.click(screen.getByRole('button', {name: /Approve Set/i}))

    // While in flight, the button shows the transient label and is disabled.
    expect(await screen.findByText('Approving…')).toBeInTheDocument()
    const approveBtn = screen.getByRole('button', {name: /Approve Set/i}) as HTMLButtonElement
    expect(approveBtn).toBeDisabled()

    await act(async () => {
      resolveApprove?.()
      await Promise.resolve()
    })
  })
})
