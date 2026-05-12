import {ArrowLeft, Copy, Mail, MoreHorizontal, Search, Trash2} from 'lucide-react'
import {useNavigate, useParams, useSearch} from '@tanstack/react-router'
import {useEffect, useState} from 'react'

import {IS_SELF_HOSTED} from '../../app/config'
import {Badge} from '../../components/ui/badge'
import {Button} from '../../components/ui/button'
import {ConfirmDialog} from '../../components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import {useToast} from '../../components/ui/toast'
import {useConfirmDialog} from '../../hooks/useConfirmDialog'
import {cn} from '../../lib/cn'
import {useInviteFormHandler} from '../access/useInviteFormHandler'
import {useSessionQuery} from '../auth/session.queries'
import {OrganizationGitHubSettings} from '../github/components/OrganizationGitHubSettings'
import {useWorkspaceSummariesQuery} from '../projects/project-shell.queries'
import {getErrorMessage} from '../../platform/data/rpc-adapter'
import {useOrgEntitlementsQuery} from '../billing/entitlement.queries'
import {getAdminGrantState, getEffectivePlan} from '../billing/entitlement.types'
import {AdminPendingRequestsPanel} from './AdminPendingRequestsPanel'
import {BillingTab} from './BillingTab'
import {OrganizationJiraSettings} from '../jira/components/OrganizationJiraSettings'
import {InvoicesTab} from './InvoicesTab'
import {MemberInviteRequestPanel} from './MemberInviteRequestPanel'
import {OrganizationTab} from './OrganizationTab'
import {getOrgAccessMetrics} from './org-members.metrics'
import {useOrganizationRouteContextQuery} from './org-route.queries'
import type {OrgSettingsTab} from './org-settings.routes'
import type {OrgMember} from './org-settings.types'
import {
  useCreateOrgInviteMutation,
  useOrgMembersQuery,
  useRemoveOrgMemberMutation,
  useRevokeOrgInviteMutation,
  useSetOrgMemberRoleMutation,
} from './org-settings.queries'

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

const ACCESS_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const ROLE_OPTIONS = ['admin', 'member', 'guest'] as const

function formatRoleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

function formatAccessDate(value: string | null) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return ACCESS_DATE_FORMATTER.format(date)
}

function isRecentlyActive(lastActiveAt: string | null) {
  if (!lastActiveAt) {
    return false
  }

  const lastActiveTime = new Date(lastActiveAt).getTime()
  if (Number.isNaN(lastActiveTime)) {
    return false
  }

  return Date.now() - lastActiveTime <= ACTIVE_WINDOW_MS
}

const ALL_TABS: {key: OrgSettingsTab; label: string}[] = [
  {key: 'overview', label: 'Overview'},
  {key: 'members', label: 'Access'},
  {key: 'github', label: 'GitHub'},
  {key: 'jira', label: 'Jira'},
  {key: 'billing', label: 'Billing'},
  {key: 'invoices', label: 'Invoices'},
]

const SELF_HOSTED_HIDDEN_TABS: OrgSettingsTab[] = ['billing', 'invoices']

export function OrgSettingsPage() {
  const navigate = useNavigate()
  const params = useParams({strict: false}) as {orgSlug: string}
  const search = useSearch({strict: false}) as {invoiceHistory?: '1'; tab?: OrgSettingsTab}
  const organizationRouteQuery = useOrganizationRouteContextQuery(params.orgSlug)
  const orgId = organizationRouteQuery.data?.id ?? null
  const sessionQuery = useSessionQuery()
  const membersQuery = useOrgMembersQuery(orgId)
  const entitlementsQuery = useOrgEntitlementsQuery(orgId ?? '')
  const workspacesQuery = useWorkspaceSummariesQuery()
  const createInviteMutation = useCreateOrgInviteMutation(orgId ?? '')
  const revokeInviteMutation = useRevokeOrgInviteMutation(orgId ?? '')
  const removeMemberMutation = useRemoveOrgMemberMutation(orgId ?? '')
  const setRoleMutation = useSetOrgMemberRoleMutation(orgId ?? '')
  const {toast} = useToast()

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [copiedLink, setCopiedLink] = useState(false)

  const data = membersQuery.data
  const currentUserId = sessionQuery.data?.status === 'authenticated' ? sessionQuery.data.user.id : null
  const currentUserName = sessionQuery.data?.status === 'authenticated' ? sessionQuery.data.user.name : 'Someone'
  const canManage = data?.canManage ?? false
  const members = data?.members ?? []
  const invitations = data?.invitations ?? []
  const org = data?.organization
  const effectivePlan = entitlementsQuery.data
    ? getEffectivePlan(entitlementsQuery.data)
    : org?.plan === 'pro' || org?.plan === 'enterprise'
      ? org.plan
      : 'free'
  const grantState = entitlementsQuery.data ? getAdminGrantState(entitlementsQuery.data) : getAdminGrantState(null)
  const billingTabsHiddenForVip = grantState.kind === 'vip-active'
  const canAccessVipInvoiceHistory = billingTabsHiddenForVip && canManage && search.invoiceHistory === '1'
  const requestedTab: OrgSettingsTab = search.tab ?? 'overview'
  const shouldRedirectToOverview = (IS_SELF_HOSTED && SELF_HOSTED_HIDDEN_TABS.includes(requestedTab))
    || (billingTabsHiddenForVip && requestedTab === 'billing')
    || (billingTabsHiddenForVip && requestedTab === 'invoices' && !canAccessVipInvoiceHistory)
  const activeTab: OrgSettingsTab = shouldRedirectToOverview ? 'overview' : requestedTab
  const tabs = IS_SELF_HOSTED
    ? ALL_TABS.filter((t) => !SELF_HOSTED_HIDDEN_TABS.includes(t.key))
    : billingTabsHiddenForVip
      ? ALL_TABS.filter((t) => t.key !== 'billing' && t.key !== 'invoices')
      : ALL_TABS
  const accessMetrics = getOrgAccessMetrics(members)
  const adminCount = accessMetrics.adminCount
  const orgWorkspaces = workspacesQuery.data?.filter((w) => w.organizationSlug === params.orgSlug) ?? []
  const orgProjectCount = orgWorkspaces.reduce((sum, w) => sum + w.projects.length, 0)

  const adminInviteFormHandler = useInviteFormHandler({
    email: inviteEmail,
    guard: Boolean(org),
    isPending: createInviteMutation.isPending,
    onValid: (trimmedEmail) => {
      if (!org) return
      createInviteMutation.mutate(
        {
          email: trimmedEmail,
          inviterName: currentUserName,
          organizationName: org.name,
          role: inviteRole,
        },
        {
          onSuccess: (invite) => {
            setInviteEmail('')
            const downgradedToGuest = invite.role === 'guest' && inviteRole === 'member'
            toast({
              title: downgradedToGuest
                ? `${trimmedEmail} will join as a guest on the current plan`
                : IS_SELF_HOSTED
                  ? `Invite created for ${trimmedEmail}`
                  : `Invite emailed to ${trimmedEmail}`,
              description: downgradedToGuest
                ? 'Free organizations can keep additional people as guests until a member seat opens or the org upgrades to Pro.'
                : undefined,
            })
          },
          onError: (error) => {
            toast({
              description: getErrorMessage(error, 'Rocketboard could not send the invite email.'),
              title: 'Could not send invite',
            })
          },
        },
      )
    },
  })

  const handleInvite = adminInviteFormHandler.handleSubmit

  const handleCopyInviteLink = async () => {
    if (!org) return
    const link = `${window.location.origin}/accept-invite/${org.inviteLinkToken}`
    await navigator.clipboard?.writeText(link)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  useEffect(() => {
    if (!shouldRedirectToOverview) return
    void navigate({
      search: {tab: 'overview'} as never,
      to: '.',
    })
  }, [navigate, shouldRedirectToOverview])

  const setTab = (tab: OrgSettingsTab, invoiceHistory?: '1') => {
    void navigate({
      search: (invoiceHistory ? {invoiceHistory, tab} : {tab}) as never,
      to: '.',
    })
  }

  if (organizationRouteQuery.isPending || membersQuery.isPending) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-canvas'>
        <p className='text-sm text-text-muted'>Loading organization settings...</p>
      </div>
    )
  }

  if (!organizationRouteQuery.data || !data || !org) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-canvas'>
        <div className='text-center'>
          <p className='text-sm text-text-muted'>Organization not found or you don&apos;t have access.</p>
          <Button className='mt-4' onClick={() => navigate({to: '/'})} variant='secondary'>
            Go back
          </Button>
        </div>
      </div>
    )
  }

  const contentContainerClass = activeTab === 'members'
    ? 'w-full px-6 py-8'
    : 'mx-auto max-w-5xl px-6 py-8'

  return (
    <div className='min-h-screen bg-canvas'>
      <div className={contentContainerClass}>
        {/* Header */}
        <div className='mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div className='flex items-center gap-3'>
            <button
              className='rounded-lg p-1.5 text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong'
              onClick={() => navigate({to: '/'})}
              type='button'
            >
              <ArrowLeft className='h-4 w-4'/>
            </button>
            <h1 className='font-display text-2xl font-semibold text-text-strong'>{org.name} Settings</h1>
          </div>
          {canManage && grantState.kind === 'vip-scheduled' && grantState.startsAt ? (
            <Badge variant='plan-vip'>
              VIP starts {new Date(grantState.startsAt).toLocaleDateString()}
            </Badge>
          ) : null}
          {canManage && grantState.kind === 'vip-blocked' ? (
            <Badge variant='plan-vip'>VIP On Hold</Badge>
          ) : null}
        </div>

        {/* Tab bar */}
        <div className='mb-8 flex gap-1 border-b border-border-subtle'>
          {tabs.map((tab) => (
            <button
              className={`border-b-2 px-4 py-2.5 text-sm transition-colors ${
                activeTab === tab.key
                  ? 'border-primary font-medium text-primary'
                  : 'border-transparent text-text-muted hover:text-text-strong'
              }`}
              key={tab.key}
              onClick={() => setTab(tab.key)}
              type='button'
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'overview' ? (
          <OverviewContent
            aiWorkspaceGuidance={org.aiWorkspaceGuidance ?? null}
            canManage={canManage}
            canViewInvoiceHistory={billingTabsHiddenForVip && canManage}
            driftWatcherEnabled={org.driftWatcherEnabled ?? false}
            memberSeatCount={accessMetrics.memberSeatCount}
            onTabChange={setTab}
            onViewInvoiceHistory={() => setTab('invoices', '1')}
            orgId={org.id}
            orgName={org.name}
            orgSlug={org.slug}
            orgTimezone={org.timezone ?? null}
            projectCount={orgProjectCount}
            showActiveVipNotice={grantState.kind === 'vip-active' && canManage}
            showBillingSetup={effectivePlan === 'free'}
            workspaceCount={orgWorkspaces.length}
          />
        ) : null}

        {activeTab === 'members' ? (
          <MembersContent
            adminCount={adminCount}
            adminInviteFormHandler={adminInviteFormHandler}
            canManage={canManage}
            copiedLink={copiedLink}
            createInviteMutation={createInviteMutation}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            handleCopyInviteLink={handleCopyInviteLink}
            handleInvite={handleInvite}
            inviteEmail={inviteEmail}
            inviteRole={inviteRole}
            invitations={invitations}
            members={members}
            peopleCount={accessMetrics.peopleCount}
            org={org}
            removeMemberMutation={removeMemberMutation}
            revokeInviteMutation={revokeInviteMutation}
            setInviteEmail={setInviteEmail}
            setInviteRole={setInviteRole}
            setRoleMutation={setRoleMutation}
            toast={toast}
          />
        ) : null}

        {activeTab === 'github' ? (
          <OrganizationGitHubSettings
            canManage={canManage}
            orgId={org.id}
          />
        ) : null}

        {activeTab === 'jira' ? (
          <OrganizationJiraSettings
            canManage={canManage}
            orgId={org.id}
          />
        ) : null}

        {activeTab === 'billing' ? <BillingTab canManage={canManage} orgId={org.id}/> : null}
        {activeTab === 'invoices' ? <InvoicesTab canManage={canManage} orgId={org.id}/> : null}
      </div>
    </div>
  )
}

/* ---------- Overview tab ---------- */

function OverviewContent({
  aiWorkspaceGuidance,
  canManage,
  canViewInvoiceHistory,
  driftWatcherEnabled,
  memberSeatCount,
  onTabChange,
  onViewInvoiceHistory,
  orgId,
  orgName,
  orgSlug,
  orgTimezone,
  projectCount,
  showActiveVipNotice,
  showBillingSetup,
  workspaceCount,
}: {
  aiWorkspaceGuidance: string | null
  canManage: boolean
  canViewInvoiceHistory: boolean
  driftWatcherEnabled: boolean
  memberSeatCount: number
  onTabChange: (tab: OrgSettingsTab) => void
  onViewInvoiceHistory: () => void
  orgId: string
  orgName: string
  orgSlug: string
  orgTimezone: string | null
  projectCount: number
  showActiveVipNotice: boolean
  showBillingSetup: boolean
  workspaceCount: number
}) {
  const scrollToOrganizationDetails = () => {
    document.getElementById('organization-settings')?.scrollIntoView({behavior: 'smooth', block: 'start'})
  }

  return (
    <div className='space-y-6'>
      {showActiveVipNotice ? (
        <div className='rounded-xl border border-secondary/20 bg-secondary-soft/40 p-5'>
          <p className='text-sm font-medium text-text-strong'>VIP is now active.</p>
          <p className='mt-2 text-sm text-text-medium'>
            Billing is no longer required for this organization while VIP remains active.
          </p>
          {canViewInvoiceHistory ? (
            <button
              className='mt-3 text-sm text-text-muted underline-offset-2 hover:text-text-strong hover:underline'
              onClick={onViewInvoiceHistory}
              type='button'
            >
              View billing records
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Stat cards */}
      <div className='grid grid-cols-2 gap-4 sm:grid-cols-3'>
        <div className='rounded-xl border border-border-subtle bg-surface-base p-4'>
          <p className='font-mono text-xs font-medium uppercase tracking-wider text-text-muted'>Members</p>
          <p className='mt-1 font-display text-2xl font-semibold text-text-strong'>{memberSeatCount}</p>
        </div>
        <div className='rounded-xl border border-border-subtle bg-surface-base p-4'>
          <p className='font-mono text-xs font-medium uppercase tracking-wider text-text-muted'>Workspaces</p>
          <p className='mt-1 font-display text-2xl font-semibold text-text-strong'>{workspaceCount}</p>
        </div>
        <div className='rounded-xl border border-border-subtle bg-surface-base p-4'>
          <p className='font-mono text-xs font-medium uppercase tracking-wider text-text-muted'>Projects</p>
          <p className='mt-1 font-display text-2xl font-semibold text-text-strong'>{projectCount}</p>
        </div>
      </div>

      {/* Setup checklist (shown when < 3 members) */}
      {memberSeatCount < 3 ? (
        <div className='rounded-xl bg-primary/5 p-4'>
          <p className='text-sm font-medium text-text-strong'>Get started</p>
          <ul className='mt-2 space-y-2'>
            <li className='flex items-center gap-2 text-sm text-text-muted'>
              <span className='text-text-muted/60'>&#9744;</span>
              <button
                className='text-primary underline-offset-2 hover:underline'
                onClick={() => onTabChange('members')}
                type='button'
              >
                Invite a teammate
              </button>
            </li>
            {!IS_SELF_HOSTED && showBillingSetup && (
            <li className='flex items-center gap-2 text-sm text-text-muted'>
              <span className='text-text-muted/60'>&#9744;</span>
              <button
                className='text-primary underline-offset-2 hover:underline'
                onClick={() => onTabChange('billing')}
                type='button'
              >
                Set up billing
              </button>
            </li>
            )}
            <li className='flex items-center gap-2 text-sm text-text-muted'>
              <span className='text-text-muted/60'>&#9744;</span>
              <button
                className='text-primary underline-offset-2 hover:underline'
                onClick={scrollToOrganizationDetails}
                type='button'
              >
                Configure your org
              </button>
            </li>
          </ul>
        </div>
      ) : null}

      <div id='organization-settings'>
        <OrganizationTab
          aiWorkspaceGuidance={aiWorkspaceGuidance}
          canManage={canManage}
          driftWatcherEnabled={driftWatcherEnabled}
          orgId={orgId}
          orgName={orgName}
          orgSlug={orgSlug}
          orgTimezone={orgTimezone}
        />
      </div>
    </div>
  )
}

/* ---------- Members tab ---------- */

type MembersContentProps = {
  adminCount: number
  canManage: boolean
  adminInviteFormHandler: ReturnType<typeof useInviteFormHandler>
  copiedLink: boolean
  createInviteMutation: ReturnType<typeof useCreateOrgInviteMutation>
  currentUserId: string | null
  currentUserName: string
  handleCopyInviteLink: () => Promise<void>
  handleInvite: () => void
  inviteEmail: string
  inviteRole: string
  invitations: NonNullable<ReturnType<typeof useOrgMembersQuery>['data']>['invitations']
  members: NonNullable<ReturnType<typeof useOrgMembersQuery>['data']>['members']
  peopleCount: number
  org: NonNullable<NonNullable<ReturnType<typeof useOrgMembersQuery>['data']>['organization']>
  removeMemberMutation: ReturnType<typeof useRemoveOrgMemberMutation>
  revokeInviteMutation: ReturnType<typeof useRevokeOrgInviteMutation>
  setInviteEmail: (v: string) => void
  setInviteRole: (v: string) => void
  setRoleMutation: ReturnType<typeof useSetOrgMemberRoleMutation>
  toast: ReturnType<typeof useToast>['toast']
}

function MembersContent({
  adminCount,
  adminInviteFormHandler,
  canManage,
  copiedLink,
  createInviteMutation,
  currentUserId,
  currentUserName,
  handleCopyInviteLink,
  handleInvite,
  inviteEmail,
  inviteRole,
  invitations,
  members,
  peopleCount,
  org,
  removeMemberMutation,
  revokeInviteMutation,
  setInviteEmail,
  setInviteRole,
  setRoleMutation,
  toast,
}: MembersContentProps) {
  const {confirm, confirmDialogProps} = useConfirmDialog()
  const currentMember: OrgMember | undefined = members.find((m) => m.userId === currentUserId)
  const currentOrgRole: 'admin' | 'member' | 'guest' = (currentMember?.role === 'admin' || currentMember?.role === 'guest')
    ? currentMember.role
    : 'member'
  const adminMembers = members.filter((m) => m.role === 'admin')

  return (
    <>
      <div className='space-y-6'>
        {canManage ? (
          <div className='space-y-4'>
            <div className='rounded-2xl border border-border-subtle bg-surface-base p-4'>
              <h3 className='text-xs font-semibold uppercase tracking-wider text-text-muted'>Invites</h3>
              <div className='mt-3 flex flex-wrap gap-2'>
                <div className='relative min-w-[18rem] flex-1'>
                  <div className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted'>
                    <Search className='h-4 w-4'/>
                  </div>
                  <input
                    className='h-10 w-full rounded-xl border border-border-subtle bg-surface-elevated pl-9 pr-3 text-sm text-text-strong outline-none placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary-soft'
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={adminInviteFormHandler.handleKeyDown}
                    placeholder='Invite by email...'
                    type='text'
                    value={inviteEmail}
                  />
                </div>
                <select
                  className='h-10 rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm text-text-strong'
                  onChange={(e) => setInviteRole(e.target.value)}
                  value={inviteRole}
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>{formatRoleLabel(role)}</option>
                  ))}
                </select>
                <Button disabled={createInviteMutation.isPending} onClick={handleInvite} variant='primary'>
                  Add
                </Button>
              </div>
            </div>

            <AdminPendingRequestsPanel
              currentUserName={currentUserName}
              enabled={canManage}
              organizationId={org.id}
              organizationName={org.name}
            />

            <div className='rounded-2xl border border-border-subtle bg-surface-base p-4'>
              <h3 className='text-xs font-semibold uppercase tracking-wider text-text-muted'>Invite link</h3>
              <div className='mt-3 flex flex-wrap items-center gap-2'>
                <div className='min-w-[18rem] flex-1 rounded-xl bg-surface-muted px-3 py-2'>
                  <p className='truncate font-mono text-xs text-text-muted'>
                    {window.location.origin}/accept-invite/{org.inviteLinkToken}
                  </p>
                </div>
                <Button onClick={() => void handleCopyInviteLink()} size='compact' variant='secondary'>
                  <Copy className='h-3.5 w-3.5'/>
                  {copiedLink ? 'Copied!' : 'Copy'}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <MemberInviteRequestPanel
            admins={adminMembers}
            adminsLoading={false}
            currentOrgRole={currentOrgRole}
            currentUserId={currentUserId}
            organizationId={org.id}
            organizationName={org.name}
            organizationSlug={org.slug}
          />
        )}

        <div>
          <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
            <h3 className='text-xs font-semibold uppercase tracking-wider text-text-muted'>
              People with access ({peopleCount})
            </h3>
            <p className='text-xs text-text-muted'>Scroll horizontally to see invite and activity details.</p>
          </div>
          <div className='overflow-hidden rounded-2xl border border-border-subtle bg-surface-base'>
            <div className='overflow-x-auto'>
              <table className='w-full min-w-[1120px] text-sm'>
                <thead>
                  <tr className='border-b border-border-subtle bg-surface-muted text-left'>
                    <th className='sticky left-0 z-20 min-w-[240px] border-r border-border-subtle bg-surface-muted px-4 py-3 font-medium text-text-muted'>Name</th>
                    <th className='min-w-[240px] px-4 py-3 font-medium text-text-muted'>Email</th>
                    <th className='min-w-[160px] px-4 py-3 font-medium text-text-muted'>User role</th>
                    <th className='min-w-[120px] px-4 py-3 font-medium text-text-muted'>Status</th>
                    <th className='min-w-[140px] px-4 py-3 font-medium text-text-muted'>Joined</th>
                    <th className='min-w-[180px] px-4 py-3 font-medium text-text-muted'>Invited by</th>
                    <th className='min-w-[140px] px-4 py-3 font-medium text-text-muted'>Last active</th>
                    <th className='min-w-[96px] px-4 py-3 font-medium text-text-muted'>2FA</th>
                    {canManage ? (
                      <th className='w-12 px-4 py-3'>
                        <span className='sr-only'>Actions</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => {
                    const isCurrentUser = member.userId === currentUserId
                    const isAdmin = member.role === 'admin'
                    const isLastAdmin = isAdmin && adminCount <= 1
                    const isActive = isRecentlyActive(member.lastActiveAt)
                    const canEditRole = canManage && !isCurrentUser && !isLastAdmin

                    return (
                      <tr className='group border-b border-border-subtle last:border-b-0 hover:bg-canvas-accent' key={member.userId}>
                        <td
                          className={cn(
                            'sticky left-0 z-10 min-w-[240px] border-r border-border-subtle px-4 py-3 shadow-[6px_0_8px_-8px_rgba(15,23,42,0.28)]',
                            'bg-surface-base group-hover:bg-canvas-accent',
                          )}
                        >
                          <div className='flex min-w-0 items-center gap-3'>
                            <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary'>
                              {getInitials(member.name)}
                            </div>
                            <div className='min-w-0'>
                              <p className='truncate font-medium text-text-strong'>
                                {member.name}
                                {isCurrentUser ? <span className='ml-1.5 text-xs text-text-muted'>(you)</span> : null}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className='px-4 py-3 text-text-medium'>{member.email}</td>
                        <td className='px-4 py-3'>
                          {canManage ? (
                            <select
                              className='h-9 min-w-[8.5rem] rounded-lg border border-border-subtle bg-surface-elevated px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft disabled:cursor-not-allowed disabled:opacity-70'
                              disabled={!canEditRole || setRoleMutation.isPending}
                              onChange={(event) => {
                                const nextRole = event.target.value
                                if (nextRole === member.role) return

                                setRoleMutation.mutate({
                                  role: nextRole,
                                  userId: member.userId,
                                })
                              }}
                              value={member.role}
                            >
                              {ROLE_OPTIONS.map((role) => (
                                <option key={role} value={role}>{formatRoleLabel(role)}</option>
                              ))}
                            </select>
                          ) : (
                            <Badge variant='subtle'>{formatRoleLabel(member.role)}</Badge>
                          )}
                        </td>
                        <td className='px-4 py-3'>
                          <Badge variant={isActive ? 'primary' : 'subtle'}>
                            {isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className='px-4 py-3 text-text-medium'>{formatAccessDate(member.createdAt)}</td>
                        <td className='px-4 py-3 text-text-medium'>{member.invitedByName ?? '—'}</td>
                        <td className='px-4 py-3 text-text-medium'>{formatAccessDate(member.lastActiveAt)}</td>
                        <td className='px-4 py-3 text-text-muted'></td>
                        {canManage ? (
                          <td className='px-4 py-3 text-right'>
                            {!isCurrentUser && !isLastAdmin ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button aria-label={`Manage ${member.name}`} className='h-8 w-8 rounded-lg' variant='icon'>
                                    <MoreHorizontal className='h-4 w-4'/>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align='end'>
                                  <DropdownMenuItem
                                    className='text-error focus:bg-error/10 focus:text-error'
                                    onSelect={() => {
                                      void confirm({
                                        confirmLabel: 'Remove',
                                        title: `Remove ${member.name} from this organization?`,
                                        variant: 'destructive',
                                      }).then((confirmed) => {
                                        if (confirmed) {
                                          removeMemberMutation.mutate(member.userId)
                                        }
                                      })
                                    }}
                                  >
                                    <Trash2 className='h-4 w-4'/>
                                    Remove member
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : (
                              <span className='text-xs text-text-muted'>—</span>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {invitations.length > 0 ? (
          <div>
            <h3 className='mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted'>
              Invitations ({invitations.length})
            </h3>
            <div className='divide-y divide-border-subtle rounded-xl border border-border-subtle bg-surface-base'>
              {invitations.map((inv) => (
                <div className='flex items-center justify-between gap-3 px-4 py-3' key={inv.id}>
                  <div className='flex min-w-0 items-center gap-3'>
                    <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm text-primary'>
                      <Mail className='h-4 w-4'/>
                    </div>
                    <div className='min-w-0'>
                      <p className='truncate text-sm font-medium text-text-strong'>{inv.email}</p>
                      <p className='truncate text-xs text-text-muted'>
                        {inv.emailSentAt
                          ? `Sent ${new Date(inv.emailSentAt).toLocaleDateString()}`
                          : 'Email pending'}
                      </p>
                    </div>
                  </div>
                  <div className='flex shrink-0 items-center gap-2'>
                    <Badge variant='subtle'>{inv.role}</Badge>
                    {canManage ? (
                      <>
                        <Button
                          onClick={() => {
                            createInviteMutation.mutate(
                              {
                                email: inv.email,
                                inviterName: currentUserName,
                                organizationName: org.name,
                                role: inv.role,
                              },
                              {
                                onError: (error) => {
                                  toast({
                                    description: getErrorMessage(error, 'Rocketboard could not resend the invite email.'),
                                    title: 'Could not resend invite',
                                  })
                                },
                                onSuccess: () => toast({title: IS_SELF_HOSTED ? `Invite refreshed for ${inv.email}` : `Invite re-emailed to ${inv.email}`}),
                              },
                            )
                          }}
                          size='compact'
                          variant='ghost'
                        >
                          Resend
                        </Button>
                        <Button
                          onClick={() => revokeInviteMutation.mutate(inv.id)}
                          size='compact'
                          variant='ghost'
                        >
                          Revoke
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {confirmDialogProps ? <ConfirmDialog {...confirmDialogProps}/> : null}
    </>
  )
}
