import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// Run `git check-ignore -v <path>` and return the matching rule, or null if
// the path is NOT ignored. `git check-ignore` exits 0 when the path is
// ignored, exit 1 when it is not. Any other exit is a real error.
function checkIgnore(relPath) {
  try {
    const out = execFileSync('git', ['check-ignore', '-v', '--no-index', relPath], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    return out.trim();
  } catch (err) {
    if (err.status === 1) return null;
    throw err;
  }
}

describe('/docs gitignore allowlist (two-zone policy)', () => {
  it('ignores arbitrary scratch docs at /docs top level', () => {
    // These paths don't need to exist on disk. `git check-ignore --no-index`
    // evaluates the rules against the path string without touching the index.
    for (const rel of [
      'docs/SCRATCH_NOTES.md',
      'docs/DEPLOYMENT_PARITY.md',
      'docs/RANDOM_PLAN.md',
      'docs/NEW_FEATURE_DEBATE.md',
      'docs/foo.txt',
    ]) {
      const rule = checkIgnore(rel);
      expect(rule, `${rel} should be ignored by docs/*`).not.toBeNull();
    }
  });

  it('ignores nested scratch docs under arbitrary subdirs of /docs', () => {
    // The docs/* rule is single-level but `docs/*` also catches directories
    // below the top. Confirm the nested-scratch case is covered (matters for
    // the "no nested docs bypass" decision the plan locked in).
    for (const rel of [
      'docs/subdir/leak.md',
      'docs/guides/onboarding.md',
      'docs/internal/notes.txt',
    ]) {
      const rule = checkIgnore(rel);
      expect(rule, `${rel} should be ignored`).not.toBeNull();
    }
  });

  it('tracks files under /docs/public/ (the commit zone)', () => {
    for (const rel of [
      'docs/public/API.md',
      'docs/public/ARCHITECTURE.md',
      'docs/public/DESIGN.md',
      'docs/public/GITHUB_SETUP.md',
      'docs/public/MCP.md',
      'docs/public/SQL_MIGRATIONS.md',
    ]) {
      const rule = checkIgnore(rel);
      expect(rule, `${rel} must NOT be ignored — it is in the public zone`).toBeNull();
    }
  });

  it('allows future files added to /docs/public/', () => {
    // New public docs must be tracked without editing any allowlist file.
    // This is the whole point of the filesystem-based classification.
    for (const rel of [
      'docs/public/NEW_THING.md',
      'docs/public/API_REFERENCE.md',
    ]) {
      const rule = checkIgnore(rel);
      expect(rule, `${rel} should be tracked once placed in docs/public/`).toBeNull();
    }
  });
});
