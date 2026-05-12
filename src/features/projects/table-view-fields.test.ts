import {describe, expect, it} from 'vitest'

import {buildTableColumnDefinitions, listTableSortFieldOptions} from './table-view-fields'
import type {CustomFieldDefinition} from '../fields/field.types'

const customFields: CustomFieldDefinition[] = [
  {
    fieldType: 'number',
    id: 'field-custom-score',
    key: 'custom_score',
    name: 'Custom score',
    options: [],
  },
]

describe('table view field definitions', () => {
  it('preserves visible field order and applies builtin aliases', () => {
    const columns = buildTableColumnDefinitions(
      customFields,
      ['custom_score', 'effort', 'status'],
      {effort: 'Points'},
    )

    expect(columns.map((column) => column.key)).toEqual(['custom_score', 'effort', 'status'])
    expect(columns.map((column) => column.label)).toEqual(['Custom score', 'Points', 'Status'])
  })

  it('lists title, builtins, and custom fields as sort options', () => {
    expect(listTableSortFieldOptions(customFields, {effort: 'Points'})).toEqual(
      expect.arrayContaining([
        {label: 'Title', value: 'title'},
        {label: 'Points', value: 'effort'},
        {label: 'Tags', value: 'tags'},
        {label: 'Custom score', value: 'custom_score'},
      ]),
    )
  })
})
