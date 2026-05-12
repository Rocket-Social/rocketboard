import {useCallback, useMemo, useRef, useState} from 'react'

type ActionDirection = 'redo' | 'undo'

type ActionEntry<T> = {
  description: string
  groupId?: string
  onApplied?: (result: T, direction: ActionDirection) => void
  redo: () => Promise<T>
  undo: () => Promise<T>
}

type HistoryState<T> = {
  future: ActionEntry<T>[]
  past: ActionEntry<T>[]
}

const HISTORY_LIMIT = 40

function takeGroupedEntries<T>(entries: ActionEntry<T>[], fromEnd: boolean) {
  if (entries.length === 0) {
    return []
  }

  if (fromEnd) {
    const lastEntry = entries[entries.length - 1]

    if (!lastEntry.groupId) {
      return [lastEntry]
    }

    const batch: ActionEntry<T>[] = []

    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index]

      if (entry.groupId !== lastEntry.groupId) {
        break
      }

      batch.unshift(entry)
    }

    return batch
  }

  const firstEntry = entries[0]

  if (!firstEntry.groupId) {
    return [firstEntry]
  }

  const batch: ActionEntry<T>[] = []

  for (const entry of entries) {
    if (entry.groupId !== firstEntry.groupId) {
      break
    }

    batch.push(entry)
  }

  return batch
}

async function applyActionBatch<T>(
  entries: ActionEntry<T>[],
  direction: ActionDirection,
) {
  const orderedEntries = direction === 'undo' ? [...entries].reverse() : entries

  for (const entry of orderedEntries) {
    const result = await (direction === 'undo' ? entry.undo() : entry.redo())
    entry.onApplied?.(result, direction)
  }
}

export function useActionHistory<T>() {
  const [history, setHistory] = useState<HistoryState<T>>({
    future: [],
    past: [],
  })
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const historyRef = useRef(history)
  const isPendingRef = useRef(isPending)

  historyRef.current = history
  isPendingRef.current = isPending

  const push = useCallback((entry: ActionEntry<T>) => {
    setErrorMessage(null)
    setHistory((current) => {
      const nextPast = [...current.past, entry]

      return {
        future: [],
        past: nextPast.slice(Math.max(0, nextPast.length - HISTORY_LIMIT)),
      }
    })
  }, [])

  const clear = useCallback(() => {
    setErrorMessage(null)
    setHistory({
      future: [],
      past: [],
    })
  }, [])

  const undo = useCallback(async () => {
    if (isPendingRef.current) {
      return
    }

    const batch = takeGroupedEntries(historyRef.current.past, true)

    if (batch.length === 0) {
      return
    }

    setIsPending(true)
    setErrorMessage(null)
    setHistory((current) => ({
      future: [...batch, ...current.future].slice(0, HISTORY_LIMIT),
      past: current.past.slice(0, Math.max(0, current.past.length - batch.length)),
    }))

    try {
      await applyActionBatch(batch, 'undo')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Undo could not be completed.')
      setHistory((current) => {
        const nextPast = [...current.past, ...batch]

        return {
          future: current.future.slice(batch.length),
          past: nextPast.slice(Math.max(0, nextPast.length - HISTORY_LIMIT)),
        }
      })
    } finally {
      setIsPending(false)
    }
  }, [])

  const redo = useCallback(async () => {
    if (isPendingRef.current) {
      return
    }

    const batch = takeGroupedEntries(historyRef.current.future, false)

    if (batch.length === 0) {
      return
    }

    setIsPending(true)
    setErrorMessage(null)
    setHistory((current) => ({
      future: current.future.slice(batch.length),
      past: [...current.past, ...batch].slice(Math.max(0, current.past.length + batch.length - HISTORY_LIMIT)),
    }))

    try {
      await applyActionBatch(batch, 'redo')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Redo could not be completed.')
      setHistory((current) => ({
        future: [...batch, ...current.future].slice(0, HISTORY_LIMIT),
        past: current.past.slice(0, Math.max(0, current.past.length - batch.length)),
      }))
    } finally {
      setIsPending(false)
    }
  }, [])

  return useMemo(() => ({
    canRedo: history.future.length > 0,
    canUndo: history.past.length > 0,
    clear,
    errorMessage,
    isPending,
    lastActionDescription: history.past[history.past.length - 1]?.description ?? null,
    push,
    redo,
    undo,
  }), [clear, errorMessage, history.future.length, history.past, isPending, push, redo, undo])
}
