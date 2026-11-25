// Aggregates of a `bench.ts` run (no request, Pessoa or film in the output):
// p50/p95 per engine and temperature, the ratio, SQL vs JS, rows handed to
// JS, peak RSS, load average, and whether both engines answered the same.
// node summarize.ts <bench.json>

import { readFileSync } from 'node:fs'

interface Result {
  round: number
  pass: number
  temperature: 'cold' | 'warm'
  engine: 'sqlite' | 'duckdb'
  load: number
  index: number
  ms: number
  sqlMs: number
  queries: number
  rows: number
  hash: string
  films: number
  error?: string
}
const data = JSON.parse(readFileSync(process.argv[2] as string, 'utf8')) as {
  results: Result[]
  ends: Array<{ round: number; engine: string; maxRssKb: number; startupMs: number; topSql: Array<{ sql: string; ms: number; n: number; rows: number }> }>
  loads: number[]
}

const quantile = (values: number[], q: number) => {
  const s = [...values].sort((a, b) => a - b)
  const at = (s.length - 1) * q
  const lo = Math.floor(at)
  const hi = Math.ceil(at)
  return (s[lo] as number) + ((s[hi] as number) - (s[lo] as number)) * (at - lo)
}
const sum = (v: number[]) => v.reduce((a, b) => a + b, 0)
const f = (ms: number) => (ms / 1000).toFixed(2) + ' s'

const groups = ['cold', 'warm', 'all'] as const
console.log('| run | engine | n | p50 | p95 | mean | SQL share | rows to JS (median) |')
console.log('|---|---|---|---|---|---|---|---|')
const p: Record<string, number> = {}
for (const g of groups)
  for (const e of ['sqlite', 'duckdb'] as const) {
    const rs = data.results.filter((r) => r.engine === e && (g === 'all' || r.temperature === g))
    const ms = rs.map((r) => r.ms)
    p[`${g}-${e}-50`] = quantile(ms, 0.5)
    p[`${g}-${e}-95`] = quantile(ms, 0.95)
    console.log(
      `| ${g} | ${e} | ${rs.length} | ${f(quantile(ms, 0.5))} | ${f(quantile(ms, 0.95))} | ${f(sum(ms) / ms.length)} | ${((100 * sum(rs.map((r) => r.sqlMs))) / sum(ms)).toFixed(0)}% | ${Math.round(quantile(rs.map((r) => r.rows), 0.5)).toLocaleString('en')} |`,
    )
  }
console.log()
for (const g of groups)
  console.log(
    `${g}: SQLite/DuckDB p50 ${(p[`${g}-sqlite-50`]! / p[`${g}-duckdb-50`]!).toFixed(2)}×, p95 ${(p[`${g}-sqlite-95`]! / p[`${g}-duckdb-95`]!).toFixed(2)}×`,
  )

// Per request: the same request, same round and pass, on both engines.
const paired = new Map<string, Partial<Record<'sqlite' | 'duckdb', Result>>>()
for (const r of data.results) {
  const k = `${r.round}/${r.pass}/${r.index}`
  paired.set(k, { ...paired.get(k), [r.engine]: r })
}
const ratios: number[] = []
const sqlRatios: number[] = []
const jsDiff: number[] = []
let same = 0
let differ = 0
for (const { sqlite, duckdb } of paired.values()) {
  if (!sqlite || !duckdb) continue
  ratios.push(sqlite.ms / duckdb.ms)
  sqlRatios.push(sqlite.sqlMs / duckdb.sqlMs)
  jsDiff.push(duckdb.ms - duckdb.sqlMs - (sqlite.ms - sqlite.sqlMs))
  if (sqlite.hash === duckdb.hash) same++
  else differ++
}
console.log(
  `\npaired requests: ${ratios.length}; speedup SQLite/DuckDB median ${quantile(ratios, 0.5).toFixed(2)}× (p5 ${quantile(ratios, 0.05).toFixed(2)}×, p95 ${quantile(ratios, 0.95).toFixed(2)}×); SQL-only median ${quantile(sqlRatios, 0.5).toFixed(2)}×; JS time DuckDB−SQLite median ${f(quantile(jsDiff, 0.5))}`,
)
console.log(`same output on both: ${same}, different: ${differ}`)
const errors = data.results.filter((r) => r.error)
console.log(`errors: ${errors.length} (${[...new Set(errors.map((r) => r.engine))].join(', ')})`)
const sqliteRs = data.results.filter((r) => r.engine === 'sqlite')
console.log(
  `queries per request median ${quantile(sqliteRs.map((r) => r.queries), 0.5)}, rows to JS p95 ${Math.round(quantile(sqliteRs.map((r) => r.rows), 0.95)).toLocaleString('en')}`,
)
console.log(
  `load average (1 min) during the run: min ${Math.min(...data.loads).toFixed(1)}, median ${quantile(data.loads, 0.5).toFixed(1)}, max ${Math.max(...data.loads).toFixed(1)}`,
)
for (const e of data.ends)
  console.log(`round ${e.round} ${e.engine}: peak RSS ${(e.maxRssKb / 1024 / 1024).toFixed(2)} GB, startup ${Math.round(e.startupMs)} ms`)
for (const e of data.ends.filter((x) => x.round === 1)) {
  console.log(`\nslowest statements, ${e.engine}, round 1 (ms total, calls, rows):`)
  for (const s of e.topSql.slice(0, 8)) console.log(`- ${Math.round(s.ms)} ms, ${s.n}×, ${s.rows.toLocaleString('en')} rows: ${s.sql.slice(0, 110)}`)
}
