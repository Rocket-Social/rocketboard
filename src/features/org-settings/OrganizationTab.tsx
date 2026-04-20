import {useMemo, useState} from 'react'
import {useNavigate} from '@tanstack/react-router'
import {useQueryClient} from '@tanstack/react-query'

import {TimezoneCombobox} from '../../components/TimezoneCombobox'
import {Button} from '../../components/ui/button'
import {Input} from '../../components/ui/input'
import {useToast} from '../../components/ui/toast'
import {getBrowserTimeZone, getTimezoneOption, isSupportedTimezone, normalizeTimezone} from '../../lib/timezone'
import {getErrorMessage, rpcAdapter} from '../../platform/data/rpc-adapter'
import {orgMembersQueryOptions, useSetOrgTimezoneMutation} from './org-settings.queries'

type OrganizationTabProps = {
  canManage: boolean
  orgId: string
  orgName: string
  orgSlug: string
  orgTimezone: string | null
  onNameUpdated?: (newName: string) => void
}

async function updateOrganization(orgId: string, name: string) {
  return rpcAdapter.call('update_organization', {target_org_id: orgId, target_name: name})
}

async function deleteOrganization(orgId: string) {
  return rpcAdapter.call('delete_organization', {target_org_id: orgId})
}

export function OrganizationTab({canManage, orgId, orgName, orgSlug, orgTimezone, onNameUpdated}: OrganizationTabProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const {toast} = useToast()
  const [name, setName] = useState(orgName)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  const browserTimezone = useMemo(() => getBrowserTimeZone(), [])
  const initialTimezone = normalizeTimezone(orgTimezone) ?? browserTimezone
  const [timezone, setTimezone] = useState(initialTimezone)
  const timezoneMutation = useSetOrgTimezoneMutation(orgId)
  const normalizedTimezone = normalizeTimezone(timezone) ?? timezone.trim()
  const timezoneValid = isSupportedTimezone(normalizedTimezone)
  const timezoneDirty = normalizedTimezone !== initialTimezone

  const hasNameChanged = name.trim() !== orgName && name.trim().length > 0

  const handleSave = async () => {
    if (!hasNameChanged) return
    setIsSaving(true)
    try {
      await updateOrganization(orgId, name.trim())
      await queryClient.invalidateQueries({queryKey: orgMembersQueryOptions(orgId).queryKey})
      toast({title: 'Organization name updated'})
      onNameUpdated?.(name.trim())
    } catch (error) {
      toast({title: getErrorMessage(error, 'Failed to update organization'), variant: 'error'})
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveTimezone = () => {
    if (!timezoneValid || !timezoneDirty) return

    timezoneMutation.mutate(normalizedTimezone, {
      onSuccess: () => {
        const label = getTimezoneOption(normalizedTimezone)?.label ?? normalizedTimezone
        toast({title: `Organization timezone updated to ${label}`})
      },
      onError: (error) => {
        toast({title: getErrorMessage(error, 'Failed to update timezone'), variant: 'error'})
      },
    })
  }

  const handleDelete = async () => {
    if (deleteConfirm !== 'DELETE') return
    setIsDeleting(true)
    try {
      await deleteOrganization(orgId)
      toast({title: `Organization "${orgName}" deleted`})
      void navigate({to: '/'})
    } catch (error) {
      toast({title: getErrorMessage(error, 'Failed to delete organization'), variant: 'error'})
      setIsDeleting(false)
    }
  }

  return (
    <div className='space-y-8'>
      {/* Organization details */}
      <div className='space-y-4'>
        <h3 className='text-sm font-semibold text-text-strong'>Organization details</h3>

        <div className='space-y-3'>
          <div>
            <label className='mb-1 block text-xs font-medium text-text-muted'>Name</label>
            <div className='flex max-w-md items-center gap-2'>
              <Input
                disabled={!canManage}
                onChange={(e) => setName(e.target.value)}
                value={name}
              />
              {canManage && hasNameChanged ? (
                <Button
                  disabled={isSaving}
                  onClick={() => void handleSave()}
                  size='compact'
                  variant='primary'
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
              ) : null}
            </div>
          </div>

          <div>
            <label className='mb-1 block text-xs font-medium text-text-muted'>Slug</label>
            <Input className='max-w-md' disabled readOnly value={orgSlug}/>
            <p className='mt-1 text-xs text-text-muted'>Auto-generated from the organization name.</p>
          </div>

          <div>
            <label className='mb-1 block text-xs font-medium text-text-muted'>Organization ID</label>
            <p className='max-w-md rounded-lg border border-border-subtle bg-surface-muted px-3 py-2 font-mono text-xs text-text-muted'>
              {orgId}
            </p>
          </div>
        </div>
      </div>

      {/* Timezone */}
      <div className='space-y-4'>
        <h3 className='text-sm font-semibold text-text-strong'>Timezone</h3>
        <p className='text-sm text-text-muted'>
          Shared timelines, sprint automations, and date-based views across this organization use this timezone.
        </p>

        {canManage ? (
          <div className='space-y-3'>
            <div className='max-w-md'>
              <TimezoneCombobox
                inputId='org-timezone'
                onChange={setTimezone}
                value={timezone}
              />
            </div>

            {orgTimezone === null ? (
              <div className='max-w-md rounded-xl border border-warning/20 bg-warning/10 px-3 py-2 text-sm text-warning'>
                No organization timezone is saved yet. We prefilled your browser timezone: {browserTimezone}
              </div>
            ) : null}

            {!timezoneValid ? (
              <div className='max-w-md rounded-xl border border-error/20 bg-error/10 px-3 py-2 text-sm text-error'>
                Choose a valid IANA timezone like America/Los_Angeles.
              </div>
            ) : null}

            <Button
              disabled={!timezoneDirty || !timezoneValid || timezoneMutation.isPending}
              onClick={handleSaveTimezone}
              size='compact'
              variant='primary'
            >
              {timezoneMutation.isPending ? 'Saving...' : 'Save timezone'}
            </Button>
          </div>
        ) : (
          <div className='max-w-md rounded-lg border border-border-subtle bg-surface-muted px-3 py-2'>
            {orgTimezone ? (
              <>
                <p className='text-sm font-medium text-text-strong'>
                  {getTimezoneOption(orgTimezone)?.label ?? orgTimezone}
                </p>
                <p className='mt-0.5 font-mono text-[11px] text-text-muted'>
                  {getTimezoneOption(orgTimezone)?.secondaryLabel ?? orgTimezone}
                </p>
              </>
            ) : (
              <p className='text-sm text-text-muted'>Not set</p>
            )}
            <p className='mt-2 text-xs text-text-muted'>Organization admins manage this setting.</p>
          </div>
        )}
      </div>

      {/* Danger zone */}
      {canManage ? (
        <div className='rounded-xl border border-error/30 bg-error/5 p-4'>
          <h3 className='text-sm font-semibold text-error'>Danger zone</h3>
          <p className='mt-1 text-sm text-text-muted'>
            Deleting this organization is permanent. All workspaces, projects, and member access will be removed.
          </p>

          <div className='mt-4 space-y-3'>
            <div>
              <label className='mb-1 block text-xs font-medium text-text-muted'>
                Type <span className='font-mono font-bold'>DELETE</span> to confirm
              </label>
              <Input
                className='max-w-xs'
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder='DELETE'
                value={deleteConfirm}
              />
            </div>
            <Button
              className='bg-error hover:brightness-110'
              disabled={deleteConfirm !== 'DELETE' || isDeleting}
              onClick={() => void handleDelete()}
              variant='primary'
            >
              {isDeleting ? 'Deleting...' : 'Delete organization'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
