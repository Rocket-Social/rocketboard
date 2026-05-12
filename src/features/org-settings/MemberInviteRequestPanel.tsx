import {Search} from 'lucide-react'
import {useState} from 'react'

import {Button} from '../../components/ui/button'
import {useToast} from '../../components/ui/toast'
import {getErrorMessage} from '../../platform/data/rpc-adapter'
import {useInviteFormHandler} from '../access/useInviteFormHandler'

import {AdminChipList} from './AdminChipList'
import type {OrgMember} from './org-settings.types'
import {useCreateOrgInviteRequestMutation} from './org-settings.queries'

const REQUEST_ROLE_OPTIONS = ['member', 'guest'] as const

function formatRoleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

function describeServerError(error: unknown): string {
  const message = getErrorMessage(error, 'Rocketboard could not send your request.')
  if (message.includes('INVITE_ALREADY_PENDING')) {
    return 'An invite to this email is already pending.'
  }
  if (message.includes('INVITE_REQUEST_ALREADY_PENDING')) {
    return 'You already have a pending request for this email.'
  }
  if (message.includes('INVITE_REQUEST_RATE_LIMIT')) {
    return "You've requested too many invites recently. Wait an hour or ask an admin to invite directly."
  }
  return message
}

type MemberInviteRequestPanelProps = {
  admins: OrgMember[]
  adminsLoading: boolean
  currentOrgRole: 'admin' | 'member' | 'guest'
  currentUserId: string | null
  organizationId: string
  organizationName: string
  organizationSlug: string
}

export function MemberInviteRequestPanel({
  admins,
  adminsLoading,
  currentOrgRole,
  currentUserId,
  organizationId,
  organizationName,
  organizationSlug,
}: MemberInviteRequestPanelProps) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<typeof REQUEST_ROLE_OPTIONS[number]>('member')
  const {toast} = useToast()
  const createMutation = useCreateOrgInviteRequestMutation(organizationId)

  const inviteFormHandler = useInviteFormHandler({
    email,
    isPending: createMutation.isPending,
    onValid: (trimmedEmail) => {
      createMutation.mutate(
        {
          email: trimmedEmail,
          organizationId,
          organizationName,
          organizationSlug,
          role,
        },
        {
          onError: (error) => {
            toast({
              description: describeServerError(error),
              title: 'Could not send invite request',
              variant: 'error',
            })
          },
          onSuccess: () => {
            setEmail('')
            toast({title: 'Request sent. Admins will review.'})
          },
        },
      )
    },
  })

  return (
    <div className='rounded-2xl border border-border-subtle bg-surface-base p-4'>
      <h3 className='text-xs font-semibold uppercase tracking-wider text-text-muted'>Invites</h3>
      <p className='mt-2 text-sm text-text-medium'>
        Only org admins can send invites directly. Submit a request and we&apos;ll notify the admins to review.
      </p>

      <div className='mt-3 flex flex-wrap gap-2'>
        <div className='relative min-w-[18rem] flex-1'>
          <div className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted'>
            <Search className='h-4 w-4'/>
          </div>
          <input
            className='h-10 w-full rounded-xl border border-border-subtle bg-surface-elevated pl-9 pr-3 text-sm text-text-strong outline-none placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary-soft'
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={inviteFormHandler.handleKeyDown}
            placeholder='Email to invite...'
            type='text'
            value={email}
          />
        </div>
        <select
          className='h-10 rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm text-text-strong'
          onChange={(event) => setRole(event.target.value as typeof REQUEST_ROLE_OPTIONS[number])}
          value={role}
        >
          {REQUEST_ROLE_OPTIONS.map((roleOption) => (
            <option key={roleOption} value={roleOption}>{formatRoleLabel(roleOption)}</option>
          ))}
        </select>
        <Button
          disabled={createMutation.isPending}
          onClick={inviteFormHandler.handleSubmit}
          variant='primary'
        >
          {createMutation.isPending ? 'Sending...' : 'Request invite'}
        </Button>
      </div>

      <div className='mt-4 border-t border-border-subtle pt-3'>
        <p className='mb-2 text-xs font-medium uppercase tracking-wider text-text-muted'>
          Or ask an admin directly
        </p>
        <AdminChipList
          admins={admins}
          currentUserId={currentUserId}
          emailVisibility={currentOrgRole === 'guest' ? 'hidden' : 'visible'}
          isLoading={adminsLoading}
          organizationName={organizationName}
        />
      </div>
    </div>
  )
}
