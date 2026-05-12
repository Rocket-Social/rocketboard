const SUPPORTED_SURFACES = ['frontend', 'edge', 'sql'];

function normalizeSurfaces(values) {
  const unique = new Set(values.filter(Boolean));
  return SUPPORTED_SURFACES.filter((surface) => unique.has(surface));
}

function isSqlAffectingPath(filePath) {
  return filePath.startsWith('supabase/migrations/')
    || filePath === 'scripts/check-migrations.mjs'
    || filePath === 'scripts/check-migrations.test.mjs'
    || /^scripts\/sql-verify-.*\.mjs$/.test(filePath)
    || filePath === 'scripts/classify-paths.mjs'
    || filePath === '.github/workflows/ci.yml'
    || filePath === '.github/workflows/deploy-hosted.yml';
}

export function classifyPathsToSurfaces(paths) {
  const surfaces = new Set();

  for (const filePath of paths) {
    if (!filePath || filePath.startsWith('docs/') || filePath.endsWith('.md')) {
      continue;
    }

    if (filePath.startsWith('supabase/functions/')) {
      surfaces.add('edge');
      continue;
    }

    if (isSqlAffectingPath(filePath)) {
      surfaces.add('sql');
      continue;
    }

    if (
      filePath.startsWith('src/')
      || filePath.startsWith('public/')
      || filePath === 'index.html'
      || filePath === 'package.json'
      || filePath === 'package-lock.json'
      || filePath === 'postcss.config.js'
      || filePath === 'tailwind.config.js'
      || filePath === 'vite.config.ts'
      || filePath === 'tsconfig.app.json'
      || filePath === 'tsconfig.node.json'
    ) {
      surfaces.add('frontend');
    }
  }

  return normalizeSurfaces([...surfaces]);
}
