// What the oracle compares and how (#76 §4.3): the exit status and error,
// then the JSON output, deeply. Objects ignore key order; arrays keep it
// unless a path is declared unordered; numbers compare as numbers (`4.0`
// equals `4`), exactly unless a path declares a tolerance; strings compare
// exactly.

import { migrateDataPath } from '@filmes/key-migration'

/** One side has nothing at this path. */
export const ABSENT: unique symbol = Symbol('absent')
export type Value = unknown

/** Which comparison found a difference: Python against TypeScript, Python
 * against itself with another hash seed, or the replay against what pytest
 * saw (a harness problem). */
export type Check = 'parity' | 'self-check' | 'replay'

export interface Difference {
  readonly check: Check
  /** `exitCode`, `error.code`, `error.message`, `output.<json path>`,
   * `data/<file>`, `data/<file>#frontmatter.<path>`, `data/<file>#body:<line>`,
   * `files/<file>`, `db/<table>`, `db/<table>#columns`, `harness`. */
  readonly path: string
  /** The Python value (for the self-check, seed 0; for the replay, the
   * replay). */
  readonly python: Value
  /** The TypeScript value (for the self-check, seed 1; for the replay, what
   * pytest saw). */
  readonly ts: Value
}

/** A glob over paths or ids: `*` is any run of characters, `?` one. */
export function globRegExp(glob: string): RegExp {
  const source = glob
    .split('')
    .map((char) =>
      char === '*'
        ? '.*'
        : char === '?'
          ? '.'
          : char.replace(/[.+^${}()|[\]\\]/g, '\\$&'),
    )
    .join('')
  return new RegExp(`^${source}$`, 's')
}

const matchesAny = (globs: readonly string[] | undefined, path: string) =>
  (globs ?? []).some((glob) => globRegExp(glob).test(path))

/** A value as the report and the decisions read it. */
export function display(value: Value): string {
  if (value === ABSENT) return '<absent>'
  if (typeof value === 'string') return value
  return JSON.stringify(value) ?? String(value)
}

export interface CompareRules {
  readonly unordered?: readonly string[]
  readonly tolerance?: Readonly<Record<string, number>>
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A stable text for a JSON value, with keys sorted: multiset items. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (isObject(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'undefined'
}

/** The differences between two JSON values, under `path`. */
export function compareJson(
  python: unknown,
  ts: unknown,
  path: string,
  rules: CompareRules = {},
  check: Check = 'parity',
): Difference[] {
  const out: Difference[] = []
  const visit = (a: unknown, b: unknown, at: string): void => {
    if (typeof a === 'number' && typeof b === 'number') {
      const tolerance = Object.entries(rules.tolerance ?? {}).find(([glob]) =>
        globRegExp(glob).test(at),
      )?.[1]
      const same =
        tolerance === undefined ? a === b : Math.abs(a - b) <= tolerance
      if (!same) out.push({ check, path: at, python: a, ts: b })
      return
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      if (matchesAny(rules.unordered, at)) {
        const left = a.map(canonical)
        const right = b.map(canonical)
        const pending = [...right]
        for (const [i, item] of left.entries()) {
          const j = pending.indexOf(item)
          if (j === -1) out.push({ check, path: at, python: a[i], ts: ABSENT })
          else pending.splice(j, 1)
        }
        for (const item of pending)
          out.push({
            check,
            path: at,
            python: ABSENT,
            ts: b[right.indexOf(item)],
          })
        return
      }
      for (let i = 0; i < Math.max(a.length, b.length); i++)
        visit(
          i < a.length ? a[i] : ABSENT,
          i < b.length ? b[i] : ABSENT,
          `${at}[${i}]`,
        )
      return
    }
    if (isObject(a) && isObject(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
        visit(
          Object.hasOwn(a, key) ? a[key] : ABSENT,
          Object.hasOwn(b, key) ? b[key] : ABSENT,
          `${at}.${key}`,
        )
      return
    }
    if (a !== b) out.push({ check, path: at, python: a, ts: b })
  }
  visit(python, ts, path)
  return out
}

/** Every string inside a JSON value, rewritten by `rewrite`. */
export function mapStrings(
  value: unknown,
  rewrite: (text: string) => string,
): unknown {
  if (typeof value === 'string') return rewrite(value)
  if (Array.isArray(value))
    return value.map((item) => mapStrings(item, rewrite))
  if (isObject(value))
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [
        key,
        mapStrings(inner, rewrite),
      ]),
    )
  return value
}

/** Writes a side's work folder as `{work}` and the repo as `{root}`. A
 * config file the harness migrated for the TypeScript side
 * (`{work}/.oracle-config/versoes.json`, see `replay.ts`) is named as the
 * Python file it stands for (`{work}/versoes.json`). */
export function placeholders(work: string, root: string) {
  return (text: string): string =>
    text
      .replaceAll(work, '{work}')
      .replaceAll(root, '{root}')
      .replaceAll('{work}/.oracle-config/', '{work}/')
}

const PYTHON_DATA_PATH = /\{work\}\/dados((?:\/[^/\s'"`,;:()]+)*)/g

/** A path Python printed into its filmes-dados (`{work}/dados/sessoes/x.md`)
 * as the TypeScript engine names it (`{work}/data/sessions/x.md`). */
export function pythonDataPaths(text: string): string {
  return text.replace(PYTHON_DATA_PATH, (_, rest: string) =>
    rest === ''
      ? '{work}/data'
      : `{work}/data/${migrateDataPath(rest.slice(1), 'to-en')}`,
  )
}

export interface Outcome {
  readonly exitCode: number
  readonly output: unknown
}

const errorOf = (output: unknown) =>
  isObject(output) && isObject(output['error'])
    ? (output['error'] as { code?: unknown; message?: unknown })
    : undefined

/** Two outcomes (outputs in English): the exit status, then the error code
 * and message (not the message of an `invalid_usage`, which argparse words),
 * or the output. */
export function compareOutcomes(
  python: Outcome,
  ts: Outcome,
  rules: CompareRules = {},
  check: Check = 'parity',
): Difference[] {
  const out: Difference[] = []
  if (python.exitCode !== ts.exitCode)
    out.push({
      check,
      path: 'exitCode',
      python: python.exitCode,
      ts: ts.exitCode,
    })
  const pyError = errorOf(python.output)
  const tsError = errorOf(ts.output)
  if (pyError && tsError) {
    if (pyError.code !== tsError.code)
      out.push({
        check,
        path: 'error.code',
        python: pyError.code,
        ts: tsError.code,
      })
    else if (
      pyError.code !== 'invalid_usage' &&
      pyError.message !== tsError.message
    )
      out.push({
        check,
        path: 'error.message',
        python: pyError.message,
        ts: tsError.message,
      })
    return out
  }
  return [
    ...out,
    ...compareJson(python.output, ts.output, 'output', rules, check),
  ]
}
