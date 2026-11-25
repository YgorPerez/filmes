// Converts a copy of the catalog database (SQLite) into DuckDB with the
// `sqlite` extension: one CREATE TABLE ... AS SELECT per table, then the
// views and the same indexes (plus each table's primary key as an index).
// Usage: node convert.ts <in.sqlite> <out.duckdb> <temp dir>
import { DatabaseSync } from 'node:sqlite'
import { DuckDBInstance } from '@duckdb/node-api'

const [input, output, temp] = process.argv.slice(2) as [string, string, string]
const lite = new DatabaseSync(input, { readOnly: true })
const objects = lite
  .prepare(
    "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name",
  )
  .all() as Array<{ type: string; name: string; sql: string }>
const primaryKeys = new Map<string, string[]>()
for (const t of objects.filter((o) => o.type === 'table')) {
  const cols = (lite.prepare(`PRAGMA table_info("${t.name}")`).all() as Array<{ name: string; pk: number }>)
    .filter((c) => c.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((c) => `"${c.name}"`)
  if (cols.length > 0) primaryKeys.set(t.name, cols)
}
lite.close()

const instance = await DuckDBInstance.create(output, {
  memory_limit: '1GB',
  threads: '2',
  temp_directory: temp,
})
const db = await instance.connect()
await db.run('INSTALL sqlite; LOAD sqlite;')
await db.run(`ATTACH '${input}' AS lite (TYPE sqlite, READ_ONLY)`)
const t0 = performance.now()
for (const t of objects.filter((o) => o.type === 'table')) {
  const s = performance.now()
  await db.run(`CREATE TABLE "${t.name}" AS SELECT * FROM lite."${t.name}"`)
  console.log(`table ${t.name} ${Math.round(performance.now() - s)} ms`)
}
await db.run('DETACH lite')
for (const v of objects.filter((o) => o.type === 'view')) await db.run(v.sql)
for (const [table, cols] of primaryKeys) {
  const s = performance.now()
  await db.run(`CREATE INDEX "${table}_pk" ON "${table}"(${cols.join(', ')})`)
  console.log(`pk ${table} ${Math.round(performance.now() - s)} ms`)
}
for (const i of objects.filter((o) => o.type === 'index')) {
  const s = performance.now()
  await db.run(i.sql)
  console.log(`index ${i.name} ${Math.round(performance.now() - s)} ms`)
}
await db.run('CHECKPOINT')
console.log(`total ${Math.round((performance.now() - t0) / 1000)} s`)
db.closeSync()
instance.closeSync()
