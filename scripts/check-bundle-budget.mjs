import {gzipSync} from 'node:zlib'
import {readFileSync, readdirSync} from 'node:fs'
import {join} from 'node:path'

// Measured from a clean rebuild of main commit 458c12b on 2026-04-05.
const MAIN_INDEX_GZIP_BASELINE_BYTES = 80370
// Keep the cap tight enough to catch real startup regressions, but leave room
// for small product additions without forcing sub-kilobyte code golf. The
// initiative sidebar parity fix added ~82 CI bytes, and main only had 25 bytes
// left, so bump this in one small step instead of resetting the baseline.
// The SignedInShellLayout extraction (slot-publishing pattern that survives
// cross-layout navigation) added ~1073 structural bytes; bumped again in one
// small step.
// The live wiki recent-link metadata fix moved current path/title/icon
// derivation into the always-loaded sidebar, which added ~473 gzip bytes to the
// startup bundle on top of the previous main measurement. Bump by one more
// 512-byte step instead of resetting the baseline so future regressions still
// have to justify themselves.
const ALLOWED_GZIP_DELTA_BYTES = 7168
// Small buffer for zlib/platform variance between local and CI runners.
// The same index bundle measured 165 bytes larger on GitHub's Node 22.22.2
// runner than on local Node 22.22.1, so keep a modest environment cushion.
const GZIP_ENV_TOLERANCE_BYTES = 768
const MAX_INDEX_GZIP_BYTES =
  MAIN_INDEX_GZIP_BASELINE_BYTES + ALLOWED_GZIP_DELTA_BYTES + GZIP_ENV_TOLERANCE_BYTES
const DIST_ASSETS_DIR = join(process.cwd(), 'dist', 'assets')

const ROUTE_GZIP_BUDGETS = [
  {label: 'AI Agents route', maxGzipBytes: 8_192, pattern: /^AiAgentsPage-.*\.js$/},
  {label: 'My Notes route', maxGzipBytes: 32_768, pattern: /^MyNotesPage-.*\.js$/},
  {label: 'Wiki route', maxGzipBytes: 20_480, pattern: /^WikiPage-.*\.js$/},
]

function readBundle(file) {
  const bundlePath = join(DIST_ASSETS_DIR, file)
  const buffer = readFileSync(bundlePath)

  return {
    buffer,
    gzipBytes: gzipSync(buffer).length,
    path: bundlePath,
  }
}

const indexBundle = readdirSync(DIST_ASSETS_DIR).find((file) => /^index-.*\.js$/.test(file))

if (!indexBundle) {
  throw new Error(`Could not find an index bundle in ${DIST_ASSETS_DIR}. Run "npm run build" first.`)
}

const {gzipBytes} = readBundle(indexBundle)

console.log(`Bundle budget check`)
console.log(`Index bundle: ${indexBundle}`)
console.log(`Current gzip size: ${gzipBytes} bytes`)
console.log(
  `Budget: ${MAX_INDEX_GZIP_BYTES} bytes (${MAIN_INDEX_GZIP_BASELINE_BYTES} baseline + ${ALLOWED_GZIP_DELTA_BYTES} bytes + ${GZIP_ENV_TOLERANCE_BYTES} bytes tolerance)`,
)

if (gzipBytes > MAX_INDEX_GZIP_BYTES) {
  throw new Error(
    `Initial bundle gzip size ${gzipBytes} bytes exceeds the ${MAX_INDEX_GZIP_BYTES} byte budget.`,
  )
}

for (const budget of ROUTE_GZIP_BUDGETS) {
  const bundle = readdirSync(DIST_ASSETS_DIR).find((file) => budget.pattern.test(file))

  if (!bundle) {
    throw new Error(`Could not find the ${budget.label} bundle in ${DIST_ASSETS_DIR}.`)
  }

  const {gzipBytes: routeGzipBytes} = readBundle(bundle)

  console.log(`${budget.label}: ${bundle} (${routeGzipBytes} bytes gzip)`)

  if (routeGzipBytes > budget.maxGzipBytes) {
    throw new Error(
      `${budget.label} gzip size ${routeGzipBytes} bytes exceeds the ${budget.maxGzipBytes} byte budget.`,
    )
  }
}

const wikiBundle = readdirSync(DIST_ASSETS_DIR).find((file) => /^WikiPage-.*\.js$/.test(file))

if (!wikiBundle) {
  throw new Error(`Could not find the wiki bundle in ${DIST_ASSETS_DIR}.`)
}

const wikiBundleText = readBundle(wikiBundle).buffer.toString('utf8')

const hasStaticEditorImport = /^import[^;]+RichTextEditor/m.test(wikiBundleText)
  || /^import[^;]+vendor-editor/m.test(wikiBundleText)

if (hasStaticEditorImport) {
  throw new Error('Wiki read bundle still imports editor code. Keep editor code split behind the lazy editor boundary.')
}
