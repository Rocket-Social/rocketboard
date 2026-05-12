import {CheckCircle2, Upload} from 'lucide-react'
import {useCallback, useRef, useState} from 'react'

import {Button} from '../../components/ui/button'
import {cn} from '../../lib/cn'
import type {VaultImportProgress} from './obsidian-import'

export function ObsidianUploadStep({
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

export function ObsidianProgressStep({
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

export function ObsidianCompleteStep({
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
