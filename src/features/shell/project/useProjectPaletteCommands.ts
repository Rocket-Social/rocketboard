import {Folder, Lock, Plus, Settings, Users} from 'lucide-react'
import {useMemo} from 'react'

import {useToast} from '../../../components/ui/toast'
import type {OrganizationRole} from '../../access/access.types'
import type {WorkspaceProjectSummary, WorkspaceSummary} from '../../projects/project-shell.types'
import type {WorkspacePaletteCommand} from '../../search/WorkspaceCommandPalette'

type ToastFn = ReturnType<typeof useToast>['toast']

/**
 * Returns the top-level palette actions available to the project shell.
 * Keeping this out of the layout lets the layout stay thin and lets us
 * add/remove commands without touching the render path.
 */
export function useProjectPaletteCommands({
  canEditProject,
  canCreateWorkspace,
  currentOrgRole,
  resolvedProject,
  workspace,
  toast,
  openCardComposer,
  openProjectAccess,
  openProjectComposer,
  openWorkspaceComposer,
  setIsFieldManagerOpen,
}: {
  canEditProject: boolean
  canCreateWorkspace: boolean
  currentOrgRole: OrganizationRole | null
  resolvedProject: WorkspaceProjectSummary | null
  workspace: WorkspaceSummary | undefined
  toast: ToastFn
  openCardComposer: () => void | Promise<unknown>
  openProjectAccess: () => boolean
  openProjectComposer: () => Promise<boolean>
  openWorkspaceComposer: () => Promise<boolean>
  setIsFieldManagerOpen: (open: boolean) => void
}): WorkspacePaletteCommand[] {
  return useMemo<WorkspacePaletteCommand[]>(
    () => [
      {
        description: 'Open a new task composer in the current project.',
        icon: Plus,
        id: 'action-create-task',
        keywords: ['new card', 'task'],
        label: 'Create task',
        meta: resolvedProject?.name,
        onSelect: () => {
          if (!canEditProject) {
            toast({
              title: 'Guest access is view only',
              description:
                'Ask an organization admin to upgrade your organization role if you need to create or edit tasks.',
              variant: 'error',
            })
            return true
          }

          void openCardComposer()
          return true
        },
      },
      {
        description:
          'Open the canonical project access surface on the Overview board.',
        icon: currentOrgRole === 'guest' ? Lock : Users,
        id: 'action-open-project-access',
        keywords: ['access', 'invite', 'members', 'permissions'],
        label: 'Open project access',
        meta: resolvedProject?.name,
        onSelect: openProjectAccess,
      },
      {
        description: 'Create another project inside the current workspace.',
        icon: Plus,
        id: 'action-create-project',
        keywords: ['new project', 'board', 'document'],
        label: 'Create project',
        meta: workspace?.name,
        onSelect: openProjectComposer,
      },
      ...(canCreateWorkspace
        ? [{
            description: 'Create a fresh workspace in the current organization.',
            icon: Folder,
            id: 'action-create-workspace',
            keywords: ['new workspace', 'bootstrap'],
            label: 'Create workspace',
            onSelect: openWorkspaceComposer,
          } satisfies WorkspacePaletteCommand]
        : []),
      {
        description: 'Manage custom fields and table-visible field definitions.',
        icon: Settings,
        id: 'action-manage-fields',
        keywords: ['columns', 'fields', 'schema'],
        label: 'Manage fields',
        meta: resolvedProject?.name,
        onSelect: () => {
          setIsFieldManagerOpen(true)
          return true
        },
      },
    ],
    [
      canEditProject,
      canCreateWorkspace,
      currentOrgRole,
      openCardComposer,
      openProjectAccess,
      openProjectComposer,
      openWorkspaceComposer,
      resolvedProject?.name,
      setIsFieldManagerOpen,
      toast,
      workspace?.name,
    ],
  )
}
