import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {describe, expect, it} from 'vitest'

function loadProjectViewsMigration() {
  const migrationsDir = new URL('../../../supabase/migrations/', import.meta.url)
  const migrationsPath = fileURLToPath(migrationsDir)

  return readFileSync(join(migrationsPath, '00000000000003_project_views.sql'), 'utf8')
}

function loadCoreMigration() {
  const migrationsDir = new URL('../../../supabase/migrations/', import.meta.url)
  const migrationsPath = fileURLToPath(migrationsDir)

  return readFileSync(join(migrationsPath, '00000000000000_core.sql'), 'utf8')
}

describe('project view limit migration', () => {
  it('allows document, GitHub, and canvas boards to exceed singleton counts', () => {
    const sql = loadProjectViewsMigration() + loadCoreMigration()

    expect(sql).toContain("where view_type <> 'document' and view_type <> 'github' and view_type <> 'canvas';")
    expect(sql).toContain("if target_view_type in ('document', 'github', 'canvas') then")
    expect(sql).toContain("raise exception 'Projects can include at most 10 document boards.';")
    expect(sql).toContain("raise exception 'Projects can include at most 10 GitHub boards.';")
    expect(sql).toContain("raise exception 'Projects can include at most 10 Canvas boards.';")
  })

  it('does not allow initiative as a persisted project groupBy option', () => {
    const sql = loadProjectViewsMigration()

    expect(sql).toContain("if normalized_group_by not in ('group', 'status', 'priority', 'due_date', 'assignee', 'sprint') then")
    expect(sql).not.toContain("if normalized_group_by not in ('group', 'status', 'priority', 'due_date', 'assignee', 'sprint', 'initiative') then")
  })

  it('qualifies project view columns inside create_project_view', () => {
    const sql = loadProjectViewsMigration()

    expect(sql).toContain('#variable_conflict use_column')
    expect(sql).toContain('update public.project_views project_view')
    expect(sql).toContain('position = project_view.position + 1,')
    expect(sql).toContain('and project_view.position >= next_position;')
    expect(sql).toContain('insert into public.project_views as project_view (')
    expect(sql).toContain('returning project_view.id into new_project_view_id;')
  })
})
