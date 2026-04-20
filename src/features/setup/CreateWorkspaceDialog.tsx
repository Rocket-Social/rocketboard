import {FolderPlus} from 'lucide-react'
import {useState} from 'react'

import {Button} from '../../components/ui/button'
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '../../components/ui/dialog'
import {Input} from '../../components/ui/input'
import {useCreateWorkspaceMutation} from './setup.queries'
import type {ProjectRouteTarget} from './setup.types'

type CreateWorkspaceDialogProps = {
  isOpen: boolean
  onClose: () => void
  onCreated: (route: ProjectRouteTarget) => void
}

export function CreateWorkspaceDialog({
  isOpen,
  onClose,
  onCreated,
}: CreateWorkspaceDialogProps) {
  const createWorkspaceMutation = useCreateWorkspaceMutation()
  const [projectName, setProjectName] = useState('Getting Started')
  const [workspaceName, setWorkspaceName] = useState('')

  const errorMessage =
    createWorkspaceMutation.error instanceof Error ? createWorkspaceMutation.error.message : null

  const handleSubmit = () => {
    if (!workspaceName.trim()) {
      return
    }

    createWorkspaceMutation.mutate(
      {
        projectName,
        workspaceName,
      },
      {
        onSuccess: (route) => {
          setProjectName('Getting Started')
          setWorkspaceName('')
          onCreated(route)
        },
      },
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className='w-[min(32rem,calc(100vw-2rem))] rounded-[28px] bg-surface-base'>
        <DialogHeader className='px-6 py-5'>
          <p className='font-mono text-xs uppercase tracking-[0.24em] text-text-muted'>Create Workspace</p>
          <DialogTitle className='mt-1 font-display text-2xl'>Start a new workspace</DialogTitle>
          <DialogDescription className='mt-2'>
            Rocketboard will create the workspace plus a starter board project in one step.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 px-6 py-5'>
          <label className='space-y-2'>
            <span className='text-sm font-medium text-text-strong'>Workspace name</span>
            <Input
              onChange={(event) => setWorkspaceName(event.target.value)}
              placeholder='Product Ops'
              value={workspaceName}
            />
          </label>

          <label className='space-y-2'>
            <span className='text-sm font-medium text-text-strong'>Starter project</span>
            <Input
              onChange={(event) => setProjectName(event.target.value)}
              placeholder='Getting Started'
              value={projectName}
            />
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
              disabled={!workspaceName.trim() || createWorkspaceMutation.isPending}
              onClick={handleSubmit}
              variant='primary'
            >
              <FolderPlus className='h-4 w-4'/>
              {createWorkspaceMutation.isPending ? 'Creating…' : 'Create workspace'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
