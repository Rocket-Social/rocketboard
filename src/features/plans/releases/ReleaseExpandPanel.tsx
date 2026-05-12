import {Link2, ListChecks, NotepadText, PanelRightOpen, Rows3, TimerReset} from 'lucide-react'
import {useMemo, useState} from 'react'

import type {ReleaseChecklistItem, ReleaseNoteSection, ReleaseRecord} from '../plan.types'
import {ReleaseChecklistEditor} from './ReleaseChecklistEditor'
import {ReleaseLinkedCardsPanel} from './ReleaseLinkedCardsPanel'
import {ReleaseLinkedSprintsPanel} from './ReleaseLinkedSprintsPanel'
import {ReleaseNotesEditor} from './ReleaseNotesEditor'
import {ReleaseRetroPanel} from './ReleaseRetroPanel'

type ReleaseExpandPanelProps = {
  onOpenDetail: () => void
  onSaveChecklist: (checklistItems: ReleaseChecklistItem[]) => Promise<void>
  onSaveNotes: (noteSections: ReleaseNoteSection[]) => Promise<void>
  onSaveRetro: (input: {
    abVariations: string | null
    releaseNotes: string | null
    retroNotes: string | null
    retroUrl: string | null
  }) => Promise<void>
  planViewId: string
  release: ReleaseRecord
  showOpenDetailButton?: boolean
  workspaceId: string
}

type TabId = 'cards' | 'checklist' | 'notes' | 'retro' | 'sprints'

export function ReleaseExpandPanel({
  onOpenDetail,
  onSaveChecklist,
  onSaveNotes,
  onSaveRetro,
  planViewId,
  release,
  showOpenDetailButton = true,
  workspaceId,
}: ReleaseExpandPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('notes')

  const tabs = useMemo(() => [
    {icon: NotepadText, id: 'notes' as const, label: 'Change Notes', meta: `${release.noteSections.length}`},
    {icon: Link2, id: 'cards' as const, label: 'Linked Cards', meta: `${release.linkedCardCount}`},
    {icon: Rows3, id: 'sprints' as const, label: 'Linked Sprints', meta: `${release.linkedSprintCount}`},
    {icon: ListChecks, id: 'checklist' as const, label: 'Checklist', meta: `${release.checklistCompletedCount}/${release.checklistTotalCount}`},
    {icon: TimerReset, id: 'retro' as const, label: 'Retro', meta: release.retroUrl ? 'linked' : 'notes'},
  ], [release.checklistCompletedCount, release.checklistTotalCount, release.linkedCardCount, release.linkedSprintCount, release.noteSections.length, release.retroUrl])

  return (
    <div className='border-t border-border-subtle bg-surface-base px-4 py-4'>
      <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
        <div className='flex flex-wrap items-center gap-2'>
          {tabs.map((tab) => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'border-primary/20 bg-primary/10 text-primary'
                    : 'border-border-subtle bg-surface-base text-text-muted hover:text-text-strong'
                }`}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                type='button'
              >
                <Icon className='h-3.5 w-3.5'/>
                {tab.label}
                <span className='rounded-full bg-canvas-accent px-1.5 py-0.5 font-mono text-[10px] text-text-muted'>{tab.meta}</span>
              </button>
            )
          })}
        </div>

        {showOpenDetailButton ? (
          <button
            className='inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-base px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text-strong'
            onClick={onOpenDetail}
            type='button'
          >
            <PanelRightOpen className='h-3.5 w-3.5'/>
            Open detail
          </button>
        ) : null}
      </div>

      {activeTab === 'notes' ? (
        <ReleaseNotesEditor onSave={onSaveNotes} sections={release.noteSections}/>
      ) : null}

      {activeTab === 'cards' ? (
        <ReleaseLinkedCardsPanel
          planViewId={planViewId}
          releaseId={release.id}
          workspaceId={workspaceId}
        />
      ) : null}

      {activeTab === 'sprints' ? (
        <ReleaseLinkedSprintsPanel
          planViewId={planViewId}
          releaseId={release.id}
          workspaceId={workspaceId}
        />
      ) : null}

      {activeTab === 'checklist' ? (
        <ReleaseChecklistEditor items={release.checklistItems} onSave={onSaveChecklist}/>
      ) : null}

      {activeTab === 'retro' ? (
        <ReleaseRetroPanel
          abVariations={release.abVariations}
          onSave={onSaveRetro}
          releaseNotes={release.releaseNotes}
          retroNotes={release.retroNotes}
          retroUrl={release.retroUrl}
        />
      ) : null}
    </div>
  )
}
