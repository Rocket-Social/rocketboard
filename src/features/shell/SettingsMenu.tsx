import {
  AlertTriangle,
  Archive,
  Building2,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  GitPullRequest,
  Key,
  Loader2,
  LogOut,
  Moon,
  Palette,
  Settings,
  Sun,
  Trash2,
  User,
  UserPlus,
  Users,
} from 'lucide-react'
import {useEffect, useMemo, useRef, useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {useNavigate} from '@tanstack/react-router'

import type {Mode} from '../../app/mode'
import {DropdownMenuContent} from '../../components/ui/dropdown-menu'
import {useToast} from '../../components/ui/toast'
import {UserAvatar} from '../../components/ui/user-avatar'
import {cn} from '../../lib/cn'
import type {WeekStartsOn} from '../../lib/week-preferences'
import type {SessionUser} from '../auth/data'
import {validateAndSaveGitHubToken, disconnectGitHub} from '../github/github.connect'
import {personalGitHubSourcesQueryOptions} from '../github/github.queries'
import type {WorkspaceSummary} from '../projects/project-shell.types'
import {
  buildOrgSettingsHref,
  buildWorkspaceAccessHref,
  buildWorkspaceArchiveHref,
  buildWorkspaceTrashHref,
} from './route-helpers'
import {buildProjectRouteHref} from '../search/workspace-palette-navigation'

const weekStartOptions: Array<{label: string; value: WeekStartsOn}> = [
  {label: 'Sunday', value: 'sunday'},
  {label: 'Monday', value: 'monday'},
]

type SettingsMenuProps = {
  currentMode: Mode
  currentUser: SessionUser
  currentWorkspace: WorkspaceSummary
  isOpen: boolean
  onMenuOpenChange: (open: boolean) => void
  onOpenAccountSettings: () => boolean | void
  onOpenApiKeys: () => boolean | void | Promise<boolean | void>
  onOpenCreateWorkspace?: () => boolean | void | Promise<boolean | void>
  onSaveWeekStartsOn: (value: WeekStartsOn) => Promise<void>
  onSelectMode: (mode: Mode) => void
  onSignOut: () => boolean | void | Promise<boolean | void>
  onWorkspaceSelect: (workspaceSlug: string, orgSlug?: string) => boolean | void | Promise<boolean | void>
  workspaces: WorkspaceSummary[]
}

type SettingsSubmenu = 'none' | 'theme' | 'integrations' | 'date-settings'

const menuButtonClass =
  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-canvas-accent'

export function SettingsMenu({
  currentMode,
  currentUser,
  currentWorkspace,
  isOpen,
  onMenuOpenChange,
  onOpenAccountSettings,
  onOpenApiKeys,
  onSaveWeekStartsOn,
  onSelectMode,
  onSignOut,
  onWorkspaceSelect,
  workspaces,
}: SettingsMenuProps) {
  const navigate = useNavigate()
  const [settingsSubmenu, setSettingsSubmenu] = useState<SettingsSubmenu>('none')

  useEffect(() => {
    if (!isOpen) {
      setSettingsSubmenu('none')
    }
  }, [isOpen])

  const runMenuAction = (action: () => boolean | void | Promise<boolean | void>) => {
    const result = action()

    if (result && typeof result === 'object' && 'then' in result) {
      void result.then((resolved) => {
        if (resolved !== false) {
          onMenuOpenChange(false)
        }
      })
      return
    }

    if (result !== false) {
      onMenuOpenChange(false)
    }
  }

  const organizations = useMemo(() => {
    const orgMap = new Map<string, {id: string; name: string; slug: string; workspaceCount: number}>()
    for (const ws of workspaces) {
      const existing = orgMap.get(ws.organizationId)
      if (existing) {
        existing.workspaceCount++
      } else {
        orgMap.set(ws.organizationId, {
          id: ws.organizationId,
          name: ws.organizationName || ws.name,
          slug: ws.organizationSlug,
          workspaceCount: 1,
        })
      }
    }
    return Array.from(orgMap.values())
  }, [workspaces])

  const currentOrgSlug = currentWorkspace.organizationSlug

  return (
    <DropdownMenuContent align='end' className='w-[480px] rounded-2xl p-0'>
      <div className='flex flex-row'>
        {/* Left Panel — Organization Selector */}
        <div className='flex w-[180px] flex-col border-r border-border-subtle bg-surface-muted'>
          <div className='px-4 pb-2 pt-4 font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted'>
            Organization
          </div>
          <div className='min-h-0 flex-1 overflow-y-auto px-2'>
            {organizations.map((org) => {
              const isSelected = org.slug === currentOrgSlug

              return (
                <button
                  className={cn(
                    menuButtonClass,
                    isSelected ? 'bg-canvas-accent text-text-strong' : 'text-text-medium',
                  )}
                  key={org.id}
                  onClick={() => {
                    const firstWs = workspaces.find((ws) => ws.organizationSlug === org.slug)
                    if (firstWs) runMenuAction(() => onWorkspaceSelect(firstWs.slug, firstWs.organizationSlug))
                  }}
                  type='button'
                >
                  <div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[10px] font-bold text-primary'>
                    <Building2 className='h-3.5 w-3.5'/>
                  </div>
                  <div className='min-w-0 flex-1'>
                    <p className='truncate text-sm font-medium'>{org.name}</p>
                    <p className='truncate text-[11px] text-text-muted'>{org.workspaceCount} workspace{org.workspaceCount !== 1 ? 's' : ''}</p>
                  </div>
                  {isSelected ? <Check className='h-3.5 w-3.5 shrink-0 text-primary'/> : null}
                </button>
              )
            })}
          </div>

          {/* Log out — bottom of left panel */}
          <div className='border-t border-border-subtle p-2'>
            <button
              className={cn(menuButtonClass, 'text-text-muted hover:text-text-strong')}
              onClick={() => runMenuAction(onSignOut)}
              type='button'
            >
              <LogOut className='h-4 w-4 shrink-0'/>
              <span className='text-sm'>Log out</span>
            </button>
          </div>
        </div>

        {/* Right Panel — Account & Settings */}
        <div className='flex flex-1 flex-col gap-1 p-3'>
          {/* User info */}
          <div className='flex items-center gap-3 pb-2'>
            <UserAvatar
              avatarUrl={currentUser.avatarUrl}
              className='h-11 w-11'
              fallback={currentUser.initials}
              name={currentUser.name}
            />
            <div className='min-w-0 flex-1'>
              <p className='truncate text-base font-semibold text-text-strong'>{currentUser.name}</p>
              <p className='truncate text-sm text-text-muted'>{currentUser.email}</p>
            </div>
          </div>

          {/* Admin actions */}
          <div className='flex flex-col'>
            <button
              className={cn(menuButtonClass, 'text-text-medium')}
              onClick={() => runMenuAction(() => {
                void navigate({href: buildOrgSettingsHref(currentWorkspace.organizationSlug)})
              })}
              type='button'
            >
              <Settings className='h-4 w-4 shrink-0 text-text-muted'/>
              <span>Admin console</span>
            </button>


            <button
              className={cn(menuButtonClass, 'text-text-medium')}
              onClick={() => runMenuAction(() => {
                void navigate({href: `${buildOrgSettingsHref(currentWorkspace.organizationSlug)}?tab=members`})
              })}
              type='button'
            >
              <UserPlus className='h-4 w-4 shrink-0 text-text-muted'/>
              <span>Organization access</span>
            </button>

            <button
              className={cn(menuButtonClass, 'text-text-medium')}
              onClick={() => runMenuAction(() => {
                void navigate({href: buildWorkspaceAccessHref(currentWorkspace.organizationSlug, currentWorkspace.slug)})
              })}
              type='button'
            >
              <Building2 className='h-4 w-4 shrink-0 text-text-muted'/>
              <span>Workspace access</span>
            </button>

            <button
              className={cn(menuButtonClass, 'text-text-medium')}
              onClick={() => {
                const firstProject = currentWorkspace.projects[0]
                const overviewView = firstProject?.projectViews.find((view) => view.viewType === 'overview')
                if (!firstProject || !overviewView) return
                runMenuAction(() => {
                  void navigate({
                    href: `${buildProjectRouteHref({
                      orgSlug: currentWorkspace.organizationSlug,
                      projectSlug: firstProject.slug,
                      viewId: overviewView.id,
                      viewType: 'overview',
                      workspaceSlug: currentWorkspace.slug,
                    })}?panel=access`,
                  })
                })
              }}
              type='button'
            >
              <Users className='h-4 w-4 shrink-0 text-text-muted'/>
              <span>Project access</span>
            </button>
          </div>

          <div className='my-1 h-px bg-border-subtle'/>

          {/* Settings */}
          <div className='flex flex-col'>
            <button
              className={cn(menuButtonClass, 'text-text-medium')}
              onClick={() => runMenuAction(onOpenAccountSettings)}
              type='button'
            >
              <User className='h-4 w-4 shrink-0 text-text-muted'/>
              <span>Profile</span>
            </button>

            <button
              className={cn(menuButtonClass, 'text-text-medium')}
              onClick={() => runMenuAction(onOpenApiKeys)}
              type='button'
            >
              <Key className='h-4 w-4 shrink-0 text-text-muted'/>
              <span>API Keys</span>
            </button>

            {/* Date Settings */}
            <div className='relative'>
              <button
                className={cn(
                  menuButtonClass,
                  'text-text-medium',
                  settingsSubmenu === 'date-settings' ? 'bg-canvas-accent' : '',
                )}
                onClick={() => setSettingsSubmenu(settingsSubmenu === 'date-settings' ? 'none' : 'date-settings')}
                type='button'
              >
                <Calendar className='h-4 w-4 shrink-0 text-text-muted'/>
                <span>Date settings</span>
                <ChevronRight className='ml-auto h-3.5 w-3.5 text-text-muted'/>
              </button>

              {settingsSubmenu === 'date-settings' ? (
                <DateSettingsSubmenu
                  currentWeekStartsOn={currentUser.weekStartsOn}
                  onBack={() => setSettingsSubmenu('none')}
                  onSave={onSaveWeekStartsOn}
                />
              ) : null}
            </div>

            {/* Set theme — inline, no nested submenu */}
            <div className='relative'>
              <button
                className={cn(
                  menuButtonClass,
                  'text-text-medium',
                  settingsSubmenu === 'theme' ? 'bg-canvas-accent' : '',
                )}
                onClick={() => setSettingsSubmenu(settingsSubmenu === 'theme' ? 'none' : 'theme')}
                type='button'
              >
                <Palette className='h-4 w-4 shrink-0 text-text-muted'/>
                <span>Appearance</span>
                <ChevronRight className='ml-auto h-3.5 w-3.5 text-text-muted'/>
              </button>

              {settingsSubmenu === 'integrations' ? (
                <GitHubIntegrationSubmenu
                  currentOrgSlug={currentOrgSlug}
                  currentUserId={currentUser.id}
                  onBack={() => setSettingsSubmenu('none')}
                />
              ) : null}

              {settingsSubmenu === 'theme' ? (
                <div className='absolute bottom-0 left-[calc(100%+8px)] z-50 min-w-[200px] rounded-xl border border-border-subtle bg-surface-elevated p-2 shadow-elevated'>
                  <button
                    className={cn(menuButtonClass, 'font-medium text-text-muted')}
                    onClick={() => setSettingsSubmenu('none')}
                    type='button'
                  >
                    <ChevronLeft className='h-3.5 w-3.5 text-text-muted'/>
                    <span>Appearance</span>
                  </button>

                  <div className='my-1 h-px bg-border-subtle'/>

                  <button
                    className={cn(menuButtonClass, 'text-text-medium')}
                    onClick={() => onSelectMode('light')}
                    type='button'
                  >
                    <Sun className='h-4 w-4 shrink-0'/>
                    <span>Light</span>
                    {currentMode === 'light' ? <Check className='ml-auto h-4 w-4 text-primary'/> : null}
                  </button>
                  <button
                    className={cn(menuButtonClass, 'text-text-medium')}
                    onClick={() => onSelectMode('ember')}
                    type='button'
                  >
                    <Flame className='h-4 w-4 shrink-0'/>
                    <span>Ember</span>
                    {currentMode === 'ember' ? <Check className='ml-auto h-4 w-4 text-primary'/> : null}
                  </button>
                  <button
                    className={cn(menuButtonClass, 'text-text-medium')}
                    onClick={() => onSelectMode('dark')}
                    type='button'
                  >
                    <Moon className='h-4 w-4 shrink-0'/>
                    <span>Dark</span>
                    {currentMode === 'dark' ? <Check className='ml-auto h-4 w-4 text-primary'/> : null}
                  </button>
                </div>
              ) : null}
            </div>

            {/* Integrations */}
            <div className='relative'>
              <button
                className={cn(
                  menuButtonClass,
                  'text-text-medium',
                  settingsSubmenu === 'integrations' ? 'bg-canvas-accent' : '',
                )}
                onClick={() => setSettingsSubmenu(settingsSubmenu === 'integrations' ? 'none' : 'integrations')}
                type='button'
              >
                <GitPullRequest className='h-4 w-4 shrink-0 text-text-muted'/>
                <span>Integrations</span>
                <ChevronRight className='ml-auto h-3.5 w-3.5 text-text-muted'/>
              </button>
            </div>

            <button
              className={cn(menuButtonClass, 'text-text-medium')}
              onClick={() => runMenuAction(() => {
                void navigate({href: buildWorkspaceArchiveHref(currentWorkspace.organizationSlug, currentWorkspace.slug)})
              })}
              type='button'
            >
              <Archive className='h-4 w-4 shrink-0 text-text-muted'/>
              <span>Archive</span>
            </button>
            <button
              className={cn(menuButtonClass, 'text-text-medium')}
              onClick={() => runMenuAction(() => {
                void navigate({href: buildWorkspaceTrashHref(currentWorkspace.organizationSlug, currentWorkspace.slug)})
              })}
              type='button'
            >
              <Trash2 className='h-4 w-4 shrink-0 text-text-muted'/>
              <span>Trash</span>
            </button>
          </div>
        </div>
      </div>
    </DropdownMenuContent>
  )
}

// ---------------------------------------------------------------------------
// Date Settings Submenu
// ---------------------------------------------------------------------------

function DateSettingsSubmenu({
  currentWeekStartsOn,
  onBack,
  onSave,
}: {
  currentWeekStartsOn: WeekStartsOn
  onBack: () => void
  onSave: (value: WeekStartsOn) => Promise<void>
}) {
  const {toast} = useToast()
  const [weekStartsOn, setWeekStartsOn] = useState<WeekStartsOn>(currentWeekStartsOn)
  const [isSaving, setIsSaving] = useState(false)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!isSaving) {
      setWeekStartsOn(currentWeekStartsOn)
    }
  }, [currentWeekStartsOn, isSaving])

  const handleWeekStartsOnChange = async (value: WeekStartsOn) => {
    if (value === weekStartsOn || isSaving) {
      return
    }

    const previousValue = weekStartsOn
    setWeekStartsOn(value)
    setIsSaving(true)

    try {
      await onSave(value)
    } catch {
      if (isMountedRef.current) {
        setWeekStartsOn(previousValue)
        setIsSaving(false)
        toast({title: 'Could not update week start', variant: 'error'})
      }
      return
    }

    if (isMountedRef.current) {
      setIsSaving(false)
    }
  }

  return (
    <div className='absolute bottom-0 left-[calc(100%+8px)] z-50 min-w-[240px] rounded-xl border border-border-subtle bg-surface-elevated p-2 shadow-elevated'>
      <button
        className={cn(menuButtonClass, 'font-medium text-text-muted')}
        onClick={onBack}
        type='button'
      >
        <ChevronLeft className='h-3.5 w-3.5 text-text-muted'/>
        <span>Date settings</span>
      </button>

      <div className='my-1 h-px bg-border-subtle'/>

      <div className='px-3 py-2'>
        <p className='text-sm font-medium text-text-strong'>Week starts on</p>
        <div className='mt-2 inline-flex items-center gap-1 rounded-full bg-canvas-accent p-1'>
          {weekStartOptions.map((option) => {
            const active = option.value === weekStartsOn

            return (
              <button
                className={
                  active
                    ? 'rounded-full bg-surface-elevated px-4 py-1.5 text-sm font-medium text-text-strong shadow-panel'
                    : 'rounded-full px-4 py-1.5 text-sm font-medium text-text-muted transition-colors hover:text-text-strong disabled:cursor-wait disabled:opacity-70'
                }
                disabled={isSaving}
                key={option.value}
                onClick={() => {
                  void handleWeekStartsOnChange(option.value)
                }}
                type='button'
              >
                {option.label}
              </button>
            )
          })}
        </div>
        <p className='mt-2 text-xs text-text-muted'>
          This changes calendar headers and presets like This Week for your account.
        </p>
        {isSaving ? (
          <div className='mt-3 flex items-center justify-end gap-1.5 text-xs text-text-muted'>
            <Loader2 className='h-3.5 w-3.5 animate-spin'/>
            Saving...
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// GitHub Integration Submenu
// ---------------------------------------------------------------------------

function GitHubIntegrationSubmenu({
  currentOrgSlug,
  currentUserId: _,
  onBack,
}: {
  currentOrgSlug: string
  currentUserId: string
  onBack: () => void
}) {
  const queryClient = useQueryClient()
  const sourcesQuery = useQuery(personalGitHubSourcesQueryOptions())
  const personalSources = sourcesQuery.data ?? []

  const [token, setToken] = useState('')
  const [status, setStatus] = useState<'idle' | 'validating' | 'error' | 'missing_scopes'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleConnect() {
    if (!token.trim()) return

    setStatus('validating')
    setErrorMessage('')

    try {
      const result = await validateAndSaveGitHubToken({
        scopeType: 'personal',
        token: token.trim(),
      })

      if (result.success) {
        setToken('')
        setStatus('idle')
        queryClient.invalidateQueries({queryKey: ['github-personal-sources']})
      } else if (result.error === 'missing_scopes') {
        setStatus('missing_scopes')
        setErrorMessage(result.message)
      } else {
        setStatus('error')
        setErrorMessage(result.message)
      }
    } catch (error) {
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : 'Could not save personal GitHub PAT.')
    }
  }

  async function handleDisconnect(sourceId: string) {
    try {
      await disconnectGitHub(sourceId)
      queryClient.invalidateQueries({queryKey: ['github-personal-sources']})
    } catch (error) {
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : 'Could not disconnect GitHub source.')
    }
  }

  return (
    <div className='absolute bottom-0 left-[calc(100%+8px)] z-50 min-w-[320px] rounded-xl border border-border-subtle bg-surface-elevated p-2 shadow-elevated'>
      <button
        className={cn(menuButtonClass, 'font-medium text-text-muted')}
        onClick={onBack}
        type='button'
      >
        <ChevronLeft className='h-3.5 w-3.5 text-text-muted'/>
        <span>Integrations</span>
      </button>

      <div className='my-1 h-px bg-border-subtle'/>

      <div className='px-3 py-2'>
        <div className='flex items-center gap-2 mb-3'>
          <GitPullRequest className='h-4 w-4 text-text-muted'/>
          <span className='text-sm font-medium text-text-strong'>GitHub</span>
          {personalSources.length > 0 ? (
            <span className='ml-auto text-xs text-[#2f7a55] flex items-center gap-1'>
              <span className='w-1.5 h-1.5 bg-[#2f7a55] rounded-full'/>
              {personalSources.length} personal source{personalSources.length === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>

        <div className='text-xs text-text-muted mb-3 space-y-1.5'>
          <p className='font-medium text-text-medium'>
            Personal GitHub PAT
          </p>
          <p>
            Use a personal classic PAT for boards you explicitly choose to back with your own GitHub access.
          </p>
          <p>
            Shared organization credentials are managed in{' '}
            <a className='text-[#335c8f] hover:underline' href={`${buildOrgSettingsHref(currentOrgSlug)}?tab=github`}>
              Organization Settings
            </a>.
          </p>
        </div>

        {personalSources.length > 0 ? (
          <div className='mb-3 space-y-2'>
            {personalSources.map((source) => (
              <div key={source.id} className='flex items-center justify-between rounded-lg border border-border-subtle px-2.5 py-2 text-xs'>
                <div className='min-w-0'>
                  <div className='truncate font-medium text-text-strong'>@{source.accountLogin}</div>
                  <div className='text-text-muted'>{source.authType === 'github_app' ? 'GitHub App' : 'PAT'}</div>
                </div>
                <button
                  onClick={() => handleDisconnect(source.id)}
                  className='rounded-sm px-2 py-1 text-[#a13d34] hover:bg-[#a13d34]/10'
                  type='button'
                >
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className='flex gap-1.5 mb-1'>
          <input
            type='password'
            placeholder='ghp_xxxxxxxxxxxx'
            value={token}
            onChange={(e) => {
              setToken(e.target.value)
              if (status !== 'idle' && status !== 'validating') setStatus('idle')
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            disabled={status === 'validating'}
            className='flex-1 px-2 py-1.5 text-xs font-mono border border-border-subtle rounded-sm bg-surface-base focus:outline-none focus:ring-1 focus:ring-secondary-accent disabled:opacity-50'
          />
          <button
            onClick={handleConnect}
            disabled={!token.trim() || status === 'validating'}
            className='px-3 py-1.5 text-xs font-medium rounded-sm bg-[#bf6224] text-white hover:bg-[#9f4d17] transition-colors disabled:opacity-50 flex items-center gap-1'
            type='button'
          >
            {status === 'validating' ? <Loader2 className='w-3 h-3 animate-spin'/> : null}
            {status === 'validating' ? 'Saving' : 'Save'}
          </button>
        </div>

        {status === 'error' && (
          <p className='text-xs text-[#a13d34]'>{errorMessage}</p>
        )}

        {status === 'missing_scopes' && (
          <div className='text-xs text-[#a86c0f] flex items-start gap-1'>
            <AlertTriangle className='w-3 h-3 flex-shrink-0 mt-0.5'/>
            <span>{errorMessage}</span>
          </div>
        )}

        <p className='text-[10px] text-text-muted mt-1.5'>
          Required scopes: <code className='bg-canvas-accent px-0.5 rounded'>repo</code> and <code className='bg-canvas-accent px-0.5 rounded'>read:user</code>.
        </p>
      </div>
    </div>
  )
}
