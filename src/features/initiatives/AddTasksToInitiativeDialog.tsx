import {useQuery, useQueryClient} from '@tanstack/react-query'
import {Check, Search, X} from 'lucide-react'
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'

import {Button} from '../../components/ui/button'
import {Dialog, DialogContent, DialogDescription, DialogTitle} from '../../components/ui/dialog'
import {initiativePickerCardsQueryOptions, invalidateInitiativeAffectedProjects} from './initiative.queries'
import {initiativeRepository} from './initiative.repository'
import type {InitiativePickerCard} from './initiative.types'

type AddTasksToInitiativeDialogProps = {
  initiativeId: string
  onClose: () => void
  onTasksAdded: () => void
  workspaceId: string
}

type ProjectGroup = {
  cards: InitiativePickerCard[]
  projectId: string
  projectName: string
}

function statusBadgeClasses(category: string) {
  switch (category) {
    case 'started':
      return 'bg-primary/10 text-primary border-primary/20'
    case 'completed':
      return 'bg-success/10 text-success border-success/20'
    default:
      return 'bg-surface-muted text-text-medium border-border-subtle'
  }
}

export function AddTasksToInitiativeDialog({
  initiativeId,
  onClose,
  onTasksAdded,
  workspaceId,
}: AddTasksToInitiativeDialogProps) {
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const taskListRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Fetch ALL cards across workspace
  const pickerQuery = useQuery(initiativePickerCardsQueryOptions(workspaceId, initiativeId))
  const allCards = pickerQuery.data ?? []

  // Group by project, filter by search
  const projectGroups = useMemo(() => {
    const map = new Map<string, ProjectGroup>()
    for (const card of allCards) {
      if (searchTerm && !card.title.toLowerCase().includes(searchTerm.toLowerCase())) continue
      const existing = map.get(card.projectId) ?? {cards: [], projectId: card.projectId, projectName: card.projectName}
      existing.cards.push(card)
      map.set(card.projectId, existing)
    }
    return [...map.values()].sort((a, b) => a.projectName.localeCompare(b.projectName))
  }, [allCards, searchTerm])

  // Split cards into assignable vs already-on-this-initiative
  const getAssignable = (cards: InitiativePickerCard[]) => cards.filter((c) => c.initiativeId !== initiativeId)
  const getAlreadyAdded = (cards: InitiativePickerCard[]) => cards.filter((c) => c.initiativeId === initiativeId)

  const totalAssignable = projectGroups.reduce((sum, g) => sum + getAssignable(g.cards).length, 0)

  // Auto-focus search
  useEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  // Scroll-spy: track which project section is in view
  useEffect(() => {
    if (!taskListRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('data-project-id')
            if (id) setActiveProjectId(id)
          }
        }
      },
      {root: taskListRef.current, rootMargin: '-20% 0px -60% 0px', threshold: 0},
    )
    for (const [, el] of sectionRefs.current) {
      observer.observe(el)
    }
    return () => observer.disconnect()
  }, [projectGroups])

  const scrollToProject = useCallback((projectId: string) => {
    const el = sectionRefs.current.get(projectId)
    el?.scrollIntoView({behavior: 'smooth', block: 'start'})
  }, [])

  const toggleCard = (cardId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }

  const toggleRemove = (cardId: string) => {
    setRemovedIds((prev) => {
      const next = new Set(prev)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }

  const toggleAllInProject = (cards: InitiativePickerCard[]) => {
    const assignable = getAssignable(cards)
    const allSelected = assignable.every((c) => selectedIds.has(c.cardId))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const card of assignable) {
        if (allSelected) next.delete(card.cardId)
        else next.add(card.cardId)
      }
      return next
    })
  }

  const handleSubmit = async () => {
    if ((selectedIds.size === 0 && removedIds.size === 0) || submitting) return
    setSubmitting(true)
    try {
      const affectedCardIds = new Set([...selectedIds, ...removedIds])
      const affectedProjectIds = allCards
        .filter((card) => affectedCardIds.has(card.cardId))
        .map((card) => card.projectId)

      for (const cardId of selectedIds) {
        await initiativeRepository.setCardInitiative(cardId, initiativeId)
      }
      for (const cardId of removedIds) {
        await initiativeRepository.setCardInitiative(cardId, null)
      }
      await Promise.all([
        queryClient.invalidateQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) && (
              query.queryKey[0] === 'initiative-cards'
              || query.queryKey[0] === 'initiative-picker-cards'
              || query.queryKey[0] === 'workspace-initiatives'
              || query.queryKey[0] === 'workspace-initiative-summaries'
            ),
        }),
        invalidateInitiativeAffectedProjects(queryClient, affectedProjectIds),
      ])
      onTasksAdded()
      onClose()
    } catch (error) {
      console.error('[add-tasks-to-initiative] Failed:', error)
      setSubmitting(false)
    }
  }

  const setSectionRef = useCallback((projectId: string, el: HTMLDivElement | null) => {
    if (el) sectionRefs.current.set(projectId, el)
    else sectionRefs.current.delete(projectId)
  }, [])

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent
        className='inset-4 left-4 top-4 flex h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] translate-x-0 translate-y-0 flex-col overflow-hidden rounded-2xl p-0 md:inset-6 md:left-6 md:top-6 md:h-[calc(100vh-3rem)] md:w-[calc(100vw-3rem)] md:max-w-[calc(100vw-3rem)] lg:inset-10 lg:left-10 lg:top-10 lg:h-[calc(100vh-5rem)] lg:w-[calc(100vw-5rem)] lg:max-w-[calc(100vw-5rem)]'
        showCloseButton={false}
      >
        <div className='flex items-center justify-between border-b border-border-subtle px-6 py-4'>
          <DialogTitle className='text-lg'>Add Tasks to Initiative</DialogTitle>
          <DialogDescription className='sr-only'>Select cards from workspace projects to assign to or remove from this initiative.</DialogDescription>
          <div className='flex items-center gap-3'>
            {selectedIds.size > 0 ? (
              <span className='rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary'>
                {selectedIds.size} selected
              </span>
            ) : null}
            <button className='rounded-lg p-1.5 text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-medium' onClick={onClose} type='button'>
              <X className='h-5 w-5'/>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className='border-b border-border-subtle px-6 py-3'>
          <div className='relative'>
            <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted'/>
            <input
              ref={searchInputRef}
              className='h-10 w-full rounded-xl border border-border-subtle bg-canvas-accent pl-10 pr-4 text-sm text-text-strong outline-none transition-all placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary-soft'
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder='Search across all projects...'
              value={searchTerm}
            />
          </div>
        </div>

        {/* Body: rail + task list */}
        <div className='flex flex-1 overflow-hidden'>
          {/* Project rail */}
          <div className='hidden w-[200px] shrink-0 overflow-y-auto border-r border-border-subtle py-3 md:block'>
            <button
              className={`flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors ${
                !activeProjectId ? 'border-l-2 border-primary bg-canvas-accent font-medium text-text-strong' : 'text-text-medium hover:bg-canvas-accent'
              }`}
              onClick={() => taskListRef.current?.scrollTo({top: 0, behavior: 'smooth'})}
              type='button'
            >
              All Projects
              <span className='ml-auto text-xs text-text-muted'>{totalAssignable}</span>
            </button>
            {projectGroups.map((group) => {
              const assignableCount = getAssignable(group.cards).length
              return (
                <button
                  className={`flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors ${
                    activeProjectId === group.projectId ? 'border-l-2 border-primary bg-canvas-accent font-medium text-text-strong' : 'text-text-medium hover:bg-canvas-accent'
                  }`}
                  key={group.projectId}
                  onClick={() => scrollToProject(group.projectId)}
                  type='button'
                >
                  <span className='min-w-0 flex-1 truncate text-left'>{group.projectName}</span>
                  <span className='shrink-0 text-xs text-text-muted'>{assignableCount}</span>
                </button>
              )
            })}
          </div>

          {/* Task list */}
          <div className='flex-1 overflow-y-auto' ref={taskListRef}>
            {pickerQuery.isPending ? (
              <div className='space-y-6 p-6'>
                {[1, 2, 3].map((i) => (
                  <div key={i}>
                    <div className='mb-2 h-4 w-32 animate-pulse rounded bg-surface-muted'/>
                    <div className='space-y-1'>
                      {[1, 2, 3].map((j) => (
                        <div className='h-11 animate-pulse rounded-lg bg-surface-muted' key={j}/>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : projectGroups.length === 0 ? (
              <div className='flex h-full items-center justify-center p-6'>
                <div className='text-center'>
                  <p className='text-sm text-text-muted'>
                    {searchTerm ? `No tasks matching "${searchTerm}"` : 'All tasks are already assigned to initiatives.'}
                  </p>
                  {searchTerm ? (
                    <button className='mt-2 text-sm text-primary hover:underline' onClick={() => setSearchTerm('')} type='button'>
                      Clear search
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className='p-4 md:p-6'>
                {projectGroups.map((group) => {
                  const assignable = getAssignable(group.cards)
                  const alreadyAdded = getAlreadyAdded(group.cards)
                  const allSelected = assignable.length > 0 && assignable.every((c) => selectedIds.has(c.cardId))

                  return (
                    <div
                      className='mb-6 last:mb-0'
                      data-project-id={group.projectId}
                      key={group.projectId}
                      ref={(el) => setSectionRef(group.projectId, el)}
                    >
                      {/* Section header */}
                      <div className='mb-2 flex items-center justify-between'>
                        <span className='text-xs font-medium uppercase tracking-wider text-text-muted'>
                          {group.projectName} ({assignable.length})
                        </span>
                        {assignable.length > 0 ? (
                          <button
                            className='text-xs text-primary hover:underline'
                            onClick={() => toggleAllInProject(group.cards)}
                            type='button'
                          >
                            {allSelected ? 'Deselect all' : 'Select all'}
                          </button>
                        ) : null}
                      </div>

                      {/* Assignable cards */}
                      <div className='space-y-0.5'>
                        {assignable.map((card) => {
                          const isSelected = selectedIds.has(card.cardId)
                          return (
                            <button
                              aria-label={`Select ${card.title}`}
                              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                                isSelected ? 'bg-primary/5' : 'hover:bg-canvas-accent'
                              }`}
                              key={card.cardId}
                              onClick={() => toggleCard(card.cardId)}
                              type='button'
                            >
                              <span className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-colors ${
                                isSelected ? 'border-primary bg-primary text-white' : 'border-border-subtle'
                              }`}>
                                {isSelected ? <Check className='h-3 w-3'/> : null}
                              </span>
                              <span className='min-w-0 flex-1 truncate text-text-strong'>{card.title}</span>
                              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusBadgeClasses(card.statusCategory)}`}>
                                {card.statusLabel}
                              </span>
                              {card.assigneeName !== 'Unassigned' ? (
                                <span className='shrink-0 text-xs text-text-muted'>{card.assigneeName}</span>
                              ) : null}
                            </button>
                          )
                        })}
                      </div>

                      {/* Already added cards (clickable to remove) */}
                      {alreadyAdded.length > 0 ? (
                        <>
                          <div className='my-2 h-px bg-border-subtle'/>
                          <div className='space-y-0.5'>
                            {alreadyAdded.map((card) => {
                              const isMarkedForRemoval = removedIds.has(card.cardId)
                              return (
                                <button
                                  aria-label={`${isMarkedForRemoval ? 'Keep' : 'Remove'} ${card.title}`}
                                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                                    isMarkedForRemoval ? 'bg-error/5' : 'opacity-60 hover:opacity-100 hover:bg-canvas-accent'
                                  }`}
                                  key={card.cardId}
                                  onClick={() => toggleRemove(card.cardId)}
                                  type='button'
                                >
                                  <span className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border ${
                                    isMarkedForRemoval ? 'border-error bg-error text-white' : 'border-border-subtle bg-surface-muted'
                                  }`}>
                                    {isMarkedForRemoval ? <X className='h-3 w-3'/> : <Check className='h-3 w-3 text-text-muted'/>}
                                  </span>
                                  <span className={`min-w-0 flex-1 truncate ${isMarkedForRemoval ? 'text-error line-through' : 'text-text-muted'}`}>
                                    {card.title}
                                  </span>
                                  <span className={`text-[10px] ${isMarkedForRemoval ? 'font-medium text-error' : 'text-text-muted'}`}>
                                    {isMarkedForRemoval ? 'Will remove' : 'Added'}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        </>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className='flex items-center justify-between border-t border-border-subtle px-6 py-3'>
          <span className='text-sm text-text-muted'>
            {selectedIds.size > 0 && removedIds.size > 0
              ? `${selectedIds.size} to add, ${removedIds.size} to remove`
              : selectedIds.size > 0
                ? `${selectedIds.size} task${selectedIds.size === 1 ? '' : 's'} to add`
                : removedIds.size > 0
                  ? `${removedIds.size} task${removedIds.size === 1 ? '' : 's'} to remove`
                  : 'Select tasks to add or remove'}
          </span>
          <div className='flex gap-2'>
            <Button onClick={onClose} variant='secondary'>Cancel</Button>
            <Button
              disabled={(selectedIds.size === 0 && removedIds.size === 0) || submitting}
              onClick={() => void handleSubmit()}
              variant='primary'
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
