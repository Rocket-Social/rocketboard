import {useQuery, useQueryClient} from '@tanstack/react-query'
import {CalendarDays, Check, Clock, MessageSquare, Paperclip, Send, Upload, X} from 'lucide-react'
import {useEffect, useEffectEvent, useRef, useState} from 'react'

import {CardActivityLog} from './CardActivityLog'

import {Badge} from '../../components/ui/badge'
import {Button} from '../../components/ui/button'
import {ConfirmDialog} from '../../components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import {Input} from '../../components/ui/input'
import {Textarea} from '../../components/ui/textarea'
import {UserAvatar} from '../../components/ui/user-avatar'
import {useConfirmDialog} from '../../hooks/useConfirmDialog'
import {isEditableEventTarget} from '../../lib/dom'
import type {SessionUser} from '../auth/data'
import {useSetCardCustomFieldValueMutation} from '../fields/field.queries'
import type {CustomFieldDefinition} from '../fields/field.types'
import {RichTextEditor} from '../rich-text/RichTextEditor'
import {resolveBuiltinFieldLabel, type ProjectBuiltinFieldLabels} from '../projects/builtin-fields'
import type {ProjectGroupRecord} from '../projects/project-group.types'
import {
  cloneRichTextDocument,
  richTextDocumentsEqual,
  type RichTextDocument,
} from '../rich-text/rich-text'
import {prepareContentForSave} from '../rich-text/prepare-content'
import {normalizeCardDateString} from './card-date'
import {getDefaultStatusOption} from './card-view-mappers'
import {formatEffortValue, parseEffortInput} from './effort'
import {CARD_NOT_FOUND} from './card.repository'
import {
  runSetCardAssigneeMutation,
  runUpdateCardMutation,
  useAddCardCommentMutation,
  useCardDetailQuery,
  useCreateCardMutation,
  useSetCardAssigneeMutation,
  useUpdateCardMutation,
  useUploadCardAttachmentMutation,
} from './card.queries'
import type {CardDetail, CardRecord, CreateCardInput, ProjectPriorityOption, ProjectStatusOption, UpdateCardInput} from './card.types'
import {workspaceInitiativesQueryOptions} from '../initiatives/initiative.queries'
import type {ProjectMember} from '../access/access.types'
import type {ProjectSprintRecord} from '../sprints/sprint.types'
import {CardGitHubSection} from '../github/components/CardGitHubSection'
import {useActionHistory} from './useActionHistory'

type CardSheetDetailLayout = 'default' | 'sprint' | 'table'

type CardSheetProps = {
  cardId: string | null
  canEditProject?: boolean
  currentUser: SessionUser
  defaults?: Partial<CreateCardInput> | null
  detailLayout?: CardSheetDetailLayout
  isOpen: boolean
  onCardCreated: (cardId: string) => void
  onClose: () => void
  onDirtyStateChange?: (isDirty: boolean) => void
  onSetCardGroup?: (cardId: string, groupId: string | null) => void
  onSetCardSprint?: (cardId: string, sprintId: string | null) => void
  customFields: CustomFieldDefinition[]
  builtinFieldLabels?: ProjectBuiltinFieldLabels
  priorityOptions: ProjectPriorityOption[]
  projectGroups?: ProjectGroupRecord[]
  projectMembers?: ProjectMember[]
  projectId: string
  projectName: string
  projectSprints?: ProjectSprintRecord[]
  statusOptions: ProjectStatusOption[]
  workspaceId: string
}

type CardFormState = {
  bodyJson: RichTextDocument
  completedAt: string
  dueAt: string
  effort: string
  initiativeId: string | null
  priorityOptionId: string | null
  startAt: string
  statusOptionId: string | null
  tagsText: string
  title: string
}


function formatCommentTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value))
}

function formatAttachmentSize(sizeBytes: number) {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (sizeBytes >= 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`
  }

  return `${sizeBytes} B`
}

function getInitials(name: string | null | undefined, fallback: string) {
  const initials = name
    ?.split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return initials || fallback
}

function buildCustomFieldDraftValue(field: CustomFieldDefinition, detail: CardDetail | undefined) {
  const value = detail?.customFieldValues[field.key]

  if (!value) {
    return ''
  }

  switch (field.fieldType) {
    case 'date':
      return value.dateValue ?? ''
    case 'number':
      return value.numberValue != null ? String(value.numberValue) : ''
    case 'single_select':
      return value.optionId ?? ''
    case 'text':
      return value.textValue ?? ''
  }
}

function buildCustomFieldDrafts(detail: CardDetail | undefined, customFields: CustomFieldDefinition[]) {
  return Object.fromEntries(
    customFields.map((field) => [field.key, buildCustomFieldDraftValue(field, detail)]),
  )
}

function buildInitialState(defaults?: Partial<CreateCardInput> | null, defaultStatusOptionId?: string | null): CardFormState {
  return {
    bodyJson: cloneRichTextDocument(defaults?.bodyJson, defaults?.bodyMd ?? ''),
    completedAt: '',
    dueAt: defaults?.dueAt ?? '',
    effort: formatEffortValue(defaults?.effort ?? null),
    initiativeId: defaults?.initiativeId ?? null,
    priorityOptionId: defaults?.priorityOptionId ?? null,
    startAt: defaults?.startAt ?? '',
    statusOptionId: defaults?.statusOptionId ?? defaultStatusOptionId ?? null,
    tagsText: defaults?.tags?.join(', ') ?? '',
    title: defaults?.title ?? '',
  }
}

function buildFormStateFromCard(card: Pick<CardRecord, 'bodyJson' | 'bodyMd' | 'completedAt' | 'dueAt' | 'effort' | 'initiativeId' | 'priorityOptionId' | 'startAt' | 'statusOptionId' | 'tags' | 'title'>): CardFormState {
  return {
    bodyJson: cloneRichTextDocument(card.bodyJson, card.bodyMd),
    completedAt: normalizeCardDateString(card.completedAt) ?? '',
    dueAt: card.dueAt ?? '',
    effort: formatEffortValue(card.effort),
    initiativeId: card.initiativeId,
    priorityOptionId: card.priorityOptionId,
    startAt: card.startAt ?? '',
    statusOptionId: card.statusOptionId,
    tagsText: card.tags.join(', '),
    title: card.title,
  }
}

function buildFormStateFromCardDetail(detail: CardDetail) {
  return buildFormStateFromCard(detail)
}

function formStatesEqual(left: CardFormState, right: CardFormState) {
  return (
    richTextDocumentsEqual(left.bodyJson, right.bodyJson)
    && left.completedAt === right.completedAt
    && left.dueAt === right.dueAt
    && left.effort === right.effort
    && left.initiativeId === right.initiativeId
    && left.priorityOptionId === right.priorityOptionId
    && left.startAt === right.startAt
    && left.statusOptionId === right.statusOptionId
    && left.tagsText === right.tagsText
    && left.title === right.title
  )
}

function parseTags(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function toUpdateInput(cardId: string, state: CardFormState): UpdateCardInput {
  const parsedEffort = parseEffortInput(state.effort)

  return {
    bodyJson: cloneRichTextDocument(state.bodyJson),
    bodyMd: prepareContentForSave(state.bodyJson).contentMd,
    completedAt: state.completedAt || null,
    dueAt: state.dueAt || null,
    effort: parsedEffort === undefined ? null : parsedEffort,
    id: cardId,
    initiativeId: state.initiativeId,
    priorityOptionId: state.priorityOptionId,
    startAt: state.startAt || null,
    statusOptionId: state.statusOptionId,
    tags: parseTags(state.tagsText),
    title: state.title,
  }
}

function updateInputsEqual(left: UpdateCardInput, right: UpdateCardInput) {
  return (
    richTextDocumentsEqual(left.bodyJson, right.bodyJson)
    && left.completedAt === right.completedAt
    && left.dueAt === right.dueAt
    && left.effort === right.effort
    && left.initiativeId === right.initiativeId
    && left.priorityOptionId === right.priorityOptionId
    && left.startAt === right.startAt
    && left.statusOptionId === right.statusOptionId
    && left.title === right.title
    && left.tags.length === right.tags.length
    && left.tags.every((tag, index) => tag === right.tags[index])
  )
}

export function CardSheet({
  cardId,
  builtinFieldLabels,
  canEditProject = true,
  priorityOptions,
  currentUser,
  customFields,
  defaults,
  detailLayout = 'default',
  isOpen,
  onCardCreated,
  onClose,
  onDirtyStateChange,
  onSetCardGroup,
  onSetCardSprint,
  projectGroups = [],
  projectMembers = [],
  projectId,
  projectName,
  projectSprints = [],
  statusOptions,
  workspaceId,
}: CardSheetProps) {
  const isEditing = Boolean(cardId)
  const detailQuery = useCardDetailQuery(cardId)
  const workspaceInitiativesQuery = useQuery(workspaceInitiativesQueryOptions(workspaceId))
  const queryClient = useQueryClient()
  const createCardMutation = useCreateCardMutation()
  const setCardAssigneeMutation = useSetCardAssigneeMutation()
  const updateCardMutation = useUpdateCardMutation()
  const addCommentMutation = useAddCardCommentMutation()
  const setCardFieldValueMutation = useSetCardCustomFieldValueMutation()
  const uploadAttachmentMutation = useUploadCardAttachmentMutation()
  const {
    canRedo,
    canUndo,
    clear: clearHistory,
    errorMessage: historyErrorMessage,
    isPending: isHistoryPending,
    lastActionDescription,
    push: pushHistoryEntry,
    redo,
    undo,
  } = useActionHistory<CardRecord>()
  const {confirm, confirmDialogProps} = useConfirmDialog()
  const [sheetTab, setSheetTab] = useState<'details' | 'history'>('details')
  const [commentText, setCommentText] = useState('')
  const [customFieldDrafts, setCustomFieldDrafts] = useState<Record<string, string>>({})
  const defaultStatusOptionId = getDefaultStatusOption(statusOptions)?.id ?? null
  const [formState, setFormState] = useState<CardFormState>(() => buildInitialState(defaults, defaultStatusOptionId))
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [uploadInputKey, setUploadInputKey] = useState(0)
  const formStateRef = useRef(formState)
  const hydratedCardIdRef = useRef<string | null>(null)
  const lastSyncedFormStateRef = useRef<CardFormState | null>(null)
  const detail = detailQuery.data
  const availableInitiatives = (workspaceInitiativesQuery.data ?? []).filter(
    (i) => i.status === 'planned' || i.status === 'active',
  )
  const availableSprints = projectSprints.filter(
    (s) => s.status === 'planned' || s.status === 'active',
  )
  formStateRef.current = formState

  useEffect(() => {
    if (!isOpen) {
      hydratedCardIdRef.current = null
      lastSyncedFormStateRef.current = null
      clearHistory()
      setCustomFieldDrafts({})
      setSheetTab('details')
      setSaveStatus('idle')
      return
    }

    if (!cardId) {
      const nextState = buildInitialState(defaults, defaultStatusOptionId)
      setFormState(nextState)
      setCommentText('')
      setCustomFieldDrafts({})
      hydratedCardIdRef.current = null
      lastSyncedFormStateRef.current = nextState
      clearHistory()
      setSaveStatus('idle')
      return
    }

    if (detailQuery.data && hydratedCardIdRef.current !== detailQuery.data.id) {
      const nextState = buildFormStateFromCardDetail(detailQuery.data)
      setFormState(nextState)
      setCommentText('')
      setCustomFieldDrafts(buildCustomFieldDrafts(detailQuery.data, customFields))
      hydratedCardIdRef.current = detailQuery.data.id
      lastSyncedFormStateRef.current = nextState
      clearHistory()
      setSaveStatus('idle')
    }
  }, [cardId, clearHistory, customFields, defaults, detailQuery.data, isOpen])

  useEffect(() => {
    if (!isEditing || !detail || hydratedCardIdRef.current !== detail.id) {
      return
    }

    const nextState = buildFormStateFromCardDetail(detail)
    const lastSyncedState = lastSyncedFormStateRef.current
    const detailChanged = !lastSyncedState || !formStatesEqual(nextState, lastSyncedState)
    const hasLocalEditsSinceLastSync = lastSyncedState ? !formStatesEqual(formState, lastSyncedState) : false

    if (detailChanged && !hasLocalEditsSinceLastSync && !formStatesEqual(formState, nextState)) {
      setFormState(nextState)
    }

    lastSyncedFormStateRef.current = nextState
  }, [detail, formState, isEditing])

  useEffect(() => {
    if (!isEditing || !detail) {
      return
    }

    setCustomFieldDrafts(buildCustomFieldDrafts(detail, customFields))
  }, [customFields, detail, isEditing])

  useEffect(() => {
    if (!isOpen || !isEditing) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const hasModifier = event.metaKey || event.ctrlKey

      if (!hasModifier || event.altKey || isEditableEventTarget(event.target)) {
        return
      }

      const normalizedKey = event.key.toLowerCase()

      if (normalizedKey === 'z' && event.shiftKey) {
        if (!canRedo || isHistoryPending) {
          return
        }

        event.preventDefault()
        void redo()
        return
      }

      if (normalizedKey === 'z') {
        if (!canUndo || isHistoryPending) {
          return
        }

        event.preventDefault()
        void undo()
        return
      }

      if (normalizedKey === 'y') {
        if (!canRedo || isHistoryPending) {
          return
        }

        event.preventDefault()
        void redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canRedo, canUndo, isEditing, isHistoryPending, isOpen, redo, undo])

  if (!isOpen) {
    return null
  }

  const mutationError =
    createCardMutation.error
    || setCardAssigneeMutation.error
    || updateCardMutation.error
    || addCommentMutation.error
    || setCardFieldValueMutation.error
    || uploadAttachmentMutation.error
    || detailQuery.error
  const isBusy =
    createCardMutation.isPending
    || setCardAssigneeMutation.isPending
    || updateCardMutation.isPending
    || addCommentMutation.isPending
    || (isEditing && detailQuery.isPending)
  const baselineFormState = isEditing
    ? detail
      ? buildFormStateFromCardDetail(detail)
      : null
    : buildInitialState(defaults, defaultStatusOptionId)
  const sheetDetailLayout = isEditing ? detailLayout : 'default'
  const isSprintDetailLayout = sheetDetailLayout === 'sprint'
  const isTableDetailLayout = sheetDetailLayout === 'table'
  const isViewScopedDetailLayout = isSprintDetailLayout || isTableDetailLayout
  const hasUnsavedFormChanges = baselineFormState
    ? !formStatesEqual(formState, baselineFormState)
    : false
  const hasUnsavedChanges = hasUnsavedFormChanges || commentText.trim().length > 0
  const parsedEffort = parseEffortInput(formState.effort)
  const isSavePending = updateCardMutation.isPending || setCardAssigneeMutation.isPending
  const hasInvalidAutosaveDraft = isEditing && (!formState.title.trim() || parsedEffort === undefined)
  const saveDisabled = !canEditProject || !formState.title.trim() || isBusy || isHistoryPending
    || parsedEffort === undefined

  useEffect(() => {
    onDirtyStateChange?.(isOpen ? hasUnsavedChanges : false)
  }, [hasUnsavedChanges, isOpen, onDirtyStateChange])

  useEffect(() => {
    return () => {
      onDirtyStateChange?.(false)
    }
  }, [onDirtyStateChange])

  const persistCurrentChanges = useEffectEvent((options?: {onNoop?: () => void; onSuccess?: () => void}) => {
    if (!canEditProject || !cardId || !detail) {
      options?.onNoop?.()
      return false
    }

    if (parsedEffort === undefined || !formState.title.trim()) {
      return false
    }

    const requestedState: CardFormState = {
      ...formState,
      bodyJson: cloneRichTextDocument(formState.bodyJson),
    }
    const previousInput = toUpdateInput(cardId, buildFormStateFromCardDetail(detail))
    const nextInput = toUpdateInput(cardId, requestedState)

    if (updateInputsEqual(previousInput, nextInput)) {
      options?.onNoop?.()
      return false
    }

    setSaveStatus('saving')
    updateCardMutation.mutate(nextInput, {
      onError: () => {
        setSaveStatus('error')
      },
      onSuccess: (card) => {
        const nextState = buildFormStateFromCard(card)
        lastSyncedFormStateRef.current = nextState
        if (formStatesEqual(formStateRef.current, requestedState)) {
          setFormState(nextState)
        }
        setSaveStatus('saved')
        pushHistoryEntry({
          description: `Updated ${card.title}`,
          onApplied: (appliedCard) => {
            const appliedState = buildFormStateFromCard(appliedCard)
            setFormState(appliedState)
            lastSyncedFormStateRef.current = appliedState
          },
          redo: () => runUpdateCardMutation(queryClient, nextInput),
          undo: () => runUpdateCardMutation(queryClient, previousInput),
        })
        options?.onSuccess?.()
      },
    })

    return true
  })

  useEffect(() => {
    if (!canEditProject || !isEditing) {
      return
    }

    if (!hasUnsavedFormChanges) {
      if (saveStatus === 'saved') {
        const timeout = window.setTimeout(() => setSaveStatus('idle'), 1400)
        return () => window.clearTimeout(timeout)
      }

      return
    }

    if (hasInvalidAutosaveDraft || isSavePending || isHistoryPending) {
      return
    }

    const timeout = window.setTimeout(() => {
      persistCurrentChanges()
    }, 1200)

    return () => window.clearTimeout(timeout)
  }, [
    formState,
    hasInvalidAutosaveDraft,
    hasUnsavedFormChanges,
    isEditing,
    isHistoryPending,
    isSavePending,
    saveStatus,
  ])

  const requestClose = async () => {
    if (!isEditing) {
      if (hasUnsavedChanges && !await confirm({title: 'Discard unsaved card changes?', confirmLabel: 'Discard', variant: 'destructive'})) {
        return
      }

      onClose()
      return
    }

    if (commentText.trim().length > 0 && !await confirm({title: 'Discard the unsent comment?', confirmLabel: 'Discard', variant: 'destructive'})) {
      return
    }

    if (hasUnsavedFormChanges && !hasInvalidAutosaveDraft && !isSavePending && !isHistoryPending) {
      const startedSave = persistCurrentChanges({
        onNoop: onClose,
        onSuccess: onClose,
      })

      if (startedSave) {
        return
      }
    }

    if (hasUnsavedFormChanges && hasInvalidAutosaveDraft && !await confirm({title: 'Discard unsaved card changes?', confirmLabel: 'Discard', variant: 'destructive'})) {
      return
    }

    onClose()
  }

  const handleCreate = () => {
    if (!canEditProject || parsedEffort === undefined) {
      return
    }

    createCardMutation.mutate(
      {
        bodyJson: cloneRichTextDocument(formState.bodyJson),
        bodyMd: prepareContentForSave(formState.bodyJson).contentMd,
        dueAt: formState.dueAt || null,
        effort: parsedEffort,
        initiativeId: formState.initiativeId,
        priorityOptionId: formState.priorityOptionId,
        projectId,
        startAt: formState.startAt || null,
        statusOptionId: formState.statusOptionId,
        tags: parseTags(formState.tagsText),
        title: formState.title,
      },
      {
        onSuccess: (card) => {
          onCardCreated(card.id)
        },
      },
    )
  }

  const handleCommentSubmit = () => {
    if (!canEditProject || !cardId || !commentText.trim()) {
      return
    }

    addCommentMutation.mutate(
      {
        bodyText: commentText,
        cardId,
      },
      {
        onSuccess: () => {
          setCommentText('')
        },
      },
    )
  }

  const errorMessage =
    mutationError instanceof Error
      ? mutationError.message === CARD_NOT_FOUND
        ? 'This card could not be loaded.'
        : mutationError.message
      : null
  const saveStateLabel = !isEditing
    ? null
    : !formState.title.trim()
      ? 'Title required'
      : parsedEffort === undefined
        ? 'Fix effort to sync'
        : saveStatus === 'error'
          ? 'Sync failed'
          : isSavePending || hasUnsavedFormChanges
            ? 'Syncing...'
            : saveStatus === 'saved'
              ? 'Synced'
              : null
  const saveStateTone = !saveStateLabel
    ? ''
    : !formState.title.trim() || parsedEffort === undefined || saveStatus === 'error'
      ? 'border-error/20 bg-error/10 text-error'
      : isSavePending || hasUnsavedFormChanges
        ? 'border-primary/20 bg-primary-soft text-primary'
        : 'border-border-subtle bg-surface-elevated text-text-medium'
  const assigneeOptions = [...projectMembers].sort((left, right) => left.name.localeCompare(right.name))
  const assigneeDisplayName = detail?.assigneeName ?? currentUser.name
  const assigneeInitials = getInitials(assigneeDisplayName, currentUser.initials)
  const assigneeAvatarUrl = detail?.assigneeUserId
    ? (detail.assigneeUserId === currentUser.id
      ? currentUser.avatarUrl ?? null
      : projectMembers.find((member) => member.id === detail.assigneeUserId)?.avatarUrl ?? null)
    : (detail ? null : currentUser.avatarUrl ?? null)
  const initiativeQueryHasLoaded = workspaceInitiativesQuery.data !== undefined
  const initiativeFieldIsLoading = !initiativeQueryHasLoaded && workspaceInitiativesQuery.isPending
  const initiativeFieldHasError = Boolean(workspaceInitiativesQuery.error) && availableInitiatives.length === 0
  const initiativeFieldIsEmpty = !initiativeFieldIsLoading && !initiativeFieldHasError && availableInitiatives.length === 0
  const currentInitiativeUnavailable = Boolean(formState.initiativeId)
    && !availableInitiatives.some((initiative) => initiative.id === formState.initiativeId)
  const initiativeFieldPlaceholder = initiativeFieldIsLoading
    ? 'Loading initiatives...'
    : initiativeFieldHasError
      ? 'Could not load initiatives'
      : initiativeFieldIsEmpty
        ? 'No active initiatives'
        : 'No initiative'
  const initiativeFieldHelperText = initiativeFieldHasError
    ? 'Could not load planning initiatives for this workspace.'
    : initiativeFieldIsEmpty
      ? 'Planning has no active or planned initiatives right now.'
      : null
  const initiativeField = workspaceId ? (
    <div>
      <label className='mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted'>
        Initiative
      </label>
      <select
        aria-label='Initiative'
        className='h-10 w-full rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft disabled:cursor-not-allowed disabled:opacity-60'
        disabled={!canEditProject || initiativeFieldIsLoading || initiativeFieldHasError || initiativeFieldIsEmpty || isBusy}
        onChange={(event) => setFormState((current) => ({...current, initiativeId: event.target.value || null}))}
        value={formState.initiativeId ?? ''}
      >
        <option value=''>{initiativeFieldPlaceholder}</option>
        {currentInitiativeUnavailable ? (
          <option value={formState.initiativeId ?? ''}>Selected initiative unavailable</option>
        ) : null}
        {availableInitiatives.map((initiative) => (
          <option key={initiative.id} value={initiative.id}>
            {initiative.name}
          </option>
        ))}
      </select>
      {initiativeFieldHelperText ? (
        <p className={`mt-2 text-xs ${initiativeFieldHasError ? 'text-error' : 'text-text-muted'}`}>
          {initiativeFieldHelperText}
        </p>
      ) : null}
    </div>
  ) : null

  const handleAssigneeChange = (assigneeUserId: string | null) => {
    if (!canEditProject || !cardId || !detail || isHistoryPending || setCardAssigneeMutation.isPending) {
      return
    }

    if (detail.assigneeUserId === assigneeUserId) {
      return
    }

    const previousAssigneeUserId = detail.assigneeUserId

    setSaveStatus('saving')
    setCardAssigneeMutation.mutate(
      {
        assigneeUserId,
        cardId,
        projectId,
      },
      {
        onError: () => {
          setSaveStatus('error')
        },
        onSuccess: (card) => {
          setSaveStatus('saved')
          pushHistoryEntry({
            description: `Updated ${card.title}`,
            redo: () => runSetCardAssigneeMutation(queryClient, {assigneeUserId, cardId, projectId}),
            undo: () =>
              runSetCardAssigneeMutation(queryClient, {
                assigneeUserId: previousAssigneeUserId ?? null,
                cardId,
                projectId,
              }),
          })
        },
      },
    )
  }

  const commitCustomFieldValue = (field: CustomFieldDefinition, rawValue: string) => {
    if (!canEditProject || !cardId) {
      return
    }

    setCustomFieldDrafts((current) => ({
      ...current,
      [field.key]: rawValue,
    }))

    setCardFieldValueMutation.mutate({
      cardId,
      dateValue: field.fieldType === 'date' ? (rawValue || null) : null,
      fieldDefinitionId: field.id,
      fieldType: field.fieldType,
      numberValue:
        field.fieldType === 'number'
          ? rawValue.trim()
            ? Number(rawValue)
            : null
          : null,
      optionId: field.fieldType === 'single_select' ? (rawValue || null) : null,
      projectId,
      textValue: field.fieldType === 'text' ? (rawValue.trim() || null) : null,
    })
  }

  const handleAttachmentUpload = (file: File | null) => {
    if (!canEditProject || !file || !cardId) {
      return
    }

    uploadAttachmentMutation.mutate(
      {
        cardId,
        file,
        projectId,
      },
      {
        onSuccess: () => {
          setUploadInputKey((current) => current + 1)
        },
      },
    )
  }

  return (
    <>
      <aside className='fixed inset-y-0 right-0 z-[60] flex w-full max-w-2xl flex-col border-l border-border-subtle bg-surface-base shadow-float'>
        <div className='flex items-center justify-between border-b border-border-subtle px-5 py-4'>
          <div>
            <p className='font-mono text-xs uppercase tracking-[0.24em] text-text-muted'>
              {isEditing ? 'Card Detail' : 'New Task'}
            </p>
            <h2 className='mt-1 font-display text-xl font-semibold text-text-strong'>
              {isEditing ? projectName : `Add task to ${projectName}`}
            </h2>
          </div>
          <button
            className='rounded-xl p-2 text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong'
            onClick={requestClose}
            type='button'
          >
            <X className='h-4 w-4'/>
          </button>
        </div>

        {/* Tabs — only show when editing an existing card */}
        {isEditing ? (
          <div className='flex border-b border-border-subtle'>
            <button
              className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium transition-colors ${
                sheetTab === 'details'
                  ? 'border-b-2 border-primary text-text-strong'
                  : 'text-text-muted hover:text-text-medium'
              }`}
              onClick={() => setSheetTab('details')}
              type='button'
            >
              <Paperclip className='h-3.5 w-3.5'/>
              Details
            </button>
            <button
              className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium transition-colors ${
                sheetTab === 'history'
                  ? 'border-b-2 border-primary text-text-strong'
                  : 'text-text-muted hover:text-text-medium'
              }`}
              onClick={() => setSheetTab('history')}
              type='button'
            >
              <Clock className='h-3.5 w-3.5'/>
              History
            </button>
          </div>
        ) : null}

        {sheetTab === 'history' && isEditing ? (
          <div className='flex-1 overflow-y-auto'>
            <CardActivityLog cardId={cardId}/>
          </div>
        ) : (
        <>
        <div className='flex-1 overflow-y-auto p-5'>
          <div className='space-y-5'>
            <div className='rounded-3xl border border-border-subtle bg-surface-elevated p-5 shadow-panel'>
              <div className='grid gap-4'>
                <div>
                  <label className='mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted'>
                    Title
                  </label>
                  <Input
                    disabled={!canEditProject}
                    onChange={(event) => setFormState((current) => ({...current, title: event.target.value}))}
                    placeholder='What needs to happen next?'
                    value={formState.title}
                  />
                </div>

                <div>
                  <label className='mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted'>
                    Description
                  </label>
                  <RichTextEditor
                    editable={canEditProject}
                    minHeightClassName='min-h-[12rem]'
                    onChange={(nextValue) => setFormState((current) => ({...current, bodyJson: nextValue}))}
                    placeholder='Describe the task, context, or expected outcome.'
                    value={formState.bodyJson}
                  />
                </div>

                <div className='grid gap-4 sm:grid-cols-2'>
                  {isViewScopedDetailLayout ? (
                    <>
                      {isSprintDetailLayout ? (
                        <div>
                          <label className='mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted'>
                            Sprint
                          </label>
                          <select
                            className='h-10 w-full rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft disabled:cursor-not-allowed disabled:opacity-60'
                            disabled={!canEditProject || !cardId || !onSetCardSprint}
                            onChange={(event) => {
                              if (cardId && onSetCardSprint) {
                                onSetCardSprint(cardId, event.target.value || null)
                              }
                            }}
                            value={detail?.sprintId ?? ''}
                          >
                            <option value=''>No sprint</option>
                            {availableSprints.map((sprint) => (
                              <option key={sprint.id} value={sprint.id}>
                                {sprint.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}

                      {isTableDetailLayout ? (
                        <div>
                          <label className='mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted'>
                            {resolveBuiltinFieldLabel('group', builtinFieldLabels)}
                          </label>
                          <select
                            className='h-10 w-full rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft disabled:cursor-not-allowed disabled:opacity-60'
                            disabled={!canEditProject || !cardId || !onSetCardGroup}
                            onChange={(event) => {
                              if (cardId && onSetCardGroup) {
                                onSetCardGroup(cardId, event.target.value || null)
                              }
                            }}
                            value={detail?.groupId ?? ''}
                          >
                            <option value=''>No group</option>
                            {projectGroups.map((group) => (
                              <option key={group.id} value={group.id}>
                                {group.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}

                      {initiativeField}

                      <div>
                        <label className='mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted'>
                          {resolveBuiltinFieldLabel('start_date', builtinFieldLabels)}
                        </label>
                        <Input
                          disabled={!canEditProject}
                          onChange={(event) => setFormState((current) => ({...current, startAt: event.target.value}))}
                          type='date'
                          value={formState.startAt}
                        />
                      </div>

                      <div>
                        <label className='mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted'>
                          Complete Date
                        </label>
                        <Input
                          disabled={!canEditProject}
                          onChange={(event) => setFormState((current) => ({...current, completedAt: event.target.value}))}
                          type='date'
                          value={formState.completedAt}
                        />
                      </div>

                      <div className='sm:col-span-2'>
                        <label className='mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted'>
                          {resolveBuiltinFieldLabel('tags', builtinFieldLabels)}
                        </label>
                        <Input
                          disabled={!canEditProject}
                          onChange={(event) => setFormState((current) => ({...current, tagsText: event.target.value}))}
                          placeholder='Strategy, QA, Docs'
                          value={formState.tagsText}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      {availableSprints.length > 0 ? (
                        <div>
                          <label className='mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted'>
                            Sprint
                          </label>
                          <select
                            className='h-10 w-full rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft disabled:cursor-not-allowed disabled:opacity-60'
                            disabled={!canEditProject || !cardId || !onSetCardSprint}
                            onChange={(event) => {
                              if (cardId && onSetCardSprint) {
                                onSetCardSprint(cardId, event.target.value || null)
                              }
                            }}
                            value={detail?.sprintId ?? ''}
                          >
                            <option value=''>No sprint</option>
                            {availableSprints.map((sprint) => (
                              <option key={sprint.id} value={sprint.id}>
                                {sprint.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}

                      {initiativeField}

                      <div>
                        <label className='mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted'>
                          {resolveBuiltinFieldLabel('status', builtinFieldLabels)}
                        </label>
                        <select
                          className='h-10 w-full rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                          disabled={!canEditProject}
                          onChange={(event) =>
                            setFormState((current) => ({...current, statusOptionId: event.target.value || null}))
                          }
                          value={formState.statusOptionId ?? ''}
                        >
                          {statusOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className='mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted'>
                          {resolveBuiltinFieldLabel('priority', builtinFieldLabels)}
                        </label>
                        <select
                          className='h-10 w-full rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                          disabled={!canEditProject}
                          onChange={(event) =>
                            setFormState((current) => ({...current, priorityOptionId: event.target.value || null}))
                          }
                          value={formState.priorityOptionId ?? ''}
                        >
                          <option value=''>—</option>
                          {priorityOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className='mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted'>
                          {resolveBuiltinFieldLabel('effort', builtinFieldLabels)}
                        </label>
                        <Input
                          disabled={!canEditProject}
                          min='0'
                          step='any'
                          onChange={(event) => setFormState((current) => ({...current, effort: event.target.value}))}
                          type='number'
                          value={formState.effort}
                        />
                        {parsedEffort === undefined ? (
                          <p className='mt-2 text-xs text-error'>Effort must be a nonnegative number.</p>
                        ) : null}
                      </div>

                      <div>
                        <label className='mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted'>
                          {resolveBuiltinFieldLabel('due_date', builtinFieldLabels)}
                        </label>
                        <Input
                          disabled={!canEditProject}
                          onChange={(event) => setFormState((current) => ({...current, dueAt: event.target.value}))}
                          type='date'
                          value={formState.dueAt}
                        />
                      </div>

                      <div>
                        <label className='mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted'>
                          {resolveBuiltinFieldLabel('start_date', builtinFieldLabels)}
                        </label>
                        <Input
                          disabled={!canEditProject}
                          onChange={(event) => setFormState((current) => ({...current, startAt: event.target.value}))}
                          type='date'
                          value={formState.startAt}
                        />
                      </div>

                      <div>
                        <label className='mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted'>
                          Complete Date
                        </label>
                        <Input
                          disabled={!canEditProject}
                          onChange={(event) => setFormState((current) => ({...current, completedAt: event.target.value}))}
                          type='date'
                          value={formState.completedAt}
                        />
                      </div>

                      <div className='sm:col-span-2'>
                        <label className='mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted'>
                          {resolveBuiltinFieldLabel('tags', builtinFieldLabels)}
                        </label>
                        <Input
                          disabled={!canEditProject}
                          onChange={(event) => setFormState((current) => ({...current, tagsText: event.target.value}))}
                          placeholder='Strategy, QA, Docs'
                          value={formState.tagsText}
                        />
                      </div>

                      {cardId ? (
                        <div className='sm:col-span-2'>
                          <CardGitHubSection cardId={cardId} />
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            </div>

            {!isViewScopedDetailLayout ? (
              <div className='rounded-3xl border border-border-subtle bg-surface-elevated p-5 shadow-panel'>
                <div className='flex items-center justify-between gap-3'>
                  <div>
                    <p className='font-mono text-xs uppercase tracking-[0.24em] text-text-muted'>
                      {resolveBuiltinFieldLabel('assignee', builtinFieldLabels)}
                    </p>
                    <div className='mt-2 flex items-center gap-3'>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            aria-label='Change assignee'
                            className='rounded-full focus:outline-none focus:ring-2 focus:ring-primary-soft disabled:cursor-not-allowed disabled:opacity-60'
                            disabled={!canEditProject || !cardId || !detail || isHistoryPending || setCardAssigneeMutation.isPending}
                            type='button'
                          >
                            <UserAvatar
                              avatarUrl={assigneeAvatarUrl}
                              className='h-9 w-9'
                              fallback={assigneeInitials}
                              name={assigneeDisplayName}
                            />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='start'>
                          <DropdownMenuLabel>Reassign task</DropdownMenuLabel>
                          <DropdownMenuItem onSelect={() => handleAssigneeChange(null)}>
                            <UserAvatar className='h-7 w-7' fallback='—'/>
                            <span className='flex-1'>Unassigned</span>
                            {detail?.assigneeUserId == null ? <Check className='ml-auto h-4 w-4 text-primary'/> : null}
                          </DropdownMenuItem>
                          {assigneeOptions.length > 0 ? <DropdownMenuSeparator /> : null}
                          {assigneeOptions.map((member) => (
                            <DropdownMenuItem key={member.id} onSelect={() => handleAssigneeChange(member.id)}>
                              <UserAvatar
                                avatarUrl={member.avatarUrl}
                                className='h-7 w-7'
                                fallback={getInitials(member.name, member.name[0] ?? '?')}
                                name={member.name}
                              />
                              <span className='flex-1'>{member.name}</span>
                              {detail?.assigneeUserId === member.id ? (
                                <Check className='ml-auto h-4 w-4 text-primary'/>
                              ) : null}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <div>
                        <p className='text-sm font-medium text-text-strong'>{assigneeDisplayName}</p>
                        <p className='text-xs text-text-muted'>{detail ? 'Assigned in project' : 'Assigned to you on create'}</p>
                      </div>
                    </div>
                  </div>

                  <div className='flex items-center gap-2'>
                    {parseTags(formState.tagsText).map((tag) => (
                      <Badge key={tag} variant='subtle'>
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className='mt-4 flex items-center gap-2 text-sm text-text-medium'>
                  <CalendarDays className='h-4 w-4'/>
                  <span>
                    {formState.startAt || 'No start'} to {formState.dueAt || 'No due date'}
                  </span>
                </div>
              </div>
            ) : null}

            {isEditing && customFields.length > 0 && !isViewScopedDetailLayout ? (
              <div className='rounded-3xl border border-border-subtle bg-surface-elevated p-5 shadow-panel'>
                <div className='flex items-center justify-between gap-3'>
                  <div>
                    <p className='font-mono text-xs uppercase tracking-[0.24em] text-text-muted'>Custom Fields</p>
                    <h3 className='mt-2 font-display text-lg font-semibold text-text-strong'>
                      Project-specific metadata
                    </h3>
                  </div>
                </div>

                <div className='mt-4 grid gap-4 sm:grid-cols-2'>
                  {customFields.map((field) => {
                    const draftValue = customFieldDrafts[field.key] ?? ''

                    return (
                      <label className='space-y-2' key={field.id}>
                        <span className='text-sm font-medium text-text-strong'>{field.name}</span>
                        {field.fieldType === 'single_select' ? (
                          <select
                            className='h-10 w-full rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                            disabled={!canEditProject || setCardFieldValueMutation.isPending}
                            onChange={(event) => commitCustomFieldValue(field, event.target.value)}
                            value={draftValue}
                          >
                            <option value=''>—</option>
                            {field.options.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            disabled={!canEditProject || setCardFieldValueMutation.isPending}
                            onBlur={(event) => {
                              if (field.fieldType === 'number' && event.target.value.trim() && Number.isNaN(Number(event.target.value))) {
                                return
                              }

                              commitCustomFieldValue(field, event.target.value)
                            }}
                            onChange={(event) =>
                              setCustomFieldDrafts((current) => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.currentTarget.blur()
                              }
                            }}
                            type={field.fieldType === 'number' ? 'number' : field.fieldType === 'date' ? 'date' : 'text'}
                            value={draftValue}
                          />
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {isEditing ? (
              <div className='rounded-3xl border border-border-subtle bg-surface-elevated p-5 shadow-panel'>
                <div className='flex items-center justify-between gap-3'>
                  <div className='flex items-center gap-2'>
                    <Paperclip className='h-4 w-4 text-text-muted'/>
                    <h3 className='font-display text-lg font-semibold text-text-strong'>
                      Attachments ({detail?.attachments.length ?? 0})
                    </h3>
                  </div>
                </div>

                <div className='mt-4 space-y-3'>
                  {detail?.attachments.length ? (
                    detail.attachments.map((attachment) => (
                      <div className='rounded-2xl bg-canvas-accent px-4 py-3' key={attachment.id}>
                        <div className='flex items-start justify-between gap-3'>
                          <div className='min-w-0'>
                            <p className='truncate text-sm font-medium text-text-strong'>{attachment.fileName}</p>
                            <p className='mt-1 text-xs text-text-muted'>
                              {formatAttachmentSize(attachment.sizeBytes)}
                              {attachment.contentType ? ` · ${attachment.contentType}` : ''}
                              {' · '}
                              Uploaded by {attachment.uploadedByName}
                            </p>
                          </div>
                          <Badge variant='count'>Stored</Badge>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className='rounded-2xl border border-dashed border-border-subtle px-4 py-5 text-sm text-text-muted'>
                      No attachments yet.
                    </div>
                  )}
                </div>

                <div className='mt-4'>
                  <label className='space-y-2'>
                    <span className='text-sm font-medium text-text-strong'>Upload file</span>
                    <Input
                      disabled={!canEditProject || uploadAttachmentMutation.isPending}
                      key={uploadInputKey}
                      onChange={(event) => handleAttachmentUpload(event.target.files?.[0] ?? null)}
                      type='file'
                    />
                  </label>
                  <p className='mt-2 text-xs text-text-muted'>
                    Uploads are stored in the shared project attachments bucket and linked back to this card.
                  </p>
                </div>
              </div>
            ) : null}

            {isEditing ? (
              <div className='rounded-3xl border border-border-subtle bg-surface-elevated p-5 shadow-panel'>
                <div className='flex items-center gap-2'>
                  <MessageSquare className='h-4 w-4 text-text-muted'/>
                  <h3 className='font-display text-lg font-semibold text-text-strong'>
                    Comments ({detail?.comments.length ?? 0})
                  </h3>
                </div>

                <div className='mt-4 space-y-4'>
                  {detail?.comments.length ? (
                    detail.comments.map((comment) => (
                      <div className='flex gap-3' key={comment.id}>
                        <UserAvatar
                          avatarUrl={
                            comment.authorUserId === currentUser.id
                              ? currentUser.avatarUrl ?? null
                              : projectMembers.find((member) => member.id === comment.authorUserId)?.avatarUrl ?? null
                          }
                          className='h-8 w-8'
                          fallback={getInitials(comment.authorName, '?')}
                          name={comment.authorName}
                        />
                        <div className='flex-1 rounded-2xl bg-canvas-accent px-4 py-3'>
                          <div className='flex items-center justify-between gap-3'>
                            <span className='text-sm font-medium text-text-strong'>{comment.authorName}</span>
                            <span className='text-xs text-text-muted'>{formatCommentTimestamp(comment.createdAt)}</span>
                          </div>
                          <p className='mt-2 text-sm leading-relaxed text-text-medium'>{comment.bodyText}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className='rounded-2xl border border-dashed border-border-subtle px-4 py-5 text-sm text-text-muted'>
                      No comments yet. Use this thread for handoffs, reviews, and decision notes.
                    </div>
                  )}
                </div>

                <div className='mt-4 flex gap-3'>
                  <UserAvatar
                    avatarUrl={currentUser.avatarUrl}
                    className='h-9 w-9'
                    fallback={currentUser.initials}
                    name={currentUser.name}
                  />
                  <div className='flex-1'>
                    <Textarea
                      className='min-h-[96px]'
                      disabled={!canEditProject}
                      onChange={(event) => setCommentText(event.target.value)}
                      placeholder='Add a comment…'
                      value={commentText}
                    />
                    <div className='mt-3 flex justify-end'>
                      <Button
                        disabled={!canEditProject || !commentText.trim() || addCommentMutation.isPending}
                        onClick={handleCommentSubmit}
                        variant='primary'
                      >
                        <Send className='h-4 w-4'/>
                        Post comment
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {errorMessage ? (
              <div className='rounded-2xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error'>
                {errorMessage}
              </div>
            ) : null}
            {historyErrorMessage ? (
              <div className='rounded-2xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error'>
                {historyErrorMessage}
              </div>
            ) : null}
          </div>
        </div>

        <div className='border-t border-border-subtle bg-surface-base px-5 py-4'>
          <div className='flex items-center justify-between gap-3'>
            <div className='space-y-2'>
              <p className='text-sm text-text-muted'>
                {isEditing ? 'Changes sync automatically through the shared project write path.' : 'New tasks are assigned to you by default.'}
              </p>
              {isEditing ? (
                <div className='flex flex-wrap items-center gap-2'>
                  {saveStateLabel ? (
                    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${saveStateTone}`}>
                      {saveStateLabel}
                    </div>
                  ) : null}
                  <Button
                    disabled={!canEditProject || !canUndo || isHistoryPending || isBusy}
                    onClick={() => void undo()}
                    variant='secondary'
                  >
                    Undo
                  </Button>
                  <Button
                    disabled={!canEditProject || !canRedo || isHistoryPending || isBusy}
                    onClick={() => void redo()}
                    variant='secondary'
                  >
                    Redo
                  </Button>
                  {lastActionDescription ? (
                    <span className='text-xs font-medium text-text-muted'>
                      {lastActionDescription}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className='flex items-center gap-2'>
              <Button onClick={requestClose} variant='secondary'>
                {isEditing ? 'Close' : 'Cancel'}
              </Button>
              {!isEditing ? (
                <Button
                  disabled={saveDisabled}
                  onClick={handleCreate}
                  variant='primary'
                >
                  <Upload className='h-4 w-4'/>
                  Create task
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        </>
        )}
      </aside>
      {confirmDialogProps ? <ConfirmDialog {...confirmDialogProps}/> : null}
    </>
  )
}
