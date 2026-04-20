import { spawnSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

import { ACTIVE_MIGRATIONS_RELATIVE, parseActiveMigrationEntry } from './check-migrations.mjs';

function formatCommandForError(command, args) {
  return [command, ...args].join(' ');
}

const RESET_RESTART_MARKER = 'Restarting containers...';
const RESET_RESTART_502 = 'Error status 502: An invalid response was received from the upstream server';
const RESET_STORAGE_TIMEOUT_MARKER = 'storage/v1/bucket';
const RESET_TIMEOUT_CONTEXT_MARKERS = [
  'context deadline exceeded',
  'Client.Timeout exceeded while awaiting headers',
];

export function formatCommandFailure(command, args, result, summary) {
  return [
    summary ?? `Command failed: ${formatCommandForError(command, args)}`,
    result.error ? `error: ${result.error.message}` : '',
    result.status !== null && result.status !== undefined ? `exit status: ${result.status}` : '',
    result.signal ? `signal: ${result.signal}` : '',
    result.stdout ? `stdout:\n${result.stdout}` : '',
    result.stderr ? `stderr:\n${result.stderr}` : '',
  ].filter(Boolean).join('\n');
}

function isRetryableSupabaseStartFailure(result) {
  const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const lower = combined.toLowerCase();

  if (result.signal) {
    return true;
  }

  if (
    lower.includes('cannot connect to the docker daemon')
    || lower.includes('docker desktop is a prerequisite')
    || lower.includes('no space left on device')
    || lower.includes('permission denied')
    || lower.includes('pull access denied')
    || lower.includes('toomanyrequests')
    || lower.includes('unauthorized')
  ) {
    return false;
  }

  return (
    combined.includes(' Pulling ')
    || combined.includes(' Pull complete ')
    || combined.includes(' Downloading [')
    || combined.includes(' Extracting [')
    || combined.includes(' Waiting ')
    || combined.includes(' Already exists ')
  );
}

function loadSupabaseStatus({ repoRoot, runCommandImpl }) {
  return runCommandImpl({
    allowFailure: true,
    args: ['status', '-o', 'env'],
    command: 'supabase',
    cwd: repoRoot,
  });
}

const SUPABASE_START_MAX_ATTEMPTS = 2;
export function runCommand({
  allowFailure = false,
  args,
  command,
  cwd,
}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  const stdout = result.stdout?.trimEnd() ?? '';
  const stderr = result.stderr?.trimEnd() ?? '';
  const signal = result.signal ?? null;
  const status = result.status ?? null;
  const formattedResult = {
    error: result.error ?? null,
    ok: (status ?? 1) === 0,
    signal,
    status,
    stderr,
    stdout,
  };

  if (result.error) {
    throw new Error(formatCommandFailure(command, args, formattedResult));
  }

  const ok = (result.status ?? 1) === 0;

  if (!ok && !allowFailure) {
    throw new Error(formatCommandFailure(command, args, formattedResult));
  }

  return {
    cwd,
    ok,
    signal,
    status: status ?? 1,
    stderr,
    stdout,
  };
}

export function isRecoverablePostResetRestartFailure(stderr) {
  if (!stderr.includes(RESET_RESTART_MARKER)) {
    return false;
  }

  if (stderr.includes(RESET_RESTART_502)) {
    return true;
  }

  return (
    stderr.includes(RESET_STORAGE_TIMEOUT_MARKER)
    && RESET_TIMEOUT_CONTEXT_MARKERS.some((marker) => stderr.includes(marker))
  );
}

export function parseEnvOutput(rawText) {
  const values = {};

  for (const line of rawText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('=')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, separatorIndex);
    const rawValue = trimmed.slice(separatorIndex + 1);
    const value = rawValue.startsWith('"') && rawValue.endsWith('"')
      ? rawValue.slice(1, -1)
      : rawValue;

    values[key] = value;
  }

  return values;
}

export function ensureLocalSupabase({
  repoRoot,
  runCommandImpl = runCommand,
}) {
  const status = loadSupabaseStatus({
    repoRoot,
    runCommandImpl,
  });

  if (status.ok) {
    return {
      env: parseEnvOutput(status.stdout),
      startedLocalStack: false,
    };
  }

  for (let attempt = 1; attempt <= SUPABASE_START_MAX_ATTEMPTS; attempt += 1) {
    const startResult = runCommandImpl({
      allowFailure: true,
      args: ['start'],
      command: 'supabase',
      cwd: repoRoot,
    });

    const restartedStatus = loadSupabaseStatus({
      repoRoot,
      runCommandImpl,
    });

    if (restartedStatus.ok) {
      return {
        env: parseEnvOutput(restartedStatus.stdout),
        startedLocalStack: true,
      };
    }

    if (!isRetryableSupabaseStartFailure(startResult) || attempt === SUPABASE_START_MAX_ATTEMPTS) {
      throw new Error([
        formatCommandFailure(
          'supabase',
          ['start'],
          startResult,
          `Unable to start local Supabase stack after ${attempt} attempt${attempt === 1 ? '' : 's'}.`,
        ),
        formatCommandFailure(
          'supabase',
          ['status', '-o', 'env'],
          restartedStatus,
          'Status after failed Supabase start:',
        ),
      ].join('\n'));
    }
  }
}

export function removeDirectoryIfPresent(targetPath) {
  rmSync(targetPath, { force: true, recursive: true });
}

export function listExpectedMigrationVersions({
  activeMigrationsRelative = ACTIVE_MIGRATIONS_RELATIVE,
  repoRoot,
}) {
  const migrationDir = path.join(repoRoot, activeMigrationsRelative);
  const entries = readdirSync(migrationDir).sort();
  const versions = [];

  for (const entry of entries) {
    if (!entry.endsWith('.sql')) {
      continue;
    }

    const parsed = parseActiveMigrationEntry(entry);
    if (parsed.error) {
      throw new Error(parsed.error);
    }

    versions.push(parsed.version);
  }

  return versions.sort();
}

function parseVersionQueryOutput(rawText) {
  return rawText
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function assertAppliedMigrationHistory({
  adminDbUrl,
  contextLabel,
  expectedVersions,
  repoRoot,
  runCommandImpl = runCommand,
}) {
  const result = runCommandImpl({
    args: [
      adminDbUrl,
      '-Atc',
      'select version from supabase_migrations.schema_migrations order by version',
    ],
    command: 'psql',
    cwd: repoRoot,
  });
  const actualVersions = parseVersionQueryOutput(result.stdout);

  if (actualVersions.length !== expectedVersions.length) {
    throw new Error(
      `${contextLabel} applied ${actualVersions.length} migrations, expected ${expectedVersions.length}. `
      + `expected=[${expectedVersions.join(', ')}] actual=[${actualVersions.join(', ')}]`,
    );
  }

  for (let index = 0; index < expectedVersions.length; index += 1) {
    if (actualVersions[index] !== expectedVersions[index]) {
      throw new Error(
        `${contextLabel} applied unexpected migration history. `
        + `expected=[${expectedVersions.join(', ')}] actual=[${actualVersions.join(', ')}]`,
      );
    }
  }

  return actualVersions;
}

export function assertResetReplay({
  adminDbUrl,
  args,
  assertAppliedHistoryImpl = assertAppliedMigrationHistory,
  command = 'supabase',
  contextLabel,
  expectedVersions,
  repoRoot,
  result,
  runCommandImpl = runCommand,
}) {
  if (!result.ok && !isRecoverablePostResetRestartFailure(result.stderr)) {
    throw new Error(formatCommandFailure(command, args, result));
  }

  try {
    assertAppliedHistoryImpl({
      adminDbUrl,
      contextLabel,
      expectedVersions,
      repoRoot,
      runCommandImpl,
    });
  } catch (error) {
    if (!result.ok) {
      throw new Error([
        formatCommandFailure(command, args, result),
        error instanceof Error ? error.message : String(error),
      ].join('\n'));
    }

    throw error;
  }
}
