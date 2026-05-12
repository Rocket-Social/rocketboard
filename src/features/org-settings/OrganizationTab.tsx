import {useMemo, useState} from 'react'
import {useNavigate} from '@tanstack/react-router'
import {useQueryClient} from '@tanstack/react-query'

import {TimezoneCombobox} from '../../components/TimezoneCombobox'
import {Button} from '../../components/ui/button'
import {Input} from '../../components/ui/input'
import {Textarea} from '../../components/ui/textarea'
import {useToast} from '../../components/ui/toast'
import {getBrowserTimeZone, getTimezoneOption, isSupportedTimezone, normalizeTimezone} from '../../lib/timezone'
import {getErrorMessage, rpcAdapter} from '../../platform/data/rpc-adapter'
import {orgMembersQueryOptions, useSetOrgAiSettingsMutation, useSetOrgTimezoneMutation} from './org-settings.queries'

type OrganizationTabProps = {
  aiWorkspaceGuidance: string | null
  canManage: boolean
  driftWatcherEnabled: boolean
  orgId: string
  orgName: string
  orgSlug: string
  orgTimezone: string | null
  onNameUpdated?: (newName: string) => void
}

// Caps the workspace guidance textarea so a runaway paste doesn't bloat the
// org row or future LLM context window. 4 KB is well above the kind of
// "we ship daily; never schedule cards >2 days out" paragraph the field
// is designed for, and well under any realistic prompt token cost.
const GUIDANCE_MAX_LENGTH = 4000

async function updateOrganization(orgId: string, name: string) {
  return rpcAdapter.call('update_organization', {target_org_id: orgId, target_name: name})
}

async function deleteOrganization(orgId: string) {
  return rpcAdapter.call('delete_organization', {target_org_id: orgId})
}

export function OrganizationTab({
  aiWorkspaceGuidance,
  canManage,
  driftWatcherEnabled,
  orgId,
  orgName,
  orgSlug,
  orgTimezone,
  onNameUpdated,
}: OrganizationTabProps) {
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

  const initialGuidance = aiWorkspaceGuidance ?? ''
  const [draftDriftEnabled, setDraftDriftEnabled] = useState(driftWatcherEnabled)
  const [draftGuidance, setDraftGuidance] = useState(initialGuidance)
  const aiSettingsMutation = useSetOrgAiSettingsMutation(orgId)
  const trimmedGuidance = draftGuidance.trim()
  const aiSettingsDirty =
    draftDriftEnabled !== driftWatcherEnabled || trimmedGuidance !== initialGuidance.trim()

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

  const handleSaveAiSettings = () => {
    if (!aiSettingsDirty) return
    aiSettingsMutation.mutate(
      {
        driftWatcherEnabled: draftDriftEnabled,
        workspaceGuidance: trimmedGuidance.length === 0 ? null : trimmedGuidance,
      },
      {
        onSuccess: () => {
          toast({title: 'AI agent settings updated'})
        },
        onError: (error) => {
          toast({title: getErrorMessage(error, 'Failed to update AI settings'), variant: 'error'})
        },
      },
    )
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

      {/* AI agents */}
      <div className='space-y-4'>
        <h3 className='text-sm font-semibold text-text-strong'>AI agents</h3>
        <p className='text-sm text-text-muted'>
          Background agents that act on behalf of your workspace. The Drift Watcher scans cards once an hour for stale work, missing assignees, missing due dates, and overdue deadlines, then nudges the responsible person — without ever editing the card.
        </p>

        {canManage ? (
          <div className='space-y-4'>
            <label className='flex max-w-md cursor-pointer items-start gap-3 rounded-xl border border-border-subtle bg-surface-base p-3 transition-colors hover:bg-surface-muted'>
              <input
                checked={draftDriftEnabled}
                className='mt-0.5 h-4 w-4 rounded border-border-subtle text-primary focus:ring-primary'
                onChange={(e) => setDraftDriftEnabled(e.target.checked)}
                type='checkbox'
              />
              <div className='flex-1'>
                <p className='text-sm font-medium text-text-strong'>Watch for quality drift</p>
                <p className='mt-0.5 text-xs text-text-muted'>
                  Sara checks every hour and posts a once-a-day inbox notification to anyone whose cards have drifted out of quality.
                </p>
              </div>
            </label>

            <div>
              <label
                className='mb-1 block text-xs font-medium text-text-muted'
                htmlFor='org-ai-workspace-guidance'
              >
                Workspace agent guidance
              </label>
              <Textarea
                className='max-w-2xl'
                id='org-ai-workspace-guidance'
                maxLength={GUIDANCE_MAX_LENGTH}
                onChange={(e) => setDraftGuidance(e.target.value)}
                placeholder={'e.g. We ship daily; never schedule cards more than two days out. Default the engineering review queue to Chris.'}
                rows={4}
                value={draftGuidance}
              />
              <div className='mt-1 flex items-center justify-between'>
                <p className='text-xs text-text-muted'>
                  Injected into every AI agent run for this workspace. Leave blank for no extra guidance.
                </p>
                <p className='text-xs text-text-muted'>
                  {draftGuidance.length}/{GUIDANCE_MAX_LENGTH}
                </p>
              </div>
            </div>

            <Button
              disabled={!aiSettingsDirty || aiSettingsMutation.isPending}
              onClick={handleSaveAiSettings}
              size='compact'
              variant='primary'
            >
              {aiSettingsMutation.isPending ? 'Saving...' : 'Save AI settings'}
            </Button>
          </div>
        ) : (
          <div className='max-w-md rounded-lg border border-border-subtle bg-surface-muted px-3 py-2'>
            <p className='text-sm text-text-strong'>
              Drift Watcher: {driftWatcherEnabled ? 'On' : 'Off'}
            </p>
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
