import {useEffect, useMemo, useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {ExternalLink, Loader2, PlugZap, Plus, RefreshCw, Trash2} from 'lucide-react'

import {Badge} from '../../../components/ui/badge'
import {Button} from '../../../components/ui/button'
import {useToast} from '../../../components/ui/toast'
import {getErrorMessage} from '../../../platform/data/rpc-adapter'
import {
  cancelJiraConnectionSelection,
  completeJiraConnectionSelection,
  disconnectJira,
  getPendingJiraSites,
  initiateJiraConnection,
} from '../jira.connect'
import {organizationJiraStatusQueryOptions} from '../jira.queries'
import type {JiraConnectionSource, JiraPendingSite} from '../jira.types'

type OrganizationJiraSettingsProps = {
  canManage: boolean
  orgId: string
}

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function OrganizationJiraSettings({
  canManage,
  orgId,
}: OrganizationJiraSettingsProps) {
  const queryClient = useQueryClient()
  const {toast} = useToast()
  const statusQuery = useQuery(organizationJiraStatusQueryOptions(orgId))
  const status = statusQuery.data
  const sources = status?.sources ?? []
  const activeSources = useMemo(
    () => sources.filter((source) => source.status === 'active'),
    [sources],
  )

  const [isConnecting, setIsConnecting] = useState(false)
  const [disconnectingSourceId, setDisconnectingSourceId] = useState<string | null>(null)
  const [pendingSelectionState, setPendingSelectionState] = useState<string | null>(() =>
    readPendingJiraSelectionState(orgId)
  )
  const [selectingCloudId, setSelectingCloudId] = useState<string | null>(null)
  const [isCancellingSelection, setIsCancellingSelection] = useState(false)
  const pendingSitesQuery = useQuery({
    enabled: Boolean(pendingSelectionState),
    queryFn: () => getPendingJiraSites(pendingSelectionState!, orgId),
    queryKey: ['jira-pending-sites', orgId, pendingSelectionState],
    retry: false,
  })
  const pendingSites = pendingSitesQuery.data ?? []

  useEffect(() => {
    setPendingSelectionState(readPendingJiraSelectionState(orgId))
  }, [orgId])

  useEffect(() => {
    const url = new URL(window.location.href)
    const jiraStatus = url.searchParams.get('jira_status')
    if (!jiraStatus) return

    if (jiraStatus === 'connected') {
      clearPendingJiraSelectionState(orgId)
      toast({title: 'Jira connected'})
      void queryClient.invalidateQueries({queryKey: ['jira-org-status', orgId]})
    } else if (jiraStatus === 'select_site') {
      const jiraState = url.searchParams.get('jira_state')
      if (jiraState) {
        writePendingJiraSelectionState(orgId, jiraState)
        setPendingSelectionState(jiraState)
        toast({
          description: 'Select which Atlassian site Rocketboard should connect.',
          title: 'Choose a Jira site',
        })
      } else {
        toast({
          description: 'Jira returned multiple sites but no site selection state.',
          title: 'Could not connect Jira',
          variant: 'error',
        })
      }
    } else {
      toast({
        description: url.searchParams.get('message') ?? 'Jira connection failed.',
        title: 'Could not connect Jira',
        variant: 'error',
      })
    }

    url.searchParams.delete('jira_status')
    url.searchParams.delete('jira_state')
    url.searchParams.delete('message')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [orgId, queryClient, toast])

  async function handleConnect() {
    setIsConnecting(true)
    try {
      await initiateJiraConnection(orgId, window.location.pathname + window.location.search)
    } catch (error) {
      setIsConnecting(false)
      toast({
        description: getErrorMessage(error, 'Could not start Jira connection.'),
        title: 'Could not connect Jira',
        variant: 'error',
      })
    }
  }

  async function handleDisconnect(source: JiraConnectionSource) {
    setDisconnectingSourceId(source.id)
    try {
      await disconnectJira(source.id)
      await queryClient.invalidateQueries({queryKey: ['jira-org-status', orgId]})
      toast({title: `Disconnected ${source.siteName}`})
    } catch (error) {
      toast({
        description: getErrorMessage(error, 'Could not disconnect Jira.'),
        title: 'Could not disconnect Jira',
        variant: 'error',
      })
    } finally {
      setDisconnectingSourceId(null)
    }
  }

  async function handleCompleteSelection(site: JiraPendingSite) {
    if (!pendingSelectionState) return

    setSelectingCloudId(site.cloudId)
    try {
      await completeJiraConnectionSelection(pendingSelectionState, site.cloudId, orgId)
      clearPendingJiraSelectionState(orgId)
      setPendingSelectionState(null)
      await queryClient.invalidateQueries({queryKey: ['jira-org-status', orgId]})
      toast({title: `Connected ${site.siteName}`})
    } catch (error) {
      toast({
        description: getErrorMessage(error, 'Could not save Jira connection.'),
        title: 'Could not connect Jira',
        variant: 'error',
      })
    } finally {
      setSelectingCloudId(null)
    }
  }

  async function handleCancelSelection() {
    if (!pendingSelectionState) return

    setIsCancellingSelection(true)
    try {
      await cancelJiraConnectionSelection(pendingSelectionState, orgId)
      clearPendingJiraSelectionState(orgId)
      setPendingSelectionState(null)
      toast({title: 'Jira connection cancelled'})
    } catch (error) {
      toast({
        description: getErrorMessage(error, 'Could not cancel Jira connection.'),
        title: 'Could not cancel Jira connection',
        variant: 'error',
      })
    } finally {
      setIsCancellingSelection(false)
    }
  }

  const isMissingConfig = status?.config.configured === false

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border-subtle bg-surface-base p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <PlugZap className="h-4 w-4 text-text-muted"/>
              <h2 className="text-base font-semibold text-text-strong">Jira</h2>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-text-muted">
              Connect an Atlassian Jira Cloud site for bug and worklog metrics in GitHub board stats.
            </p>
          </div>

          {canManage ? (
            <Button
              disabled={isConnecting || statusQuery.isLoading || isMissingConfig}
              onClick={handleConnect}
              variant="primary"
            >
              {isConnecting ? <Loader2 className="h-4 w-4 animate-spin"/> : <Plus className="h-4 w-4"/>}
              Add Jira Connection
            </Button>
          ) : null}
        </div>

        {!canManage ? (
          <p className="mt-4 rounded-lg bg-canvas-accent px-3 py-2 text-sm text-text-muted">
            Only organization admins can connect or disconnect Jira sources.
          </p>
        ) : null}

        {isMissingConfig ? (
          <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            Atlassian OAuth secrets are missing: {status.config.missingSecrets.join(', ')}.
          </div>
        ) : null}
      </section>

      {pendingSelectionState ? (
        <section className="rounded-2xl border border-warning/30 bg-warning/5">
          <div className="flex flex-col gap-3 border-b border-warning/20 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-text-strong">Choose Jira site</h3>
              <p className="mt-1 text-sm text-text-muted">
                Atlassian returned multiple Jira Cloud sites for this account. Pick the site to connect.
              </p>
            </div>
            <Button
              disabled={isCancellingSelection || selectingCloudId !== null}
              onClick={() => void handleCancelSelection()}
              size="compact"
              variant="secondary"
            >
              {isCancellingSelection ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : null}
              Cancel
            </Button>
          </div>

          {pendingSitesQuery.isLoading ? (
            <div className="space-y-3 p-5">
              <div className="h-14 animate-pulse rounded-lg bg-canvas-accent"/>
              <div className="h-14 animate-pulse rounded-lg bg-canvas-accent"/>
            </div>
          ) : pendingSitesQuery.isError ? (
            <div className="p-5 text-sm text-warning">
              {getErrorMessage(pendingSitesQuery.error, 'Could not load Jira site choices.')}
            </div>
          ) : pendingSites.length === 0 ? (
            <div className="p-5 text-sm text-text-muted">
              No Jira sites are available for this connection. Start the connection again.
            </div>
          ) : (
            <div className="divide-y divide-warning/20">
              {pendingSites.map((site) => (
                <div
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  key={site.cloudId}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-text-strong">{site.siteName}</p>
                    <a
                      className="mt-1 inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-strong hover:underline"
                      href={site.siteUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {site.siteUrl}
                      <ExternalLink className="h-3 w-3"/>
                    </a>
                  </div>

                  <Button
                    disabled={selectingCloudId !== null || isCancellingSelection}
                    onClick={() => void handleCompleteSelection(site)}
                    size="compact"
                    variant="primary"
                  >
                    {selectingCloudId === site.cloudId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin"/>
                    ) : (
                      <PlugZap className="h-3.5 w-3.5"/>
                    )}
                    Connect
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section className="rounded-2xl border border-border-subtle bg-surface-base">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-text-strong">Connected Sites</h3>
            <p className="mt-1 text-xs text-text-muted">
              {activeSources.length} active {activeSources.length === 1 ? 'site' : 'sites'}
            </p>
          </div>
          <Button
            disabled={statusQuery.isFetching}
            onClick={() => void statusQuery.refetch()}
            size="compact"
            variant="secondary"
          >
            {statusQuery.isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin"/>
            ) : (
              <RefreshCw className="h-3.5 w-3.5"/>
            )}
            Refresh
          </Button>
        </div>

        {statusQuery.isLoading ? (
          <div className="space-y-3 p-5">
            <div className="h-14 animate-pulse rounded-lg bg-canvas-accent"/>
            <div className="h-14 animate-pulse rounded-lg bg-canvas-accent"/>
          </div>
        ) : sources.length === 0 ? (
          <div className="p-5 text-sm text-text-muted">
            No Jira sites connected.
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {sources.map((source) => (
              <div
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                key={source.id}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-text-strong">{source.siteName}</p>
                    <Badge
                      className={source.status === 'active'
                        ? 'bg-secondary-soft text-secondary'
                        : 'bg-warning/10 text-warning'}
                      variant="subtle"
                    >
                      {source.status}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                    <a
                      className="inline-flex items-center gap-1 hover:text-text-strong hover:underline"
                      href={source.siteUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {source.siteUrl}
                      <ExternalLink className="h-3 w-3"/>
                    </a>
                    <span>{source.accountEmail ?? source.accountId}</span>
                    <span>Last synced {formatDate(source.lastSyncedAt)}</span>
                  </div>
                </div>

                {canManage ? (
                  <Button
                    disabled={disconnectingSourceId === source.id}
                    onClick={() => void handleDisconnect(source)}
                    size="compact"
                    variant="secondary"
                  >
                    {disconnectingSourceId === source.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin"/>
                    ) : (
                      <Trash2 className="h-3.5 w-3.5"/>
                    )}
                    Disconnect
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function formatDate(value: string | null) {
  if (!value) return 'never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'never'
  return DATE_FORMATTER.format(date)
}

function pendingJiraSelectionStorageKey(orgId: string) {
  return `rocketboard:jira-pending-selection:${orgId}`
}

function readPendingJiraSelectionState(orgId: string) {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage.getItem(pendingJiraSelectionStorageKey(orgId))
  } catch {
    return null
  }
}

function writePendingJiraSelectionState(orgId: string, state: string) {
  try {
    window.sessionStorage.setItem(pendingJiraSelectionStorageKey(orgId), state)
  } catch {
    // The URL callback still carries the state for this render when storage is unavailable.
  }
}

function clearPendingJiraSelectionState(orgId: string) {
  try {
    window.sessionStorage.removeItem(pendingJiraSelectionStorageKey(orgId))
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}
