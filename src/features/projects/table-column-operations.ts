export function moveVisibleFieldKey(
  visibleFieldKeys: string[],
  fieldKey: string,
  direction: 'left' | 'right',
) {
  const index = visibleFieldKeys.indexOf(fieldKey)

  if (index === -1) {
    return visibleFieldKeys
  }

  const targetIndex = direction === 'left' ? index - 1 : index + 1

  if (targetIndex < 0 || targetIndex >= visibleFieldKeys.length) {
    return visibleFieldKeys
  }

  const nextKeys = [...visibleFieldKeys]
  ;[nextKeys[index], nextKeys[targetIndex]] = [nextKeys[targetIndex], nextKeys[index]]
  return nextKeys
}

export function hideVisibleFieldKey(visibleFieldKeys: string[], fieldKey: string) {
  return visibleFieldKeys.filter((entry) => entry !== fieldKey)
}

export function insertVisibleFieldKey(
  visibleFieldKeys: string[],
  fieldKey: string,
  targetIndex: number,
) {
  if (visibleFieldKeys.includes(fieldKey)) {
    return visibleFieldKeys
  }

  const normalizedIndex = Math.max(0, Math.min(targetIndex, visibleFieldKeys.length))
  const nextKeys = [...visibleFieldKeys]
  nextKeys.splice(normalizedIndex, 0, fieldKey)
  return nextKeys
}

export function reorderVisibleFieldKey(
  visibleFieldKeys: string[],
  fieldKey: string,
  targetIndex: number,
) {
  const currentIndex = visibleFieldKeys.indexOf(fieldKey)

  if (currentIndex === -1 || currentIndex === targetIndex) {
    return visibleFieldKeys
  }

  const nextKeys = [...visibleFieldKeys]
  nextKeys.splice(currentIndex, 1)
  nextKeys.splice(targetIndex, 0, fieldKey)
  return nextKeys
}
