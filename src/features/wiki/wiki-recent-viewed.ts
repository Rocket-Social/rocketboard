// ============================================================
// Recently viewed wiki pages — localStorage utility
// ============================================================

export type RecentViewedEntry = {
  icon: string | null
  fullPath: string
  id: string
  title: string
  viewedAt: number
}

const MAX_ENTRIES = 5
const STORAGE_PREFIX = 'wiki-recent-viewed-'

function getStorageKey(orgId: string): string {
  return `${STORAGE_PREFIX}${orgId}`
}

function readEntries(orgId: string): RecentViewedEntry[] {
  try {
    const raw = localStorage.getItem(getStorageKey(orgId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Normalize older slug-only entries so existing localStorage keeps working.
    return parsed.flatMap((entry): RecentViewedEntry[] => {
      if (typeof entry !== 'object' || entry === null) return []

      const candidate = entry as {
        fullPath?: unknown
        icon?: unknown
        id?: unknown
        slug?: unknown
        title?: unknown
        viewedAt?: unknown
      }

      const fullPath =
        typeof candidate.fullPath === 'string'
          ? candidate.fullPath
          : typeof candidate.slug === 'string'
            ? candidate.slug
            : null

      if (
        typeof candidate.id !== 'string' ||
        fullPath === null ||
        typeof candidate.title !== 'string' ||
        typeof candidate.viewedAt !== 'number'
      ) {
        return []
      }

      return [{
        fullPath,
        icon: typeof candidate.icon === 'string' ? candidate.icon : null,
        id: candidate.id,
        title: candidate.title,
        viewedAt: candidate.viewedAt,
      }]
    })
  } catch {
    return []
  }
}

function writeEntries(orgId: string, entries: RecentViewedEntry[]): void {
  try {
    localStorage.setItem(getStorageKey(orgId), JSON.stringify(entries))
  } catch {
    // Quota exceeded or unavailable — silently fail
  }
}

export function addRecentView(
  orgId: string,
  page: {fullPath: string; icon: string | null; id: string; title: string},
): void {
  const entries = readEntries(orgId)
  // Remove existing entry for this page (will re-add at front)
  const filtered = entries.filter((e) => e.id !== page.id)
  const newEntry: RecentViewedEntry = {
    fullPath: page.fullPath,
    icon: page.icon,
    id: page.id,
    title: page.title,
    viewedAt: Date.now(),
  }
  // Prepend and cap
  const updated = [newEntry, ...filtered].slice(0, MAX_ENTRIES)
  writeEntries(orgId, updated)
}

export function getRecentViews(
  orgId: string,
  excludeIds: string[] = [],
): RecentViewedEntry[] {
  const entries = readEntries(orgId)
  if (excludeIds.length === 0) return entries
  return entries.filter((e) => !excludeIds.includes(e.id))
}

export function pruneRecentViews(
  orgId: string,
  allowedIds: Iterable<string>,
): RecentViewedEntry[] {
  const allowedIdSet = new Set(allowedIds)
  const entries = readEntries(orgId)
  const filtered = entries.filter((entry) => allowedIdSet.has(entry.id))

  if (filtered.length !== entries.length) {
    writeEntries(orgId, filtered)
  }

  return filtered
}

export function removeRecentViews(
  orgId: string,
  removedIds: Iterable<string>,
): RecentViewedEntry[] {
  const removedIdSet = new Set(removedIds)
  if (removedIdSet.size === 0) {
    return readEntries(orgId)
  }

  const entries = readEntries(orgId)
  const filtered = entries.filter((entry) => !removedIdSet.has(entry.id))

  if (filtered.length !== entries.length) {
    writeEntries(orgId, filtered)
  }

  return filtered
}

export function clearRecentViews(orgId: string): void {
  try {
    localStorage.removeItem(getStorageKey(orgId))
  } catch {
    // Silently fail
  }
}
