import {useQuery} from '@tanstack/react-query'
import {useNavigate, useParams} from '@tanstack/react-router'
import {ArrowLeft, ChevronDown, ChevronRight, Plus} from 'lucide-react'
import {useMemo, useState} from 'react'

import {Button} from '../../components/ui/button'
import {useSignedInAppFrame} from '../shell/SignedInAppFrame'
import {AddTasksToInitiativeDialog} from './AddTasksToInitiativeDialog'
import {
  initiativeCardsQueryOptions,
  initiativeUpdatesQueryOptions,
  usePostInitiativeUpdateMutation,
  workspaceInitiativesQueryOptions,
} from './initiative.queries'
import type {InitiativeCardRecord, InitiativeHealth, InitiativeUpdateRecord} from './initiative.types'
import {HealthPopover, healthColors} from './components/HealthPopover'
import {StatusPopover} from './components/StatusPopover'
import {workspaceInitiativesRoutePath} from '../shell/route-helpers'

import {healthLabels} from './components/HealthPopover'

function statusBadgeClasses(status: string) {
  switch (status) {
    case 'active': case 'started':
      return 'bg-primary/10 text-primary border-primary/20'
    case 'completed':
      return 'bg-success/10 text-success border-success/20'
    case 'paused':
      return 'bg-warning/10 text-warning border-warning/20'
    default:
      return 'bg-surface-muted text-text-medium border-border-subtle'
  }
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})
}

// ─── Post Update Form ────────────────────────────────────────────

function PostUpdateForm({currentHealth, initiativeId}: {currentHealth: InitiativeHealth; initiativeId: string}) {
  const [bodyText, setBodyText] = useState('')
  const [health, setHealth] = useState<InitiativeHealth>(currentHealth)
  const postMutation = usePostInitiativeUpdateMutation()

  const handlePost = async () => {
    if (!bodyText.trim() || postMutation.isPending) return
    await postMutation.mutateAsync({bodyText: bodyText.trim(), health, initiativeId})
    setBodyText('')
  }

  return (
    <div className='rounded-2xl border border-border-subtle bg-surface-elevated p-4 shadow-panel'>
      <label className='mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted'>Post Update</label>
      <textarea
        className='mb-3 h-20 w-full resize-none rounded-xl border border-border-subtle bg-surface-base px-3 py-2 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
        onChange={(e) => setBodyText(e.target.value)}
        placeholder='Write a status update...'
        value={bodyText}
      />
      <div className='flex items-center justify-between'>
        <select
          className='h-9 rounded-lg border border-border-subtle bg-surface-elevated px-3 text-sm text-text-strong outline-none transition-all focus:border-primary'
          onChange={(e) => setHealth(e.target.value as InitiativeHealth)}
          value={health}
        >
          <option value='on_track'>● On Track</option>
          <option value='at_risk'>● At Risk</option>
          <option value='off_track'>● Off Track</option>
        </select>
        <Button disabled={!bodyText.trim() || postMutation.isPending} onClick={() => void handlePost()} size='compact' variant='primary'>
          {postMutation.isPending ? 'Posting...' : 'Post'}
        </Button>
      </div>
    </div>
  )
}

// ─── Cards By Project Section ────────────────────────────────────

function ProjectCardSection({cards, projectName}: {cards: InitiativeCardRecord[]; projectName: string}) {
  const [expanded, setExpanded] = useState(true)
  const doneCount = cards.filter((c) => c.statusCategory === 'completed').length

  return (
    <div className='rounded-2xl border border-border-subtle bg-surface-elevated shadow-panel'>
      <button
        className='flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-canvas-accent'
        onClick={() => setExpanded(!expanded)}
        type='button'
      >
        {expanded ? <ChevronDown className='h-4 w-4 text-text-muted'/> : <ChevronRight className='h-4 w-4 text-text-muted'/>}
        <span className='flex-1 text-sm font-medium text-text-strong'>{projectName}</span>
        <span className='text-xs text-text-muted'>{doneCount}/{cards.length} done</span>
      </button>
      {expanded ? (
        <div className='border-t border-border-subtle'>
          {cards.map((card) => (
            <div className='flex items-center gap-3 border-b border-border-subtle px-5 py-2.5 last:border-b-0' key={card.cardId}>
              <span className={`min-w-0 flex-1 truncate text-sm ${card.statusCategory === 'completed' ? 'text-text-muted line-through' : 'text-text-strong'}`}>
                {card.title}
              </span>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusBadgeClasses(card.statusCategory)}`}>
                {card.statusLabel}
              </span>
              {card.assigneeName !== 'Unassigned' ? (
                <span className='shrink-0 text-xs text-text-muted'>{card.assigneeName}</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// ─── Update Timeline ─────────────────────────────────────────────

function UpdateTimeline({updates}: {updates: InitiativeUpdateRecord[]}) {
  if (updates.length === 0) return null
  return (
    <div>
      <h3 className='mb-3 text-xs font-medium uppercase tracking-wider text-text-muted'>Update History</h3>
      <div className='space-y-3'>
        {updates.map((update) => (
          <div className='rounded-xl border border-border-subtle bg-surface-base px-4 py-3' key={update.id}>
            <div className='mb-1.5 flex items-center gap-2 text-xs text-text-muted'>
              <span>{formatDateTime(update.createdAt)}</span>
              <span>·</span>
              <span>{update.authorName}</span>
              {update.healthSnapshot ? (
                <>
                  <span>·</span>
                  <span className='inline-block h-2 w-2 rounded-full' style={{backgroundColor: healthColors[update.healthSnapshot]}}/>
                  <span>{healthLabels[update.healthSnapshot]}</span>
                </>
              ) : null}
            </div>
            <p className='text-sm text-text-medium'>{update.bodyText}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Detail Page ────────────────────────────────────────────

export function InitiativeDetailPage() {
  const navigate = useNavigate()
  const {initiativeId, orgSlug, workspaceSlug} = useParams({strict: false}) as {initiativeId: string; orgSlug: string; workspaceSlug: string}

  const {workspaces} = useSignedInAppFrame()
  const workspace = workspaces.find((w) => w.organizationSlug === orgSlug && w.slug === workspaceSlug)
  const workspaceId = workspace?.id ?? ''

  // Get the initiative record from workspace initiatives query (usually cached)
  const initiativesQuery = useQuery({...workspaceInitiativesQueryOptions(workspaceId), enabled: Boolean(workspaceId)})
  const initiative = initiativesQuery.data?.find((i) => i.id === initiativeId)

  const [showTaskPicker, setShowTaskPicker] = useState(false)
  const cardsQuery = useQuery(initiativeCardsQueryOptions(initiativeId))
  const updatesQuery = useQuery(initiativeUpdatesQueryOptions(initiativeId))

  const cards = cardsQuery.data ?? []
  const updates = updatesQuery.data ?? []

  const cardsByProject = useMemo(() => {
    const map = new Map<string, {cards: InitiativeCardRecord[]; projectName: string}>()
    for (const card of cards) {
      const existing = map.get(card.projectId) ?? {cards: [], projectName: card.projectName}
      existing.cards.push(card)
      map.set(card.projectId, existing)
    }
    return [...map.values()].sort((a, b) => a.projectName.localeCompare(b.projectName))
  }, [cards])

  const totalCards = cards.length
  const doneCards = cards.filter((c) => c.statusCategory === 'completed').length
  const projectCount = new Set(cards.map((c) => c.projectId)).size

  return (
    <div className='px-8 py-8'>
      {/* Breadcrumb */}
      <button
        className='mb-6 inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-medium'
        onClick={() => void navigate({params: {orgSlug, workspaceSlug}, to: workspaceInitiativesRoutePath})}
        type='button'
      >
        <ArrowLeft className='h-4 w-4'/>
        Back to Initiatives
      </button>

      {/* Header */}
      <div className='mb-6'>
        <div className='flex items-center gap-3'>
          {initiative ? (
            <HealthPopover health={initiative.health} initiativeId={initiativeId}/>
          ) : null}
          <h1 className='font-display text-xl font-semibold text-text-strong'>
            {initiative?.name ?? 'Loading...'}
          </h1>
          {initiative ? (
            <StatusPopover initiativeId={initiativeId} status={initiative.status}/>
          ) : null}
        </div>
        <p className='mt-1.5 text-sm text-text-muted'>
          {initiative?.leadName ? `Lead: ${initiative.leadName} · ` : ''}
          {totalCards} tasks across {projectCount} {projectCount === 1 ? 'project' : 'projects'}
          {' · '}{doneCards}/{totalCards} completed
          {initiative?.targetDate ? ` · Target: ${formatDateTime(initiative.targetDate)}` : ''}
        </p>
        {initiative?.description ? (
          <p className='mt-2 text-sm text-text-medium'>{initiative.description}</p>
        ) : null}
      </div>

      {/* Post Update + Summary */}
      <div className='mb-6 grid gap-4 lg:grid-cols-3'>
        <div className='lg:col-span-2'>
          <PostUpdateForm
            currentHealth={initiative?.health ?? 'on_track'}
            initiativeId={initiativeId}
          />
        </div>
        <div className='rounded-2xl border border-border-subtle bg-surface-elevated p-4 shadow-panel'>
          <h4 className='mb-3 text-xs font-medium uppercase tracking-wider text-text-muted'>Summary</h4>
          <div className='space-y-2.5'>
            <div className='flex items-center justify-between'>
              <span className='text-sm text-text-medium'>Progress</span>
              <span className='text-sm font-medium text-text-strong'>{doneCards}/{totalCards} done</span>
            </div>
            {totalCards > 0 ? (
              <div className='flex h-2 w-full overflow-hidden rounded-full bg-border-subtle/30'>
                {doneCards > 0 ? (
                  <div className='rounded-full bg-success' style={{width: `${(doneCards / totalCards) * 100}%`}}/>
                ) : null}
              </div>
            ) : null}
            <div className='flex items-center justify-between'>
              <span className='text-sm text-text-medium'>Projects</span>
              <span className='text-sm font-medium text-text-strong'>{projectCount}</span>
            </div>
            <div className='flex items-center justify-between'>
              <span className='text-sm text-text-medium'>Target</span>
              <span className='text-sm font-medium text-text-strong'>
                {initiative?.targetDate ? new Date(initiative.targetDate).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Cards by Project */}
      <div className='mb-8 space-y-3'>
        <div className='flex items-center justify-between'>
          <h3 className='text-xs font-medium uppercase tracking-wider text-text-muted'>Tasks by Project</h3>
          <Button onClick={() => setShowTaskPicker(true)} size='compact' variant='secondary'>
            <Plus className='h-3.5 w-3.5'/>
            Add Tasks
          </Button>
        </div>
        {cardsByProject.length > 0 ? (
          cardsByProject.map((group) => (
            <ProjectCardSection cards={group.cards} key={group.projectName} projectName={group.projectName}/>
          ))
        ) : (
          <div className='rounded-2xl border border-dashed border-border-subtle px-4 py-8 text-center text-sm text-text-muted'>
            No tasks assigned yet. Assign tasks from any project's table view or card detail sheet.
          </div>
        )}
      </div>

      {/* Update Timeline */}
      <UpdateTimeline updates={updates}/>

      {showTaskPicker && workspaceId ? (
        <AddTasksToInitiativeDialog
          initiativeId={initiativeId}
          onClose={() => setShowTaskPicker(false)}
          onTasksAdded={() => void cardsQuery.refetch()}
          workspaceId={workspaceId}
        />
      ) : null}
    </div>
  )
}
