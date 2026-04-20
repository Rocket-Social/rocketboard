import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'

import {describe, expect, it} from 'vitest'

function loadDocumentsMigration() {
  const migrationsDir = new URL('../../../supabase/migrations/', import.meta.url)
  const migrationsPath = fileURLToPath(migrationsDir)

  return readFileSync(join(migrationsPath, '00000000000004_documents.sql'), 'utf8')
}

describe('notes table permissions', () => {
  it('grants notes browser tables to authenticated users', () => {
    const sql = loadDocumentsMigration()

    expect(sql).toContain('grant all on public.note_folders to authenticated, service_role;')
    expect(sql).toContain('grant all on public.notes to authenticated, service_role;')
  })
})
