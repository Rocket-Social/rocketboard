import {Plus, Trash2} from 'lucide-react'
import {useEffect, useMemo, useState} from 'react'

import {Button} from '../../../components/ui/button'
import {ConfirmDialog} from '../../../components/ui/confirm-dialog'
import {Input} from '../../../components/ui/input'
import {useConfirmDialog} from '../../../hooks/useConfirmDialog'
import {RichTextEditor} from '../../rich-text/RichTextEditor'
import {normalizeRichTextDocument, stringifyRichTextDocument} from '../../rich-text/rich-text'
import type {ReleaseNoteSection} from '../plan.types'

type SaveState = 'error' | 'idle' | 'saved' | 'saving'

type ReleaseNotesEditorProps = {
  onSave: (sections: ReleaseNoteSection[]) => Promise<void>
  sections: ReleaseNoteSection[]
}

const suggestedSectionLabels = ['General', 'Design', 'Art', 'Tech']

function normalizeSections(sections: ReleaseNoteSection[]) {
  return sections.map((section) => ({
    content: normalizeRichTextDocument(section.content),
    label: section.label.trim(),
  }))
}

function serializeSections(sections: ReleaseNoteSection[]) {
  return sections
    .map((section) => `${section.label.trim()}::${stringifyRichTextDocument(section.content)}`)
    .join('||')
}

function validateSections(sections: ReleaseNoteSection[]) {
  if (sections.length > 10) {
    return 'A release can include at most 10 note sections.'
  }

  const labels = new Set<string>()
  for (const section of sections) {
    const label = section.label.trim()
    if (!label) {
      return 'Section labels cannot be blank.'
    }
    if (labels.has(label.toLowerCase())) {
      return 'Section labels must be unique.'
    }
    labels.add(label.toLowerCase())
  }

  return null
}

function nextSectionLabel(currentSections: ReleaseNoteSection[]) {
  const existing = new Set(currentSections.map((section) => section.label.trim().toLowerCase()))
  const suggested = suggestedSectionLabels.find((label) => !existing.has(label.toLowerCase()))
  if (suggested) {
    return suggested
  }

  let count = currentSections.length + 1
  while (existing.has(`section ${count}`)) {
    count += 1
  }
  return `Section ${count}`
}

export function ReleaseNotesEditor({onSave, sections}: ReleaseNotesEditorProps) {
  const {confirm, confirmDialogProps} = useConfirmDialog()
  const [localSections, setLocalSections] = useState<ReleaseNoteSection[]>(normalizeSections(sections))
  const [activeIndex, setActiveIndex] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [message, setMessage] = useState<string | null>(null)

  const normalizedSections = useMemo(() => normalizeSections(localSections), [localSections])
  const serverSnapshot = useMemo(() => serializeSections(normalizeSections(sections)), [sections])
  const localSnapshot = useMemo(() => serializeSections(normalizedSections), [normalizedSections])

  useEffect(() => {
    if (dirty) return
    setLocalSections(normalizeSections(sections))
    setActiveIndex((current) => Math.min(current, Math.max(sections.length - 1, 0)))
  }, [dirty, sections, serverSnapshot])

  useEffect(() => {
    if (!dirty) return

    const validationError = validateSections(normalizedSections)
    if (validationError) {
      setSaveState('error')
      setMessage(validationError)
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      setSaveState('saving')
      setMessage('Saving...')

      void onSave(normalizedSections)
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
  }, [dirty, localSnapshot, normalizedSections, onSave])

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

  const activeSection = localSections[activeIndex] ?? null

  const handleSectionChange = (index: number, patch: Partial<ReleaseNoteSection>) => {
    setLocalSections((current) => current.map((section, sectionIndex) => (
      sectionIndex === index
        ? {
            ...section,
            ...patch,
            content: patch.content ? normalizeRichTextDocument(patch.content) : section.content,
          }
        : section
    )))
    setDirty(true)
    if (saveState === 'error') {
      setMessage(null)
      setSaveState('idle')
    }
  }

  const handleAddSection = () => {
    if (localSections.length >= 10) {
      setSaveState('error')
      setMessage('A release can include at most 10 note sections.')
      return
    }

    const nextSections = [
      ...localSections,
      {content: normalizeRichTextDocument(null), label: nextSectionLabel(localSections)},
    ]
    setLocalSections(nextSections)
    setActiveIndex(nextSections.length - 1)
    setDirty(true)
    setSaveState('idle')
    setMessage(null)
  }

  const handleDeleteSection = async () => {
    if (!activeSection) return
    if (!await confirm({title: `Delete the "${activeSection.label}" section?`, variant: 'destructive', confirmLabel: 'Delete'})) {
      return
    }

    const nextSections = localSections.filter((_, index) => index !== activeIndex)
    setLocalSections(nextSections)
    setActiveIndex((current) => Math.max(Math.min(current - 1, nextSections.length - 1), 0))
    setDirty(true)
    setSaveState('idle')
    setMessage(null)
  }

  return (
    <div className='rounded-3xl border border-border-subtle bg-surface-base p-4'>
      <div className='flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3'>
        <div>
          <p className='text-sm font-medium text-text-strong'>Change Notes</p>
          <p className='mt-1 text-xs text-text-muted'>Capture department-scoped release notes with rich text and fast autosave.</p>
        </div>
        <div className='flex items-center gap-2'>
          {message ? (
            <span className={`text-xs ${saveState === 'error' ? 'text-error' : 'text-text-muted'}`}>{message}</span>
          ) : null}
          <Button disabled={localSections.length >= 10} onClick={handleAddSection} size='compact' variant='secondary'>
            <Plus className='h-3.5 w-3.5'/>
            Add section
          </Button>
        </div>
      </div>

      {localSections.length === 0 ? (
        <div className='flex flex-col items-center justify-center gap-3 py-10 text-center'>
          <p className='text-sm text-text-medium'>No note sections yet.</p>
          <Button onClick={handleAddSection} variant='secondary'>Add a section</Button>
        </div>
      ) : (
        <div className='mt-4 space-y-4'>
          <div className='flex flex-wrap items-center gap-2'>
            {localSections.map((section, index) => (
              <button
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${index === activeIndex ? 'bg-primary text-white' : 'bg-canvas-accent text-text-medium hover:text-text-strong'}`}
                key={`${section.label}-${index}`}
                onClick={() => setActiveIndex(index)}
                type='button'
              >
                {section.label || 'Untitled'}
              </button>
            ))}
          </div>

          {activeSection ? (
            <div className='space-y-3'>
              <div className='flex flex-wrap items-center gap-3'>
                <label className='min-w-[14rem] flex-1 space-y-1'>
                  <span className='text-xs font-medium uppercase tracking-[0.2em] text-text-muted'>Section label</span>
                  <Input
                    className='h-9 rounded-2xl'
                    onChange={(event) => handleSectionChange(activeIndex, {label: event.target.value})}
                    value={activeSection.label}
                  />
                </label>

                <Button onClick={handleDeleteSection} size='compact' variant='ghost'>
                  <Trash2 className='h-3.5 w-3.5'/>
                  Delete section
                </Button>
              </div>

              <label className='space-y-1'>
                <span className='text-xs font-medium uppercase tracking-[0.2em] text-text-muted'>Notes</span>
                <RichTextEditor
                  minHeightClassName='min-h-[16rem]'
                  onChange={(value) => handleSectionChange(activeIndex, {content: value})}
                  placeholder='Describe what changed for this release.'
                  value={activeSection.content}
                />
              </label>
            </div>
          ) : null}
        </div>
      )}
      {confirmDialogProps ? <ConfirmDialog {...confirmDialogProps}/> : null}
    </div>
  )
}
