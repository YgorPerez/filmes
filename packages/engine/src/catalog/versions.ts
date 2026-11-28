// The versions manifest (`catalogo/versoes.py` `ler`): which dumps a
// rebuild reads, each pinned by date and SHA-256 under
// `<catalog>/<sha256>/<name>`. The manifest is the EN one
// (`catalog-versions.json`: `source`, `date`).

import { createHash } from 'node:crypto'
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
} from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { pyIsoDate } from '../compat/parse.ts'
import { pyReprStr } from '../compat/text.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import { GROUPS, OPTIONAL_GROUPS } from './wikidata.ts'

export const IMDB_BASICS = 'title.basics.tsv.gz'
export const IMDB_RATINGS = 'title.ratings.tsv.gz'
/** Optional: a manifest from before #35 does not have it. */
export const IMDB_PRINCIPALS = 'title.principals.tsv.gz'
export const LABELS = 'wikidata-rotulos.json.gz'
export const MOVIELENS = 'ml-32m.zip'
export const GENOME = 'genome_2021.zip'
/** Optional: its genome fills the films the Tag Genome 2021 lacks (#410). */
export const ML_LATEST = 'ml-latest.zip'
const GROUPLENS = [MOVIELENS, GENOME]

/** One pinned dump. */
export interface Dump {
  /** Absent in a hand-made manifest; only the GroupLens loading reads it. */
  readonly source: string | undefined
  readonly date: string
  readonly sha256: string
}

/** The pinned dumps by file name, in the manifest's order. */
export type Dumps = ReadonlyMap<string, Dump>

/** `nome_wikidata`: a group's dump, or one property's of it. */
export const wikidataName = (group: string, property?: string): string =>
  `wikidata-${group}${property === undefined ? '' : `-${property}`}.json.gz`

/** Where a pinned dump sits. */
export const dumpPath = (catalog: string, name: string, dump: Dump): string =>
  join(catalog, dump.sha256, name)

const sha256 = (path: string): string => {
  const hash = createHash('sha256')
  const fd = openSync(path, 'r')
  try {
    const buffer = Buffer.allocUnsafe(1 << 22)
    for (;;) {
      const read = readSync(fd, buffer, 0, buffer.length, null)
      if (read === 0) break
      hash.update(buffer.subarray(0, read))
    }
  } finally {
    closeSync(fd)
  }
  return hash.digest('hex')
}

/** The message of a check that failed (Python's `ValueError`). */
class Invalid extends Error {}

const isFile = (path: string) => existsSync(path) && statSync(path).isFile()

const difference = (a: ReadonlySet<string>, b: Iterable<string>) => {
  const out = new Set(a)
  for (const x of b) out.delete(x)
  return out
}

const subset = (a: Iterable<string>, b: ReadonlySet<string>) =>
  [...a].every((x) => b.has(x))

/** The manifest names every dump the catalog needs, and no other. */
const checkNames = (names: ReadonlySet<string>): void => {
  const required = new Set([IMDB_BASICS, IMDB_RATINGS, LABELS])
  if (GROUPLENS.some((name) => names.has(name))) {
    if (!GROUPLENS.every((name) => names.has(name)))
      throw new Invalid('faltam dumps da GroupLens')
    for (const name of GROUPLENS) required.add(name)
  }
  let rest = difference(names, [...required, IMDB_PRINCIPALS, ML_LATEST])
  if (!subset(required, names))
    throw new Invalid('faltam os dumps do IMDb ou os rótulos do Wikidata')
  for (const [group, properties] of GROUPS) {
    const main = wikidataName(group)
    const groupNames = names.has(main)
      ? [main]
      : properties.map((p) => wikidataName(group, p))
    if (OPTIONAL_GROUPS.has(group) && !groupNames.some((n) => rest.has(n)))
      continue
    if (!subset(groupNames, rest))
      throw new Invalid(`faltam dumps do Wikidata (${group})`)
    rest = difference(rest, groupNames)
  }
  if (rest.size > 0)
    throw new Invalid(`dumps desconhecidos: ${[...rest].sort().join(', ')}`)
}

/** One dump of the manifest, its file checked against its SHA-256. */
const checkDump = (name: string, value: unknown, catalog: string): Dump => {
  const dump = value as Record<string, unknown>
  if (typeof dump !== 'object' || dump === null)
    throw new Invalid(`${name} is not an object`)
  for (const key of ['sha256', 'date'] as const)
    if (!(key in dump)) throw new Invalid(pyReprStr(key))
  const { sha256: pinned, date, source } = dump
  if (typeof date !== 'string' || pyIsoDate(date) === null)
    throw new Invalid(`Invalid isoformat string: ${pyReprStr(String(date))}`)
  if (typeof pinned !== 'string' || !/^[0-9a-f]{64}$/.test(pinned))
    throw new Invalid(`SHA-256 inválido para ${name}`)
  const entry: Dump = {
    source:
      typeof source === 'string'
        ? source
        : source === undefined
          ? undefined
          : JSON.stringify(source),
    date,
    sha256: pinned,
  }
  const file = dumpPath(catalog, name, entry)
  if (!isFile(file)) throw new Invalid(`dump fixado ausente: ${file}`)
  if (sha256(file) !== pinned) throw new Invalid(`SHA-256 diverge para ${name}`)
  return entry
}

const check = (manifest: string, catalog: string): Dumps => {
  const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'))
  const raw =
    typeof parsed === 'object' && parsed !== null && 'dumps' in parsed
      ? parsed.dumps
      : undefined
  if (raw === undefined) throw new Invalid("'dumps'")
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw new Invalid('dumps is not an object')
  const entries = Object.entries(raw as Record<string, unknown>)
  checkNames(new Set(entries.map(([name]) => name)))
  const dumps = new Map<string, Dump>()
  for (const [name, value] of entries)
    dumps.set(name, checkDump(name, value, catalog))
  return dumps
}

/** `ler`: the manifest's dumps, each file checked against its SHA-256. */
export const readVersions = (
  manifest: string,
  catalog: string,
): Effect.Effect<Dumps, EngineError> =>
  Effect.gen(function* () {
    if (!isFile(manifest))
      return yield* engineError(
        'missing_versions',
        `manifesto ausente em ${manifest}. Rode atualizar.`,
      )
    return yield* Effect.try({
      try: () => check(manifest, catalog),
      catch: (error) =>
        engineError(
          'invalid_versions',
          `${manifest}: ${error instanceof Error ? error.message : String(error)}`,
        ),
    })
  })
