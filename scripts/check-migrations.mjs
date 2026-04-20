#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const ACTIVE_MIGRATIONS_RELATIVE = path.join('supabase', 'migrations');
export const ARCHIVE_MIGRATIONS_RELATIVE = path.join('supabase', 'migrations_archive', '2026-reset');
export const LEGACY_ARCHIVE_RELATIVE = path.join('supabase', 'migrations_old');
export const ARCHIVE_README = 'README.md';

export const FROZEN_BASELINE_FILES = [
  '00000000000000_core.sql',
  '00000000000001_cards.sql',
  '00000000000002_fields.sql',
  '00000000000003_project_views.sql',
  '00000000000004_documents.sql',
  '00000000000005_automations.sql',
  '00000000000006_initiatives.sql',
  '00000000000007_plans.sql',
  '00000000000008_github.sql',
  '00000000000009_search.sql',
  '00000000000010_activity.sql',
  '00000000000012_wiki.sql',
  '00000000000014_ai_config.sql',
];

// One-time consolidation cutover (2026-04-17, pre-launch): the 4 late
// migrations below were folded into their target baselines and deleted.
// core.sql + wiki.sql were additionally edited to drop two dead tables
// (billing_contacts + wiki_attachments) that had no readers/writers.
// All deploy targets run `scripts/consolidation-cutover-2026-04.sql`,
// which strips the schema_migrations records + drops the dead tables.
// Exempting these specific files here lets the append-only guard keep
// protecting every other migration without blocking this cutover.
export const CONSOLIDATED_CUTOVER_FILES = [
  '00000000000000_core.sql',
  '00000000000001_cards.sql',
  '00000000000006_initiatives.sql',
  '00000000000012_wiki.sql',
  '20260414212954_duplicate_cards.sql',
  '20260417000000_wiki_pages_delete_cascade.sql',
  '20260418000000_delete_initiative.sql',
  '20260418000001_delete_initiative_preflight.sql',
];

export const CONSOLIDATED_CUTOVER_VERSIONS = [
  '20260414212954',
  '20260417000000',
  '20260418000000',
  '20260418000001',
];

export const ACTIVE_SQL_PATTERN = /^(\d{14})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;
export const ARCHIVE_SQL_PATTERN = /^legacy_v(\d{2}(?:[a-z])?)_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;

function collectDuplicateGroups(values, keySelector) {
  const groups = new Map();

  for (const value of values) {
    const key = keySelector(value);
    const existing = groups.get(key) ?? [];
    existing.push(value);
    groups.set(key, existing);
  }

  return [...groups.entries()].filter(([, grouped]) => grouped.length > 1);
}

function isRealTimestampVersion(version) {
  const match = version.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!match) {
    return false;
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  if (year < 2000 || year > 2099) {
    return false;
  }

  const candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() + 1 === month
    && candidate.getUTCDate() === day
    && candidate.getUTCHours() === hour
    && candidate.getUTCMinutes() === minute
    && candidate.getUTCSeconds() === second;
}

export function parseActiveMigrationEntry(entry, { frozenBaselineFiles = FROZEN_BASELINE_FILES } = {}) {
  const match = entry.match(ACTIVE_SQL_PATTERN);
  if (!match) {
    return {
      entry,
      error: `Active migration filename must match YYYYMMDDHHMMSS_slug.sql: ${entry}`,
    };
  }

  const [, version, slug] = match;
  const isFrozenBaseline = frozenBaselineFiles.includes(entry);

  // Freeze the zero-prefixed baseline, then require real wall-clock timestamps for anything new.
  if (!isFrozenBaseline && !isRealTimestampVersion(version)) {
    return {
      entry,
      error: `New active migration must use a real UTC timestamp version: ${entry}`,
    };
  }

  return {
    entry,
    isFrozenBaseline,
    slug,
    version,
  };
}

export function parseArchiveMigrationEntry(entry) {
  const match = entry.match(ARCHIVE_SQL_PATTERN);
  if (!match) {
    return {
      entry,
      error: `Archived migration filename must match legacy_vNN[_letter]_slug.sql: ${entry}`,
    };
  }

  const [, legacyTag, slug] = match;
  return {
    entry,
    legacyTag,
    slug,
  };
}

export function validateActiveMigrations(
  entries,
  {
    activeMigrationsRelative = ACTIVE_MIGRATIONS_RELATIVE,
    frozenBaselineFiles = FROZEN_BASELINE_FILES,
  } = {},
) {
  const errors = [];
  const nonSqlEntries = entries.filter((entry) => !entry.endsWith('.sql'));
  const sqlEntries = entries.filter((entry) => entry.endsWith('.sql'));
  const missingBaselineFiles = frozenBaselineFiles.filter((entry) => !sqlEntries.includes(entry));
  const parsedEntries = [];

  if (nonSqlEntries.length > 0) {
    errors.push(`Non-SQL files are not allowed in ${activeMigrationsRelative}: ${nonSqlEntries.join(', ')}`);
  }

  if (missingBaselineFiles.length > 0) {
    errors.push(`Missing frozen baseline migrations: ${missingBaselineFiles.join(', ')}`);
  }

  for (const entry of sqlEntries) {
    const parsed = parseActiveMigrationEntry(entry, { frozenBaselineFiles });
    if (parsed.error) {
      errors.push(parsed.error);
      continue;
    }

    parsedEntries.push(parsed);
  }

  for (const [version, duplicates] of collectDuplicateGroups(parsedEntries, (entry) => entry.version)) {
    errors.push(`Duplicate migration version prefix ${version}: ${duplicates.map((entry) => entry.entry).join(', ')}`);
  }

  for (const [slug, duplicates] of collectDuplicateGroups(parsedEntries, (entry) => entry.slug)) {
    errors.push(`Duplicate migration slug ${slug}: ${duplicates.map((entry) => entry.entry).join(', ')}`);
  }

  return {
    errors,
    missingBaselineFiles,
    nonSqlEntries,
    ok: errors.length === 0,
    parsedEntries,
    sqlEntries,
  };
}

export function validateArchiveMigrations(
  entries,
  {
    archiveMigrationsRelative = ARCHIVE_MIGRATIONS_RELATIVE,
    archiveReadme = ARCHIVE_README,
  } = {},
) {
  const errors = [];
  const unexpectedNonSqlEntries = entries.filter(
    (entry) => !entry.endsWith('.sql') && entry !== archiveReadme,
  );
  const sqlEntries = entries.filter((entry) => entry.endsWith('.sql'));
  const parsedEntries = [];

  if (!entries.includes(archiveReadme)) {
    errors.push(`Missing archive mapping file: ${path.join(archiveMigrationsRelative, archiveReadme)}`);
  }

  if (unexpectedNonSqlEntries.length > 0) {
    errors.push(
      `Unexpected non-SQL files are not allowed in ${archiveMigrationsRelative}: ${unexpectedNonSqlEntries.join(', ')}`,
    );
  }

  for (const entry of sqlEntries) {
    const parsed = parseArchiveMigrationEntry(entry);
    if (parsed.error) {
      errors.push(parsed.error);
      continue;
    }

    parsedEntries.push(parsed);
  }

  for (const [legacyTag, duplicates] of collectDuplicateGroups(parsedEntries, (entry) => entry.legacyTag)) {
    errors.push(`Duplicate archived legacy tag ${legacyTag}: ${duplicates.map((entry) => entry.entry).join(', ')}`);
  }

  return {
    errors,
    ok: errors.length === 0,
    parsedEntries,
    sqlEntries,
    unexpectedNonSqlEntries,
  };
}

export function validateUniqueSlugs({
  activeEntries,
  activeMigrationsRelative = ACTIVE_MIGRATIONS_RELATIVE,
  archiveEntries,
  archiveMigrationsRelative = ARCHIVE_MIGRATIONS_RELATIVE,
}) {
  const slugGroups = new Map();

  for (const entry of activeEntries) {
    const grouped = slugGroups.get(entry.slug) ?? { active: [], archive: [] };
    grouped.active.push(path.join(activeMigrationsRelative, entry.entry));
    slugGroups.set(entry.slug, grouped);
  }

  for (const entry of archiveEntries) {
    const grouped = slugGroups.get(entry.slug) ?? { active: [], archive: [] };
    grouped.archive.push(path.join(archiveMigrationsRelative, entry.entry));
    slugGroups.set(entry.slug, grouped);
  }

  return [...slugGroups.entries()]
    .filter(([, grouped]) => grouped.archive.length > 1 || (grouped.active.length > 0 && grouped.archive.length > 0))
    .map(([slug, grouped]) => `Duplicate migration slug ${slug}: ${[...grouped.active, ...grouped.archive].join(', ')}`);
}

export function parseGitNameStatusLines(rawText) {
  return rawText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t');
      const rawStatus = parts[0] ?? '';
      const status = rawStatus[0] ?? '';

      if (status === 'R' || status === 'C') {
        return {
          oldPath: parts[1] ?? '',
          path: parts[2] ?? '',
          rawStatus,
          status,
        };
      }

      return {
        path: parts[1] ?? '',
        rawStatus,
        status,
      };
    });
}

function dedupeDiffEntries(entries) {
  const seen = new Set();
  const deduped = [];

  for (const entry of entries) {
    const key = [entry.rawStatus, entry.oldPath ?? '', entry.path].join('|');
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(entry);
  }

  return deduped;
}

function readGitDiff({ args, repoRoot }) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
}

function readGitTreeEntries({
  activeMigrationsRelative,
  ref,
  repoRoot,
}) {
  const output = execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', ref, '--', activeMigrationsRelative],
    { cwd: repoRoot, encoding: 'utf8' },
  );

  return output
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((filePath) => path.basename(filePath))
    .sort();
}

export function loadMigrationDiffEntries({
  activeMigrationsRelative = ACTIVE_MIGRATIONS_RELATIVE,
  fromRef,
  repoRoot = process.cwd(),
}) {
  try {
    const outputs = [];

    if (fromRef) {
      outputs.push(readGitDiff({
        args: ['diff', '--name-status', '--find-renames', `${fromRef}...HEAD`, '--', activeMigrationsRelative],
        repoRoot,
      }));
    }

    outputs.push(readGitDiff({
      args: ['diff', '--name-status', '--cached', '--find-renames', '--', activeMigrationsRelative],
      repoRoot,
    }));
    outputs.push(readGitDiff({
      args: ['diff', '--name-status', '--find-renames', '--', activeMigrationsRelative],
      repoRoot,
    }));

    return dedupeDiffEntries(outputs.flatMap((output) => parseGitNameStatusLines(output)));
  } catch (error) {
    throw new Error(
      `Unable to diff ${activeMigrationsRelative} against ${fromRef}. Fetch the ref or pass a valid --from-ref.`,
    );
  }
}

export function validateAppendOnlyDiff(diffEntries, {
  cutoverFiles = CONSOLIDATED_CUTOVER_FILES,
  cutoverVersions = CONSOLIDATED_CUTOVER_VERSIONS,
} = {}) {
  const errors = [];
  const cutoverSet = new Set(cutoverFiles);

  // Exemption is one-shot: only active on the specific PR that deletes every
  // one of the late migrations being folded. Once this PR merges, main no
  // longer has those files, future PRs show 0 matching deletions, and the
  // normal append-only rules apply again. No permanent backdoor.
  const deletedVersions = new Set(
    diffEntries
      .filter((entry) => entry.status === 'D')
      .map((entry) => {
        const match = path.basename(entry.path).match(ACTIVE_SQL_PATTERN);
        return match ? match[1] : '';
      })
      .filter(Boolean),
  );
  const isCutoverActive = cutoverVersions.every((version) => deletedVersions.has(version));

  // Append-only means existing active files may be added, but never modified,
  // deleted, or renamed. The one-time consolidation cutover files are exempt
  // only while the cutover signature (all 4 deletions) is present in the diff.
  for (const entry of diffEntries) {
    if (entry.status === 'A') {
      continue;
    }

    const basename = path.basename(entry.path);
    if (isCutoverActive && cutoverSet.has(basename)) {
      continue;
    }

    if (entry.status === 'M') {
      errors.push(`Active migrations are append-only; existing migration modified: ${entry.path}`);
      continue;
    }

    if (entry.status === 'D') {
      errors.push(`Active migrations are append-only; existing migration deleted: ${entry.path}`);
      continue;
    }

    if (entry.status === 'R') {
      errors.push(`Active migrations are append-only; existing migration renamed: ${entry.oldPath} -> ${entry.path}`);
      continue;
    }

    errors.push(`Active migrations are append-only; unexpected diff status ${entry.rawStatus}: ${entry.path}`);
  }

  return {
    errors,
    ok: errors.length === 0,
  };
}

export function validateForwardAddedMigrations({
  activeEntries,
  activeMigrationsRelative = ACTIVE_MIGRATIONS_RELATIVE,
  diffEntries,
  frozenBaselineFiles = FROZEN_BASELINE_FILES,
  fromRef,
  repoRoot = process.cwd(),
}) {
  const addedEntryNames = diffEntries
    .filter((entry) => entry.status === 'A')
    .map((entry) => path.basename(entry.path));

  if (addedEntryNames.length === 0) {
    return {
      errors: [],
      ok: true,
    };
  }

  let previousEntries = [];

  try {
    previousEntries = readGitTreeEntries({
      activeMigrationsRelative,
      ref: fromRef || 'HEAD',
      repoRoot,
    });
  } catch (error) {
    const message = fromRef
      ? `Unable to read ${activeMigrationsRelative} at ${fromRef}. Fetch the ref or pass a valid --from-ref.`
      : `Unable to read ${activeMigrationsRelative} at HEAD. Commit the current branch or pass --from-ref.`;
    return {
      errors: [message],
      ok: false,
    };
  }

  const previousVersions = previousEntries
    .map((entry) => parseActiveMigrationEntry(entry, { frozenBaselineFiles }))
    .filter((entry) => !entry.error && !entry.isFrozenBaseline)
    .map((entry) => entry.version)
    .sort();
  const latestPreviousVersion = previousVersions.at(-1) ?? '';
  const errors = [];

  for (const entryName of addedEntryNames) {
    const parsed = parseActiveMigrationEntry(entryName, { frozenBaselineFiles });
    if (parsed.error || parsed.isFrozenBaseline || !latestPreviousVersion) {
      continue;
    }

    if (parsed.version <= latestPreviousVersion) {
      errors.push(
        `New active migration must move history forward; ${entryName} is not newer than existing version ${latestPreviousVersion}.`,
      );
    }
  }

  return {
    errors,
    ok: errors.length === 0,
  };
}

export function runMigrationGuard({
  archiveDir = path.join(process.cwd(), ARCHIVE_MIGRATIONS_RELATIVE),
  activeMigrationsRelative = ACTIVE_MIGRATIONS_RELATIVE,
  archiveMigrationsRelative = ARCHIVE_MIGRATIONS_RELATIVE,
  fromRef = '',
  legacyArchiveDir = path.join(process.cwd(), LEGACY_ARCHIVE_RELATIVE),
  migrationDir = path.join(process.cwd(), ACTIVE_MIGRATIONS_RELATIVE),
  repoRoot = process.cwd(),
} = {}) {
  const errors = [];
  const activeEntries = readdirSync(migrationDir).sort();
  const activeValidation = validateActiveMigrations(activeEntries, { activeMigrationsRelative });
  let archiveEntries = [];
  let archiveValidation = {
    errors: [],
    ok: true,
    parsedEntries: [],
    sqlEntries: [],
    unexpectedNonSqlEntries: [],
  };
  let diffEntries = [];
  let diffValidation = { errors: [], ok: true };
  let forwardValidation = { errors: [], ok: true };

  // Archive directory is optional post-consolidation (Phase B, 2026-04 retired
  // the 2026-reset archive). If present, enforce its filename contract; if
  // absent, skip archive validation entirely.
  if (existsSync(archiveDir)) {
    archiveEntries = readdirSync(archiveDir).sort();
    archiveValidation = validateArchiveMigrations(archiveEntries, { archiveMigrationsRelative });
  }

  if (existsSync(legacyArchiveDir)) {
    errors.push(`Legacy archive path must be removed: ${LEGACY_ARCHIVE_RELATIVE}`);
  }

  if (fromRef || existsSync(path.join(repoRoot, '.git'))) {
    try {
      diffEntries = loadMigrationDiffEntries({
        activeMigrationsRelative,
        fromRef,
        repoRoot,
      });
      diffValidation = validateAppendOnlyDiff(diffEntries);
      forwardValidation = validateForwardAddedMigrations({
        activeEntries,
        activeMigrationsRelative,
        diffEntries,
        fromRef,
        repoRoot,
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  errors.push(...activeValidation.errors);
  errors.push(...archiveValidation.errors);
  errors.push(...validateUniqueSlugs({
    activeEntries: activeValidation.parsedEntries,
    activeMigrationsRelative,
    archiveEntries: archiveValidation.parsedEntries,
    archiveMigrationsRelative,
  }));
  errors.push(...diffValidation.errors);
  errors.push(...forwardValidation.errors);

  return {
    activeEntries,
    archiveEntries,
    diffEntries,
    errors,
    fromRef,
    migrationDir,
    ok: errors.length === 0,
    archiveDir,
  };
}

function parseCliArgs(argv) {
  const flags = {
    fromRef: '',
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--from-ref') {
      flags.fromRef = argv[index + 1] ?? '';
      index += 1;
    }
  }

  return flags;
}

function runCli() {
  const flags = parseCliArgs(process.argv);
  const result = runMigrationGuard({ fromRef: flags.fromRef });

  if (!result.ok) {
    console.error(`Migration guard failed for ${result.migrationDir}`);
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`Migration guard passed for ${result.migrationDir}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCli();
}
