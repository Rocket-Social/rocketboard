import { describe, expect, it } from 'vitest';

import { verifyReset } from './sql-verify-reset.mjs';

const STORAGE_TIMEOUT_ERROR = [
  'Restarting containers...',
  'failed to execute http request: Get "http://127.0.0.1:54321/storage/v1/bucket":',
  'context deadline exceeded (Client.Timeout exceeded while awaiting headers)',
].join('\n');

function createRunCommandStub(results) {
  const calls = [];
  let index = 0;

  const runCommandImpl = (call) => {
    calls.push(call);
    const result = results[index] ?? { ok: true, status: 0, stdout: '', stderr: '' };
    index += 1;
    return result;
  };

  return {
    calls,
    runCommandImpl,
  };
}

describe('sql-verify-reset', () => {
  it('resets immediately when the local Supabase stack is already running', () => {
    const stub = createRunCommandStub([
      { ok: true, status: 0, stdout: 'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"\n', stderr: '' },
      { ok: true, status: 0, stdout: '', stderr: '' },
    ]);
    const historyCalls = [];

    const result = verifyReset({
      assertAppliedHistoryImpl: (call) => {
        historyCalls.push(call);
      },
      loadExpectedVersionsImpl: () => ['00000000000000', '20260412123045'],
      repoRoot: '/tmp/rocketboard',
      runCommandImpl: stub.runCommandImpl,
    });

    expect(result.startedLocalStack).toBe(false);
    expect(stub.calls).toEqual([
      {
        allowFailure: true,
        args: ['status', '-o', 'env'],
        command: 'supabase',
        cwd: '/tmp/rocketboard',
      },
      {
        allowFailure: true,
        args: ['db', 'reset', '--local', '--yes'],
        command: 'supabase',
        cwd: '/tmp/rocketboard',
      },
    ]);
    expect(historyCalls).toEqual([
      {
        adminDbUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        contextLabel: 'SQL reset replay',
        expectedVersions: ['00000000000000', '20260412123045'],
        repoRoot: '/tmp/rocketboard',
        runCommandImpl: stub.runCommandImpl,
      },
    ]);
  });

  it('starts the local Supabase stack before resetting when status fails', () => {
    const stub = createRunCommandStub([
      { ok: false, status: 1, stdout: '', stderr: 'not running' },
      { ok: true, status: 0, stdout: '', stderr: '' },
      { ok: true, status: 0, stdout: 'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"\n', stderr: '' },
      { ok: true, status: 0, stdout: '', stderr: '' },
    ]);
    const historyCalls = [];

    const result = verifyReset({
      assertAppliedHistoryImpl: (call) => {
        historyCalls.push(call);
      },
      loadExpectedVersionsImpl: () => ['00000000000000', '20260412123045'],
      repoRoot: '/tmp/rocketboard',
      runCommandImpl: stub.runCommandImpl,
    });

    expect(result.startedLocalStack).toBe(true);
    expect(stub.calls).toEqual([
      {
        allowFailure: true,
        args: ['status', '-o', 'env'],
        command: 'supabase',
        cwd: '/tmp/rocketboard',
      },
      {
        allowFailure: true,
        args: ['start'],
        command: 'supabase',
        cwd: '/tmp/rocketboard',
      },
      {
        allowFailure: true,
        args: ['status', '-o', 'env'],
        command: 'supabase',
        cwd: '/tmp/rocketboard',
      },
      {
        allowFailure: true,
        args: ['db', 'reset', '--local', '--yes'],
        command: 'supabase',
        cwd: '/tmp/rocketboard',
      },
    ]);
    expect(historyCalls).toHaveLength(1);
  });

  it('retries supabase start once when startup fails mid-pull but status still reports not running', () => {
    const stub = createRunCommandStub([
      { ok: false, status: 1, stdout: '', stderr: 'not running' },
      {
        ok: false,
        signal: 'SIGTERM',
        status: 1,
        stdout: '',
        stderr: 'edge-runtime Pulling\npostgres Pulling',
      },
      { ok: false, status: 1, stdout: '', stderr: 'not running' },
      { ok: true, status: 0, stdout: '', stderr: '' },
      { ok: true, status: 0, stdout: 'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"\n', stderr: '' },
      { ok: true, status: 0, stdout: '', stderr: '' },
    ]);
    const historyCalls = [];

    const result = verifyReset({
      assertAppliedHistoryImpl: (call) => {
        historyCalls.push(call);
      },
      loadExpectedVersionsImpl: () => ['00000000000000', '20260412123045'],
      repoRoot: '/tmp/rocketboard',
      runCommandImpl: stub.runCommandImpl,
    });

    expect(result.startedLocalStack).toBe(true);
    expect(stub.calls).toEqual([
      {
        allowFailure: true,
        args: ['status', '-o', 'env'],
        command: 'supabase',
        cwd: '/tmp/rocketboard',
      },
      {
        allowFailure: true,
        args: ['start'],
        command: 'supabase',
        cwd: '/tmp/rocketboard',
      },
      {
        allowFailure: true,
        args: ['status', '-o', 'env'],
        command: 'supabase',
        cwd: '/tmp/rocketboard',
      },
      {
        allowFailure: true,
        args: ['start'],
        command: 'supabase',
        cwd: '/tmp/rocketboard',
      },
      {
        allowFailure: true,
        args: ['status', '-o', 'env'],
        command: 'supabase',
        cwd: '/tmp/rocketboard',
      },
      {
        allowFailure: true,
        args: ['db', 'reset', '--local', '--yes'],
        command: 'supabase',
        cwd: '/tmp/rocketboard',
      },
    ]);
    expect(historyCalls).toHaveLength(1);
  });

  it('fails immediately when supabase start hits a non-retryable local Docker error', () => {
    const stub = createRunCommandStub([
      { ok: false, status: 1, stdout: '', stderr: 'not running' },
      {
        ok: false,
        status: 1,
        stdout: '',
        stderr: 'failed to inspect service: Cannot connect to the Docker daemon at unix:///tmp/docker.sock. Is the docker daemon running?',
      },
      {
        ok: false,
        status: 1,
        stdout: '',
        stderr: 'failed to inspect service: Cannot connect to the Docker daemon at unix:///tmp/docker.sock. Is the docker daemon running?',
      },
    ]);

    expect(() => verifyReset({
      assertAppliedHistoryImpl: () => {},
      loadExpectedVersionsImpl: () => ['00000000000000', '20260412123045'],
      repoRoot: '/tmp/rocketboard',
      runCommandImpl: stub.runCommandImpl,
    })).toThrow('Unable to start local Supabase stack after 1 attempt.');

    expect(stub.calls).toEqual([
      {
        allowFailure: true,
        args: ['status', '-o', 'env'],
        command: 'supabase',
        cwd: '/tmp/rocketboard',
      },
      {
        allowFailure: true,
        args: ['start'],
        command: 'supabase',
        cwd: '/tmp/rocketboard',
      },
      {
        allowFailure: true,
        args: ['status', '-o', 'env'],
        command: 'supabase',
        cwd: '/tmp/rocketboard',
      },
    ]);
  });

  it('tolerates the known reset restart 502 only when migration history matches expected versions', () => {
    const stub = createRunCommandStub([
      { ok: true, status: 0, stdout: 'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"\n', stderr: '' },
      {
        ok: false,
        status: 1,
        stdout: '',
        stderr: 'Restarting containers...\nError status 502: An invalid response was received from the upstream server',
      },
    ]);
    const historyCalls = [];

    verifyReset({
      assertAppliedHistoryImpl: (call) => {
        historyCalls.push(call);
      },
      loadExpectedVersionsImpl: () => ['00000000000000', '20260412123045'],
      repoRoot: '/tmp/rocketboard',
      runCommandImpl: stub.runCommandImpl,
    });

    expect(stub.calls).toHaveLength(2);
    expect(historyCalls).toEqual([
      {
        adminDbUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        contextLabel: 'SQL reset replay',
        expectedVersions: ['00000000000000', '20260412123045'],
        repoRoot: '/tmp/rocketboard',
        runCommandImpl: stub.runCommandImpl,
      },
    ]);
  });

  it('fails when reset returns the known 502 but migration history verification does not pass', () => {
    const stub = createRunCommandStub([
      { ok: true, status: 0, stdout: 'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"\n', stderr: '' },
      {
        ok: false,
        status: 1,
        stdout: '',
        stderr: 'Restarting containers...\nError status 502: An invalid response was received from the upstream server',
      },
    ]);

    expect(() => verifyReset({
      assertAppliedHistoryImpl: () => {
        throw new Error('history mismatch');
      },
      loadExpectedVersionsImpl: () => ['00000000000000', '20260412123045'],
      repoRoot: '/tmp/rocketboard',
      runCommandImpl: stub.runCommandImpl,
    })).toThrow('history mismatch');
  });

  it('tolerates the storage timeout restart failure only when migration history matches expected versions', () => {
    const stub = createRunCommandStub([
      { ok: true, status: 0, stdout: 'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"\n', stderr: '' },
      {
        ok: false,
        status: 1,
        stdout: '',
        stderr: STORAGE_TIMEOUT_ERROR,
      },
    ]);
    const historyCalls = [];

    verifyReset({
      assertAppliedHistoryImpl: (call) => {
        historyCalls.push(call);
      },
      loadExpectedVersionsImpl: () => ['00000000000000', '20260412123045'],
      repoRoot: '/tmp/rocketboard',
      runCommandImpl: stub.runCommandImpl,
    });

    expect(historyCalls).toHaveLength(1);
  });

  it('fails when the storage timeout restart failure still has mismatched migration history', () => {
    const stub = createRunCommandStub([
      { ok: true, status: 0, stdout: 'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"\n', stderr: '' },
      {
        ok: false,
        status: 1,
        stdout: '',
        stderr: STORAGE_TIMEOUT_ERROR,
      },
    ]);

    expect(() => verifyReset({
      assertAppliedHistoryImpl: () => {
        throw new Error('history mismatch');
      },
      loadExpectedVersionsImpl: () => ['00000000000000', '20260412123045'],
      repoRoot: '/tmp/rocketboard',
      runCommandImpl: stub.runCommandImpl,
    })).toThrow('history mismatch');
  });

  it('fails closed on the storage timeout when reset never reached the restart phase', () => {
    const stub = createRunCommandStub([
      { ok: true, status: 0, stdout: 'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"\n', stderr: '' },
      {
        ok: false,
        status: 1,
        stdout: '',
        stderr: 'failed to execute http request: Get "http://127.0.0.1:54321/storage/v1/bucket": context deadline exceeded (Client.Timeout exceeded while awaiting headers)',
      },
    ]);

    expect(() => verifyReset({
      assertAppliedHistoryImpl: () => {
        throw new Error('should not reach history check');
      },
      loadExpectedVersionsImpl: () => ['00000000000000', '20260412123045'],
      repoRoot: '/tmp/rocketboard',
      runCommandImpl: stub.runCommandImpl,
    })).toThrow('Command failed: supabase db reset --local --yes');
  });
});
