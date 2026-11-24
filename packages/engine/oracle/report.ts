// What a run found: decisions applied, then counts and every difference no
// decision explains.

import { display, type Difference } from './compare.ts'
import { explain, staleDecisions, type Decision } from './decisions.ts'
import type { ScenarioResult } from './replay.ts'

export interface Unexplained extends Difference {
  readonly scenario: string
  readonly step: number
  readonly command: string
}

export interface Report {
  readonly scenarios: number
  readonly steps: number
  /** Steps both engines ran, by Python command. */
  readonly compared: Readonly<Record<string, number>>
  /** Steps only Python ran, by Python command. */
  readonly notPorted: Readonly<Record<string, number>>
  readonly unexplained: readonly Unexplained[]
  /** How many differences each decision explained. */
  readonly explained: Readonly<Record<string, number>>
  /** Only in a full run. */
  readonly stale: readonly string[]
  readonly errors: ReadonlyArray<{
    readonly scenario: string
    readonly error: string
  }>
  readonly ok: boolean
}

const count = (into: Record<string, number>, key: string) => {
  into[key] = (into[key] ?? 0) + 1
}

export function buildReport(
  results: readonly ScenarioResult[],
  decisions: readonly Decision[],
  run: {
    readonly ported: ReadonlySet<string>
    /** No filter: every scenario ran, so stale entries can be told. */
    readonly full: boolean
    readonly selfCheck: boolean
  },
): Report {
  const compared: Record<string, number> = {}
  const notPorted: Record<string, number> = {}
  const explained: Record<string, number> = {}
  const unexplained: Unexplained[] = []
  let steps = 0
  for (const result of results)
    for (const step of result.steps) {
      steps++
      count(step.status === 'compared' ? compared : notPorted, step.command)
      for (const difference of step.differences) {
        const where = { scenario: result.id, command: step.command }
        const decision = explain(decisions, where, difference)
        if (decision) count(explained, decision.id)
        else unexplained.push({ ...difference, ...where, step: step.index })
      }
    }
  const stale = run.full
    ? staleDecisions(
        decisions,
        new Set(Object.keys(explained)),
        run.ported,
        run.selfCheck,
      ).map((decision) => decision.id)
    : []
  const errors = results.flatMap((result) =>
    result.error === undefined
      ? []
      : [{ scenario: result.id, error: result.error }],
  )
  return {
    scenarios: results.length,
    steps,
    compared,
    notPorted,
    unexplained,
    explained,
    stale,
    errors,
    ok: unexplained.length === 0 && stale.length === 0 && errors.length === 0,
  }
}

const byCount = (counts: Readonly<Record<string, number>>) =>
  Object.entries(counts)
    .sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1))
    .map(([command, n]) => `${command} ×${n}`)
    .join(', ')

const total = (counts: Readonly<Record<string, number>>) =>
  Object.values(counts).reduce((a, b) => a + b, 0)

/** At most this many differences are printed. */
const PRINTED = 50

/** The report for people. */
export function formatReport(report: Report): string {
  const lines = [
    `oracle: ${report.scenarios} scenarios, ${report.steps} steps`,
    `  compared: ${total(report.compared)}${total(report.compared) ? ` (${byCount(report.compared)})` : ''}`,
    `  not ported: ${total(report.notPorted)}${total(report.notPorted) ? ` (${byCount(report.notPorted)})` : ''}`,
    `  explained by decisions: ${total(report.explained)}${total(report.explained) ? ` (${byCount(report.explained)})` : ''}`,
  ]
  for (const check of ['parity', 'self-check', 'replay'] as const) {
    const n = report.unexplained.filter((d) => d.check === check).length
    lines.push(`  ${check} differences: ${n}`)
  }
  if (report.stale.length > 0)
    lines.push(`  stale decisions: ${report.stale.join(', ')}`)
  for (const { scenario, error } of report.errors)
    lines.push(`  error in ${scenario}: ${error}`)
  for (const d of report.unexplained.slice(0, PRINTED))
    lines.push(
      `\n[${d.check}] ${d.scenario} step ${d.step + 1} (${d.command}) ${d.path}`,
      `  python: ${display(d.python)}`,
      `  ts:     ${display(d.ts)}`,
    )
  if (report.unexplained.length > PRINTED)
    lines.push(
      `\n... and ${report.unexplained.length - PRINTED} more (see --report)`,
    )
  lines.push('', report.ok ? 'oracle: clean' : 'oracle: FAILED')
  return lines.join('\n')
}
