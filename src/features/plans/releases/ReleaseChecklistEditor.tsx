import {ArrowDown, ArrowUp, ListChecks, Plus, Trash2} from 'lucide-react'
import {useQuery} from '@tanstack/react-query'
import {useEffect, useMemo, useState} from 'react'

import {Button} from '../../../components/ui/button'
import {Input} from '../../../components/ui/input'
import {sessionQueryOptions} from '../../auth/data'
import type {ReleaseChecklistItem} from '../plan.types'

type SaveState = 'error' | 'idle' | 'saved' | 'saving'

type ReleaseChecklistEditorProps = {
  items: ReleaseChecklistItem[]
  onSave: (items: ReleaseChecklistItem[]) => Promise<void>
}

function generateChecklistItemId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `checklist-${Math.random().toString(16).slice(2)}`
}

function serializeChecklist(items: ReleaseChecklistItem[]) {
  return items
    .map((item) => [
      item.id,
      item.label.trim(),
      item.checked ? '1' : '0',
      item.checkedByUserId ?? '',
      item.checkedAt ?? '',
    ].join(':'))
    .join('||')
}

function validateChecklist(items: ReleaseChecklistItem[]) {
  if (items.length > 50) {
    return 'A release checklist can include at most 50 items.'
  }

  for (const item of items) {
    if (!item.label.trim()) {
      return 'Checklist items cannot be blank.'
    }
  }

  return null
}

export function ReleaseChecklistEditor({items, onSave}: ReleaseChecklistEditorProps) {
  const sessionQuery = useQuery(sessionQueryOptions())
  const [localItems, setLocalItems] = useState<ReleaseChecklistItem[]>(items)
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [message, setMessage] = useState<string | null>(null)

  const serializedItems = useMemo(() => serializeChecklist(localItems), [localItems])
  const serverSnapshot = useMemo(() => serializeChecklist(items), [items])

  useEffect(() => {
    if (dirty) return
    setLocalItems(items)
  }, [dirty, items, serverSnapshot])

  useEffect(() => {
    if (!dirty) return

    const validationError = validateChecklist(localItems)
    if (validationError) {
      setSaveState('error')
      setMessage(validationError)
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      setSaveState('saving')
      setMessage('Saving...')

      void onSave(localItems)
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
    }, 400)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [dirty, localItems, onSave, serializedItems])

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

  const currentUser = sessionQuery.data?.status === 'authenticated' ? sessionQuery.data.user : null

  const updateItems = (nextItems: ReleaseChecklistItem[]) => {
    setLocalItems(nextItems)
    setDirty(true)
    if (saveState === 'error') {
      setMessage(null)
      setSaveState('idle')
    }
  }

  const handleAddItem = () => {
    if (localItems.length >= 50) {
      setSaveState('error')
      setMessage('A release checklist can include at most 50 items.')
      return
    }

    updateItems([
      ...localItems,
      {
        checked: false,
        checkedAt: null,
        checkedByName: null,
        checkedByUserId: null,
        id: generateChecklistItemId(),
        label: `Checklist item ${localItems.length + 1}`,
      },
    ])
  }

  const handleToggle = (itemId: string) => {
    updateItems(localItems.map((item) => {
      if (item.id !== itemId) return item
      const nextChecked = !item.checked
      return {
        ...item,
        checked: nextChecked,
        checkedAt: nextChecked ? new Date().toISOString() : null,
        checkedByName: nextChecked ? currentUser?.name ?? item.checkedByName : null,
        checkedByUserId: nextChecked ? currentUser?.id ?? item.checkedByUserId : null,
      }
    }))
  }

  const handleMove = (itemId: string, direction: -1 | 1) => {
    const index = localItems.findIndex((item) => item.id === itemId)
    const targetIndex = index + direction
    if (index === -1 || targetIndex < 0 || targetIndex >= localItems.length) {
      return
    }

    const nextItems = [...localItems]
    const [item] = nextItems.splice(index, 1)
    nextItems.splice(targetIndex, 0, item)
    updateItems(nextItems)
  }

  const completedCount = localItems.filter((item) => item.checked).length

  return (
    <div className='rounded-3xl border border-border-subtle bg-surface-base p-4'>
      <div className='flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3'>
        <div>
          <p className='text-sm font-medium text-text-strong'>Readiness Checklist</p>
          <p className='mt-1 text-xs text-text-muted'>Keep launch gates lightweight and visible inside the release.</p>
        </div>
        <div className='flex items-center gap-2'>
          <span className='rounded-full bg-canvas-accent px-2.5 py-1 font-mono text-[11px] text-text-muted'>{completedCount}/{localItems.length || 0}</span>
          {message ? (
            <span className={`text-xs ${saveState === 'error' ? 'text-error' : 'text-text-muted'}`}>{message}</span>
          ) : null}
          <Button disabled={localItems.length >= 50} onClick={handleAddItem} size='compact' variant='secondary'>
            <Plus className='h-3.5 w-3.5'/>
            Add item
          </Button>
        </div>
      </div>

      {localItems.length === 0 ? (
        <div className='flex flex-col items-center justify-center gap-3 py-10 text-center'>
          <div className='rounded-full bg-primary/10 p-3 text-primary'>
            <ListChecks className='h-5 w-5'/>
          </div>
          <p className='text-sm text-text-medium'>No checklist items yet.</p>
          <Button onClick={handleAddItem} variant='secondary'>Add checklist item</Button>
        </div>
      ) : (
        <div className='mt-4 space-y-2'>
          {localItems.map((item, index) => (
            <div className='rounded-2xl border border-border-subtle bg-surface-elevated px-3 py-3' key={item.id}>
              <div className='flex flex-wrap items-start gap-3'>
                <button
                  aria-pressed={item.checked}
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition-colors ${item.checked ? 'border-success/30 bg-success/10 text-success' : 'border-border-subtle bg-surface-base text-text-muted'}`}
                  onClick={() => handleToggle(item.id)}
                  type='button'
                >
                  {item.checked ? '✓' : ''}
                </button>

                <div className='min-w-[14rem] flex-1 space-y-2'>
                  <Input
                    className='h-9 rounded-2xl bg-surface-base'
                    onChange={(event) => updateItems(localItems.map((entry) => entry.id === item.id ? {...entry, label: event.target.value} : entry))}
                    value={item.label}
                  />
                  {item.checkedByName ? (
                    <p className='text-xs text-text-muted'>
                      Checked by {item.checkedByName}
                    </p>
                  ) : null}
                </div>

                <div className='flex items-center gap-1'>
                  <Button
                    disabled={index === 0}
                    onClick={() => handleMove(item.id, -1)}
                    size='compact'
                    variant='ghost'
                  >
                    <ArrowUp className='h-3.5 w-3.5'/>
                  </Button>
                  <Button
                    disabled={index === localItems.length - 1}
                    onClick={() => handleMove(item.id, 1)}
                    size='compact'
                    variant='ghost'
                  >
                    <ArrowDown className='h-3.5 w-3.5'/>
                  </Button>
                  <Button
                    onClick={() => updateItems(localItems.filter((entry) => entry.id !== item.id))}
                    size='compact'
                    variant='ghost'
                  >
                    <Trash2 className='h-3.5 w-3.5'/>
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
