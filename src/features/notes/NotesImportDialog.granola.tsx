import {AlertTriangle, CheckCircle2, Download, KeyRound, RefreshCw, Unplug} from 'lucide-react'
import {useCallback, useMemo, useState} from 'react'

import {Button} from '../../components/ui/button'
import {Input} from '../../components/ui/input'
import {cn} from '../../lib/cn'
import {formatNoteDate} from './note.types'
import type {GranolaConnectionMode, GranolaConnectionRecord} from './granola-import.shared'
import {RadioCard} from './NotesImportDialog.shared'

function formatLastSync(connection: GranolaConnectionRecord | null) {
  if (!connection?.lastSyncFinishedAt) {
    return 'Not synced yet'
  }

  return `Last synced ${formatNoteDate(connection.lastSyncFinishedAt)}`
}

function getModeLabel(mode: GranolaConnectionMode) {
  return mode === 'capture' ? 'Capture (editable)' : 'Mirror (read-only)'
}

export function AuthMethodStep({
  onContinue,
}: {
  onContinue: (method: 'oauth' | 'api_key') => void
}) {
  const [method, setMethod] = useState<'oauth' | 'api_key'>('api_key')

  return (
    <div>
      <p className='mb-4 text-sm font-medium text-text-strong'>Choose how to connect</p>
      <div className='space-y-3' role='radiogroup'>
        <RadioCard
          badge='Free'
          badgeVariant='success'
          description='Connect your free Granola account. Your notes will be downloaded and editable.'
          disabled
          onSelect={() => setMethod('oauth')}
          selected={method === 'oauth'}
          title='Sign in with Granola'
        />
        <RadioCard
          badge='Business'
          description='Paste a Granola Personal API key. Requires Business plan. Full history, choose Mirror or Capture.'
          onSelect={() => setMethod('api_key')}
          selected={method === 'api_key'}
          title='Use API key'
        />
      </div>
      <div className='mt-6 flex justify-end'>
        <Button
          className='min-h-11'
          disabled={method === 'oauth'}
          onClick={() => onContinue(method)}
          type='button'
          variant='primary'
        >
          Continue
        </Button>
      </div>
    </div>
  )
}

export function ApiKeyConnectStep({
  isConnecting,
  onConnect,
}: {
  isConnecting: boolean
  onConnect: (token: string, mode: GranolaConnectionMode) => void
}) {
  const [token, setToken] = useState('')
  const [mode, setMode] = useState<GranolaConnectionMode>('capture')

  return (
    <div>
      <div className='space-y-2'>
        <label className='block'>
          <span className='text-sm font-medium text-text-strong'>Granola API key</span>
          <Input
            autoCapitalize='none'
            autoComplete='off'
            className='mt-2'
            disabled={isConnecting}
            onChange={(event) => setToken(event.target.value)}
            placeholder='grn_...'
            spellCheck={false}
            type='password'
            value={token}
          />
        </label>
        <p className='text-xs text-text-muted'>
          Available from Settings, then API, in the Granola desktop app.
        </p>
      </div>

      <div className='my-5 flex items-center gap-3'>
        <div className='h-px flex-1 bg-border-subtle'/>
        <span className='text-xs font-medium text-text-muted'>How should notes appear?</span>
        <div className='h-px flex-1 bg-border-subtle'/>
      </div>

      <div className='space-y-3' role='radiogroup'>
        <RadioCard
          badge='Recommended'
          badgeVariant='accent'
          description='Editable. Organize and change freely.'
          disabled={isConnecting}
          onSelect={() => setMode('capture')}
          selected={mode === 'capture'}
          title='Capture'
        />
        <RadioCard
          description='Read-only. Always matches Granola.'
          disabled={isConnecting}
          onSelect={() => setMode('mirror')}
          selected={mode === 'mirror'}
          title='Mirror'
        />
      </div>

      <div className='mt-6 flex justify-end'>
        <Button
          className='min-h-11'
          disabled={isConnecting || token.trim().length === 0}
          onClick={() => onConnect(token.trim(), mode)}
          type='button'
          variant='primary'
        >
          {isConnecting ? (
            <>
              <RefreshCw className='h-4 w-4 animate-spin'/>
              Connecting...
            </>
          ) : (
            <>
              <KeyRound className='h-4 w-4'/>
              Connect &amp; Import
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

function ReconnectInput({
  isConnecting,
  onReconnect,
}: {
  isConnecting: boolean
  onReconnect: (token: string) => void
}) {
  const [token, setToken] = useState('')

  return (
    <div className='mt-4 rounded-2xl border border-border-subtle bg-canvas-accent/60 p-4'>
      <label className='block space-y-2'>
        <span className='text-sm font-medium text-text-strong'>New API key</span>
        <Input
          autoCapitalize='none'
          autoComplete='off'
          disabled={isConnecting}
          onChange={(event) => setToken(event.target.value)}
          placeholder='grn_...'
          spellCheck={false}
          type='password'
          value={token}
        />
      </label>
      <p className='mt-2 text-xs text-text-muted'>
        Get a new key from Settings, then API, in the Granola desktop app.
      </p>
      <div className='mt-3 flex justify-end'>
        <Button
          className='min-h-9'
          disabled={isConnecting || token.trim().length === 0}
          onClick={() => onReconnect(token.trim())}
          type='button'
          variant='primary'
        >
          {isConnecting ? (
            <>
              <RefreshCw className='h-4 w-4 animate-spin'/>
              Reconnecting...
            </>
          ) : (
            <>
              <KeyRound className='h-4 w-4'/>
              Reconnect
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

export function ConnectedStatusStep({
  connection,
  importedNoteCount,
  isConnecting,
  isSyncing,
  onDisconnect,
  onModeChange,
  onReconnect,
  onSync,
  statusAnnouncement,
}: {
  connection: GranolaConnectionRecord
  importedNoteCount: number
  isConnecting: boolean
  isSyncing: boolean
  onDisconnect: () => void
  onModeChange: (mode: GranolaConnectionMode, convertExisting: boolean) => void
  onReconnect: (token: string) => void
  onSync: () => void
  statusAnnouncement?: string | null
}) {
  const [showModeSelector, setShowModeSelector] = useState(false)
  const [pendingMode, setPendingMode] = useState<GranolaConnectionMode>(connection.mode)
  const [showConvertPrompt, setShowConvertPrompt] = useState(false)
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)

  const isConnected = connection.status === 'connected'
  const needsReconnect = connection.status === 'needs_reconnect'
  const hasCompletedImport = Boolean(connection.initialImportCompletedAt)

  const statusConfig = useMemo(() => {
    if (isConnecting) {
      return {description: 'Checking the API key and preparing your Granola folder.', icon: KeyRound, label: 'Connecting', tone: 'text-text-strong'}
    }
    if (isSyncing) {
      return {
        description: hasCompletedImport
          ? 'Notes are syncing in the background.'
          : 'The first import is running. Notes will appear in your Granola folder as batches finish.',
        icon: Download,
        label: hasCompletedImport ? 'Syncing' : 'Importing',
        tone: 'text-text-strong',
      }
    }
    if (needsReconnect) {
      return {
        description: 'Granola rejected the saved API key. This can happen if the key was revoked or your Granola plan changed. Your notes in Rocketboard are safe. Paste a new API key to reconnect.',
        icon: AlertTriangle,
        label: 'Reconnect required',
        tone: 'text-error',
      }
    }
    if (connection.status === 'error') {
      return {description: connection.lastSyncError ?? 'The last sync failed.', icon: AlertTriangle, label: 'Sync issue', tone: 'text-error'}
    }
    return {description: 'Granola notes are connected.', icon: CheckCircle2, label: 'Connected', tone: 'text-text-strong'}
  }, [connection.lastSyncError, connection.status, hasCompletedImport, isConnected, isConnecting, isSyncing, needsReconnect])

  const handleModeConfirm = useCallback(() => {
    if (pendingMode === connection.mode) {
      setShowModeSelector(false)
      return
    }

    if (pendingMode === 'capture' && connection.mode === 'mirror') {
      setShowConvertPrompt(true)
      return
    }

    onModeChange(pendingMode, false)
    setShowModeSelector(false)
  }, [connection.mode, onModeChange, pendingMode])

  const handleConvert = useCallback((convertExisting: boolean) => {
    onModeChange(pendingMode, convertExisting)
    setShowConvertPrompt(false)
    setShowModeSelector(false)
  }, [onModeChange, pendingMode])

  const StatusIcon = statusConfig.icon
  const syncButtonLabel = connection.mode === 'capture'
    ? hasCompletedImport ? 'Check for new notes' : 'Start import'
    : hasCompletedImport ? 'Sync now' : 'Start import'

  return (
    <div className='rounded-[28px] border border-border-subtle bg-surface-elevated p-5 shadow-panel'>
      <div className='flex items-start gap-4'>
        <div className='flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#ffe5d9,#fff4ec)] text-3xl font-semibold text-[#f0544f] shadow-sm'>
          G
        </div>
        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <h3 className='font-display text-2xl font-semibold text-text-strong'>Granola</h3>
            <span className={cn('text-sm font-medium', statusConfig.tone)}>
              {statusConfig.label}
            </span>
          </div>
          <div className='mt-3 flex items-start gap-2 text-sm text-text-medium'>
            <StatusIcon className={cn('mt-0.5 h-4 w-4 shrink-0', statusConfig.tone)} />
            <p>{statusConfig.description}</p>
          </div>
        </div>
      </div>

      {isSyncing ? (
        <div className='mt-5'>
          <div className='h-2 overflow-hidden rounded-full bg-canvas-accent'>
            <div className='h-full w-1/3 animate-pulse rounded-full bg-primary'/>
          </div>
        </div>
      ) : null}

      <div className='mt-5 space-y-2 rounded-2xl border border-border-subtle bg-surface-base px-4 py-3 text-sm text-text-medium'>
        <p>{formatLastSync(connection)}</p>
        <div className='flex items-center gap-2'>
          <span>Mode: {getModeLabel(connection.mode)}</span>
          {!showModeSelector ? (
            <button
              className='text-xs font-medium text-primary hover:underline'
              onClick={() => {
                setPendingMode(connection.mode)
                setShowModeSelector(true)
              }}
              type='button'
            >
              Change
            </button>
          ) : null}
        </div>
        <p>Method: {connection.authMethod === 'oauth' ? 'Granola account' : 'API key'}</p>
        {importedNoteCount > 0 ? (
          <p>{importedNoteCount} note{importedNoteCount === 1 ? '' : 's'} in My Notes.</p>
        ) : null}
        {connection.lastSyncError && connection.status !== 'needs_reconnect' ? (
          <p className='text-error'>{connection.lastSyncError}</p>
        ) : null}
      </div>

      {needsReconnect ? (
        <ReconnectInput
          isConnecting={isConnecting}
          onReconnect={(newToken) => onReconnect(newToken)}
        />
      ) : null}

      {showModeSelector && !showConvertPrompt ? (
        <div className='mt-4 space-y-3'>
          <div className='space-y-2' role='radiogroup'>
            <RadioCard
              badge='Recommended'
              badgeVariant='accent'
              description='Editable. Organize and change freely.'
              onSelect={() => setPendingMode('capture')}
              selected={pendingMode === 'capture'}
              title='Capture'
            />
            <RadioCard
              description='Read-only. Always matches Granola.'
              onSelect={() => setPendingMode('mirror')}
              selected={pendingMode === 'mirror'}
              title='Mirror'
            />
          </div>
          <div className='flex justify-end gap-2'>
            <Button className='min-h-9' onClick={() => setShowModeSelector(false)} type='button' variant='ghost'>
              Cancel
            </Button>
            <Button className='min-h-9' onClick={handleModeConfirm} type='button' variant='primary'>
              Apply
            </Button>
          </div>
        </div>
      ) : null}

      {showConvertPrompt ? (
        <div className='mt-4 rounded-2xl border border-border-subtle bg-canvas-accent/60 p-4'>
          <p className='text-sm font-medium text-text-strong'>Make existing mirrored notes editable too?</p>
          <p className='mt-1 text-sm text-text-muted'>
            Existing mirrored notes will become fully editable. Future syncs will capture new notes only.
          </p>
          <div className='mt-3 flex gap-2'>
            <Button className='min-h-9' onClick={() => handleConvert(true)} type='button' variant='primary'>
              Yes, convert all
            </Button>
            <Button className='min-h-9' onClick={() => handleConvert(false)} type='button' variant='ghost'>
              No, just new notes
            </Button>
          </div>
        </div>
      ) : null}

      {showDisconnectConfirm ? (
        <div className='mt-4 rounded-2xl border border-border-subtle bg-canvas-accent/60 p-4'>
          <p className='text-sm font-medium text-text-strong'>Disconnect Granola?</p>
          <p className='mt-1 text-sm text-text-muted'>
            {connection.mode === 'mirror' && importedNoteCount > 0
              ? `Your ${importedNoteCount} mirrored note${importedNoteCount === 1 ? '' : 's'} will become editable. They'll stay in My Notes after disconnecting.`
              : 'Your notes will stay in My Notes after disconnecting.'}
          </p>
          <div className='mt-3 flex gap-2'>
            <Button className='min-h-9 text-error hover:text-error' onClick={onDisconnect} type='button' variant='ghost'>
              Disconnect
            </Button>
            <Button className='min-h-9' onClick={() => setShowDisconnectConfirm(false)} type='button' variant='ghost'>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className='mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        {!showDisconnectConfirm ? (
          <Button className='min-h-11' onClick={() => setShowDisconnectConfirm(true)} type='button' variant='ghost'>
            <Unplug className='h-4 w-4'/>
            Disconnect
          </Button>
        ) : <div />}

        <Button
          className='min-h-11'
          disabled={isConnecting || isSyncing || needsReconnect}
          onClick={onSync}
          type='button'
          variant='primary'
        >
          {isSyncing ? (
            <>
              <RefreshCw className='h-4 w-4 animate-spin'/>
              {hasCompletedImport ? 'Syncing...' : 'Importing...'}
            </>
          ) : (
            <>
              <RefreshCw className='h-4 w-4'/>
              {syncButtonLabel}
            </>
          )}
        </Button>
      </div>

      <p aria-live='polite' className='sr-only'>
        {statusAnnouncement ?? ''}
      </p>
    </div>
  )
}
