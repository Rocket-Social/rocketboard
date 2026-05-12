import type { PlanRecord } from '../plans/plan.types'
import type { InitiativeRecord } from '../initiatives/initiative.types'
import type { WorkspaceProjectSummary } from '../projects/project-shell.types'

export type SidebarItemType = 'project' | 'plan' | 'initiative'

export type SidebarItem =
  | { type: 'project'; id: string; name: string; data: WorkspaceProjectSummary }
  | { type: 'plan'; id: string; name: string; data: PlanRecord }
  | { type: 'initiative'; id: string; name: string; data: InitiativeRecord }

export type SidebarOrderEntry = {
  id: string
  type: SidebarItemType
}

/**
 * Merges projects, plans, and initiatives into a single ordered list.
 * - Items present in savedOrder appear in that order
 * - Items not in savedOrder are appended at the bottom in creation order
 * - Entries in savedOrder that no longer exist in data are silently dropped
 */
export function mergeSidebarItems(
  savedOrder: SidebarOrderEntry[],
  projects: WorkspaceProjectSummary[],
  plans: PlanRecord[],
  initiatives: InitiativeRecord[],
): SidebarItem[] {
  const allItems = new Map<string, SidebarItem>()

  for (const project of projects) {
    allItems.set(`project:${project.id}`, {
      type: 'project',
      id: project.id,
      name: project.name,
      data: project,
    })
  }

  for (const plan of plans) {
    allItems.set(`plan:${plan.id}`, {
      type: 'plan',
      id: plan.id,
      name: plan.name,
      data: plan,
    })
  }

  for (const initiative of initiatives) {
    allItems.set(`initiative:${initiative.id}`, {
      type: 'initiative',
      id: initiative.id,
      name: initiative.name,
      data: initiative,
    })
  }

  const result: SidebarItem[] = []
  const placed = new Set<string>()

  // Place items that are in the saved order
  for (const entry of savedOrder) {
    const key = `${entry.type}:${entry.id}`
    const item = allItems.get(key)
    if (item) {
      result.push(item)
      placed.add(key)
    }
  }

  // Append items not in saved order (newly created) at the bottom
  for (const [key, item] of allItems) {
    if (!placed.has(key)) {
      result.push(item)
    }
  }

  return result
}

/**
 * Converts a SidebarItem array to the order entry format for persistence.
 */
export function toSidebarOrderEntries(items: SidebarItem[]): SidebarOrderEntry[] {
  return items.map((item) => ({ type: item.type, id: item.id }))
}
