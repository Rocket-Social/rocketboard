import {FilePlus2} from 'lucide-react'
import {useState} from 'react'

import {Button} from '../../components/ui/button'
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '../../components/ui/dialog'
import {Input} from '../../components/ui/input'
import {
  getProjectViewCountLabel,
  defaultBoardStarterViewType,
  defaultBoardStarterViewTypes,
  normalizeBoardStarterViewTypes,
  resolveDefaultBoardStarterViewType,
  type AddableProjectViewType,
  type ProjectViewType,
} from '../projects/project-view.model'
import {getProjectViewCapability} from '../shell/project-view-capabilities'
import {useCreateProjectMutation} from './setup.queries'
import {getSetupErrorMessage} from './setup.errors'
import type {ProjectRouteTarget} from './setup.types'

type CreateProjectDialogProps = {
  isOpen: boolean
  onClose: () => void
  onCreated: (route: ProjectRouteTarget) => void
  workspaceId: string
}

const starterBoardOptionViewTypes: readonly AddableProjectViewType[] = ['table', 'kanban', 'gantt', 'document', 'github', 'canvas']

export function CreateProjectDialog({
  isOpen,
  onClose,
  onCreated,
  workspaceId,
}: CreateProjectDialogProps) {
  const createProjectMutation = useCreateProjectMutation()
  const [defaultStarterViewType, setDefaultStarterViewType] = useState<ProjectViewType>(defaultBoardStarterViewType)
  const [isPrivate, setIsPrivate] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [starterViewTypes, setStarterViewTypes] = useState<ProjectViewType[]>([...defaultBoardStarterViewTypes])

  const errorMessage = createProjectMutation.error
    ? getSetupErrorMessage(createProjectMutation.error)
    : null

  const boardStarterViews = starterViewTypes.filter((viewType) => viewType !== 'overview')
  const toggleStarterView = (viewType: ProjectViewType) => {
    if (viewType === 'overview') {
      return
    }

    setStarterViewTypes((current) => {
      const nextViews = current.includes(viewType)
        ? current.filter((item) => item !== viewType)
        : [...current, viewType]

      const normalizedViews = normalizeBoardStarterViewTypes(nextViews)

      if (!normalizedViews.includes(defaultStarterViewType)) {
        setDefaultStarterViewType(resolveDefaultBoardStarterViewType(normalizedViews))
      }

      return normalizedViews
    })
  }

  const handleSubmit = () => {
    if (!projectName.trim()) {
      return
    }

    createProjectMutation.mutate(
      {
        access: isPrivate ? 'private' : 'open',
        defaultStarterViewType,
        projectName,
        starterViewTypes,
        workspaceId,
      },
      {
        onSuccess: (route) => {
          setDefaultStarterViewType(defaultBoardStarterViewType)
          setIsPrivate(false)
          setProjectName('')
          setStarterViewTypes([...defaultBoardStarterViewTypes])
          onCreated(route)
        },
      },
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className='w-[min(30rem,calc(100vw-2rem))] rounded-[28px] bg-surface-base'>
        <DialogHeader className='px-6 py-5'>
          <p className='font-mono text-xs uppercase tracking-[0.24em] text-text-muted'>Create Project</p>
          <DialogTitle className='mt-1 font-display text-2xl'>Add a project to this workspace</DialogTitle>
          <DialogDescription className='mt-2'>
            Projects are collections of boards around a similar theme.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 px-6 py-5'>
          <label className='space-y-2'>
            <span className='text-sm font-medium text-text-strong'>Project name</span>
            <Input
              autoFocus
              onChange={(event) => setProjectName(event.target.value)}
              placeholder='e.g., Sprint Planning'
              value={projectName}
            />
          </label>

          <div className='space-y-4 rounded-3xl border border-border-subtle bg-surface-elevated/60 p-4'>
            <div>
              <p className='text-sm font-medium text-text-strong'>Board options</p>
              <p className='mt-1 text-sm text-text-medium'>
                Choose the boards you'd like to add with this project. Table, Kanban, and Gantt tasks are connected. You can add additional boards later.
              </p>
            </div>

            <div className='grid gap-3 sm:grid-cols-2'>
              {starterBoardOptionViewTypes.map((viewType) => {
                const capability = getProjectViewCapability(viewType)
                const selected = starterViewTypes.includes(viewType)
                const Icon = capability.icon

                return (
                  <button
                    className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                      selected
                        ? 'border-primary bg-primary-soft/40 text-text-strong'
                        : 'border-border-subtle bg-surface-base text-text-medium hover:border-primary/40'
                    }`}
                    key={viewType}
                    onClick={() => toggleStarterView(viewType)}
                    type='button'
                  >
                    <span className='flex h-9 w-9 items-center justify-center rounded-2xl bg-canvas-accent text-text-strong'>
                      <Icon className='h-4 w-4'/>
                    </span>
                    <span className='space-y-1'>
                      <span className='block text-sm font-medium'>{capability.defaultName}</span>
                      <span className='block text-xs text-text-muted'>{getProjectViewCountLabel(viewType)}</span>
                    </span>
                  </button>
                )
              })}
            </div>

            <label className='space-y-2 pt-2'>
              <span className='text-sm font-medium text-text-strong'>Default landing board</span>
              <select
                className='h-10 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                onChange={(event) => setDefaultStarterViewType(event.target.value as ProjectViewType)}
                value={defaultStarterViewType}
              >
                {starterViewTypes.map((viewType) => {
                  const capability = getProjectViewCapability(viewType)

                  return (
                    <option key={viewType} value={viewType}>
                      {capability.defaultName}
                    </option>
                  )
                })}
              </select>
            </label>

            {boardStarterViews.length === 0 ? (
              <p className='text-sm text-error'>Pick at least one board in addition to Overview.</p>
            ) : null}
          </div>

          <label className='flex cursor-pointer items-center gap-2'>
            <input
              checked={isPrivate}
              className='h-4 w-4 rounded border-border-subtle text-primary focus:ring-primary'
              onChange={(e) => setIsPrivate(e.target.checked)}
              type='checkbox'
            />
            <span className='text-sm text-text-strong'>Private</span>
            <span className='text-xs text-text-muted'>Only project members and workspace admins can see this</span>
          </label>

          {errorMessage ? (
            <div className='rounded-2xl border border-error/20 bg-error/10 px-3 py-2 text-sm text-error'>
              {errorMessage}
            </div>
          ) : null}

          <div className='flex justify-end gap-2'>
            <Button onClick={onClose} variant='ghost'>
              Cancel
            </Button>
            <Button
              disabled={!projectName.trim() || createProjectMutation.isPending || boardStarterViews.length === 0}
              onClick={handleSubmit}
              variant='primary'
            >
              <FilePlus2 className='h-4 w-4'/>
              {createProjectMutation.isPending ? 'Creating…' : 'Create project'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
