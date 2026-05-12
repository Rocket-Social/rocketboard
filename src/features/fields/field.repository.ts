import {rpcAdapter} from '../../platform/data/rpc-adapter'
import type {
  ArchiveCustomFieldInput,
  CreateCustomFieldInput,
  CustomFieldDefinition,
  RenameCustomFieldInput,
  SetCardCustomFieldValueInput,
  SetCardCustomFieldValueResult,
} from './field.types'

export type AddFieldOptionInput = {
  fieldDefinitionId: string
  label: string
}

export type AddFieldOptionResult = {
  fieldDefinitionId: string
  id: string
  label: string
}

export type RenameFieldOptionInput = {
  label: string
  optionId: string
}

export type FieldRepository = {
  addFieldOption(input: AddFieldOptionInput): Promise<AddFieldOptionResult>
  archiveField(input: ArchiveCustomFieldInput): Promise<void>
  createField(input: CreateCustomFieldInput): Promise<CustomFieldDefinition>
  deleteFieldOption(optionId: string): Promise<void>
  renameField(input: RenameCustomFieldInput): Promise<void>
  renameFieldOption(input: RenameFieldOptionInput): Promise<void>
  reorderFieldOptions(optionIds: string[]): Promise<void>
  setCardFieldValue(input: SetCardCustomFieldValueInput): Promise<SetCardCustomFieldValueResult>
  setFieldOptionColor(optionId: string, color: string | null): Promise<void>
}

export const fieldRepository: FieldRepository = {
  async addFieldOption(input) {
    return await rpcAdapter.callSingle<AddFieldOptionResult>('add_field_option', {
      target_field_definition_id: input.fieldDefinitionId,
      target_label: input.label,
    })
  },
  async deleteFieldOption(optionId) {
    await rpcAdapter.call('delete_field_option', {target_option_id: optionId})
  },
  async archiveField(input) {
    await rpcAdapter.call('archive_field_definition', {
      target_field_definition_id: input.fieldDefinitionId,
    })
  },
  async createField(input) {
    return await rpcAdapter.callSingle<CustomFieldDefinition>('create_field_definition', {
      target_field_type: input.fieldType,
      target_name: input.name,
      target_options: input.options,
      target_project_id: input.projectId,
    })
  },
  async renameField(input) {
    await rpcAdapter.call('rename_field_definition', {
      target_field_definition_id: input.fieldDefinitionId,
      target_name: input.name,
    })
  },
  async renameFieldOption(input) {
    await rpcAdapter.call('rename_field_option', {
      target_option_id: input.optionId,
      target_label: input.label,
    })
  },
  async reorderFieldOptions(optionIds) {
    await rpcAdapter.call('reorder_field_options', {
      target_option_ids: optionIds,
    })
  },
  async setCardFieldValue(input) {
    return await rpcAdapter.callAndTransform<SetCardCustomFieldValueResult>('set_card_field_value', {
      target_card_id: input.cardId,
      target_date_value: input.dateValue ?? null,
      target_field_definition_id: input.fieldDefinitionId,
      target_field_option_id: input.optionId ?? null,
      target_number_value: input.numberValue ?? null,
      target_text_value: input.textValue ?? null,
    })
  },
  async setFieldOptionColor(optionId, color) {
    await rpcAdapter.call('set_field_option_color', {
      target_color: color,
      target_option_id: optionId,
    })
  },
}
