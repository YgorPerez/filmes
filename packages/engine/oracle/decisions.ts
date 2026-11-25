// The accepted differences (#76 §4.5): one entry in `decisions.yaml` per
// difference between the engines that stays on purpose. The oracle fails on
// a difference no entry explains, and, in a full run, on an entry that
// explained nothing (stale).

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Schema } from 'effect'
import { parse } from 'yaml'
import { display, globRegExp, type Difference } from './compare.ts'

export const DECISIONS_FILE = join(import.meta.dirname, 'decisions.yaml')

const DecisionSchema = Schema.Struct({
  id: Schema.String,
  /** `parity` (default) or `self-check`. */
  check: Schema.optionalKey(Schema.Literals(['parity', 'self-check'])),
  /** The Python commands (`pessoa ver`) whose steps it applies to. While
   * none of them is ported, a parity entry is dormant: never stale. */
  commands: Schema.Array(Schema.String),
  /** Glob over the scenario id (default `*`). */
  scenarios: Schema.optionalKey(Schema.String),
  /** Glob over the difference's path (`error.message`, `output.films[*].x`). */
  path: Schema.String,
  /** Regular expressions the Python and the TypeScript values must match
   * (default: anything). `<absent>` stands for no value. */
  python: Schema.optionalKey(Schema.String),
  ts: Schema.optionalKey(Schema.String),
  reason: Schema.String,
  /** The ADR, issue or PR comment where the difference was decided. */
  link: Schema.String,
})

export type Decision = typeof DecisionSchema.Type

export function loadDecisions(file = DECISIONS_FILE): Decision[] {
  const parsed: unknown = parse(readFileSync(file, 'utf8')) ?? []
  const decisions = Schema.decodeUnknownSync(Schema.Array(DecisionSchema))(
    parsed,
  )
  const ids = new Set<string>()
  for (const decision of decisions) {
    if (ids.has(decision.id))
      throw new Error(`decisions.yaml: two entries with id '${decision.id}'`)
    ids.add(decision.id)
  }
  return [...decisions]
}

export interface Where {
  readonly scenario: string
  readonly command: string
}

/** The first entry that explains `difference`, if any. Replay differences
 * are harness problems: nothing explains them. */
export function explain(
  decisions: readonly Decision[],
  where: Where,
  difference: Difference,
): Decision | undefined {
  if (difference.check === 'replay') return undefined
  return decisions.find(
    (decision) =>
      (decision.check ?? 'parity') === difference.check &&
      decision.commands.includes(where.command) &&
      globRegExp(decision.scenarios ?? '*').test(where.scenario) &&
      globRegExp(decision.path).test(difference.path) &&
      (decision.python === undefined ||
        new RegExp(decision.python, 's').test(display(difference.python))) &&
      (decision.ts === undefined ||
        new RegExp(decision.ts, 's').test(display(difference.ts))),
  )
}

/** Entries that explained nothing in a full run. A parity entry none of
 * whose commands is ported is dormant, not stale; a self-check entry is
 * stale only when the self-check ran. */
export function staleDecisions(
  decisions: readonly Decision[],
  used: ReadonlySet<string>,
  ported: ReadonlySet<string>,
  selfCheck: boolean,
): Decision[] {
  return decisions.filter((decision) => {
    if (used.has(decision.id)) return false
    // An entry for the real-database run (`pnpm oracle --real`, scenarios
    // `real/...`) never meets a fixture scenario.
    if (decision.scenarios?.startsWith('real/')) return false
    if ((decision.check ?? 'parity') === 'self-check') return selfCheck
    return decision.commands.some((command) => ported.has(command))
  })
}
