import type {TimeScale} from './timeline-types'

export function getDayWidth(timeScale: TimeScale): number {
  switch (timeScale) {
    case 'day': return 40
    case 'week': return 17
    case 'month': return 5
    case 'quarter': return 2
  }
}

export function getNumWeeks(timeScale: TimeScale): number {
  switch (timeScale) {
    case 'day': return 5
    case 'week': return 8
    case 'month': return 26
    case 'quarter': return 52
  }
}
