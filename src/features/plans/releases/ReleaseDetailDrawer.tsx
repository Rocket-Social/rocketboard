import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '../../../components/ui/dialog'
import type {ReleaseChecklistItem, ReleaseNoteSection, ReleaseRecord} from '../plan.types'
import {formatReleaseChecklistProgress, formatReleaseDate, formatReleaseDrift} from './release-utils'
import {ReleaseExpandPanel} from './ReleaseExpandPanel'

type ReleaseDetailDrawerProps = {
  onClose: () => void
  onSaveChecklist: (releaseId: string, checklistItems: ReleaseChecklistItem[]) => Promise<void>
  onSaveNotes: (releaseId: string, noteSections: ReleaseNoteSection[]) => Promise<void>
  onSaveRetro: (
    releaseId: string,
    input: {
      abVariations: string | null
      releaseNotes: string | null
      retroNotes: string | null
      retroUrl: string | null
    },
  ) => Promise<void>
  planViewId: string
  release: ReleaseRecord
  workspaceId: string
}

export function ReleaseDetailDrawer({
  onClose,
  onSaveChecklist,
  onSaveNotes,
  onSaveRetro,
  planViewId,
  release,
  workspaceId,
}: ReleaseDetailDrawerProps) {
  const drift = formatReleaseDrift(release)

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className='fixed left-auto right-0 top-0 flex h-full w-[min(48rem,100vw)] translate-x-0 translate-y-0 flex-col rounded-none border-l bg-surface-base p-0'>
        <DialogHeader className='flex-row items-start justify-between gap-4 px-6 py-5 pr-14'>
          <div className='min-w-0'>
            <p className='font-mono text-xs uppercase tracking-[0.24em] text-text-muted'>Release Detail</p>
            <DialogTitle className='mt-1 truncate font-display text-2xl'>{release.name}</DialogTitle>
            <DialogDescription className='sr-only'>Release build, schedule, and checklist details.</DialogDescription>
            <div className='mt-3 flex flex-wrap gap-2'>
              <span className='rounded-full bg-canvas-accent px-2.5 py-1 font-mono text-[11px] text-text-muted'>Build {release.buildNumber ?? '—'}</span>
              <span className='rounded-full bg-canvas-accent px-2.5 py-1 font-mono text-[11px] text-text-muted'>Planned {formatReleaseDate(release.plannedDate)}</span>
              <span className='rounded-full bg-canvas-accent px-2.5 py-1 font-mono text-[11px] text-text-muted'>Actual {formatReleaseDate(release.actualDate)}</span>
              <span className='rounded-full bg-canvas-accent px-2.5 py-1 font-mono text-[11px] text-text-muted'>{drift.label}</span>
              <span className='rounded-full bg-canvas-accent px-2.5 py-1 font-mono text-[11px] text-text-muted'>Checklist {formatReleaseChecklistProgress(release)}</span>
            </div>
          </div>
        </DialogHeader>

        <div className='flex-1 overflow-y-auto px-6 py-5'>
          <ReleaseExpandPanel
            onOpenDetail={onClose}
            onSaveChecklist={(checklistItems) => onSaveChecklist(release.id, checklistItems)}
            onSaveNotes={(noteSections) => onSaveNotes(release.id, noteSections)}
            onSaveRetro={(input) => onSaveRetro(release.id, input)}
            planViewId={planViewId}
            release={release}
            showOpenDetailButton={false}
            workspaceId={workspaceId}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
