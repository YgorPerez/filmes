// The oracle on a real scenario (#83's acceptance): a TypeScript stand-in
// that answers exactly what Python answered is clean, and the same stand-in
// with one evidence text changed is caught at that text. Python runs for
// real, through `uv`, as in the engine's global setup.

import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  migrateConfig,
  migrateData,
  outputToEnglish,
} from '@filmes/key-migration'
import { Effect } from 'effect'
import { afterAll, beforeAll, describe, expect, test } from 'vite-plus/test'
import { Environment } from '../../src/index.ts'
import { makeAdapter } from '../../oracle/adapter/index.ts'
import { defineCommand } from '../../oracle/adapter/command.ts'
import { ROOT } from '../../oracle/paths.ts'
import { resolvePython } from '../../oracle/python.ts'
import { replayScenario, type ReplayOptions } from '../../oracle/replay.ts'
import {
  FIXTURE_STEP_ENV,
  type Scenario,
  type Step,
} from '../../oracle/scenario.ts'
import { buildReport } from '../../oracle/report.ts'
import type { Decision } from '../../oracle/decisions.ts'

const step = (argv: readonly string[], extra: Partial<Step> = {}): Step => ({
  argv,
  stdin: null,
  env: FIXTURE_STEP_ENV,
  files: {},
  ...extra,
})

const RECOMMEND: Scenario = {
  id: 'oracle::recommend',
  steps: [step(['reconstruir']), step(['recomendar', '--presentes', 'dono'])],
}

let python: string
let scratch: string
let config: string
/** What Python left after `recomendar`, in English, and its output. */
let expected: { data: string; database: string; output: unknown }

const options = (extra: Partial<ReplayOptions>): ReplayOptions => ({
  python,
  config,
  adapter: makeAdapter([]),
  ...extra,
})

/** A stand-in for a ported `recomendar`: writes what Python wrote and
 * answers `output`. */
const standIn = (output: unknown) =>
  defineCommand({
    command: 'recomendar',
    args: {
      options: { presentes: { kind: 'list', required: true } },
    },
    run: () =>
      Effect.gen(function* () {
        const environment = yield* Environment
        const data = yield* environment.path('data')
        const database = yield* environment.path('database')
        cpSync(expected.data, data, { recursive: true, force: true })
        cpSync(expected.database, database)
        return output
      }),
  })

beforeAll(async () => {
  python = resolvePython()
  scratch = mkdtempSync(join(tmpdir(), 'filmes-oracle-test-'))
  config = join(scratch, 'config')
  migrateConfig(join(ROOT, 'config'), config, 'to-en')
  const first = await replayScenario(
    RECOMMEND,
    options({ keep: true, capture: true }),
  )
  const work = first.work as string
  const output = first.steps[1]?.python?.output
  expected = {
    data: join(scratch, 'data'),
    database: join(scratch, 'filmes.sqlite'),
    output: outputToEnglish('recomendar', output),
  }
  migrateData(join(work, 'py0', 'dados'), expected.data, 'to-en')
  cpSync(join(work, 'py0', 'filmes.sqlite'), expected.database)
  rmSync(work, { recursive: true, force: true })
}, 120_000)

afterAll(() => rmSync(scratch, { recursive: true, force: true }))

describe('the oracle', () => {
  test('a step nobody ported runs only on Python, and Python agrees with itself', async () => {
    const result = await replayScenario(RECOMMEND, options({}))

    expect(result.error).toBeUndefined()
    expect(
      result.steps.map((s) => [s.command, s.status, s.differences]),
    ).toEqual([
      ['reconstruir', 'not_ported', []],
      ['recomendar', 'not_ported', []],
    ])
  }, 60_000)

  test('a TypeScript answer equal to Python is clean', async () => {
    const result = await replayScenario(
      RECOMMEND,
      options({ adapter: makeAdapter([standIn(expected.output)]) }),
    )

    expect(result.steps[1]).toMatchObject({
      status: 'compared',
      differences: [],
    })
  }, 60_000)

  test('one evidence text changed is caught at that text', async () => {
    const wrong = structuredClone(expected.output) as {
      films: Array<{ evidence: Record<string, Array<{ text: string }>> }>
    }
    const evidence = wrong.films[0]?.evidence['bruno']?.[0] as { text: string }
    const original = evidence.text
    evidence.text = `${original}!`

    const result = await replayScenario(
      RECOMMEND,
      options({ adapter: makeAdapter([standIn(wrong)]) }),
    )

    expect(result.steps[1]?.differences).toEqual([
      {
        check: 'parity',
        path: 'output.films[0].evidence.bruno[0].text',
        python: original,
        ts: `${original}!`,
      },
    ])
    const report = buildReport([result], [], {
      ported: new Set(['recomendar']),
      full: false,
      selfCheck: true,
    })
    expect(report.ok).toBe(false)
  }, 60_000)

  test('a decision explains the difference it names, and only that one', async () => {
    const wrong = structuredClone(expected.output) as {
      warnings: string[]
      attendees: string[]
    }
    wrong.warnings = [...wrong.warnings, 'aviso a mais']
    wrong.attendees = ['outra']
    const result = await replayScenario(
      RECOMMEND,
      options({ adapter: makeAdapter([standIn(wrong)]) }),
    )
    const decision: Decision = {
      id: 'extra-warning',
      commands: ['recomendar'],
      path: 'output.warnings[*]',
      python: '^<absent>$',
      ts: '^aviso a mais$',
      reason: 'test',
      link: 'test',
    }

    const report = buildReport([result], [decision], {
      ported: new Set(['recomendar']),
      full: true,
      selfCheck: true,
    })

    expect(report).toMatchObject({
      ok: false,
      explained: { 'extra-warning': 1 },
    })
    expect(report.unexplained.map((d) => d.path)).toEqual([
      'output.attendees[0]',
    ])
  }, 60_000)

  test('a TypeScript side that writes nothing differs in filmes-dados and in the database', async () => {
    const lazy = defineCommand({
      command: 'recomendar',
      args: { options: { presentes: { kind: 'list', required: true } } },
      run: () => Effect.succeed(expected.output),
    })

    const result = await replayScenario(
      RECOMMEND,
      options({ adapter: makeAdapter([lazy]) }),
    )

    const paths = result.steps[1]?.differences.map((d) => d.path) ?? []
    expect(paths).toContain('data/sessions/2026-11-20-bruno.md')
    expect(paths.some((path) => path.startsWith('db/'))).toBe(true)
  }, 60_000)

  test('a replay that does not reproduce what pytest saw is a harness difference', async () => {
    const scenario: Scenario = {
      id: 'oracle::replay',
      steps: [
        step(['consultar', 'SELECT 1'], {
          exitCode: 0,
          output: { linhas: [] },
        }),
      ],
    }

    const result = await replayScenario(scenario, options({}))

    expect(result.steps[0]?.differences).toContainEqual(
      expect.objectContaining({ check: 'replay', path: 'exitCode' }),
    )
  }, 60_000)

  test('an unknown command is ported: both engines refuse it as invalid usage', async () => {
    const scenario: Scenario = {
      id: 'oracle::unknown',
      steps: [step(['comando-que-nao-existe'])],
    }

    const result = await replayScenario(scenario, options({}))

    expect(result.steps[0]).toMatchObject({
      command: 'comando-que-nao-existe',
      status: 'compared',
      differences: [],
    })
  }, 60_000)
})
