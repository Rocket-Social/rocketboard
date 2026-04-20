import {useNavigate, useParams} from '@tanstack/react-router'
import {ArrowUpRight, Building2, Lock, Mail, Search, ShieldCheck, Trash2, UserPlus} from 'lucide-react'
import {useDeferredValue, useMemo, useState} from 'react'

import {Badge} from '../../components/ui/badge'
import {Button} from '../../components/ui/button'
import {ConfirmDialog} from '../../components/ui/confirm-dialog'
import {useToast} from '../../components/ui/toast'
import {useConfirmDialog} from '../../hooks/useConfirmDialog'
import {getErrorMessage} from '../../platform/data/rpc-adapter'
import {useSessionQuery} from '../auth/session.queries'
import {buildProjectAccessHref} from '../shell/route-helpers'
import {
  useAddWorkspaceAccessMutation,
  useCreateWorkspaceInviteMutation,
  useRemoveWorkspaceAccessMutation,
  useSearchWorkspaceMembersQuery,
  useSetWorkspaceAccessRoleMutation,
  useSetWorkspaceVisibilityMutation,
  useWorkspaceAccessProjectsQuery,
  useWorkspaceAccessQuery,
  useWorkspaceAccessRouteContextQuery,
} from './access.queries'
import type {
  OrganizationRole,
  ScopeAccessRole,
  WorkspaceDirectAccessEntry,
  WorkspaceMemberSearchResult,
} from './access.types'

function isEmailFormat(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
  }

  return name.slice(0, 2).toUpperCase()
}

function getEffectiveAccessLabel(role: WorkspaceDirectAccessEntry['effectiveRole']) {
  if (role === 'admin') return 'Admin'
  if (role === 'member') return 'Member'
  return 'Guest'
}

function getLocalRoleLabel(role: ScopeAccessRole) {
  if (role === 'admin') return 'Workspace admin'
  if (role === 'member') return 'Workspace member'
  return 'Workspace guest'
}

function buildWorkspacePolicyCopy(workspaceAccess: 'open' | 'private') {
  if (workspaceAccess === 'private') {
    return 'This workspace is private. Only explicit workspace members can see the workspace name or its contents. Organization role still decides who can edit once they are in scope.'
  }

  return 'This workspace is open to the organization. Explicit workspace members still matter here as the local admin list, the curated local list, and the workspace invite target.'
}

function buildExplicitMembershipCopy(workspaceAccess: 'open' | 'private') {
  if (workspaceAccess === 'private') {
    return 'These explicit workspace members are the real access list for this private workspace.'
  }

  return 'These explicit workspace members are the curated local list for this open workspace. Removing someone here only removes the explicit workspace row. It does not revoke inherited open-workspace access or change explicit project memberships.'
}

function buildGuestCopy(currentOrgRole: OrganizationRole) {
  if (currentOrgRole !== 'guest') {
    return null
  }

  return 'You have organization guest access. Guests can view shared workspace content but cannot edit it.'
}

function sortScopeRole(role: ScopeAccessRole) {
  if (role === 'admin') return 0
  if (role === 'member') return 1
  return 2
}

function getSearchActionRoles(targetOrgRole: OrganizationRole, canManageWorkspace: boolean) {
  if (targetOrgRole === 'guest') {
    return ['guest'] as ScopeAccessRole[]
  }

  return canManageWorkspace
    ? ['admin', 'member'] as ScopeAccessRole[]
    : ['member'] as ScopeAccessRole[]
}

function getManagedRoleOptions(orgRole: OrganizationRole) {
  if (orgRole === 'guest') {
    return ['guest'] as ScopeAccessRole[]
  }

  return ['admin', 'member'] as ScopeAccessRole[]
}

function getWorkspaceActionLabel(role: ScopeAccessRole) {
  if (role === 'admin') return 'Add as admin'
  if (role === 'member') return 'Add as member'
  return 'Add as guest'
}

function buildSearchHint(orgRole: OrganizationRole, canManageWorkspace: boolean) {
  if (orgRole === 'guest') {
    return 'Organization guests can only be added as local guests.'
  }

  if (canManageWorkspace) {
    return 'Org admins and members can only be local admins or members.'
  }

  return 'Editors can add org admins and members as local members only.'
}

export function WorkspaceAccessPage() {
  const navigate = useNavigate()
  const params = useParams({strict: false}) as {orgSlug: string; workspaceSlug: string}
  const {toast} = useToast()
  const {confirm, confirmDialogProps} = useConfirmDialog()
  const sessionQuery = useSessionQuery()
  const routeContextQuery = useWorkspaceAccessRouteContextQuery(params.orgSlug ?? null, params.workspaceSlug ?? null)
  const workspace = routeContextQuery.data
  const snapshotQuery = useWorkspaceAccessQuery(workspace?.workspaceId ?? null)
  const workspaceProjectsQuery = useWorkspaceAccessProjectsQuery(workspace?.workspaceId ?? null)
  const snapshot = snapshotQuery.data
  const [searchQuery, setSearchQuery] = useState('')
  const deferredQuery = useDeferredValue(searchQuery)

  const searchResultsQuery = useSearchWorkspaceMembersQuery(workspace?.workspaceId ?? null, deferredQuery)
  const addAccessMutation = useAddWorkspaceAccessMutation(workspace?.workspaceId ?? 'missing-workspace')
  const removeAccessMutation = useRemoveWorkspaceAccessMutation(workspace?.workspaceId ?? 'missing-workspace')
  const setRoleMutation = useSetWorkspaceAccessRoleMutation(workspace?.workspaceId ?? 'missing-workspace')
  const createInviteMutation = useCreateWorkspaceInviteMutation(
    workspace?.workspaceId ?? 'missing-workspace',
    params.orgSlug,
    params.workspaceSlug,
  )
  const setVisibilityMutation = useSetWorkspaceVisibilityMutation(
    workspace?.workspaceId ?? 'missing-workspace',
    params.orgSlug,
    params.workspaceSlug,
  )

  const currentUserName = sessionQuery.data?.status === 'authenticated'
    ? sessionQuery.data.user.name
    : 'Someone'
  const currentUserId = sessionQuery.data?.status === 'authenticated'
    ? sessionQuery.data.user.id
    : null

  const canInvite = Boolean(snapshot && (snapshot.canManageWorkspace || snapshot.canEditWorkspace))
  const emailQuery = searchQuery.trim()
  const normalizedEmailQuery = emailQuery.toLowerCase()
  const directAccessByUserId = useMemo(
    () => new Map((snapshot?.directAccess ?? []).map((entry) => [entry.id, entry])),
    [snapshot?.directAccess],
  )
  const existingDirectAccessMatch = normalizedEmailQuery.length > 0
    ? snapshot?.directAccess.find((entry) => entry.email.trim().toLowerCase() === normalizedEmailQuery) ?? null
    : null
  const showExistingWorkspaceMemberState = Boolean(existingDirectAccessMatch) && isEmailFormat(emailQuery)
  const showExternalInvite = canInvite
    && emailQuery.length > 0
    && isEmailFormat(emailQuery)
    && !searchResultsQuery.isLoading
    && (searchResultsQuery.data?.length ?? 0) === 0
    && !showExistingWorkspaceMemberState

  const sortedDirectAccess = useMemo(
    () => snapshot
      ? [...snapshot.directAccess].sort((left, right) => {
          const scopeOrder = sortScopeRole(left.scopeRole) - sortScopeRole(right.scopeRole)
          if (scopeOrder !== 0) return scopeOrder

          const effectiveOrder = sortScopeRole(left.effectiveRole as ScopeAccessRole) - sortScopeRole(right.effectiveRole as ScopeAccessRole)
          if (effectiveOrder !== 0) return effectiveOrder

          return left.name.localeCompare(right.name)
        })
      : [],
    [snapshot],
  )

  if (routeContextQuery.isPending) {
    return <div className='py-12 text-center text-sm text-text-muted'>Loading workspace access…</div>
  }

  if (!workspace) {
    return <div className='py-12 text-center text-sm text-text-muted'>Workspace not found or you do not have access.</div>
  }

  if (snapshotQuery.isPending || workspaceProjectsQuery.isPending) {
    return <div className='py-12 text-center text-sm text-text-muted'>Loading workspace access…</div>
  }

  if (!snapshot) {
    return <div className='py-12 text-center text-sm text-text-muted'>Workspace not found or you do not have access.</div>
  }

  const guestCopy = buildGuestCopy(snapshot.currentOrgRole)
  const policyCopy = buildWorkspacePolicyCopy(snapshot.workspaceAccess)
  const explicitMembershipCopy = buildExplicitMembershipCopy(snapshot.workspaceAccess)
  const editableCollaboratorCount = snapshot.collaborators.filter((entry) => entry.canEdit).length
  const readOnlyCollaboratorCount = snapshot.collaborators.filter((entry) => !entry.canEdit).length
  const explicitAdminCount = snapshot.directAccess.filter((entry) => entry.scopeRole === 'admin').length
  const manageableProjects = workspaceProjectsQuery.data ?? []

  const handleAddAccess = (result: WorkspaceMemberSearchResult, role: ScopeAccessRole) => {
    const existingDirectAccess = directAccessByUserId.get(result.userId)

    if (existingDirectAccess) {
      toast({
        description: 'Use the role picker in the explicit member list below if you need to change their workspace role.',
        title: `${existingDirectAccess.name} already has explicit workspace access`,
        variant: 'error',
      })
      return
    }

    const allowedRoles = getSearchActionRoles(result.orgRole, snapshot.canManageWorkspace)
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
            description: getErrorMessage(error, 'Rocketboard could not update workspace membership.'),
            title: 'Could not update workspace membership',
            variant: 'error',
          })
        },
        onSuccess: () => {
          setSearchQuery('')
          toast({title: 'Workspace membership updated'})
        },
      },
    )
  }

  const handleInviteGuest = () => {
    if (!workspace || emailQuery.length === 0) return

    createInviteMutation.mutate(
      {
        email: emailQuery,
        inviterName: currentUserName,
        role: 'guest',
        workspaceName: workspace.workspaceName,
      },
      {
        onError: (error) => {
          toast({
            description: getErrorMessage(error, 'Rocketboard could not send the workspace invite.'),
            title: 'Could not send workspace invite',
            variant: 'error',
          })
        },
        onSuccess: () => {
          setSearchQuery('')
          toast({title: 'Workspace guest invite sent'})
        },
      },
    )
  }

  const handleRemoveAccess = (userId: string, name: string) => {
    const title = snapshot.workspaceAccess === 'open'
      ? `Remove ${name} from the explicit workspace list?`
      : `Remove ${name}'s workspace access?`
    const description = snapshot.workspaceAccess === 'open'
      ? 'This removes only the explicit workspace row. They may still inherit access to open workspace content, and any explicit project memberships stay in place.'
      : 'This removes workspace access and also clears their explicit memberships from every project in this workspace.'

    void confirm({
      confirmLabel: snapshot.workspaceAccess === 'open' ? 'Remove from list' : 'Remove access',
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
              description: getErrorMessage(error, 'Rocketboard could not update workspace membership.'),
              title: 'Could not remove workspace membership',
              variant: 'error',
            })
          },
        },
      )
    })
  }

  return (
    <div className='w-full max-w-none px-6 py-8'>
      <div className='flex items-start justify-between gap-4'>
        <div>
          <h1 className='font-display text-2xl font-semibold text-text-strong'>{workspace.workspaceName} Access</h1>
          <p className='mt-2 max-w-3xl text-sm text-text-medium'>{policyCopy}</p>
        </div>
        <div className='flex flex-wrap gap-2 text-xs'>
          <Badge variant='subtle'>{editableCollaboratorCount} can edit</Badge>
          <Badge variant='subtle'>{readOnlyCollaboratorCount} view only</Badge>
          <Badge variant='subtle'>{explicitAdminCount} explicit admins</Badge>
          <Badge variant='subtle'>{snapshot.pendingInvites.length} pending workspace invites</Badge>
        </div>
      </div>

      {guestCopy ? (
        <div className='mt-4 rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning'>
          {guestCopy} My Notes stays personal and editable even for guests.
        </div>
      ) : null}

      <div className='mt-4 rounded-2xl border border-border-subtle bg-surface-base px-4 py-3 text-sm text-text-medium'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex items-center gap-2 font-medium text-text-strong'>
            <Building2 className='h-4 w-4 text-text-muted'/>
            Organization: {workspace.organizationName}
          </div>
          {snapshot.canManageWorkspace ? (
            <label className='flex items-center gap-2 text-sm text-text-strong'>
              <span>Visibility</span>
              <select
                className='h-10 rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                onChange={(event) => {
                  const nextAccess = event.target.value as 'open' | 'private'
                  if (nextAccess === snapshot.workspaceAccess) return

                  setVisibilityMutation.mutate(
                    {access: nextAccess},
                    {
                      onError: (error) => {
                        toast({
                          description: getErrorMessage(error, 'Rocketboard could not update workspace visibility.'),
                          title: 'Could not update visibility',
                          variant: 'error',
                        })
                      },
                    },
                  )
                }}
                value={snapshot.workspaceAccess}
              >
                <option value='open'>Open to organization</option>
                <option value='private'>Private workspace</option>
              </select>
            </label>
          ) : (
            <Badge variant='subtle'>{snapshot.workspaceAccess === 'open' ? 'Open to organization' : 'Private workspace'}</Badge>
          )}
        </div>
        <p className='mt-2'>
          Explicit rows are the local list. Org admins and members cannot be workspace guests. At least one workspace admin must remain.
        </p>
      </div>

      {canInvite ? (
        <div className='mt-5 space-y-3'>
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
                            <p className='font-medium text-text-strong'>{existingDirectAccess.name} already has explicit workspace access.</p>
                            <p className='mt-1 text-text-muted'>
                              Use the role picker in the explicit member list below if you need to change their workspace role.
                            </p>
                          </div>
                          <Badge variant='subtle'>{getLocalRoleLabel(existingDirectAccess.scopeRole)}</Badge>
                        </div>
                      )
                    }

                    const actionRoles = getSearchActionRoles(result.orgRole, snapshot.canManageWorkspace)

                    return (
                      <div className='flex flex-wrap items-center justify-between gap-3 px-4 py-4 text-sm' key={result.userId}>
                        <div className='min-w-0 flex-1'>
                          <p className='truncate font-medium text-text-strong'>{result.name}</p>
                          <p className='truncate text-xs text-text-muted'>{result.email}</p>
                          <p className='mt-1 text-xs text-text-muted'>{buildSearchHint(result.orgRole, snapshot.canManageWorkspace)}</p>
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
                              {getWorkspaceActionLabel(role)}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : showExistingWorkspaceMemberState ? (
                <div className='flex flex-wrap items-center justify-between gap-3 px-4 py-4 text-sm'>
                  <div>
                    <p className='font-medium text-text-strong'>
                      {existingDirectAccessMatch?.name ?? emailQuery} already has explicit workspace access.
                    </p>
                    <p className='mt-1 text-text-muted'>
                      Use the role picker in the explicit member list below if you need to change their workspace role.
                    </p>
                  </div>
                  <Badge variant='subtle'>
                    {existingDirectAccessMatch ? getLocalRoleLabel(existingDirectAccessMatch.scopeRole) : 'Already on workspace'}
                  </Badge>
                </div>
              ) : showExternalInvite ? (
                <div className='flex flex-wrap items-center justify-between gap-3 px-4 py-4 text-sm'>
                  <div>
                    <p className='font-medium text-text-strong'>No organization user matched {emailQuery}.</p>
                    <p className='mt-1 text-text-muted'>
                      External workspace invites always create organization guests plus workspace guests.
                    </p>
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

      <div className='mt-5'>
        <div className='mb-2 flex items-center gap-2'>
          <ShieldCheck className='h-4 w-4 text-text-muted'/>
          <h4 className='text-sm font-semibold text-text-strong'>Explicit workspace members</h4>
        </div>
        <p className='mb-3 text-sm text-text-muted'>{explicitMembershipCopy}</p>

        {sortedDirectAccess.length === 0 ? (
          <div className='rounded-2xl border border-dashed border-border-subtle px-4 py-8 text-center text-sm text-text-muted'>
            No explicit workspace members yet.
          </div>
        ) : (
          <div className='overflow-x-auto rounded-xl border border-border-subtle'>
            <table className='min-w-[52rem] w-full text-sm'>
              <thead>
                <tr className='border-b border-border-subtle bg-surface-muted text-left'>
                  <th className='px-4 py-2.5 font-medium text-text-muted'>Name</th>
                  <th className='px-4 py-2.5 font-medium text-text-muted'>Effective access</th>
                  <th className='px-4 py-2.5 font-medium text-text-muted'>Local role</th>
                  {snapshot.canManageWorkspace ? (
                    <th className='px-4 py-2.5 text-right font-medium text-text-muted'>Actions</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {sortedDirectAccess.map((entry) => {
                  const isCurrentUser = entry.id === currentUserId
                  const managedRoleOptions = getManagedRoleOptions(entry.orgRole)
                  const protectsManagerFloor = entry.scopeRole === 'admin' && explicitAdminCount === 1

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
                        {snapshot.canManageWorkspace ? (
                          <select
                            aria-label={`Local role for ${entry.name}`}
                            className='h-11 min-w-[11rem] rounded-lg border border-border-subtle bg-surface-elevated px-3 text-sm outline-none transition-all focus:border-primary disabled:cursor-not-allowed disabled:opacity-60'
                            disabled={protectsManagerFloor}
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
                                      description: getErrorMessage(error, 'Rocketboard could not update workspace membership.'),
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
                      {snapshot.canManageWorkspace ? (
                        <td className='px-4 py-3 text-right'>
                          <div className='flex flex-col items-end gap-1'>
                            <Button
                              aria-label={
                                snapshot.workspaceAccess === 'open'
                                  ? `Remove ${entry.name} from workspace list`
                                  : `Remove ${entry.name} from workspace access`
                              }
                              className='h-11 w-11 rounded-xl'
                              disabled={protectsManagerFloor}
                              onClick={() => handleRemoveAccess(entry.id, entry.name)}
                              title={snapshot.workspaceAccess === 'open' ? 'Remove from workspace list' : 'Remove workspace access'}
                              type='button'
                              variant='icon'
                            >
                              <Trash2 className='h-4 w-4'/>
                            </Button>
                            {protectsManagerFloor ? (
                              <p className='max-w-[15rem] text-right text-xs text-text-muted'>At least one workspace admin is required.</p>
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
        <div className='mt-5 rounded-2xl border border-border-subtle bg-surface-base px-4 py-4'>
          <h4 className='text-sm font-semibold text-text-strong'>Pending workspace invites</h4>
          <p className='mt-1 text-sm text-text-muted'>
            These invitations create explicit workspace membership after acceptance.
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

      {manageableProjects.length > 0 ? (
        <div className='mt-5 rounded-2xl border border-border-subtle bg-surface-base px-4 py-4'>
          <div className='flex items-center gap-2'>
            <ShieldCheck className='h-4 w-4 text-text-muted'/>
            <h4 className='text-sm font-semibold text-text-strong'>Project access in this workspace</h4>
          </div>
          <p className='mt-1 text-sm text-text-muted'>
            Use this when a private project is hidden from normal sidebar navigation but still needs membership management.
          </p>
          <div className='mt-4 space-y-3'>
            {manageableProjects.map((project) => (
              <div
                className='flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle px-4 py-3'
                key={project.projectId}
              >
                <div className='min-w-0'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <p className='truncate text-sm font-medium text-text-strong'>{project.projectName}</p>
                    <Badge variant='subtle'>{project.projectAccess === 'open' ? 'Open project' : 'Private project'}</Badge>
                    {!project.canAccessProject ? (
                      <Badge variant='subtle'>
                        <Lock className='mr-1 inline h-3 w-3'/>
                        Management only
                      </Badge>
                    ) : null}
                  </div>
                  <p className='mt-1 text-xs text-text-muted'>
                    {project.canAccessProject
                      ? 'You can open the project normally and manage access there as well.'
                      : 'You can manage membership here without opening private project contents.'}
                  </p>
                </div>
                <Button
                  onClick={() => {
                    void navigate({
                      href: buildProjectAccessHref(params.orgSlug, params.workspaceSlug, project.projectSlug),
                    })
                  }}
                  variant='secondary'
                >
                  <ArrowUpRight className='h-4 w-4'/>
                  Manage project access
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {confirmDialogProps ? <ConfirmDialog {...confirmDialogProps}/> : null}
    </div>
  )
}
