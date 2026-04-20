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
  ".github/ISSUE_TEMPLATE"
  ".github/PULL_REQUEST_TEMPLATE.md"
  ".github/workflows/ci.yml"
  ".gitignore"
  "CODE_OF_CONDUCT.md"
  "CHANGELOG.md"
  "CONTRIBUTING.md"
  "LICENSE"
  "README.md"
  "SECURITY.md"
  "SELF_HOSTING.md"
  "SUPPORT.md"
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
git -C "$PUBLIC_DIR" init -q -b main

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

copied = 0
skipped_missing = []

for rel_path in paths:
    src = os.path.join(repo_root, rel_path)
    if not os.path.lexists(src):
        skipped_missing.append(rel_path)
        continue
    dest = os.path.join(public_dir, rel_path)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.islink(src):
        target = os.readlink(src)
        os.symlink(target, dest)
    else:
        shutil.copy2(src, dest)
    copied += 1

print(f"==> Copied {copied} allowlisted tracked files")
if skipped_missing:
    print(f"==> Skipped {len(skipped_missing)} deleted working-tree files")
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
rm -rf "$PUBLIC_DIR/supabase/functions/billing-auth"
rm -rf "$PUBLIC_DIR/supabase/functions/billing-checkout"
rm -rf "$PUBLIC_DIR/supabase/functions/billing-portal-session"
rm -rf "$PUBLIC_DIR/supabase/functions/billing-invoices"
rm -rf "$PUBLIC_DIR/supabase/functions/billing-payment-method"
rm -rf "$PUBLIC_DIR/supabase/functions/stripe-webhook"
rm -f  "$PUBLIC_DIR/supabase/functions/_shared/stripe.ts"

echo "==> Removing hosted-only workflow scripts"
rm -f "$PUBLIC_DIR/scripts/deploy-hosted-workflow.test.mjs"
rm -f "$PUBLIC_DIR/scripts/validate-hosted-deploy-env.mjs"
rm -f "$PUBLIC_DIR/scripts/validate-hosted-deploy-env.test.mjs"

# ─── Patch public package metadata ───────────────────────────────────────
echo "==> Patching public package metadata"
python3 - "$PUBLIC_DIR/package.json" "$PUBLIC_DIR/package-lock.json" << 'PYEOF'
import json
import sys

package_path, lock_path = sys.argv[1], sys.argv[2]

with open(package_path, 'r', encoding='utf-8') as f:
    package = json.load(f)

scripts = package.get('scripts', {})
package['scripts'] = {
    key: value
    for key, value in scripts.items()
    if not (key.startswith('workflow:') or key.startswith('pipelane:'))
}

dev_dependencies = package.get('devDependencies', {})
dev_dependencies.pop('pipelane', None)
if dev_dependencies:
    package['devDependencies'] = dev_dependencies
else:
    package.pop('devDependencies', None)

with open(package_path, 'w', encoding='utf-8') as f:
    json.dump(package, f, indent=2)
    f.write('\n')

with open(lock_path, 'r', encoding='utf-8') as f:
    lock = json.load(f)

root_package = lock.get('packages', {}).get('', {})
root_dev_dependencies = root_package.get('devDependencies', {})
root_dev_dependencies.pop('pipelane', None)
if root_dev_dependencies:
    root_package['devDependencies'] = root_dev_dependencies
else:
    root_package.pop('devDependencies', None)

lock.get('packages', {}).pop('node_modules/pipelane', None)

with open(lock_path, 'w', encoding='utf-8') as f:
    json.dump(lock, f, indent=2)
    f.write('\n')
PYEOF

# ─── Patch public-facing Supabase config + seed ─────────────────────────────
echo "==> Patching Supabase config and seed"
python3 - "$PUBLIC_DIR/supabase/config.toml" "$PUBLIC_DIR/supabase/seed.sql" << 'PYEOF'
import re
import sys

config_path, seed_path = sys.argv[1], sys.argv[2]

with open(config_path, 'r', encoding='utf-8') as f:
    config = f.read()

for name in (
    'stripe-webhook',
    'billing-checkout',
    'billing-invoices',
    'billing-payment-method',
    'billing-portal-session',
):
    config = re.sub(
        rf'\n\[functions\.{re.escape(name)}\]\nverify_jwt = false\n',
        '\n',
        config,
    )

for url in (
    'https://rocketboard.app/auth/callback',
    'https://rocketboard-app.pages.dev/auth/callback',
):
    config = config.replace(f'  "{url}",\n', '')

config = re.sub(r'\n{3,}', '\n\n', config)

with open(config_path, 'w', encoding='utf-8') as f:
    f.write(config)

with open(seed_path, 'r', encoding='utf-8') as f:
    seed = f.read()

seed = re.sub(
    r',\n  \(\n    \'00000000-0000-0000-0000-000000000000\',\n    \'55555555-5555-4555-8555-555555555555\',.*?\n  \);\n',
    '\n  );\n',
    seed,
    flags=re.DOTALL,
)
seed = re.sub(
    r',\n  \(\n    \'95555555-5555-4555-8555-555555555555\',\n    \'55555555-5555-4555-8555-555555555555\',.*?\n  \);\n',
    '\n  );\n',
    seed,
    flags=re.DOTALL,
)
seed = re.sub(
    r",\n  \('55555555-5555-4555-8555-555555555555', 'admin@rocketboard\.dev', 'Admin User', true\);",
    ';',
    seed,
)

with open(seed_path, 'w', encoding='utf-8') as f:
    f.write(seed)
PYEOF

echo "==> Patching hosted-only edge-function tests"
python3 - "$PUBLIC_DIR/supabase/functions/phase-e-input-validation.test.ts" << 'PYEOF'
import re
import sys

path = sys.argv[1]

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    ' * Exceptions: webhook-style functions (github-webhook, stripe-webhook) are\n'
    ' * authenticated by HMAC signature and skip `parseJsonBody`; their rejection\n'
    ' * path lives in the signature-verification check.\n',
    ' * Exception: github-webhook is authenticated by HMAC signature and skips\n'
    ' * `parseJsonBody`; its rejection path lives in the signature-verification check.\n',
)

content = re.sub(
    r"  \{ slug: 'billing-checkout', schemaName: 'BillingCheckoutBodySchema' \},\n"
    r"  \{ slug: 'billing-invoices', schemaName: 'BillingInvoicesBodySchema' \},\n"
    r"  \{ slug: 'billing-payment-method', schemaName: 'BillingPaymentMethodBodySchema' \},\n"
    r"  \{ slug: 'billing-portal-session', schemaName: 'BillingPortalSessionBodySchema' \},\n",
    '',
    content,
)

content = re.sub(
    r"\n  describe\('stripe-webhook', \(\) => \{\n.*?\n  \}\)\n",
    '\n',
    content,
    flags=re.DOTALL,
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
PYEOF

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

# Remove admin_audit_log / award_invites tables + policies + indexes + dependent public invite flows.
for table in ['admin_audit_log', 'award_invites']:
    content = re.sub(
        r'(?:--[^\n]*\n)*create table (?:if not exists )?(?:public\.)?' + table + r'\b.*?;\n?',
        '', content, flags=re.DOTALL | re.IGNORECASE
    )
    content = re.sub(r'alter table (?:public\.)?' + table + r'[^\n]*;\n?', '', content, flags=re.IGNORECASE)
    content = re.sub(
        r'create policy\b.*?\bon (?:public\.)?' + table + r'\b.*?;\n?',
        '',
        content,
        flags=re.DOTALL | re.IGNORECASE,
    )
    content = re.sub(r'create index[^\n]* on (?:public\.)?' + table + r'[^\n]*;\n?', '', content, flags=re.IGNORECASE)

for fn in ['get_award_invite_by_token', 'accept_award_invite', 'decline_award_invite']:
    content = re.sub(
        r'(?:--[^\n]*\n)*(?:drop function[^\n]*' + fn + r'[^\n]*;\n)*'
        r'create or replace function (?:public\.)?' + fn + r'\b.*?\$\$.*?\$\$[^;]*;',
        '', content, flags=re.DOTALL | re.IGNORECASE
    )
    content = re.sub(r'[^\n]*(?:revoke|grant|drop function)[^\n]*' + fn + r'[^\n]*;\n?', '', content, flags=re.IGNORECASE)
    content = re.sub(r'--[^\n]*' + fn + r'[^\n]*\n', '', content, flags=re.IGNORECASE)

# Clean up excessive blank lines (more than 2 consecutive)
content = re.sub(r'\n{4,}', '\n\n\n', content)

with open(sys.argv[1], 'w') as f:
    f.write(content)

print(f"  Stripped {len(admin_fns)} functions + 2 tables")
PYEOF

echo "==> Restoring public invite bookkeeping SQL when needed"
python3 - "$REPO_ROOT/supabase/migrations/00000000000000_core.sql" "$CORE_SQL" << 'PYEOF'
import re
import sys

source_path, public_path = sys.argv[1], sys.argv[2]

with open(source_path, 'r', encoding='utf-8') as f:
    source = f.read()

with open(public_path, 'r', encoding='utf-8') as f:
    public = f.read()

def extract_block(start_marker: str, end_marker: str) -> str:
    match = re.search(
        re.escape(start_marker) + r'.*?' + re.escape(end_marker),
        source,
        flags=re.DOTALL,
    )
    if not match:
        raise SystemExit(f'Failed to extract required SQL block starting at: {start_marker}')
    return match.group(0).strip()

project_invite_markers = (
    'create or replace function public.mark_project_invite_email_sent(',
    'create or replace function public.get_project_invite_snapshot(',
)
if any(marker not in public for marker in project_invite_markers):
    public = public.rstrip() + '\n\n' + extract_block(
        'create or replace function public.mark_project_invite_email_sent(',
        'grant execute on function public.revoke_project_invite(uuid) to authenticated;',
    ) + '\n'

org_invite_markers = (
    'create or replace function public.create_organization_invite(',
    'create or replace function public.mark_invitation_email_sent(',
    'create or replace function public.revoke_invitation(',
)
if any(marker not in public for marker in org_invite_markers):
    public = public.rstrip() + '\n\n' + extract_block(
        'create or replace function public.create_organization_invite(',
        'grant execute on function public.revoke_invitation(uuid) to authenticated;',
    ) + '\n'

with open(public_path, 'w', encoding='utf-8') as f:
    f.write(public)
PYEOF

# ─── Verification ────────────────────────────────────────────────────────
echo ""
echo "==> Running verification checks..."
ERRORS=0

# Check for PII (exclude this script itself, the LICENSE file which legitimately
# names the copyright holder, and binary files).
PII_PATTERNS='lilagames|lila\.games|jokim1|Joseph Kim|\bJ Kim\b|\bjkim\b|jokim.*@gmail'
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
  "supabase/functions/billing-auth" \
  "src/features/super-admin" \
  "supabase/functions/billing-checkout" \
  "supabase/functions/billing-invoices" \
  "supabase/functions/billing-payment-method" \
  "supabase/functions/billing-portal-session" \
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

# Check that hosted-only deploy artifacts are gone
for rel in \
  ".github/workflows/deploy-hosted.yml" \
  "scripts/deploy-hosted-workflow.test.mjs" \
  "scripts/validate-hosted-deploy-env.mjs" \
  "scripts/validate-hosted-deploy-env.test.mjs"
do
  if [ -e "$PUBLIC_DIR/$rel" ]; then
    echo "FAIL: Hosted-only artifact leaked into export: $rel"
    ERRORS=$((ERRORS + 1))
  fi
done
echo "PASS: Hosted-only deploy artifacts removed"

# Check that the seeded internal-admin account is gone
if grep -rq --exclude='prepare-public-release.sh' "admin@rocketboard.dev" "$PUBLIC_DIR" 2>/dev/null; then
  echo "FAIL: Seeded internal-admin account leaked into export"
  grep -rn --exclude='prepare-public-release.sh' "admin@rocketboard.dev" "$PUBLIC_DIR" || true
  ERRORS=$((ERRORS + 1))
else
  echo "PASS: Seeded internal-admin account removed"
fi

# Check for SQL remnants that should never ship
for pattern in 'super_admin_' 'admin_audit_log' 'award_invites'; do
  if grep -q "$pattern" "$CORE_SQL" 2>/dev/null; then
    echo "FAIL: Found SQL remnant in _core.sql: $pattern"
    grep -n "$pattern" "$CORE_SQL" || true
    ERRORS=$((ERRORS + 1))
  fi
done
echo "PASS: No hosted-only SQL remnants in _core.sql"

# Check that billing/Stripe function config blocks are gone
if grep -Eq '\[functions\.(stripe-webhook|billing-checkout|billing-invoices|billing-payment-method|billing-portal-session)\]' "$PUBLIC_DIR/supabase/config.toml"; then
  echo "FAIL: Hosted-only function config leaked into supabase/config.toml"
  grep -En '\[functions\.(stripe-webhook|billing-checkout|billing-invoices|billing-payment-method|billing-portal-session)\]' "$PUBLIC_DIR/supabase/config.toml" || true
  ERRORS=$((ERRORS + 1))
else
  echo "PASS: Hosted-only function config removed from supabase/config.toml"
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
  echo "  npm ci"
  echo "  npm run typecheck"
  echo "  npm test"
  echo "  npm run build"
  echo ""
  echo "If build passes, push to public remote."
fi
