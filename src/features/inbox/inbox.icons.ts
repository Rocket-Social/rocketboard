// Inbox kind → lucide icon mapping. Kept in a separate module so the
// initial bundle (CanonicalSidebar's unread-badge path + SignedInAppFrame's
// realtime hook) doesn't pull in lucide icons that are only rendered on
// the lazy `/inbox` page.

import {
  AlertTriangle,
  AtSign,
  Bell,
  Bot,
  CheckCircle2,
  Coins,
  MessageSquare,
  OctagonAlert,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'

import type {NotificationKind} from './inbox.types'

export const NOTIFICATION_KIND_ICON: Record<NotificationKind, LucideIcon> = {
  assignment: UserPlus,
  comment_on_followed_card: MessageSquare,
  comment_on_owned_card: MessageSquare,
  drift_nudge: Sparkles,
  mention: AtSign,
  org_budget_capped: OctagonAlert,
  org_budget_warning: AlertTriangle,
  org_dispatch_quota_exceeded: OctagonAlert,
  org_dispatch_quota_warning: AlertTriangle,
  run_awaiting_approval: Bot,
  run_completed: CheckCircle2,
}

export const FALLBACK_NOTIFICATION_ICON: LucideIcon = Bell

export const BUDGET_NOTIFICATION_ICON: LucideIcon = Coins

export function getNotificationIcon(kind: NotificationKind): LucideIcon {
  return NOTIFICATION_KIND_ICON[kind] ?? FALLBACK_NOTIFICATION_ICON
}
