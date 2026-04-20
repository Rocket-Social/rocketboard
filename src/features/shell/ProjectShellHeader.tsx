import {useRouter} from '@tanstack/react-router'
import {Bot, Building2, ChevronDown, Lock, Menu, Search, Sparkles, UserPlus, Users} from 'lucide-react'

import {Button} from '../../components/ui/button'
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '../../components/ui/dropdown-menu'
import type {ProjectViewType} from '../projects/project-view.model'
import {buildProjectRouteHref} from '../search/workspace-palette-navigation'
import {useProjectChrome} from './project/ProjectChromeContext'
import {useProjectDialogs} from './project/ProjectDialogContext'
import {ProjectViewTabs} from './ProjectViewTabs'

export type ProjectShellHeaderProps = {
  activeViewId: string
  activeAutomationCount: number
  onMobileSidebarOpen: () => void
  onOpenCommandPalette: () => void
  onRenameProject: (name: string) => void
  onAutomationManagerOpen: () => void
  onOpenAiChat?: () => void
  onAddView: (viewType: ProjectViewType) => void
  onHideView: (viewId: string) => void
  onRenameView: (viewId: string, name: string) => void
  onReorderViews: (viewIds: string[]) => void
  onResetView?: (viewId: string) => void
  onRestoreView: (viewId: string) => void
  onSelectView: (viewId: string) => void
  onSetDefaultView: (viewId: string) => void
}

export function ProjectShellHeader(props: ProjectShellHeaderProps) {
  const router = useRouter()
  const {canEditProject, project, currentOrgRole, workspace} = useProjectChrome()
  const {openOrganizationAccess, openProjectAccess, openWorkspaceAccess} = useProjectDialogs()

  return (
    <header className='shrink-0 border-b border-border-subtle bg-surface-base px-4 py-4 sm:px-6'>
      <div className='mb-4 flex items-center justify-between gap-4'>
        <div className='flex items-center gap-3'>
          <button
            className='inline-flex rounded-xl p-2 text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong lg:hidden'
            onClick={props.onMobileSidebarOpen}
            type='button'
          >
            <Menu className='h-4 w-4'/>
          </button>
          <button
            aria-label='Search'
            className='inline-flex rounded-xl p-2 text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong lg:hidden'
            onClick={props.onOpenCommandPalette}
            type='button'
          >
            <Search className='h-4 w-4'/>
          </button>

          <div className='flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-soft text-lg text-primary'>
            <span>{project.icon}</span>
          </div>

          <div>
            <h1
              className='font-display rounded-md px-1 text-xl font-semibold tracking-tight text-text-strong outline-none ring-primary focus:ring-2 -mx-1'
              contentEditable={canEditProject}
              suppressContentEditableWarning
              onBlur={(e) => {
                const newName = e.currentTarget.textContent?.trim()
                if (newName && newName !== project.name) {
                  props.onRenameProject(newName)
                } else {
                  e.currentTarget.textContent = project.name
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  e.currentTarget.blur()
                } else if (e.key === 'Escape') {
                  e.currentTarget.textContent = project.name
                  e.currentTarget.blur()
                }
              }}
              onFocus={(e) => {
                const range = document.createRange()
                range.selectNodeContents(e.currentTarget)
                const sel = window.getSelection()
                sel?.removeAllRanges()
                sel?.addRange(range)
              }}
              spellCheck={false}
              title={canEditProject ? 'Rename project' : 'Project write access is required to rename this project'}
            >
              {project.name}
            </h1>
            <p className='text-sm text-text-muted'>
              <span className='font-mono'>{project.taskCount}</span>{' '}
              tasks ·{' '}
              <span className='font-mono'>{project.memberCount}</span> contributors · Updated{' '}
              <span className='font-mono'>{project.lastUpdatedLabel}</span>
            </p>
          </div>
        </div>

        <div className='flex items-center gap-2'>
          {props.onOpenAiChat ? (
            <Button
              onClick={props.onOpenAiChat}
              title='Ask AI'
              variant='secondary'
            >
              <Bot className='h-4 w-4'/>
              AI
            </Button>
          ) : null}
          <Button
            disabled={!canEditProject}
            onClick={props.onAutomationManagerOpen}
            title={canEditProject ? 'Manage project automations' : 'Project write access is required to manage automations'}
            variant='secondary'
          >
            <Sparkles className='h-4 w-4'/>
            Automate
            {props.activeAutomationCount > 0 ? (
              <span className='rounded-full bg-canvas-accent px-2 py-0.5 text-xs font-mono text-text-medium'>
                {props.activeAutomationCount}
              </span>
            ) : null}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='primary'>
                {currentOrgRole === 'guest' ? <Lock className='h-4 w-4'/> : <Users className='h-4 w-4'/>}
                Access
                <ChevronDown className='h-4 w-4'/>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-56'>
              <DropdownMenuItem onClick={openOrganizationAccess}>
                <UserPlus className='h-4 w-4'/>
                <span>Invite to Organization</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openWorkspaceAccess}>
                <Building2 className='h-4 w-4'/>
                <span>Invite to Workspace</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openProjectAccess}>
                <Users className='h-4 w-4'/>
                <span>Invite to Project</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ProjectViewTabs
        activeViewId={props.activeViewId}
        canEditProject={canEditProject}
        onAddView={props.onAddView}
        onHideView={props.onHideView}
        onPrefetchView={(viewId, viewType) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          void router.preloadRoute({
            href: buildProjectRouteHref({
              orgSlug: workspace.organizationSlug,
              projectSlug: project.slug,
              viewId,
              viewType: viewType as ProjectViewType,
              workspaceSlug: workspace.slug,
            }),
          } as any).catch(() => {})
        }}
        onRenameView={props.onRenameView}
        onReorderViews={props.onReorderViews}
        onResetView={props.onResetView}
        onRestoreView={props.onRestoreView}
        onSelectView={props.onSelectView}
        onSetDefaultView={props.onSetDefaultView}
        project={project}
      />
    </header>
  )
}
