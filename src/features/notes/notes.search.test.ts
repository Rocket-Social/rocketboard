import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {describe, expect, it} from 'vitest'

function loadSearchMigration() {
  const migrationsDir = new URL('../../../supabase/migrations/', import.meta.url)
  const migrationsPath = fileURLToPath(migrationsDir)

  return readFileSync(join(migrationsPath, '00000000000009_search.sql'), 'utf8')
}

describe('search_my_notes migration', () => {
  it('keeps My Notes search personal to the authenticated user', () => {
    const sql = loadSearchMigration()

    expect(sql).toContain('create or replace function public.search_my_notes(target_query text)')
    expect(sql).toContain("raise exception 'You must be signed in to search your notes.';")
    expect(sql).toContain('where note.user_id = auth.uid()')
    expect(sql).toContain('and note.deleted_at is null')
    expect(sql).toContain('grant execute on function public.search_my_notes(text) to authenticated;')
  })
})
