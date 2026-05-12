#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const MAIN_BRANCH = 'main';
const DEFAULT_PR_LIMIT = 500;
const DEFAULT_RUN_LIMIT = 200;
const DEPLOY_WORKFLOW_NAME = 'Deploy Hosted';
const LEGACY_DEPLOY_WORKFLOW_NAME = 'Deploy Pages';
const DEPLOY_WORKFLOW_NAMES = [DEPLOY_WORKFLOW_NAME, LEGACY_DEPLOY_WORKFLOW_NAME];
const TASK_BRANCH_PREFIX = 'task/';
const LEGACY_TASK_BRANCH_PREFIXES = ['codex/'];
const ALL_TASK_BRANCH_PREFIXES = [TASK_BRANCH_PREFIX, ...LEGACY_TASK_BRANCH_PREFIXES];
const STATUS_ORDER = [
  'dirty-local',
  'open-pr',
  'merged-to-main',
  'live',
  'stale-local',
  'no-pr',
];

function usage() {
  console.log(`Usage:
  node scripts/git-janitor.mjs status [--json] [--include-non-task]
  node scripts/git-janitor.mjs cleanup [--apply] [--json] [--include-non-task]

Commands:
  status   Show canonical local branch/worktree status.
  cleanup  Show or apply safe cleanup actions for stale local state.

Options:
  --apply              Apply cleanup actions. Default is dry-run.
  --json               Emit machine-readable JSON instead of a table.
  --include-non-task   Include non-task local branches in the report.
                       (alias: --include-non-codex for backward compat)
  --help               Show this help text.
`);
}

function compareIsoDesc(left, right) {
  return (Date.parse(right ?? '') || 0) - (Date.parse(left ?? '') || 0);
}

function statusRank(status) {
  const index = STATUS_ORDER.indexOf(status);
  return index === -1 ? STATUS_ORDER.length : index;
}

function prRank(pr) {
  if (!pr) {
    return 99;
  }

  if (pr.baseRefName !== MAIN_BRANCH) {
    return 50;
  }

  if (pr.state === 'OPEN') {
    return 0;
  }

  if (pr.state === 'MERGED') {
    return 1;
  }

  return 2;
}

function parseArgs(argv) {
  const flags = new Set(argv.slice(2));
  const command = argv[2] && !argv[2].startsWith('-') ? argv[2] : null;

  if (!command || flags.has('--help')) {
    return { command: 'help' };
  }

  if (command !== 'status' && command !== 'cleanup') {
    throw new Error(`Unknown command "${command}".`);
  }

  return {
    command,
    apply: flags.has('--apply'),
    json: flags.has('--json'),
    includeNonTask: flags.has('--include-non-task') || flags.has('--include-non-codex'),
  };
}

export function formatCommandFailure(command, args, message, env = process.env) {
  const base = `${command} ${args.join(' ')} failed: ${message}`;

  if (command !== 'gh' || env.CODEX_SHELL !== '1') {
    return base;
  }

  const looksLikeCodexSandboxGhFailure =
    message.includes('error connecting to api.github.com')
    || message.includes('Failed to log in to github.com account')
    || message.includes('The token in default is invalid');

  if (!looksLikeCodexSandboxGhFailure) {
    return base;
  }

  return `${base}
Hint: when git-janitor runs inside Codex Desktop, its child gh processes can lose GitHub network or keychain access. Re-run this janitor command outside the sandbox, or approve an unsandboxed run before retrying.`;
}

function runCommand(command, args, { cwd, allowFailure = false } = {}) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trimEnd();
  } catch (error) {
    if (allowFailure) {
      return null;
    }

    const stderr = error.stderr?.toString().trim();
    const message = stderr || error.message;
    throw new Error(formatCommandFailure(command, args, message));
  }
}

function runGit(cwd, args, options) {
  return runCommand('git', args, { cwd, ...options });
}

function runGh(cwd, args, options) {
  return runCommand('gh', args, { cwd, ...options });
}

function parseBranchRefs(text) {
  if (!text) {
    return [];
  }

  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, headSha, upstream, upstreamTrack, worktreePath] = line.split('\t');

      return {
        kind: 'branch',
        name,
        headSha,
        upstream: upstream || null,
        upstreamTrack: upstreamTrack || '',
        worktreePath: worktreePath || null,
      };
    });
}

export function parseWorktreeList(text) {
  if (!text) {
    return [];
  }

  const blocks = text.trim().split('\n\n');

  return blocks
    .filter(Boolean)
    .map((block) => {
      const worktree = {
        path: null,
        headSha: null,
        branchName: null,
        detached: false,
      };

      for (const line of block.split('\n')) {
        if (line.startsWith('worktree ')) {
          worktree.path = line.slice('worktree '.length);
        } else if (line.startsWith('HEAD ')) {
          worktree.headSha = line.slice('HEAD '.length);
        } else if (line.startsWith('branch refs/heads/')) {
          worktree.branchName = line.slice('branch refs/heads/'.length);
        } else if (line === 'detached') {
          worktree.detached = true;
        }
      }

      return worktree;
    });
}

function readJson(commandText) {
  if (!commandText) {
    return [];
  }

  return JSON.parse(commandText);
}

function selectPreferredPr(prs) {
  if (!prs || prs.length === 0) {
    return null;
  }

  return [...prs].sort((left, right) => {
    const rankDiff = prRank(left) - prRank(right);
    if (rankDiff !== 0) {
      return rankDiff;
    }

    return compareIsoDesc(left.updatedAt, right.updatedAt);
  })[0];
}

function latestPrsByHead(prs) {
  const byHead = new Map();

  for (const pr of prs) {
    const current = byHead.get(pr.headRefName) ?? [];
    current.push({
      ...pr,
      mergeCommitOid: pr.mergeCommit?.oid ?? null,
    });
    byHead.set(pr.headRefName, current);
  }

  return byHead;
}

function isSuccessfulDeployRun(run) {
  return Boolean(run && run.status === 'completed' && run.conclusion === 'success');
}

function parseDeployRunMetadata(displayTitle) {
  if (!displayTitle) {
    return {
      environment: null,
      targetSha: null,
    };
  }

  const [environment = null, maybeSha = null] = displayTitle.split(':', 3);
  const targetSha = /^[0-9a-f]{40}$/i.test(maybeSha ?? '') ? maybeSha : null;

  return {
    environment,
    targetSha,
  };
}

function normalizeDeployRun(run) {
  const metadata = parseDeployRunMetadata(run.displayTitle);

  return {
    ...run,
    deployEnvironment: metadata.environment,
    deployTargetSha: metadata.targetSha,
  };
}

function isSuccessfulProductionDeployRun(run) {
  if (!isSuccessfulDeployRun(run)) {
    return false;
  }

  if (run.deployEnvironment) {
    return run.deployEnvironment === 'production';
  }

  return run.workflowName === LEGACY_DEPLOY_WORKFLOW_NAME;
}

function createCommitInclusionChecker(isAncestorCommit = () => false) {
  return (commitOid, run) => {
    if (!commitOid || !run) {
      return false;
    }

    if (run.headSha === commitOid || run.deployTargetSha === commitOid) {
      return true;
    }

    if (run.deployTargetSha) {
      return isAncestorCommit(commitOid, run.deployTargetSha);
    }

    return isAncestorCommit(commitOid, run.headSha);
  };
}

function selectLatestRelevantDeployRun(commitOid, deployRuns, includesCommit) {
  if (!commitOid) {
    return null;
  }

  return [...deployRuns]
    .filter(isSuccessfulProductionDeployRun)
    .sort((left, right) => compareIsoDesc(left.createdAt, right.createdAt))
    .find((run) => includesCommit(commitOid, run)) ?? null;
}

function buildBranchNote({ branch, pr, deployRun, worktree, headInMain }) {
  if (worktree?.dirty) {
    return `dirty worktree at ${worktree.path}`;
  }

  if (pr?.state === 'OPEN' && pr.baseRefName === MAIN_BRANCH) {
    return `PR #${pr.number} is open`;
  }

  if (pr?.state === 'MERGED' && pr.baseRefName === MAIN_BRANCH) {
    if (isSuccessfulDeployRun(deployRun)) {
      return `PR #${pr.number} merged, ${DEPLOY_WORKFLOW_NAME} succeeded`;
    }

    if (!deployRun) {
      return `PR #${pr.number} merged, waiting for ${DEPLOY_WORKFLOW_NAME}`;
    }

    return `PR #${pr.number} merged, ${DEPLOY_WORKFLOW_NAME} ${deployRun.conclusion || deployRun.status}`;
  }

  if (pr?.state === 'CLOSED') {
    return `PR #${pr.number} closed without merge`;
  }

  if (headInMain) {
    return `branch tip already reachable from origin/${MAIN_BRANCH}`;
  }

  if (branch.upstreamTrack.includes('gone')) {
    return 'remote branch is gone';
  }

  return 'local branch has no PR';
}

export function classifyBranchRecord({ branch, currentBranch, pr, deployRun, worktree, headInMain }) {
  const worktreeDirty = Boolean(worktree?.dirty);
  const upstreamGone = branch.upstreamTrack.includes('gone');
  const remoteGone = !branch.remoteRefExists;
  const isCurrent = branch.name === currentBranch;

  let status = 'no-pr';

  if (worktreeDirty) {
    status = 'dirty-local';
  } else if (pr?.state === 'OPEN' && pr.baseRefName === MAIN_BRANCH) {
    status = 'open-pr';
  } else if (pr?.state === 'MERGED' && pr.baseRefName === MAIN_BRANCH) {
    status = isSuccessfulDeployRun(deployRun) ? 'live' : 'merged-to-main';
  } else if (pr?.state === 'CLOSED' || headInMain) {
    status = 'stale-local';
  }

  return {
    kind: 'branch',
    name: branch.name,
    headSha: branch.headSha,
    status,
    current: isCurrent,
      upstream: branch.upstream,
      upstreamGone,
      remoteGone,
      remoteRefExists: branch.remoteRefExists,
    worktreePath: branch.worktreePath,
    worktreeDirty,
    prNumber: pr?.number ?? null,
    prState: pr?.state ?? null,
    prTitle: pr?.title ?? null,
    prUrl: pr?.url ?? null,
    mergedAt: pr?.mergedAt ?? null,
    mergeCommitOid: pr?.mergeCommitOid ?? null,
    deployStatus: deployRun?.status ?? null,
    deployConclusion: deployRun?.conclusion ?? null,
    deployUrl: deployRun?.url ?? null,
    headInMain,
    note: buildBranchNote({ branch, pr, deployRun, worktree, headInMain }),
  };
}

export function classifyDetachedWorktreeRecord(worktree) {
  return {
    kind: 'detached-worktree',
    name: `detached:${worktree.headSha.slice(0, 7)}`,
    headSha: worktree.headSha,
    status: 'stale-local',
    current: false,
    upstream: null,
    upstreamGone: false,
    remoteGone: false,
    remoteRefExists: false,
    worktreePath: worktree.path,
    worktreeDirty: Boolean(worktree.dirty),
    prNumber: null,
    prState: null,
    prTitle: null,
    prUrl: null,
    mergedAt: null,
    mergeCommitOid: null,
    deployStatus: null,
    deployConclusion: null,
    deployUrl: null,
    headInMain: false,
    note: worktree.dirty
      ? `detached HEAD with local changes at ${worktree.path}`
      : `detached HEAD at ${worktree.path}`,
  };
}

export function evaluateCleanup(record) {
  if (record.kind !== 'branch') {
    return {
      eligible: false,
      reason: 'detached worktree',
    };
  }

  if (record.current) {
    return {
      eligible: false,
      reason: 'current branch',
    };
  }

  if (record.worktreeDirty) {
    return {
      eligible: false,
      reason: 'dirty worktree',
    };
  }

  if (record.prState !== 'MERGED') {
    return {
      eligible: false,
      reason: record.prState === 'OPEN' ? 'PR still open' : 'no merged PR to main',
    };
  }

  if (!record.remoteGone) {
    return {
      eligible: false,
      reason: 'remote branch still exists',
    };
  }

  if (record.status !== 'live') {
    return {
      eligible: false,
      reason: `${DEPLOY_WORKFLOW_NAME} is not green on ${MAIN_BRANCH}`,
    };
  }

  return {
    eligible: true,
    reason: 'safe to remove local branch/worktree',
  };
}

export function buildJanitorReport({
  branches,
  worktrees,
  prs,
  deployRuns,
  currentBranch,
  isAncestorCommit = () => false,
}) {
  const worktreesByBranch = new Map(
    worktrees
      .filter((worktree) => worktree.branchName)
      .map((worktree) => [worktree.branchName, worktree]),
  );
  const prsByHead = latestPrsByHead(prs);
  const normalizedDeployRuns = deployRuns.map(normalizeDeployRun);
  const includesCommit = createCommitInclusionChecker(isAncestorCommit);

  const branchRecords = branches
    .map((branch) => {
      const pr = selectPreferredPr(prsByHead.get(branch.name));
      const deployRun = pr?.mergeCommitOid
        ? selectLatestRelevantDeployRun(pr.mergeCommitOid, normalizedDeployRuns, includesCommit)
        : null;
      const worktree = branch.worktreePath ? worktreesByBranch.get(branch.name) ?? null : null;
      const record = classifyBranchRecord({
        branch,
        currentBranch,
        pr,
        deployRun,
        worktree,
        headInMain: Boolean(branch.headInMain),
      });
      const cleanup = evaluateCleanup(record);

      return {
        ...record,
        cleanupEligible: cleanup.eligible,
        cleanupReason: cleanup.reason,
      };
    })
    .sort((left, right) => {
      const statusDiff = statusRank(left.status) - statusRank(right.status);
      if (statusDiff !== 0) {
        return statusDiff;
      }

      return left.name.localeCompare(right.name);
    });

  const detachedWorktrees = worktrees
    .filter((worktree) => worktree.detached)
    .map((worktree) => {
      const record = classifyDetachedWorktreeRecord(worktree);
      const cleanup = evaluateCleanup(record);
      return {
        ...record,
        cleanupEligible: cleanup.eligible,
        cleanupReason: cleanup.reason,
      };
    });

  const summary = {
    branchCount: branchRecords.length,
    detachedWorktreeCount: detachedWorktrees.length,
    cleanupEligibleCount: branchRecords.filter((record) => record.cleanupEligible).length,
    statusCounts: [...branchRecords, ...detachedWorktrees].reduce((counts, record) => {
      counts[record.status] = (counts[record.status] ?? 0) + 1;
      return counts;
    }, {}),
  };

  return {
    generatedAt: new Date().toISOString(),
    currentBranch,
    branchPrefix: TASK_BRANCH_PREFIX,
    legacyBranchPrefixes: [...LEGACY_TASK_BRANCH_PREFIXES],
    deployWorkflow: DEPLOY_WORKFLOW_NAME,
    mainBranch: MAIN_BRANCH,
    branches: branchRecords,
    detachedWorktrees,
    summary,
  };
}

export function buildCleanupPlan(report) {
  const eligible = report.branches.filter((record) => record.cleanupEligible);
  const skipped = [
    ...report.branches.filter((record) => !record.cleanupEligible),
    ...report.detachedWorktrees,
  ].map((record) => ({
    kind: record.kind,
    name: record.name,
    status: record.status,
    reason: record.cleanupReason,
    worktreePath: record.worktreePath,
  }));

  return {
    dryRun: true,
    eligible: eligible.map((record) => ({
      branchName: record.name,
      status: record.status,
      worktreePath: record.worktreePath,
      reason: record.cleanupReason,
    })),
    skipped,
  };
}

function formatPath(targetPath, repoRoot) {
  if (!targetPath) {
    return '-';
  }

  if (targetPath.startsWith(repoRoot)) {
    const relativePath = path.relative(repoRoot, targetPath);
    return relativePath || '.';
  }

  return targetPath;
}

function formatPr(record) {
  if (!record.prNumber) {
    return '-';
  }

  return `#${record.prNumber}`;
}

function formatRemote(record) {
  if (!record.upstream) {
    return record.remoteGone ? `origin/${record.name} (missing)` : '-';
  }

  if (record.upstreamGone) {
    return `${record.upstream} (gone)`;
  }

  return record.upstream;
}

function pad(value, width) {
  return String(value).padEnd(width, ' ');
}

function printTable(rows) {
  if (rows.length === 0) {
    return;
  }

  const widths = rows[0].map((_, index) =>
    Math.max(...rows.map((row) => String(row[index]).length)),
  );

  for (const row of rows) {
    console.log(row.map((value, index) => pad(value, widths[index])).join('  '));
  }
}

function printStatusReport(report, repoRoot) {
  const branchRows = [
    ['STATUS', 'BRANCH', 'PR', 'REMOTE', 'WORKTREE', 'CLEANUP', 'NOTE'],
    ...report.branches.map((record) => [
      record.status,
      record.name,
      formatPr(record),
      formatRemote(record),
      formatPath(record.worktreePath, repoRoot),
      record.cleanupEligible ? 'eligible' : `skip: ${record.cleanupReason}`,
      record.note,
    ]),
  ];

  console.log('Branch Status');
  printTable(branchRows);

  if (report.detachedWorktrees.length > 0) {
    console.log('');
    console.log('Detached Worktrees');
    const detachedRows = [
      ['STATUS', 'NAME', 'WORKTREE', 'CLEANUP', 'NOTE'],
      ...report.detachedWorktrees.map((record) => [
        record.status,
        record.name,
        formatPath(record.worktreePath, repoRoot),
        `skip: ${record.cleanupReason}`,
        record.note,
      ]),
    ];
    printTable(detachedRows);
  }

  console.log('');
  console.log(
    `Summary: ${report.summary.branchCount} branches, ${report.summary.detachedWorktreeCount} detached worktrees, ${report.summary.cleanupEligibleCount} cleanup eligible.`,
  );
}

function printCleanupPlan(plan, repoRoot, apply) {
  console.log(apply ? 'Applying cleanup actions' : 'Cleanup dry-run');

  if (plan.eligible.length === 0) {
    console.log('No cleanup targets.');
  } else {
    const eligibleRows = [
      ['BRANCH', 'WORKTREE', 'ACTION'],
      ...plan.eligible.map((record) => [
        record.branchName,
        formatPath(record.worktreePath, repoRoot),
        record.worktreePath
          ? `remove worktree + delete branch (${record.reason})`
          : `delete branch (${record.reason})`,
      ]),
    ];
    printTable(eligibleRows);
  }

  if (plan.skipped.length > 0) {
    console.log('');
    console.log('Skipped');
    const skippedRows = [
      ['NAME', 'STATUS', 'REASON'],
      ...plan.skipped.map((record) => [record.name, record.status, record.reason]),
    ];
    printTable(skippedRows);
  }
}

export function resolveRepoRoot(cwd) {
  return runGit(cwd, ['rev-parse', '--show-toplevel']);
}

export function loadBranches(repoRoot, includeNonTask) {
  const refFormat = '--format=%(refname:short)\t%(objectname)\t%(upstream:short)\t%(upstream:track)\t%(worktreepath)';
  const refPrefixes = includeNonTask
    ? ['refs/heads']
    : ALL_TASK_BRANCH_PREFIXES.map((prefix) => `refs/heads/${prefix.replace(/\/$/, '')}`);

  const seen = new Set();
  const branches = [];

  for (const refPrefix of refPrefixes) {
    const refText = runGit(repoRoot, ['for-each-ref', refPrefix, refFormat]);
    for (const branch of parseBranchRefs(refText)) {
      if (seen.has(branch.name)) continue;
      seen.add(branch.name);
      branches.push(branch);
    }
  }

  return branches.map((branch) => ({
    ...branch,
    remoteRefExists:
      runCommand('git', ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branch.name}`], {
        cwd: repoRoot,
        allowFailure: true,
      }) !== null,
    headInMain:
      runCommand(
        'git',
        ['merge-base', '--is-ancestor', branch.headSha, `origin/${MAIN_BRANCH}`],
        { cwd: repoRoot, allowFailure: true },
      ) !== null,
  }));
}

export function loadWorktrees(repoRoot) {
  const worktrees = parseWorktreeList(runGit(repoRoot, ['worktree', 'list', '--porcelain']));

  return worktrees.map((worktree) => {
    if (!worktree.path || !existsSync(worktree.path)) {
      return {
        ...worktree,
        dirty: false,
      };
    }

    const statusOutput = runGit(worktree.path, ['status', '--short'], { allowFailure: true }) ?? '';

    return {
      ...worktree,
      dirty: statusOutput.trim().length > 0,
    };
  });
}

export function loadAllPrs(repoRoot, branchNames) {
  const fields = 'number,headRefName,baseRefName,state,mergedAt,updatedAt,mergeCommit,title,url';
  const initial = readJson(
    runGh(repoRoot, [
      'pr',
      'list',
      '--state',
      'all',
      '--limit',
      String(DEFAULT_PR_LIMIT),
      '--json',
      fields,
    ]),
  );

  const seenHeads = new Set(initial.map((pr) => pr.headRefName));
  const missingHeads = branchNames.filter((branchName) => !seenHeads.has(branchName));
  const fallback = [];

  for (const head of missingHeads) {
    const exact = readJson(
      runGh(repoRoot, [
        'pr',
        'list',
        '--state',
        'all',
        '--head',
        head,
        '--limit',
        '20',
        '--json',
        fields,
      ]),
    );

    fallback.push(...exact);
  }

  return [...initial, ...fallback];
}

export function loadDeployRuns(repoRoot) {
  const runs = readJson(
    runGh(repoRoot, [
      'run',
      'list',
      '--branch',
      MAIN_BRANCH,
      '--limit',
      String(DEFAULT_RUN_LIMIT),
      '--json',
      'databaseId,headSha,status,conclusion,workflowName,displayTitle,url,createdAt',
    ]),
  );

  return runs.filter((run) => DEPLOY_WORKFLOW_NAMES.includes(run.workflowName));
}

export function createAncestryChecker(repoRoot) {
  const cache = new Map();

  return (ancestor, descendant) => {
    if (!ancestor || !descendant) {
      return false;
    }

    if (ancestor === descendant) {
      return true;
    }

    const key = `${ancestor}:${descendant}`;

    if (!cache.has(key)) {
      const isAncestor =
        runCommand('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
          cwd: repoRoot,
          allowFailure: true,
        }) !== null;
      cache.set(key, isAncestor);
    }

    return cache.get(key);
  };
}

export function loadLocalReportInputs(repoRoot, includeNonTask) {
  const currentBranch = runGit(repoRoot, ['branch', '--show-current']);
  const branches = loadBranches(repoRoot, includeNonTask);
  const worktrees = loadWorktrees(repoRoot);
  const isAncestorCommit = createAncestryChecker(repoRoot);

  return {
    currentBranch,
    branches,
    worktrees,
    isAncestorCommit,
  };
}

export function createReport({ cwd, includeNonTask }) {
  const repoRoot = resolveRepoRoot(cwd);
  const local = loadLocalReportInputs(repoRoot, includeNonTask);
  const prs = loadAllPrs(repoRoot, local.branches.map((branch) => branch.name));
  const deployRuns = loadDeployRuns(repoRoot);

  return {
    repoRoot,
    raw: {
      ...local,
      prs,
      deployRuns,
    },
    report: buildJanitorReport({
      branches: local.branches,
      worktrees: local.worktrees,
      prs,
      deployRuns,
      currentBranch: local.currentBranch,
      isAncestorCommit: local.isAncestorCommit,
    }),
  };
}

export function applyCleanup(repoRoot, cleanupPlan) {
  for (const target of cleanupPlan.eligible) {
    if (target.worktreePath) {
      execFileSync('git', ['worktree', 'remove', target.worktreePath], {
        cwd: repoRoot,
        stdio: 'inherit',
      });
    }

    execFileSync('git', ['branch', '-D', target.branchName], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
  }
}

function main() {
  const args = parseArgs(process.argv);

  if (args.command === 'help') {
    usage();
    return;
  }

  const { repoRoot, report } = createReport({
    cwd: process.cwd(),
    includeNonTask: args.includeNonTask,
  });

  if (args.command === 'status') {
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    printStatusReport(report, repoRoot);
    return;
  }

  const cleanupPlan = buildCleanupPlan(report);

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          ...cleanupPlan,
          dryRun: !args.apply,
        },
        null,
        2,
      ),
    );
    return;
  }

  printCleanupPlan(cleanupPlan, repoRoot, args.apply);

  if (args.apply) {
    applyCleanup(repoRoot, cleanupPlan);
  }
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
