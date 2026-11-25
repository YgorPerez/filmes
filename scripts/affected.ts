// What a diff affects, like pesquisa-relacionamentos' `affected.ts`: the push
// hook (`verify-push.ts`) runs only that. The full suite runs in the PR's CI.
//
// Vitest tests pick themselves: `--changed <base>` follows the import graph
// from what changed. What is left to decide here is when to run everything,
// because the graph does not see what changes outside it (the lockfile, a
// config, the CI), which folders to run Vitest in, and whether the Python
// suite and the MCP tests run. The MCP calls the Python CLI, so a change to
// the Python engine runs both.
//
// Runs on plain `node`, which reads TypeScript by itself: only syntax it
// strips.

export type Plan = {
  /** Why everything runs, or `null` when only the affected part runs. */
  readonly full: string | null
  /** The folders where Vitest runs (with `--changed`, unless `full`): `frontend`,
   * `packages/engine`, `packages/key-migration`, `packages/mcp-server`, or
   * `.` for the root
   * scripts. */
  readonly vitest: readonly string[]
  /** Whether the MCP tests (Vitest, over the real CLI) run. */
  readonly mcp: boolean
  /** Whether the Python suite (`uv run pytest`) runs. */
  readonly python: boolean
}

/** What changes outside the import graph, or what everything else uses. */
const AFFECTS_ALL: ReadonlyArray<[RegExp, string]> = [
  [/(^|\/)pnpm-(lock|workspace)\.yaml$/, 'pnpm-lock or the workspace changed'],
  [/(^|\/)package\.json$/, 'a package.json changed'],
  [/(^|\/)tsconfig[^/]*\.json$/, 'a tsconfig changed'],
  [/(^|\/)[^/]+\.config\.(ts|js|mjs)$/, 'a config changed'],
  [/^\.github\/workflows\//, 'the CI changed'],
  [/^Makefile$/, 'the Makefile changed'],
]

/** The Python engine and what it reads. */
const PYTHON = /^(filmes|tests|config)\/|^(pyproject\.toml|uv\.lock)$/
/** Has no tests: text for people and for agents. */
const TEXT_ONLY = /(\.md$|^docs\/|^skill\/|^\.claude\/)/
/** A test folder, whose files (fixtures, a corpus) are data. */
const TEST_DATA = /(^|\/)tests?\//
const FROM_ROOT = /^(\.github\/)?scripts\//
/** What the key migration's round-trip test reads, outside its package. */
const MIGRATED = /^(config\/|tests\/fixture\/dados\/)/
/** What the engine's tests read outside its package: the fixture and the
 * config (`packages/engine/test/global-setup.ts`), the key migration that
 * puts them in English, and the Python engine its parity tests run. */
const ENGINE_FIXTURE =
  /^(filmes\/|tests\/fixture\/|config\/|packages\/key-migration\/src\/|pyproject\.toml$|uv\.lock$)/
/** What the MCP server's tests read outside the import graph: the engine's
 * fixture, built from these (`packages/engine/test/global-setup.ts`). */
const MCP_SERVER_FIXTURE =
  /^(tests\/fixture\/|config\/|packages\/key-migration\/src\/)/
/** The pytest seam, whose trace hook the parity oracle's tests run
 * (`packages/engine/oracle/`). */
const ORACLE_TRACE = /^tests\/conftest\.py$/
const VITEST_FOLDERS = [
  'frontend',
  'packages/engine',
  'packages/key-migration',
  'packages/mcp-server',
  '.',
]

/** The plan for a run, from the files the diff changed, with paths from the
 * repo root. */
export function planForDiff(files: readonly string[]): Plan {
  const vitest = new Set<string>()
  let mcp = false
  let python = false

  for (const file of files) {
    const affectsAll = AFFECTS_ALL.find(([pattern]) => pattern.test(file))
    if (affectsAll)
      return {
        full: `${affectsAll[1]} (${file})`,
        vitest: VITEST_FOLDERS,
        mcp: true,
        python: true,
      }
    // Markdown under config/ or a test folder is data the tests read, not text.
    if (TEXT_ONLY.test(file) && !PYTHON.test(file) && !TEST_DATA.test(file))
      continue
    if (MIGRATED.test(file)) vitest.add('packages/key-migration')
    if (ENGINE_FIXTURE.test(file) || ORACLE_TRACE.test(file))
      vitest.add('packages/engine')
    if (MCP_SERVER_FIXTURE.test(file)) vitest.add('packages/mcp-server')
    if (PYTHON.test(file)) {
      python = true
      mcp = true
    } else if (file.startsWith('packages/key-migration/'))
      vitest.add('packages/key-migration')
    else if (file.startsWith('mcp/')) mcp = true
    else if (FROM_ROOT.test(file)) vitest.add('.')
    else if (file.startsWith('frontend/')) vitest.add('frontend')
    else if (file.startsWith('packages/mcp-server/'))
      vitest.add('packages/mcp-server')
    else if (file.startsWith('packages/engine/')) {
      vitest.add('packages/engine')
      vitest.add('frontend')
      vitest.add('packages/mcp-server')
    }
  }
  return {
    full: null,
    vitest: VITEST_FOLDERS.filter((f) => vitest.has(f)),
    mcp,
    python,
  }
}
