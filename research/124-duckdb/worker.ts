// One process, one engine, driven by `bench.ts` over stdin: runs one seeded
// request at a time through `recommend` and answers its wall time, SQL time
// (statements and rows handed to JS), and a hash of its output, so the two
// engines' answers can be compared without keeping them.
//
// node worker.ts <sqlite|duckdb> <work dir> <seed> <count> <threads>

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Effect, Layer, ManagedRuntime } from 'effect'
import { DataWriter } from '../../packages/engine/src/data/DataWriter.ts'
import { recommend } from '../../packages/engine/src/recommendation/recommend.ts'
import { Environment } from '../../packages/engine/src/runtime/Environment.ts'
import { Owner } from '../../packages/engine/src/runtime/Owner.ts'
import { Run } from '../../packages/engine/src/runtime/Run.ts'
import { Today } from '../../packages/engine/src/runtime/Today.ts'
import { DoesTheDogDie } from '../../packages/engine/src/sources/DoesTheDogDie.ts'
import { Omdb } from '../../packages/engine/src/sources/Omdb.ts'
import { Transport } from '../../packages/engine/src/sources/Source.ts'
import { SourceCache } from '../../packages/engine/src/sources/SourceCache.ts'
import { Tmdb } from '../../packages/engine/src/sources/Tmdb.ts'
import { duckSqliteLayer } from './duck-sqlite.ts'
import { requests } from './requests.ts'
import { timedSqliteLayer } from './timed-sqlite.ts'
import { timing } from './timing.ts'

const [engine, work, seedText, countText, threadsText] = process.argv.slice(2) as string[]
const seed = Number(seedText)
const count = Number(countText)

const vars = {
  FILMES_CONFIG: join(work, 'config-en'),
  FILMES_DADOS: join(work, 'dados-vazio'),
  FILMES_BANCO: join(work, 'base.sqlite'),
  FILMES_CACHE: join(work, 'base-cache.sqlite'),
  FILMES_HOJE: '2026-11-25',
}

// The inputs come from the SQLite copy on both sides, before timing.
const inputs = (() => {
  const db = new DatabaseSync(vars.FILMES_BANCO, { readOnly: true })
  try {
    const people = db.prepare('SELECT slug FROM pessoas ORDER BY slug').all().map((r) => String(r['slug']))
    const references = db
      .prepare('SELECT id FROM filmes ORDER BY votos DESC, id LIMIT 200')
      .all()
      .map((r) => String(r['id']))
    const moods = [...readFileSync(join(vars.FILMES_CONFIG, 'moods.toml'), 'utf8').matchAll(/^\[(.+)\]\s*$/gm)].map(
      (m) => (m[1] ?? '').replace(/^"|"$/g, ''),
    )
    return { people, references, moods }
  } finally {
    db.close()
  }
})()
const plan = requests(inputs, seed, count)

const sqlite =
  engine === 'duckdb'
    ? duckSqliteLayer({
        path: join(work, 'base.duckdb'),
        threads: Number(threadsText),
        tempDirectory: join(work, 'duck-tmp'),
      })
    : timedSqliteLayer

const layer = Layer.mergeAll(
  Today.layer,
  DataWriter.layer.pipe(Layer.provideMerge(sqlite)),
  Layer.mergeAll(Omdb.layer, DoesTheDogDie.layer, Tmdb.layer).pipe(
    Layer.provide(Transport.layer),
    Layer.provideMerge(SourceCache.layer),
  ),
).pipe(Layer.provideMerge(Environment.layerFrom(vars)))

const runtime = ManagedRuntime.make(layer)
const t0 = performance.now()
await runtime.runPromise(Effect.void)
const startupMs = performance.now() - t0

// Floats rounded so a last-bit difference (V8 vs glibc `ln`) hashes equal.
const canonical = (value: unknown): unknown =>
  typeof value === 'number'
    ? Number(value.toPrecision(12))
    : Array.isArray(value)
      ? value.map(canonical)
      : value !== null && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, canonical(v)]))
        : value

// One command per stdin line: `run <index>` answers one JSON line with the
// request's timings; `end` answers the peak RSS and the slowest statements,
// then exits.
const { createInterface } = await import('node:readline')
for await (const line of createInterface({ input: process.stdin })) {
  const [command, arg] = line.trim().split(' ')
  if (command === 'run') {
    const index = Number(arg)
    const request = plan[index]
    if (request === undefined) throw new Error(`no request ${index}`)
    timing.reset()
    const start = performance.now()
    const exit = await runtime.runPromiseExit(
      recommend(request).pipe(Effect.provide(Run.layer), Effect.provideService(Owner, null)),
    )
    const ms = performance.now() - start
    const output = exit._tag === 'Success' ? exit.value : { error: String(exit.cause) }
    // Private: the whole answer, for chasing a difference; never in a report.
    if (process.env['BENCH_DUMP'])
      writeFileSync(join(process.env['BENCH_DUMP'], `${engine}-${index}.json`), JSON.stringify(canonical(output), null, 1))
    process.stdout.write(
      JSON.stringify({
        index,
        ms,
        sqlMs: timing.ms,
        queries: timing.queries,
        rows: timing.rows,
        hash: createHash('sha256').update(JSON.stringify(canonical(output))).digest('hex').slice(0, 16),
        films: exit._tag === 'Success' ? exit.value.films.length : -1,
        ...(exit._tag === 'Failure' && { error: String(exit.cause).slice(0, 300) }),
      }) + '\n',
    )
  } else if (command === 'end') {
    await runtime.dispose()
    const topSql = [...timing.bySql.entries()]
      .sort((a, b) => b[1].ms - a[1].ms)
      .slice(0, 15)
      .map(([sql, e]) => ({ sql: sql.replace(/\s+/g, ' ').slice(0, 200), ms: e.ms, n: e.n, rows: e.rows }))
    process.stdout.write(
      JSON.stringify({ engine, startupMs, maxRssKb: process.resourceUsage().maxRSS, topSql }) + '\n',
    )
    process.exit(0)
  }
}
