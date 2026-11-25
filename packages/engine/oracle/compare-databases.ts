// Compares two databases built from the same inputs, one by Python's
// `reconstruir` and one by the engine's `rebuild` (#76 §4.4, the full-DB
// run of #107): the `sqlite_master` SQL of every table, view and index,
// each table's columns, row counts, and the rows as multisets (EXCEPT both
// ways, plus the distinct counts, so a repeated row counts). REAL values
// compare exactly, except `tags_no_catalogo.valor` and
// `normas_tags_movielens.norma`, which may differ by 1e-12 relative: `ln`
// is glibc's `log` in Python and V8's `Math.log` here, and they disagree in
// the last bit for some inputs.
//
// The report names tables and counts only, never a row: the database holds
// the Pessoas' taste.
//
//     node packages/engine/oracle/compare-databases.ts <python.sqlite> <ts.sqlite> [--report <file.md>]
//
// Exit 1 when anything differs beyond the tolerance. SQLite's temp files
// (the EXCEPTs of a 10M-row table) go to `SQLITE_TMPDIR`.

import { writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { parseArgs } from 'node:util'

/** REAL columns compared with a relative tolerance, by table, with the key
 * columns that pair their rows. */
export const TOLERANT: Readonly<
  Record<string, { readonly column: string; readonly key: readonly string[] }>
> = {
  tags_no_catalogo: { column: 'valor', key: ['fonte', 'tag'] },
  normas_tags_movielens: { column: 'norma', key: ['filme_id'] },
}

export const RELATIVE_TOLERANCE = 1e-12

export interface TableResult {
  readonly name: string
  readonly python: number
  readonly ts: number
  readonly columnsMatch: boolean
  /** Rows only Python has, rows only TS has (as distinct rows). */
  readonly onlyPython: number
  readonly onlyTs: number
  readonly distinctMatch: boolean
  /** For a tolerant column: rows whose value differs at all, and the
   * largest relative difference. */
  readonly realDiffering?: number
  readonly maxRelative?: number
}

export interface Comparison {
  readonly schemaDifferences: readonly string[]
  readonly tables: readonly TableResult[]
  readonly clean: boolean
}

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`

const number = (db: DatabaseSync, sql: string): number =>
  Number(Object.values(db.prepare(sql).get() ?? {})[0] ?? 0)

/** Python's database as `main`, TS's attached as `ts`. */
export function compareDatabases(python: string, ts: string): Comparison {
  const db = new DatabaseSync(python, { readOnly: true })
  try {
    db.exec(`ATTACH DATABASE '${ts.replaceAll("'", "''")}' AS ts`)
    const master = (schema: string) =>
      new Map(
        db
          .prepare(
            `SELECT type, name, sql FROM ${schema}.sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`,
          )
          .all()
          .map((row) => [
            `${String(row['type'])} ${String(row['name'])}`,
            row['sql'],
          ]),
      )
    const left = master('main')
    const right = master('ts')
    const schemaDifferences: string[] = []
    for (const key of new Set([...left.keys(), ...right.keys()]))
      if (!left.has(key)) schemaDifferences.push(`${key}: only TS`)
      else if (!right.has(key)) schemaDifferences.push(`${key}: only Python`)
      else if (left.get(key) !== right.get(key))
        schemaDifferences.push(`${key}: SQL differs`)

    const tables = [...left.keys()]
      .filter((key) => key.startsWith('table ') && right.has(key))
      .map((key) => key.slice('table '.length))
      .sort()
    const results = tables.map((name): TableResult => {
      const table = quote(name)
      const columns = (schema: string) =>
        JSON.stringify(
          db.prepare(`PRAGMA ${schema}.table_info(${table})`).all(),
        )
      const tolerant = TOLERANT[name]
      const compared = tolerant
        ? db
            .prepare(`PRAGMA main.table_info(${table})`)
            .all()
            .map((row) => String(row['name']))
            .filter((column) => column !== tolerant.column)
            .map(quote)
            .join(', ')
        : '*'
      const except = (a: string, b: string) =>
        number(
          db,
          `SELECT count(*) FROM (SELECT ${compared} FROM ${a}.${table} EXCEPT SELECT ${compared} FROM ${b}.${table})`,
        )
      const distinct = (schema: string) =>
        number(
          db,
          `SELECT count(*) FROM (SELECT DISTINCT ${compared} FROM ${schema}.${table})`,
        )
      const base = {
        name,
        python: number(db, `SELECT count(*) FROM main.${table}`),
        ts: number(db, `SELECT count(*) FROM ts.${table}`),
        columnsMatch: columns('main') === columns('ts'),
        onlyPython: except('main', 'ts'),
        onlyTs: except('ts', 'main'),
        distinctMatch: distinct('main') === distinct('ts'),
      }
      if (!tolerant) return base
      const on = tolerant.key
        .map((column) => `p.${quote(column)} = t.${quote(column)}`)
        .join(' AND ')
      const value = quote(tolerant.column)
      const pairs = `FROM main.${table} p JOIN ts.${table} t ON ${on}`
      return {
        ...base,
        realDiffering: number(
          db,
          `SELECT count(*) ${pairs} WHERE p.${value} IS NOT t.${value}`,
        ),
        maxRelative: number(
          db,
          `SELECT coalesce(max(abs(p.${value} - t.${value}) / max(abs(p.${value}), abs(t.${value}))), 0) ${pairs} WHERE p.${value} <> t.${value}`,
        ),
      }
    })
    const clean =
      schemaDifferences.length === 0 &&
      results.every(
        (r) =>
          r.python === r.ts &&
          r.columnsMatch &&
          r.onlyPython === 0 &&
          r.onlyTs === 0 &&
          r.distinctMatch &&
          (r.maxRelative ?? 0) <= RELATIVE_TOLERANCE,
      )
    return { schemaDifferences, tables: results, clean }
  } finally {
    db.close()
  }
}

const thousands = (n: number) => n.toLocaleString('en-US')

/** The comparison as a Markdown table (names and counts only). */
export function comparisonMarkdown(comparison: Comparison): string {
  const lines = [
    '| table | rows (Python) | rows (TS) | columns | only Python | only TS | REAL differing / max relative |',
    '|---|---:|---:|---|---:|---:|---|',
    ...comparison.tables.map(
      (r) =>
        `| ${r.name} | ${thousands(r.python)} | ${thousands(r.ts)} | ${r.columnsMatch ? 'same' : '**differ**'} | ${r.onlyPython} | ${r.onlyTs}${r.distinctMatch ? '' : ' (distinct counts differ)'} | ${r.realDiffering === undefined ? '' : `${r.realDiffering} / ${r.maxRelative!.toExponential(2)}`} |`,
    ),
  ]
  const schema =
    comparison.schemaDifferences.length === 0
      ? 'Schema (`sqlite_master` SQL of every table, view and index): identical.'
      : `Schema differences:\n\n${comparison.schemaDifferences.map((d) => `- ${d}`).join('\n')}`
  return `${schema}\n\n${lines.join('\n')}\n\nResult: ${comparison.clean ? '**clean**' : '**differences**'} (REAL exact except ${Object.entries(
    TOLERANT,
  )
    .map(([table, { column }]) => `\`${table}.${column}\``)
    .join(' and ')}, within ${RELATIVE_TOLERANCE} relative).\n`
}

if (import.meta.main) {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { report: { type: 'string' } },
  })
  const [python, ts] = positionals
  if (python === undefined || ts === undefined) {
    console.error(
      'Usage: node packages/engine/oracle/compare-databases.ts <python.sqlite> <ts.sqlite> [--report <file.md>]',
    )
    process.exit(2)
  }
  const comparison = compareDatabases(python, ts)
  const markdown = comparisonMarkdown(comparison)
  if (values.report === undefined) process.stdout.write(markdown)
  else writeFileSync(values.report, markdown)
  process.exit(comparison.clean ? 0 : 1)
}
