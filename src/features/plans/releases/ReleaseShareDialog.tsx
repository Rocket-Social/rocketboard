import {useQuery} from '@tanstack/react-query'
import {Copy, Globe2, Link2, RotateCcw} from 'lucide-react'
import {useMemo, useState} from 'react'

import {Button} from '../../../components/ui/button'
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '../../../components/ui/dialog'
import {useToast} from '../../../components/ui/toast'
import {getErrorMessage} from '../../../platform/data/rpc-adapter'
import {
  releaseShareQueryOptions,
  useCreateReleaseShareLinkMutation,
  useRevokeReleaseShareLinkMutation,
} from '../plan.queries'

type ReleaseShareDialogProps = {
  onClose: () => void
  planViewId: string
}

export function ReleaseShareDialog({onClose, planViewId}: ReleaseShareDialogProps) {
  const shareQuery = useQuery(releaseShareQueryOptions(planViewId))
  const createShareMutation = useCreateReleaseShareLinkMutation(planViewId)
  const revokeShareMutation = useRevokeReleaseShareLinkMutation(planViewId)
  const [copied, setCopied] = useState(false)
  const {toast} = useToast()

  const shareUrl = useMemo(() => {
    if (!shareQuery.data?.shareToken || typeof window === 'undefined') return ''
    return `${window.location.origin}/shared/releases/${shareQuery.data.shareToken}`
  }, [shareQuery.data?.shareToken])

  const handleCopy = async () => {
    if (!shareUrl || !navigator.clipboard?.writeText) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const handleCreate = async () => {
    try {
      await createShareMutation.mutateAsync()
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: 'Couldn’t create share link',
        variant: 'error',
      })
    }
  }

  const handleRevoke = async () => {
    try {
      await revokeShareMutation.mutateAsync()
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: 'Couldn’t revoke share link',
        variant: 'error',
      })
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className='w-[min(32rem,calc(100vw-2rem))] rounded-[28px] bg-surface-base'>
        <DialogHeader className='px-6 py-5'>
          <p className='font-mono text-xs uppercase tracking-[0.24em] text-text-muted'>Share Release View</p>
          <DialogTitle className='mt-1 font-display text-xl'>Publish a read-only release board.</DialogTitle>
          <DialogDescription className='mt-2'>Anyone with the link can view the release timeline and release table without signing in.</DialogDescription>
        </DialogHeader>

        <div className='space-y-4 px-6 py-5'>
          <div className='rounded-3xl border border-border-subtle bg-surface-elevated p-4'>
            <div className='flex items-center gap-3'>
              <div className='rounded-full bg-primary/10 p-2 text-primary'>
                <Globe2 className='h-4 w-4'/>
              </div>
              <div>
                <p className='text-sm font-medium text-text-strong'>Public release board</p>
                <p className='text-xs text-text-muted'>Share one stable link or revoke it at any time.</p>
              </div>
            </div>

            <div className='mt-4 rounded-2xl border border-border-subtle bg-surface-base px-3 py-3'>
              {shareQuery.isPending ? (
                <div className='h-5 animate-pulse rounded bg-border-subtle/30'/>
              ) : shareUrl ? (
                <p className='break-all font-mono text-xs text-text-medium'>{shareUrl}</p>
              ) : (
                <p className='text-sm text-text-muted'>No public link yet.</p>
              )}
            </div>
          </div>

          <div className='flex flex-wrap justify-end gap-2'>
            {shareUrl ? (
              <>
                <Button onClick={() => void handleCopy()} variant='secondary'>
                  <Copy className='h-4 w-4'/>
                  {copied ? 'Copied!' : 'Copy link'}
                </Button>
                <Button onClick={() => void handleCreate()} variant='secondary'>
                  <RotateCcw className='h-4 w-4'/>
                  Regenerate
                </Button>
                <Button onClick={() => void handleRevoke()} variant='ghost'>
                  Revoke
                </Button>
              </>
            ) : (
              <Button disabled={createShareMutation.isPending} onClick={() => void handleCreate()} variant='primary'>
                <Link2 className='h-4 w-4'/>
                {createShareMutation.isPending ? 'Creating…' : 'Create public link'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
