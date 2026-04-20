/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {type QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {useState} from 'react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createTestQueryClient} from '../../test/queryClient'
import type {CardDetail, CardRecord} from '../cards/card.types'
import {cardDetailQueryOptions} from '../cards/card.queries'
import type {CustomFieldDefinition, SetCardCustomFieldValueResult} from './field.types'
import type {ProjectTableViewStatesResult} from '../projects/project-shell.repository'
import {
  useCreateCustomFieldMutation,
  useDeleteFieldOptionMutation,
  useRenameCustomFieldMutation,
  useSetCardCustomFieldValueMutation,
} from './field.queries'

const {
  createFieldMock,
  deleteFieldOptionMock,
  renameFieldMock,
  setCardFieldValueMock,
} = vi.hoisted(() => ({
  createFieldMock: vi.fn(),
  deleteFieldOptionMock: vi.fn(),
  renameFieldMock: vi.fn(),
  setCardFieldValueMock: vi.fn(),
}))

vi.mock('./field.repository', () => ({
  fieldRepository: {
    createField: createFieldMock,
    deleteFieldOption: deleteFieldOptionMock,
    renameField: renameFieldMock,
    setCardFieldValue: setCardFieldValueMock,
  },
}))

function createQueryClient() {
  return createTestQueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        retry: false,
      },
    },
  })
}

function deferredPromise<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  return {promise, reject, resolve}
}

function makeField(overrides: Partial<CustomFieldDefinition> = {}): CustomFieldDefinition {
  return {
    fieldType: 'single_select',
    id: 'field-1',
    key: 'severity',
    name: 'Severity',
    options: [{color: null, id: 'option-1', label: 'High'}],
    ...overrides,
  }
}

function makeCardRecord(overrides: Partial<CardRecord> = {}): CardRecord {
  return {
    assigneeName: 'Test User',
    assigneeUserId: null,
    bodyJson: {content: [], type: 'doc'},
    bodyMd: '',
    completedAt: null,
    createdAt: '2026-04-05T12:00:00.000Z',
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
    statusOptionId: 'status-1',
    statusPosition: 0,
    tags: [],
    title: 'Card 1',
    ...overrides,
  }
}

function makeCardDetail(overrides: Partial<CardDetail> = {}): CardDetail {
  return {
    attachments: [],
    comments: [],
    ...makeCardRecord(),
    ...overrides,
  }
}

function seedTableViewStates(queryClient: QueryClient) {
  queryClient.setQueryData<ProjectTableViewStatesResult>(['project', 'table-view-states', 'project-1'], {
    projectViewBackend: {
      message: null,
      status: 'ready',
    },
    tableViewStates: {
      'view-1': {
        personalConfig: {
          collapsedGroups: [],
          columnWidths: {},
        },
        sharedConfig: {
          filters: {
            priority: [],
            status: [],
          },
          groupBy: 'group',
          personFilterUserId: null,
          sort: [],
          visibleFieldKeys: ['status'],
        },
        sharedVersion: 1,
      },
    },
  })
}

function CreateFieldHarness() {
  const mutation = useCreateCustomFieldMutation('project-1')
  const [status, setStatus] = useState('idle')
  const [visibleFieldKeys, setVisibleFieldKeys] = useState<string[]>(['status'])

  return (
    <>
      <button
        onClick={() => {
          mutation.mutate(
            {fieldType: 'text', name: 'Text', options: []},
            {
              onSuccess: (field) => {
                setVisibleFieldKeys((current) => [...current, field.key])
                setStatus('resolved')
              },
            },
          )
        }}
        type='button'
      >
        Create field
      </button>
      <span data-testid='status'>{status}</span>
      <span data-testid='visible-fields'>{visibleFieldKeys.join(',')}</span>
    </>
  )
}

function RenameFieldHarness() {
  const mutation = useRenameCustomFieldMutation('project-1')

  return (
    <button
      onClick={() => mutation.mutate({fieldDefinitionId: 'field-1', name: 'Renamed'})}
      type='button'
    >
      Rename field
    </button>
  )
}

function DeleteFieldOptionHarness() {
  const mutation = useDeleteFieldOptionMutation('project-1')

  return (
    <button onClick={() => mutation.mutate('option-1')} type='button'>
      Delete option
    </button>
  )
}

function SetFieldValueHarness() {
  const mutation = useSetCardCustomFieldValueMutation()

  return (
    <button
      onClick={() => mutation.mutate({
        cardId: 'card-1',
        fieldDefinitionId: 'field-text',
        fieldType: 'text',
        projectId: 'project-1',
        textValue: '  Draft value  ',
      })}
      type='button'
    >
      Set field value
    </button>
  )
}

describe('field mutations', () => {
  beforeEach(() => {
    createFieldMock.mockReset()
    deleteFieldOptionMock.mockReset()
    renameFieldMock.mockReset()
    setCardFieldValueMock.mockReset()
  })

  it('resolves create-field mutations without waiting for background invalidation', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()
    const invalidateDeferred = deferredPromise<void>()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockImplementation((filters) => {
      const queryKey = (filters as {queryKey?: readonly unknown[]} | undefined)?.queryKey

      if (
        (queryKey?.[0] === 'project' && queryKey?.[1] === 'fields')
        || (queryKey?.[0] === 'project' && queryKey?.[1] === 'table-view-states')
      ) {
        return invalidateDeferred.promise as ReturnType<typeof queryClient.invalidateQueries>
      }

      return Promise.resolve() as ReturnType<typeof queryClient.invalidateQueries>
    })

    queryClient.setQueryData<CustomFieldDefinition[]>(['project', 'fields', 'project-1'], [])
    seedTableViewStates(queryClient)
    createFieldMock.mockResolvedValue({
      fieldType: 'text',
      id: 'field-text',
      key: 'text',
      name: 'Text',
      options: [],
    })

    render(
      <QueryClientProvider client={queryClient}>
        <CreateFieldHarness/>
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('button', {name: 'Create field'}))

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('resolved'))
    expect(screen.getByTestId('visible-fields')).toHaveTextContent('status,text')
    expect(queryClient.getQueryData<CustomFieldDefinition[]>(['project', 'fields', 'project-1'])).toEqual([
      expect.objectContaining({id: 'field-text', key: 'text'}),
    ])
    expect(
      queryClient.getQueryData<ProjectTableViewStatesResult>(['project', 'table-view-states', 'project-1'])
        ?.tableViewStates['view-1'].sharedConfig.visibleFieldKeys,
    ).toEqual(['status', 'text'])

    invalidateDeferred.resolve()
    invalidateSpy.mockRestore()
  })

  it('rolls back renamed fields when the mutation fails', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()
    const renameDeferred = deferredPromise<void>()

    queryClient.setQueryData<CustomFieldDefinition[]>(['project', 'fields', 'project-1'], [makeField()])
    renameFieldMock.mockReturnValue(renameDeferred.promise)

    render(
      <QueryClientProvider client={queryClient}>
        <RenameFieldHarness/>
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('button', {name: 'Rename field'}))

    await waitFor(() => {
      expect(queryClient.getQueryData<CustomFieldDefinition[]>(['project', 'fields', 'project-1'])?.[0]?.name).toBe('Renamed')
    })

    renameDeferred.reject(new Error('network down'))

    await waitFor(() => {
      expect(queryClient.getQueryData<CustomFieldDefinition[]>(['project', 'fields', 'project-1'])?.[0]?.name).toBe('Severity')
    })
  })

  it('optimistically removes deleted field options and rolls card values back on failure', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()
    const deleteDeferred = deferredPromise<void>()
    const customFieldValue = {
      fieldDefinitionId: 'field-1',
      fieldKey: 'severity',
      fieldType: 'single_select' as const,
      optionId: 'option-1',
    }

    queryClient.setQueryData<CustomFieldDefinition[]>(['project', 'fields', 'project-1'], [makeField()])
    queryClient.setQueryData<CardRecord[]>(['project', 'cards', 'project-1'], [
      makeCardRecord({customFieldValues: {severity: customFieldValue}}),
    ])
    queryClient.setQueryData<CardDetail>(
      cardDetailQueryOptions('card-1').queryKey,
      makeCardDetail({customFieldValues: {severity: customFieldValue}}),
    )
    deleteFieldOptionMock.mockReturnValue(deleteDeferred.promise)

    render(
      <QueryClientProvider client={queryClient}>
        <DeleteFieldOptionHarness/>
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('button', {name: 'Delete option'}))

    await waitFor(() => {
      expect(queryClient.getQueryData<CustomFieldDefinition[]>(['project', 'fields', 'project-1'])?.[0]?.options).toEqual([])
      expect(queryClient.getQueryData<CardRecord[]>(['project', 'cards', 'project-1'])?.[0]?.customFieldValues).toEqual({})
      expect(queryClient.getQueryData<CardDetail>(cardDetailQueryOptions('card-1').queryKey)?.customFieldValues).toEqual({})
    })

    deleteDeferred.reject(new Error('delete failed'))

    await waitFor(() => {
      expect(queryClient.getQueryData<CustomFieldDefinition[]>(['project', 'fields', 'project-1'])?.[0]?.options).toEqual([
        {color: null, id: 'option-1', label: 'High'},
      ])
      expect(queryClient.getQueryData<CardRecord[]>(['project', 'cards', 'project-1'])?.[0]?.customFieldValues).toEqual({
        severity: customFieldValue,
      })
      expect(queryClient.getQueryData<CardDetail>(cardDetailQueryOptions('card-1').queryKey)?.customFieldValues).toEqual({
        severity: customFieldValue,
      })
    })
  })

  it('patches card and detail caches when setting a custom field value', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()
    const setValueDeferred = deferredPromise<SetCardCustomFieldValueResult>()

    queryClient.setQueryData<CustomFieldDefinition[]>(['project', 'fields', 'project-1'], [
      makeField({fieldType: 'text', id: 'field-text', key: 'notes', name: 'Notes', options: []}),
    ])
    queryClient.setQueryData<CardRecord[]>(['project', 'cards', 'project-1'], [makeCardRecord()])
    queryClient.setQueryData<CardDetail>(cardDetailQueryOptions('card-1').queryKey, makeCardDetail())
    setCardFieldValueMock.mockReturnValue(setValueDeferred.promise)

    render(
      <QueryClientProvider client={queryClient}>
        <SetFieldValueHarness/>
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('button', {name: 'Set field value'}))

    await waitFor(() => {
      expect(queryClient.getQueryData<CardRecord[]>(['project', 'cards', 'project-1'])?.[0]?.customFieldValues.notes).toEqual({
        fieldDefinitionId: 'field-text',
        fieldKey: 'notes',
        fieldType: 'text',
        textValue: 'Draft value',
      })
      expect(queryClient.getQueryData<CardDetail>(cardDetailQueryOptions('card-1').queryKey)?.customFieldValues.notes).toEqual({
        fieldDefinitionId: 'field-text',
        fieldKey: 'notes',
        fieldType: 'text',
        textValue: 'Draft value',
      })
    })

    setValueDeferred.resolve({
      cardId: 'card-1',
      fieldKey: 'notes',
      projectId: 'project-1',
      value: {
        fieldDefinitionId: 'field-text',
        fieldKey: 'notes',
        fieldType: 'text',
        textValue: 'Saved value',
      },
    })

    await waitFor(() => {
      expect(queryClient.getQueryData<CardRecord[]>(['project', 'cards', 'project-1'])?.[0]?.customFieldValues.notes).toEqual({
        fieldDefinitionId: 'field-text',
        fieldKey: 'notes',
        fieldType: 'text',
        textValue: 'Saved value',
      })
      expect(queryClient.getQueryData<CardDetail>(cardDetailQueryOptions('card-1').queryKey)?.customFieldValues.notes).toEqual({
        fieldDefinitionId: 'field-text',
        fieldKey: 'notes',
        fieldType: 'text',
        textValue: 'Saved value',
      })
    })
  })
})
