// Phase 6 D6-15 — keep the frontend + edge AI_AGENT_EVENT constants in
// lockstep. Deno can't import from `src/`, so the constants are
// duplicated; this test reads the edge file at runtime via fs and
// compares the parsed object literal to the frontend's import.

import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {dirname, resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

import {AI_AGENT_EVENT as FRONTEND_EVENTS} from './posthog-events'

const HERE = dirname(fileURLToPath(import.meta.url))
const EDGE_FILE = resolve(HERE, '../../../supabase/functions/_shared/posthog-events.ts')

function parseEdgeConstants(source: string): Record<string, string> {
  // The file declares: `export const AI_AGENT_EVENT = { KEY: 'value', ... } as const`
  // Lift each KEY: 'value' pair via a regex pass that ignores whitespace + comments.
  const match = /export const AI_AGENT_EVENT = \{([\s\S]*?)\} as const/.exec(source)
  if (!match) throw new Error('AI_AGENT_EVENT block not found in edge posthog-events.ts')
  const body = match[1]
  const entries: Record<string, string> = {}
  const lineRe = /^\s*([A-Z_]+)\s*:\s*'([^']+)'/gm
  let lineMatch: RegExpExecArray | null
  while ((lineMatch = lineRe.exec(body)) !== null) {
    entries[lineMatch[1]] = lineMatch[2]
  }
  return entries
}

describe('AI_AGENT_EVENT constants', () => {
  it('matches the edge worker constants', () => {
    const source = readFileSync(EDGE_FILE, 'utf8')
    const edge = parseEdgeConstants(source)
    expect(edge).toEqual(FRONTEND_EVENTS)
  })
})
