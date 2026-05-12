/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {describe, expect, it} from 'vitest'

import {getEventTargetElement, isEditableEventTarget} from './dom'

describe('dom helpers', () => {
  it('treats text nodes inside contenteditable roots as editable targets', () => {
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    const paragraph = document.createElement('p')
    const textNode = document.createTextNode('Draft')

    paragraph.append(textNode)
    editor.append(paragraph)
    document.body.append(editor)

    expect(getEventTargetElement(textNode)).toBe(paragraph)
    expect(isEditableEventTarget(textNode)).toBe(true)
  })

  it('treats native form controls as editable targets', () => {
    const input = document.createElement('input')

    expect(isEditableEventTarget(input)).toBe(true)
  })
})
