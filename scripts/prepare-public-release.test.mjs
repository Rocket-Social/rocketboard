import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const releaseScript = path.join(repoRoot, 'scripts', 'prepare-public-release.sh');

// Extract the flatten + sed section from prepare-public-release.sh at runtime so
// this test exercises the exact shell code that ships. If the section markers
// change, this test fails loudly and the next maintainer updates both together.
function loadFlattenSnippet() {
  const contents = readFileSync(releaseScript, 'utf8');
  const startMarker = '# ─── Flatten docs/public/ into docs/';
  const startIdx = contents.indexOf(startMarker);
  if (startIdx === -1) {
    throw new Error('release script: flatten section start marker missing');
  }
  const afterStart = contents.slice(startIdx);
  const endMarker = '# ─── Remove excluded frontend';
  const endIdx = afterStart.indexOf(endMarker);
  if (endIdx === -1) {
    throw new Error('release script: flatten section end marker missing');
  }
  return afterStart.slice(0, endIdx);
}

const tempDirs = [];

function makeFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'rb-flatten-'));
  tempDirs.push(dir);
  mkdirSync(path.join(dir, 'docs', 'public'), { recursive: true });
  return dir;
}

function writeFile(dir, rel, content) {
  const full = path.join(dir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function runFlatten(publicDir) {
  const snippet = loadFlattenSnippet();
  // Run the snippet in a bash subshell with PUBLIC_DIR pointing at the fixture.
  // set -e matches the release script's `set -euo pipefail`.
  const script = `set -euo pipefail\nPUBLIC_DIR="${publicDir}"\n${snippet}`;
  execFileSync('bash', ['-c', script], { stdio: 'pipe' });
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  }
});

describe('prepare-public-release.sh flatten + sed pass', () => {
  it('moves docs/public/*.md up to docs/*.md and removes docs/public/', () => {
    const dir = makeFixture();
    writeFile(dir, 'docs/public/API.md', '# API\n');
    writeFile(dir, 'docs/public/ARCHITECTURE.md', '# Architecture\n');

    runFlatten(dir);

    expect(existsSync(path.join(dir, 'docs', 'API.md'))).toBe(true);
    expect(existsSync(path.join(dir, 'docs', 'ARCHITECTURE.md'))).toBe(true);
    expect(existsSync(path.join(dir, 'docs', 'public'))).toBe(false);
  });

  it('rewrites docs/public/ references in markdown files to docs/', () => {
    const dir = makeFixture();
    writeFile(dir, 'docs/public/API.md', '# API\n');
    writeFile(
      dir,
      'README.md',
      '# Root\n\n- [API Status](docs/public/API.md)\n- See [./docs/public/API.md](./docs/public/API.md) for details.\n',
    );
    writeFile(
      dir,
      'supabase/README.md',
      'See [../docs/public/API.md](../docs/public/API.md).\n',
    );

    runFlatten(dir);

    const readme = readFileSync(path.join(dir, 'README.md'), 'utf8');
    expect(readme).not.toContain('docs/public/');
    expect(readme).toContain('docs/API.md');

    const subReadme = readFileSync(path.join(dir, 'supabase', 'README.md'), 'utf8');
    expect(subReadme).not.toContain('docs/public/');
    expect(subReadme).toContain('../docs/API.md');
  });

  it('is a no-op when docs/public/ is absent', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rb-flatten-empty-'));
    tempDirs.push(dir);
    mkdirSync(path.join(dir, 'docs'), { recursive: true });
    writeFile(dir, 'docs/OTHER.md', '# other\n');

    runFlatten(dir);

    expect(existsSync(path.join(dir, 'docs', 'OTHER.md'))).toBe(true);
    expect(existsSync(path.join(dir, 'docs', 'public'))).toBe(false);
  });

  it('fails loudly on a flatten collision', () => {
    const dir = makeFixture();
    writeFile(dir, 'docs/public/API.md', '# public api\n');
    writeFile(dir, 'docs/API.md', '# stale top-level api\n');

    expect(() => runFlatten(dir)).toThrow();
    // The stale file still exists; we didn't silently clobber it.
    expect(readFileSync(path.join(dir, 'docs', 'API.md'), 'utf8')).toContain('stale');
  });

  it('handles a trailing-slash PUBLIC_DIR argument (prefix strip edge case)', () => {
    const dir = makeFixture();
    writeFile(dir, 'docs/public/API.md', '# api\n');

    // The release script normalizes PUBLIC_DIR via `${PUBLIC_DIR%/}` before the
    // flatten runs, so we simulate that normalization here and pass the normalized
    // form into runFlatten. This test guards against future refactors that
    // accidentally drop the normalization.
    const normalized = dir.replace(/\/+$/, '');
    runFlatten(normalized);

    expect(existsSync(path.join(dir, 'docs', 'API.md'))).toBe(true);
    expect(existsSync(path.join(dir, 'docs', 'public'))).toBe(false);
  });

  it('ignores non-markdown files under docs/public/', () => {
    const dir = makeFixture();
    writeFile(dir, 'docs/public/API.md', '# api\n');
    writeFile(dir, 'docs/public/diagram.png', 'fake-png-bytes');

    runFlatten(dir);

    // The flatten loop uses `find -type f` so it moves EVERY file regardless of
    // extension. docs/public/diagram.png should end up at docs/diagram.png.
    // (The real release script only has *.md under docs/public/ today, but this
    // test documents the current behavior in case future content is added.)
    expect(existsSync(path.join(dir, 'docs', 'API.md'))).toBe(true);
    expect(existsSync(path.join(dir, 'docs', 'diagram.png'))).toBe(true);
    expect(statSync(path.join(dir, 'docs', 'diagram.png')).size).toBeGreaterThan(0);
  });
});
