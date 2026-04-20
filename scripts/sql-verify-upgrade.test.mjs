import { describe, expect, it } from 'vitest';

import { verifyUpgrade } from './sql-verify-upgrade.mjs';

const STORAGE_TIMEOUT_ERROR = [
  'Restarting containers...',
  'failed to execute http request: Get "http://127.0.0.1:54321/storage/v1/bucket":',
  'context deadline exceeded (Client.Timeout exceeded while awaiting headers)',
].join('\n');

function createRunCommandStub(handler) {
  const calls = [];

  const runCommandImpl = (call) => {
    calls.push(call);
    return handler(call, calls.length - 1);
  };

  return {
    calls,
    runCommandImpl,
  };
}

describe('sql-verify-upgrade', () => {
  it('requires a base ref', () => {
    expect(() => verifyUpgrade()).toThrow('sql:verify:upgrade requires --from-ref <git-ref>.');
  });

  it('resets from the base ref and then replays the current branch', () => {
    const stub = createRunCommandStub((call, index) => {
      if (index === 0) {
        return {
          ok: true,
          status: 0,
          stdout: 'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"\n',
          stderr: '',
        };
      }

      return { ok: true, status: 0, stdout: '', stderr: '' };
    });
    const historyCalls = [];
    const removedPaths = [];

    const result = verifyUpgrade({
      assertAppliedHistoryImpl: (call) => {
        historyCalls.push(call);
      },
      createTempWorktreeImpl: () => '/tmp/rocketboard-upgrade-fixture',
      fromRef: 'origin/main',
      loadExpectedVersionsImpl: ({ repoRoot }) => (
        repoRoot === '/tmp/rocketboard-upgrade-fixture'
          ? ['00000000000000', '20260410120000']
          : ['00000000000000', '20260410120000', '20260412123045']
      ),
      removeDirectoryImpl: (targetPath) => {
        removedPaths.push(targetPath);
      },
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
        args: ['worktree', 'add', '--detach', '/tmp/rocketboard-upgrade-fixture', 'origin/main'],
        command: 'git',
        cwd: '/tmp/rocketboard',
      },
      {
        allowFailure: true,
        args: ['db', 'reset', '--local', '--yes', '--no-seed'],
        command: 'supabase',
        cwd: '/tmp/rocketboard-upgrade-fixture',
      },
      {
        args: [
          'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
          '-v',
          'ON_ERROR_STOP=1',
          '-f',
          '/tmp/rocketboard/scripts/consolidation-cutover-2026-04.sql',
        ],
        command: 'psql',
        cwd: '/tmp/rocketboard',
      },
      {
        args: ['db', 'push', '--local', '--yes'],
        command: 'supabase',
        cwd: '/tmp/rocketboard',
      },
      {
        allowFailure: true,
        args: ['worktree', 'remove', '--force', '/tmp/rocketboard-upgrade-fixture'],
        command: 'git',
        cwd: '/tmp/rocketboard',
      },
    ]);
    expect(removedPaths).toEqual(['/tmp/rocketboard-upgrade-fixture']);
    expect(historyCalls).toEqual([
      {
        adminDbUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        contextLabel: 'SQL base-ref reset replay',
        expectedVersions: ['00000000000000', '20260410120000'],
        repoRoot: '/tmp/rocketboard',
        runCommandImpl: stub.runCommandImpl,
      },
      {
        adminDbUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        contextLabel: 'SQL upgrade replay against origin/main',
        expectedVersions: ['00000000000000', '20260410120000', '20260412123045'],
        repoRoot: '/tmp/rocketboard',
        runCommandImpl: stub.runCommandImpl,
      },
    ]);
  });

  it('tolerates the known reset restart 502 only when the base history matches expected versions', () => {
    const stub = createRunCommandStub((call, index) => {
      if (index === 0) {
        return {
          ok: true,
          status: 0,
          stdout: 'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"\n',
          stderr: '',
        };
      }

      if (call.command === 'supabase' && call.args[0] === 'db' && call.args[1] === 'reset') {
        return {
          ok: false,
          status: 1,
          stdout: '',
          stderr: 'Restarting containers...\nError status 502: An invalid response was received from the upstream server',
        };
      }

      return { ok: true, status: 0, stdout: '', stderr: '' };
    });
    const historyCalls = [];

    verifyUpgrade({
      assertAppliedHistoryImpl: (call) => {
        historyCalls.push(call);
      },
      createTempWorktreeImpl: () => '/tmp/rocketboard-upgrade-fixture',
      fromRef: 'origin/main',
      loadExpectedVersionsImpl: ({ repoRoot }) => (
        repoRoot === '/tmp/rocketboard-upgrade-fixture'
          ? ['00000000000000', '20260410120000']
          : ['00000000000000', '20260410120000', '20260412123045']
      ),
      removeDirectoryImpl: () => {},
      repoRoot: '/tmp/rocketboard',
      runCommandImpl: stub.runCommandImpl,
    });

    expect(stub.calls).toContainEqual({
      args: ['db', 'push', '--local', '--yes'],
      command: 'supabase',
      cwd: '/tmp/rocketboard',
    });
    expect(historyCalls).toEqual([
      {
        adminDbUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        contextLabel: 'SQL base-ref reset replay',
        expectedVersions: ['00000000000000', '20260410120000'],
        repoRoot: '/tmp/rocketboard',
        runCommandImpl: stub.runCommandImpl,
      },
      {
        adminDbUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        contextLabel: 'SQL upgrade replay against origin/main',
        expectedVersions: ['00000000000000', '20260410120000', '20260412123045'],
        repoRoot: '/tmp/rocketboard',
        runCommandImpl: stub.runCommandImpl,
      },
    ]);
  });

  it('fails when reset returns the known 502 but base history verification does not pass', () => {
    const stub = createRunCommandStub((call, index) => {
      if (index === 0) {
        return {
          ok: true,
          status: 0,
          stdout: 'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"\n',
          stderr: '',
        };
      }

      if (call.command === 'supabase' && call.args[0] === 'db' && call.args[1] === 'reset') {
        return {
          ok: false,
          status: 1,
          stdout: '',
          stderr: 'Restarting containers...\nError status 502: An invalid response was received from the upstream server',
        };
      }

      return { ok: true, status: 0, stdout: '', stderr: '' };
    });

    expect(() => verifyUpgrade({
      assertAppliedHistoryImpl: ({ contextLabel }) => {
        if (contextLabel === 'SQL base-ref reset replay') {
          throw new Error('history mismatch');
        }
      },
      createTempWorktreeImpl: () => '/tmp/rocketboard-upgrade-fixture',
      fromRef: 'origin/main',
      loadExpectedVersionsImpl: ({ repoRoot }) => (
        repoRoot === '/tmp/rocketboard-upgrade-fixture'
          ? ['00000000000000', '20260410120000']
          : ['00000000000000', '20260410120000', '20260412123045']
      ),
      removeDirectoryImpl: () => {},
      repoRoot: '/tmp/rocketboard',
      runCommandImpl: stub.runCommandImpl,
    })).toThrow('history mismatch');
  });

  it('tolerates the storage timeout restart failure only when the base history matches expected versions', () => {
    const stub = createRunCommandStub((call, index) => {
      if (index === 0) {
        return {
          ok: true,
          status: 0,
          stdout: 'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"\n',
          stderr: '',
        };
      }

      if (call.command === 'supabase' && call.args[0] === 'db' && call.args[1] === 'reset') {
        return {
          ok: false,
          status: 1,
          stdout: '',
          stderr: STORAGE_TIMEOUT_ERROR,
        };
      }

      return { ok: true, status: 0, stdout: '', stderr: '' };
    });
    const historyCalls = [];

    verifyUpgrade({
      assertAppliedHistoryImpl: (call) => {
        historyCalls.push(call);
      },
      createTempWorktreeImpl: () => '/tmp/rocketboard-upgrade-fixture',
      fromRef: 'origin/main',
      loadExpectedVersionsImpl: ({ repoRoot }) => (
        repoRoot === '/tmp/rocketboard-upgrade-fixture'
          ? ['00000000000000', '20260410120000']
          : ['00000000000000', '20260410120000', '20260412123045']
      ),
      removeDirectoryImpl: () => {},
      repoRoot: '/tmp/rocketboard',
      runCommandImpl: stub.runCommandImpl,
    });

    expect(historyCalls).toEqual([
      {
        adminDbUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        contextLabel: 'SQL base-ref reset replay',
        expectedVersions: ['00000000000000', '20260410120000'],
        repoRoot: '/tmp/rocketboard',
        runCommandImpl: stub.runCommandImpl,
      },
      {
        adminDbUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        contextLabel: 'SQL upgrade replay against origin/main',
        expectedVersions: ['00000000000000', '20260410120000', '20260412123045'],
        repoRoot: '/tmp/rocketboard',
        runCommandImpl: stub.runCommandImpl,
      },
    ]);
  });

  it('fails when the storage timeout restart failure still has mismatched base history', () => {
    const stub = createRunCommandStub((call, index) => {
      if (index === 0) {
        return {
          ok: true,
          status: 0,
          stdout: 'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"\n',
          stderr: '',
        };
      }

      if (call.command === 'supabase' && call.args[0] === 'db' && call.args[1] === 'reset') {
        return {
          ok: false,
          status: 1,
          stdout: '',
          stderr: STORAGE_TIMEOUT_ERROR,
        };
      }

      return { ok: true, status: 0, stdout: '', stderr: '' };
    });

    expect(() => verifyUpgrade({
      assertAppliedHistoryImpl: ({ contextLabel }) => {
        if (contextLabel === 'SQL base-ref reset replay') {
          throw new Error('history mismatch');
        }
      },
      createTempWorktreeImpl: () => '/tmp/rocketboard-upgrade-fixture',
      fromRef: 'origin/main',
      loadExpectedVersionsImpl: ({ repoRoot }) => (
        repoRoot === '/tmp/rocketboard-upgrade-fixture'
          ? ['00000000000000', '20260410120000']
          : ['00000000000000', '20260410120000', '20260412123045']
      ),
      removeDirectoryImpl: () => {},
      repoRoot: '/tmp/rocketboard',
      runCommandImpl: stub.runCommandImpl,
    })).toThrow('history mismatch');
  });

  it('fails closed when the storage timeout happens before the restart phase', () => {
    const stub = createRunCommandStub((call, index) => {
      if (index === 0) {
        return {
          ok: true,
          status: 0,
          stdout: 'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"\n',
          stderr: '',
        };
      }

      if (call.command === 'supabase' && call.args[0] === 'db' && call.args[1] === 'reset') {
        return {
          ok: false,
          status: 1,
          stdout: '',
          stderr: 'failed to execute http request: Get "http://127.0.0.1:54321/storage/v1/bucket": context deadline exceeded (Client.Timeout exceeded while awaiting headers)',
        };
      }

      return { ok: true, status: 0, stdout: '', stderr: '' };
    });

    expect(() => verifyUpgrade({
      assertAppliedHistoryImpl: () => {
        throw new Error('should not reach history check');
      },
      createTempWorktreeImpl: () => '/tmp/rocketboard-upgrade-fixture',
      fromRef: 'origin/main',
      loadExpectedVersionsImpl: ({ repoRoot }) => (
        repoRoot === '/tmp/rocketboard-upgrade-fixture'
          ? ['00000000000000', '20260410120000']
          : ['00000000000000', '20260410120000', '20260412123045']
      ),
      removeDirectoryImpl: () => {},
      repoRoot: '/tmp/rocketboard',
      runCommandImpl: stub.runCommandImpl,
    })).toThrow('Command failed: supabase db reset --local --yes --no-seed');
  });

  it('cleans up the temporary worktree when replay fails', () => {
    const stub = createRunCommandStub((call, index) => {
      if (index === 0) {
        return {
          ok: true,
          status: 0,
          stdout: 'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"\n',
          stderr: '',
        };
      }

      if (call.command === 'supabase' && call.args[0] === 'db' && call.args[1] === 'push') {
        throw new Error('push failed');
      }

      return { ok: true, status: 0, stdout: '', stderr: '' };
    });
    const removedPaths = [];

    expect(() => verifyUpgrade({
      assertAppliedHistoryImpl: () => {},
      createTempWorktreeImpl: () => '/tmp/rocketboard-upgrade-fixture',
      fromRef: 'origin/main',
      loadExpectedVersionsImpl: ({ repoRoot }) => (
        repoRoot === '/tmp/rocketboard-upgrade-fixture'
          ? ['00000000000000', '20260410120000']
          : ['00000000000000', '20260410120000', '20260412123045']
      ),
      removeDirectoryImpl: (targetPath) => {
        removedPaths.push(targetPath);
      },
      repoRoot: '/tmp/rocketboard',
      runCommandImpl: stub.runCommandImpl,
    })).toThrow('push failed');

    expect(stub.calls.at(-1)).toEqual({
      allowFailure: true,
      args: ['worktree', 'remove', '--force', '/tmp/rocketboard-upgrade-fixture'],
      command: 'git',
      cwd: '/tmp/rocketboard',
    });
    expect(removedPaths).toEqual(['/tmp/rocketboard-upgrade-fixture']);
  });
});
