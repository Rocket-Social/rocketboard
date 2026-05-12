// Wave 2 AI Kanban Phase 5 — friendly cron formatter (D5-8).
//
// Recognizes the canonical patterns the v1 templates use plus a few
// common variants. Anything else falls back to the raw cron string —
// keeps the v1 surface lean. Swap to `cronstrue` later if user-typed
// custom cron becomes common (eng review D2 deferred).
//
// Inputs are 5-field POSIX cron expressions: `<min> <hour> <dom> <month> <dow>`.

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

// IANA → short label fallback. Best-effort; falls back to the IANA
// substring after the slash if the timezone isn't in the map.
const SHORT_TIMEZONE_LABELS: Record<string, string> = {
  Africa: 'AT',
  'America/Anchorage': 'AKT',
  'America/Chicago': 'CT',
  'America/Denver': 'MT',
  'America/Los_Angeles': 'PT',
  'America/New_York': 'ET',
  'America/Phoenix': 'MST',
  'Asia/Calcutta': 'IST',
  'Asia/Kolkata': 'IST',
  'Asia/Singapore': 'SGT',
  'Asia/Tokyo': 'JST',
  'Australia/Sydney': 'AET',
  'Europe/Berlin': 'CET',
  'Europe/London': 'GMT',
  'Europe/Paris': 'CET',
  UTC: 'UTC',
}

export function shortTimezone(timezone: string): string {
  const trimmed = timezone.trim()
  if (!trimmed) return 'UTC'
  if (SHORT_TIMEZONE_LABELS[trimmed]) return SHORT_TIMEZONE_LABELS[trimmed]
  // Fall back to the substring after the last slash, uppercased.
  const idx = trimmed.lastIndexOf('/')
  if (idx >= 0) return trimmed.slice(idx + 1).replace(/_/g, ' ')
  return trimmed
}

function formatHourMinute(hour: number, minute: number): string {
  const h = String(hour).padStart(2, '0')
  const m = String(minute).padStart(2, '0')
  return `${h}:${m}`
}

function tryParseSimpleHourMinute(min: string, hour: string): {hour: number; minute: number} | null {
  const minuteN = Number.parseInt(min, 10)
  const hourN = Number.parseInt(hour, 10)
  if (!Number.isFinite(minuteN) || !Number.isFinite(hourN)) return null
  if (minuteN < 0 || minuteN > 59) return null
  if (hourN < 0 || hourN > 23) return null
  if (String(minuteN) !== min || String(hourN) !== hour) return null
  return {hour: hourN, minute: minuteN}
}

export function describeCron(cron: string, timezone: string): string {
  const trimmed = cron.trim()
  if (!trimmed) return trimmed
  const parts = trimmed.split(/\s+/)
  if (parts.length !== 5) return trimmed

  const [min, hour, dom, month, dow] = parts as [string, string, string, string, string]
  const tz = shortTimezone(timezone)

  // Only handle simple integer min/hour with wildcard month + dom.
  if (month !== '*' || dom !== '*') return trimmed
  const time = tryParseSimpleHourMinute(min, hour)
  if (!time) return trimmed
  const formattedTime = formatHourMinute(time.hour, time.minute)

  if (dow === '*') {
    return `Every day at ${formattedTime} ${tz}`
  }

  if (dow === '1-5') {
    return `Every weekday at ${formattedTime} ${tz}`
  }

  if (dow === '0,6' || dow === '6,0' || dow === '0-0,6-6') {
    return `Every weekend day at ${formattedTime} ${tz}`
  }

  // Single weekday number (0-7, where 0 and 7 are Sunday).
  const dowN = Number.parseInt(dow, 10)
  if (Number.isFinite(dowN) && String(dowN) === dow && dowN >= 0 && dowN <= 7) {
    const idx = dowN === 7 ? 0 : dowN
    return `Every ${WEEKDAY_NAMES[idx]} at ${formattedTime} ${tz}`
  }

  return trimmed
}
