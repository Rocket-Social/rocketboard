import {FileSearch, MessageSquareText, Search, Sparkles, SquareKanban} from 'lucide-react'

import {Badge} from '../../components/ui/badge'
import {formatCardStatusLabel} from '../cards/card-view-mappers'
import type {ProjectStatusOption} from '../cards/card.types'
import type {ProjectSearchSnapshot} from './project-search.types'
import {parseSnippet} from './snippet-parser'

type ProjectSearchPanelProps = {
  errorMessage: string | null
  isPending: boolean
  onOpenCard: (cardId: string) => void
  query: string
  results: ProjectSearchSnapshot
  statusOptions: ProjectStatusOption[]
}

export function ProjectSearchPanel({
  errorMessage,
  isPending,
  onOpenCard,
  query,
  results,
  statusOptions,
}: ProjectSearchPanelProps) {
  if (!query) {
    return null
  }

  if (errorMessage) {
    return (
      <div className='mb-4 rounded-2xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error shadow-panel'>
        Search could not be completed right now. {errorMessage}
      </div>
    )
  }

  if (isPending) {
    return (
      <div className='mb-4 flex items-center gap-2 rounded-2xl border border-border-subtle bg-surface-elevated px-4 py-3 text-sm text-text-medium shadow-panel'>
        <Search className='h-4 w-4 animate-pulse'/>
        Searching for <span className='font-medium text-text-strong'>"{query}"</span>.
      </div>
    )
  }

  const totalMatches = results.cards.length + results.documents.length

  if (totalMatches === 0) {
    return (
      <div className='mb-4 rounded-2xl border border-border-subtle bg-surface-elevated px-4 py-3 text-sm text-text-medium shadow-panel'>
        No project content matched <span className='font-medium text-text-strong'>"{query}"</span>.
      </div>
    )
  }

  return (
    <section className='mb-4 rounded-[28px] border border-border-subtle bg-surface-elevated p-4 shadow-panel'>
      <div className='flex flex-wrap items-center gap-2 text-sm text-text-medium'>
        <Sparkles className='h-4 w-4 text-primary'/>
        Found <span className='font-mono text-text-strong'>{totalMatches}</span> matches for{' '}
        <span className='font-medium text-text-strong'>"{query}"</span>.
        {results.cards.length > 0 ? <Badge variant='count'>{results.cards.length} cards</Badge> : null}
        {results.documents.length > 0 ? <Badge variant='count'>{results.documents.length} document hits</Badge> : null}
      </div>

      <div className='mt-4 grid gap-3 lg:grid-cols-2'>
        {results.cards.map((card) => (
          <button
            className='rounded-2xl border border-border-subtle bg-surface-base p-4 text-left transition-colors hover:border-primary hover:bg-canvas-accent'
            key={card.cardId}
            onClick={() => onOpenCard(card.cardId)}
            type='button'
          >
            <div className='flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted'>
              <SquareKanban className='h-3.5 w-3.5'/>
              {formatCardStatusLabel(card.statusOptionId, statusOptions)}
              {card.cardRef ? (
                <span className='rounded-full bg-canvas-accent px-2 py-0.5 font-mono text-[11px] normal-case tracking-normal text-text-muted'>
                  {card.cardRef}
                </span>
              ) : (
                <span className='rounded-full bg-canvas-accent px-2 py-0.5 text-[11px] normal-case text-text-medium'>
                  {card.priorityOptionId ? 'Priority' : '—'}
                </span>
              )}
            </div>
            <h3 className='mt-2 text-sm font-semibold text-text-strong'>{card.title}</h3>
            <p className='mt-2 text-sm leading-relaxed text-text-medium'>{parseSnippet(card.snippet)}</p>
          </button>
        ))}

        {results.documents.map((documentHit, index) => (
          <div
            className='rounded-2xl border border-border-subtle bg-surface-base p-4'
            key={`${documentHit.documentId}-${documentHit.source}-${index}`}
          >
            <div className='flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted'>
              {documentHit.source === 'comment' ? <MessageSquareText className='h-3.5 w-3.5'/> : <FileSearch className='h-3.5 w-3.5'/>}
              {documentHit.source === 'comment' ? 'Document comment' : 'Document'}
            </div>
            <h3 className='mt-2 text-sm font-semibold text-text-strong'>{documentHit.title}</h3>
            <p className='mt-2 text-sm leading-relaxed text-text-medium'>{parseSnippet(documentHit.snippet)}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
