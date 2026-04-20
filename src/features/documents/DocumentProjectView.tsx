import {useQueryClient} from '@tanstack/react-query'
import {
  AlertTriangle,
  Clock3,
  Eye,
  History,
  MoreHorizontal,
  Paperclip,
  RefreshCw,
  Save,
  Send,
  Trash2,
  MessageSquare,
  SmilePlus,
  Undo2,
  Redo2,
  Users,
} from 'lucide-react'
import {useEffect, useEffectEvent, useMemo, useRef, useState} from 'react'
import type {ChangeEvent} from 'react'

import {Badge} from '../../components/ui/badge'
import {Button} from '../../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import {Input} from '../../components/ui/input'
import {Textarea} from '../../components/ui/textarea'
import {UserAvatar} from '../../components/ui/user-avatar'
import type {ProjectMember} from '../access/access.types'
import type {SessionUser} from '../auth/data'
import {RichTextEditor} from '../rich-text/RichTextEditor'
import {
  cloneRichTextDocument,
  richTextDocumentsEqual,
  stringifyRichTextDocument,
} from '../rich-text/rich-text'
import {prepareContentForSave} from '../rich-text/prepare-content'
import {
  DOCUMENT_CONFLICT,
  getDocumentErrorCode,
  documentRepository,
  toDocumentErrorMessage,
} from './document.repository'
import {
  projectDocumentQueryOptions,
  useAddDocumentCommentMutation,
  useDeleteDocumentVersionMutation,
  useDocumentPresenceHeartbeatMutation,
  useDocumentPresenceQuery,
  useProjectDocumentQuery,
  useRestoreDocumentVersionMutation,
  useSaveDocumentMutation,
  useToggleCommentReactionMutation,
  useUploadAttachmentMutation,
} from './document.queries'
import type {CommentReactions, DocumentCommentRecord, ProjectDocumentSnapshot} from './document.types'
import {useDocumentHistory} from './useDocumentHistory'

type DocumentProjectViewProps = {
  canEditProject: boolean
  currentUser: SessionUser
  initialSnapshot: ProjectDocumentSnapshot
  onDirtyStateChange?: (isDirty: boolean) => void
  projectId: string
  projectMembers?: ProjectMember[]
  projectName: string
  projectViewId: string
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value))
}

function formatRelativeTime(value: string) {
  const target = new Date(value)
  const elapsedMs = Date.now() - target.getTime()

  if (Number.isNaN(target.getTime()) || elapsedMs < 0) {
    return 'just now'
  }

  const minute = 60_000
  const hour = 60 * minute

  if (elapsedMs < hour) {
    return `${Math.max(1, Math.floor(elapsedMs / minute))}m ago`
  }

  return `${Math.floor(elapsedMs / hour)}h ago`
}

function formatFileSize(bytes: number) {
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(1)} MB`
  }

  if (bytes >= 1_000) {
    return `${Math.round(bytes / 1_000)} KB`
  }

  return `${bytes} B`
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase()
}

const COMMON_EMOJIS = ['👍', '❤️', '😂', '🎉', '🚀', '👀']

function EmojiReactionBar({
  currentUserId,
  onToggle,
  reactions,
}: {
  currentUserId: string
  onToggle: (emoji: string) => void
  reactions: CommentReactions
}) {
  const [showPicker, setShowPicker] = useState(false)
  const entries = Object.entries(reactions).filter(([, ids]) => ids.length > 0)

  return (
    <div className='mt-1.5 flex flex-wrap items-center gap-1'>
      {entries.map(([emoji, userIds]) => {
        const isOwn = userIds.includes(currentUserId)
        return (
          <button
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
              isOwn
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border-subtle bg-surface-base text-text-medium hover:bg-canvas-accent'
            }`}
            key={emoji}
            onClick={() => onToggle(emoji)}
            type='button'
          >
            <span>{emoji}</span>
            <span className='font-medium'>{userIds.length}</span>
          </button>
        )
      })}
      <div className='relative'>
        <button
          className='flex h-6 w-6 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-medium'
          onClick={() => setShowPicker(!showPicker)}
          title='Add reaction'
          type='button'
        >
          <SmilePlus className='h-3.5 w-3.5'/>
        </button>
        {showPicker ? (
          <div className='absolute left-0 top-full z-50 mt-1 flex gap-1 rounded-xl border border-border-subtle bg-surface-elevated p-2 shadow-lg'>
            {COMMON_EMOJIS.map((emoji) => (
              <button
                className='rounded-md px-1.5 py-1 text-base transition-colors hover:bg-canvas-accent'
                key={emoji}
                onClick={() => { onToggle(emoji); setShowPicker(false) }}
                type='button'
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function SingleComment({
  canEditProject,
  comment,
  currentUserId,
  resolveAvatarUrl,
  depth,
  isReplyPending,
  onCancelReply,
  onReply,
  onSubmitReply,
  onToggleReaction,
  replyText,
  replyingToId,
  setReplyText,
}: {
  canEditProject: boolean
  comment: DocumentCommentRecord
  currentUserId: string
  resolveAvatarUrl: (userId: string | null | undefined) => string | null
  depth: number
  isReplyPending: boolean
  onCancelReply: () => void
  onReply: (parentId: string) => void
  onSubmitReply: () => void
  onToggleReaction: (commentId: string, emoji: string) => void
  replyText: string
  replyingToId: string | null
  setReplyText: (value: string) => void
}) {
  const hasReactions = Object.keys(comment.reactions).some((k) => (comment.reactions[k]?.length ?? 0) > 0)
  const isReplyingToThis = replyingToId === comment.id

  return (
    <div className={depth > 0 ? 'ml-6 border-l-2 border-border-subtle pl-4' : ''}>
      <div className='rounded-2xl border border-border-subtle bg-surface-base px-4 py-3'>
        <div className='flex items-start justify-between gap-3'>
          <div className='flex items-center gap-3'>
            <UserAvatar
              avatarUrl={resolveAvatarUrl(comment.authorUserId)}
              className='h-8 w-8'
              fallback={getInitials(comment.authorName)}
              name={comment.authorName}
            />
            <p className='text-sm font-medium text-text-strong'>{comment.authorName}</p>
          </div>
          <p className='text-xs text-text-muted'>{formatTimestamp(comment.createdAt)}</p>
        </div>
        <p className='mt-2 text-sm leading-relaxed text-text-medium'>{comment.bodyText}</p>
        {hasReactions ? (
          <EmojiReactionBar
            currentUserId={currentUserId}
            onToggle={(emoji) => {
              if (!canEditProject) return
              onToggleReaction(comment.id, emoji)
            }}
            reactions={comment.reactions}
          />
        ) : null}
        <div className='mt-2 flex items-center gap-3'>
          {canEditProject && !hasReactions ? (
            <button
              className='flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-text-medium'
              onClick={() => onToggleReaction(comment.id, '👍')}
              type='button'
            >
              <SmilePlus className='h-3 w-3'/>
            </button>
          ) : null}
          {canEditProject && depth === 0 ? (
            <button
              className='flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-text-medium'
              onClick={() => onReply(comment.id)}
              type='button'
            >
              <MessageSquare className='h-3 w-3'/>
              Reply
            </button>
          ) : null}
        </div>
      </div>
      {/* Inline reply composer */}
      {isReplyingToThis ? (
        <div className='mt-2 rounded-2xl border border-primary/20 bg-primary/5 p-3'>
          <p className='mb-2 text-xs font-medium text-primary'>Replying to {comment.authorName}</p>
          <Textarea
            autoFocus
            className='min-h-[60px]'
            disabled={!canEditProject}
            onChange={(event) => setReplyText(event.target.value)}
            placeholder='Write a reply...'
            value={replyText}
          />
          <div className='mt-2 flex items-center gap-2'>
            <Button
              disabled={!canEditProject || !replyText.trim() || isReplyPending}
              onClick={onSubmitReply}
              size='compact'
              variant='primary'
            >
              <Send className='h-4 w-4'/>
              Reply
            </Button>
            <Button onClick={onCancelReply} size='compact' variant='secondary'>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {comment.replies.length > 0 ? (
        <div className='mt-2 space-y-2'>
          {comment.replies.map((reply) => (
            <SingleComment
              canEditProject={canEditProject}
              comment={reply}
              currentUserId={currentUserId}
              resolveAvatarUrl={resolveAvatarUrl}
              depth={depth + 1}
              isReplyPending={isReplyPending}
              key={reply.id}
              onCancelReply={onCancelReply}
              onReply={onReply}
              onSubmitReply={onSubmitReply}
              onToggleReaction={onToggleReaction}
              replyText={replyText}
              replyingToId={replyingToId}
              setReplyText={setReplyText}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function CommentsListWithViewMore({
  canEditProject,
  comments,
  currentUserId,
  resolveAvatarUrl,
  isReplyPending,
  onCancelReply,
  onReply,
  onSubmitReply,
  onToggleReaction,
  replyText,
  replyingToId,
  setReplyText,
}: {
  canEditProject: boolean
  comments: ProjectDocumentSnapshot['comments']
  currentUserId: string
  resolveAvatarUrl: (userId: string | null | undefined) => string | null
  isReplyPending: boolean
  onCancelReply: () => void
  onReply: (parentId: string) => void
  onSubmitReply: () => void
  onToggleReaction: (commentId: string, emoji: string) => void
  replyText: string
  replyingToId: string | null
  setReplyText: (value: string) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? comments : comments.slice(0, 3)

  return (
    <div className='mt-4 space-y-3'>
      {visible.length ? (
        visible.map((comment) => (
          <SingleComment
            canEditProject={canEditProject}
            comment={comment}
            currentUserId={currentUserId}
            resolveAvatarUrl={resolveAvatarUrl}
            depth={0}
            isReplyPending={isReplyPending}
            key={comment.id}
            onCancelReply={onCancelReply}
            onReply={onReply}
            onSubmitReply={onSubmitReply}
            onToggleReaction={onToggleReaction}
            replyText={replyText}
            replyingToId={replyingToId}
            setReplyText={setReplyText}
          />
        ))
      ) : (
        <div className='rounded-2xl border border-dashed border-border-subtle px-4 py-4 text-sm text-text-muted'>
          No comments yet.
        </div>
      )}
      {comments.length > 3 && !showAll ? (
        <button
          className='w-full text-center text-xs font-medium text-primary hover:text-primary/80'
          onClick={() => setShowAll(true)}
          type='button'
        >
          View more ({comments.length - 3} more)
        </button>
      ) : null}
      {showAll && comments.length > 3 ? (
        <button
          className='w-full text-center text-xs font-medium text-text-muted hover:text-text-medium'
          onClick={() => setShowAll(false)}
          type='button'
        >
          Show less
        </button>
      ) : null}
    </div>
  )
}

function VersionListWithViewMore({
  conflictMessage,
  currentVersion,
  isRestorePending,
  onRemoveVersion,
  onRestore,
  onViewVersion,
  versions,
}: {
  conflictMessage: string | null
  currentVersion: number
  isRestorePending: boolean
  onRemoveVersion: (versionId: string) => void
  onRestore: (versionId: string) => void
  onViewVersion: (versionId: string) => void
  versions: ProjectDocumentSnapshot['versions']
}) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? versions : versions.slice(0, 3)

  return (
    <div className='mt-4 space-y-3'>
      {visible.map((entry) => (
        <div className='rounded-2xl border border-border-subtle bg-surface-base px-4 py-3' key={entry.id}>
          <div className='flex items-center gap-3'>
            <div>
              <p className='text-sm font-medium text-text-strong'>v{entry.version}</p>
              <p className='text-xs text-text-muted'>
                {entry.authorName} • {formatTimestamp(entry.createdAt)}
              </p>
            </div>
            <div className='flex-1'/>
            {entry.version === currentVersion ? (
              <Badge variant='primary'>Current</Badge>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className='flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-canvas-accent hover:text-text-strong'
                    type='button'
                  >
                    <MoreHorizontal className='h-4 w-4'/>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  <DropdownMenuItem onClick={() => onViewVersion(entry.id)}>
                    <Eye className='h-4 w-4'/>
                    View
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isRestorePending || conflictMessage !== null}
                    onClick={() => onRestore(entry.id)}
                  >
                    <RefreshCw className='h-4 w-4'/>
                    Restore
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className='text-error focus:text-error'
                    onClick={() => onRemoveVersion(entry.id)}
                  >
                    <Trash2 className='h-4 w-4'/>
                    Remove version
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <p className='mt-2 text-sm text-text-medium'>{entry.title}</p>
        </div>
      ))}
      {versions.length > 3 && !showAll ? (
        <button
          className='w-full text-center text-xs font-medium text-primary hover:text-primary/80'
          onClick={() => setShowAll(true)}
          type='button'
        >
          View more ({versions.length - 3} more)
        </button>
      ) : null}
      {showAll && versions.length > 3 ? (
        <button
          className='w-full text-center text-xs font-medium text-text-muted hover:text-text-medium'
          onClick={() => setShowAll(false)}
          type='button'
        >
          Show less
        </button>
      ) : null}
    </div>
  )
}

export function DocumentProjectView({
  canEditProject,
  currentUser,
  initialSnapshot,
  onDirtyStateChange,
  projectId,
  projectMembers = [],
  projectName,
  projectViewId,
}: DocumentProjectViewProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const lastSyncedDocumentIdRef = useRef(initialSnapshot.document.id)
  const lastSyncedVersionRef = useRef(initialSnapshot.document.version)
  const lastFailedAutosaveKeyRef = useRef<string | null>(null)
  const documentQuery = useProjectDocumentQuery(projectViewId, initialSnapshot)
  const snapshot = documentQuery.data ?? initialSnapshot
  const documentId = snapshot.document.id
  const presenceQuery = useDocumentPresenceQuery(documentId)
  const {
    error: saveDocumentError,
    isPending: isSavePending,
    mutate: saveDocument,
  } = useSaveDocumentMutation(projectId, projectViewId)
  const {
    error: restoreDocumentError,
    isPending: isRestorePending,
    mutate: restoreDocumentVersion,
  } = useRestoreDocumentVersionMutation(projectId, projectViewId)
  const {
    error: deleteVersionError,
    mutate: deleteDocumentVersion,
  } = useDeleteDocumentVersionMutation(projectId, projectViewId)
  const {
    error: addCommentError,
    isPending: isAddCommentPending,
    mutate: addDocumentComment,
  } = useAddDocumentCommentMutation(projectId, projectViewId)
  const {mutate: toggleReaction} = useToggleCommentReactionMutation(projectViewId)
  const {
    error: uploadAttachmentError,
    isPending: isUploadAttachmentPending,
    mutateAsync: uploadAttachment,
  } = useUploadAttachmentMutation(projectId, projectViewId)
  const {mutate: updatePresence} = useDocumentPresenceHeartbeatMutation()
  const history = useDocumentHistory({
    contentJson: cloneRichTextDocument(snapshot.document.contentJson, snapshot.document.contentMd),
    title: snapshot.document.title,
  })
  const [commentText, setCommentText] = useState('')
  const [replyingToId, setReplyingToId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)
  const [draftBaseVersion, setDraftBaseVersion] = useState(initialSnapshot.document.version)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [viewingVersion, setViewingVersion] = useState<{
    authorName: string
    contentJson: import('../rich-text/rich-text').RichTextDocument
    title: string
    version: number
  } | null>(null)
  const resolveAvatarUrl = useMemo(
    () => (userId: string | null | undefined) => {
      if (!userId) {
        return null
      }

      if (userId === currentUser.id) {
        return currentUser.avatarUrl ?? null
      }

      return projectMembers.find((member) => member.id === userId)?.avatarUrl ?? null
    },
    [currentUser.avatarUrl, currentUser.id, projectMembers],
  )

  const serverDocument = snapshot.document
  const draft = history.draft
  const serverContentKey = stringifyRichTextDocument(serverDocument.contentJson, serverDocument.contentMd)
  const draftContentKey = stringifyRichTextDocument(draft.contentJson)
  const draftAutosaveKey = `${documentId}:${draftBaseVersion}:${draft.title}:${draftContentKey}`
  const isDirty =
    draft.title !== serverDocument.title || !richTextDocumentsEqual(draft.contentJson, serverDocument.contentJson)

  const mutationError = useMemo(() => {
    return (
      saveDocumentError
      || restoreDocumentError
      || deleteVersionError
      || addCommentError
      || uploadAttachmentError
      || documentQuery.error
      || presenceQuery.error
    )
  }, [
    addCommentError,
    deleteVersionError,
    documentQuery.error,
    presenceQuery.error,
    restoreDocumentError,
    saveDocumentError,
    uploadAttachmentError,
  ])

  const saveDraft = useEffectEvent((createVersion = false) => {
    if (!canEditProject) {
      return
    }

    if (!createVersion && lastFailedAutosaveKeyRef.current === draftAutosaveKey) {
      return
    }

    setSaveStatus('saving')
    saveDocument(
      {
        contentJson: cloneRichTextDocument(draft.contentJson),
        contentMd: prepareContentForSave(draft.contentJson).contentMd,
        createVersion,
        documentId,
        expectedVersion: draftBaseVersion,
        title: draft.title,
      },
      {
        onError: (error) => {
          if (getDocumentErrorCode(error) === DOCUMENT_CONFLICT) {
            lastFailedAutosaveKeyRef.current = null
            setConflictMessage(toDocumentErrorMessage(error))
          } else {
            lastFailedAutosaveKeyRef.current = draftAutosaveKey
            setSaveStatus('error')
          }
        },
        onSuccess: () => {
          lastFailedAutosaveKeyRef.current = null
          setDraftBaseVersion((current) => current + 1)
          setConflictMessage(null)
          setSaveStatus('saved')
        },
      },
    )
  })

  const sendPresenceHeartbeat = useEffectEvent(() => {
    updatePresence({documentId, state: 'editing'})
  })

  useEffect(() => {
    const isNewDocument = lastSyncedDocumentIdRef.current !== documentId
    const hasNewServerVersion = lastSyncedVersionRef.current !== serverDocument.version

    if (isNewDocument || (!isDirty && hasNewServerVersion)) {
      history.resetDraft({
        contentJson: cloneRichTextDocument(serverDocument.contentJson, serverDocument.contentMd),
        title: serverDocument.title,
      })
      setDraftBaseVersion(serverDocument.version)
      setConflictMessage(null)
      lastFailedAutosaveKeyRef.current = null
      setSaveStatus('idle')
      lastSyncedDocumentIdRef.current = documentId
      lastSyncedVersionRef.current = serverDocument.version
    }
  }, [documentId, history, isDirty, serverContentKey, serverDocument.contentMd, serverDocument.title, serverDocument.version])

  useEffect(() => {
    if (!canEditProject || !isDirty) {
      if (saveStatus === 'saved') {
        const timeout = window.setTimeout(() => setSaveStatus('idle'), 1400)
        return () => window.clearTimeout(timeout)
      }

      return
    }

    if (conflictMessage || isSavePending || isRestorePending) {
      return
    }

    const timeout = window.setTimeout(() => {
      saveDraft(false)
    }, 5000)

    return () => window.clearTimeout(timeout)
  }, [
    conflictMessage,
    draftBaseVersion,
    draftContentKey,
    draft.title,
    isDirty,
    isRestorePending,
    isSavePending,
    saveStatus,
  ])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifierKey = event.metaKey || event.ctrlKey

      if (!modifierKey) {
        return
      }

      const key = event.key.toLowerCase()

      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        history.undo()
      }

      if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault()
        history.redo()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [history])

  useEffect(() => {
    if (!documentId) {
      return
    }

    sendPresenceHeartbeat()
    const interval = window.setInterval(() => {
      sendPresenceHeartbeat()
    }, 30_000)

    return () => window.clearInterval(interval)
  }, [documentId])

  const saveStateLabel = conflictMessage
    ? 'Conflict'
    : isSavePending
      ? 'Saving...'
      : saveStatus === 'saved'
        ? 'Saved'
        : null // nothing when idle — Google Docs style

  const saveStateTone = conflictMessage
    ? 'border-error/20 bg-error/10 text-error'
    : isSavePending
      ? 'border-primary/20 bg-primary-soft text-primary'
      : 'border-border-subtle bg-surface-elevated text-text-medium'

  const hasUnsavedChanges =
    isDirty || commentText.trim().length > 0 || conflictMessage !== null
  const presenceEntries = presenceQuery.data ?? []
  const visiblePresence = presenceEntries.slice(0, 4)
  const errorMessage = mutationError ? toDocumentErrorMessage(mutationError) : null

  useEffect(() => {
    onDirtyStateChange?.(hasUnsavedChanges)
  }, [hasUnsavedChanges, onDirtyStateChange])

  useEffect(() => {
    return () => {
      onDirtyStateChange?.(false)
    }
  }, [onDirtyStateChange])

  // Save with version on unmount (navigation away = session boundary)
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty
  useEffect(() => {
    return () => {
      if (canEditProject && isDirtyRef.current) {
        saveDraft(true) // create version on leave
      }
    }
  }, [canEditProject]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleReloadLatest = async () => {
    const nextSnapshot = await queryClient.fetchQuery(projectDocumentQueryOptions(projectViewId))
    history.resetDraft({
      contentJson: cloneRichTextDocument(nextSnapshot.document.contentJson, nextSnapshot.document.contentMd),
      title: nextSnapshot.document.title,
    })
    setDraftBaseVersion(nextSnapshot.document.version)
    setConflictMessage(null)
    lastFailedAutosaveKeyRef.current = null
    setSaveStatus('idle')
  }

  const handleViewVersion = async (versionId: string) => {
    try {
      const content = await documentRepository.getDocumentVersionContent({
        documentId,
        versionId,
      })
      setViewingVersion({
        authorName: content.authorName,
        contentJson: content.contentJson,
        title: content.title,
        version: content.version,
      })
    } catch {
      // error will surface via mutationError if needed
    }
  }

  const handleAttachmentSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!canEditProject) {
      event.target.value = ''
      return
    }

    const files = Array.from(event.target.files ?? [])

    for (const file of files) {
      await uploadAttachment({
        documentId,
        file,
        projectId,
      })
    }

    event.target.value = ''
  }

  return (
    <div className='grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_22rem]'>
      <section className='space-y-4'>
        <div className='rounded-[28px] border border-border-subtle bg-surface-elevated p-5 shadow-panel'>
          <div className='flex flex-wrap items-center gap-3'>
            {saveStateLabel ? (
              <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${saveStateTone}`}>
                <Save className='h-3.5 w-3.5'/>
                {saveStateLabel}
              </div>
            ) : null}
            <div className='inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-base px-3 py-1 text-xs text-text-muted'>
              <Clock3 className='h-3.5 w-3.5'/>
              Updated {formatRelativeTime(serverDocument.updatedAt)} by {serverDocument.updatedByName}
            </div>
            <div className='flex-1'/>
            <Button disabled={!canEditProject || !history.canUndo} onClick={history.undo} size='compact' variant='secondary'>
              <Undo2 className='h-4 w-4'/>
              Undo
            </Button>
            <Button disabled={!canEditProject || !history.canRedo} onClick={history.redo} size='compact' variant='secondary'>
              <Redo2 className='h-4 w-4'/>
              Redo
            </Button>
            <Button
              disabled={!canEditProject || isUploadAttachmentPending}
              onClick={() => fileInputRef.current?.click()}
              size='compact'
              variant='secondary'
            >
              <Paperclip className='h-4 w-4'/>
              Attach file
            </Button>
            <input
              className='hidden'
              multiple
              onChange={handleAttachmentSelect}
              ref={fileInputRef}
              type='file'
            />
          </div>

          {conflictMessage ? (
            <div className='mt-4 rounded-2xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error'>
              <div className='flex items-start gap-3'>
                <AlertTriangle className='mt-0.5 h-4 w-4'/>
                <div>
                  <p className='font-medium'>Document conflict</p>
                  <p className='mt-1 leading-relaxed'>{conflictMessage}</p>
                  <Button className='mt-3' onClick={() => void handleReloadLatest()} size='compact' variant='secondary'>
                    <RefreshCw className='h-4 w-4'/>
                    Reload latest
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {errorMessage && !conflictMessage ? (
            <div className='mt-4 rounded-2xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error'>
              {errorMessage}
            </div>
          ) : null}

          {viewingVersion ? (
            <div className='mt-4 flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary-soft px-4 py-3 text-sm text-primary'>
              <Eye className='h-4 w-4'/>
              <span className='flex-1'>
                Viewing <strong>v{viewingVersion.version}</strong> by {viewingVersion.authorName}
              </span>
              <Button onClick={() => setViewingVersion(null)} size='compact' variant='secondary'>
                Back to editor
              </Button>
            </div>
          ) : null}

          <div className='mt-5 space-y-4'>
            {viewingVersion ? (
              <>
                <div className='block space-y-2'>
                  <span className='text-xs font-medium uppercase tracking-[0.2em] text-text-muted'>Document title (v{viewingVersion.version})</span>
                  <Input disabled value={viewingVersion.title}/>
                </div>
                <div className='block space-y-2'>
                  <span className='text-xs font-medium uppercase tracking-[0.2em] text-text-muted'>Body (read-only)</span>
                  <RichTextEditor
                    editable={false}
                    minHeightClassName='min-h-[32rem]'
                    value={viewingVersion.contentJson}
                  />
                </div>
              </>
            ) : (
              <>
                <label className='block space-y-2'>
                  <span className='text-xs font-medium uppercase tracking-[0.2em] text-text-muted'>Document title</span>
                  <Input
                    disabled={!canEditProject}
                    onChange={(event) => history.updateDraft((current) => ({...current, title: event.target.value}))}
                    placeholder={`${projectName} document`}
                    value={draft.title}
                  />
                </label>

                <div className='block space-y-2'>
                  <span className='text-xs font-medium uppercase tracking-[0.2em] text-text-muted'>Body</span>
                  <RichTextEditor
                    editable={canEditProject}
                    minHeightClassName='min-h-[32rem]'
                    onChange={(nextValue) => history.updateDraft((current) => ({...current, contentJson: nextValue}))}
                    placeholder='Start writing here...'
                    value={draft.contentJson}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <aside className='space-y-4'>
        {/* 1. Presence */}
        <section className='rounded-[28px] border border-border-subtle bg-surface-elevated p-5 shadow-panel'>
          <div className='flex items-center gap-2'>
            <Users className='h-4 w-4 text-text-muted'/>
            <h3 className='font-display text-lg font-semibold text-text-strong'>Presence</h3>
            <Badge className='ml-auto' variant='count'>
              {presenceEntries.length}
            </Badge>
          </div>
          <div className='mt-4 space-y-3'>
            {visiblePresence.length ? (
              visiblePresence.map((entry) => (
                <div className='flex items-center gap-3 rounded-2xl bg-canvas-accent px-3 py-3' key={entry.userId}>
                  <UserAvatar
                    className='h-9 w-9'
                    fallback={getInitials(entry.name)}
                    name={entry.name}
                  />
                  <div className='min-w-0 flex-1'>
                    <p className='truncate text-sm font-medium text-text-strong'>{entry.name}</p>
                    <p className='text-xs text-text-muted'>
                      {entry.state} • {formatRelativeTime(entry.lastSeenAt)}
                    </p>
                  </div>
                  {entry.userId === currentUser.id ? <Badge variant='primary'>You</Badge> : null}
                </div>
              ))
            ) : (
              <div className='rounded-2xl border border-dashed border-border-subtle px-4 py-4 text-sm text-text-muted'>
                No active collaborators right now.
              </div>
            )}
          </div>
        </section>

        {/* 2. Attachments */}
        <section className='rounded-[28px] border border-border-subtle bg-surface-elevated p-5 shadow-panel'>
          <div className='flex items-center gap-2'>
            <Paperclip className='h-4 w-4 text-text-muted'/>
            <h3 className='font-display text-lg font-semibold text-text-strong'>Attachments</h3>
            <Badge className='ml-auto' variant='count'>
              {snapshot.attachments.length}
            </Badge>
          </div>
          <div className='mt-4 space-y-3'>
            {snapshot.attachments.length ? (
              snapshot.attachments.map((attachment) => (
                <div className='rounded-2xl border border-border-subtle bg-surface-base px-4 py-3' key={attachment.id}>
                  <p className='text-sm font-medium text-text-strong'>{attachment.fileName}</p>
                  <p className='mt-1 text-xs text-text-muted'>
                    {formatFileSize(attachment.sizeBytes)} • {attachment.uploadedByName} • {formatTimestamp(attachment.createdAt)}
                  </p>
                </div>
              ))
            ) : (
              <div className='rounded-2xl border border-dashed border-border-subtle px-4 py-4 text-sm text-text-muted'>
                No attachments yet.
              </div>
            )}
          </div>
        </section>

        {/* 3. Comments — show last 3 with "View more" */}
        <section className='rounded-[28px] border border-border-subtle bg-surface-elevated p-5 shadow-panel'>
          <div className='flex items-center gap-2'>
            <Send className='h-4 w-4 text-text-muted'/>
            <h3 className='font-display text-lg font-semibold text-text-strong'>Comments</h3>
            <Badge className='ml-auto' variant='count'>
              {snapshot.comments.length}
            </Badge>
          </div>
          <div className='mt-4 space-y-3'>
            <div className='flex gap-3'>
              <UserAvatar
                avatarUrl={currentUser.avatarUrl}
                className='h-9 w-9'
                fallback={currentUser.initials}
                name={currentUser.name}
              />
              <Textarea
                className='min-h-[100px]'
                disabled={!canEditProject}
                onChange={(event) => setCommentText(event.target.value)}
                placeholder='Leave a note for collaborators...'
                value={commentText}
              />
            </div>
            <div className='flex justify-end'>
              <Button
                disabled={!canEditProject || !commentText.trim() || isAddCommentPending}
                onClick={() =>
                  addDocumentComment(
                    {bodyText: commentText, documentId},
                    {onSuccess: () => setCommentText('')},
                  )
                }
                size='compact'
                variant='primary'
              >
                <Send className='h-4 w-4'/>
                Add comment
              </Button>
            </div>
          </div>
          <CommentsListWithViewMore
            canEditProject={canEditProject}
            comments={snapshot.comments}
            currentUserId={currentUser.id}
            isReplyPending={isAddCommentPending}
            onCancelReply={() => setReplyingToId(null)}
            onReply={(parentId) => {
              setReplyingToId(parentId)
              setReplyText('')
            }}
            onSubmitReply={() => {
              if (!replyingToId || !replyText.trim()) return
              addDocumentComment(
                {bodyText: replyText, documentId, parentCommentId: replyingToId},
                {onSuccess: () => { setReplyingToId(null); setReplyText('') }},
              )
            }}
            onToggleReaction={(commentId, emoji) => toggleReaction({commentId, emoji})}
            replyText={replyText}
            replyingToId={replyingToId}
            resolveAvatarUrl={resolveAvatarUrl}
            setReplyText={setReplyText}
          />
        </section>

        {/* 4. Version history — show last 3 with "View more" */}
        <section className='rounded-[28px] border border-border-subtle bg-surface-elevated p-5 shadow-panel'>
          <div className='flex items-center gap-2'>
            <History className='h-4 w-4 text-text-muted'/>
            <h3 className='font-display text-lg font-semibold text-text-strong'>Version history</h3>
          </div>
          <VersionListWithViewMore
            conflictMessage={conflictMessage}
            currentVersion={snapshot.document.version}
            isRestorePending={isRestorePending}
            onRemoveVersion={(versionId) =>
              deleteDocumentVersion({documentId, versionId})
            }
            onRestore={(versionId) =>
              restoreDocumentVersion(
                {documentId, expectedVersion: draftBaseVersion, versionId},
                {
                  onError: (error) => {
                    if (getDocumentErrorCode(error) === DOCUMENT_CONFLICT) {
                      setConflictMessage(toDocumentErrorMessage(error))
                    }
                  },
                  onSuccess: () => {
                    setDraftBaseVersion((current) => current + 1)
                    setConflictMessage(null)
                    setSaveStatus('saved')
                  },
                },
              )
            }
            onViewVersion={(versionId) => void handleViewVersion(versionId)}
            versions={snapshot.versions}
          />
        </section>
      </aside>
    </div>
  )
}
