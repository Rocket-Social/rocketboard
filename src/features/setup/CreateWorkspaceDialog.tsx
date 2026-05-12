import {useQueryClient} from '@tanstack/react-query'
import {FolderPlus, Globe2, Lock, Search, UserPlus, X} from 'lucide-react'
import {useDeferredValue, useMemo, useState} from 'react'

import {Badge} from '../../components/ui/badge'
import {Button} from '../../components/ui/button'
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '../../components/ui/dialog'
import {Input} from '../../components/ui/input'
import {useToast} from '../../components/ui/toast'
import {UserAvatar} from '../../components/ui/user-avatar'
import {accessRepository} from '../access/access.repository'
import {useSessionQuery} from '../auth/session.queries'
import {useOrgMembersQuery} from '../org-settings/org-settings.queries'
import type {OrgMember} from '../org-settings/org-settings.types'
import {workspaceSummariesQueryOptions} from '../projects/project-shell.queries'
import type {WorkspaceSummary} from '../projects/project-shell.types'
import {getSetupErrorMessage} from './setup.errors'
import {useCreateWorkspaceMutation} from './setup.queries'
import type {ProjectRouteTarget} from './setup.types'

type CreateWorkspaceDialogProps = {
  canCreateWorkspace: boolean
  isOpen: boolean
  onClose: () => void
  onCreated: (route: ProjectRouteTarget) => void
  organizationId: string
}

function getOrgRoleLabel(role: string) {
  if (role === 'admin') return 'Org admin'
  if (role === 'member') return 'Org member'
  return 'Org guest'
}

function canReceiveWorkspaceMemberAccess(member: OrgMember) {
  return member.role === 'admin' || member.role === 'member'
}

export function CreateWorkspaceDialog({
  canCreateWorkspace,
  isOpen,
  onClose,
  onCreated,
  organizationId,
}: CreateWorkspaceDialogProps) {
  const queryClient = useQueryClient()
  const createWorkspaceMutation = useCreateWorkspaceMutation()
  const {toast} = useToast()
  const orgMembersQuery = useOrgMembersQuery(organizationId)
  const sessionQuery = useSessionQuery()
  const [isPrivate, setIsPrivate] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [memberQuery, setMemberQuery] = useState('')
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [workspaceName, setWorkspaceName] = useState('')
  const deferredMemberQuery = useDeferredValue(memberQuery)

  const isCreateBlocked = !canCreateWorkspace
  const isFormDisabled = isSubmitting || isCreateBlocked
  const currentUserId = sessionQuery.data?.status === 'authenticated'
    ? sessionQuery.data.user.id
    : null
  const orgMembers = orgMembersQuery.data?.members ?? []
  const eligibleOrgMembers = useMemo(
    () => orgMembers.filter(canReceiveWorkspaceMemberAccess),
    [orgMembers],
  )
  const selectedMemberIdSet = useMemo(
    () => new Set(selectedMemberIds),
    [selectedMemberIds],
  )
  const selectedMembers = useMemo(() => {
    const membersById = new Map(eligibleOrgMembers.map((member) => [member.userId, member]))

    return selectedMemberIds
      .map((memberId) => membersById.get(memberId))
      .filter((member): member is OrgMember => Boolean(member))
  }, [eligibleOrgMembers, selectedMemberIds])
  const filteredOrgMembers = useMemo(() => {
    const normalizedQuery = deferredMemberQuery.trim().toLowerCase()

    return eligibleOrgMembers
      .filter((member) => {
        if (member.userId === currentUserId) return false
        if (selectedMemberIdSet.has(member.userId)) return false
        if (!normalizedQuery) return true

        return member.name.toLowerCase().includes(normalizedQuery)
          || member.email.toLowerCase().includes(normalizedQuery)
          || (member.githubLogin?.toLowerCase().includes(normalizedQuery) ?? false)
      })
      .slice(0, 6)
  }, [currentUserId, deferredMemberQuery, eligibleOrgMembers, selectedMemberIdSet])

  const handleSelectMember = (member: OrgMember) => {
    setSelectedMemberIds((currentIds) =>
      currentIds.includes(member.userId)
        ? currentIds
        : [...currentIds, member.userId],
    )
    setMemberQuery('')
    setLocalError(null)
  }

  const handleRemoveMember = (memberId: string) => {
    setSelectedMemberIds((currentIds) => currentIds.filter((currentId) => currentId !== memberId))
  }

  const handleSubmit = async () => {
    if (!workspaceName.trim() || isSubmitting || isCreateBlocked) {
      return
    }

    setIsSubmitting(true)
    setLocalError(null)

    try {
      const route = await createWorkspaceMutation.mutateAsync({
        access: isPrivate ? 'private' : 'open',
        organizationId,
        workspaceName: workspaceName.trim(),
      })

      if (selectedMembers.length > 0) {
        const workspaces =
          queryClient.getQueryData<WorkspaceSummary[]>(
            workspaceSummariesQueryOptions().queryKey,
          ) ?? []
        const createdWorkspace = workspaces.find(
          (workspace) =>
            workspace.organizationSlug === route.orgSlug
            && workspace.slug === route.workspaceSlug,
        )

        if (!createdWorkspace) {
          toast({
            description: 'We created the workspace, but could not add the selected organization members automatically. Open Workspace Access to add them there.',
            title: 'Workspace created',
          })
        } else {
          const results = await Promise.allSettled(
            selectedMembers.map((member) =>
              accessRepository.addWorkspaceAccess({
                role: 'member',
                userId: member.userId,
                workspaceId: createdWorkspace.id,
              }),
            ),
          )
          const failedCount = results.filter((result) => result.status === 'rejected').length

          if (failedCount > 0) {
            toast({
              description:
                failedCount === selectedMembers.length
                  ? 'The workspace was created, but none of the selected organization members were added. Open Workspace Access to add them there.'
                  : `The workspace was created, but ${failedCount} organization member${failedCount === 1 ? ' was' : 's were'} not added. You can retry from Workspace Access.`,
              title: 'Workspace created',
            })
          }
        }
      }

      setIsPrivate(false)
      setMemberQuery('')
      setSelectedMemberIds([])
      setWorkspaceName('')
      onCreated(route)
    } catch (error) {
      setLocalError(getSetupErrorMessage(error))
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className='w-[min(32rem,calc(100vw-2rem))] rounded-[28px] bg-surface-base'>
        <DialogHeader className='px-6 py-5'>
          <p className='font-mono text-xs uppercase tracking-[0.24em] text-text-muted'>Create Workspace</p>
          <DialogTitle className='mt-1 font-display text-2xl'>Start a new workspace</DialogTitle>
          <DialogDescription className='mt-2'>
            Rocketboard creates the workspace and its first board automatically. Choose who can see it, then optionally add organization members right away.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 px-6 py-5'>
          <label className='space-y-2'>
            <span className='text-sm font-medium text-text-strong'>Workspace name</span>
            <Input
              autoFocus
              disabled={isFormDisabled}
              onChange={(event) => {
                setWorkspaceName(event.target.value)
                setLocalError(null)
              }}
              placeholder='Product Ops'
              value={workspaceName}
            />
          </label>

          <div className='space-y-3 rounded-3xl border border-border-subtle bg-surface-elevated/60 p-4'>
            <div>
              <p className='text-sm font-medium text-text-strong'>Workspace visibility</p>
              <p className='mt-1 text-sm text-text-medium'>
                Public workspaces are visible across the organization. Private workspaces only show up for people you explicitly add.
              </p>
            </div>

            <div className='grid gap-3 sm:grid-cols-2'>
              <button
                aria-pressed={!isPrivate}
                className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                  !isPrivate
                    ? 'border-primary bg-primary-soft/40 text-text-strong'
                    : 'border-border-subtle bg-surface-base text-text-medium hover:border-primary/40'
                }`}
                disabled={isFormDisabled}
                onClick={() => {
                  setIsPrivate(false)
                  setLocalError(null)
                }}
                type='button'
              >
                <span className='flex h-9 w-9 items-center justify-center rounded-2xl bg-canvas-accent text-text-strong'>
                  <Globe2 className='h-4 w-4'/>
                </span>
                <span className='space-y-1'>
                  <span className='block text-sm font-medium'>Public workspace</span>
                  <span className='block text-xs text-text-muted'>Anyone in the organization can discover it. Explicit members still define the local workspace list.</span>
                </span>
              </button>

              <button
                aria-pressed={isPrivate}
                className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                  isPrivate
                    ? 'border-primary bg-primary-soft/40 text-text-strong'
                    : 'border-border-subtle bg-surface-base text-text-medium hover:border-primary/40'
                }`}
                disabled={isFormDisabled}
                onClick={() => {
                  setIsPrivate(true)
                  setLocalError(null)
                }}
                type='button'
              >
                <span className='flex h-9 w-9 items-center justify-center rounded-2xl bg-canvas-accent text-text-strong'>
                  <Lock className='h-4 w-4'/>
                </span>
                <span className='space-y-1'>
                  <span className='block text-sm font-medium'>Private workspace</span>
                  <span className='block text-xs text-text-muted'>Only explicit workspace members can see the workspace and its contents.</span>
                </span>
              </button>
            </div>
          </div>

          <div className='space-y-3 rounded-3xl border border-border-subtle bg-surface-elevated/60 p-4'>
            <div>
              <p className='text-sm font-medium text-text-strong'>Add organization members</p>
              <p className='mt-1 text-sm text-text-medium'>
                Optional. Search by name to add existing organization admins or members as workspace members right after creation.
              </p>
            </div>

            <label className='space-y-2'>
              <span className='sr-only'>Search organization members</span>
              <div className='relative'>
                <div className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted'>
                  <Search className='h-4 w-4'/>
                </div>
                <Input
                  className='pl-9'
                  disabled={isFormDisabled || orgMembersQuery.isPending || eligibleOrgMembers.length === 0}
                  onChange={(event) => {
                    setMemberQuery(event.target.value)
                    setLocalError(null)
                  }}
                  placeholder='Search organization members by name'
                  value={memberQuery}
                />
              </div>
            </label>

            {selectedMembers.length > 0 ? (
              <div className='flex flex-wrap gap-2'>
                {selectedMembers.map((member) => (
                  <div
                    className='inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-base px-3 py-1.5 text-sm text-text-strong'
                    key={member.userId}
                  >
                    <UserAvatar
                      className='h-6 w-6'
                      fallbackClassName='bg-primary/10 text-[10px] font-semibold text-primary'
                      name={member.name}
                    />
                    <span>{member.name}</span>
                    <button
                      aria-label={`Remove ${member.name}`}
                      className='rounded-full p-0.5 text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong'
                      disabled={isFormDisabled}
                      onClick={() => handleRemoveMember(member.userId)}
                      type='button'
                    >
                      <X className='h-3.5 w-3.5'/>
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {memberQuery.trim().length > 0 && filteredOrgMembers.length > 0 ? (
              <div className='overflow-hidden rounded-2xl border border-border-subtle bg-surface-base'>
                <div className='divide-y divide-border-subtle'>
                  {filteredOrgMembers.map((member) => (
                    <button
                      className='flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-canvas-accent'
                      disabled={isFormDisabled}
                      key={member.userId}
                      onClick={() => handleSelectMember(member)}
                      type='button'
                    >
                      <div className='flex min-w-0 items-center gap-3'>
                        <UserAvatar
                          className='h-9 w-9'
                          fallbackClassName='bg-primary/10 text-xs font-semibold text-primary'
                          name={member.name}
                        />
                        <div className='min-w-0'>
                          <p className='truncate text-sm font-medium text-text-strong'>{member.name}</p>
                          <p className='truncate text-xs text-text-muted'>{member.email}</p>
                        </div>
                      </div>
                      <div className='flex items-center gap-2'>
                        <Badge variant='subtle'>{getOrgRoleLabel(member.role)}</Badge>
                        <UserPlus className='h-4 w-4 text-text-muted'/>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {memberQuery.trim().length > 0 && !orgMembersQuery.isPending && filteredOrgMembers.length === 0 ? (
              <div className='rounded-2xl border border-dashed border-border-subtle px-4 py-3 text-sm text-text-muted'>
                No organization admins or members matched that name. Organization guests can be added later from Workspace Access with guest access.
              </div>
            ) : null}

            {orgMembersQuery.isPending ? (
              <div className='rounded-2xl border border-dashed border-border-subtle px-4 py-3 text-sm text-text-muted'>
                Loading organization members…
              </div>
            ) : null}

            {orgMembersQuery.isError ? (
              <div className='rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning'>
                We could not load organization members right now. You can still create the workspace and add people later from Workspace Access.
              </div>
            ) : null}

            {!orgMembersQuery.isPending && !orgMembersQuery.isError && eligibleOrgMembers.length === 0 ? (
              <div className='rounded-2xl border border-dashed border-border-subtle px-4 py-3 text-sm text-text-muted'>
                No organization admins or members are available to add yet.
              </div>
            ) : null}

            <div className='flex items-center gap-2 text-xs text-text-muted'>
              <UserPlus className='h-4 w-4'/>
              Selected people are added as workspace members after creation. You can adjust roles later from Workspace Access.
            </div>
          </div>

          {isCreateBlocked ? (
            <div className='rounded-2xl border border-warning/20 bg-warning/10 px-3 py-2 text-sm text-warning'>
              Only organization admins can create workspaces in this organization. Ask an organization admin to create the workspace or upgrade your organization role.
            </div>
          ) : null}

          {localError ? (
            <div className='rounded-2xl border border-error/20 bg-error/10 px-3 py-2 text-sm text-error'>
              {localError}
            </div>
          ) : null}

          <div className='flex justify-end gap-2'>
            <Button disabled={isSubmitting} onClick={onClose} variant='ghost'>
              Cancel
            </Button>
            <Button
              disabled={!workspaceName.trim() || isFormDisabled}
              onClick={() => { void handleSubmit() }}
              variant='primary'
            >
              <FolderPlus className='h-4 w-4'/>
              {isSubmitting ? 'Creating…' : 'Create workspace'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
