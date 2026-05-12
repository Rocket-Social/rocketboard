#!/usr/bin/env node

import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertAppliedMigrationHistory,
  assertResetReplay,
  ensureLocalSupabase,
  listExpectedMigrationVersions,
  runCommand,
} from './sql-verify-common.mjs';

export function verifyReset({
  assertAppliedHistoryImpl = assertAppliedMigrationHistory,
  loadExpectedVersionsImpl = listExpectedMigrationVersions,
  repoRoot = process.cwd(),
  runCommandImpl = runCommand,
} = {}) {
  const { env, startedLocalStack } = ensureLocalSupabase({
    repoRoot,
    runCommandImpl,
  });
  const adminDbUrl = env.DB_URL || '';
  const expectedVersions = loadExpectedVersionsImpl({ repoRoot });
  const args = ['db', 'reset', '--local', '--yes'];
  const result = runCommandImpl({
    allowFailure: true,
    args,
    command: 'supabase',
    cwd: repoRoot,
  });

  if (!adminDbUrl) {
    throw new Error('Unable to resolve DB_URL from `supabase status -o env`.');
  }

  assertResetReplay({
    adminDbUrl,
    args,
    assertAppliedHistoryImpl,
    contextLabel: 'SQL reset replay',
    expectedVersions,
    repoRoot,
    result,
    runCommandImpl,
  });

  return {
    ok: true,
    repoRoot,
    startedLocalStack,
  };
}

function runCli() {
  const result = verifyReset();
  console.log(
    result.startedLocalStack
      ? 'SQL reset verification passed after starting the local Supabase stack.'
      : 'SQL reset verification passed.',
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCli();
}
