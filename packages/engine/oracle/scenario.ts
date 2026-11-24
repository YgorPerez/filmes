// A scenario is one pytest test, as the trace hook in `tests/conftest.py`
// recorded it: the steps it ran on the Python CLI, in order. Paths inside
// the test's temporary folder are written `{work}`, paths inside the repo
// `{root}`.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface Step {
  /** The CLI arguments, without the `--json` the seam always adds. */
  readonly argv: readonly string[]
  readonly stdin: string | null
  /** Every `FILMES_*` variable the step ran with. */
  readonly env: Readonly<Record<string, string>>
  /** What the test itself changed in `{work}` since the previous step: the
   * new content in base64, or `null` for a file it removed. */
  readonly files: Readonly<Record<string, string | null>>
  /** What pytest saw. A hand-written step may leave them out: then the
   * replay is not checked against them. */
  readonly exitCode?: number
  readonly output?: unknown
}

export interface Scenario {
  /** The pytest node id, `tests/test_x.py::test_y`. */
  readonly id: string
  readonly steps: readonly Step[]
}

/** The scenarios of a trace file (JSON lines), sorted by id. */
export function readScenarios(file: string): Scenario[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Scenario)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** Where hand-written scenarios go (#76 §4.2): what the suite misses, one
 * JSON line per scenario, in the trace's format. */
export const SCENARIOS_DIR = join(import.meta.dirname, 'scenarios')

/** Every hand-written scenario, from the `*.jsonl` files of `dir`. */
export function handWritten(dir = SCENARIOS_DIR): Scenario[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((file) => file.endsWith('.jsonl'))
    .sort()
    .flatMap((file) => readScenarios(join(dir, file)))
}

/** The fixture env every pytest step starts from (`tests/conftest.py`). */
export const FIXTURE_STEP_ENV: Readonly<Record<string, string>> = {
  FILMES_BANCO: '{work}/filmes.sqlite',
  FILMES_CATALOGO: '{root}/tests/fixture/catalogo',
  FILMES_DADOS: '{work}/dados',
  FILMES_HOJE: '2026-11-20',
  FILMES_LOCAL: '{work}/sem-config-local.toml',
}
