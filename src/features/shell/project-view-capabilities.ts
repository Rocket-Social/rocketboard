import {
  Columns3,
  FileText,
  GanttChart,
  GitPullRequest,
  Grid3X3,
  LayoutTemplate,
  Paintbrush,
  type LucideIcon,
} from 'lucide-react'

import {
  getProjectViewDefaultName,
  isDocumentProjectView,
  type ProjectViewType,
} from '../projects/project-view.model'

export type ProjectViewCapability = {
  defaultName: string
  icon: LucideIcon
  label: string
  supportsAddGroup: boolean
  supportsAddTask: boolean
  supportsTableControls: boolean
}

const projectViewCapabilities: Record<ProjectViewType, ProjectViewCapability> = {
  canvas: {
    defaultName: getProjectViewDefaultName('canvas'),
    icon: Paintbrush,
    label: 'Canvas board',
    supportsAddGroup: false,
    supportsAddTask: false,
    supportsTableControls: false,
  },
  document: {
    defaultName: getProjectViewDefaultName('document'),
    icon: FileText,
    label: 'Document board',
    supportsAddGroup: false,
    supportsAddTask: false,
    supportsTableControls: false,
  },
  gantt: {
    defaultName: getProjectViewDefaultName('gantt'),
    icon: GanttChart,
    label: 'Gantt board',
    supportsAddGroup: false,
    supportsAddTask: true,
    supportsTableControls: false,
  },
  kanban: {
    defaultName: getProjectViewDefaultName('kanban'),
    icon: Grid3X3,
    label: 'Kanban board',
    supportsAddGroup: false,
    supportsAddTask: true,
    supportsTableControls: false,
  },
  overview: {
    defaultName: getProjectViewDefaultName('overview'),
    icon: LayoutTemplate,
    label: 'Overview board',
    supportsAddGroup: false,
    supportsAddTask: false,
    supportsTableControls: false,
  },
  table: {
    defaultName: getProjectViewDefaultName('table'),
    icon: Columns3,
    label: 'Table board',
    supportsAddGroup: true,
    supportsAddTask: true,
    supportsTableControls: true,
  },
  github: {
    defaultName: getProjectViewDefaultName('github'),
    icon: GitPullRequest,
    label: 'GitHub board',
    supportsAddGroup: false,
    supportsAddTask: false,
    supportsTableControls: false,
  },
}

export function getProjectViewCapability(viewType: ProjectViewType) {
  if (isDocumentProjectView(viewType)) {
    return projectViewCapabilities.document
  }

  return projectViewCapabilities[viewType]
}
