// `pnpm oracle`: the parity oracle on the fixture (#76 §4). Harvests the
// pytest scenarios (cached), replays them on both engines and prints the
// report; exits 1 on a difference no decision explains, a stale decision or
// a harness error.
//
//     pnpm oracle                          everything (what CI runs)
//     pnpm oracle --command "pessoa ver"   scenarios with a step of it
//     pnpm oracle --scenario 'tests/test_pessoa.py::*'
//     pnpm oracle --no-self-check --keep --report /tmp/oracle.json
//     pnpm oracle --real ...               the real-database run (real/cli.ts)
//
// Hand-written scenarios in `oracle/scenarios/*.jsonl` run too.

import { writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { parseArgs } from 'node:util'
import { display } from './compare.ts'
import { harvest } from './harvest.ts'
import { resolvePython } from './python.ts'
import { realCli } from './real/cli.ts'
import { formatReport } from './report.ts'
import { runOracle } from './run.ts'
import { handWritten, readScenarios } from './scenario.ts'

const { values } = parseArgs({
  options: {
    scenario: { type: 'string', multiple: true },
    command: { type: 'string', multiple: true },
    trace: { type: 'string' },
    jobs: { type: 'string' },
    report: { type: 'string' },
    keep: { type: 'boolean', default: false },
    'no-self-check': { type: 'boolean', default: false },
    // The real-database run (real/cli.ts).
    real: { type: 'boolean', default: false },
    local: { type: 'string' },
    seed: { type: 'string' },
    count: { type: 'string' },
    lanes: { type: 'string' },
    today: { type: 'string' },
    work: { type: 'string' },
    out: { type: 'string' },
    details: { type: 'string' },
    'live-keys': { type: 'boolean', default: false },
  },
})

if (values.real) process.exitCode = await realCli(values)
else await fixture()

async function fixture(): Promise<void> {
  const jobs = values.jobs ? Number(values.jobs) : availableParallelism()
  const python = resolvePython()
  const started = Date.now()
  const scenarios = [
    ...(values.trace
      ? readScenarios(values.trace)
      : await harvest({ python, jobs })),
    ...handWritten(),
  ]
  process.stderr.write(
    `harvested ${scenarios.length} scenarios in ${Math.round((Date.now() - started) / 1000)} s\n`,
  )

  let done = 0
  const { report, results } = await runOracle({
    python,
    scenarios,
    jobs,
    only: values.scenario ?? [],
    commands: values.command ?? [],
    selfCheck: !values['no-self-check'],
    keep: values.keep,
    onScenario: (result) => {
      done++
      if (result.work)
        process.stderr.write(`kept ${result.id}: ${result.work}\n`)
      if (done % 50 === 0) process.stderr.write(`replayed ${done} scenarios\n`)
    },
  })

  if (values.report)
    writeFileSync(
      values.report,
      JSON.stringify(
        { ...report, results },
        (_, value: unknown) =>
          typeof value === 'symbol' ? display(value) : value,
        2,
      ),
    )
  process.stdout.write(`${formatReport(report)}\n`)
  process.stderr.write(`took ${Math.round((Date.now() - started) / 1000)} s\n`)
  process.exitCode = report.ok ? 0 : 1
}
