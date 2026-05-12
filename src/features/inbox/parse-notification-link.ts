import {isUuid} from './inbox.types'

// `notification.link` is service-role-written by the canonical
// `insert_notification` RPC, so it isn't user input. The inbox UI still
// constrains navigation to a known set of targets — defends against future
// link schemes that don't yet have a handler, and makes the row safer to
// click even if a sender mints something unexpected.
//
// Two known schemes today:
//   1. `card:<uuid>` — opens the linked card.
//   2. `/<allowlisted-internal-path>` — navigates within the app.
//
// Anything else falls through to `null`. The row still renders without a
// click-to-open affordance.

export type NavigationTarget =
  | {type: 'card'; cardId: string}
  | {type: 'internal-path'; path: string}

const ALLOWED_INTERNAL_PATH_PREFIXES = [
  '/ai-agents',
  '/inbox',
  '/my-notes',
  '/wiki',
] as const

export function parseNotificationLink(link: string | null | undefined): NavigationTarget | null {
  if (!link) return null

  if (link.startsWith('card:')) {
    const cardId = link.slice('card:'.length)
    return isUuid(cardId) ? {type: 'card', cardId} : null
  }

  if (link.startsWith('/')) {
    const matches = ALLOWED_INTERNAL_PATH_PREFIXES.some(
      (prefix) => link === prefix || link.startsWith(`${prefix}/`),
    )
    return matches ? {type: 'internal-path', path: link} : null
  }

  return null
}
