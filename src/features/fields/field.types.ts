export type CustomFieldType = 'date' | 'number' | 'single_select' | 'text'

export type CustomFieldOption = {
  color: string | null
  id: string
  label: string
}

export type CustomFieldDefinition = {
  fieldType: CustomFieldType
  id: string
  key: string
  name: string
  options: CustomFieldOption[]
}

export type CardCustomFieldValue = {
  dateValue?: string
  fieldDefinitionId: string
  fieldKey: string
  fieldType: CustomFieldType
  numberValue?: number
  optionId?: string
  textValue?: string
}

export type CardCustomFieldValueMap = Record<string, CardCustomFieldValue>

export type CreateCustomFieldInput = {
  fieldType: CustomFieldType
  name: string
  options: string[]
  projectId: string
}

export type ArchiveCustomFieldInput = {
  fieldDefinitionId: string
  projectId: string
}

export type RenameCustomFieldInput = {
  fieldDefinitionId: string
  name: string
  projectId: string
}

export type SetCardCustomFieldValueInput = {
  cardId: string
  dateValue?: string | null
  fieldDefinitionId: string
  fieldType: CustomFieldType
  numberValue?: number | null
  optionId?: string | null
  projectId: string
  textValue?: string | null
}

export type SetCardCustomFieldValueResult = {
  cardId: string
  fieldKey: string
  projectId: string
  value: CardCustomFieldValue | null
}
