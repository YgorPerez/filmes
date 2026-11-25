// What a diff affects, like pesquisa-relacionamentos' `affected.ts`: the push
// hook (`verify-push.ts`) runs only that. The full suite runs in the PR's CI.
//
// Vitest tests pick themselves: `--changed <base>` follows the import graph
// from what changed. What is left to decide here is when to run everything,
// because the graph does not see what changes outside it (the lockfile, a
// config, the CI), and which folders to run Vitest in.
//
// Runs on plain `node`, which reads TypeScript by itself: only syntax it
// strips.

export type Plan = {
  /** Why everything runs, or `null` when only the affected part runs. */
  readonly full: string | null
  /** The folders where Vitest runs (with `--changed`, unless `full`): `frontend`,
   * `packages/engine`, `packages/mcp-server`, or `.` for the root
   * scripts. */
  readonly vitest: readonly string[]
}

/** What changes outside the import graph, or what everything else uses. */
const AFFECTS_ALL: ReadonlyArray<[RegExp, string]> = [
  [/(^|\/)pnpm-(lock|workspace)\.yaml$/, 'pnpm-lock or the workspace changed'],
  [/(^|\/)package\.json$/, 'a package.json changed'],
  [/(^|\/)tsconfig[^/]*\.json$/, 'a tsconfig changed'],
  [/(^|\/)[^/]+\.config\.(ts|js|mjs)$/, 'a config changed'],
  [/^\.github\/workflows\//, 'the CI changed'],
]

/** Has no tests: text for people and for agents. */
const TEXT_ONLY = /(\.md$|^docs\/|^\.claude\/)/
/** The engine's config: its Markdown is data too. */
const CONFIG = /^config\//
/** A test folder, whose files (fixtures, a corpus) are data. */
const TEST_DATA = /(^|\/)tests?\//
const FROM_ROOT = /^(\.github\/)?scripts\//
/** What the engine's and the MCP server's tests read outside the import
 * graph: the fixture and the config the engine's fixture is built from
 * (`packages/engine/test/global-setup.ts`). */
const ENGINE_FIXTURE = /^(tests\/fixture\/|config\/)/
const VITEST_FOLDERS = [
  'frontend',
  'packages/engine',
  'packages/mcp-server',
  '.',
]

/** The plan for a run, from the files the diff changed, with paths from the
 * repo root. */
export function planForDiff(files: readonly string[]): Plan {
  const vitest = new Set<string>()

  for (const file of files) {
    const affectsAll = AFFECTS_ALL.find(([pattern]) => pattern.test(file))
    if (affectsAll)
      return {
        full: `${affectsAll[1]} (${file})`,
        vitest: VITEST_FOLDERS,
      }
    // Markdown under config/ or a test folder is data the tests read, not text.
    if (TEXT_ONLY.test(file) && !CONFIG.test(file) && !TEST_DATA.test(file))
      continue
    if (ENGINE_FIXTURE.test(file)) {
      vitest.add('packages/engine')
      vitest.add('packages/mcp-server')
    }
    if (FROM_ROOT.test(file)) vitest.add('.')
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
  }
}
