import {useQuery} from '@tanstack/react-query'
import {Link2, Unlink2} from 'lucide-react'
import {useMemo, useState} from 'react'

import {Button} from '../../../components/ui/button'
import {useToast} from '../../../components/ui/toast'
import {getErrorMessage} from '../../../platform/data/rpc-adapter'
import {planReleaseLinkedCardsQueryOptions, useUnlinkCardFromReleaseMutation} from '../plan.queries'
import type {ReleaseLinkedCard} from '../plan.types'
import {LinkCardsDialog} from './LinkCardsDialog'

type ReleaseLinkedCardsPanelProps = {
  planViewId: string
  releaseId: string
  workspaceId: string
}

type ProjectGroup = {
  cards: ReleaseLinkedCard[]
  projectId: string
  projectName: string
}

export function ReleaseLinkedCardsPanel({planViewId, releaseId, workspaceId}: ReleaseLinkedCardsPanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const linkedCardsQuery = useQuery(planReleaseLinkedCardsQueryOptions(releaseId))
  const unlinkMutation = useUnlinkCardFromReleaseMutation(planViewId, workspaceId)
  const {toast} = useToast()

  const projectGroups = useMemo(() => {
    const map = new Map<string, ProjectGroup>()

    for (const card of linkedCardsQuery.data ?? []) {
      const existing = map.get(card.projectId) ?? {
        cards: [],
        projectId: card.projectId,
        projectName: card.projectName,
      }
      existing.cards.push(card)
      map.set(card.projectId, existing)
    }

    return [...map.values()].sort((left, right) => left.projectName.localeCompare(right.projectName))
  }, [linkedCardsQuery.data])

  const handleUnlink = async (cardId: string) => {
    try {
      await unlinkMutation.mutateAsync({cardId, releaseId})
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: 'Couldn’t unlink card',
        variant: 'error',
      })
    }
  }

  return (
    <>
      <div className='rounded-3xl border border-border-subtle bg-surface-base p-4'>
        <div className='flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3'>
          <div>
            <p className='text-sm font-medium text-text-strong'>Linked Cards</p>
            <p className='mt-1 text-xs text-text-muted'>See the feature-level scope that shipped in this release.</p>
          </div>
          <Button onClick={() => setDialogOpen(true)} size='compact' variant='secondary'>
            <Link2 className='h-3.5 w-3.5'/>
            Link cards
          </Button>
        </div>

        {linkedCardsQuery.isPending ? (
          <div className='mt-4 space-y-3'>
            {Array.from({length: 4}).map((_, index) => (
              <div className='h-12 animate-pulse rounded-2xl bg-border-subtle/30' key={index}/>
            ))}
          </div>
        ) : projectGroups.length === 0 ? (
          <div className='py-10 text-center'>
            <p className='text-sm text-text-medium'>No cards linked yet.</p>
            <p className='mt-1 text-xs text-text-muted'>Link shipped work across projects to preserve release scope.</p>
          </div>
        ) : (
          <div className='mt-4 space-y-6'>
            {projectGroups.map((group) => (
              <section key={group.projectId}>
                <div className='mb-2 flex items-center justify-between'>
                  <h3 className='text-sm font-medium text-text-strong'>{group.projectName}</h3>
                  <span className='font-mono text-[11px] text-text-muted'>{group.cards.length} linked</span>
                </div>
                <div className='space-y-2'>
                  {group.cards.map((card) => (
                    <div className='flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-elevated px-3 py-3' key={card.cardId}>
                      <div className='min-w-0 flex-1'>
                        <p className='truncate text-sm font-medium text-text-strong'>{card.title}</p>
                        <p className='truncate text-xs text-text-muted'>{card.statusLabel} · {card.assigneeName}</p>
                      </div>
                      <Button
                        onClick={() => void handleUnlink(card.cardId)}
                        size='compact'
                        variant='ghost'
                      >
                        <Unlink2 className='h-3.5 w-3.5'/>
                        Unlink
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {dialogOpen ? (
        <LinkCardsDialog
          onClose={() => setDialogOpen(false)}
          planViewId={planViewId}
          releaseId={releaseId}
          workspaceId={workspaceId}
        />
      ) : null}
    </>
  )
}
