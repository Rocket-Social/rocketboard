export type BuiltinTableFieldKey =
  | 'assignee'
  | 'due_date'
  | 'effort'
  | 'group'
  | 'priority'
  | 'start_date'
  | 'status'
  | 'tags'

export type ProjectBuiltinFieldLabels = Partial<Record<BuiltinTableFieldKey, string>>

export type BuiltinFieldDefinition = {
  defaultLabel: string
  defaultWidth: number
  editable: boolean
  key: BuiltinTableFieldKey
}

export const builtinFieldDefinitions: BuiltinFieldDefinition[] = [
  {defaultLabel: 'Assignee', defaultWidth: 144, editable: true, key: 'assignee'},
  {defaultLabel: 'Start date', defaultWidth: 160, editable: true, key: 'start_date'},
  {defaultLabel: 'Due date', defaultWidth: 160, editable: true, key: 'due_date'},
  {defaultLabel: 'Group', defaultWidth: 176, editable: true, key: 'group'},
  {defaultLabel: 'Status', defaultWidth: 120, editable: true, key: 'status'},
  {defaultLabel: 'Priority', defaultWidth: 120, editable: true, key: 'priority'},
  {defaultLabel: 'Effort', defaultWidth: 108, editable: true, key: 'effort'},
  {defaultLabel: 'Tags', defaultWidth: 184, editable: true, key: 'tags'},
]

const builtinFieldDefinitionMap = Object.fromEntries(
  builtinFieldDefinitions.map((definition) => [definition.key, definition]),
) as Record<BuiltinTableFieldKey, BuiltinFieldDefinition>

export function isBuiltinTableFieldKey(value: string): value is BuiltinTableFieldKey {
  return value in builtinFieldDefinitionMap
}

export function getBuiltinFieldDefinition(key: BuiltinTableFieldKey) {
  return builtinFieldDefinitionMap[key]
}

export function getBuiltinFieldCanonicalLabel(key: BuiltinTableFieldKey) {
  return builtinFieldDefinitionMap[key].defaultLabel
}

export function resolveBuiltinFieldLabel(
  key: BuiltinTableFieldKey,
  labels?: ProjectBuiltinFieldLabels | null,
) {
  const alias = labels?.[key]?.trim()

  return alias && alias.length > 0 ? alias : getBuiltinFieldCanonicalLabel(key)
}

export function isBuiltinFieldRenamed(
  key: BuiltinTableFieldKey,
  labels?: ProjectBuiltinFieldLabels | null,
) {
  return resolveBuiltinFieldLabel(key, labels) !== getBuiltinFieldCanonicalLabel(key)
}
