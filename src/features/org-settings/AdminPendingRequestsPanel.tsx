import {Check, X} from 'lucide-react'
import {useMemo, useState} from 'react'

import {Badge} from '../../components/ui/badge'
import {Button} from '../../components/ui/button'
import {ConfirmDialog} from '../../components/ui/confirm-dialog'
import {useToast} from '../../components/ui/toast'
import {useConfirmDialog} from '../../hooks/useConfirmDialog'
import {getErrorMessage} from '../../platform/data/rpc-adapter'

import type {OrgInviteRequest} from './org-settings.types'
import {
  useApproveOrgInviteRequestMutation,
  useDeclineOrgInviteRequestMutation,
  useInviteRequestsQuery,
} from './org-settings.queries'

function formatTimeAgo(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatRoleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

type AdminPendingRequestsPanelProps = {
  currentUserName: string
  enabled: boolean
  organizationId: string
  organizationName: string
}

export function AdminPendingRequestsPanel({
  currentUserName,
  enabled,
  organizationId,
  organizationName,
}: AdminPendingRequestsPanelProps) {
  const requestsQuery = useInviteRequestsQuery(organizationId, {enabled})
  const approveMutation = useApproveOrgInviteRequestMutation(organizationId)
  const declineMutation = useDeclineOrgInviteRequestMutation(organizationId)
  const {toast} = useToast()
  const {confirm, confirmDialogProps} = useConfirmDialog()
  const [actingRequestId, setActingRequestId] = useState<string | null>(null)

  const requests = useMemo(() => requestsQuery.data ?? [], [requestsQuery.data])

  if (!enabled || requestsQuery.isPending || requests.length === 0) {
    return null
  }

  const handleApprove = (request: OrgInviteRequest) => {
    setActingRequestId(request.id)
    approveMutation.mutate(
      {
        email: request.email,
        inviterName: currentUserName,
        organizationId,
        organizationName,
        requestId: request.id,
        role: request.requestedRole,
      },
      {
        onError: (error) => {
          toast({
            description: getErrorMessage(error, 'Rocketboard could not approve this request.'),
            title: 'Could not approve request',
            variant: 'error',
          })
        },
        onSettled: () => setActingRequestId(null),
        onSuccess: () => {
          toast({title: `Invite sent to ${request.email}`})
        },
      },
    )
  }

  const handleDecline = async (request: OrgInviteRequest) => {
    const confirmed = await confirm({
      confirmLabel: 'Decline',
      description: `Decline ${request.requestedByName}'s request to invite ${request.email}? They will see this in their request history.`,
      title: 'Decline invite request?',
      variant: 'destructive',
    })
    if (!confirmed) return

    setActingRequestId(request.id)
    declineMutation.mutate(
      {
        requestId: request.id,
      },
      {
        onError: (error) => {
          toast({
            description: getErrorMessage(error, 'Rocketboard could not decline this request.'),
            title: 'Could not decline request',
            variant: 'error',
          })
        },
        onSettled: () => setActingRequestId(null),
        onSuccess: () => {
          toast({title: 'Request declined'})
        },
      },
    )
  }

  return (
    <>
      <div className='rounded-2xl border border-border-subtle bg-surface-base'>
        <div className='border-b border-border-subtle px-4 py-3'>
          <h3 className='text-xs font-semibold uppercase tracking-wider text-text-muted'>
            Pending requests ({requests.length})
          </h3>
        </div>
        <ul className='divide-y divide-border-subtle'>
          {requests.map((request) => {
            const isActing = actingRequestId === request.id
            return (
              <li
                className='flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:flex-nowrap'
                key={request.id}
              >
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-sm text-text-strong'>
                    <span className='font-medium'>{request.requestedByName}</span> requested to invite{' '}
                    <span className='font-medium'>{request.email}</span>
                  </p>
                  <p className='mt-1 flex items-center gap-2 text-xs text-text-muted'>
                    <Badge variant='subtle'>{formatRoleLabel(request.requestedRole)}</Badge>
                    <span>·</span>
                    <span>{formatTimeAgo(request.createdAt)}</span>
                  </p>
                </div>
                <div className='flex shrink-0 items-center gap-2'>
                  <Button
                    aria-label={`Approve request to invite ${request.email}`}
                    disabled={isActing}
                    onClick={() => handleApprove(request)}
                    size='compact'
                    variant='primary'
                  >
                    <Check className='h-3.5 w-3.5'/>
                    {isActing && approveMutation.isPending ? 'Approving...' : 'Approve'}
                  </Button>
                  <Button
                    aria-label={`Decline request to invite ${request.email}`}
                    disabled={isActing}
                    onClick={() => void handleDecline(request)}
                    size='compact'
                    variant='ghost'
                  >
                    <X className='h-3.5 w-3.5'/>
                    Decline
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
      {confirmDialogProps ? <ConfirmDialog {...confirmDialogProps}/> : null}
    </>
  )
}
