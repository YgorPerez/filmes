// A whole oracle run: the scenarios, the replays in parallel, the report.

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrateConfig } from '@filmes/key-migration'
import { loadAdapter, type Adapter } from './adapter/index.ts'
import { globRegExp } from './compare.ts'
import { loadDecisions, type Decision } from './decisions.ts'
import { pool } from './harvest.ts'
import { ROOT } from './paths.ts'
import { replayScenario, type ScenarioResult } from './replay.ts'
import { buildReport, type Report } from './report.ts'
import type { Scenario } from './scenario.ts'
import { commandOf } from './adapter/index.ts'

export interface RunOptions {
  readonly python: string
  readonly scenarios: readonly Scenario[]
  readonly jobs: number
  /** Globs over scenario ids. */
  readonly only?: readonly string[]
  /** Only scenarios with a step of one of these Python commands. */
  readonly commands?: readonly string[]
  readonly selfCheck?: boolean
  readonly keep?: boolean
  readonly adapter?: Adapter
  readonly decisions?: readonly Decision[]
  readonly onScenario?: (result: ScenarioResult) => void
}

export interface RunResult {
  readonly report: Report
  readonly results: readonly ScenarioResult[]
}

/** The English config, once per run (`config/` migrated, no local.toml). */
function englishConfig(): string {
  const dir = join(
    mkdtempSync(join(tmpdir(), 'filmes-oracle-config-')),
    'config',
  )
  migrateConfig(join(ROOT, 'config'), dir, 'to-en')
  rmSync(join(dir, 'local.toml'), { force: true })
  return dir
}

export async function runOracle(options: RunOptions): Promise<RunResult> {
  const adapter = options.adapter ?? (await loadAdapter())
  const decisions = options.decisions ?? loadDecisions()
  const selected = options.scenarios.filter(
    (scenario) =>
      (!options.only?.length ||
        options.only.some((glob) => globRegExp(glob).test(scenario.id))) &&
      (!options.commands?.length ||
        scenario.steps.some((step) =>
          options.commands?.includes(commandOf(step.argv).command),
        )),
  )
  const config = englishConfig()
  try {
    const results = await pool(selected, options.jobs, async (scenario) => {
      const result = await replayScenario(scenario, {
        python: options.python,
        adapter,
        config,
        selfCheck: options.selfCheck ?? true,
        keep: options.keep ?? false,
      })
      options.onScenario?.(result)
      return result
    })
    const full =
      selected.length === options.scenarios.length &&
      (options.selfCheck ?? true)
    return {
      results,
      report: buildReport(results, decisions, {
        ported: adapter.ported,
        full,
        selfCheck: options.selfCheck ?? true,
      }),
    }
  } finally {
    rmSync(join(config, '..'), { recursive: true, force: true })
  }
}
