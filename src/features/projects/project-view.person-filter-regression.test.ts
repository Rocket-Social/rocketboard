import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {describe, expect, it} from 'vitest'

function loadProjectViewsMigration() {
  const migrationsDir = new URL('../../../supabase/migrations/', import.meta.url)
  const migrationsPath = fileURLToPath(migrationsDir)

  return readFileSync(join(migrationsPath, '00000000000003_project_views.sql'), 'utf8')
}

describe('table view person filter SQL regression', () => {
  it('passes the saved person filter back through the table view state readers', () => {
    const sql = loadProjectViewsMigration()
    const readbackMatches = sql.match(/\(target_view\.shared_config ->> 'personFilterUserId'\)::uuid/g) ?? []

    // Baseline of 2 (the original table view state readers) plus new readers
    // added by the project-scoped task mode folds (post-Phase-B). Regression
    // guard: the filter must still be read back in at least the original
    // two sites.
    expect(readbackMatches.length).toBeGreaterThanOrEqual(2)
  })

  it('preserves the existing person filter in legacy shared-config updates', () => {
    const sql = loadProjectViewsMigration()

    expect(sql).toContain('existing_person_filter_user_id uuid := null;')
    expect(sql).toContain('target_visible_field_keys,')
    expect(sql).toContain('existing_person_filter_user_id')
  })
})
