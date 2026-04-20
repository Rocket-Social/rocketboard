import { describe, expect, it } from 'vitest';

import {
  buildCleanupPlan,
  buildJanitorReport,
  formatCommandFailure,
} from './git-janitor.mjs';

function makeBranch(overrides = {}) {
  return {
    kind: 'branch',
    name: 'codex/example',
    headSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    upstream: 'origin/codex/example',
    upstreamTrack: '',
    worktreePath: '/tmp/codex-example',
    remoteRefExists: true,
    headInMain: false,
    ...overrides,
  };
}

function makeWorktree(overrides = {}) {
  return {
    path: '/tmp/codex-example',
    headSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    branchName: 'codex/example',
    detached: false,
    dirty: false,
    ...overrides,
  };
}

function makePr(overrides = {}) {
  return {
    number: 42,
    headRefName: 'codex/example',
    baseRefName: 'main',
    state: 'OPEN',
    mergedAt: null,
    updatedAt: '2026-04-08T20:00:00Z',
    mergeCommit: null,
    title: 'Example PR',
    url: 'https://github.com/acme-org/rocketboard/pull/42',
    ...overrides,
  };
}

function makeRun(overrides = {}) {
  return {
    databaseId: 1,
    headSha: 'cccccccccccccccccccccccccccccccccccccccc',
    status: 'completed',
    conclusion: 'success',
    workflowName: 'Deploy Hosted',
    displayTitle: 'production:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:sql,edge,frontend',
    url: 'https://github.com/acme-org/rocketboard/actions/runs/1',
    createdAt: '2026-04-08T20:05:00Z',
    ...overrides,
  };
}

function buildReportFixture(overrides = {}) {
  return buildJanitorReport({
    branches: overrides.branches ?? [makeBranch()],
    worktrees: overrides.worktrees ?? [makeWorktree()],
    prs: overrides.prs ?? [],
    deployRuns: overrides.deployRuns ?? [],
    currentBranch: overrides.currentBranch ?? 'codex/git-janitor',
    isAncestorCommit: overrides.isAncestorCommit,
  });
}

describe('git janitor branch prefixes', () => {
  it('reports the current task prefix and tracks legacy prefixes in the report', () => {
    const report = buildReportFixture();

    expect(report.branchPrefix).toBe('task/');
    expect(report.legacyBranchPrefixes).toEqual(['codex/']);
  });

  it('classifies both task/ and codex/ branches when present side by side', () => {
    const report = buildReportFixture({
      branches: [
        makeBranch({ name: 'task/fresh-example', upstream: 'origin/task/fresh-example' }),
        makeBranch({ name: 'codex/legacy-example', upstream: 'origin/codex/legacy-example' }),
      ],
      worktrees: [],
    });

    expect(report.branches.map((branch) => branch.name).sort()).toEqual([
      'codex/legacy-example',
      'task/fresh-example',
    ]);
  });
});

describe('git janitor branch status', () => {
  it('treats merged branches as live when a production deploy targets the merge commit sha', () => {
    const report = buildReportFixture({
      branches: [
        makeBranch({
          upstreamTrack: '[gone]',
          remoteRefExists: false,
          headInMain: false,
        }),
      ],
      prs: [
        makePr({
          state: 'MERGED',
          mergedAt: '2026-04-08T20:00:00Z',
          mergeCommit: {
            oid: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          },
        }),
      ],
      deployRuns: [makeRun()],
    });

    expect(report.branches[0].status).toBe('live');
    expect(report.branches[0].cleanupEligible).toBe(true);
  });

  it('treats merged branches as live when a later production deploy targets a descendant sha', () => {
    const report = buildReportFixture({
      branches: [
        makeBranch({
          upstreamTrack: '[gone]',
          remoteRefExists: false,
          headInMain: false,
        }),
      ],
      prs: [
        makePr({
          state: 'MERGED',
          mergedAt: '2026-04-08T20:00:00Z',
          mergeCommit: {
            oid: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          },
        }),
      ],
      deployRuns: [
        makeRun({
          displayTitle: 'production:dddddddddddddddddddddddddddddddddddddddd:sql,edge,frontend',
        }),
      ],
      isAncestorCommit: (ancestor, descendant) =>
        ancestor === 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
        && descendant === 'dddddddddddddddddddddddddddddddddddddddd',
    });

    expect(report.branches[0].status).toBe('live');
    expect(report.branches[0].cleanupEligible).toBe(true);
  });

  it('treats workflow-only merges as live when the successful production run head sha matches the merge commit', () => {
    const report = buildReportFixture({
      branches: [
        makeBranch({
          upstreamTrack: '[gone]',
          remoteRefExists: false,
          headInMain: false,
        }),
      ],
      prs: [
        makePr({
          state: 'MERGED',
          mergedAt: '2026-04-08T20:00:00Z',
          mergeCommit: {
            oid: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          },
        }),
      ],
      deployRuns: [
        makeRun({
          headSha: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          displayTitle: 'production:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:sql,edge,frontend',
        }),
      ],
    });

    expect(report.branches[0].status).toBe('live');
    expect(report.branches[0].cleanupEligible).toBe(true);
  });

  it('marks open PR branches as open-pr and never cleanup eligible', () => {
    const report = buildReportFixture({
      prs: [makePr({ state: 'OPEN' })],
    });

    expect(report.branches[0].status).toBe('open-pr');
    expect(report.branches[0].cleanupEligible).toBe(false);
    expect(report.branches[0].cleanupReason).toBe('PR still open');
  });

  it('marks local branches with no PR as no-pr', () => {
    const report = buildReportFixture();

    expect(report.branches[0].status).toBe('no-pr');
    expect(report.branches[0].cleanupEligible).toBe(false);
    expect(report.branches[0].cleanupReason).toBe('no merged PR to main');
  });

  it('marks dirty worktrees as dirty-local and skips cleanup', () => {
    const report = buildReportFixture({
      worktrees: [makeWorktree({ dirty: true })],
      prs: [
        makePr({
          state: 'MERGED',
          mergedAt: '2026-04-08T20:00:00Z',
          mergeCommit: {
            oid: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          },
        }),
      ],
      deployRuns: [makeRun()],
    });

    expect(report.branches[0].status).toBe('dirty-local');
    expect(report.branches[0].cleanupEligible).toBe(false);
    expect(report.branches[0].cleanupReason).toBe('dirty worktree');
  });

  it('skips the current branch even when it is otherwise live', () => {
    const report = buildReportFixture({
      currentBranch: 'codex/example',
      branches: [makeBranch({ upstreamTrack: '[gone]' })],
      prs: [
        makePr({
          state: 'MERGED',
          mergedAt: '2026-04-08T20:00:00Z',
          mergeCommit: {
            oid: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          },
        }),
      ],
      deployRuns: [makeRun()],
    });

    expect(report.branches[0].status).toBe('live');
    expect(report.branches[0].cleanupEligible).toBe(false);
    expect(report.branches[0].cleanupReason).toBe('current branch');
  });

  it('keeps merged branches at merged-to-main when deploy is pending or failed', () => {
    const pendingReport = buildReportFixture({
      branches: [makeBranch({ upstreamTrack: '[gone]' })],
      prs: [
        makePr({
          state: 'MERGED',
          mergedAt: '2026-04-08T20:00:00Z',
          mergeCommit: {
            oid: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          },
        }),
      ],
      deployRuns: [
        makeRun({
          displayTitle: 'production:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:sql,edge,frontend',
          status: 'in_progress',
          conclusion: '',
        }),
      ],
    });

    const failedReport = buildReportFixture({
      branches: [makeBranch({ upstreamTrack: '[gone]' })],
      prs: [
        makePr({
          state: 'MERGED',
          mergedAt: '2026-04-08T20:00:00Z',
          mergeCommit: {
            oid: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          },
        }),
      ],
      deployRuns: [
        makeRun({
          displayTitle: 'production:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:sql,edge,frontend',
          conclusion: 'failure',
        }),
      ],
    });

    expect(pendingReport.branches[0].status).toBe('merged-to-main');
    expect(pendingReport.branches[0].cleanupEligible).toBe(false);
    expect(failedReport.branches[0].status).toBe('merged-to-main');
    expect(failedReport.branches[0].cleanupEligible).toBe(false);
  });

  it('does not treat staging-only deploy success as live', () => {
    const report = buildReportFixture({
      branches: [makeBranch({ upstreamTrack: '[gone]' })],
      prs: [
        makePr({
          state: 'MERGED',
          mergedAt: '2026-04-08T20:00:00Z',
          mergeCommit: {
            oid: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          },
        }),
      ],
      deployRuns: [
        makeRun({
          displayTitle: 'staging:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:sql,edge,frontend',
        }),
      ],
    });

    expect(report.branches[0].status).toBe('merged-to-main');
    expect(report.branches[0].cleanupEligible).toBe(false);
  });

  it('reports stale-local when a clean branch tip is already reachable from main without a PR', () => {
    const report = buildReportFixture({
      branches: [makeBranch({ headInMain: true })],
    });

    expect(report.branches[0].status).toBe('stale-local');
    expect(report.branches[0].cleanupEligible).toBe(false);
  });
});

describe('git janitor cleanup plan', () => {
  it('produces a cleanup action for merged branches with gone remotes and green deploys', () => {
    const report = buildReportFixture({
      branches: [makeBranch({ upstreamTrack: '[gone]', remoteRefExists: false })],
      prs: [
        makePr({
          state: 'MERGED',
          mergedAt: '2026-04-08T20:00:00Z',
          mergeCommit: {
            oid: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          },
        }),
      ],
      deployRuns: [makeRun()],
    });

    const cleanup = buildCleanupPlan(report);

    expect(cleanup.eligible).toHaveLength(1);
    expect(cleanup.eligible[0]).toMatchObject({
      branchName: 'codex/example',
      worktreePath: '/tmp/codex-example',
    });
  });

  it('treats a merged branch with no upstream but no origin ref as cleanup eligible', () => {
    const report = buildReportFixture({
      branches: [
        makeBranch({
          upstream: null,
          upstreamTrack: '',
          remoteRefExists: false,
        }),
      ],
      prs: [
        makePr({
          state: 'MERGED',
          mergedAt: '2026-04-08T20:00:00Z',
          mergeCommit: {
            oid: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          },
        }),
      ],
      deployRuns: [makeRun()],
    });

    expect(report.branches[0].remoteGone).toBe(true);
    expect(report.branches[0].cleanupEligible).toBe(true);
  });

  it('reports detached worktrees but never auto-removes them', () => {
    const report = buildJanitorReport({
      branches: [],
      worktrees: [
        makeWorktree({
          branchName: null,
          detached: true,
          path: '/tmp/detached',
          headSha: 'cccccccccccccccccccccccccccccccccccccccc',
        }),
      ],
      prs: [],
      deployRuns: [],
      currentBranch: 'codex/git-janitor',
    });

    const cleanup = buildCleanupPlan(report);

    expect(report.detachedWorktrees).toHaveLength(1);
    expect(report.detachedWorktrees[0].status).toBe('stale-local');
    expect(cleanup.eligible).toHaveLength(0);
    expect(cleanup.skipped[0]).toMatchObject({
      kind: 'detached-worktree',
      reason: 'detached worktree',
    });
  });
});

describe('git janitor command failures', () => {
  it('adds a Codex sandbox hint for gh API connectivity failures', () => {
    const message = formatCommandFailure(
      'gh',
      ['pr', 'list'],
      'error connecting to api.github.com\ncheck your internet connection or https://githubstatus.com',
      { CODEX_SHELL: '1' },
    );

    expect(message).toContain('gh pr list failed: error connecting to api.github.com');
    expect(message).toContain('Codex Desktop');
    expect(message).toContain('outside the sandbox');
  });

  it('does not add the Codex hint for non-gh commands', () => {
    const message = formatCommandFailure(
      'git',
      ['status'],
      'fatal: not a git repository',
      { CODEX_SHELL: '1' },
    );

    expect(message).toBe('git status failed: fatal: not a git repository');
  });
});
