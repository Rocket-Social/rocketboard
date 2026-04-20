import {useCallback, useEffect, useState} from 'react'

import type {CreateCardInput} from '../../cards/card.types'
import {consumeWorkspaceCommandOpenCardIntent} from '../../search/workspace-command-intent'

type ConfirmFn = (options: {
  title: string
  description?: string
  confirmLabel?: string
  variant?: 'destructive' | 'default'
}) => Promise<boolean>

export type ProjectCardSheetState = {
  isCardSheetOpen: boolean
  selectedCardId: string | null
  cardDefaults: Partial<CreateCardInput> | null
  openCard: (cardId: string) => Promise<boolean>
  openCardComposer: (defaults?: Partial<CreateCardInput>) => Promise<boolean>
  requestCloseCardSheet: () => Promise<boolean>
  closeCardSheet: () => void
  setCardHasUnsavedChanges: (dirty: boolean) => void

  // Exposed for the dialog's onCardCreated + dialog state reset
  setSelectedCardId: (id: string | null) => void
  setCardDefaults: (defaults: Partial<CreateCardInput> | null) => void
  setIsCardSheetOpen: (open: boolean) => void

  // Gate exposed so view-change guards can ask the same question
  confirmDiscardNavigationChanges: () => Promise<boolean>
}

/**
 * Owns the card-sheet open/close lifecycle, keyboard + beforeunload guards,
 * and the unsaved-changes confirmation flow.
 */
export function useProjectCardSheet({
  confirm,
  projectSlug,
  workspaceSlug,
  orgSlug,
  isResolvedProjectReady,
}: {
  confirm: ConfirmFn
  projectSlug: string
  workspaceSlug: string
  orgSlug: string
  isResolvedProjectReady: boolean
}): ProjectCardSheetState {
  const [isCardSheetOpen, setIsCardSheetOpen] = useState(false)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [cardDefaults, setCardDefaults] =
    useState<Partial<CreateCardInput> | null>(null)
  const [cardHasUnsavedChanges, setCardHasUnsavedChangesState] = useState(false)

  const setCardHasUnsavedChanges = useCallback((dirty: boolean) => {
    setCardHasUnsavedChangesState(dirty)
  }, [])

  const confirmDiscardCardChanges = useCallback(async () => {
    if (!cardHasUnsavedChanges) return true
    const confirmed = await confirm({
      title: 'Discard unsaved card changes?',
      confirmLabel: 'Discard',
      variant: 'destructive',
    })
    if (confirmed) setCardHasUnsavedChangesState(false)
    return confirmed
  }, [cardHasUnsavedChanges, confirm])

  const confirmDiscardNavigationChanges = useCallback(async () => {
    if (!cardHasUnsavedChanges) return true
    const confirmed = await confirm({
      title: 'Unsaved card changes',
      description: 'You have unsaved card changes. Leave this view and discard them?',
      confirmLabel: 'Discard',
      variant: 'destructive',
    })
    if (confirmed) setCardHasUnsavedChangesState(false)
    return confirmed
  }, [cardHasUnsavedChanges, confirm])

  const closeCardSheet = useCallback(() => {
    setCardHasUnsavedChangesState(false)
    setIsCardSheetOpen(false)
    setSelectedCardId(null)
    setCardDefaults(null)
  }, [])

  const requestCloseCardSheet = useCallback(async () => {
    if (!(await confirmDiscardCardChanges())) return false
    closeCardSheet()
    return true
  }, [closeCardSheet, confirmDiscardCardChanges])

  const openCard = useCallback(
    async (cardId: string) => {
      if (cardHasUnsavedChanges) {
        const confirmed = await confirm({
          title: 'Discard unsaved card changes?',
          confirmLabel: 'Discard',
          variant: 'destructive',
        })
        if (!confirmed) return false
        setCardHasUnsavedChangesState(false)
      }
      setCardDefaults(null)
      setSelectedCardId(cardId)
      setIsCardSheetOpen(true)
      return true
    },
    [cardHasUnsavedChanges, confirm],
  )

  const openCardComposer = useCallback(
    async (defaults?: Partial<CreateCardInput>) => {
      if (cardHasUnsavedChanges) {
        const confirmed = await confirm({
          title: 'Discard unsaved card changes?',
          confirmLabel: 'Discard',
          variant: 'destructive',
        })
        if (!confirmed) return false
        setCardHasUnsavedChangesState(false)
      }
      setCardDefaults(defaults ?? null)
      setSelectedCardId(null)
      setIsCardSheetOpen(true)
      return true
    },
    [cardHasUnsavedChanges, confirm],
  )

  // Escape closes the card sheet (with unsaved-changes confirm).
  useEffect(() => {
    if (!isCardSheetOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.key !== 'Escape' ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return
      }

      event.preventDefault()
      void requestCloseCardSheet()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isCardSheetOpen, requestCloseCardSheet])

  // beforeunload guard for dirty card state (browser close/reload).
  useEffect(() => {
    if (!cardHasUnsavedChanges) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [cardHasUnsavedChanges])

  // Reset card-sheet state when the active project changes.
  //
  // This effect MUST be declared BEFORE the consume-intent effect below.
  // React runs effects in declaration order, and a cross-project open-card
  // intent from the palette causes BOTH to run on the same navigation:
  // reset must clear old state first, then consume opens the target card.
  // Reversed, the intent would open the card and the reset would immediately
  // close it (silently dropping the user's action).
  useEffect(() => {
    setSelectedCardId(null)
    setCardDefaults(null)
    setCardHasUnsavedChangesState(false)
    setIsCardSheetOpen(false)
  }, [projectSlug])

  // Consume the cross-surface "open card" intent dispatched by the command
  // palette when the user opens a card from a search result in another project.
  useEffect(() => {
    if (!isResolvedProjectReady) return
    const intent = consumeWorkspaceCommandOpenCardIntent({
      orgSlug,
      projectSlug,
      workspaceSlug,
    })
    if (!intent) return
    setCardDefaults(null)
    setSelectedCardId(intent.cardId)
    setIsCardSheetOpen(true)
  }, [isResolvedProjectReady, orgSlug, projectSlug, workspaceSlug])

  return {
    isCardSheetOpen,
    selectedCardId,
    cardDefaults,
    openCard,
    openCardComposer,
    requestCloseCardSheet,
    closeCardSheet,
    setCardHasUnsavedChanges,
    setSelectedCardId,
    setCardDefaults,
    setIsCardSheetOpen,
    confirmDiscardNavigationChanges,
  }
}
