import {createContext, useContext, type ReactNode} from 'react'

import type {Mode} from '../../../app/mode'
import type {OrganizationRole, ProjectAccessSnapshot, ProjectMember} from '../../access/access.types'
import type {SessionUser} from '../../auth/data'
import type {WorkspaceProjectSummary, WorkspaceSummary} from '../../projects/project-shell.types'

export type ProjectChromeContextValue = {
  workspace: WorkspaceSummary
  workspaces: WorkspaceSummary[]
  project: WorkspaceProjectSummary
  projectId: string
  currentUser: SessionUser
  mode: Mode

  canEditProject: boolean
  currentOrgRole: OrganizationRole | null
  projectAccessSnapshot: ProjectAccessSnapshot | null
  projectMembers: ProjectMember[]

  invalidateProjectData: () => Promise<void>
}

const ProjectChromeContext = createContext<ProjectChromeContextValue | null>(null)

export function ProjectChromeProvider({
  children,
  value,
}: {
  children: ReactNode
  value: ProjectChromeContextValue
}) {
  return <ProjectChromeContext.Provider value={value}>{children}</ProjectChromeContext.Provider>
}

export function useProjectChrome(): ProjectChromeContextValue {
  const ctx = useContext(ProjectChromeContext)
  if (!ctx) throw new Error('useProjectChrome must be used within ProjectChromeProvider')
  return ctx
}
