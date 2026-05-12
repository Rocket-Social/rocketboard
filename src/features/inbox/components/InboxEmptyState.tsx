import {Inbox} from 'lucide-react'

import type {InboxTabId} from '../inbox.types'

const COPY: Record<InboxTabId, {description: string; title: string}> = {
  all: {
    description: 'You\'ll see notifications here as agents act on your work, teammates assign you cards, or @mention you in comments.',
    title: 'Nothing yet.',
  },
  inbox: {
    description: 'You\'re all caught up. New notifications will land here.',
    title: 'Nothing to catch up on.',
  },
}

export function InboxEmptyState({tab}: {tab: InboxTabId}) {
  const copy = COPY[tab]
  return (
    <div className='flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-subtle bg-surface-elevated px-6 py-16 text-center'>
      <Inbox aria-hidden='true' className='h-8 w-8 text-text-muted'/>
      <h3 className='text-base font-semibold text-text-strong'>{copy.title}</h3>
      <p className='max-w-md text-sm text-text-muted'>{copy.description}</p>
    </div>
  )
}
