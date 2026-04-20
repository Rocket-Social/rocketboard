const msPerDay = 24 * 60 * 60 * 1000

export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  // Keep timeline math pinned to UTC so DST shifts don't duplicate or skip calendar days.
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

export function dateToDayOffset(dateStr: string | null, baseline: Date): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00Z' : dateStr)
  if (Number.isNaN(d.getTime())) return null
  return Math.round((d.getTime() - baseline.getTime()) / msPerDay)
}

export function dayOffsetToDateString(baseline: Date, dayOffset: number): string {
  const target = new Date(baseline.getTime() + dayOffset * msPerDay)
  return target.toISOString().slice(0, 10)
}

export function getTodayOffset(dayWidth: number, baseline: Date): number | null {
  const now = new Date()
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const dayOffset = Math.round((today.getTime() - baseline.getTime()) / msPerDay)
  if (dayOffset < 0) return null
  return dayOffset * dayWidth
}
