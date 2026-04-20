import type {CanvasToolMode} from './canvas.types'

export type CanvasKeyboardAction =
  | {type: 'clear-selection'}
  | {type: 'delete-selected'}
  | {tool: CanvasToolMode; type: 'set-tool'}

type CanvasKeyboardOptions = {
  hasSelectedElement: boolean
  isEditableTarget: boolean
}

export function resolveCanvasKeyboardAction(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'defaultPrevented' | 'key' | 'metaKey'>,
  options: CanvasKeyboardOptions,
): CanvasKeyboardAction | null {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || options.isEditableTarget) {
    return null
  }

  switch (event.key.toLowerCase()) {
    case 'v':
      return {tool: 'select', type: 'set-tool'}
    case 'h':
      return {tool: 'hand', type: 'set-tool'}
    case 'p':
      return {tool: 'pen', type: 'set-tool'}
    case 'n':
      return {tool: 'note', type: 'set-tool'}
    case 's':
      return {tool: 'shape', type: 'set-tool'}
    case 'c':
      return {tool: 'comment', type: 'set-tool'}
    case 'delete':
    case 'backspace':
      return options.hasSelectedElement ? {type: 'delete-selected'} : null
    case 'escape':
      return {type: 'clear-selection'}
    default:
      return null
  }
}
