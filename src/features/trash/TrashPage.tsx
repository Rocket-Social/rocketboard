import {useQuery, useQueryClient} from '@tanstack/react-query'
import {useParams} from '@tanstack/react-router'
import {Archive, RotateCcw, Search, Trash2} from 'lucide-react'
import {useState} from 'react'

import {Button} from '../../components/ui/button'
import {ConfirmDialog} from '../../components/ui/confirm-dialog'
import {useToast} from '../../components/ui/toast'
import {useConfirmDialog} from '../../hooks/useConfirmDialog'
import {cardRepository} from '../cards/card.repository'
import {invalidateAllProjectDataGlobal, workspaceSummariesQueryOptions} from '../projects/project-shell.queries'
import {trashRepository, type TrashItem} from './trash.repository'

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  return date.toLocaleDateString()
}

function daysUntilPurge(dateString: string): number {
  const deletedDate = new Date(dateString)
  const purgeDate = new Date(deletedDate.getTime() + 30 * 24 * 60 * 60 * 1000)
  const now = new Date()
  return Math.max(0, Math.ceil((purgeDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
}

export function TrashPage() {
  const {orgSlug, workspaceSlug} = useParams({strict: false}) as {orgSlug: string; workspaceSlug: string}
  const {data: workspaces} = useQuery(workspaceSummariesQueryOptions())
  const workspace = workspaces?.find((w) => w.organizationSlug === orgSlug && w.slug === workspaceSlug)
  const workspaceId = workspace?.id ?? ''
  const queryClient = useQueryClient()
  const {toast} = useToast()
  const {confirm, confirmDialogProps} = useConfirmDialog()
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const {data: items = [], isLoading} = useQuery({
    queryFn: () => trashRepository.getWorkspaceTrash(workspaceId),
    queryKey: ['workspace-trash', workspaceId],
  })

  const filtered = search
    ? items.filter(item =>
        item.title.toLowerCase().includes(search.toLowerCase())
        || item.projectName?.toLowerCase().includes(search.toLowerCase()),
      )
    : items

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(item => item.entityId)))
    }
  }

  const invalidateTrash = () =>
    queryClient.invalidateQueries({queryKey: ['workspace-trash', workspaceId]})

  const handleRestore = async (items: TrashItem[]) => {
    const cardIds = items.filter(i => i.entityType === 'card').map(i => i.entityId)
    if (cardIds.length > 0) {
      await cardRepository.restoreCards(cardIds)
    }
    setSelectedIds(new Set())
    await Promise.all([
      invalidateTrash(),
      invalidateAllProjectDataGlobal(queryClient),
    ])
    toast({title: `Restored ${items.length} item${items.length === 1 ? '' : 's'}`})
  }

  const handlePermanentDelete = async (items: TrashItem[]) => {
    if (!await confirm({title: `Permanently delete ${items.length} item${items.length === 1 ? '' : 's'}?`, description: 'This cannot be undone.', variant: 'destructive', confirmLabel: 'Delete permanently'})) {
      return
    }
    const cardIds = items.filter(i => i.entityType === 'card').map(i => i.entityId)
    if (cardIds.length > 0) {
      await cardRepository.permanentDeleteCards(cardIds)
    }
    setSelectedIds(new Set())
    await invalidateTrash()
    toast({title: `Permanently deleted ${items.length} item${items.length === 1 ? '' : 's'}`})
  }

  const selectedItems = filtered.filter(item => selectedIds.has(item.entityId))

  return (
    <>
    <div className='flex h-full flex-col'>
      {/* Header */}
      <div className='flex items-center justify-between border-b border-border-subtle px-6 py-4'>
        <div>
          <h1 className='font-display text-xl font-semibold text-text-strong'>Trash</h1>
          <p className='mt-1 text-sm text-text-muted'>
            Items in trash will be permanently deleted after 30 days
          </p>
        </div>
      </div>

      {/* Search */}
      <div className='border-b border-border-subtle px-6 py-3'>
        <div className='relative max-w-md'>
          <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted'/>
          <input
            className='w-full rounded-xl border border-border-subtle bg-surface-elevated py-2 pl-10 pr-4 text-sm text-text-strong placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'
            onChange={e => setSearch(e.target.value)}
            placeholder='Search trash...'
            type='text'
            value={search}
          />
        </div>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className='flex items-center gap-3 border-b border-border-subtle bg-canvas-accent px-6 py-2'>
          <span className='text-sm font-medium text-text-medium'>{selectedIds.size} selected</span>
          <Button onClick={() => void handleRestore(selectedItems)} size='compact' variant='secondary'>
            <RotateCcw className='h-3.5 w-3.5'/>
            Restore
          </Button>
          <Button
            className='text-error hover:bg-error/10'
            onClick={() => void handlePermanentDelete(selectedItems)}
            size='compact'
            variant='ghost'
          >
            <Trash2 className='h-3.5 w-3.5'/>
            Delete permanently
          </Button>
        </div>
      )}

      {/* Content */}
      <div className='flex-1 overflow-auto'>
        {isLoading ? (
          <div className='space-y-3 p-6'>
            {[1, 2, 3, 4].map(i => (
              <div className='h-12 animate-pulse rounded-xl bg-surface-muted' key={i}/>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className='flex flex-col items-center justify-center py-24 text-center'>
            <Trash2 className='h-10 w-10 text-text-muted'/>
            <p className='mt-4 text-sm font-medium text-text-medium'>Trash is empty</p>
            <p className='mt-1 text-xs text-text-muted'>Deleted items appear here for 30 days</p>
          </div>
        ) : (
          <table className='w-full'>
            <thead>
              <tr className='border-b border-border-subtle text-left text-xs font-medium uppercase tracking-wider text-text-muted'>
                <th className='w-10 px-6 py-3'>
                  <input
                    checked={selectedIds.size === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                    type='checkbox'
                  />
                </th>
                <th className='px-3 py-3'>Name</th>
                <th className='px-3 py-3'>Type</th>
                <th className='px-3 py-3'>Project</th>
                <th className='px-3 py-3'>Deleted</th>
                <th className='px-3 py-3'>Days left</th>
                <th className='w-24 px-3 py-3'/>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const days = daysUntilPurge(item.deletedAt)
                return (
                  <tr
                    className='border-b border-border-subtle transition-colors hover:bg-canvas-accent'
                    key={`${item.entityType}-${item.entityId}`}
                  >
                    <td className='px-6 py-3'>
                      <input
                        checked={selectedIds.has(item.entityId)}
                        onChange={() => toggleSelect(item.entityId)}
                        type='checkbox'
                      />
                    </td>
                    <td className='px-3 py-3 text-sm text-text-medium'>
                      {item.title || <span className='italic text-text-muted'>Untitled</span>}
                    </td>
                    <td className='px-3 py-3'>
                      <span className='rounded-md bg-surface-muted px-2 py-0.5 text-xs text-text-muted'>
                        {item.entityType}
                      </span>
                    </td>
                    <td className='px-3 py-3 text-sm text-text-muted'>
                      {item.projectName ?? '—'}
                    </td>
                    <td className='px-3 py-3 text-sm text-text-muted'>
                      {formatRelativeDate(item.deletedAt)}
                    </td>
                    <td className='px-3 py-3'>
                      <span className={`text-sm ${days <= 7 ? 'font-medium text-error' : 'text-text-muted'}`}>
                        {days}d
                      </span>
                    </td>
                    <td className='px-3 py-3'>
                      <button
                        className='rounded-lg p-1.5 text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong'
                        onClick={() => void handleRestore([item])}
                        title='Restore'
                        type='button'
                      >
                        <RotateCcw className='h-4 w-4'/>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
    {confirmDialogProps ? <ConfirmDialog {...confirmDialogProps}/> : null}
    </>
  )
}

export function ArchivePage() {
  const {workspaceSlug} = useParams({strict: false}) as {workspaceSlug: string}
  const {data: workspaces} = useQuery(workspaceSummariesQueryOptions())
  const workspace = workspaces?.flatMap(w => w.projects.length > 0 ? [w] : [w]).find(w => w.slug === workspaceSlug)
  const workspaceId = workspace?.id ?? ''
  const queryClient = useQueryClient()
  const {toast} = useToast()
  const [search, setSearch] = useState('')

  const {data: items = [], isLoading} = useQuery({
    queryFn: () => trashRepository.getWorkspaceArchive(workspaceId),
    queryKey: ['workspace-archive', workspaceId],
  })

  const filtered = search
    ? items.filter(item =>
        item.title.toLowerCase().includes(search.toLowerCase())
        || item.projectName?.toLowerCase().includes(search.toLowerCase()),
      )
    : items

  const invalidateArchive = () =>
    queryClient.invalidateQueries({queryKey: ['workspace-archive', workspaceId]})

  const handleUnarchive = async (entityType: string, entityId: string, title: string) => {
    if (entityType === 'card') {
      await cardRepository.unarchiveCards([entityId])
    }
    await Promise.all([
      invalidateArchive(),
      invalidateAllProjectDataGlobal(queryClient),
    ])
    toast({title: `Unarchived '${title || 'Untitled'}'`})
  }

  return (
    <div className='flex h-full flex-col'>
      {/* Header */}
      <div className='flex items-center justify-between border-b border-border-subtle px-6 py-4'>
        <div>
          <h1 className='font-display text-xl font-semibold text-text-strong'>Archive</h1>
          <p className='mt-1 text-sm text-text-muted'>
            Archived items are kept indefinitely and can be restored anytime
          </p>
        </div>
      </div>

      {/* Search */}
      <div className='border-b border-border-subtle px-6 py-3'>
        <div className='relative max-w-md'>
          <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted'/>
          <input
            className='w-full rounded-xl border border-border-subtle bg-surface-elevated py-2 pl-10 pr-4 text-sm text-text-strong placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'
            onChange={e => setSearch(e.target.value)}
            placeholder='Search archive...'
            type='text'
            value={search}
          />
        </div>
      </div>

      {/* Content */}
      <div className='flex-1 overflow-auto'>
        {isLoading ? (
          <div className='space-y-3 p-6'>
            {[1, 2, 3, 4].map(i => (
              <div className='h-12 animate-pulse rounded-xl bg-surface-muted' key={i}/>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className='flex flex-col items-center justify-center py-24 text-center'>
            <Archive className='h-10 w-10 text-text-muted'/>
            <p className='mt-4 text-sm font-medium text-text-medium'>No archived items</p>
            <p className='mt-1 text-xs text-text-muted'>Items you archive will appear here</p>
          </div>
        ) : (
          <table className='w-full'>
            <thead>
              <tr className='border-b border-border-subtle text-left text-xs font-medium uppercase tracking-wider text-text-muted'>
                <th className='px-6 py-3'>Name</th>
                <th className='px-3 py-3'>Type</th>
                <th className='px-3 py-3'>Project</th>
                <th className='px-3 py-3'>Archived</th>
                <th className='w-24 px-3 py-3'/>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr
                  className='border-b border-border-subtle transition-colors hover:bg-canvas-accent'
                  key={`${item.entityType}-${item.entityId}`}
                >
                  <td className='px-6 py-3 text-sm text-text-medium'>
                    {item.title || <span className='italic text-text-muted'>Untitled</span>}
                  </td>
                  <td className='px-3 py-3'>
                    <span className='rounded-md bg-surface-muted px-2 py-0.5 text-xs text-text-muted'>
                      {item.entityType}
                    </span>
                  </td>
                  <td className='px-3 py-3 text-sm text-text-muted'>
                    {item.projectName ?? '—'}
                  </td>
                  <td className='px-3 py-3 text-sm text-text-muted'>
                    {formatRelativeDate(item.archivedAt)}
                  </td>
                  <td className='px-3 py-3'>
                    <button
                      className='rounded-lg p-1.5 text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong'
                      onClick={() => void handleUnarchive(item.entityType, item.entityId, item.title)}
                      title='Unarchive'
                      type='button'
                    >
                      <RotateCcw className='h-4 w-4'/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
