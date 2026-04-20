export type WeekStartsOn = 'monday' | 'sunday'

export function normalizeWeekStartsOn(value: string | null | undefined): WeekStartsOn | null {
  if (value === 'monday' || value === 'sunday') {
    return value
  }

  return null
}

export function getBrowserWeekStartsOn(): WeekStartsOn {
  if (typeof Intl === 'undefined') {
    return 'sunday'
  }

  try {
    const localeName =
      typeof navigator !== 'undefined'
        ? navigator.languages?.[0] ?? navigator.language ?? 'en-US'
        : 'en-US'
    const locale = new Intl.Locale(localeName) as Intl.Locale & {
      getWeekInfo?: () => {firstDay?: number}
      weekInfo?: {firstDay?: number}
    }
    const weekInfo = typeof locale.getWeekInfo === 'function' ? locale.getWeekInfo() : locale.weekInfo
    const firstDay = weekInfo?.firstDay

    if (firstDay === 1) {
      return 'monday'
    }

    if (firstDay === 7 || firstDay === 0) {
      return 'sunday'
    }
  } catch {
    // Fall back below.
  }

  return 'sunday'
}

export function resolveWeekStartsOn(value: string | null | undefined): WeekStartsOn {
  return normalizeWeekStartsOn(value) ?? getBrowserWeekStartsOn()
}

export function startOfWeek(date: Date, weekStartsOn: WeekStartsOn): Date {
  const nextDate = new Date(date)
  const day = nextDate.getDay()
  const diff = weekStartsOn === 'sunday'
    ? -day
    : day === 0
      ? -6
      : 1 - day

  nextDate.setDate(nextDate.getDate() + diff)
  nextDate.setHours(0, 0, 0, 0)
  return nextDate
}

export function getMonthGridOffset(year: number, month: number, weekStartsOn: WeekStartsOn) {
  const day = new Date(year, month, 1).getDay()

  if (weekStartsOn === 'sunday') {
    return day
  }

  return day === 0 ? 6 : day - 1
}

export function getWeekdayLabels(weekStartsOn: WeekStartsOn) {
  return weekStartsOn === 'sunday'
    ? ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
    : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
}
