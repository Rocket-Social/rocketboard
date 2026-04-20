import type {TimeScale} from '../../../lib/timeline'

/**
 * Assign a date to a bucket based on cutoff days from today.
 * bucketCutoffDays[0] = boundary between "now" and "next" (e.g., 30 days)
 * bucketCutoffDays[1] = boundary between "next" and "later" (e.g., 90 days)
 */
export function assignBucket(date: string, cutoffs: [number, number]): 'later' | 'now' | 'next' {
  const now = new Date()
  const target = new Date(date)
  const diffDays = Math.floor((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays <= cutoffs[0]) return 'now'
  if (diffDays <= cutoffs[1]) return 'next'
  return 'later'
}

export function getBucketPeriodKeys(): string[] {
  return ['now', 'next', 'later']
}

export function getCalendarPeriodKeys(timeScale: TimeScale, baseline: Date, numPeriods: number): string[] {
  const keys: string[] = []
  const d = new Date(baseline)

  for (let i = 0; i < numPeriods; i++) {
    if (timeScale === 'quarter') {
      const q = Math.floor(d.getUTCMonth() / 3) + 1
      keys.push(`${d.getUTCFullYear()}-Q${q}`)
      d.setUTCMonth(d.getUTCMonth() + 3)
    } else {
      const month = String(d.getUTCMonth() + 1).padStart(2, '0')
      keys.push(`${d.getUTCFullYear()}-${month}`)
      d.setUTCMonth(d.getUTCMonth() + 1)
    }
  }

  return keys
}

export function periodKeyLabel(key: string, bucketLabels?: [string, string, string]): string {
  if (key === 'now') return bucketLabels?.[0] ?? 'Now'
  if (key === 'next') return bucketLabels?.[1] ?? 'Next'
  if (key === 'later') return bucketLabels?.[2] ?? 'Later'

  // Calendar key: "2026-04" or "2026-Q2"
  if (key.includes('-Q')) return key
  const [year, month] = key.split('-')
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${monthNames[Number(month) - 1]} ${year}`
}
