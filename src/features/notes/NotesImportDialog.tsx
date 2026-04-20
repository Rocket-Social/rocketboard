import {AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, Download, KeyRound, RefreshCw, Unplug, Upload} from 'lucide-react'
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'

import {Button} from '../../components/ui/button'
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '../../components/ui/dialog'
import {Input} from '../../components/ui/input'
import {cn} from '../../lib/cn'
import {formatNoteDate} from './note.types'
import type {GranolaConnectionMode, GranolaConnectionRecord} from './granola-import.shared'
import type {VaultImportProgress} from './obsidian-import'

type DialogStep = 'source' | 'auth-method' | 'connect' | 'status' | 'obsidian-upload' | 'obsidian-progress' | 'obsidian-complete'

export type ObsidianImportState = {
  error: string | null
  isRunning: boolean
  progress: VaultImportProgress | null
  result: {foldersCreated: number; insertedCount: number; skippedCount: number} | null
}

type NotesImportDialogProps = {
  connection: GranolaConnectionRecord | null
  importedNoteCount: number
  isConnecting: boolean
  isDesktop: boolean
  isOpen: boolean
  isSyncing: boolean
  obsidianImportState?: ObsidianImportState | null
  obsidianNoteCount?: number
  onClose: () => void
  onConnect: (token: string, mode: GranolaConnectionMode) => void
  onDisconnect: () => void
  onModeChange: (mode: GranolaConnectionMode, convertExisting: boolean) => void
  onObsidianImport?: (file: File) => void
  onReconnect: (token: string) => void
  onSync: () => void
  statusAnnouncement?: string | null
}

function formatLastSync(connection: GranolaConnectionRecord | null) {
  if (!connection?.lastSyncFinishedAt) {
    return 'Not synced yet'
  }

  return `Last synced ${formatNoteDate(connection.lastSyncFinishedAt)}`
}

function getModeLabel(mode: GranolaConnectionMode) {
  return mode === 'capture' ? 'Capture (editable)' : 'Mirror (read-only)'
}

// ============================================================
// Radio card component
// ============================================================

function RadioCard({
  badge,
  badgeVariant = 'neutral',
  children,
  description,
  disabled = false,
  selected,
  title,
  onSelect,
}: {
  badge?: string
  badgeVariant?: 'accent' | 'neutral' | 'success'
  children?: React.ReactNode
  description: string
  disabled?: boolean
  selected: boolean
  title: string
  onSelect: () => void
}) {
  const badgeColor = badgeVariant === 'success'
    ? 'bg-success/10 text-success border-success/20'
    : badgeVariant === 'accent'
      ? 'bg-primary/10 text-primary border-primary/20'
      : 'border-border-subtle text-text-muted'

  return (
    <button
      aria-checked={selected}
      className={cn(
        'w-full rounded-2xl border p-4 text-left transition-colors',
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border-subtle hover:border-border-strong',
        disabled && 'cursor-default opacity-50',
      )}
      disabled={disabled}
      onClick={onSelect}
      role='radio'
      type='button'
    >
      <div className='flex items-start gap-3'>
        <div className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
          selected ? 'border-primary' : 'border-text-muted/40',
        )}>
          {selected ? <div className='h-2 w-2 rounded-full bg-primary'/> : null}
        </div>
        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='text-sm font-semibold text-text-strong'>{title}</span>
            {badge ? (
              <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', badgeColor)}>
                {badge}
              </span>
            ) : null}
          </div>
          <p className='mt-1 text-sm text-text-muted'>{description}</p>
          {children}
        </div>
      </div>
    </button>
  )
}

// ============================================================
// Dialog shell
// ============================================================

function DialogShell({
  children,
  isDesktop,
  onBack,
  onClose,
  subtitle,
  title,
}: {
  children: React.ReactNode
  isDesktop: boolean
  onBack?: () => void
  onClose: () => void
  subtitle?: string
  title: string
}) {
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent
        className={cn(
          'overflow-hidden bg-surface-base',
          isDesktop
            ? 'w-[min(30rem,calc(100vw-2rem))] rounded-[28px]'
            : 'inset-0 left-0 top-0 flex h-full max-h-full w-full max-w-full translate-x-0 translate-y-0 flex-col rounded-none',
        )}
      >
        <DialogHeader className='flex-row items-start gap-3 px-6 py-5 pr-14'>
          {onBack ? (
            <button
              aria-label='Go back'
              className='mt-1 rounded-lg p-1 text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong'
              onClick={onBack}
              type='button'
            >
              <ArrowLeft className='h-4 w-4'/>
            </button>
          ) : null}
          <div>
            <p className='font-mono text-xs uppercase tracking-[0.24em] text-text-muted'>
              {subtitle ?? 'Import'}
            </p>
            <DialogTitle className='mt-1 font-display text-2xl'>
              {title}
            </DialogTitle>
            <DialogDescription className='sr-only'>
              Bring notes into Rocketboard from an external source.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className='flex-1 overflow-y-auto px-6 py-5'>
          {children}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Step 1: Source picker
// ============================================================

function SourcePickerStep({
  granolaConnection,
  granolaNotesCount,
  obsidianNotesCount,
  onSelectGranola,
  onSelectObsidian,
}: {
  granolaConnection: GranolaConnectionRecord | null
  granolaNotesCount: number
  obsidianNotesCount: number
  onSelectGranola: () => void
  onSelectObsidian: () => void
}) {
  const hasGranola = granolaConnection && granolaConnection.status !== 'disconnected'

  return (
    <div className='space-y-3'>
      <button
        className='flex w-full items-center gap-4 rounded-2xl border border-border-subtle bg-surface-elevated p-4 text-left transition-colors hover:border-border-strong'
        onClick={onSelectGranola}
        type='button'
      >
        <div className='flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#ffe5d9,#fff4ec)] text-2xl font-semibold text-[#f0544f] shadow-sm'>
          G
        </div>
        <div className='min-w-0 flex-1'>
          <span className='text-sm font-semibold text-text-strong'>Granola</span>
          {hasGranola ? (
            <p className='text-sm text-text-muted'>{granolaNotesCount} notes &middot; Connected</p>
          ) : (
            <p className='text-sm text-text-muted'>AI meeting notes</p>
          )}
        </div>
        <ChevronRight className='h-4 w-4 shrink-0 text-text-muted'/>
      </button>

      <button
        className='flex w-full items-center gap-4 rounded-2xl border border-border-subtle bg-surface-elevated p-4 text-left transition-colors hover:border-border-strong'
        onClick={onSelectObsidian}
        type='button'
      >
        <div className='flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-100 to-purple-50 text-2xl shadow-sm'>
          <span className='text-indigo-600'>&#9670;</span>
        </div>
        <div className='min-w-0 flex-1'>
          <span className='text-sm font-semibold text-text-strong'>Obsidian</span>
          {obsidianNotesCount > 0 ? (
            <p className='text-sm text-text-muted'>{obsidianNotesCount} notes imported</p>
          ) : (
            <p className='text-sm text-text-muted'>Markdown vault</p>
          )}
        </div>
        <ChevronRight className='h-4 w-4 shrink-0 text-text-muted'/>
      </button>
    </div>
  )
}

// ============================================================
// Step 2: Auth method
// ============================================================

function AuthMethodStep({
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

// ============================================================
// Step 3b: API key + mode selector
// ============================================================

function ApiKeyConnectStep({
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

// ============================================================
// Step 4: Connected status
// ============================================================

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

function ConnectedStatusStep({
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

// ============================================================
// Obsidian steps
// ============================================================

function ObsidianUploadStep({
  onUpload,
}: {
  onUpload: (file: File) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFile = useCallback((file: File) => {
    if (file.name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
      onUpload(file)
    }
  }, [onUpload])

  return (
    <div>
      <div
        className={cn(
          'flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-border-subtle hover:border-border-strong',
        )}
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
        onDragOver={(e) => { e.preventDefault() }}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) handleFile(file)
        }}
      >
        <Upload className='mb-3 h-8 w-8 text-text-muted'/>
        <p className='text-sm font-medium text-text-strong'>
          Drop your vault zip here
        </p>
        <p className='mt-1 text-sm text-text-muted'>or click to browse</p>
        <p className='mt-3 text-xs text-text-muted'>
          .zip file exported from Obsidian
        </p>
      </div>

      <input
        accept='.zip'
        className='hidden'
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
        ref={fileInputRef}
        type='file'
      />

      <p className='mt-4 text-sm text-text-muted'>
        Markdown files will be imported as editable notes. Folder structure will be preserved.
      </p>
    </div>
  )
}

function ObsidianProgressStep({
  progress,
}: {
  progress: VaultImportProgress | null
}) {
  const current = progress?.current ?? 0
  const total = progress?.total ?? 0
  const pct = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <div className='space-y-4'>
      <div>
        <div className='flex items-center justify-between text-sm text-text-medium'>
          <span>{current} of {total} notes</span>
          <span>{pct}%</span>
        </div>
        <div className='mt-2 h-2 overflow-hidden rounded-full bg-canvas-accent'>
          <div
            className='h-full rounded-full bg-primary transition-[width] duration-200'
            style={{width: `${pct}%`}}
          />
        </div>
      </div>
      {progress?.currentFile ? (
        <p className='truncate text-xs text-text-muted'>{progress.currentFile}</p>
      ) : null}
    </div>
  )
}

function ObsidianCompleteStep({
  onDone,
  result,
  skippedFileCount,
}: {
  onDone: () => void
  result: {foldersCreated: number; insertedCount: number; skippedCount: number}
  skippedFileCount: number
}) {
  return (
    <div className='space-y-4'>
      <div className='space-y-2'>
        <div className='flex items-center gap-2 text-sm text-text-strong'>
          <CheckCircle2 className='h-4 w-4 text-success'/>
          <span>{result.insertedCount} note{result.insertedCount === 1 ? '' : 's'} imported</span>
        </div>
        {result.foldersCreated > 0 ? (
          <div className='flex items-center gap-2 text-sm text-text-strong'>
            <CheckCircle2 className='h-4 w-4 text-success'/>
            <span>{result.foldersCreated} folder{result.foldersCreated === 1 ? '' : 's'} created</span>
          </div>
        ) : null}
        {result.skippedCount > 0 ? (
          <p className='text-sm text-text-muted'>
            {result.skippedCount} note{result.skippedCount === 1 ? '' : 's'} skipped (already imported)
          </p>
        ) : null}
        {skippedFileCount > 0 ? (
          <p className='text-sm text-text-muted'>
            {skippedFileCount} file{skippedFileCount === 1 ? '' : 's'} skipped (images, config)
          </p>
        ) : null}
      </div>
      <div className='flex justify-end'>
        <Button className='min-h-11' onClick={onDone} type='button' variant='primary'>
          Done
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// Main dialog
// ============================================================

export function NotesImportDialog({
  connection,
  importedNoteCount,
  isConnecting,
  isDesktop,
  isOpen,
  isSyncing,
  obsidianImportState,
  obsidianNoteCount = 0,
  onClose,
  onConnect,
  onDisconnect,
  onModeChange,
  onObsidianImport,
  onReconnect,
  onSync,
  statusAnnouncement,
}: NotesImportDialogProps) {
  const hasGranolaConnection = connection && connection.status !== 'disconnected'
  const [step, setStep] = useState<DialogStep>('source')
  const obsidianSkippedFiles = 0

  useEffect(() => {
    if (!isOpen) {
      setStep('source')
    }
  }, [isOpen])

  // After a successful Granola connect, jump to status
  useEffect(() => {
    if (hasGranolaConnection && step === 'connect') {
      setStep('status')
    }
  }, [hasGranolaConnection, step])

  // Track Obsidian import progress → completion
  useEffect(() => {
    if (obsidianImportState?.result && step === 'obsidian-progress') {
      setStep('obsidian-complete')
    }
  }, [obsidianImportState?.result, step])

  if (!isOpen) {
    return null
  }

  if (step === 'source') {
    return (
      <DialogShell isDesktop={isDesktop} onClose={onClose} title='Bring notes into Rocketboard'>
        <SourcePickerStep
          granolaConnection={connection}
          granolaNotesCount={importedNoteCount}
          obsidianNotesCount={obsidianNoteCount}
          onSelectGranola={() => setStep(hasGranolaConnection ? 'status' : 'auth-method')}
          onSelectObsidian={() => setStep('obsidian-upload')}
        />
      </DialogShell>
    )
  }

  if (step === 'auth-method') {
    return (
      <DialogShell isDesktop={isDesktop} onBack={() => setStep('source')} onClose={onClose} title='Connect Granola'>
        <AuthMethodStep onContinue={() => setStep('connect')}/>
      </DialogShell>
    )
  }

  if (step === 'connect') {
    return (
      <DialogShell isDesktop={isDesktop} onBack={() => setStep('auth-method')} onClose={onClose} title='Connect Granola'>
        <ApiKeyConnectStep isConnecting={isConnecting} onConnect={onConnect}/>
      </DialogShell>
    )
  }

  if (step === 'status' && connection) {
    return (
      <DialogShell isDesktop={isDesktop} onBack={() => setStep('source')} onClose={onClose} title='Granola'>
        <ConnectedStatusStep
          connection={connection}
          importedNoteCount={importedNoteCount}
          isConnecting={isConnecting}
          isSyncing={isSyncing}
          onDisconnect={onDisconnect}
          onModeChange={onModeChange}
          onReconnect={onReconnect}
          onSync={onSync}
          statusAnnouncement={statusAnnouncement}
        />
      </DialogShell>
    )
  }

  if (step === 'obsidian-upload') {
    return (
      <DialogShell isDesktop={isDesktop} onBack={() => setStep('source')} onClose={onClose} title='Import from Obsidian'>
        <ObsidianUploadStep
          onUpload={(file) => {
            onObsidianImport?.(file)
            setStep('obsidian-progress')
          }}
        />
      </DialogShell>
    )
  }

  if (step === 'obsidian-progress') {
    return (
      <DialogShell isDesktop={isDesktop} onClose={onClose} title='Importing Obsidian vault'>
        <ObsidianProgressStep progress={obsidianImportState?.progress ?? null}/>
        {obsidianImportState?.error ? (
          <div className='mt-4'>
            <p className='text-sm text-error'>{obsidianImportState.error}</p>
            <div className='mt-3 flex justify-end'>
              <Button className='min-h-9' onClick={() => setStep('obsidian-upload')} type='button' variant='ghost'>
                Try again
              </Button>
            </div>
          </div>
        ) : null}
      </DialogShell>
    )
  }

  if (step === 'obsidian-complete' && obsidianImportState?.result) {
    return (
      <DialogShell isDesktop={isDesktop} onClose={onClose} title='Import complete'>
        <ObsidianCompleteStep
          onDone={onClose}
          result={obsidianImportState.result}
          skippedFileCount={obsidianSkippedFiles}
        />
      </DialogShell>
    )
  }

  // Fallback to source picker
  return (
    <DialogShell isDesktop={isDesktop} onClose={onClose} title='Bring notes into Rocketboard'>
      <SourcePickerStep
        granolaConnection={connection}
        granolaNotesCount={importedNoteCount}
        obsidianNotesCount={obsidianNoteCount}
        onSelectGranola={() => setStep(hasGranolaConnection ? 'status' : 'auth-method')}
        onSelectObsidian={() => setStep('obsidian-upload')}
      />
    </DialogShell>
  )
}
