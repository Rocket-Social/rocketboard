import {Building2, Mail, Search, ShieldCheck, Trash2, UserPlus, Users} from 'lucide-react'
import {useDeferredValue, useMemo, useState} from 'react'

import {Badge} from '../../components/ui/badge'
import {Button} from '../../components/ui/button'
import {ConfirmDialog} from '../../components/ui/confirm-dialog'
import {useToast} from '../../components/ui/toast'
import {useConfirmDialog} from '../../hooks/useConfirmDialog'
import {isEmailFormat} from '../../lib/email'
import {getErrorMessage} from '../../platform/data/rpc-adapter'
import {useSessionQuery} from '../auth/session.queries'
import {
  useAddProjectAccessMutation,
  useCreateProjectInviteMutation,
  useRemoveProjectAccessMutation,
  useSearchWorkspaceMembersQuery,
  useSetProjectAccessRoleMutation,
  useSetProjectVisibilityMutation,
} from './access.queries'
import {useInviteFormHandler} from './useInviteFormHandler'
import type {
  OrganizationRole,
  ProjectAccessSnapshot,
  ProjectDirectAccessEntry,
  ScopeAccessRole,
  WorkspaceMemberSearchResult,
} from './access.types'

type ProjectAccessSectionProps = {
  currentUserId: string
  projectId: string
  projectName: string
  snapshot: ProjectAccessSnapshot
  workspaceId: string
  workspaceName: string
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
  }

  return name.slice(0, 2).toUpperCase()
}

function getEffectiveAccessLabel(role: ProjectDirectAccessEntry['effectiveRole']) {
  if (role === 'admin') return 'Admin'
  if (role === 'member') return 'Member'
  return 'Guest'
}

function getLocalRoleLabel(role: ScopeAccessRole) {
  if (role === 'admin') return 'Project admin'
  if (role === 'member') return 'Project member'
  return 'Project guest'
}

function buildProjectPolicyCopy(projectAccess: ProjectAccessSnapshot['projectAccess'], workspaceAccess: ProjectAccessSnapshot['workspaceAccess']) {
  if (projectAccess === 'private') {
    return 'This project is private. Only explicit project members can see the project name or its contents. Organization role still decides who can edit once they are in scope.'
  }

  if (workspaceAccess === 'private') {
    return 'This project is open inside a private workspace. Anyone who already has workspace access can see the project, and organization role still decides edit versus view.'
  }

  return 'This project is open inside the workspace. Explicit project members still matter here as the local admin list, the curated local list, and the project invite target.'
}

function buildExplicitMembershipCopy(projectAccess: 'open' | 'private') {
  if (projectAccess === 'private') {
    return 'These explicit project members are the real access list for this private project.'
  }

  return 'These explicit project members are the curated local list for this open project. Removing someone here does not revoke inherited open-project access.'
}

function buildGuestCopy(currentOrgRole: OrganizationRole) {
  if (currentOrgRole !== 'guest') {
    return null
  }

  return 'You have organization guest access. Guests can view shared project content but cannot edit tasks or documents.'
}

function buildExternalProjectInviteCopy(workspaceAccess: ProjectAccessSnapshot['workspaceAccess']) {
  if (workspaceAccess === 'private') {
    return 'External project invites create organization guests, workspace guests, and project guests.'
  }

  return 'External project invites create organization guests and project guests.'
}

function sortScopeRole(role: ScopeAccessRole) {
  if (role === 'admin') return 0
  if (role === 'member') return 1
  return 2
}

function getSearchActionRoles(targetOrgRole: OrganizationRole, canEditProject: boolean, canManageProject: boolean) {
  if (!canEditProject && !canManageProject) {
    return [] as ScopeAccessRole[]
  }

  if (targetOrgRole === 'guest') {
    return ['guest'] as ScopeAccessRole[]
  }

  return canManageProject
    ? ['admin', 'member'] as ScopeAccessRole[]
    : ['member'] as ScopeAccessRole[]
}

function getManagedRoleOptions(orgRole: OrganizationRole) {
  if (orgRole === 'guest') {
    return ['guest'] as ScopeAccessRole[]
  }

  return ['admin', 'member'] as ScopeAccessRole[]
}

function getProjectActionLabel(role: ScopeAccessRole) {
  if (role === 'admin') return 'Add as admin'
  if (role === 'member') return 'Add as member'
  return 'Add as guest'
}

function buildSearchHint(orgRole: OrganizationRole, canEditProject: boolean, canManageProject: boolean) {
  if (orgRole === 'guest') {
    return 'Organization guests can only be added as local guests.'
  }

  if (canManageProject) {
    return 'Org admins and members can only be project admins or members.'
  }

  if (canEditProject) {
    return 'Project editors can add org admins and members as local members only.'
  }

  return 'You can review project membership here, but you cannot change it.'
}

export function ProjectAccessSection({
  currentUserId,
  projectId,
  projectName,
  snapshot,
  workspaceId,
  workspaceName,
}: ProjectAccessSectionProps) {
  const {toast} = useToast()
  const {confirm, confirmDialogProps} = useConfirmDialog()
  const sessionQuery = useSessionQuery()
  const [searchQuery, setSearchQuery] = useState('')
  const deferredQuery = useDeferredValue(searchQuery)

  const addAccessMutation = useAddProjectAccessMutation(projectId)
  const removeAccessMutation = useRemoveProjectAccessMutation(projectId)
  const setRoleMutation = useSetProjectAccessRoleMutation(projectId)
  const createInviteMutation = useCreateProjectInviteMutation(projectId)
  const setVisibilityMutation = useSetProjectVisibilityMutation(projectId)
  const searchResultsQuery = useSearchWorkspaceMembersQuery(workspaceId, deferredQuery, projectId)

  const currentUserName = sessionQuery.data?.status === 'authenticated'
    ? sessionQuery.data.user.name
    : 'Someone'
  const guestCopy = buildGuestCopy(snapshot.currentOrgRole)
  const policyCopy = buildProjectPolicyCopy(snapshot.projectAccess, snapshot.workspaceAccess)
  const explicitMembershipCopy = buildExplicitMembershipCopy(snapshot.projectAccess)
  const canAddOrInviteProjectAccess = snapshot.canEditProject || snapshot.canManageProject
  const directAdminCount = snapshot.directAccess.filter((entry) => entry.scopeRole === 'admin').length
  const editableCollaboratorCount = snapshot.collaborators.filter((entry) => entry.canEdit).length
  const readOnlyCollaboratorCount = snapshot.collaborators.filter((entry) => !entry.canEdit).length
  const emailQuery = searchQuery.trim()
  const normalizedEmailQuery = emailQuery.toLowerCase()
  const directAccessByUserId = useMemo(
    () => new Map(snapshot.directAccess.map((entry) => [entry.id, entry])),
    [snapshot.directAccess],
  )
  const existingDirectAccessMatch = normalizedEmailQuery.length > 0
    ? snapshot.directAccess.find((entry) => entry.email.trim().toLowerCase() === normalizedEmailQuery) ?? null
    : null
  const showExistingProjectMemberState = Boolean(existingDirectAccessMatch) && isEmailFormat(emailQuery)
  const showExternalInvite = emailQuery.length > 0
    && isEmailFormat(emailQuery)
    && !searchResultsQuery.isLoading
    && (searchResultsQuery.data?.length ?? 0) === 0
    && !showExistingProjectMemberState

  const sortedDirectAccess = useMemo(
    () => [...snapshot.directAccess].sort((left, right) => {
      const scopeOrder = sortScopeRole(left.scopeRole) - sortScopeRole(right.scopeRole)
      if (scopeOrder !== 0) return scopeOrder

      const effectiveOrder = sortScopeRole(left.effectiveRole as ScopeAccessRole) - sortScopeRole(right.effectiveRole as ScopeAccessRole)
      if (effectiveOrder !== 0) return effectiveOrder

      return left.name.localeCompare(right.name)
    }),
    [snapshot.directAccess],
  )

  const handleAddAccess = (result: WorkspaceMemberSearchResult, role: ScopeAccessRole) => {
    const existingDirectAccess = directAccessByUserId.get(result.userId)

    if (existingDirectAccess) {
      toast({
        description: 'Use the role picker in the explicit member list below if you need to change their project role.',
        title: `${existingDirectAccess.name} already has explicit project access`,
        variant: 'error',
      })
      return
    }

    const allowedRoles = getSearchActionRoles(result.orgRole, snapshot.canEditProject, snapshot.canManageProject)
    if (!allowedRoles.includes(role)) {
      toast({
        title: 'That role is not available for this organization user.',
        variant: 'error',
      })
      return
    }

    addAccessMutation.mutate(
      {role, userId: result.userId},
      {
        onError: (error) => {
          toast({
            description: getErrorMessage(error, 'Rocketboard could not update project membership.'),
            title: 'Could not update project membership',
            variant: 'error',
          })
        },
        onSuccess: () => {
          setSearchQuery('')
          toast({title: 'Project membership updated'})
        },
      },
    )
  }

  const inviteFormHandler = useInviteFormHandler({
    email: emailQuery,
    isPending: createInviteMutation.isPending,
    onValid: (trimmedEmail) => {
      createInviteMutation.mutate(
        {
          email: trimmedEmail,
          inviterName: currentUserName,
          projectName,
          role: 'guest',
        },
        {
          onError: (error) => {
            toast({
              description: getErrorMessage(error, 'Rocketboard could not send the project invite.'),
              title: 'Could not send project invite',
              variant: 'error',
            })
          },
          onSuccess: () => {
            setSearchQuery('')
            toast({title: 'Project guest invite sent'})
          },
        },
      )
    },
  })

  const handleInviteGuest = inviteFormHandler.handleSubmit

  const handleRemoveAccess = (userId: string, name: string) => {
    const title = snapshot.projectAccess === 'open'
      ? `Remove ${name} from the explicit project list?`
      : `Remove ${name}'s project access?`
    const description = snapshot.projectAccess === 'open'
      ? 'This removes only the explicit project row. They may still inherit access to open project content.'
      : 'This removes the explicit project row and private-project access for this member.'

    void confirm({
      confirmLabel: snapshot.projectAccess === 'open' ? 'Remove from list' : 'Remove access',
      description,
      title,
      variant: 'destructive',
    }).then((confirmed) => {
      if (!confirmed) return

      removeAccessMutation.mutate(
        {userId},
        {
          onError: (error) => {
            toast({
              description: getErrorMessage(error, 'Rocketboard could not update project membership.'),
              title: 'Could not remove project membership',
              variant: 'error',
            })
          },
        },
      )
    })
  }

  return (
    <section className='space-y-5' id='project-access-panel'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div className='space-y-2'>
          <div className='flex items-center gap-2'>
            <Users className='h-4 w-4 text-text-muted'/>
            <h3 className='font-display text-base font-semibold text-text-strong'>Project Access</h3>
          </div>
          <p className='max-w-3xl text-sm text-text-medium'>{policyCopy}</p>
        </div>

        <div className='flex flex-wrap gap-2 text-xs'>
          <Badge variant='subtle'>{editableCollaboratorCount} can edit</Badge>
          <Badge variant='subtle'>{readOnlyCollaboratorCount} view only</Badge>
          <Badge variant='subtle'>{directAdminCount} explicit admins</Badge>
          <Badge variant='subtle'>{snapshot.pendingInvites.length} pending project invites</Badge>
        </div>
      </div>

      {guestCopy ? (
        <div className='rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning'>
          {guestCopy} My Notes stays personal and editable even for guests.
        </div>
      ) : null}

      <div className='rounded-2xl border border-border-subtle bg-surface-base px-4 py-3 text-sm text-text-medium'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex items-center gap-2 font-medium text-text-strong'>
            <Building2 className='h-4 w-4 text-text-muted'/>
            Workspace: {workspaceName}
          </div>
          {snapshot.canManageProject ? (
            <label className='flex items-center gap-2 text-sm text-text-strong'>
              <span>Visibility</span>
              <select
                className='h-10 rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                onChange={(event) => {
                  const nextAccess = event.target.value as 'open' | 'private'
                  if (nextAccess === snapshot.projectAccess) return

                  setVisibilityMutation.mutate(
                    {access: nextAccess},
                    {
                      onError: (error) => {
                        toast({
                          description: getErrorMessage(error, 'Rocketboard could not update project visibility.'),
                          title: 'Could not update visibility',
                          variant: 'error',
                        })
                      },
                    },
                  )
                }}
                value={snapshot.projectAccess}
              >
                <option value='open'>Open in workspace</option>
                <option value='private'>Private project</option>
              </select>
            </label>
          ) : (
            <Badge variant='subtle'>{snapshot.projectAccess === 'open' ? 'Open in workspace' : 'Private project'}</Badge>
          )}
        </div>
        <p className='mt-2'>
          Explicit rows are the local list. Org admins and members cannot be project guests. At least one project admin must remain.
        </p>
      </div>

      {canAddOrInviteProjectAccess ? (
        <div className='space-y-3'>
          <div className='relative'>
            <div className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted'>
              <Search className='h-4 w-4'/>
            </div>
            <input
              className='h-10 w-full rounded-xl border border-border-subtle bg-surface-base pl-9 pr-3 text-sm text-text-strong outline-none transition-all placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary-soft'
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder='Search organization users or enter an email'
              value={searchQuery}
            />
          </div>

          {searchQuery.trim().length > 0 ? (
            <div className='rounded-2xl border border-border-subtle bg-surface-base'>
              {searchResultsQuery.isLoading ? (
                <div className='px-4 py-4 text-sm text-text-muted'>Searching organization users…</div>
              ) : (searchResultsQuery.data?.length ?? 0) > 0 ? (
                <div className='divide-y divide-border-subtle'>
                  {searchResultsQuery.data!.map((result) => {
                    const existingDirectAccess = directAccessByUserId.get(result.userId)

                    if (existingDirectAccess) {
                      return (
                        <div className='flex flex-wrap items-center justify-between gap-3 px-4 py-4 text-sm' key={result.userId}>
                          <div>
                            <p className='font-medium text-text-strong'>{existingDirectAccess.name} already has explicit project access.</p>
                            <p className='mt-1 text-text-muted'>
                              Use the role picker in the explicit member list below if you need to change their project role.
                            </p>
                          </div>
                          <Badge variant='subtle'>{getLocalRoleLabel(existingDirectAccess.scopeRole)}</Badge>
                        </div>
                      )
                    }

                    const actionRoles = getSearchActionRoles(result.orgRole, snapshot.canEditProject, snapshot.canManageProject)

                    return (
                      <div className='flex flex-wrap items-center justify-between gap-3 px-4 py-4 text-sm' key={result.userId}>
                        <div className='min-w-0 flex-1'>
                          <p className='truncate font-medium text-text-strong'>{result.name}</p>
                          <p className='truncate text-xs text-text-muted'>{result.email}</p>
                          <p className='mt-1 text-xs text-text-muted'>
                            {buildSearchHint(result.orgRole, snapshot.canEditProject, snapshot.canManageProject)}
                          </p>
                        </div>
                        <div className='flex flex-wrap items-center justify-end gap-2'>
                          <Badge variant='subtle'>{result.orgRole}</Badge>
                          {actionRoles.map((role) => (
                            <Button
                              key={role}
                              onClick={() => handleAddAccess(result, role)}
                              size='compact'
                              type='button'
                              variant='secondary'
                            >
                              <UserPlus className='h-3.5 w-3.5'/>
                              {getProjectActionLabel(role)}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : showExistingProjectMemberState ? (
                <div className='flex flex-wrap items-center justify-between gap-3 px-4 py-4 text-sm'>
                  <div>
                    <p className='font-medium text-text-strong'>
                      {existingDirectAccessMatch?.name ?? emailQuery} already has explicit project access.
                    </p>
                    <p className='mt-1 text-text-muted'>
                      Use the role picker in the explicit member list below if you need to change their project role.
                    </p>
                  </div>
                  <Badge variant='subtle'>
                    {existingDirectAccessMatch ? getLocalRoleLabel(existingDirectAccessMatch.scopeRole) : 'Already on project'}
                  </Badge>
                </div>
              ) : showExternalInvite ? (
                <div className='flex flex-wrap items-center justify-between gap-3 px-4 py-4 text-sm'>
                  <div>
                    <p className='font-medium text-text-strong'>No organization user matched {emailQuery}.</p>
                    <p className='mt-1 text-text-muted'>{buildExternalProjectInviteCopy(snapshot.workspaceAccess)}</p>
                  </div>
                  <Button
                    disabled={createInviteMutation.isPending}
                    onClick={handleInviteGuest}
                    variant='secondary'
                  >
                    <Mail className='h-4 w-4'/>
                    Invite as guest
                  </Button>
                </div>
              ) : (
                <div className='px-4 py-4 text-sm text-text-muted'>No eligible people matched that search.</div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <div>
        <div className='mb-2 flex items-center gap-2'>
          <ShieldCheck className='h-4 w-4 text-text-muted'/>
          <h4 className='text-sm font-semibold text-text-strong'>Explicit project members</h4>
        </div>
        <p className='mb-3 text-sm text-text-muted'>{explicitMembershipCopy}</p>

        {sortedDirectAccess.length === 0 ? (
          <div className='rounded-2xl border border-dashed border-border-subtle px-4 py-8 text-center text-sm text-text-muted'>
            No explicit project members yet.
          </div>
        ) : (
          <div className='overflow-x-auto rounded-xl border border-border-subtle'>
            <table className='min-w-[52rem] w-full text-sm'>
              <thead>
                <tr className='border-b border-border-subtle bg-surface-muted text-left'>
                  <th className='px-4 py-2.5 font-medium text-text-muted'>Name</th>
                  <th className='px-4 py-2.5 font-medium text-text-muted'>Effective access</th>
                  <th className='px-4 py-2.5 font-medium text-text-muted'>Local role</th>
                  {snapshot.canManageProject ? (
                    <th className='px-4 py-2.5 text-right font-medium text-text-muted'>Actions</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {sortedDirectAccess.map((entry) => {
                  const isCurrentUser = entry.id === currentUserId
                  const managedRoleOptions = getManagedRoleOptions(entry.orgRole)
                  const protectsAdminFloor = entry.scopeRole === 'admin' && directAdminCount === 1

                  return (
                    <tr className='border-b border-border-subtle last:border-b-0 hover:bg-canvas-accent' key={entry.id}>
                      <td className='px-4 py-3'>
                        <div className='flex items-center gap-3'>
                          <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary'>
                            {getInitials(entry.name)}
                          </div>
                          <div className='min-w-0'>
                            <p className='truncate font-medium text-text-strong'>
                              {entry.name}
                              {isCurrentUser ? <span className='ml-1.5 text-xs text-text-muted'>(you)</span> : null}
                            </p>
                            <p className='truncate text-xs text-text-muted'>{entry.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className='px-4 py-3'>
                        <Badge variant={entry.effectiveRole === 'admin' ? 'primary' : 'subtle'}>
                          {getEffectiveAccessLabel(entry.effectiveRole)}
                        </Badge>
                      </td>
                      <td className='px-4 py-3'>
                        {snapshot.canManageProject ? (
                          <select
                            aria-label={`Local role for ${entry.name}`}
                            className='h-11 min-w-[11rem] rounded-lg border border-border-subtle bg-surface-elevated px-3 text-sm outline-none transition-all focus:border-primary disabled:cursor-not-allowed disabled:opacity-60'
                            disabled={protectsAdminFloor}
                            onChange={(event) => {
                              const nextRole = event.target.value as ScopeAccessRole
                              if (nextRole === entry.scopeRole) {
                                return
                              }

                              setRoleMutation.mutate(
                                {role: nextRole, userId: entry.id},
                                {
                                  onError: (error) => {
                                    toast({
                                      description: getErrorMessage(error, 'Rocketboard could not update project membership.'),
                                      title: 'Could not update role',
                                      variant: 'error',
                                    })
                                  },
                                },
                              )
                            }}
                            value={entry.scopeRole}
                          >
                            {managedRoleOptions.map((role) => (
                              <option key={role} value={role}>
                                {getLocalRoleLabel(role)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Badge variant={entry.scopeRole === 'admin' ? 'primary' : 'subtle'}>
                            {getLocalRoleLabel(entry.scopeRole)}
                          </Badge>
                        )}
                      </td>
                      {snapshot.canManageProject ? (
                        <td className='px-4 py-3 text-right'>
                          <div className='flex flex-col items-end gap-1'>
                            <Button
                              aria-label={
                                snapshot.projectAccess === 'open'
                                  ? `Remove ${entry.name} from project list`
                                  : `Remove ${entry.name} from project access`
                              }
                              className='h-11 w-11 rounded-xl'
                              disabled={protectsAdminFloor}
                              onClick={() => handleRemoveAccess(entry.id, entry.name)}
                              title={snapshot.projectAccess === 'open' ? 'Remove from project list' : 'Remove project access'}
                              type='button'
                              variant='icon'
                            >
                              <Trash2 className='h-4 w-4'/>
                            </Button>
                            {protectsAdminFloor ? (
                              <p className='max-w-[15rem] text-right text-xs text-text-muted'>
                                At least one project admin is required.
                              </p>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {snapshot.pendingInvites.length > 0 ? (
        <div className='rounded-2xl border border-border-subtle bg-surface-base px-4 py-4'>
          <h4 className='text-sm font-semibold text-text-strong'>Pending project invites</h4>
          <p className='mt-1 text-sm text-text-muted'>
            These invitations create explicit project membership after acceptance.
          </p>
          <div className='mt-3 flex flex-wrap gap-2'>
            {snapshot.pendingInvites.map((invite) => (
              <Badge key={invite.id} variant='subtle'>
                {invite.email}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {confirmDialogProps ? <ConfirmDialog {...confirmDialogProps}/> : null}
    </section>
  )
}
