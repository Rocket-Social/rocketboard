export type WikiSurfaceResource = {
  id: string
  kind: 'index' | 'page'
}

const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const WIKI_RESOURCE_PATTERN = new RegExp(`^wiki:(index|page):(${UUID_PATTERN})$`, 'i')

export function buildWikiSurfaceResourceId(kind: WikiSurfaceResource['kind'], id: string) {
  return `wiki:${kind}:${id.toLowerCase()}`
}

export function parseWikiSurfaceResourceId(resourceId: string | null | undefined): WikiSurfaceResource | null {
  if (!resourceId) return null

  const match = resourceId.match(WIKI_RESOURCE_PATTERN)
  if (!match) return null

  return {
    id: match[2].toLowerCase(),
    kind: match[1].toLowerCase() as WikiSurfaceResource['kind'],
  }
}
