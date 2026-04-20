/** @vitest-environment jsdom */
import {describe, expect, it} from 'vitest'

import {resolveCanvasKeyboardAction} from './canvas-keyboard'
import {isCanvasShortcutScopeActive} from './useCanvasKeyboardShortcuts'

describe('canvas keyboard shortcuts', () => {
  it('maps tool shortcuts to their tool selection actions', () => {
    expect(resolveCanvasKeyboardAction(
      {altKey: false, ctrlKey: false, defaultPrevented: false, key: 'v', metaKey: false},
      {hasSelectedElement: false, isEditableTarget: false},
    )).toEqual({tool: 'select', type: 'set-tool'})

    expect(resolveCanvasKeyboardAction(
      {altKey: false, ctrlKey: false, defaultPrevented: false, key: 'h', metaKey: false},
      {hasSelectedElement: false, isEditableTarget: false},
    )).toEqual({tool: 'hand', type: 'set-tool'})

    expect(resolveCanvasKeyboardAction(
      {altKey: false, ctrlKey: false, defaultPrevented: false, key: 'n', metaKey: false},
      {hasSelectedElement: false, isEditableTarget: false},
    )).toEqual({tool: 'note', type: 'set-tool'})

    expect(resolveCanvasKeyboardAction(
      {altKey: false, ctrlKey: false, defaultPrevented: false, key: 's', metaKey: false},
      {hasSelectedElement: false, isEditableTarget: false},
    )).toEqual({tool: 'shape', type: 'set-tool'})

    expect(resolveCanvasKeyboardAction(
      {altKey: false, ctrlKey: false, defaultPrevented: false, key: 'p', metaKey: false},
      {hasSelectedElement: false, isEditableTarget: false},
    )).toEqual({tool: 'pen', type: 'set-tool'})

    expect(resolveCanvasKeyboardAction(
      {altKey: false, ctrlKey: false, defaultPrevented: false, key: 'c', metaKey: false},
      {hasSelectedElement: false, isEditableTarget: false},
    )).toEqual({tool: 'comment', type: 'set-tool'})
  })

  it('routes delete and escape when canvas focus is active', () => {
    expect(resolveCanvasKeyboardAction(
      {altKey: false, ctrlKey: false, defaultPrevented: false, key: 'Delete', metaKey: false},
      {hasSelectedElement: true, isEditableTarget: false},
    )).toEqual({type: 'delete-selected'})

    expect(resolveCanvasKeyboardAction(
      {altKey: false, ctrlKey: false, defaultPrevented: false, key: 'Escape', metaKey: false},
      {hasSelectedElement: false, isEditableTarget: false},
    )).toEqual({type: 'clear-selection'})
  })

  it('does nothing while an input is focused', () => {
    expect(resolveCanvasKeyboardAction(
      {altKey: false, ctrlKey: false, defaultPrevented: false, key: 'p', metaKey: false},
      {hasSelectedElement: false, isEditableTarget: true},
    )).toBeNull()
  })

  it('only treats shortcuts as active while focus is inside the canvas surface', () => {
    const surface = document.createElement('div')
    surface.tabIndex = 0
    const noteInput = document.createElement('textarea')
    const outsideButton = document.createElement('button')

    surface.append(noteInput)
    document.body.append(surface, outsideButton)

    surface.focus()
    expect(isCanvasShortcutScopeActive(surface, document.activeElement)).toBe(true)

    noteInput.focus()
    expect(isCanvasShortcutScopeActive(surface, document.activeElement)).toBe(true)

    outsideButton.focus()
    expect(isCanvasShortcutScopeActive(surface, document.activeElement)).toBe(false)
  })
})
