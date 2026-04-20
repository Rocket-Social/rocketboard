import {useMutation, useQueryClient} from '@tanstack/react-query'

import type {CardDetail, CardRecord} from '../cards/card.types'
import {cardDetailQueryOptions} from '../cards/card.queries'
import {
  patchProjectCards,
  patchProjectFields,
  patchProjectTableViewStatesResult,
} from '../projects/project-data.cache'
import {
  restoreQuerySnapshots,
  runInBackground,
  snapshotQueries,
} from '../projects/project-mutation.utils'
import {invalidateProjectDataSlices} from '../projects/project-shell.queries'
import {normalizeProjectTableVisibleFieldKeys} from '../projects/project-view.types'
import {fieldRepository} from './field.repository'
import type {
  ArchiveCustomFieldInput,
  CardCustomFieldValue,
  CardCustomFieldValueMap,
  CreateCustomFieldInput,
  CustomFieldDefinition,
  RenameCustomFieldInput,
  SetCardCustomFieldValueInput,
  SetCardCustomFieldValueResult,
} from './field.types'

function appendCustomField(
  fields: CustomFieldDefinition[],
  field: CustomFieldDefinition,
) {
  if (fields.some((entry) => entry.id === field.id)) {
    return fields
  }

  return [...fields, field]
}

function patchTableViewVisibleFieldKey(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
  fieldKey: string,
  action: 'add' | 'remove',
) {
  patchProjectTableViewStatesResult(queryClient, projectId, (current) => ({
    ...current,
    tableViewStates: Object.fromEntries(
      Object.entries(current.tableViewStates).map(([viewId, tableViewState]) => {
        const nextVisibleFieldKeys = normalizeProjectTableVisibleFieldKeys(
          action === 'add'
            ? [...tableViewState.sharedConfig.visibleFieldKeys, fieldKey]
            : tableViewState.sharedConfig.visibleFieldKeys.filter((entry) => entry !== fieldKey),
        )
        const didChange = JSON.stringify(nextVisibleFieldKeys) !== JSON.stringify(tableViewState.sharedConfig.visibleFieldKeys)

        return [
          viewId,
          didChange
            ? {
                ...tableViewState,
                sharedConfig: {
                  ...tableViewState.sharedConfig,
                  visibleFieldKeys: nextVisibleFieldKeys,
                },
                sharedVersion: tableViewState.sharedVersion + 1,
              }
            : tableViewState,
        ]
      }),
    ),
  }))
}

function patchCardCustomFieldValues(
  current: CardCustomFieldValueMap,
  fieldKey: string,
  value: CardCustomFieldValue | null,
) {
  if (!value) {
    if (!(fieldKey in current)) {
      return current
    }

    const nextValues = {...current}
    delete nextValues[fieldKey]
    return nextValues
  }

  return {
    ...current,
    [fieldKey]: value,
  }
}

function patchProjectCardFieldValue(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
  cardId: string,
  fieldKey: string,
  value: CardCustomFieldValue | null,
) {
  patchProjectCards(queryClient, projectId, (cards) =>
    cards.map((card) => {
      if (card.id !== cardId) {
        return card
      }

      const customFieldValues = patchCardCustomFieldValues(card.customFieldValues, fieldKey, value)
      return customFieldValues === card.customFieldValues ? card : {...card, customFieldValues}
    }),
  )
}

function patchCardDetailFieldValue(
  queryClient: ReturnType<typeof useQueryClient>,
  cardId: string,
  fieldKey: string,
  value: CardCustomFieldValue | null,
) {
  queryClient.setQueryData<CardDetail | undefined>(
    cardDetailQueryOptions(cardId).queryKey,
    (current) => {
      if (!current) {
        return current
      }

      const customFieldValues = patchCardCustomFieldValues(current.customFieldValues, fieldKey, value)
      return customFieldValues === current.customFieldValues ? current : {...current, customFieldValues}
    },
  )
}

function clearDeletedFieldOptionFromCardDetails(
  queryClient: ReturnType<typeof useQueryClient>,
  fieldKey: string,
  optionId: string,
) {
  const detailSnapshots = queryClient.getQueriesData<CardDetail | undefined>({
    queryKey: ['card-detail'],
  })

  for (const [queryKey, detail] of detailSnapshots) {
    if (detail?.customFieldValues[fieldKey]?.optionId !== optionId) {
      continue
    }

    queryClient.setQueryData<CardDetail | undefined>(queryKey, {
      ...detail,
      customFieldValues: patchCardCustomFieldValues(detail.customFieldValues, fieldKey, null),
    })
  }
}

function findFieldByOptionId(
  fields: CustomFieldDefinition[] | undefined,
  optionId: string,
) {
  return fields?.find((field) => field.options.some((option) => option.id === optionId)) ?? null
}

function buildLocalCardCustomFieldValue(
  input: SetCardCustomFieldValueInput,
  fieldKey: string,
): CardCustomFieldValue | null {
  if (input.fieldType === 'text') {
    const textValue = input.textValue?.trim()
    return textValue
      ? {
          fieldDefinitionId: input.fieldDefinitionId,
          fieldKey,
          fieldType: input.fieldType,
          textValue,
        }
      : null
  }

  if (input.fieldType === 'number') {
    return input.numberValue === null || input.numberValue === undefined
      ? null
      : {
          fieldDefinitionId: input.fieldDefinitionId,
          fieldKey,
          fieldType: input.fieldType,
          numberValue: input.numberValue,
        }
  }

  if (input.fieldType === 'date') {
    return input.dateValue
      ? {
          fieldDefinitionId: input.fieldDefinitionId,
          fieldKey,
          fieldType: input.fieldType,
          dateValue: input.dateValue,
        }
      : null
  }

  return input.optionId
    ? {
        fieldDefinitionId: input.fieldDefinitionId,
        fieldKey,
        fieldType: input.fieldType,
        optionId: input.optionId,
      }
    : null
}

function refreshFieldData(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
  slices: ReadonlyArray<'cards' | 'fields' | 'table-view-states'>,
) {
  runInBackground(invalidateProjectDataSlices(queryClient, projectId, slices))
}

export function useAddFieldOptionMutation(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {fieldDefinitionId: string; label: string}) =>
      fieldRepository.addFieldOption(input),
    onSuccess: (result) => {
      patchProjectFields(queryClient, projectId, (fields) =>
        fields.map((field) =>
          field.id === result.fieldDefinitionId
            ? {
                ...field,
                options: [...field.options, {color: null, id: result.id, label: result.label}],
              }
            : field,
        ),
      )
      refreshFieldData(queryClient, projectId, ['fields'])
    },
  })
}

export function useDeleteFieldOptionMutation(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (optionId: string) =>
      fieldRepository.deleteFieldOption(optionId),
    onMutate: async (optionId) => {
      const fieldSnapshots = await snapshotQueries<CustomFieldDefinition[]>(queryClient, ['project', 'fields', projectId])
      const cardSnapshots = await snapshotQueries<CardRecord[]>(queryClient, ['project', 'cards', projectId])
      const cardDetailSnapshots = await snapshotQueries<CardDetail | undefined>(queryClient, ['card-detail'])
      const targetField = findFieldByOptionId(
        queryClient.getQueryData<CustomFieldDefinition[]>(['project', 'fields', projectId]),
        optionId,
      )

      if (!targetField) {
        return {cardDetailSnapshots, cardSnapshots, fieldSnapshots}
      }

      patchProjectFields(queryClient, projectId, (fields) =>
        fields.map((field) =>
          field.id === targetField.id
            ? {
                ...field,
                options: field.options.filter((option) => option.id !== optionId),
              }
            : field,
        ),
      )
      patchProjectCards(queryClient, projectId, (cards) =>
        cards.map((card) => {
          if (card.customFieldValues[targetField.key]?.optionId !== optionId) {
            return card
          }

          return {
            ...card,
            customFieldValues: patchCardCustomFieldValues(card.customFieldValues, targetField.key, null),
          }
        }),
      )
      clearDeletedFieldOptionFromCardDetails(queryClient, targetField.key, optionId)

      return {cardDetailSnapshots, cardSnapshots, fieldSnapshots}
    },
    onError: (_error, _optionId, context) => {
      restoreQuerySnapshots(queryClient, context?.fieldSnapshots ?? [])
      restoreQuerySnapshots(queryClient, context?.cardSnapshots ?? [])
      restoreQuerySnapshots(queryClient, context?.cardDetailSnapshots ?? [])
    },
    onSuccess: () => {
      runInBackground(Promise.all([
        invalidateProjectDataSlices(queryClient, projectId, ['cards', 'fields']),
        queryClient.invalidateQueries({queryKey: ['card-detail']}),
      ]))
    },
  })
}

export function useCreateCustomFieldMutation(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Omit<CreateCustomFieldInput, 'projectId'>) =>
      fieldRepository.createField({
        ...input,
        projectId,
      }),
    onSuccess: (field) => {
      patchProjectFields(queryClient, projectId, (fields) => appendCustomField(fields, field))
      patchTableViewVisibleFieldKey(queryClient, projectId, field.key, 'add')
      refreshFieldData(queryClient, projectId, ['fields', 'table-view-states'])
    },
  })
}

export function useArchiveCustomFieldMutation(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Omit<ArchiveCustomFieldInput, 'projectId'>) =>
      fieldRepository.archiveField({
        ...input,
        projectId,
      }),
    onMutate: async (input) => {
      const fieldSnapshots = await snapshotQueries<CustomFieldDefinition[]>(queryClient, ['project', 'fields', projectId])
      const tableViewStateSnapshots = await snapshotQueries(queryClient, ['project', 'table-view-states', projectId])
      const targetField = queryClient
        .getQueryData<CustomFieldDefinition[]>(['project', 'fields', projectId])
        ?.find((field) => field.id === input.fieldDefinitionId)

      if (!targetField) {
        return {fieldSnapshots, tableViewStateSnapshots}
      }

      patchProjectFields(queryClient, projectId, (fields) =>
        fields.filter((field) => field.id !== input.fieldDefinitionId),
      )
      patchTableViewVisibleFieldKey(queryClient, projectId, targetField.key, 'remove')

      return {fieldSnapshots, tableViewStateSnapshots}
    },
    onError: (_error, _input, context) => {
      restoreQuerySnapshots(queryClient, context?.fieldSnapshots ?? [])
      restoreQuerySnapshots(queryClient, context?.tableViewStateSnapshots ?? [])
    },
    onSuccess: () => {
      runInBackground(Promise.all([
        invalidateProjectDataSlices(queryClient, projectId, ['fields', 'table-view-states']),
        queryClient.invalidateQueries({queryKey: ['card-detail']}),
      ]))
    },
  })
}

export function useRenameCustomFieldMutation(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Omit<RenameCustomFieldInput, 'projectId'>) =>
      fieldRepository.renameField({
        ...input,
        projectId,
      }),
    onMutate: async (input) => {
      const fieldSnapshots = await snapshotQueries<CustomFieldDefinition[]>(queryClient, ['project', 'fields', projectId])

      patchProjectFields(queryClient, projectId, (fields) =>
        fields.map((field) =>
          field.id === input.fieldDefinitionId
            ? {...field, name: input.name}
            : field,
        ),
      )

      return {fieldSnapshots}
    },
    onError: (_error, _input, context) => {
      restoreQuerySnapshots(queryClient, context?.fieldSnapshots ?? [])
    },
    onSuccess: () => {
      refreshFieldData(queryClient, projectId, ['fields'])
    },
  })
}

export function useRenameFieldOptionMutation(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {label: string; optionId: string}) =>
      fieldRepository.renameFieldOption(input),
    onMutate: async (input) => {
      const fieldSnapshots = await snapshotQueries<CustomFieldDefinition[]>(queryClient, ['project', 'fields', projectId])

      patchProjectFields(queryClient, projectId, (fields) =>
        fields.map((field) => ({
          ...field,
          options: field.options.map((option) =>
            option.id === input.optionId
              ? {...option, label: input.label}
              : option,
          ),
        })),
      )

      return {fieldSnapshots}
    },
    onError: (_error, _input, context) => {
      restoreQuerySnapshots(queryClient, context?.fieldSnapshots ?? [])
    },
    onSuccess: () => {
      refreshFieldData(queryClient, projectId, ['fields'])
    },
  })
}

export function useSetFieldOptionColorMutation(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {color: string | null; optionId: string}) =>
      fieldRepository.setFieldOptionColor(input.optionId, input.color),
    onMutate: async (input) => {
      const fieldSnapshots = await snapshotQueries<CustomFieldDefinition[]>(queryClient, ['project', 'fields', projectId])

      patchProjectFields(queryClient, projectId, (fields) =>
        fields.map((field) => ({
          ...field,
          options: field.options.map((option) =>
            option.id === input.optionId
              ? {...option, color: input.color}
              : option,
          ),
        })),
      )

      return {fieldSnapshots}
    },
    onError: (_error, _input, context) => {
      restoreQuerySnapshots(queryClient, context?.fieldSnapshots ?? [])
    },
    onSuccess: () => {
      refreshFieldData(queryClient, projectId, ['fields'])
    },
  })
}

export function useSetCardCustomFieldValueMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: SetCardCustomFieldValueInput) => fieldRepository.setCardFieldValue(input),
    onMutate: async (input) => {
      const cardSnapshots = await snapshotQueries<CardRecord[]>(queryClient, ['project', 'cards', input.projectId])
      const cardDetailSnapshots = await snapshotQueries<CardDetail | undefined>(
        queryClient,
        cardDetailQueryOptions(input.cardId).queryKey,
      )
      const fieldKey = queryClient
        .getQueryData<CustomFieldDefinition[]>(['project', 'fields', input.projectId])
        ?.find((field) => field.id === input.fieldDefinitionId)
        ?.key

      if (!fieldKey) {
        return {cardDetailSnapshots, cardSnapshots}
      }

      const nextValue = buildLocalCardCustomFieldValue(input, fieldKey)
      patchProjectCardFieldValue(queryClient, input.projectId, input.cardId, fieldKey, nextValue)
      patchCardDetailFieldValue(queryClient, input.cardId, fieldKey, nextValue)

      return {cardDetailSnapshots, cardSnapshots}
    },
    onError: (_error, _input, context) => {
      restoreQuerySnapshots(queryClient, context?.cardSnapshots ?? [])
      restoreQuerySnapshots(queryClient, context?.cardDetailSnapshots ?? [])
    },
    onSuccess: (result: SetCardCustomFieldValueResult) => {
      patchProjectCardFieldValue(queryClient, result.projectId, result.cardId, result.fieldKey, result.value)
      patchCardDetailFieldValue(queryClient, result.cardId, result.fieldKey, result.value)
      runInBackground(Promise.all([
        invalidateProjectDataSlices(queryClient, result.projectId, ['cards']),
        queryClient.invalidateQueries({queryKey: cardDetailQueryOptions(result.cardId).queryKey}),
      ]))
    },
  })
}
