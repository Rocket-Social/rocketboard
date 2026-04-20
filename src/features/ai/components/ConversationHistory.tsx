import { Clock, MessageSquare } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu'
import type { AiConversation } from '../ai.types'

type ConversationHistoryProps = {
  conversations: AiConversation[]
  currentConversationId: string | null
  onSelect: (conversationId: string) => void
}

function groupByDate(conversations: AiConversation[]) {
  const groups: { conversations: AiConversation[]; label: string }[] = []
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86_400_000)
  const weekAgo = new Date(today.getTime() - 7 * 86_400_000)

  const todayItems: AiConversation[] = []
  const yesterdayItems: AiConversation[] = []
  const weekItems: AiConversation[] = []
  const olderItems: AiConversation[] = []

  for (const conv of conversations) {
    const d = new Date(conv.updatedAt)
    if (d >= today) todayItems.push(conv)
    else if (d >= yesterday) yesterdayItems.push(conv)
    else if (d >= weekAgo) weekItems.push(conv)
    else olderItems.push(conv)
  }

  if (todayItems.length > 0) groups.push({ conversations: todayItems, label: 'Today' })
  if (yesterdayItems.length > 0) groups.push({ conversations: yesterdayItems, label: 'Yesterday' })
  if (weekItems.length > 0) groups.push({ conversations: weekItems, label: 'This week' })
  if (olderItems.length > 0) groups.push({ conversations: olderItems, label: 'Older' })

  return groups
}

export function ConversationHistory({
  conversations,
  currentConversationId,
  onSelect,
}: ConversationHistoryProps) {
  const groups = groupByDate(conversations)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="rounded-xl p-2 text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong"
          title="Conversation history"
          type="button"
        >
          <Clock className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-text-muted">
            No previous conversations
          </div>
        ) : (
          groups.map((group, gi) => (
            <div key={group.label}>
              {gi > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wider">
                {group.label}
              </DropdownMenuLabel>
              {group.conversations.map((conv) => {
                const isCurrent = conv.id === currentConversationId
                return (
                  <DropdownMenuItem
                    className={isCurrent ? 'bg-canvas-accent' : ''}
                    key={conv.id}
                    onClick={() => onSelect(conv.id)}
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {conv.title ?? 'Untitled conversation'}
                    </span>
                  </DropdownMenuItem>
                )
              })}
            </div>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
