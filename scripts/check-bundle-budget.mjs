import {gzipSync} from 'node:zlib'
import {readFileSync, readdirSync} from 'node:fs'
import {join} from 'node:path'

// Refreshed 2026-05-08 from current main after the inline search trigger and
// global command palette mount landed. The previous 2026-04-29 baseline
// (94300) had been eaten by intentional shell additions on main, leaving zero
// room for new PRs. Re-baseline rather than stack more allowance.
const MAIN_INDEX_GZIP_BASELINE_BYTES = 98556
// Leave a small amount of growth headroom so deliberate product changes do not
// require instant code golf or a baseline reset.
const ALLOWED_GZIP_DELTA_BYTES = 512
// Small buffer for zlib/runtime variance between local and CI runners. The
// same index bundle measured 75 bytes larger on GitHub's Node 24.14.1 runner
// than on local Node 22.22.1, so keep a modest environment cushion.
const GZIP_ENV_TOLERANCE_BYTES = 768
const MAX_INDEX_GZIP_BYTES =
  MAIN_INDEX_GZIP_BASELINE_BYTES + ALLOWED_GZIP_DELTA_BYTES + GZIP_ENV_TOLERANCE_BYTES
const DIST_ASSETS_DIR = join(process.cwd(), 'dist', 'assets')

const ROUTE_GZIP_BUDGETS = [
  // Bumped 2026-05-09 from 16_896 → 17_664 to absorb the Sprint Health
  // Watcher monitor-Job project picker + its NewTaskDialog branch.
  // Bumped 2026-05-10 from 17_664 → 18_432 to absorb the Sprint Manager
  // fixups: Assign-to dropdown on monitor jobs + the schedule-edit
  // click handler + useAgentSchedulesQuery import.
  // Bumped 2026-05-10 from 18_432 → 19_200 to absorb the styled
  // PersonaPicker (popover trigger + search + persona list, modeled
  // on AssigneePicker) that replaces the native <select> in
  // NewTaskDialog. Net delta on the AiAgentsPage chunk is ~400 bytes
  // gzip; the bump adds ~360 bytes of headroom for normal churn.
  {label: 'AI Agents route', maxGzipBytes: 19_200, pattern: /^AiAgentsPage-.*\.js$/},
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
