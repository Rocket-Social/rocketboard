export type TimeScale = 'day' | 'month' | 'quarter' | 'week'

export type HeaderCell = {
  isWeekend?: boolean
  key: string
  label: string
  sublabel?: string
  width: number
}

export type TimelineHeaders = {
  bottomRow: HeaderCell[]
  topRow: HeaderCell[]
}
