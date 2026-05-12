import {useState} from 'react'

import type {RichTextDocument} from '../rich-text/rich-text'
import {richTextDocumentsEqual} from '../rich-text/rich-text'

type DocumentDraft = {
  contentJson: RichTextDocument
  title: string
}

type HistoryState = {
  future: DocumentDraft[]
  past: DocumentDraft[]
  present: DocumentDraft
}

const HISTORY_LIMIT = 80

function draftsEqual(left: DocumentDraft, right: DocumentDraft) {
  return left.title === right.title && richTextDocumentsEqual(left.contentJson, right.contentJson)
}

export function useDocumentHistory(initialDraft: DocumentDraft) {
  const [history, setHistory] = useState<HistoryState>({
    future: [],
    past: [],
    present: initialDraft,
  })

  const present = history.present

  const canUndo = history.past.length > 0
  const canRedo = history.future.length > 0

  const updateDraft = (nextDraft: DocumentDraft | ((current: DocumentDraft) => DocumentDraft)) => {
    setHistory((current) => {
      const resolvedDraft =
        typeof nextDraft === 'function' ? nextDraft(current.present) : nextDraft

      if (draftsEqual(current.present, resolvedDraft)) {
        return current
      }

      const nextPast = [...current.past, current.present]

      return {
        future: [],
        past: nextPast.slice(Math.max(0, nextPast.length - HISTORY_LIMIT)),
        present: resolvedDraft,
      }
    })
  }

  const resetDraft = (nextDraft: DocumentDraft) => {
    setHistory({
      future: [],
      past: [],
      present: nextDraft,
    })
  }

  const undo = () => {
    setHistory((current) => {
      const previous = current.past[current.past.length - 1]

      if (!previous) {
        return current
      }

      return {
        future: [current.present, ...current.future].slice(0, HISTORY_LIMIT),
        past: current.past.slice(0, -1),
        present: previous,
      }
    })
  }

  const redo = () => {
    setHistory((current) => {
      const [nextDraft, ...restFuture] = current.future

      if (!nextDraft) {
        return current
      }

      const nextPast = [...current.past, current.present]

      return {
        future: restFuture,
        past: nextPast.slice(Math.max(0, nextPast.length - HISTORY_LIMIT)),
        present: nextDraft,
      }
    })
  }

  return {
    canRedo,
    canUndo,
    draft: present,
    redo,
    resetDraft,
    undo,
    updateDraft,
  }
}
