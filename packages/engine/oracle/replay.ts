// One scenario on both engines (#76 §4.1). Python runs every step twice,
// in two folders, with `PYTHONHASHSEED` 0 and 1 (the self-check). Before a
// step the adapter ports, the TypeScript side gets a copy of the seed-0
// folder with filmes-dados migrated to English, so it always starts from
// Python's state, whatever happened in the steps before; then both outcomes
// and both resulting states are compared.

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join, relative } from 'node:path'
import {
  migrateConfig,
  migrateConfigFile,
  migrateDataPath,
  outputToEnglish,
} from '@filmes/key-migration'
import { makeEngine } from '../src/runtime/Engine.ts'
import type { Adapted, Adapter } from './adapter/index.ts'
import {
  compareOutcomes,
  mapStrings,
  placeholders,
  pythonDataPaths,
  type Difference,
  type Outcome,
} from './compare.ts'
import { FIXTURE_DATA, ROOT } from './paths.ts'
import { pythonEnv, runPython } from './python.ts'
import type { Scenario, Step } from './scenario.ts'
import {
  applyFiles,
  compareDatabases,
  compareTrees,
  migratedCopy,
  syncTypeScript,
} from './state.ts'

export interface StepResult {
  readonly index: number
  /** The Python command (`pessoa ver`). */
  readonly command: string
  readonly status: 'compared' | 'not_ported'
  /** Python against TypeScript, Python against itself, the replay against
   * pytest. Decisions are applied later, by the report. */
  readonly differences: readonly Difference[]
  /** Seed 0's outcome, when `capture` is on. */
  readonly python?: Outcome
}

export interface ScenarioResult {
  readonly id: string
  readonly steps: readonly StepResult[]
  /** The harness could not run the scenario (Python printed no JSON...). */
  readonly error?: string
  /** The scenario's folders, when `keep` is on. */
  readonly work?: string
}

export interface ReplayOptions {
  readonly python: string
  readonly adapter: Adapter
  /** The English config (`FILMES_CONFIG` of the TypeScript side). */
  readonly config: string
  /** Run Python a second time with another hash seed (default on). */
  readonly selfCheck?: boolean
  /** Keep the scenario's folders (`py0`, `py1`, `ts`) and say where. */
  readonly keep?: boolean
  /** Return seed 0's outcome of each step. */
  readonly capture?: boolean
}

/** Config files a step may point at with a variable, which the TypeScript
 * side reads in English. */
const CONFIG_VARIABLES: Readonly<Record<string, string>> = {
  FILMES_PESOS: 'pesos.toml',
  FILMES_VERSOES: 'versoes-catalogo.json',
}

const resolve = (text: string, work: string) =>
  text.replaceAll('{work}', work).replaceAll('{root}', ROOT)

/** A path argument or variable as the TypeScript side names it:
 * `{work}/dados/sessoes/x.md` is `{work}/data/sessions/x.md`. */
const resolveForTs = (text: string, work: string) =>
  resolve(
    text.replace(/^\{work\}\/dados(\/.*)?$/, (_, rest?: string) =>
      rest
        ? `{work}/data/${migrateDataPath(rest.slice(1), 'to-en')}`
        : '{work}/data',
    ),
    work,
  )

const pythonVars = (step: Step, work: string): Record<string, string> =>
  Object.fromEntries(
    Object.entries(step.env).map(([key, value]) => [key, resolve(value, work)]),
  )

/** The TypeScript side's variables: the same, with filmes-dados in `data/`,
 * the English config, and any config file a variable names migrated. */
function tsVars(
  step: Step,
  work: string,
  config: string,
): Record<string, string> {
  const vars: Record<string, string> = { FILMES_CONFIG: config }
  for (const [key, value] of Object.entries(step.env)) {
    const path = resolveForTs(value, work)
    // A step's own config folder (`tests/test_config.py`), in English.
    if (key === 'FILMES_CONFIG' && existsSync(path)) {
      vars[key] = join(work, '.oracle-config-folder')
      rmSync(vars[key], { recursive: true, force: true })
      migrateConfig(path, vars[key], 'to-en')
      continue
    }
    const name = CONFIG_VARIABLES[key]
    const migrated =
      name !== undefined && existsSync(path)
        ? migrateConfigFile(name, readFileSync(path, 'utf8'), 'to-en')
        : undefined
    if (migrated) {
      const folder = join(work, '.oracle-config')
      mkdirSync(folder, { recursive: true })
      vars[key] = join(folder, basename(path))
      writeFileSync(vars[key], migrated.text)
    } else vars[key] = path
  }
  return vars
}

/** A Python outcome in English, for the parity check. Output the key map
 * does not know is itself a difference. */
function pythonInEnglish(
  command: string,
  outcome: Outcome,
): Outcome | Difference {
  try {
    return {
      exitCode: outcome.exitCode,
      output: outputToEnglish(command, outcome.output),
    }
  } catch (error) {
    return {
      check: 'parity',
      path: 'output',
      python: `outside the key map: ${(error as Error).message}`,
      ts: '',
    }
  }
}

async function runTypeScript(
  adapted: Extract<Adapted, { kind: 'ported' }>,
  vars: Record<string, string>,
): Promise<Outcome> {
  const engine = makeEngine(vars)
  try {
    const outcome = await engine.run(adapted.operation)
    // What the CLI would print: `undefined` fields go, as in JSON.
    return {
      exitCode: outcome.exitCode,
      output: JSON.parse(JSON.stringify(outcome.output) ?? 'null') as unknown,
    }
  } finally {
    await engine.dispose()
  }
}

const SEEDS = [0, 1] as const

/** Replays one scenario. Never throws: a harness failure is `error`. */
export async function replayScenario(
  scenario: Scenario,
  options: ReplayOptions,
): Promise<ScenarioResult> {
  const work = mkdtempSync(join(tmpdir(), 'filmes-oracle-'))
  const seeds = options.selfCheck === false ? SEEDS.slice(0, 1) : SEEDS
  const folders = seeds.map((seed) => join(work, `py${seed}`))
  const ts = join(work, 'ts')
  const english = join(work, 'py0-en')
  for (const folder of folders)
    cpSync(FIXTURE_DATA, join(folder, 'dados'), { recursive: true })
  const steps: StepResult[] = []
  try {
    for (const [index, step] of scenario.steps.entries()) {
      for (const folder of folders) applyFiles(folder, step.files)
      const adapted = options.adapter.adapt(
        step.argv.map((arg) => resolveForTs(arg, ts)),
        step.stdin === null ? null : resolve(step.stdin, ts),
        pythonVars(step, folders[0] as string),
      )
      if (adapted.kind === 'ported') syncTypeScript(folders[0] as string, ts)

      const outcomes = await Promise.all(
        folders.map((folder, i) =>
          runPython(
            options.python,
            step.argv.map((arg) => resolve(arg, folder)),
            step.stdin === null ? null : resolve(step.stdin, folder),
            pythonEnv(pythonVars(step, folder), seeds[i] as number),
          ),
        ),
      )
      const [py0 = folders[0] as string, py1] = folders
      const seed0 = outcomes[0] as Outcome
      const asWork0 = placeholders(py0, ROOT)
      const differences: Difference[] = []

      if (step.exitCode !== undefined)
        differences.push(
          ...compareOutcomes(
            {
              exitCode: seed0.exitCode,
              output: mapStrings(seed0.output, asWork0),
            },
            { exitCode: step.exitCode, output: step.output },
            {},
            'replay',
          ),
        )

      if (py1 !== undefined && outcomes[1]) {
        const asWork1 = placeholders(py1, ROOT)
        const rewrite = { python: asWork0, ts: asWork1 }
        differences.push(
          ...compareOutcomes(
            {
              exitCode: seed0.exitCode,
              output: mapStrings(seed0.output, asWork0),
            },
            {
              exitCode: outcomes[1].exitCode,
              output: mapStrings(outcomes[1].output, asWork1),
            },
            {},
            'self-check',
          ),
          ...compareTrees(
            join(py0, 'dados'),
            join(py1, 'dados'),
            'data',
            'self-check',
            {
              mode: 'bytes',
              ...rewrite,
            },
          ),
          ...compareDatabases(
            pythonVars(step, py0)['FILMES_BANCO'] ?? join(py0, 'filmes.sqlite'),
            pythonVars(step, py1)['FILMES_BANCO'] ?? join(py1, 'filmes.sqlite'),
            'self-check',
            rewrite,
          ),
        )
      }

      if (adapted.kind === 'ported') {
        const vars = tsVars(step, ts, options.config)
        const tsOutcome = await runTypeScript(adapted, vars)
        const asWorkTs = placeholders(ts, ROOT)
        const asWorkPy = (text: string) => pythonDataPaths(asWork0(text))
        const mapped = pythonInEnglish(adapted.command, seed0)
        if ('check' in mapped) differences.push(mapped)
        else
          differences.push(
            ...compareOutcomes(
              {
                exitCode: mapped.exitCode,
                output: mapStrings(mapped.output, asWorkPy),
              },
              {
                exitCode: tsOutcome.exitCode,
                output: mapStrings(tsOutcome.output, asWorkTs),
              },
              adapted,
            ),
          )
        const rewrite = { python: asWorkPy, ts: asWorkTs }
        differences.push(
          ...compareTrees(
            migratedCopy(join(py0, 'dados'), english),
            join(ts, 'data'),
            'data',
            'parity',
            { mode: 'semantic', ...rewrite },
          ),
          ...compareDatabases(
            pythonVars(step, py0)['FILMES_BANCO'] ?? join(py0, 'filmes.sqlite'),
            vars['FILMES_BANCO'] ?? join(ts, 'filmes.sqlite'),
            'parity',
            rewrite,
          ),
        )
        if (adapted.files.length > 0)
          differences.push(
            ...compareTrees(
              py0,
              ts,
              'files',
              'parity',
              { mode: 'bytes', ...rewrite },
              adapted.files.map((file) =>
                isAbsolute(file) ? relative(ts, file) : file,
              ),
            ),
          )
      }

      steps.push({
        index,
        command: adapted.command,
        status: adapted.kind === 'ported' ? 'compared' : 'not_ported',
        differences,
        ...(options.capture && { python: seed0 }),
      })
    }
    return { id: scenario.id, steps, ...(options.keep && { work }) }
  } catch (error) {
    return {
      id: scenario.id,
      steps,
      error: error instanceof Error ? error.message : String(error),
      ...(options.keep && { work }),
    }
  } finally {
    if (!options.keep) rmSync(work, { recursive: true, force: true })
  }
}
