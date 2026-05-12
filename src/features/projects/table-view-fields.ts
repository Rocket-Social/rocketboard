import type {CustomFieldDefinition} from '../fields/field.types'
import {
  builtinFieldDefinitions,
  getBuiltinFieldDefinition,
  isBuiltinTableFieldKey,
  resolveBuiltinFieldLabel,
  type ProjectBuiltinFieldLabels,
} from './builtin-fields'

export type {BuiltinTableFieldKey} from './builtin-fields'

export type TableColumnDefinition = {
  defaultWidth: number
  editable: boolean
  fieldDefinition?: CustomFieldDefinition
  key: string
  kind: 'builtin' | 'custom'
  label: string
}

export const defaultTableTitleWidth = 320

export function buildTableColumnDefinitions(
  customFields: CustomFieldDefinition[],
  visibleFieldKeys: string[],
  builtinFieldLabels?: ProjectBuiltinFieldLabels | null,
): TableColumnDefinition[] {
  const customColumns: TableColumnDefinition[] = customFields.map((field) => ({
    defaultWidth: field.fieldType === 'text' ? 220 : field.fieldType === 'single_select' ? 176 : 144,
    editable: true,
    fieldDefinition: field,
    key: field.key,
    kind: 'custom',
    label: field.name,
  }))
  const builtinColumns: TableColumnDefinition[] = builtinFieldDefinitions.map((definition) => ({
    defaultWidth: definition.defaultWidth,
    editable: definition.editable,
    key: definition.key,
    kind: 'builtin',
    label: resolveBuiltinFieldLabel(definition.key, builtinFieldLabels),
  }))
  const columnByKey = new Map([...builtinColumns, ...customColumns].map((column) => [column.key, column]))

  return visibleFieldKeys.flatMap((fieldKey) => {
    const column = columnByKey.get(fieldKey)
    return column ? [column] : []
  })
}

export function getDefaultColumnWidth(fieldKey: string, customFields: CustomFieldDefinition[]) {
  if (fieldKey === 'title') {
    return defaultTableTitleWidth
  }

  if (isBuiltinTableFieldKey(fieldKey)) {
    return getBuiltinFieldDefinition(fieldKey).defaultWidth
  }

  return customFields.find((field) => field.key === fieldKey)
    ? buildTableColumnDefinitions(customFields, [fieldKey])[0]?.defaultWidth ?? 160
    : 160
}

export function listAvailableTableColumns(
  customFields: CustomFieldDefinition[],
  builtinFieldLabels?: ProjectBuiltinFieldLabels | null,
) {
  return [
    ...builtinFieldDefinitions.map((definition) => ({
      defaultWidth: definition.defaultWidth,
      editable: definition.editable,
      key: definition.key,
      kind: 'builtin' as const,
      label: resolveBuiltinFieldLabel(definition.key, builtinFieldLabels),
    })),
    ...customFields.map((field) => ({
      defaultWidth: field.fieldType === 'text' ? 220 : field.fieldType === 'single_select' ? 176 : 144,
      editable: true,
      fieldDefinition: field,
      key: field.key,
      kind: 'custom' as const,
      label: field.name,
    })),
  ]
}

export function listTableSortFieldOptions(
  customFields: CustomFieldDefinition[],
  builtinFieldLabels?: ProjectBuiltinFieldLabels | null,
) {
  return [
    {label: 'Title', value: 'title'},
    ...listAvailableTableColumns(customFields, builtinFieldLabels).map((column) => ({
      label: column.label,
      value: column.key,
    })),
  ]
}
