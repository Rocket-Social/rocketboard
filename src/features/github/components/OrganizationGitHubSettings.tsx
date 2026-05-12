import {useEffect, useMemo, useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {CheckCircle2, Copy, ExternalLink, Github, Loader2, Lock, RefreshCw, ShieldCheck, Trash2} from 'lucide-react'

import {Badge} from '../../../components/ui/badge'
import {Button} from '../../../components/ui/button'
import {Input} from '../../../components/ui/input'
import {useToast} from '../../../components/ui/toast'
import {cn} from '../../../lib/cn'
import {getErrorMessage} from '../../../platform/data/rpc-adapter'
import {useOrgMembersQuery} from '../../org-settings/org-settings.queries'
import {
  disconnectGitHub,
  initiateGitHubAppInstall,
  listAvailableGitHubRepos,
  validateAndSaveGitHubToken,
  type GitHubAppSetupStatus,
  type GitHubRepoInventoryItem,
} from '../github.connect'
import {
  organizationGitHubAppSetupStatusQueryOptions,
  organizationGitHubIdentityCandidatesQueryOptions,
  organizationGitHubSourcesQueryOptions,
  sourceAllowedRepositoriesQueryOptions,
  useAllowRepositoryForSource,
  useRemoveAllowedRepositoryFromSource,
  useSetProfileGitHubLoginMutation,
} from '../github.queries'

type GitHubSetupMethod = 'github_app' | 'pat'

type OrganizationGitHubSettingsProps = {
  canManage: boolean
  orgId: string
}

export function OrganizationGitHubSettings({canManage, orgId}: OrganizationGitHubSettingsProps) {
  const queryClient = useQueryClient()
  const {toast} = useToast()
  const sourcesQuery = useQuery(organizationGitHubSourcesQueryOptions(orgId))
  const githubAppStatusQuery = useQuery({
    ...organizationGitHubAppSetupStatusQueryOptions(orgId),
    enabled: canManage,
  })
  const orgMembersQuery = useOrgMembersQuery(orgId)
  const sources = sourcesQuery.data ?? []
  const hasSources = sources.length > 0
  const identityCandidatesQuery = useQuery({
    ...organizationGitHubIdentityCandidatesQueryOptions(orgId),
    enabled: canManage && hasSources,
  })
  const orgMembers = orgMembersQuery.data?.members ?? []

  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [identitySelections, setIdentitySelections] = useState<Record<string, string>>({})
  const [token, setToken] = useState('')
  const [tokenStatus, setTokenStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [tokenError, setTokenError] = useState('')
  const [repoSearch, setRepoSearch] = useState('')
  const [availableRepos, setAvailableRepos] = useState<GitHubRepoInventoryItem[]>([])
  const [isLoadingRepos, setIsLoadingRepos] = useState(false)
  const [reposError, setReposError] = useState('')
  const [setupMethod, setSetupMethod] = useState<GitHubSetupMethod>('github_app')
  const [githubAppActionError, setGitHubAppActionError] = useState('')

  const allowRepoMutation = useAllowRepositoryForSource()
  const removeAllowedRepoMutation = useRemoveAllowedRepositoryFromSource()
  const setProfileGitHubLoginMutation = useSetProfileGitHubLoginMutation(orgId)

  const preferredSourceId = useMemo(() => {
    return sources.find((source) => source.authType === 'github_app')?.id ?? sources[0]?.id ?? null
  }, [sources])

  useEffect(() => {
    if (!selectedSourceId && preferredSourceId) {
      setSelectedSourceId(preferredSourceId)
    }

    if (selectedSourceId && !sources.some((source) => source.id === selectedSourceId)) {
      setSelectedSourceId(preferredSourceId)
    }
  }, [preferredSourceId, selectedSourceId, sources])

  const selectedSource = sources.find((source) => source.id === selectedSourceId) ?? null
  const allowedReposQuery = useQuery(sourceAllowedRepositoriesQueryOptions(selectedSource?.id ?? null))
  const allowedRepoIds = useMemo(() => new Set((allowedReposQuery.data ?? []).map((repo) => repo.githubRepoId)), [allowedReposQuery.data])

  useEffect(() => {
    let cancelled = false

    async function loadRepos() {
      if (!selectedSource) {
        setAvailableRepos([])
        setReposError('')
        setIsLoadingRepos(false)
        return
      }

      setIsLoadingRepos(true)
      setReposError('')

      try {
        const repos = await listAvailableGitHubRepos({
          connectionSourceId: selectedSource.id,
          mode: 'manage',
        })

        if (!cancelled) {
          setAvailableRepos(repos)
        }
      } catch (error) {
        if (!cancelled) {
          setAvailableRepos([])
          setReposError(getErrorMessage(error, 'Could not load repositories for this source.'))
        }
      } finally {
        if (!cancelled) {
          setIsLoadingRepos(false)
        }
      }
    }

    void loadRepos()

    return () => {
      cancelled = true
    }
  }, [selectedSource])

  const filteredRepos = useMemo(() => {
    const normalizedSearch = repoSearch.trim().toLowerCase()
    if (!normalizedSearch) {
      return availableRepos
    }

    return availableRepos.filter((repo) =>
      repo.full_name.toLowerCase().includes(normalizedSearch)
      || (repo.description?.toLowerCase().includes(normalizedSearch) ?? false),
    )
  }, [availableRepos, repoSearch])

  const memberOptions = useMemo(() => {
    return [...orgMembers].sort((left, right) => left.name.localeCompare(right.name))
  }, [orgMembers])

  const githubAppStatus = githubAppStatusQuery.data
  const githubAppSourceCount = sources.filter((source) => source.authType === 'github_app').length
  const patSourceCount = sources.filter((source) => source.authType === 'pat').length

  async function handleSaveOrgPat() {
    if (!token.trim()) return

    setTokenStatus('saving')
    setTokenError('')

    try {
      const result = await validateAndSaveGitHubToken({
        organizationId: orgId,
        scopeType: 'organization',
        token: token.trim(),
      })

      if (!result.success) {
        setTokenStatus('error')
        setTokenError(result.message)
        return
      }

      setToken('')
      setTokenStatus('idle')
      await queryClient.invalidateQueries({queryKey: ['github-org-sources', orgId]})
      toast({title: `Saved org GitHub PAT for ${result.user.login}`})
    } catch (error) {
      setTokenStatus('error')
      setTokenError(getErrorMessage(error))
    }
  }

  async function handleDisconnectSource(sourceId: string) {
    try {
      await disconnectGitHub(sourceId)
      await Promise.all([
        queryClient.invalidateQueries({queryKey: ['github-app-setup-status', orgId]}),
        queryClient.invalidateQueries({queryKey: ['github-org-sources', orgId]}),
        queryClient.invalidateQueries({queryKey: ['github-source-allowed-repos', sourceId]}),
      ])
      toast({title: 'GitHub source disconnected'})
    } catch (error) {
      toast({description: getErrorMessage(error), title: 'Could not disconnect source'})
    }
  }

  async function handleInstallGitHubApp() {
    setGitHubAppActionError('')

    try {
      await initiateGitHubAppInstall(orgId, window.location.pathname + window.location.search)
    } catch (error) {
      setGitHubAppActionError(getErrorMessage(error, 'Could not start GitHub App install.'))
    }
  }

  async function handleRefreshGitHubAppStatus() {
    setGitHubAppActionError('')
    await githubAppStatusQuery.refetch()
  }

  async function handleCopyValue(label: string, value: string) {
    try {
      await navigator.clipboard?.writeText(value)
      toast({title: `Copied ${label}`})
    } catch {
      toast({title: 'Could not copy value', description: 'Copy the value manually from the field.'})
    }
  }

  function scrollToAllowlist() {
    document.getElementById('github-repository-allowlist')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  async function handleAllowRepo(repo: GitHubRepoInventoryItem) {
    if (!selectedSource) return

    try {
      await allowRepoMutation.mutateAsync({
        connectionSourceId: selectedSource.id,
        repo: {
          defaultBranch: repo.default_branch,
          fullName: repo.full_name,
          githubRepoId: repo.id,
          isPrivate: repo.private,
          name: repo.name,
        },
      })
      toast({title: `Allowlisted ${repo.full_name}`})
    } catch (error) {
      toast({description: getErrorMessage(error), title: 'Could not allowlist repository'})
    }
  }

  async function handleRemoveAllowedRepo(repo: GitHubRepoInventoryItem) {
    if (!selectedSource) return

    try {
      await removeAllowedRepoMutation.mutateAsync({
        connectionSourceId: selectedSource.id,
        githubRepoId: repo.id,
      })
      toast({title: `Removed ${repo.full_name} from allowlist`})
    } catch (error) {
      toast({description: getErrorMessage(error), title: 'Could not update allowlist'})
    }
  }

  async function handleAssignGitHubLogin(githubLogin: string) {
    const userId = identitySelections[githubLogin]
    if (!userId) return

    try {
      await setProfileGitHubLoginMutation.mutateAsync({
        githubLogin,
        userId,
      })
      setIdentitySelections((current) => {
        const next = {...current}
        delete next[githubLogin]
        return next
      })
      toast({title: `Mapped @${githubLogin} to a Rocketboard member`})
    } catch (error) {
      toast({description: getErrorMessage(error), title: 'Could not save GitHub login mapping'})
    }
  }

  const githubAppSetupSummary = getGitHubAppSetupSummary({
    actionError: githubAppActionError,
    status: githubAppStatus,
    statusError: githubAppStatusQuery.error ? getErrorMessage(githubAppStatusQuery.error, 'Could not load GitHub App setup status.') : '',
    statusLoading: githubAppStatusQuery.isLoading,
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-text-strong">GitHub</h2>
        <p className="mt-1 text-sm text-text-muted">
          Organization sources are shared across Rocketboard. Project boards bind to one source, then pull from the org allowlist.
        </p>
      </div>

      {canManage ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <SetupMethodCard
              description="Webhook-driven updates and shared installs for long-term org ownership."
              isSelected={setupMethod === 'github_app'}
              onSelect={() => setSetupMethod('github_app')}
              status={githubAppSourceCount > 0 ? `${githubAppSourceCount} connected` : null}
              title="GitHub App"
              traits={[
                'Setup effort: medium',
                'Updates: webhooks plus polling fallback',
                'Ownership: deployment-level app config, org-level install',
              ]}
            />
            <SetupMethodCard
              description="Fastest shared setup for manual polling and PAT-based sync."
              isSelected={setupMethod === 'pat'}
              onSelect={() => setSetupMethod('pat')}
              status={patSourceCount > 0 ? `${patSourceCount} connected` : null}
              title="Organization PAT"
              traits={[
                'Setup effort: low',
                'Updates: polling and manual sync',
                'Ownership: shared token for the org',
              ]}
            />
          </div>

          {setupMethod === 'github_app' ? (
            <GitHubAppSetupAssistant
              actionError={githubAppActionError}
              onCopyValue={handleCopyValue}
              onInstall={handleInstallGitHubApp}
              onRefresh={handleRefreshGitHubAppStatus}
              onScrollToAllowlist={scrollToAllowlist}
              status={githubAppStatus}
              statusError={githubAppStatusQuery.error ? getErrorMessage(githubAppStatusQuery.error, 'Could not load GitHub App setup status.') : ''}
              statusLoading={githubAppStatusQuery.isLoading}
              statusRefetching={githubAppStatusQuery.isFetching && !githubAppStatusQuery.isLoading}
              summary={githubAppSetupSummary}
            />
          ) : (
            <OrganizationPatSetupCard
              onSave={() => void handleSaveOrgPat()}
              token={token}
              tokenError={tokenError}
              tokenStatus={tokenStatus}
              onTokenChange={(value) => {
                setToken(value)
                if (tokenStatus === 'error') {
                  setTokenStatus('idle')
                  setTokenError('')
                }
              }}
            />
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-border-subtle bg-surface-base p-4 text-sm text-text-muted">
          Only organization admins can manage shared GitHub credentials and the repo allowlist.
        </div>
      )}

      <div className={cn(
        'rounded-2xl border border-border-subtle bg-surface-base',
        !hasSources && 'opacity-85',
      )}>
        <div className="border-b border-border-subtle px-4 py-3">
          <div className="text-sm font-medium text-text-strong">Organization Sources</div>
          <div className="text-xs text-text-muted">
            {sources.length === 0
              ? 'No shared sources configured yet. Finish one of the setup paths above first.'
              : `${sources.length} source${sources.length === 1 ? '' : 's'} configured.`}
          </div>
        </div>
        <div className="divide-y divide-border-subtle">
          {sources.length === 0 ? (
            <div className="px-4 py-6 text-sm text-text-muted">No organization GitHub sources yet.</div>
          ) : sources.map((source) => (
            <div key={source.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-strong">{source.accountLogin}</span>
                  <span className="rounded-full bg-canvas-accent px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">
                    {source.authType === 'github_app' ? 'App' : 'PAT'}
                  </span>
                </div>
                <div className="mt-1 text-xs text-text-muted">
                  Last validated {source.lastValidatedAt ? formatDateTime(source.lastValidatedAt) : 'recently'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setSelectedSourceId(source.id)}
                  size="compact"
                  type="button"
                  variant={selectedSourceId === source.id ? 'primary' : 'secondary'}
                >
                  {selectedSourceId === source.id ? 'Selected' : 'Manage'}
                </Button>
                {canManage ? (
                  <button
                    className="rounded-lg p-1 text-text-muted transition-colors hover:bg-canvas-accent hover:text-[#a13d34]"
                    onClick={() => void handleDisconnectSource(source.id)}
                    title="Disconnect source"
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedSource ? (
        <div id="github-repository-allowlist" className="rounded-2xl border border-border-subtle bg-surface-base p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-text-strong">Repository Allowlist</div>
              <div className="text-xs text-text-muted">Projects can only attach org repositories that are allowlisted here.</div>
            </div>
            <div className="text-xs text-text-muted">{selectedSource.accountLogin}</div>
          </div>

          <Input
            onChange={(event) => setRepoSearch(event.target.value)}
            placeholder="Search repositories..."
            value={repoSearch}
          />

          <div className="mt-3 max-h-[440px] overflow-y-auto rounded-xl border border-border-subtle">
            {isLoadingRepos ? (
              <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading repositories...
              </div>
            ) : null}

            {!isLoadingRepos && reposError ? (
              <div className="px-4 py-6 text-sm text-[#a13d34]">{reposError}</div>
            ) : null}

            {!isLoadingRepos && !reposError && filteredRepos.length === 0 ? (
              <div className="px-4 py-6 text-sm text-text-muted">No repositories match your search.</div>
            ) : null}

            {!isLoadingRepos && !reposError ? filteredRepos.map((repo) => {
              const isAllowed = allowedRepoIds.has(repo.id)
              return (
                <div key={repo.id} className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-text-strong">{repo.full_name}</span>
                      {repo.private ? <Lock className="h-3.5 w-3.5 text-text-muted" /> : null}
                    </div>
                    {repo.description ? <div className="mt-1 truncate text-xs text-text-muted">{repo.description}</div> : null}
                  </div>
                  {canManage ? (
                    <Button
                      onClick={() => {
                        if (isAllowed) {
                          void handleRemoveAllowedRepo(repo)
                        } else {
                          void handleAllowRepo(repo)
                        }
                      }}
                      size="compact"
                      type="button"
                      variant={isAllowed ? 'secondary' : 'primary'}
                    >
                      {isAllowed ? 'Allowed' : 'Allow'}
                    </Button>
                  ) : (
                    <span className="text-xs text-text-muted">{isAllowed ? 'Allowed' : 'Hidden from projects'}</span>
                  )}
                </div>
              )
            }) : null}
          </div>
        </div>
      ) : (
        <PlaceholderSectionCard
          description="Finish GitHub App or PAT setup above, then choose which repositories projects can attach."
          title="Repository Allowlist"
        />
      )}

      {canManage ? (
        hasSources ? (
          <div className="rounded-2xl border border-border-subtle bg-surface-base p-4">
            <div className="mb-3">
              <div className="text-sm font-medium text-text-strong">GitHub Identity Mapping</div>
              <div className="text-xs text-text-muted">
                Match active GitHub contributor logins to Rocketboard members so Team and Health can attribute PRs and reviews correctly.
              </div>
            </div>

            <div className="space-y-3">
              {identityCandidatesQuery.isLoading ? (
                <div className="flex items-center gap-2 rounded-xl border border-border-subtle px-3 py-3 text-sm text-text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading unmatched contributors...
                </div>
              ) : null}

              {!identityCandidatesQuery.isLoading && identityCandidatesQuery.data?.length === 0 ? (
                <div className="rounded-xl border border-border-subtle px-3 py-3 text-sm text-text-muted">
                  All active GitHub contributors on attached repos are currently mapped.
                </div>
              ) : null}

              {!identityCandidatesQuery.isLoading ? identityCandidatesQuery.data?.map((candidate) => (
                <div
                  key={candidate.githubLogin}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle px-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-text-strong">@{candidate.githubLogin}</div>
                    <div className="mt-1 text-xs text-text-muted">
                      {candidate.prCount} PR{candidate.prCount === 1 ? '' : 's'} · {candidate.reviewCount} review{candidate.reviewCount === 1 ? '' : 's'} · last seen {candidate.lastSeenAt ? formatDateTime(candidate.lastSeenAt) : 'recently'}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-sm text-text-strong"
                      onChange={(event) => {
                        const nextUserId = event.target.value
                        setIdentitySelections((current) => ({
                          ...current,
                          [candidate.githubLogin]: nextUserId,
                        }))
                      }}
                      value={identitySelections[candidate.githubLogin] ?? ''}
                    >
                      <option value="">Choose member</option>
                      {memberOptions.map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.name}{member.githubLogin ? ` (@${member.githubLogin})` : ''}
                        </option>
                      ))}
                    </select>
                    <Button
                      disabled={!identitySelections[candidate.githubLogin] || setProfileGitHubLoginMutation.isPending}
                      onClick={() => void handleAssignGitHubLogin(candidate.githubLogin)}
                      size="compact"
                      type="button"
                      variant="primary"
                    >
                      Assign
                    </Button>
                  </div>
                </div>
              )) : null}
            </div>
          </div>
        ) : (
          <PlaceholderSectionCard
            description="Once the org has a GitHub source and attached repos, Rocketboard will surface unmatched contributors here."
            title="GitHub Identity Mapping"
          />
        )
      ) : null}
    </div>
  )
}

function OrganizationPatSetupCard(props: {
  onSave: () => void
  onTokenChange: (value: string) => void
  token: string
  tokenError: string
  tokenStatus: 'idle' | 'saving' | 'error'
}) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-base p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Github className="h-4 w-4 text-text-muted" />
            <div className="text-sm font-medium text-text-strong">Organization PAT</div>
          </div>
          <p className="mt-2 text-sm text-text-muted">
            Use this when you want the fastest shared setup. PAT sources support manual sync and polling-based refreshes.
          </p>
        </div>
        <Badge variant="subtle">Quick path</Badge>
      </div>

      <div className="mt-4 space-y-3">
        <div className="text-xs text-text-muted">
          Use a classic PAT with <code className="rounded bg-canvas-accent px-1">repo</code>, <code className="rounded bg-canvas-accent px-1">read:user</code>, and <code className="rounded bg-canvas-accent px-1">read:org</code>.
        </div>
        <Input
          onChange={(event) => props.onTokenChange(event.target.value)}
          placeholder="ghp_xxxxxxxxxxxx"
          type="password"
          value={props.token}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={!props.token.trim() || props.tokenStatus === 'saving'}
            onClick={props.onSave}
            type="button"
            variant="primary"
          >
            {props.tokenStatus === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save PAT
          </Button>
          <a
            className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-strong"
            href="https://github.com/settings/tokens/new?scopes=repo,read:user,read:org&description=Rocketboard"
            rel="noopener noreferrer"
            target="_blank"
          >
            Open GitHub token page <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        {props.tokenError ? <div className="text-sm text-[#a13d34]">{props.tokenError}</div> : null}
      </div>
    </div>
  )
}

function GitHubAppSetupAssistant(props: {
  actionError: string
  onCopyValue: (label: string, value: string) => void
  onInstall: () => void
  onRefresh: () => void
  onScrollToAllowlist: () => void
  status: GitHubAppSetupStatus | undefined
  statusError: string
  statusLoading: boolean
  statusRefetching: boolean
  summary: {description: string; label: string}
}) {
  const derived = props.status?.derived
  const requirements = props.status?.requirements
  const config = props.status?.config
  const invalidSecrets = new Set(config?.invalid_secrets ?? [])
  const missingSecrets = config?.missing_secrets ?? []
  const presentSecrets = new Set(config?.present_secrets ?? [])
  const missingGitHubAppRequirements = getMissingGitHubAppRequirements(props.status)
  const needsGitHubAppUpdate =
    missingGitHubAppRequirements.events.length > 0 ||
    missingGitHubAppRequirements.permissions.length > 0

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-base p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-text-muted" />
            <div className="text-sm font-medium text-text-strong">GitHub App setup assistant</div>
            <Badge variant={props.status?.connected ? 'primary' : 'subtle'}>{props.summary.label}</Badge>
          </div>
          <p className="mt-2 text-sm text-text-muted">
            This setup has two parts: configure the GitHub App for this Rocketboard deployment, then install it into your GitHub organization.
          </p>
        </div>
        <Button
          onClick={props.onRefresh}
          type="button"
          variant="secondary"
        >
          {props.statusRefetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh status
        </Button>
      </div>

      <div className="mt-4 rounded-2xl border border-border-subtle bg-surface-elevated p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-text-strong">
          {props.status?.connected ? <CheckCircle2 className="h-4 w-4" /> : null}
          Current status
        </div>
        <p className="mt-1 text-sm text-text-muted">{props.summary.description}</p>
        {props.status?.connected && props.status.installation ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="primary">{props.status.installation.account_type}</Badge>
            <span className="text-xs text-text-muted">@{props.status.installation.account_login}</span>
            <Button onClick={props.onScrollToAllowlist} size="compact" type="button" variant="secondary">
              Go to repo allowlist
            </Button>
          </div>
        ) : null}
        {needsGitHubAppUpdate ? (
          <div className="mt-3 rounded-xl border border-[#e6c7bb] bg-[#fff4ef] px-3 py-3 text-sm text-[#a13d34]">
            <div className="font-medium">GitHub App update required</div>
            <div className="mt-1 text-xs">
              Update the GitHub App in GitHub, then refresh status so PR comment stats stay current.
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {missingGitHubAppRequirements.permissions.map((permission) => (
                <Badge key={permission} className="bg-white text-[#a13d34]" variant="subtle">
                  {permission}
                </Badge>
              ))}
              {missingGitHubAppRequirements.events.map((event) => (
                <Badge key={event} className="bg-white text-[#a13d34]" variant="subtle">
                  {event}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 space-y-4">
        <SetupStepCard
          description="Copy these values into GitHub when you create or update the Rocketboard GitHub App."
          step="1"
          title="Rocketboard values to copy"
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <CopyValueRow label="Homepage URL" onCopy={props.onCopyValue} value={derived?.homepage_url ?? 'Loading...'} />
            <CopyValueRow label="Setup URL" onCopy={props.onCopyValue} value={derived?.setup_url ?? 'Loading...'} />
            <CopyValueRow label="Webhook URL" onCopy={props.onCopyValue} value={derived?.webhook_url ?? 'Loading...'} />
            <CopyValueRow label="Frontend callback URL" onCopy={props.onCopyValue} value={derived?.callback_url ?? 'Loading...'} />
          </div>
        </SetupStepCard>

        <SetupStepCard
          description="Create the GitHub App in GitHub, then copy the GitHub-side values into your deployment secrets."
          step="2"
          title="GitHub App settings to configure in GitHub"
        >
          <div className="space-y-3">
            <a
              className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-strong"
              href="https://github.com/settings/apps"
              rel="noopener noreferrer"
              target="_blank"
            >
              Open GitHub App settings <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <div className="grid gap-3 lg:grid-cols-2">
              <SetupChecklist
                items={requirements?.permissions ?? [
                  'Pull requests: Read',
                  'Issues: Read',
                  'Contents: Read',
                  'Metadata: Read',
                ]}
                title="Required permissions"
              />
              <SetupChecklist
                items={requirements?.events ?? [
                  'pull_request',
                  'pull_request_review',
                  'issue_comment',
                  'pull_request_review_comment',
                  'push',
                  'installation',
                ]}
                title="Required webhook events"
              />
            </div>
          </div>
        </SetupStepCard>

        <SetupStepCard
          description="These values live in Supabase deployment secrets, not in the organization record."
          step="3"
          title="Supabase secrets required for this deployment"
        >
          <div className="space-y-3">
            <div className="grid gap-2 lg:grid-cols-2">
              {[
                'GITHUB_APP_ID',
                'GITHUB_APP_PRIVATE_KEY',
                'GITHUB_APP_SLUG',
                'GITHUB_WEBHOOK_SECRET',
              ].map((secret) => (
                <SecretStatusRow
                  key={secret}
                  label={secret}
                  status={invalidSecrets.has(secret)
                    ? 'invalid'
                    : presentSecrets.has(secret)
                      ? 'configured'
                      : 'missing'}
                />
              ))}
            </div>
            <div className="rounded-xl border border-border-subtle bg-[#f7f2eb] p-3 text-xs text-text-muted">
              <div className="font-medium text-text-strong">CLI example</div>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono">
{`supabase secrets set GITHUB_APP_ID=your_app_id
supabase secrets set GITHUB_APP_PRIVATE_KEY="$(cat path/to/private-key.pem)"
supabase secrets set GITHUB_APP_SLUG=your-app-slug
supabase secrets set GITHUB_WEBHOOK_SECRET=your-webhook-secret`}
              </pre>
            </div>
          </div>
        </SetupStepCard>

        <SetupStepCard
          description="Run the readiness check after you update deployment secrets so Rocketboard can enable installation."
          step="4"
          title="Configuration check"
        >
          {props.statusLoading ? (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking the current deployment configuration...
            </div>
          ) : null}

          {!props.statusLoading && props.statusError ? (
            <div className="rounded-xl border border-[#e6c7bb] bg-[#fff4ef] px-3 py-3 text-sm text-[#a13d34]">
              {props.statusError}
            </div>
          ) : null}

          {!props.statusLoading && !props.statusError && props.status ? (
            props.status.config.installable ? (
              <div className="rounded-xl border border-border-subtle bg-surface-elevated px-3 py-3 text-sm text-text-strong">
                All required deployment secrets are present and valid. You can continue to GitHub and install the app into your organization.
              </div>
            ) : (
              <div className="space-y-2 rounded-xl border border-[#e6c7bb] bg-[#fff4ef] px-3 py-3 text-sm text-[#a13d34]">
                <div>Rocketboard still needs valid deployment secrets before installation can start.</div>
                {props.status.config.invalid_secrets?.length ? (
                  <div className="space-y-1">
                    <div className="text-xs font-medium uppercase tracking-wide text-[#a13d34]">Invalid secrets</div>
                    <div className="flex flex-wrap gap-2">
                      {props.status.config.invalid_secrets.map((secret) => (
                        <Badge key={secret} className="bg-white text-[#a13d34]" variant="subtle">{secret}</Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
                {missingSecrets.length > 0 ? (
                  <div className="space-y-1">
                    <div className="text-xs font-medium uppercase tracking-wide text-[#a13d34]">Missing secrets</div>
                    <div className="flex flex-wrap gap-2">
                      {missingSecrets.map((secret) => (
                        <Badge key={secret} className="bg-white text-[#a13d34]" variant="subtle">{secret}</Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )
          ) : null}
        </SetupStepCard>

        <SetupStepCard
          description="Rocketboard only enables the install button once the deployment has the required GitHub App config."
          step="5"
          title="Install into GitHub"
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={!props.status?.config.installable || props.statusLoading || props.status?.connected}
                onClick={props.onInstall}
                type="button"
                variant="primary"
              >
                Install GitHub App
              </Button>
              {props.status?.connected ? (
                <span className="text-sm text-text-muted">The GitHub App is already installed for this organization.</span>
              ) : null}
            </div>

            {!props.status?.config.installable && !props.statusLoading ? (
              <div className="text-sm text-text-muted">
                Installation stays disabled until the configuration check reports all required deployment secrets as present and valid.
              </div>
            ) : null}

            {props.actionError ? (
              <div className="rounded-xl border border-[#e6c7bb] bg-[#fff4ef] px-3 py-3 text-sm text-[#a13d34]">
                {props.actionError}
              </div>
            ) : null}
          </div>
        </SetupStepCard>
      </div>
    </div>
  )
}

function SetupMethodCard(props: {
  description: string
  isSelected: boolean
  onSelect: () => void
  status: string | null
  title: string
  traits: string[]
}) {
  return (
    <button
      className={cn(
        'rounded-2xl border p-4 text-left transition-colors',
        props.isSelected
          ? 'border-border-strong bg-surface-base shadow-sm'
          : 'border-border-subtle bg-surface-elevated hover:border-border-strong hover:bg-surface-base',
      )}
      onClick={props.onSelect}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Github className="h-4 w-4 text-text-muted" />
            <div className="text-sm font-medium text-text-strong">{props.title}</div>
          </div>
          <p className="mt-2 text-sm text-text-muted">{props.description}</p>
        </div>
        {props.status ? <Badge variant={props.isSelected ? 'primary' : 'subtle'}>{props.status}</Badge> : null}
      </div>

      <div className="mt-4 space-y-2 text-xs text-text-muted">
        {props.traits.map((trait) => (
          <div key={trait}>{trait}</div>
        ))}
      </div>
    </button>
  )
}

function SetupStepCard(props: {
  children: React.ReactNode
  description: string
  step: string
  title: string
}) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-surface-elevated p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-canvas-accent text-xs font-medium text-text-strong">
          {props.step}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-text-strong">{props.title}</div>
          <p className="mt-1 text-sm text-text-muted">{props.description}</p>
        </div>
      </div>
      <div className="mt-4">{props.children}</div>
    </section>
  )
}

function CopyValueRow(props: {
  label: string
  onCopy: (label: string, value: string) => void
  value: string
}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-base p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-text-muted">{props.label}</div>
      <div className="mt-2 break-all rounded-lg bg-canvas-accent px-3 py-2 font-mono text-xs text-text-strong">
        {props.value}
      </div>
      <div className="mt-2">
        <Button
          disabled={props.value === 'Loading...'}
          onClick={() => props.onCopy(props.label, props.value)}
          size="compact"
          type="button"
          variant="secondary"
        >
          <Copy className="h-3.5 w-3.5" />
          Copy
        </Button>
      </div>
    </div>
  )
}

function SetupChecklist(props: {items: string[]; title: string}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-base p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-text-muted">{props.title}</div>
      <div className="mt-3 space-y-2">
        {props.items.map((item) => (
          <div key={item} className="flex items-center gap-2 text-sm text-text-strong">
            <CheckCircle2 className="h-4 w-4 text-text-muted" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SecretStatusRow(props: {label: string; status: 'configured' | 'invalid' | 'missing'}) {
  const badgeClassName = props.status === 'invalid' ? 'bg-white text-[#a13d34]' : undefined

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-base px-3 py-3">
      <div className="font-mono text-xs text-text-strong">{props.label}</div>
      <Badge className={badgeClassName} variant={props.status === 'configured' ? 'primary' : 'subtle'}>
        {props.status === 'configured' ? 'Configured' : props.status === 'invalid' ? 'Invalid' : 'Missing'}
      </Badge>
    </div>
  )
}

function PlaceholderSectionCard(props: {description: string; title: string}) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-base p-4 opacity-80">
      <div className="text-sm font-medium text-text-strong">{props.title}</div>
      <div className="mt-1 text-sm text-text-muted">{props.description}</div>
    </div>
  )
}

function getMissingGitHubAppRequirements(status: GitHubAppSetupStatus | undefined) {
  const installation = status?.installation
  if (!installation) {
    return {events: [], permissions: []}
  }

  const installedEvents = new Set(installation.events ?? [])
  const permissionKeys: Record<string, string> = {
    'Contents: Read': 'contents',
    'Issues: Read': 'issues',
    'Metadata: Read': 'metadata',
    'Pull requests: Read': 'pull_requests',
  }
  const permissions = installation.permissions ?? {}

  return {
    events: (status?.requirements.events ?? []).filter((event) => !installedEvents.has(event)),
    permissions: (status?.requirements.permissions ?? []).filter((permission) => {
      const permissionKey = permissionKeys[permission]
      if (!permissionKey) return false
      return !hasReadPermission(permissions[permissionKey])
    }),
  }
}

function hasReadPermission(value: unknown) {
  return ['admin', 'read', 'write'].includes(String(value ?? '').toLowerCase())
}

function getGitHubAppSetupSummary(input: {
  actionError: string
  status: GitHubAppSetupStatus | undefined
  statusError: string
  statusLoading: boolean
}) {
  if (input.statusLoading) {
    return {
      description: 'Rocketboard is checking whether this deployment has the required GitHub App configuration.',
      label: 'Checking configuration',
    }
  }

  if (input.statusError) {
    return {
      description: input.statusError,
      label: 'Could not load status',
    }
  }

  if (input.actionError) {
    return {
      description: input.actionError,
      label: 'Install blocked',
    }
  }

  if (input.status?.connected && input.status.installation) {
    const missingRequirements = getMissingGitHubAppRequirements(input.status)
    if (missingRequirements.events.length > 0 || missingRequirements.permissions.length > 0) {
      return {
        description: 'Update the GitHub App permissions and webhook events in GitHub, then refresh status so PR comment stats stay current.',
        label: 'Update required',
      }
    }

    return {
      description: `Installed on ${input.status.installation.account_login}. Next, choose which repositories Rocketboard should expose to projects below.`,
      label: 'Installed',
    }
  }

  if (input.status && !input.status.config.installable) {
    const invalidSecrets = input.status.config.invalid_secrets ?? []
    const missingSecrets = input.status.config.missing_secrets

    if (invalidSecrets.length > 0 && missingSecrets.length > 0) {
      return {
        description: 'Fix the invalid Supabase deployment secrets and add the missing ones, then run the configuration check again before installing into GitHub.',
        label: 'Needs valid deployment config',
      }
    }

    if (invalidSecrets.length > 0) {
      return {
        description: 'Fix the invalid Supabase deployment secrets, then run the configuration check again before installing into GitHub.',
        label: 'Needs valid deployment config',
      }
    }

    return {
      description: `Add the missing Supabase deployment secrets, then run the configuration check again before installing into GitHub.`,
      label: 'Needs deployment secrets',
    }
  }

  return {
    description: 'Deployment config is ready. Continue to GitHub to install the app into your organization.',
    label: 'Ready to install',
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value))
}
