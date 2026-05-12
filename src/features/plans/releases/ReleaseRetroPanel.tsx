import {useEffect, useMemo, useState} from 'react'

import {Input} from '../../../components/ui/input'
import {Textarea} from '../../../components/ui/textarea'

type SaveState = 'error' | 'idle' | 'saved' | 'saving'

type ReleaseRetroPanelProps = {
  abVariations: string | null
  onSave: (input: {
    abVariations: string | null
    releaseNotes: string | null
    retroNotes: string | null
    retroUrl: string | null
  }) => Promise<void>
  releaseNotes: string | null
  retroNotes: string | null
  retroUrl: string | null
}

export function ReleaseRetroPanel({
  abVariations,
  onSave,
  releaseNotes,
  retroNotes,
  retroUrl,
}: ReleaseRetroPanelProps) {
  const [localState, setLocalState] = useState({
    abVariations: abVariations ?? '',
    releaseNotes: releaseNotes ?? '',
    retroNotes: retroNotes ?? '',
    retroUrl: retroUrl ?? '',
  })
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [message, setMessage] = useState<string | null>(null)

  const serverSnapshot = useMemo(() => JSON.stringify({
    abVariations: abVariations ?? '',
    releaseNotes: releaseNotes ?? '',
    retroNotes: retroNotes ?? '',
    retroUrl: retroUrl ?? '',
  }), [abVariations, releaseNotes, retroNotes, retroUrl])

  const localSnapshot = useMemo(() => JSON.stringify(localState), [localState])

  useEffect(() => {
    if (dirty) return
    setLocalState({
      abVariations: abVariations ?? '',
      releaseNotes: releaseNotes ?? '',
      retroNotes: retroNotes ?? '',
      retroUrl: retroUrl ?? '',
    })
  }, [abVariations, dirty, releaseNotes, retroNotes, retroUrl, serverSnapshot])

  useEffect(() => {
    if (!dirty) return

    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      setSaveState('saving')
      setMessage('Saving...')

      void onSave({
        abVariations: localState.abVariations.trim() ? localState.abVariations.trim() : null,
        releaseNotes: localState.releaseNotes.trim() ? localState.releaseNotes.trim() : null,
        retroNotes: localState.retroNotes.trim() ? localState.retroNotes.trim() : null,
        retroUrl: localState.retroUrl.trim() ? localState.retroUrl.trim() : null,
      })
        .then(() => {
          if (cancelled) return
          setDirty(false)
          setSaveState('saved')
          setMessage('Saved')
        })
        .catch(() => {
          if (cancelled) return
          setSaveState('error')
          setMessage('Save failed')
        })
    }, 500)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [dirty, localSnapshot, localState, onSave])

  useEffect(() => {
    if (saveState !== 'saved') return
    const timeoutId = window.setTimeout(() => {
      setSaveState('idle')
      setMessage(null)
    }, 2000)
    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [saveState])

  const updateField = (field: keyof typeof localState, value: string) => {
    setLocalState((current) => ({...current, [field]: value}))
    setDirty(true)
    if (saveState === 'error') {
      setSaveState('idle')
      setMessage(null)
    }
  }

  return (
    <div className='rounded-3xl border border-border-subtle bg-surface-base p-4'>
      <div className='flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3'>
        <div>
          <p className='text-sm font-medium text-text-strong'>Retro & Ops Notes</p>
          <p className='mt-1 text-xs text-text-muted'>Capture external notes, experiments, and the release retrospective in one place.</p>
        </div>
        {message ? (
          <span className={`text-xs ${saveState === 'error' ? 'text-error' : 'text-text-muted'}`}>{message}</span>
        ) : null}
      </div>

      <div className='mt-4 grid gap-4 lg:grid-cols-2'>
        <label className='space-y-1 lg:col-span-2'>
          <span className='text-xs font-medium uppercase tracking-[0.2em] text-text-muted'>Public release notes</span>
          <Textarea
            className='min-h-[120px] bg-surface-elevated'
            onChange={(event) => updateField('releaseNotes', event.target.value)}
            placeholder='Summarize the customer-facing release notes.'
            value={localState.releaseNotes}
          />
        </label>

        <label className='space-y-1'>
          <span className='text-xs font-medium uppercase tracking-[0.2em] text-text-muted'>A/B variations</span>
          <Textarea
            className='min-h-[120px] bg-surface-elevated'
            onChange={(event) => updateField('abVariations', event.target.value)}
            placeholder='Document experiment names or rollout variants.'
            value={localState.abVariations}
          />
        </label>

        <label className='space-y-1'>
          <span className='text-xs font-medium uppercase tracking-[0.2em] text-text-muted'>Retro notes</span>
          <Textarea
            className='min-h-[120px] bg-surface-elevated'
            onChange={(event) => updateField('retroNotes', event.target.value)}
            placeholder='What worked, what broke, and what to improve.'
            value={localState.retroNotes}
          />
        </label>

        <label className='space-y-1 lg:col-span-2'>
          <span className='text-xs font-medium uppercase tracking-[0.2em] text-text-muted'>Retro URL</span>
          <Input
            className='h-10 rounded-2xl bg-surface-elevated'
            onChange={(event) => updateField('retroUrl', event.target.value)}
            placeholder='https://...'
            value={localState.retroUrl}
          />
        </label>
      </div>
    </div>
  )
}
