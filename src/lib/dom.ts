export function getEventTargetElement(target: EventTarget | null): HTMLElement | null {
  if (target instanceof HTMLElement) {
    return target
  }

  if (target instanceof Node) {
    return target.parentElement
  }

  return null
}

export function isEditableEventTarget(target: EventTarget | null) {
  const element = getEventTargetElement(target)

  if (!element) {
    return false
  }

  const tagName = element.tagName.toLowerCase()

  return (
    element.isContentEditable
    || tagName === 'input'
    || tagName === 'select'
    || tagName === 'textarea'
    || element.closest('input, select, textarea, [contenteditable="true"]') !== null
  )
}
