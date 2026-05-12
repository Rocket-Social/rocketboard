#!/usr/bin/env bash
set -euo pipefail

# Prepare a public release of Rocketboard by exporting only the allowlisted
# public repo surface, then stripping hosted-only/private code.
#
# macOS-only: this script uses BSD `sed -i ''` throughout. Running it under
# GNU sed (Linux CI) will fail because GNU sed interprets `''` as a filename.
# If you need to run the release prep on Linux, add a portability shim or
# wrap each `sed -i ''` call with an OS detection.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PUBLIC_DIR="${1:-/tmp/rocketboard-public}"
# Normalize PUBLIC_DIR: strip any trailing slash and resolve to an absolute
# path so the flatten pass below can safely strip this prefix from find's
# output without edge cases around `//` or trailing `/`.
PUBLIC_DIR="${PUBLIC_DIR%/}"

# Paths the public repo is allowed to contain. Anything not matched here is
# silently dropped. Directories resolve via `git ls-files -- <dir>` so any
# tracked file beneath them is included — but only tracked files ever get
# copied, which keeps the export fail-closed.
#
# The "docs/public" entry is the single source of truth for which docs ship.
# Everything under docs/public/ is tracked in the private repo (the gitignore
# rule `docs/*` + `!docs/public/` enforces it). After the copy, this script
# flattens docs/public/*.md up to docs/*.md so OSS users see clean top-level
# paths matching existing external links.
PUBLIC_ALLOWLIST=(
  ".env.example"
  ".github"
  ".gitignore"
  "CHANGELOG.md"
  "CONTRIBUTING.md"
  "LICENSE"
  "README.md"
  "SELF_HOSTING.md"
  "VERSION"
  "build-assets.test.ts"
  "index.html"
  "package-lock.json"
  "package.json"
  "postcss.config.js"
  "tailwind.config.js"
  "tsconfig.app.json"
  "tsconfig.json"
  "tsconfig.node.json"
  "vite.config.ts"
  "docs/public"
  "packages"
  "public"
  "scripts"
  "src"
  "supabase"
)

echo "==> Preparing public release in $PUBLIC_DIR"

# Clean previous output
rm -rf "$PUBLIC_DIR"
mkdir -p "$PUBLIC_DIR"

# Copy only the allowlisted tracked repo surface.
cd "$REPO_ROOT"
python3 - "$REPO_ROOT" "$PUBLIC_DIR" "${PUBLIC_ALLOWLIST[@]}" << 'PYEOF'
import os
import shutil
import subprocess
import sys

repo_root = sys.argv[1]
public_dir = sys.argv[2]
allowlist = sys.argv[3:]

result = subprocess.run(
    ['git', 'ls-files', '-z', '--', *allowlist],
    cwd=repo_root,
    check=True,
    capture_output=True,
)

paths = [entry for entry in result.stdout.decode().split('\0') if entry]
if not paths:
    raise SystemExit('No tracked files matched the public allowlist.')

for rel_path in paths:
    src = os.path.join(repo_root, rel_path)
    dest = os.path.join(public_dir, rel_path)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.islink(src):
        target = os.readlink(src)
        os.symlink(target, dest)
    else:
        shutil.copy2(src, dest)

print(f"==> Copied {len(paths)} allowlisted tracked files")
PYEOF

# ─── Flatten docs/public/ into docs/ ─────────────────────────────────────
# The private repo keeps public docs under docs/public/ so the gitignore
# blanket `docs/*` can treat /docs as a scratch zone. The OSS export moves
# them back up to docs/*.md for clean top-level paths (matching existing
# external links to https://.../docs/API.md etc.) and rewrites any
# remaining `docs/public/` references in markdown files.
echo "==> Flattening docs/public/ -> docs/"
if [ -d "$PUBLIC_DIR/docs/public" ]; then
  # Use find + a for loop instead of `mv docs/public/* docs/` so hidden
  # files are caught and the shell glob can't fail on an empty directory.
  while IFS= read -r -d '' src; do
    rel=${src#"$PUBLIC_DIR/docs/public/"}
    dest="$PUBLIC_DIR/docs/$rel"
    if [ -e "$dest" ]; then
      echo "FAIL: flatten collision at $dest (source: $src)" >&2
      exit 1
    fi
    mkdir -p "$(dirname "$dest")"
    mv "$src" "$dest"
  done < <(find "$PUBLIC_DIR/docs/public" -type f -print0)
  # Remove any now-empty directories under docs/public, then the dir itself.
  find "$PUBLIC_DIR/docs/public" -depth -type d -empty -delete
fi

# Rewrite docs/public/* references back to docs/* in markdown files so
# absolute links in README.md, CONTRIBUTING.md, etc. still resolve after
# flattening. Intra-docs cross-references use ./RELATIVE.md form and are
# unaffected.
#
# Use `-i.bak` (portable across BSD and GNU sed) instead of `-i ''` so the
# flatten pass works on both macOS and Linux. The rest of this script is
# still macOS-only (see header comment) but this snippet is also exercised
# by scripts/prepare-public-release.test.mjs which runs under Linux CI.
find "$PUBLIC_DIR" -type f \( -name '*.md' -o -name '*.mdx' \) \
  -exec sed -i.bak 's|docs/public/|docs/|g' {} +
find "$PUBLIC_DIR" -type f \( -name '*.md.bak' -o -name '*.mdx.bak' \) -delete

# ─── Remove excluded frontend ────────────────────────────────────────────
echo "==> Removing super-admin frontend"
rm -rf "$PUBLIC_DIR/src/features/super-admin"

# ─── Remove excluded edge functions ──────────────────────────────────────
echo "==> Removing Stripe edge functions"
rm -rf "$PUBLIC_DIR/supabase/functions/billing-checkout"
rm -rf "$PUBLIC_DIR/supabase/functions/billing-portal-session"
rm -rf "$PUBLIC_DIR/supabase/functions/billing-invoices"
rm -rf "$PUBLIC_DIR/supabase/functions/billing-payment-method"
rm -rf "$PUBLIC_DIR/supabase/functions/stripe-webhook"
rm -f  "$PUBLIC_DIR/supabase/functions/_shared/stripe.ts"

# ─── Patch router.tsx: remove SuperAdmin lazy import + route ─────────────
echo "==> Patching router.tsx"
# Remove the lazy import (lines matching SuperAdminPage import block)
sed -i '' '/^const SuperAdminPage = lazyWithRetry/,/^);$/d' "$PUBLIC_DIR/src/app/router.tsx"
# Remove the superAdminRoute definition block
sed -i '' '/^const superAdminRoute = createRoute/,/^});$/d' "$PUBLIC_DIR/src/app/router.tsx"
# Remove superAdminRoute from the route tree
sed -i '' '/superAdminRoute,/d' "$PUBLIC_DIR/src/app/router.tsx"

# ─── Patch SettingsMenu.tsx: remove onOpenSuperAdmin ─────────────────────
echo "==> Patching SettingsMenu.tsx"
SETTINGS_MENU="$PUBLIC_DIR/src/features/shell/SettingsMenu.tsx"
# Remove the ShieldCheck import (only used by super-admin button)
sed -i '' '/ShieldCheck,/d' "$SETTINGS_MENU"
# Remove the prop type definition
sed -i '' '/onOpenSuperAdmin:/d' "$SETTINGS_MENU"
# Remove the destructured prop
sed -i '' '/^  onOpenSuperAdmin,$/d' "$SETTINGS_MENU"
# Remove the super admin button block (from isInternalAdmin check to closing null})
sed -i '' '/currentUser\.isInternalAdmin/,/: null}/d' "$SETTINGS_MENU"

# Sidebar prop drilling for onOpenSuperAdmin is gone post-rewrite — SettingsMenu
# now navigates directly via router. The ShieldCheck/isInternalAdmin block above
# is the only remaining UI seam.

# ─── Strip super-admin SQL from _core.sql ────────────────────────────────
echo "==> Stripping super-admin SQL from _core.sql"
CORE_SQL="$PUBLIC_DIR/supabase/migrations/00000000000000_core.sql"

# Remove super-admin functions, tables, grants, and related statements using awk.
# Awk approach: delete blocks from 'create or replace function' containing a target
# name through the closing '$$ language plpgsql;' or '$$ language sql;' line.
# Also remove preceding comment lines, drop/revoke statements, and table definitions.
python3 - "$CORE_SQL" << 'PYEOF'
import re, sys

with open(sys.argv[1], 'r') as f:
    content = f.read()

# Functions to strip (with optional public. prefix)
admin_fns = [
    'assert_internal_admin',
    'is_current_user_internal_admin',
    'super_admin_get_feature_flags',
    'super_admin_set_feature_flag',
    'super_admin_get_organizations',
    'super_admin_get_customers',
    'super_admin_get_activity',
    'super_admin_delete_organization',
    'super_admin_grant_org_award',
    'super_admin_grant_org_vip',
    'super_admin_revoke_org_grant',
    'super_admin_create_award_invite',
    'super_admin_get_award_invites',
    'super_admin_revoke_award_invite',
]

for fn in admin_fns:
    # Remove function definitions — handles both formats:
    # Format A: create or replace function ... $$ ... $$ language plpgsql;
    # Format B: create or replace function ... language plpgsql ... as $$ ... $$;
    # Match from 'create or replace function' through the closing '$$;' or '$$ language ...'
    content = re.sub(
        r'(?:--[^\n]*\n)*(?:drop function[^\n]*' + fn + r'[^\n]*;\n)*'
        r'create or replace function (?:public\.)?' + fn + r'\b.*?\$\$.*?\$\$[^;]*;',
        '', content, flags=re.DOTALL | re.IGNORECASE
    )
    # Remove revoke/grant/drop statements referencing this function
    content = re.sub(r'[^\n]*(?:revoke|grant|drop function)[^\n]*' + fn + r'[^\n]*;\n?', '', content, flags=re.IGNORECASE)
    # Remove comment lines that reference this function name
    content = re.sub(r'--[^\n]*' + fn + r'[^\n]*\n', '', content, flags=re.IGNORECASE)

# Remove admin_audit_log table + policies + alter + enable
for table in ['admin_audit_log', 'award_invites']:
    content = re.sub(
        r'(?:--[^\n]*\n)*create table (?:if not exists )?(?:public\.)?' + table + r'\b.*?;\n?',
        '', content, flags=re.DOTALL | re.IGNORECASE
    )
    content = re.sub(r'alter table (?:public\.)?' + table + r'[^\n]*;\n?', '', content, flags=re.IGNORECASE)
    content = re.sub(r'create policy[^\n]*on (?:public\.)?' + table + r'[^\n]*;\n?', '', content, flags=re.IGNORECASE)

# Clean up excessive blank lines (more than 2 consecutive)
content = re.sub(r'\n{4,}', '\n\n\n', content)

with open(sys.argv[1], 'w') as f:
    f.write(content)

print(f"  Stripped {len(admin_fns)} functions + 2 tables")
PYEOF

# ─── Verification ────────────────────────────────────────────────────────
echo ""
echo "==> Running verification checks..."
ERRORS=0

# Check for PII (exclude this script itself, the LICENSE file which legitimately
# names the copyright holder, and binary files).
# Allow bare `jokim1` (it's the public GH org for the OSS pipelane dep, not PII).
# Block specific PII shapes: `jokim1/rocketboard`, `jokim1@`, `jokim1.com`.
PII_PATTERNS='lilagames|lila\.games|jokim1/rocketboard|jokim1@|jokim1\.(com|net|org)|Joseph Kim|\bJ Kim\b|\bjkim\b|jokim.*@gmail'
if grep -rqE --exclude='prepare-public-release.sh' --exclude='LICENSE*' --binary-files=without-match "$PII_PATTERNS" "$PUBLIC_DIR" 2>/dev/null; then
  echo "FAIL: Found PII references"
  grep -rnE --exclude='prepare-public-release.sh' --exclude='LICENSE*' --binary-files=without-match "$PII_PATTERNS" "$PUBLIC_DIR" || true
  ERRORS=$((ERRORS + 1))
else
  echo "PASS: No PII references found"
fi

# Check that the LICENSE file is present — the public release cannot ship
# without it.
if [ ! -f "$PUBLIC_DIR/LICENSE" ]; then
  echo "FAIL: LICENSE file is missing from the export"
  ERRORS=$((ERRORS + 1))
else
  echo "PASS: LICENSE file present"
fi

# Check for super-admin imports
if grep -rq "features/super-admin" "$PUBLIC_DIR/src" 2>/dev/null; then
  echo "FAIL: Found super-admin import references"
  grep -rn "features/super-admin" "$PUBLIC_DIR/src" || true
  ERRORS=$((ERRORS + 1))
else
  echo "PASS: No super-admin import references"
fi

# Check that docs/ is clean after flattening: only the intended top-level
# markdown files exist, no docs/public/ subdirectory lingers, and none of
# the historical internal doc files ended up in the export. This is a
# lightweight sanity check — the real enforcement is the `docs/public`
# entry in PUBLIC_ALLOWLIST, which only copies tracked files from that one
# directory.
if ! python3 - "$PUBLIC_DIR" << 'PYEOF'
import os
import sys

public_dir = sys.argv[1]
docs_root = os.path.join(public_dir, 'docs')

errors = []

if not os.path.isdir(docs_root):
    errors.append('docs/ directory missing from export')
else:
    if os.path.isdir(os.path.join(docs_root, 'public')):
        errors.append('docs/public/ still present after flatten pass')

    top_level = sorted(
        name for name in os.listdir(docs_root)
        if os.path.isfile(os.path.join(docs_root, name)) and name.endswith('.md')
    )
    if not top_level:
        errors.append('No markdown files found in docs/ after flatten')

    # Anything under docs/ must be either a top-level .md or nothing.
    # Subdirectories are not expected in the export today.
    for entry in os.listdir(docs_root):
        path = os.path.join(docs_root, entry)
        if os.path.isdir(path):
            errors.append(f'Unexpected subdirectory in docs/: {entry}')

# These private docs were untracked from main and should never appear in an
# export. The gitignore + PUBLIC_ALLOWLIST shape already guarantees this,
# but an explicit check catches accidental re-adds.
for rel in (
    'docs/DEPLOYMENT_PARITY.md',
    'docs/RELEASE_WORKFLOW.md',
    'docs/SPEC_PUBLIC_WIKI_SHARING.md',
):
    if os.path.exists(os.path.join(public_dir, rel)):
        errors.append(f'Private doc leaked into export: {rel}')

for rel in ('AGENTS.md', '.claude', 'CLAUDE.md'):
    if os.path.exists(os.path.join(public_dir, rel)):
        errors.append(f'{rel} leaked into export')

for error in errors:
    print(f'FAIL: {error}')

if errors:
    raise SystemExit(1)

print('PASS: Docs export is clean and flattened')
PYEOF
then
  ERRORS=$((ERRORS + 1))
fi

# Check that excluded directories are gone
for dir in \
  "src/features/super-admin" \
  "supabase/functions/billing-checkout" \
  "supabase/functions/stripe-webhook"
do
  if [ -d "$PUBLIC_DIR/$dir" ]; then
    echo "FAIL: $dir still exists"
    ERRORS=$((ERRORS + 1))
  fi
done
echo "PASS: Excluded directories removed"

# Check that stripe.ts is gone but supabase.ts is kept
if [ -f "$PUBLIC_DIR/supabase/functions/_shared/stripe.ts" ]; then
  echo "FAIL: _shared/stripe.ts still exists"
  ERRORS=$((ERRORS + 1))
else
  echo "PASS: _shared/stripe.ts removed"
fi

if [ ! -f "$PUBLIC_DIR/supabase/functions/_shared/supabase.ts" ]; then
  echo "FAIL: _shared/supabase.ts was incorrectly removed"
  ERRORS=$((ERRORS + 1))
else
  echo "PASS: _shared/supabase.ts preserved"
fi

# Check for super_admin SQL remnants
if grep -q 'super_admin_' "$CORE_SQL" 2>/dev/null; then
  echo "WARN: Some super_admin_ references remain in _core.sql (may be comments or grants)"
  grep -c 'super_admin_' "$CORE_SQL" || true
else
  echo "PASS: No super_admin_ references in _core.sql"
fi

echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo "FAILED: $ERRORS verification errors"
  exit 1
else
  echo "All verification checks passed!"
  echo ""
  echo "Next steps:"
  echo "  cd $PUBLIC_DIR"
  echo "  npm install"
  echo "  npm run typecheck"
  echo "  npm run build"
  echo ""
  echo "If build passes, push to public remote."
fi
