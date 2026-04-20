#!/usr/bin/env node

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  assertAppliedMigrationHistory,
  assertResetReplay,
  ensureLocalSupabase,
  listExpectedMigrationVersions,
  removeDirectoryIfPresent,
  runCommand,
} from './sql-verify-common.mjs';

// Run the same cutover script that the hosted deploy runs, against the
// local upgrade-verify DB. Script is idempotent and has its own preflight
// guard — if the DB is drifted, psql surfaces the exception and the verify
// step fails loudly instead of silently producing a broken schema.
const CUTOVER_SCRIPT_RELATIVE = path.join('scripts', 'consolidation-cutover-2026-04.sql');

function runCutoverScript({ adminDbUrl, repoRoot, runCommandImpl }) {
  const scriptPath = path.join(repoRoot, CUTOVER_SCRIPT_RELATIVE);
  runCommandImpl({
    args: [adminDbUrl, '-v', 'ON_ERROR_STOP=1', '-f', scriptPath],
    command: 'psql',
    cwd: repoRoot,
  });
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

function createTempWorktree(repoRoot) {
  return mkdtempSync(path.join(tmpdir(), `${path.basename(repoRoot)}-sql-upgrade-`));
}

function resetBaseRefLocally({
  adminDbUrl,
  assertAppliedHistoryImpl,
  expectedVersions,
  repoRoot,
  runCommandImpl,
  tempWorktree,
}) {
  const args = ['db', 'reset', '--local', '--yes', '--no-seed'];
  const result = runCommandImpl({
    allowFailure: true,
    args,
    command: 'supabase',
    cwd: tempWorktree,
  });

  assertResetReplay({
    adminDbUrl,
    args,
    assertAppliedHistoryImpl,
    contextLabel: 'SQL base-ref reset replay',
    expectedVersions,
    repoRoot,
    result,
    runCommandImpl,
  });
}

export function verifyUpgrade({
  assertAppliedHistoryImpl = assertAppliedMigrationHistory,
  createTempWorktreeImpl = createTempWorktree,
  fromRef = '',
  loadExpectedVersionsImpl = listExpectedMigrationVersions,
  removeDirectoryImpl = removeDirectoryIfPresent,
  repoRoot = process.cwd(),
  runCommandImpl = runCommand,
} = {}) {
  if (!fromRef) {
    throw new Error('sql:verify:upgrade requires --from-ref <git-ref>.');
  }

  const { env, startedLocalStack } = ensureLocalSupabase({
    repoRoot,
    runCommandImpl,
  });
  const adminDbUrl = env.DB_URL || '';

  if (!adminDbUrl) {
    throw new Error('Unable to resolve DB_URL from `supabase status -o env`.');
  }

  const expectedHeadVersions = loadExpectedVersionsImpl({ repoRoot });
  const tempWorktree = createTempWorktreeImpl(repoRoot);

  try {
    runCommandImpl({
      args: ['worktree', 'add', '--detach', tempWorktree, fromRef],
      command: 'git',
      cwd: repoRoot,
    });

    // Reset the local stack from the base ref first, then replay the current branch on top of it.
    const expectedBaseVersions = loadExpectedVersionsImpl({ repoRoot: tempWorktree });
    resetBaseRefLocally({
      adminDbUrl,
      assertAppliedHistoryImpl,
      expectedVersions: expectedBaseVersions,
      repoRoot,
      runCommandImpl,
      tempWorktree,
    });

    // Run the deploy cutover script before db push, otherwise supabase CLI
    // refuses to push citing "remote has migrations not in local".
    runCutoverScript({ adminDbUrl, repoRoot, runCommandImpl });
    runCommandImpl({
      args: ['db', 'push', '--local', '--yes'],
      command: 'supabase',
      cwd: repoRoot,
    });
    assertAppliedHistoryImpl({
      adminDbUrl,
      contextLabel: `SQL upgrade replay against ${fromRef}`,
      expectedVersions: expectedHeadVersions,
      repoRoot,
      runCommandImpl,
    });

    return {
      fromRef,
      ok: true,
      repoRoot,
      startedLocalStack,
      tempWorktree,
    };
  } finally {
    runCommandImpl({
      allowFailure: true,
      args: ['worktree', 'remove', '--force', tempWorktree],
      command: 'git',
      cwd: repoRoot,
    });
    removeDirectoryImpl(tempWorktree);
  }
}

function runCli() {
  const flags = parseCliArgs(process.argv);
  const result = verifyUpgrade({ fromRef: flags.fromRef });
  console.log(
    result.startedLocalStack
      ? `SQL upgrade verification passed against ${result.fromRef} after starting the local Supabase stack.`
      : `SQL upgrade verification passed against ${result.fromRef}.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCli();
}
