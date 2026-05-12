import { describe, expect, it } from 'vitest';

import {
  assertResetReplay,
  isRecoverablePostResetRestartFailure,
} from './sql-verify-common.mjs';

const STORAGE_TIMEOUT_ERROR = [
  'Restarting containers...',
  'failed to execute http request: Get "http://127.0.0.1:54321/storage/v1/bucket":',
  'context deadline exceeded (Client.Timeout exceeded while awaiting headers)',
].join('\n');

describe('sql-verify-common', () => {
  it('recognizes the known restart 502 as recoverable', () => {
    expect(isRecoverablePostResetRestartFailure(
      'Restarting containers...\nError status 502: An invalid response was received from the upstream server',
    )).toBe(true);
  });

  it('recognizes the storage timeout restart failure as recoverable', () => {
    expect(isRecoverablePostResetRestartFailure(STORAGE_TIMEOUT_ERROR)).toBe(true);
  });

  it('does not treat timeout failures outside the restart phase as recoverable', () => {
    expect(isRecoverablePostResetRestartFailure(
      'failed to execute http request: Get "http://127.0.0.1:54321/storage/v1/bucket": context deadline exceeded',
    )).toBe(false);
  });

  it('throws a combined error when a recoverable restart failure still has mismatched history', () => {
    expect(() => assertResetReplay({
      adminDbUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      args: ['db', 'reset', '--local', '--yes'],
      assertAppliedHistoryImpl: () => {
        throw new Error('history mismatch');
      },
      contextLabel: 'SQL reset replay',
      expectedVersions: ['00000000000000'],
      repoRoot: '/tmp/rocketboard',
      result: {
        ok: false,
        status: 1,
        stdout: '',
        stderr: STORAGE_TIMEOUT_ERROR,
      },
      runCommandImpl: () => {},
    })).toThrow('history mismatch');
  });

  it('throws immediately for non-restart failures before history verification', () => {
    let historyChecked = false;

    expect(() => assertResetReplay({
      adminDbUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      args: ['db', 'reset', '--local', '--yes'],
      assertAppliedHistoryImpl: () => {
        historyChecked = true;
      },
      contextLabel: 'SQL reset replay',
      expectedVersions: ['00000000000000'],
      repoRoot: '/tmp/rocketboard',
      result: {
        ok: false,
        status: 1,
        stdout: '',
        stderr: 'failed to execute http request: Get "http://127.0.0.1:54321/storage/v1/bucket": context deadline exceeded',
      },
      runCommandImpl: () => {},
    })).toThrow('Command failed: supabase db reset --local --yes');

    expect(historyChecked).toBe(false);
  });
});
