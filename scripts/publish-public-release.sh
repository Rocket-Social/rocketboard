#!/usr/bin/env bash
set -euo pipefail

# Publish a Rocketboard public release to Rocket-Social/rocketboard.
#
# Usage:
#   bash scripts/publish-public-release.sh --version 0.2.0
#   bash scripts/publish-public-release.sh --version 0.2.0 --apply
#
# Default mode is dry-run: prepares the export, verifies the build, stages
# the release commit + tag in a temp git repo, and prints the diff that
# would be pushed. Add --apply to force-push to the public remote and
# push the version tag.
#
# Each public release is a single squash commit. Internal git history is
# never published. Force-push is intentional — the public main is rewritten
# to a fresh single commit per release.

VERSION=""
EXPORT_DIR="/tmp/rocketboard-public-export"
REMOTE_URL="${ROCKETBOARD_PUBLIC_REMOTE:-https://github.com/Rocket-Social/rocketboard.git}"
APPLY=0
SKIP_VERIFY=0

print_usage() {
  cat <<USAGE
Usage: bash scripts/publish-public-release.sh --version X.Y.Z [options]

Required:
  --version X.Y.Z       Public release version (SemVer)

Options:
  --apply               Force-push to the public remote (default: dry-run)
  --export-dir PATH     Export directory (default: /tmp/rocketboard-public-export)
  --remote URL          Public remote URL (or env ROCKETBOARD_PUBLIC_REMOTE)
                        Default: https://github.com/Rocket-Social/rocketboard.git
  --skip-verify         Skip npm install / typecheck / build
  -h, --help            Show this message
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="$2"; shift 2;;
    --export-dir) EXPORT_DIR="$2"; shift 2;;
    --remote) REMOTE_URL="$2"; shift 2;;
    --apply) APPLY=1; shift;;
    --skip-verify) SKIP_VERIFY=1; shift;;
    -h|--help) print_usage; exit 0;;
    *) echo "ERROR: unknown arg: $1" >&2; print_usage >&2; exit 1;;
  esac
done

if [ -z "$VERSION" ]; then
  echo "ERROR: --version X.Y.Z required" >&2
  print_usage >&2
  exit 1
fi

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "ERROR: --version must be SemVer X.Y.Z (got: $VERSION)" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TAG="v${VERSION}"
SNAPSHOT_PATCH="$REPO_ROOT/docs/fair-source-launch-snapshot.patch"

# ─── Pre-flight ──────────────────────────────────────────────────────────
echo "==> Pre-flight"
cd "$REPO_ROOT"

if [ -n "$(git status --porcelain)" ]; then
  echo "WARN: working tree has uncommitted changes."
  echo "      The export only includes git-tracked files, so untracked work won't ship,"
  echo "      but committed-but-unpushed changes WILL be in the export."
  printf "      Continue anyway? [y/N] "
  read -r REPLY
  case "$REPLY" in
    [Yy]*) ;;
    *) echo "Aborted."; exit 1;;
  esac
fi

if ! git rev-parse --verify origin/main >/dev/null 2>&1; then
  echo "WARN: origin/main not found locally. Run 'git fetch origin' first."
fi

# ─── Run prep ────────────────────────────────────────────────────────────
echo "==> Running prepare-public-release.sh"
bash "$SCRIPT_DIR/prepare-public-release.sh" "$EXPORT_DIR"

cd "$EXPORT_DIR"

# ─── Defensive fix-ups in the export ─────────────────────────────────────
# Belt-and-suspenders for things that should eventually be on internal main
# but aren't yet (community files). Idempotent.

if [ ! -f CODE_OF_CONDUCT.md ] && [ -f "$SNAPSHOT_PATCH" ]; then
  echo "==> Community files missing — applying snapshot patch"
  git apply "$SNAPSHOT_PATCH"
fi

# ─── Bump version ────────────────────────────────────────────────────────
echo "==> Setting VERSION to ${VERSION}"
printf "%s\n" "${VERSION}" > VERSION

node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '${VERSION}';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log('==> Bumped package.json version to ${VERSION}');
"

# ─── Verify build ────────────────────────────────────────────────────────
if [ "$SKIP_VERIFY" = "0" ]; then
  echo "==> Installing deps (this can take a minute)"
  npm install --silent --no-audit --no-fund
  echo "==> Typecheck"
  npx tsc --noEmit
  echo "==> Build"
  npm run build
else
  echo "==> Skipping verify (--skip-verify)"
fi

# ─── Stage release commit ───────────────────────────────────────────────
echo "==> Staging release commit"
rm -rf .git
git -c init.defaultBranch=main init -q
git add -A
git -c user.email="release@rocketboard.app" -c user.name="Rocketboard Release" commit -q -m "Release ${TAG}"
git tag "${TAG}"

# ─── Compare against existing public main ───────────────────────────────
echo ""
echo "==> Staged release commit summary:"
git --no-pager show --stat --format="    %h %s" HEAD | head -20
echo ""

if command -v gh >/dev/null 2>&1 && gh repo view Rocket-Social/rocketboard >/dev/null 2>&1; then
  PUB_VERSION="$(gh api repos/Rocket-Social/rocketboard/contents/VERSION --jq '.content' 2>/dev/null | base64 -d 2>/dev/null || echo unknown)"
  echo "==> Public repo currently at VERSION: ${PUB_VERSION}"
fi

echo "==> About to push: ${TAG} -> ${REMOTE_URL} (force, single squash commit)"

if [ "$APPLY" = "0" ]; then
  echo ""
  echo "DRY RUN — no push performed. Re-run with --apply to publish."
  echo "Export staged at: ${EXPORT_DIR}"
  exit 0
fi

# ─── Push ───────────────────────────────────────────────────────────────
echo ""
echo "==> Pushing to ${REMOTE_URL}"
git remote add origin "${REMOTE_URL}"
git push --force origin main:main
git push origin "${TAG}"

echo ""
echo "==> Released ${TAG} to ${REMOTE_URL}"
echo "    https://github.com/Rocket-Social/rocketboard/releases/tag/${TAG}"
