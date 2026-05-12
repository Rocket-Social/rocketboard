import {ChevronRight} from 'lucide-react'
import {useEffect, useState} from 'react'

import {Button} from '../../components/ui/button'
import type {GranolaConnectionMode, GranolaConnectionRecord} from './granola-import.shared'
import type {VaultImportProgress} from './obsidian-import'
import {AuthMethodStep, ApiKeyConnectStep, ConnectedStatusStep} from './NotesImportDialog.granola'
import {ObsidianCompleteStep, ObsidianProgressStep, ObsidianUploadStep} from './NotesImportDialog.obsidian'
import {DialogShell} from './NotesImportDialog.shared'

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

  useEffect(() => {
    if (hasGranolaConnection && step === 'connect') {
      setStep('status')
    }
  }, [hasGranolaConnection, step])

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
