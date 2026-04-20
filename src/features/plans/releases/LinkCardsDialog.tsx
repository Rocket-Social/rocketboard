import {useQuery} from '@tanstack/react-query'
import {Check, Search} from 'lucide-react'
import {useMemo, useState} from 'react'

import {Button} from '../../../components/ui/button'
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '../../../components/ui/dialog'
import {useToast} from '../../../components/ui/toast'
import {getErrorMessage} from '../../../platform/data/rpc-adapter'
import {useLinkCardsToReleaseMutation, workspaceReleasePickerCardsQueryOptions} from '../plan.queries'
import type {ReleasePickerCard} from '../plan.types'

type LinkCardsDialogProps = {
  onClose: () => void
  planViewId: string
  releaseId: string
  workspaceId: string
}

type ProjectGroup = {
  cards: ReleasePickerCard[]
  projectId: string
  projectName: string
}

export function LinkCardsDialog({onClose, planViewId, releaseId, workspaceId}: LinkCardsDialogProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const pickerQuery = useQuery(workspaceReleasePickerCardsQueryOptions(workspaceId, releaseId))
  const linkCardsMutation = useLinkCardsToReleaseMutation(planViewId, workspaceId)
  const {toast} = useToast()

  const projectGroups = useMemo(() => {
    const map = new Map<string, ProjectGroup>()

    for (const card of pickerQuery.data ?? []) {
      const matchesSearch = !searchTerm
        || card.title.toLowerCase().includes(searchTerm.toLowerCase())
        || card.projectName.toLowerCase().includes(searchTerm.toLowerCase())

      if (!matchesSearch) continue

      const existing = map.get(card.projectId) ?? {
        cards: [],
        projectId: card.projectId,
        projectName: card.projectName,
      }
      existing.cards.push(card)
      map.set(card.projectId, existing)
    }

    return [...map.values()].sort((left, right) => left.projectName.localeCompare(right.projectName))
  }, [pickerQuery.data, searchTerm])

  const handleSubmit = async () => {
    if (selectedIds.size === 0 || linkCardsMutation.isPending) {
      return
    }

    try {
      await linkCardsMutation.mutateAsync({
        cardIds: [...selectedIds],
        releaseId,
      })
      onClose()
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: 'Couldn’t link cards',
        variant: 'error',
      })
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className='flex max-h-[84vh] w-[min(52rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[28px] bg-surface-base'>
        <DialogHeader className='border-b border-border-subtle px-6 py-4'>
          <DialogTitle>Link cards to release</DialogTitle>
          <DialogDescription className='mt-1'>Pull work from any project in this workspace into the release record.</DialogDescription>
        </DialogHeader>

        <div className='border-b border-border-subtle px-6 py-3'>
          <div className='relative'>
            <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted'/>
            <input
              autoFocus
              className='h-10 w-full rounded-xl border border-border-subtle bg-surface-elevated pl-10 pr-4 text-sm text-text-strong outline-none transition-all placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary-soft'
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder='Search by card or project name...'
              value={searchTerm}
            />
          </div>
        </div>

        <div className='flex-1 overflow-y-auto px-6 py-4'>
          {pickerQuery.isPending ? (
            <div className='space-y-3'>
              {Array.from({length: 6}).map((_, index) => (
                <div className='h-12 animate-pulse rounded-2xl bg-border-subtle/30' key={index}/>
              ))}
            </div>
          ) : projectGroups.length === 0 ? (
            <div className='py-16 text-center text-sm text-text-muted'>No cards matched this search.</div>
          ) : (
            <div className='space-y-6'>
              {projectGroups.map((group) => (
                <section key={group.projectId}>
                  <div className='mb-2 flex items-center justify-between'>
                    <h3 className='text-sm font-medium text-text-strong'>{group.projectName}</h3>
                    <span className='font-mono text-[11px] text-text-muted'>{group.cards.length} cards</span>
                  </div>
                  <div className='space-y-2'>
                    {group.cards.map((card) => {
                      const selected = selectedIds.has(card.cardId)
                      return (
                        <button
                          className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors ${
                            card.linked
                              ? 'border-border-subtle bg-surface-muted text-text-muted'
                              : selected
                                ? 'border-primary bg-primary/5'
                                : 'border-border-subtle bg-surface-elevated hover:border-primary/30'
                          }`}
                          disabled={card.linked}
                          key={card.cardId}
                          onClick={() => {
                            setSelectedIds((current) => {
                              const next = new Set(current)
                              if (next.has(card.cardId)) next.delete(card.cardId)
                              else next.add(card.cardId)
                              return next
                            })
                          }}
                          type='button'
                        >
                          <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${selected ? 'border-primary bg-primary text-white' : 'border-border-subtle bg-surface-base'}`}>
                            {selected ? <Check className='h-3.5 w-3.5'/> : null}
                          </div>
                          <div className='min-w-0 flex-1'>
                            <p className='truncate text-sm font-medium text-text-strong'>{card.title}</p>
                            <p className='truncate text-xs text-text-muted'>{card.statusLabel} · {card.assigneeName}</p>
                          </div>
                          {card.linked ? (
                            <span className='rounded-full bg-canvas-accent px-2 py-1 text-[11px] font-medium text-text-muted'>Linked</span>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className='flex items-center justify-between border-t border-border-subtle px-6 py-4'>
          <span className='text-sm text-text-muted'>{selectedIds.size} selected</span>
          <div className='flex items-center gap-2'>
            <Button onClick={onClose} variant='ghost'>Cancel</Button>
            <Button disabled={selectedIds.size === 0 || linkCardsMutation.isPending} onClick={() => void handleSubmit()} variant='primary'>
              {linkCardsMutation.isPending ? 'Linking…' : 'Link cards'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
