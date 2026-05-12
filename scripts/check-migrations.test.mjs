import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ARCHIVE_MIGRATIONS_RELATIVE,
  ARCHIVE_README,
  FROZEN_BASELINE_FILES,
  REQUIRED_HISTORICAL_REPAIR_FILES,
  LEGACY_ARCHIVE_RELATIVE,
  ACTIVE_MIGRATIONS_RELATIVE,
  runMigrationGuard,
  validateActiveMigrations,
} from './check-migrations.mjs';

const tempDirs = [];

function writeFixtureFile(targetPath, contents = '-- test\n') {
  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, contents);
}

function createRepoFixture({
  activeEntries = [...FROZEN_BASELINE_FILES, ...REQUIRED_HISTORICAL_REPAIR_FILES],
  archiveEntries = ['legacy_v14_wiki_search_full_path.sql'],
  includeArchiveReadme = true,
  legacyArchiveEntries = [],
} = {}) {
  const repoRoot = mkdtempSync(path.join(tmpdir(), 'migration-guard-'));
  const migrationsDir = path.join(repoRoot, ACTIVE_MIGRATIONS_RELATIVE);
  const archiveDir = path.join(repoRoot, ARCHIVE_MIGRATIONS_RELATIVE);
  const legacyArchiveDir = path.join(repoRoot, LEGACY_ARCHIVE_RELATIVE);

  for (const entry of activeEntries) {
    writeFixtureFile(path.join(migrationsDir, entry));
  }

  for (const entry of archiveEntries) {
    writeFixtureFile(path.join(archiveDir, entry));
  }

  if (includeArchiveReadme) {
    writeFixtureFile(path.join(archiveDir, ARCHIVE_README), '# archive\n');
  }

  for (const entry of legacyArchiveEntries) {
    writeFixtureFile(path.join(legacyArchiveDir, entry));
  }

  tempDirs.push(repoRoot);
  return {
    archiveDir,
    legacyArchiveDir,
    migrationDir: migrationsDir,
    repoRoot,
  };
}

function initGitRepo(repoRoot) {
  execFileSync('git', ['init', '--initial-branch=main'], { cwd: repoRoot, encoding: 'utf8' });
  execFileSync('git', ['config', 'user.email', 'codex@example.com'], { cwd: repoRoot, encoding: 'utf8' });
  execFileSync('git', ['config', 'user.name', 'Codex'], { cwd: repoRoot, encoding: 'utf8' });
}

function commitAll(repoRoot, message) {
  execFileSync('git', ['add', '.'], { cwd: repoRoot, encoding: 'utf8' });
  execFileSync('git', ['commit', '-m', message], { cwd: repoRoot, encoding: 'utf8' });
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const target = tempDirs.pop();
    if (target) {
      rmSync(target, { force: true, recursive: true });
    }
  }
});

describe('check-migrations', () => {
  it('passes for frozen baseline files, a valid forward migration, and a normalized archive', () => {
    const fixture = createRepoFixture({
      activeEntries: [...FROZEN_BASELINE_FILES, ...REQUIRED_HISTORICAL_REPAIR_FILES, '20260420010000_add_workspace_slug.sql'],
      archiveEntries: [
        'legacy_v14_wiki_search_full_path.sql',
        'legacy_v15a_ai_subscription_auth.sql',
      ],
    });

    const result = runMigrationGuard(fixture);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('fails on malformed active migration filenames', () => {
    const result = validateActiveMigrations([
      ...FROZEN_BASELINE_FILES,
      'add_workspace_slug.sql',
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'Active migration filename must match YYYYMMDDHHMMSS_slug.sql: add_workspace_slug.sql',
    );
  });

  it('fails when a new active migration version is not a real UTC timestamp', () => {
    const result = validateActiveMigrations([
      ...FROZEN_BASELINE_FILES,
      '11111111111111_add_workspace_slug.sql',
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'New active migration must use a real UTC timestamp version: 11111111111111_add_workspace_slug.sql',
    );
  });

  it('fails on duplicate migration version prefixes', () => {
    const result = validateActiveMigrations([
      ...FROZEN_BASELINE_FILES,
      '20260412123045_add_workspace_slug.sql',
      '20260412123045_add_note_source.sql',
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'Duplicate migration version prefix 20260412123045: 20260412123045_add_workspace_slug.sql, 20260412123045_add_note_source.sql',
    );
  });

  it('fails on duplicate migration slugs across active and archived files', () => {
    const fixture = createRepoFixture({
      activeEntries: [...FROZEN_BASELINE_FILES, ...REQUIRED_HISTORICAL_REPAIR_FILES, '20260420010000_ai_subscription_auth.sql'],
      archiveEntries: ['legacy_v15a_ai_subscription_auth.sql'],
    });

    const result = runMigrationGuard(fixture);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'Duplicate migration slug ai_subscription_auth: supabase/migrations/20260420010000_ai_subscription_auth.sql, supabase/migrations_archive/2026-reset/legacy_v15a_ai_subscription_auth.sql',
    );
  });

  it('fails when the normalized archive is missing its mapping readme', () => {
    const fixture = createRepoFixture({
      includeArchiveReadme: false,
    });

    const result = runMigrationGuard(fixture);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'Missing archive mapping file: supabase/migrations_archive/2026-reset/README.md',
    );
  });

  it('fails when archived files still use executable migration names', () => {
    const fixture = createRepoFixture({
      archiveEntries: ['00000000000015_ai_subscription_auth.sql'],
    });

    const result = runMigrationGuard(fixture);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'Archived migration filename must match legacy_vNN[_letter]_slug.sql: 00000000000015_ai_subscription_auth.sql',
    );
  });

  it('fails when the legacy archive path still exists', () => {
    const fixture = createRepoFixture({
      legacyArchiveEntries: ['00000000000015_ai_subscription_auth.sql'],
    });

    const result = runMigrationGuard(fixture);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Legacy archive path must be removed: supabase/migrations_old');
  });

  it('allows append-only additions relative to a base ref', () => {
    const fixture = createRepoFixture();
    initGitRepo(fixture.repoRoot);
    const baseSha = commitAll(fixture.repoRoot, 'baseline');

    writeFixtureFile(
      path.join(fixture.repoRoot, ACTIVE_MIGRATIONS_RELATIVE, '20260420010000_add_workspace_slug.sql'),
    );
    commitAll(fixture.repoRoot, 'add migration');

    const result = runMigrationGuard({
      ...fixture,
      fromRef: baseSha,
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('fails when an added migration backdates itself before the current active head', () => {
    const fixture = createRepoFixture({
      activeEntries: [...FROZEN_BASELINE_FILES, ...REQUIRED_HISTORICAL_REPAIR_FILES, '20260420030000_latest_change.sql'],
    });
    initGitRepo(fixture.repoRoot);
    const baseSha = commitAll(fixture.repoRoot, 'baseline with forward migration');

    writeFixtureFile(
      path.join(fixture.repoRoot, ACTIVE_MIGRATIONS_RELATIVE, '20260411120000_backdated_change.sql'),
    );
    commitAll(fixture.repoRoot, 'add backdated migration');

    const result = runMigrationGuard({
      ...fixture,
      fromRef: baseSha,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'New active migration must move history forward; 20260411120000_backdated_change.sql is not newer than existing version 20260420030000.',
    );
  });

  it('fails when a required historical repair migration is missing', () => {
    const fixture = createRepoFixture({
      activeEntries: [...FROZEN_BASELINE_FILES, '20260419180000_restore_notes_startup_snapshot.sql'],
    });

    const result = runMigrationGuard(fixture);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'Missing required historical repair migrations in supabase/migrations: 20260419203000_restore_org_wiki_startup_snapshot.sql, 20260419204000_repair_ai_personas_model_drift.sql',
    );
  });

  it('fails when an existing active migration is modified relative to a base ref', () => {
    const fixture = createRepoFixture();
    initGitRepo(fixture.repoRoot);
    const baseSha = commitAll(fixture.repoRoot, 'baseline');

    writeFixtureFile(
      path.join(fixture.repoRoot, ACTIVE_MIGRATIONS_RELATIVE, '00000000000000_core.sql'),
      '-- modified\n',
    );
    commitAll(fixture.repoRoot, 'rewrite baseline');

    const result = runMigrationGuard({
      ...fixture,
      fromRef: baseSha,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'Active migrations are append-only; existing migration modified: supabase/migrations/00000000000000_core.sql',
    );
  });

  it('fails when an existing active migration is modified in the working tree', () => {
    const fixture = createRepoFixture();
    initGitRepo(fixture.repoRoot);
    const baseSha = commitAll(fixture.repoRoot, 'baseline');

    writeFixtureFile(
      path.join(fixture.repoRoot, ACTIVE_MIGRATIONS_RELATIVE, '00000000000000_core.sql'),
      '-- modified without commit\n',
    );

    const result = runMigrationGuard({
      ...fixture,
      fromRef: baseSha,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'Active migrations are append-only; existing migration modified: supabase/migrations/00000000000000_core.sql',
    );
  });

  it('exempts the 2026-04 cutover only when all 4 deletions are present', () => {
    const fixture = createRepoFixture({
      activeEntries: [
        ...FROZEN_BASELINE_FILES,
        ...REQUIRED_HISTORICAL_REPAIR_FILES,
        '20260414212954_duplicate_cards.sql',
        '20260417000000_wiki_pages_delete_cascade.sql',
        '20260418000000_delete_initiative.sql',
        '20260418000001_delete_initiative_preflight.sql',
      ],
    });
    initGitRepo(fixture.repoRoot);
    const baseSha = commitAll(fixture.repoRoot, 'baseline');

    // Simulate the cutover: modify 3 baselines + delete all 4 late migrations.
    writeFixtureFile(
      path.join(fixture.repoRoot, ACTIVE_MIGRATIONS_RELATIVE, '00000000000001_cards.sql'),
      '-- folded duplicate_cards\n',
    );
    writeFixtureFile(
      path.join(fixture.repoRoot, ACTIVE_MIGRATIONS_RELATIVE, '00000000000006_initiatives.sql'),
      '-- folded delete_initiative\n',
    );
    writeFixtureFile(
      path.join(fixture.repoRoot, ACTIVE_MIGRATIONS_RELATIVE, '00000000000012_wiki.sql'),
      '-- folded wiki_pages_delete_cascade\n',
    );
    for (const late of [
      '20260414212954_duplicate_cards.sql',
      '20260417000000_wiki_pages_delete_cascade.sql',
      '20260418000000_delete_initiative.sql',
      '20260418000001_delete_initiative_preflight.sql',
    ]) {
      rmSync(path.join(fixture.repoRoot, ACTIVE_MIGRATIONS_RELATIVE, late));
    }
    commitAll(fixture.repoRoot, 'cutover');

    const result = runMigrationGuard({
      ...fixture,
      fromRef: baseSha,
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('blocks baseline edits when the cutover signature is missing', () => {
    const fixture = createRepoFixture({
      activeEntries: [
        ...FROZEN_BASELINE_FILES,
        ...REQUIRED_HISTORICAL_REPAIR_FILES,
        // Only 3 of the 4 cutover files — signature incomplete.
        '20260414212954_duplicate_cards.sql',
        '20260417000000_wiki_pages_delete_cascade.sql',
        '20260418000000_delete_initiative.sql',
      ],
    });
    initGitRepo(fixture.repoRoot);
    const baseSha = commitAll(fixture.repoRoot, 'baseline');

    writeFixtureFile(
      path.join(fixture.repoRoot, ACTIVE_MIGRATIONS_RELATIVE, '00000000000001_cards.sql'),
      '-- sneaky modification\n',
    );
    for (const late of [
      '20260414212954_duplicate_cards.sql',
      '20260417000000_wiki_pages_delete_cascade.sql',
      '20260418000000_delete_initiative.sql',
    ]) {
      rmSync(path.join(fixture.repoRoot, ACTIVE_MIGRATIONS_RELATIVE, late));
    }
    commitAll(fixture.repoRoot, 'partial cutover');

    const result = runMigrationGuard({
      ...fixture,
      fromRef: baseSha,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'Active migrations are append-only; existing migration modified: supabase/migrations/00000000000001_cards.sql',
    );
  });

  it('allows archive directory to be absent (Phase B consolidation retired it)', () => {
    const fixture = createRepoFixture();
    // Remove the archive directory the fixture created.
    rmSync(fixture.archiveDir, { recursive: true, force: true });

    const result = runMigrationGuard(fixture);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
