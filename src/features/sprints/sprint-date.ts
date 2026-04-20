import type {ProjectSprintRecord} from './sprint.types'

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/
const msPerDay = 24 * 60 * 60 * 1000

export type CreateSprintDateDefaults = {
  endDate: string
  startDate: string
}

type SprintWithEndDate = ProjectSprintRecord & {endDate: string}
type FullyDatedSprint = ProjectSprintRecord & {endDate: string; startDate: string}

function padDateNumber(value: number) {
  return String(value).padStart(2, '0')
}

function isDateOnly(value: string | null): value is string {
  return Boolean(value && dateOnlyPattern.test(value))
}

function dateOnlyToUtcDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function formatUtcDateOnly(value: Date) {
  return `${value.getUTCFullYear()}-${padDateNumber(value.getUTCMonth() + 1)}-${padDateNumber(value.getUTCDate())}`
}

function addDays(value: string, days: number) {
  const date = dateOnlyToUtcDate(value)
  date.setUTCDate(date.getUTCDate() + days)
  return formatUtcDateOnly(date)
}

function diffDays(startDate: string, endDate: string) {
  return Math.round((dateOnlyToUtcDate(endDate).getTime() - dateOnlyToUtcDate(startDate).getTime()) / msPerDay)
}

function todayStr(today: Date) {
  return `${today.getFullYear()}-${padDateNumber(today.getMonth() + 1)}-${padDateNumber(today.getDate())}`
}

function compareCreatedAtDesc(left: ProjectSprintRecord, right: ProjectSprintRecord) {
  return right.createdAt.localeCompare(left.createdAt)
}

function pickLatestFullyDatedSprint(projectSprints: ProjectSprintRecord[]): FullyDatedSprint | null {
  const fullyDatedSprints = projectSprints.filter((sprint): sprint is FullyDatedSprint => (
    isDateOnly(sprint.startDate) && isDateOnly(sprint.endDate)
  ))

  if (fullyDatedSprints.length === 0) {
    return null
  }

  return fullyDatedSprints.sort((left, right) => (
    right.endDate.localeCompare(left.endDate)
    || right.startDate.localeCompare(left.startDate)
    || compareCreatedAtDesc(left, right)
  ))[0] ?? null
}

function pickLatestSprintWithEndDate(projectSprints: ProjectSprintRecord[]): SprintWithEndDate | null {
  const sprintsWithEndDate = projectSprints.filter((sprint): sprint is SprintWithEndDate => isDateOnly(sprint.endDate))

  if (sprintsWithEndDate.length === 0) {
    return null
  }

  return sprintsWithEndDate.sort((left, right) => (
    right.endDate.localeCompare(left.endDate)
    || compareCreatedAtDesc(left, right)
  ))[0] ?? null
}

function roundUpToWeekCadence(durationDays: number) {
  return Math.ceil(Math.max(1, durationDays) / 7) * 7
}

export function getCreateSprintDateDefaults(
  projectSprints: ProjectSprintRecord[],
  today = new Date(),
): CreateSprintDateDefaults {
  const templateSprint = pickLatestFullyDatedSprint(projectSprints)

  if (templateSprint) {
    const durationDays = Math.max(0, diffDays(templateSprint.startDate, templateSprint.endDate))
    const cadenceDays = roundUpToWeekCadence(durationDays)

    return {
      endDate: addDays(templateSprint.endDate, cadenceDays),
      startDate: addDays(templateSprint.startDate, cadenceDays),
    }
  }

  const latestSprintWithEndDate = pickLatestSprintWithEndDate(projectSprints)

  if (latestSprintWithEndDate) {
    const startDate = addDays(latestSprintWithEndDate.endDate, 1)
    return {
      endDate: addDays(startDate, 14),
      startDate,
    }
  }

  const startDate = todayStr(today)
  return {
    endDate: addDays(startDate, 14),
    startDate,
  }
}
