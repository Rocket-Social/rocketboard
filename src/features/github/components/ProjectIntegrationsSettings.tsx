import {useEffect, useMemo, useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {useNavigate} from '@tanstack/react-router'
import {ExternalLink, GitBranch, GitPullRequest, Loader2, Lock, Trash2} from 'lucide-react'

import {Button} from '../../../components/ui/button'
import {Input} from '../../../components/ui/input'
import {useToast} from '../../../components/ui/toast'
import {getErrorMessage} from '../../../platform/data/rpc-adapter'
import {buildOrgSettingsHref} from '../../shell/route-helpers'
import {listAvailableGitHubRepos, type GitHubRepoInventoryItem} from '../github.connect'
import {
  organizationGitHubSourcesQueryOptions,
  personalGitHubSourcesQueryOptions,
  projectGitHubReposQueryOptions,
  projectGitHubSettingsQueryOptions,
  useClearProjectGitHubSource,
  useConnectRepo,
  useDisconnectRepo,
  useSetProjectAutoTransitions,
  useSetProjectGitHubSource,
} from '../github.queries'
import type {GitHubConnectionSource, GitHubRepository} from '../github.types'

type ProjectIntegrationsSettingsProps = {
  canEditProject: boolean
  currentUserId: string
  organizationId: string
  organizationSlug: string
  projectId: string
}

export function ProjectIntegrationsSettings({
  canEditProject,
  currentUserId,
  organizationId,
  organizationSlug,
  projectId,
}: ProjectIntegrationsSettingsProps) {
  const navigate = useNavigate()
  const {toast} = useToast()
  const settingsQuery = useQuery(projectGitHubSettingsQueryOptions(projectId))
  const reposQuery = useQuery(projectGitHubReposQueryOptions(projectId))
  const orgSourcesQuery = useQuery(organizationGitHubSourcesQueryOptions(organizationId))
  const personalSourcesQuery = useQuery(personalGitHubSourcesQueryOptions())

  const setSourceMutation = useSetProjectGitHubSource()
  const clearSourceMutation = useClearProjectGitHubSource()
  const setAutoTransitionsMutation = useSetProjectAutoTransitions()
  const connectRepoMutation = useConnectRepo()
  const disconnectRepoMutation = useDisconnectRepo()

  const [showSourceChooser, setShowSourceChooser] = useState(false)
  const [repoSearch, setRepoSearch] = useState('')
  const [availableRepos, setAvailableRepos] = useState<GitHubRepoInventoryItem[]>([])
  const [isLoadingAvailableRepos, setIsLoadingAvailableRepos] = useState(false)
  const [availableReposError, setAvailableReposError] = useState('')

  const settings = settingsQuery.data
  const currentSource = settings?.connectionSource ?? null
  const repos = reposQuery.data ?? []
  const orgSources = orgSourcesQuery.data ?? []
  const personalSources = personalSourcesQuery.data ?? []

  const canReconfigureSource = canEditProject && (
    !currentSource
    || currentSource.scopeType === 'organization'
    || currentSource.ownerUserId === currentUserId
  )

  const connectedRepoIds = useMemo(() => new Set(repos.map((repo) => repo.githubRepoId)), [repos])

  useEffect(() => {
    let cancelled = false

    async function loadAvailableRepos() {
      if (!currentSource || !canReconfigureSource) {
        setAvailableRepos([])
        setAvailableReposError('')
        setIsLoadingAvailableRepos(false)
        return
      }

      setIsLoadingAvailableRepos(true)
      setAvailableReposError('')

      try {
        const data = await listAvailableGitHubRepos({
          connectionSourceId: currentSource.id,
          mode: 'project',
          projectId,
        })
        if (!cancelled) {
          setAvailableRepos(data)
        }
      } catch (error) {
        if (!cancelled) {
          setAvailableRepos([])
          setAvailableReposError(getErrorMessage(error, 'Could not load repositories for this source.'))
        }
      } finally {
        if (!cancelled) {
          setIsLoadingAvailableRepos(false)
        }
      }
    }

    void loadAvailableRepos()

    return () => {
      cancelled = true
    }
  }, [canReconfigureSource, currentSource, projectId])

  const filteredAvailableRepos = useMemo(() => {
    const normalizedSearch = repoSearch.trim().toLowerCase()
    const visibleRepos = availableRepos.filter((repo) => !connectedRepoIds.has(repo.id))

    if (!normalizedSearch) {
      return visibleRepos
    }

    return visibleRepos.filter((repo) =>
      repo.full_name.toLowerCase().includes(normalizedSearch)
      || (repo.description?.toLowerCase().includes(normalizedSearch) ?? false),
    )
  }, [availableRepos, connectedRepoIds, repoSearch])

  async function handleBindSource(source: GitHubConnectionSource) {
    try {
      await setSourceMutation.mutateAsync({connectionSourceId: source.id, projectId})
      setShowSourceChooser(false)
      toast({title: `GitHub board now uses ${formatSourceLabel(source)}`})
    } catch (error) {
      toast({description: getErrorMessage(error), title: 'Could not change GitHub source'})
    }
  }

  async function handleClearSource() {
    try {
      await clearSourceMutation.mutateAsync(projectId)
      setShowSourceChooser(false)
      toast({title: 'GitHub board source cleared'})
    } catch (error) {
      toast({description: getErrorMessage(error), title: 'Could not clear GitHub source'})
    }
  }

  async function handleAddRepo(repo: GitHubRepoInventoryItem) {
    if (!currentSource) return

    try {
      await connectRepoMutation.mutateAsync({
        colorIndex: repos.length % 6,
        connectionSourceId: currentSource.id,
        projectId,
        repo: {
          defaultBranch: repo.default_branch,
          fullName: repo.full_name,
          githubRepoId: repo.id,
          isPrivate: repo.private,
          name: repo.name,
        },
      })
      toast({title: `Added ${repo.full_name}`})
    } catch (error) {
      toast({description: getErrorMessage(error), title: 'Could not add repository'})
    }
  }

  async function handleDisconnectRepo(repo: GitHubRepository) {
    try {
      await disconnectRepoMutation.mutateAsync({projectId, repoId: repo.id})
      toast({title: `Removed ${repo.fullName}`})
    } catch (error) {
      toast({description: getErrorMessage(error), title: 'Could not remove repository'})
    }
  }

  async function handleAutoTransitionsToggle() {
    if (!settings || !canEditProject) return

    try {
      await setAutoTransitionsMutation.mutateAsync({
        enabled: !settings.autoTransitionsEnabled,
        projectId,
      })
      toast({title: `Auto-transitions ${settings.autoTransitionsEnabled ? 'disabled' : 'enabled'}`})
    } catch (error) {
      toast({description: getErrorMessage(error), title: 'Could not update auto-transitions'})
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border-subtle bg-surface-base p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-text-strong" style={{fontFamily: "'Space Grotesk', sans-serif"}}>
            GitHub Board Settings
          </h3>
          <p className="mt-1 text-sm text-text-muted">
            Bind one GitHub source to this board, then choose the repositories this project should track.
          </p>
        </div>
        {currentSource ? (
          <div className="rounded-xl border border-border-subtle bg-surface-elevated px-3 py-2 text-right">
            <div className="text-xs uppercase tracking-wide text-text-muted">Current source</div>
            <div className="mt-1 text-sm font-medium text-text-strong">{formatSourceLabel(currentSource)}</div>
          </div>
        ) : null}
      </div>

      {!currentSource ? (
        <div className="space-y-4">
          <SourceSection
            canEditProject={canEditProject}
            onBindSource={handleBindSource}
            sources={orgSources}
            title="Organization Sources"
          />
          <SourceSection
            canEditProject={canEditProject}
            onBindSource={handleBindSource}
            sources={personalSources}
            title="Personal Sources"
          />
          {orgSources.length === 0 && personalSources.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-subtle p-4 text-sm text-text-muted">
              No GitHub sources are available yet.
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    void navigate({ href: `${buildOrgSettingsHref(organizationSlug)}?tab=github` })
                  }}
                  size="compact"
                  type="button"
                  variant="secondary"
                >
                  Manage Org GitHub
                </Button>
                <span className="self-center text-xs text-text-muted">
                  Personal PATs are managed from the user settings GitHub submenu.
                </span>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {canEditProject ? (
              <Button
                onClick={() => void handleAutoTransitionsToggle()}
                size="compact"
                type="button"
                variant={settings?.autoTransitionsEnabled ?? true ? 'primary' : 'secondary'}
              >
                Auto-transitions {settings?.autoTransitionsEnabled ?? true ? 'On' : 'Off'}
              </Button>
            ) : (
              <span className="text-xs text-text-muted">
                Auto-transitions: {(settings?.autoTransitionsEnabled ?? true) ? 'On' : 'Off'}
              </span>
            )}
            {canReconfigureSource ? (
              <>
                <Button
                  onClick={() => setShowSourceChooser((current) => !current)}
                  size="compact"
                  type="button"
                  variant="secondary"
                >
                  {showSourceChooser ? 'Hide Sources' : 'Change Source'}
                </Button>
                <Button
                  onClick={() => void handleClearSource()}
                  size="compact"
                  type="button"
                  variant="ghost"
                >
                  Clear Board Source
                </Button>
              </>
            ) : (
              <span className="text-xs text-text-muted">
                Only the owner of this personal source can reconfigure it.
              </span>
            )}
            {currentSource.scopeType === 'organization' ? (
              <Button
                onClick={() => {
                  void navigate({ href: `${buildOrgSettingsHref(organizationSlug)}?tab=github` })
                }}
                size="compact"
                type="button"
                variant="ghost"
              >
                Manage Source
              </Button>
            ) : (
              <span className="text-xs text-text-muted">
                Personal sources are managed from your user settings.
              </span>
            )}
          </div>

          {showSourceChooser ? (
            <div className="space-y-4 rounded-xl border border-border-subtle bg-surface-elevated p-3">
              <SourceSection
                canEditProject={canEditProject}
                onBindSource={handleBindSource}
                sources={orgSources}
                title="Organization Sources"
              />
              <SourceSection
                canEditProject={canEditProject}
                onBindSource={handleBindSource}
                sources={personalSources}
                title="Personal Sources"
              />
            </div>
          ) : null}

          <div className="rounded-xl border border-border-subtle">
            <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
              <div>
                <div className="text-sm font-medium text-text-strong">Connected Repositories</div>
                <div className="text-xs text-text-muted">
                  {repos.length === 0 ? 'No repositories connected yet.' : `${repos.length} repos connected to this board.`}
                </div>
              </div>
              {currentSource.scopeType === 'organization' ? (
                <a
                  className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-strong"
                  href={`${buildOrgSettingsHref(organizationSlug)}?tab=github`}
                >
                  Org allowlist <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>

            <div className="divide-y divide-border-subtle">
              {repos.length === 0 ? (
                <div className="px-4 py-5 text-sm text-text-muted">This board is bound to a source but not tracking any repositories yet.</div>
              ) : repos.map((repo) => (
                <div key={repo.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-sm text-text-strong">{repo.fullName}</span>
                      {repo.isPrivate ? <Lock className="h-3.5 w-3.5 text-text-muted" /> : null}
                    </div>
                    <div className="mt-1 text-xs text-text-muted">
                      Default branch: <span className="font-mono">{repo.defaultBranch}</span>
                    </div>
                  </div>
                  {canReconfigureSource ? (
                    <button
                      className="rounded-lg p-1 text-text-muted transition-colors hover:bg-canvas-accent hover:text-[#a13d34]"
                      onClick={() => void handleDisconnectRepo(repo)}
                      title="Remove repository"
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {canReconfigureSource ? (
            <div className="rounded-xl border border-border-subtle bg-surface-elevated p-4">
              <div className="mb-3 flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-text-muted" />
                <div>
                  <div className="text-sm font-medium text-text-strong">Add Repositories</div>
                  <div className="text-xs text-text-muted">
                    {currentSource.scopeType === 'organization'
                      ? 'Only org-allowlisted repositories are shown here.'
                      : 'All repositories accessible to your personal PAT are shown here.'}
                  </div>
                </div>
              </div>

              <Input
                onChange={(event) => setRepoSearch(event.target.value)}
                placeholder="Search repositories..."
                value={repoSearch}
              />

              <div className="mt-3 max-h-80 overflow-y-auto rounded-xl border border-border-subtle bg-surface-base">
                {isLoadingAvailableRepos ? (
                  <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-text-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading repositories...
                  </div>
                ) : null}

                {!isLoadingAvailableRepos && availableReposError ? (
                  <div className="px-4 py-6 text-sm text-[#a13d34]">{availableReposError}</div>
                ) : null}

                {!isLoadingAvailableRepos && !availableReposError && filteredAvailableRepos.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-text-muted">
                    {currentSource.scopeType === 'organization'
                      ? 'No allowlisted repositories are available for this source yet.'
                      : 'No repositories match your search.'}
                  </div>
                ) : null}

                {!isLoadingAvailableRepos && !availableReposError ? filteredAvailableRepos.map((repo) => (
                  <div key={repo.id} className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-text-strong">{repo.full_name}</span>
                        {repo.private ? <Lock className="h-3.5 w-3.5 text-text-muted" /> : null}
                        {repo.language ? <span className="text-xs text-text-muted">{repo.language}</span> : null}
                      </div>
                      {repo.description ? (
                        <div className="mt-1 truncate text-xs text-text-muted">{repo.description}</div>
                      ) : null}
                    </div>
                    <Button
                      disabled={connectRepoMutation.isPending}
                      onClick={() => void handleAddRepo(repo)}
                      size="compact"
                      type="button"
                      variant="primary"
                    >
                      Add
                    </Button>
                  </div>
                )) : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

function SourceSection({
  canEditProject,
  onBindSource,
  sources,
  title,
}: {
  canEditProject: boolean
  onBindSource: (source: GitHubConnectionSource) => void
  sources: GitHubConnectionSource[]
  title: string
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">{title}</div>
      <div className="space-y-2">
        {sources.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-subtle px-3 py-3 text-sm text-text-muted">
            No sources in this category.
          </div>
        ) : sources.map((source) => (
          <div key={source.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-elevated px-3 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <GitPullRequest className="h-4 w-4 text-text-muted" />
                <span className="truncate text-sm font-medium text-text-strong">{formatSourceLabel(source)}</span>
                <span className="rounded-full bg-canvas-accent px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">
                  {source.authType === 'github_app' ? 'App' : 'PAT'}
                </span>
              </div>
              <div className="mt-1 text-xs text-text-muted">
                {source.scopeType === 'organization' ? 'Shared with the organization' : 'Personal source'}
              </div>
            </div>
            {canEditProject ? (
              <Button
                onClick={() => onBindSource(source)}
                size="compact"
                type="button"
                variant="secondary"
              >
                Use For Board
              </Button>
            ) : (
              <span className="text-xs text-text-muted">Project write access is required to bind sources.</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function formatSourceLabel(source: GitHubConnectionSource) {
  return `${source.accountLogin} · ${source.authType === 'github_app' ? 'GitHub App' : 'PAT'}`
}
