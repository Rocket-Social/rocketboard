import type {HeaderCell, TimeScale, TimelineHeaders} from './timeline-types'
import {addDays} from './timeline-math'

function generateDayHeaders(numWeeks: number, dayWidth: number, baseline: Date): TimelineHeaders {
  const totalDays = numWeeks * 7
  const topRow: HeaderCell[] = []
  const bottomRow: HeaderCell[] = []

  let currentMonth = ''
  let monthDayCount = 0

  const dayPrefixes = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

  for (let d = 0; d < totalDays; d++) {
    const date = addDays(baseline, d)
    const dow = date.getUTCDay()
    const isWeekend = dow === 0 || dow === 6
    const dayLabel = `${dayPrefixes[dow]} ${date.getUTCDate()}`
    const month = date.toLocaleDateString('en-US', {month: 'short', year: 'numeric', timeZone: 'UTC'})

    bottomRow.push({isWeekend, key: `day-${d}`, label: dayLabel, width: dayWidth})

    if (month !== currentMonth) {
      if (currentMonth && monthDayCount > 0) {
        topRow.push({key: `month-${currentMonth}`, label: currentMonth, width: monthDayCount * dayWidth})
      }
      currentMonth = month
      monthDayCount = 1
    } else {
      monthDayCount++
    }
  }

  if (currentMonth && monthDayCount > 0) {
    topRow.push({key: `month-${currentMonth}-last`, label: currentMonth, width: monthDayCount * dayWidth})
  }

  return {bottomRow, topRow}
}

function generateWeekHeaders(numWeeks: number, dayWidth: number, baseline: Date): TimelineHeaders {
  const weekWidth = dayWidth * 7
  const topRow: HeaderCell[] = []
  const bottomRow: HeaderCell[] = []

  let currentMonth = ''
  let monthWeekCount = 0

  for (let w = 0; w < numWeeks; w++) {
    const weekStart = addDays(baseline, w * 7)
    const monthLabel = weekStart.toLocaleDateString('en-US', {month: 'short', timeZone: 'UTC'})
    const dayNum = weekStart.getUTCDate()

    bottomRow.push({
      key: `week-${w}`,
      label: `W${w + 1}`,
      sublabel: `${monthLabel} ${dayNum}`,
      width: weekWidth,
    })

    const month = weekStart.toLocaleDateString('en-US', {month: 'short', year: 'numeric', timeZone: 'UTC'})
    if (month !== currentMonth) {
      if (currentMonth && monthWeekCount > 0) {
        topRow.push({key: `month-${currentMonth}`, label: currentMonth, width: monthWeekCount * weekWidth})
      }
      currentMonth = month
      monthWeekCount = 1
    } else {
      monthWeekCount++
    }
  }

  if (currentMonth && monthWeekCount > 0) {
    topRow.push({key: `month-${currentMonth}-last`, label: currentMonth, width: monthWeekCount * weekWidth})
  }

  return {bottomRow, topRow}
}

function generateMonthHeaders(numWeeks: number, dayWidth: number, baseline: Date): TimelineHeaders {
  const totalDays = numWeeks * 7
  const topRow: HeaderCell[] = []
  const bottomRow: HeaderCell[] = []

  let currentMonth = -1
  let currentYear = -1
  let monthStartDay = 0

  let currentQuarter = -1
  let quarterYear = -1
  let quarterStartDay = 0

  for (let d = 0; d <= totalDays; d++) {
    const date = addDays(baseline, d)
    const month = date.getUTCMonth()
    const year = date.getUTCFullYear()
    const quarter = Math.floor(month / 3) + 1

    if ((month !== currentMonth || year !== currentYear) && d > 0) {
      const monthName = new Date(Date.UTC(currentYear, currentMonth, 1))
        .toLocaleDateString('en-US', {month: 'long', timeZone: 'UTC'})
      bottomRow.push({
        key: `month-${currentYear}-${currentMonth}`,
        label: monthName,
        width: (d - monthStartDay) * dayWidth,
      })
      monthStartDay = d
    }

    if ((quarter !== currentQuarter || year !== quarterYear) && d > 0) {
      topRow.push({
        key: `quarter-${quarterYear}-${currentQuarter}`,
        label: `Q${currentQuarter} ${quarterYear}`,
        width: (d - quarterStartDay) * dayWidth,
      })
      quarterStartDay = d
    }

    currentMonth = month
    currentYear = year
    currentQuarter = quarter
    quarterYear = year
  }

  if (totalDays > monthStartDay) {
    const monthName = new Date(Date.UTC(currentYear, currentMonth, 1))
      .toLocaleDateString('en-US', {month: 'long', timeZone: 'UTC'})
    bottomRow.push({
      key: `month-${currentYear}-${currentMonth}-last`,
      label: monthName,
      width: (totalDays - monthStartDay) * dayWidth,
    })
  }
  if (totalDays > quarterStartDay) {
    topRow.push({
      key: `quarter-${quarterYear}-${currentQuarter}-last`,
      label: `Q${currentQuarter} ${quarterYear}`,
      width: (totalDays - quarterStartDay) * dayWidth,
    })
  }

  return {bottomRow, topRow}
}

function generateQuarterHeaders(numWeeks: number, dayWidth: number, baseline: Date): TimelineHeaders {
  const totalDays = numWeeks * 7
  const topRow: HeaderCell[] = []
  const bottomRow: HeaderCell[] = []

  let currentQuarter = -1
  let currentYear = -1
  let quarterStartDay = 0

  let currentHalf = -1
  let halfYear = -1
  let halfStartDay = 0

  for (let d = 0; d <= totalDays; d++) {
    const date = addDays(baseline, d)
    const month = date.getUTCMonth()
    const year = date.getUTCFullYear()
    const quarter = Math.floor(month / 3) + 1
    const half = quarter <= 2 ? 1 : 2

    if ((quarter !== currentQuarter || year !== currentYear) && d > 0) {
      bottomRow.push({
        key: `quarter-${currentYear}-${currentQuarter}`,
        label: `Q${currentQuarter}`,
        sublabel: `${currentYear}`,
        width: (d - quarterStartDay) * dayWidth,
      })
      quarterStartDay = d
    }

    if ((half !== currentHalf || year !== halfYear) && d > 0) {
      topRow.push({
        key: `half-${halfYear}-${currentHalf}`,
        label: `${halfYear}`,
        width: (d - halfStartDay) * dayWidth,
      })
      halfStartDay = d
    }

    currentQuarter = quarter
    currentYear = year
    currentHalf = half
    halfYear = year
  }

  if (totalDays > quarterStartDay) {
    bottomRow.push({
      key: `quarter-${currentYear}-${currentQuarter}-last`,
      label: `Q${currentQuarter}`,
      sublabel: `${currentYear}`,
      width: (totalDays - quarterStartDay) * dayWidth,
    })
  }
  if (totalDays > halfStartDay) {
    topRow.push({
      key: `half-${halfYear}-${currentHalf}-last`,
      label: `${halfYear}`,
      width: (totalDays - halfStartDay) * dayWidth,
    })
  }

  return {bottomRow, topRow}
}

export function generateHeaders(timeScale: TimeScale, numWeeks: number, dayWidth: number, baseline: Date): TimelineHeaders {
  switch (timeScale) {
    case 'day': return generateDayHeaders(numWeeks, dayWidth, baseline)
    case 'week': return generateWeekHeaders(numWeeks, dayWidth, baseline)
    case 'month': return generateMonthHeaders(numWeeks, dayWidth, baseline)
    case 'quarter': return generateQuarterHeaders(numWeeks, dayWidth, baseline)
  }
}
