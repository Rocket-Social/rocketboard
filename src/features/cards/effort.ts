export function formatEffortValue(value: number | null) {
  return value == null ? '' : String(value)
}

export function parseEffortInput(value: string): number | null | undefined {
  const trimmed = value.trim()

  if (!trimmed) {
    return null
  }

  const parsed = Number(trimmed)

  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined
  }

  return parsed
}

export function compareEffortValues(left: number | null, right: number | null) {
  if (left == null && right == null) {
    return 0
  }

  if (left == null) {
    return 1
  }

  if (right == null) {
    return -1
  }

  return left - right
}
