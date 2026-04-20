import { describe, expect, it } from 'vitest';

import {
  extractRuntimeSecretNames,
  validateFunctionSecretManifest,
} from './check-function-secrets-manifest.mjs';

describe('check-function-secrets-manifest helpers', () => {
  it('extracts Deno env keys from runtime sources', () => {
    expect(extractRuntimeSecretNames(`
const APP_URL = Deno.env.get('APP_URL')
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const ignored = process.env.NOT_INCLUDED
`)).toEqual(['APP_URL', 'SUPABASE_URL']);
  });

  it('covers the current runtime function env keys', () => {
    const result = validateFunctionSecretManifest(process.cwd());

    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.referenced).toContain('APP_URL');
    expect(result.referenced).toContain('SUPABASE_URL');
  });
});
