import {Users} from 'lucide-react'

import type {Mode} from '../../../app/mode'
import type {ProjectAccessSnapshot} from '../../access/access.types'
import {ProjectAccessSection} from '../../access/ProjectAccessSection'
import type {CardRecord, ProjectPriorityOption, ProjectStatusOption} from '../../cards/card.types'
import type {OverviewWidgetConfig, OverviewWidgetWidth} from '../../projects/project-view.types'
import {WidgetGrid} from './widgets/WidgetGrid'

type DateRange = {endDate: string; startDate: string}

type OverviewViewProps = {
  priorityOptions?: ProjectPriorityOption[]
  canEditProject?: boolean
  canManageProject?: boolean
  cards: CardRecord[]
  currentUserId?: string
  dateRange?: DateRange | null
  hasVisibleTaskBoardView?: boolean
  isEditMode: boolean
  isLoading?: boolean
  mode: Mode
  organizationId?: string
  onAddWidget?: (type: import('../../projects/project-view.types').OverviewWidgetType) => void
  onClickAssignee?: (userId: string) => void
  onClickTask?: (taskId: string) => void
  onInvite?: () => void
  onRemoveMember?: (userId: string) => void
  onRemoveWidget: (id: string) => void
  onRenameWidget: (id: string, title: string | null) => void
  onReorderWidgets: (widgets: OverviewWidgetConfig[]) => void
  onResizeWidget: (id: string, width: OverviewWidgetWidth) => void
  onSetMemberRole?: (userId: string, role: 'admin' | 'member') => void
  projectMembers?: import('../../access/access.types').ProjectMember[]
  projectAccessSnapshot?: ProjectAccessSnapshot | null
  projectId?: string
  projectName?: string
  statusOptions: ProjectStatusOption[]
  widgets: OverviewWidgetConfig[]
  workspaceId?: string
  workspaceName?: string
}

export function OverviewView({
  priorityOptions,
  canEditProject: _canEditProject = false,
  cards,
  currentUserId,
  dateRange,
  hasVisibleTaskBoardView = true,
  isEditMode,
  isLoading = false,
  mode,
  organizationId: _organizationId = '',
  onAddWidget,
  onClickAssignee,
  onClickTask,
  onInvite: _onInvite,
  onRemoveMember: _onRemoveMember,
  onRemoveWidget,
  onRenameWidget,
  onReorderWidgets,
  onResizeWidget,
  onSetMemberRole: _onSetMemberRole,
  projectAccessSnapshot = null,
  projectId = '',
  projectName = '',
  statusOptions,
  widgets,
  workspaceId = '',
  workspaceName = '',
}: OverviewViewProps) {
  return (
    <div className='space-y-6'>
      {hasVisibleTaskBoardView ? (
        <WidgetGrid
          cards={cards}
          dateRange={dateRange}
          isEditMode={isEditMode}
          isLoading={isLoading}
          onAddWidget={onAddWidget}
          mode={mode}
          onClickAssignee={onClickAssignee}
          onClickTask={onClickTask}
          onRemoveWidget={onRemoveWidget}
          onRenameWidget={onRenameWidget}
          onReorderWidgets={onReorderWidgets}
          onResizeWidget={onResizeWidget}
          priorityOptions={priorityOptions}
          statusOptions={statusOptions}
          widgets={widgets}
        />
      ) : null}

      {projectAccessSnapshot ? (
        <ProjectAccessSection
          currentUserId={currentUserId ?? ''}
          projectId={projectId}
          projectName={projectName}
          snapshot={projectAccessSnapshot}
          workspaceId={workspaceId}
          workspaceName={workspaceName}
        />
      ) : (
        <div className='rounded-2xl border border-border-subtle bg-surface-elevated p-5 shadow-panel'>
          <div className='flex items-center gap-2'>
            <Users className='h-4 w-4 text-text-muted'/>
            <h3 className='font-display text-base font-semibold text-text-strong'>Project Access</h3>
          </div>
          <p className='mt-3 text-sm text-text-muted'>Loading project access…</p>
        </div>
      )}
    </div>
  )
}
