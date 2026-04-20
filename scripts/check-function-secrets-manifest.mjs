#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const FUNCTION_SECRET_MANIFEST_RELATIVE_PATH = path.join('supabase', 'functions', 'secrets.manifest.json');
const FUNCTION_SOURCE_ROOT = path.join('supabase', 'functions');

function normalizeNames(values) {
  return [...new Set(
    values
      .filter((value) => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean),
  )].sort();
}

export function readFunctionSecretManifest(repoRoot) {
  const manifestPath = path.join(repoRoot, FUNCTION_SECRET_MANIFEST_RELATIVE_PATH);

  if (!existsSync(manifestPath)) {
    throw new Error(`Missing function secret manifest at ${FUNCTION_SECRET_MANIFEST_RELATIVE_PATH}.`);
  }

  const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return {
    required: normalizeNames(parsed.required ?? []),
    optional: normalizeNames(parsed.optional ?? []),
  };
}

export function extractRuntimeSecretNames(sourceText) {
  const names = new Set();
  const pattern = /Deno\.env\.get\((['"])([A-Z0-9_]+)\1\)/g;

  let match = pattern.exec(sourceText);
  while (match) {
    names.add(match[2]);
    match = pattern.exec(sourceText);
  }

  return normalizeNames([...names]);
}

function walkFiles(rootDir) {
  const files = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const target = path.join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(target);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) {
        continue;
      }

      files.push(target);
    }
  }

  return files.sort();
}

export function collectRuntimeSecretNames(repoRoot) {
  const sourceRoot = path.join(repoRoot, FUNCTION_SOURCE_ROOT);
  const names = new Set();

  for (const filePath of walkFiles(sourceRoot)) {
    for (const name of extractRuntimeSecretNames(readFileSync(filePath, 'utf8'))) {
      names.add(name);
    }
  }

  return normalizeNames([...names]);
}

export function validateFunctionSecretManifest(repoRoot) {
  const manifest = readFunctionSecretManifest(repoRoot);
  const referenced = collectRuntimeSecretNames(repoRoot);
  const declared = new Set([...manifest.required, ...manifest.optional]);
  const missing = referenced.filter((name) => !declared.has(name));

  return {
    manifest,
    referenced,
    missing,
    ok: missing.length === 0,
  };
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  const result = validateFunctionSecretManifest(process.cwd());

  if (result.ok) {
    console.log(
      `Function secret manifest covers ${result.referenced.length} runtime env keys in ${FUNCTION_SECRET_MANIFEST_RELATIVE_PATH}.`,
    );
    process.exit(0);
  }

  console.error('Function secret manifest is missing runtime env keys:');
  for (const name of result.missing) {
    console.error(`- ${name}`);
  }
  console.error(`Update ${FUNCTION_SECRET_MANIFEST_RELATIVE_PATH} and rerun the check.`);
  process.exit(1);
}
