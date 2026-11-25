// Where the real-database run keeps its state. A 3 GB database cannot be
// copied before every step as the fixture replay does, so each lane holds
// one copy per side (`py0`, `py1`, `ts`) for the whole run, and between
// steps only the tables a request can write move: the ones filmes-dados
// loads (schema files 20 to 41: Pessoas, taste, Notas, Letterboxd,
// Sessions). The catalog tables stay as the copy left them.
//
// The on-demand cache is the capture of #76 §4.2: Python's seed-0 pass is
// the only one that may reach a source; after each of its steps the other
// two sides get a byte copy of its cache, so they read the answers it got.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statfsSync,
  statSync,
} from 'node:fs'
import { join } from 'node:path'
import { backup, DatabaseSync } from 'node:sqlite'
import { migrateData } from '@filmes/key-migration'

/** The real state, as `config/local.toml` names it. */
export interface RealSource {
  readonly database: string
  readonly data: string
  /** `<database stem>-cache.sqlite`, when it exists. */
  readonly cache?: string
}

/** The schema files whose tables filmes-dados fills. */
const SCHEMA = join(import.meta.dirname, '../../src/rebuild/schema')
const DATA_SCHEMA = /^(2\d|3\d|4[01])_.*\.sql$/

/** Catalog tables that sit in those schema files: the graph step fills
 * `slugs_letterboxd` (Wikidata P6127, 270k rows on the real catalog). */
const CATALOG_IN_DATA_SCHEMA = new Set(['slugs_letterboxd'])

/** The tables a request may write (`pessoa`, `recomendar`, `feedback`...),
 * from the schema files that filmes-dados loads. */
export function dataTables(schema = SCHEMA): string[] {
  return readdirSync(schema)
    .filter((file) => DATA_SCHEMA.test(file))
    .sort()
    .flatMap((file) =>
      [
        ...readFileSync(join(schema, file), 'utf8').matchAll(
          /CREATE TABLE (?:IF NOT EXISTS )?(\w+)/gi,
        ),
      ].map((match) => match[1] as string),
    )
    .filter((table) => !CATALOG_IN_DATA_SCHEMA.has(table))
}

export const DATABASE = 'filmes.sqlite'
export const CACHE = 'cache.sqlite'

/** A consistent copy of a database another process may be using, opened
 * read-only: nothing is ever written to `from`. */
export async function copyDatabase(from: string, to: string): Promise<void> {
  const source = new DatabaseSync(from, { readOnly: true })
  try {
    await backup(source, to)
  } finally {
    source.close()
  }
}

/** The real state copied into `base/`: the database, filmes-dados (without
 * its git history) and the cache, if any. */
export async function copySource(
  source: RealSource,
  base: string,
): Promise<void> {
  mkdirSync(base, { recursive: true })
  await copyDatabase(source.database, join(base, DATABASE))
  cpSync(source.data, join(base, 'dados'), {
    recursive: true,
    filter: (path) => !path.split('/').includes('.git'),
  })
  if (source.cache && existsSync(source.cache))
    await copyDatabase(source.cache, join(base, CACHE))
}

/** Bytes free on the file system of `dir`. */
export function freeBytes(dir: string): number {
  const stats = statfsSync(dir)
  return stats.bavail * stats.bsize
}

export interface Lane {
  readonly py0: string
  readonly py1: string
  readonly ts: string
}

const removeDatabase = (file: string) => {
  for (const suffix of ['', '-wal', '-shm', '-journal'])
    rmSync(`${file}${suffix}`, { force: true })
}

/** A byte copy of a small database file (the cache), with its journal
 * files gone. */
export function copyCache(from: string, to: string): void {
  removeDatabase(to)
  if (existsSync(from)) cpSync(from, to)
}

/** One lane: three folders, each with its own copy of the base database. */
export function createLane(base: string, root: string): Lane {
  const lane = {
    py0: join(root, 'py0'),
    py1: join(root, 'py1'),
    ts: join(root, 'ts'),
  }
  for (const folder of Object.values(lane)) {
    mkdirSync(folder, { recursive: true })
    cpSync(join(base, DATABASE), join(folder, DATABASE))
  }
  return lane
}

/** Replaces `tables` in `target` with their rows in `source`. */
export function restoreTables(
  target: string,
  source: string,
  tables: readonly string[],
): void {
  // Rows move table by table, so a reference may point ahead for a while.
  const db = new DatabaseSync(target, { enableForeignKeyConstraints: false })
  try {
    db.prepare('ATTACH DATABASE ? AS source').run(source)
    db.exec('BEGIN IMMEDIATE')
    const has = (schema: string, name: string) =>
      db
        .prepare(
          `SELECT 1 FROM ${schema}.sqlite_master WHERE type = 'table' AND name = ?`,
        )
        .get(name) !== undefined
    for (const table of [...tables, 'sqlite_sequence']) {
      const inMain = has('main', table)
      const inSource = has('source', table)
      if (!inMain && !inSource) continue
      if (inMain !== inSource)
        throw new Error(`real run: table ${table} is on one side only`)
      db.exec(`DELETE FROM main."${table}"`)
      db.exec(`INSERT INTO main."${table}" SELECT * FROM source."${table}"`)
    }
    db.exec('COMMIT')
    db.exec('DETACH DATABASE source')
  } finally {
    db.close()
  }
}

/** Python's two folders back to the base state before a scenario: the data
 * tables, filmes-dados and the cache. */
export function resetLane(
  lane: Lane,
  base: string,
  tables: readonly string[],
): void {
  for (const folder of [lane.py0, lane.py1]) {
    restoreTables(join(folder, DATABASE), join(base, DATABASE), tables)
    rmSync(join(folder, 'dados'), { recursive: true, force: true })
    cpSync(join(base, 'dados'), join(folder, 'dados'), { recursive: true })
    copyCache(join(base, CACHE), join(folder, CACHE))
  }
}

/** The TypeScript side starts a step where Python's seed 0 does: its data
 * tables and its filmes-dados migrated to English. (The cache comes after
 * Python's step: `copyCache`.) */
export function syncTypeScript(lane: Lane, tables: readonly string[]): void {
  restoreTables(join(lane.ts, DATABASE), join(lane.py0, DATABASE), tables)
  rmSync(join(lane.ts, 'data'), { recursive: true, force: true })
  migrateData(join(lane.py0, 'dados'), join(lane.ts, 'data'), 'to-en')
}

/** The cache's rows per source, for the report (no keys, no bodies). */
export function cacheCounts(file: string): Record<string, number> {
  if (!existsSync(file) || statSync(file).size === 0) return {}
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    const rows = db
      .prepare(
        'SELECT fonte, count(*) AS n FROM respostas GROUP BY fonte ORDER BY fonte',
      )
      .all()
    return Object.fromEntries(
      rows.map((row) => [String(row['fonte']), Number(row['n'])]),
    )
  } finally {
    db.close()
  }
}
