type ParsedProjectReference = {
  kind: 'project'
  project: string
  projectViewId?: string
  workspace?: string
}

type ParsedCardReference = {
  card: string
  kind: 'card'
  project?: string
  workspace?: string
}

type ParsedDocumentReference = {
  document?: string
  kind: 'document'
  project?: string
  projectViewId?: string
  workspace?: string
}

type ParsedSprintReference = {
  kind: 'sprint'
  project?: string
  sprint: string
  workspace?: string
}

export type ParsedRocketboardReference =
  | ParsedProjectReference
  | ParsedCardReference
  | ParsedDocumentReference
  | ParsedSprintReference

export type NormalizedProjectScope = {
  project: string
  workspace?: string
}

export type NormalizedCardScope = {
  card: string
  project?: string
  workspace?: string
}

export type NormalizedDocumentScope = {
  document?: string
  project?: string
  projectViewId?: string
  title?: string
  workspace?: string
}

export type NormalizedSprintScope = {
  project: string
  sprint?: string
  workspace?: string
}

function parseProjectShellPath(pathname: string) {
  const match = pathname.match(/^\/org\/[^/]+\/workspaces\/([^/]+)\/projects\/([^/]+)\/[^/]+\/([^/?#]+)/u)
  if (!match) {
    return null
  }

  return {
    workspace: decodeURIComponent(match[1]),
    project: decodeURIComponent(match[2]),
    projectViewId: decodeURIComponent(match[3]),
  }
}

function parseWebReference(url: URL): ParsedRocketboardReference | null {
  const projectRoute = parseProjectShellPath(url.pathname)
  if (projectRoute) {
    return {
      kind: 'project',
      project: projectRoute.project,
      projectViewId: projectRoute.projectViewId,
      workspace: projectRoute.workspace,
    }
  }

  return null
}

function parseRocketboardUri(url: URL): ParsedRocketboardReference | null {
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)

  switch (url.hostname) {
    case 'project': {
      const [workspace, project] = parts
      if (!project) {
        return null
      }

      return {
        kind: 'project',
        project,
        workspace,
      }
    }
    case 'card': {
      const [workspace, project, card] = parts
      if (!card) {
        return null
      }

      return {
        card,
        kind: 'card',
        project,
        workspace,
      }
    }
    case 'document': {
      const [workspace, project, document] = parts
      if (!document) {
        return null
      }

      return {
        document,
        kind: 'document',
        project,
        workspace,
      }
    }
    case 'sprint': {
      const [workspace, project, sprint] = parts
      if (!sprint) {
        return null
      }

      return {
        kind: 'sprint',
        project,
        sprint,
        workspace,
      }
    }
    default:
      return null
  }
}

export function parseRocketboardReference(value: string): ParsedRocketboardReference | null {
  const trimmed = value.trim()
  if (!trimmed.includes('://')) {
    return null
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  if (url.protocol === 'http:' || url.protocol === 'https:') {
    return parseWebReference(url)
  }

  if (url.protocol === 'rocketboard:') {
    return parseRocketboardUri(url)
  }

  return null
}

export function normalizeProjectScope(input: {project: string; workspace?: string}): NormalizedProjectScope {
  const parsed = parseRocketboardReference(input.project)
  if (parsed?.kind === 'project') {
    return {
      project: parsed.project,
      workspace: input.workspace ?? parsed.workspace,
    }
  }

  return input
}

export function normalizeCardScope(input: {card: string; project?: string; workspace?: string}): NormalizedCardScope {
  const parsed = parseRocketboardReference(input.card)
  if (parsed?.kind === 'card') {
    return {
      card: parsed.card,
      project: input.project ?? parsed.project,
      workspace: input.workspace ?? parsed.workspace,
    }
  }

  return input
}

export function normalizeDocumentScope(input: {
  document?: string
  project?: string
  title?: string
  workspace?: string
}): NormalizedDocumentScope {
  const rawReference = input.document ?? input.title
  if (!rawReference) {
    return input
  }

  const parsed = parseRocketboardReference(rawReference)
  if (parsed?.kind === 'document') {
    return {
      document: parsed.document,
      project: input.project ?? parsed.project,
      title: input.title,
      workspace: input.workspace ?? parsed.workspace,
    }
  }

  if (parsed?.kind === 'project' && parsed.projectViewId) {
    return {
      document: input.document,
      project: input.project ?? parsed.project,
      projectViewId: parsed.projectViewId,
      title: input.title,
      workspace: input.workspace ?? parsed.workspace,
    }
  }

  return input
}

export function normalizeSprintScope(input: {
  project: string
  sprint?: string
  workspace?: string
}): NormalizedSprintScope {
  const normalizedProject = normalizeProjectScope({
    project: input.project,
    workspace: input.workspace,
  })

  if (!input.sprint) {
    return {
      project: normalizedProject.project,
      workspace: normalizedProject.workspace,
    }
  }

  const parsedSprint = parseRocketboardReference(input.sprint)
  if (parsedSprint?.kind === 'sprint') {
    return {
      project: normalizedProject.project ?? parsedSprint.project ?? input.project,
      sprint: parsedSprint.sprint,
      workspace: normalizedProject.workspace ?? parsedSprint.workspace,
    }
  }

  return {
    project: normalizedProject.project,
    sprint: input.sprint,
    workspace: normalizedProject.workspace,
  }
}
