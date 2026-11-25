// The state a step leaves behind, and how two of them compare (#76 §4.3,
// items 3 and 4): filmes-dados file by file, and the database table by table
// as multisets of rows.

import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { migrateData } from '@filmes/key-migration'
import { parse } from 'yaml'
import {
  ABSENT,
  canonical,
  compareJson,
  type Check,
  type Difference,
} from './compare.ts'

/** Every file under `root`, relative and with `/`, sorted. */
export function listFiles(root: string): string[] {
  if (!existsSync(root)) return []
  const out: string[] = []
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git') continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile())
        out.push(relative(root, path).split(sep).join('/'))
    }
  }
  visit(root)
  return out.sort()
}

/** Writes what the test itself changed before a step. */
export function applyFiles(
  work: string,
  files: Readonly<Record<string, string | null>>,
): void {
  for (const [path, content] of Object.entries(files)) {
    const full = join(work, path)
    if (content === null) rmSync(full, { force: true })
    else {
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, Buffer.from(content, 'base64'))
    }
  }
}

/** The TypeScript side of a step starts where Python's does: a byte copy of
 * `python` (database, cache, the test's own files), with filmes-dados
 * migrated to English in `data/`. */
export function syncTypeScript(python: string, ts: string): void {
  rmSync(ts, { recursive: true, force: true })
  mkdirSync(ts, { recursive: true })
  for (const entry of readdirSync(python))
    if (entry !== 'dados')
      cpSync(join(python, entry), join(ts, entry), { recursive: true })
  if (existsSync(join(python, 'dados')))
    migrateData(join(python, 'dados'), join(ts, 'data'), 'to-en')
}

const isUtf8 = (bytes: Buffer): boolean => {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return true
  } catch {
    return false
  }
}

const FRONTMATTER = /^---\n([\s\S]*?\n)?---\n/

/** Frontmatter as data: YAML 1.1 as PyYAML reads it, dates as ISO text. */
function frontmatter(text: string): unknown {
  const parsed: unknown = parse(text, { version: '1.1' })
  const plain = (value: unknown): unknown =>
    value instanceof Date
      ? value.toISOString()
      : Array.isArray(value)
        ? value.map(plain)
        : typeof value === 'object' && value !== null
          ? Object.fromEntries(
              Object.entries(value).map(([key, inner]) => [key, plain(inner)]),
            )
          : value
  return plain(parsed)
}

/** The first line where two texts differ, as a difference at `path:line`. */
function firstLine(
  check: Check,
  path: string,
  a: string,
  b: string,
): Difference[] {
  if (a === b) return []
  const left = a.split('\n')
  const right = b.split('\n')
  for (let i = 0; i < Math.max(left.length, right.length); i++)
    if (left[i] !== right[i])
      return [
        {
          check,
          path: `${path}:${i + 1}`,
          python: i < left.length ? left[i] : ABSENT,
          ts: i < right.length ? right[i] : ABSENT,
        },
      ]
  return []
}

const sha256 = (bytes: Buffer) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`

export interface TreeOptions {
  /** `semantic`: Markdown frontmatter compared as YAML data (the parity
   * check, where each engine writes its own layout). `bytes`: every byte
   * (the self-check). */
  readonly mode: 'semantic' | 'bytes'
  /** Rewrites each side's text before comparing (work folders to
   * `{work}`). */
  readonly python: (text: string) => string
  readonly ts: (text: string) => string
}

/** A listed path that is a folder on either side stands for every file
 * under it on both sides (a command that names its file by the date). */
function expandFolder(python: string, ts: string, file: string): string[] {
  const isFolder = (root: string) => {
    const path = join(root, file)
    return existsSync(path) && statSync(path).isDirectory()
  }
  if (!isFolder(python) && !isFolder(ts)) return [file]
  return [
    ...new Set([
      ...listFiles(join(python, file)),
      ...listFiles(join(ts, file)),
    ]),
  ]
    .sort()
    .map((inner) => `${file}/${inner}`)
}

/** Two folders, file by file, as `<prefix>/<file>` differences. */
export function compareTrees(
  python: string,
  ts: string,
  prefix: string,
  check: Check,
  options: TreeOptions,
  only?: readonly string[],
): Difference[] {
  const out: Difference[] = []
  const files =
    only === undefined
      ? [...new Set([...listFiles(python), ...listFiles(ts)])].sort()
      : only.flatMap((file) => expandFolder(python, ts, file))
  for (const file of files) {
    const path = `${prefix}/${file}`
    const left = join(python, file)
    const right = join(ts, file)
    const hasLeft = existsSync(left)
    const hasRight = existsSync(right)
    if (!hasLeft && !hasRight) continue
    if (!hasLeft || !hasRight) {
      out.push({
        check,
        path,
        python: hasLeft ? 'present' : ABSENT,
        ts: hasRight ? 'present' : ABSENT,
      })
      continue
    }
    const a = readFileSync(left)
    const b = readFileSync(right)
    if (!isUtf8(a) || !isUtf8(b)) {
      if (!a.equals(b))
        out.push({ check, path, python: sha256(a), ts: sha256(b) })
      continue
    }
    const textA = options.python(a.toString('utf8'))
    const textB = options.ts(b.toString('utf8'))
    const fmA = FRONTMATTER.exec(textA)
    const fmB = FRONTMATTER.exec(textB)
    if (options.mode === 'semantic' && fmA && fmB) {
      out.push(
        ...compareJson(
          frontmatter(fmA[1] ?? ''),
          frontmatter(fmB[1] ?? ''),
          `${path}#frontmatter`,
          {},
          check,
        ),
        ...firstLine(
          check,
          `${path}#body`,
          textA.slice(fmA[0].length),
          textB.slice(fmB[0].length),
        ),
      )
      continue
    }
    out.push(...firstLine(check, path, textA, textB))
  }
  return out
}

/** filmes-dados in English after a Python step, for the parity check. */
export function migratedCopy(pythonData: string, target: string): string {
  rmSync(target, { recursive: true, force: true })
  if (existsSync(pythonData)) migrateData(pythonData, target, 'to-en')
  else mkdirSync(target, { recursive: true })
  return target
}

interface Table {
  readonly columns: readonly string[]
  readonly rows: readonly string[]
}

/** Each table's columns and rows (canonical text, REAL and INTEGER
 * folded: `4.0` and `4` read the same). */
function readTables(
  file: string,
  rewrite: (text: string) => string,
  only?: readonly string[],
): Map<string, Table> {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    db.exec('PRAGMA query_only = 1')
    const names = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((row) => String(row['name']))
      .filter((name) => only === undefined || only.includes(name))
    const tables = new Map<string, Table>()
    for (const name of names) {
      const quoted = `"${name.replaceAll('"', '""')}"`
      const columns = db
        .prepare(`SELECT name FROM pragma_table_info(?)`)
        .all(name)
        .map((row) => String(row['name']))
      const statement = db.prepare(`SELECT * FROM ${quoted}`)
      statement.setReadBigInts(true)
      const rows = statement.all().map((row) =>
        rewrite(
          canonical(
            columns.map((column) => {
              const value = row[column]
              if (typeof value === 'bigint')
                return Number.isSafeInteger(Number(value))
                  ? Number(value)
                  : value.toString()
              if (value instanceof Uint8Array)
                return `x'${Buffer.from(value).toString('hex')}'`
              return value
            }),
          ),
        ),
      )
      tables.set(name, { columns, rows: rows.sort() })
    }
    return tables
  } finally {
    db.close()
  }
}

/** At most this many rows of one table are reported. */
const ROWS_REPORTED = 5

/** REAL columns compared with a relative tolerance (#76 §4.4): the `ln`,
 * `log1p` and `sqrt` of `70_parecenca`, where V8's `Math.log` and glibc's
 * `log` may disagree in the last bit on the real catalog (#106: at most
 * 3.1e-16 relative). Every other value compares exactly. */
const DB_TOLERANCES: Readonly<Record<string, number>> = {
  'tags_no_catalogo.valor': 1e-12,
  'normas_tags_movielens.norma': 1e-12,
}

const closeEnough = (a: unknown, b: unknown, relative: number): boolean =>
  a === b ||
  (typeof a === 'number' &&
    typeof b === 'number' &&
    Math.abs(a - b) <= relative * Math.max(Math.abs(a), Math.abs(b)))

/** Pairs the rows only one side has that differ just in a tolerant column
 * by less than its tolerance, and drops them from both lists. */
function withinTolerance(
  table: string,
  columns: readonly string[],
  onlyLeft: string[],
  onlyRight: string[],
): void {
  const tolerant = columns.flatMap((column, i) => {
    const tolerance = DB_TOLERANCES[`${table}.${column}`]
    return tolerance === undefined ? [] : [{ i, tolerance }]
  })
  if (tolerant.length === 0 || onlyLeft.length === 0) return
  const key = (row: unknown[]) =>
    canonical(row.filter((_, i) => !tolerant.some((t) => t.i === i)))
  const right = new Map<string, number[]>()
  for (const [j, row] of onlyRight.entries()) {
    const k = key(JSON.parse(row) as unknown[])
    right.set(k, [...(right.get(k) ?? []), j])
  }
  const pairedLeft = new Set<number>()
  const pairedRight = new Set<number>()
  for (const [i, row] of onlyLeft.entries()) {
    const values = JSON.parse(row) as unknown[]
    const candidates = right.get(key(values)) ?? []
    const j = candidates.find((index) => {
      if (pairedRight.has(index)) return false
      const other = JSON.parse(onlyRight[index] as string) as unknown[]
      return tolerant.every((t) =>
        closeEnough(values[t.i], other[t.i], t.tolerance),
      )
    })
    if (j === undefined) continue
    pairedLeft.add(i)
    pairedRight.add(j)
  }
  const keep = (rows: string[], paired: Set<number>) => {
    const kept = rows.filter((_, i) => !paired.has(i))
    rows.splice(0, rows.length, ...kept)
  }
  keep(onlyLeft, pairedLeft)
  keep(onlyRight, pairedRight)
}

/** Two databases, table by table: columns in order, rows as multisets
 * (REALs exact but for `DB_TOLERANCES`). Each side's rows are rewritten as
 * in `TreeOptions` first. `tables` limits the comparison to those tables
 * (the real-database run compares only what a request can write). */
export function compareDatabases(
  python: string,
  ts: string,
  check: Check,
  rewrite: Pick<TreeOptions, 'python' | 'ts'>,
  tables?: readonly string[],
): Difference[] {
  const hasLeft = existsSync(python)
  const hasRight = existsSync(ts)
  if (!hasLeft && !hasRight) return []
  if (!hasLeft || !hasRight)
    return [
      {
        check,
        path: 'db',
        python: hasLeft ? 'present' : ABSENT,
        ts: hasRight ? 'present' : ABSENT,
      },
    ]
  const left = readTables(python, rewrite.python, tables)
  const right = readTables(ts, rewrite.ts, tables)
  const out: Difference[] = []
  for (const name of [...new Set([...left.keys(), ...right.keys()])].sort()) {
    const a = left.get(name)
    const b = right.get(name)
    if (!a || !b) {
      out.push({
        check,
        path: `db/${name}`,
        python: a ? 'present' : ABSENT,
        ts: b ? 'present' : ABSENT,
      })
      continue
    }
    if (a.columns.join('\0') !== b.columns.join('\0')) {
      out.push({
        check,
        path: `db/${name}#columns`,
        python: a.columns,
        ts: b.columns,
      })
      continue
    }
    const pending = new Map<string, number>()
    for (const row of b.rows) pending.set(row, (pending.get(row) ?? 0) + 1)
    const onlyLeft: string[] = []
    for (const row of a.rows) {
      const count = pending.get(row) ?? 0
      if (count === 0) onlyLeft.push(row)
      else pending.set(row, count - 1)
    }
    const onlyRight = [...pending].flatMap(([row, count]) =>
      Array.from({ length: count }, () => row),
    )
    withinTolerance(name, a.columns, onlyLeft, onlyRight)
    for (const row of onlyLeft.slice(0, ROWS_REPORTED))
      out.push({ check, path: `db/${name}`, python: row, ts: ABSENT })
    for (const row of onlyRight.slice(0, ROWS_REPORTED))
      out.push({ check, path: `db/${name}`, python: ABSENT, ts: row })
  }
  return out
}
