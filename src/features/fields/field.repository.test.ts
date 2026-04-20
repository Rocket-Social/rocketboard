import {beforeEach, describe, expect, it, vi} from 'vitest'

const {callSingleMock} = vi.hoisted(() => ({
  callSingleMock: vi.fn(),
}))

vi.mock('../../platform/data/rpc-adapter', () => ({
  rpcAdapter: {
    call: vi.fn(),
    callAndTransform: vi.fn(),
    callSingle: callSingleMock,
  },
}))

import {fieldRepository} from './field.repository'

describe('fieldRepository', () => {
  beforeEach(() => {
    callSingleMock.mockReset()
  })

  it('unwraps created custom fields from single-row RPC responses', async () => {
    const createdField = {
      fieldType: 'text' as const,
      id: 'field-1',
      key: 'text',
      name: 'Text',
      options: [],
    }
    callSingleMock.mockResolvedValue(createdField)

    const result = await fieldRepository.createField({
      fieldType: 'text',
      name: 'Text',
      options: [],
      projectId: 'project-1',
    })

    expect(callSingleMock).toHaveBeenCalledWith('create_field_definition', {
      target_field_type: 'text',
      target_name: 'Text',
      target_options: [],
      target_project_id: 'project-1',
    })
    expect(result).toEqual(createdField)
  })

  it('unwraps added field options from single-row RPC responses', async () => {
    const createdOption = {
      fieldDefinitionId: 'field-1',
      id: 'option-1',
      label: 'Option 1',
    }
    callSingleMock.mockResolvedValue(createdOption)

    const result = await fieldRepository.addFieldOption({
      fieldDefinitionId: 'field-1',
      label: 'Option 1',
    })

    expect(callSingleMock).toHaveBeenCalledWith('add_field_option', {
      target_field_definition_id: 'field-1',
      target_label: 'Option 1',
    })
    expect(result).toEqual(createdOption)
  })
})
