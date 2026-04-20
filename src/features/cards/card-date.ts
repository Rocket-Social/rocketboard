const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/
const msPerDay = 24 * 60 * 60 * 1000

function padDateNumber(value: number) {
  return String(value).padStart(2, '0')
}

export function normalizeCardDateString(value: string | null): string | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim()

  if (!trimmed) {
    return null
  }

  if (dateOnlyPattern.test(trimmed)) {
    return trimmed
  }

  const parsed = new Date(trimmed)

  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return `${parsed.getFullYear()}-${padDateNumber(parsed.getMonth() + 1)}-${padDateNumber(parsed.getDate())}`
}

export function parseCardDate(value: string | null) {
  const normalized = normalizeCardDateString(value)

  if (!normalized) {
    return null
  }

  const [year, month, day] = normalized.split('-').map(Number)
  const parsed = new Date(year, month - 1, day)

  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed
}

export function cardDateToDayOffset(value: string | null, baseline: Date): number | null {
  const normalized = normalizeCardDateString(value)

  if (!normalized) {
    return null
  }

  const [year, month, day] = normalized.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const offset = Math.round((date.getTime() - baseline.getTime()) / msPerDay)

  return Number.isFinite(offset) ? offset : null
}
