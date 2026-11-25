// Where a heavy statement's time goes: the database computing it
// (`count(*)` over it) against handing its rows to JS (row objects, as the
// engine reads them; DuckDB's columnar read too). Warm: each is run once
// untimed first, then the median of `repeat`.
// node micro.ts <work dir> <threads> <repeat>

import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { DuckDBInstance } from '@duckdb/node-api'
import { translate } from './duck-sqlite.ts'

const [work, threads, repeatText] = process.argv.slice(2) as [string, string, string]
const repeat = Number(repeatText)
const lite = new DatabaseSync(join(work, 'base.sqlite'), { readOnly: true })
const person = String(lite.prepare('SELECT pessoa FROM notas GROUP BY pessoa ORDER BY count(*) DESC LIMIT 1').get()?.['pessoa'])
const instance = await DuckDBInstance.create(join(work, 'base.duckdb'), {
  access_mode: 'READ_ONLY',
  memory_limit: '1GB',
  threads,
  temp_directory: join(work, 'duck-tmp'),
})
const duck = await instance.connect()

const EDGES = `SELECT c.filme_id AS candidato, c.entidade_id, c.fato_id, c.fonte, c.data
FROM arestas c
WHERE c.predicado = ?1 AND c.entidade_id IN (
    SELECT s.entidade_id FROM notas_vigentes n
    JOIN arestas s ON s.filme_id = n.filme_id AND s.predicado = ?1
    WHERE n.pessoa = ?2
)
ORDER BY c.filme_id, c.entidade_id`
const CASES: Array<{ name: string; sql: string; params: Array<string> }> = [
  { name: 'content edges, genre', sql: EDGES, params: ['genero', person] },
  { name: 'content edges, cast', sql: EDGES, params: ['elenco', person] },
  { name: 'elenco_principal (whole view)', sql: 'SELECT filme_id, entidade_id FROM elenco_principal', params: [] },
  { name: 'DISTINCT elenco_principal_imdb', sql: 'SELECT DISTINCT filme_id FROM elenco_principal_imdb', params: [] },
]

const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] as number
const time = async (f: () => unknown | Promise<unknown>) => {
  await f()
  const out: number[] = []
  for (let i = 0; i < repeat; i++) {
    const s = performance.now()
    await f()
    out.push(performance.now() - s)
  }
  return Math.round(median(out))
}
const duckRun = async (sql: string, params: string[], read: 'rows' | 'columns' | 'none') => {
  const st = await duck.prepare(translate(sql))
  params.forEach((p, i) => st.bindVarchar(i + 1, p))
  const r = await st.runAndReadAll()
  return read === 'rows' ? r.getRowObjectsJS().length : read === 'columns' ? r.getColumnsJS()[0]?.length : r.currentRowCount
}

console.log('| statement | rows | SQLite count(*) | SQLite rows to JS | DuckDB count(*) | DuckDB rows to JS | DuckDB columns to JS |')
console.log('|---|---|---|---|---|---|---|')
for (const c of CASES) {
  const count = `SELECT count(*) AS n FROM (${c.sql})`
  const rows = Number(lite.prepare(count).get(...c.params)?.['n'])
  const cells = [
    await time(() => lite.prepare(count).get(...c.params)),
    await time(() => lite.prepare(c.sql).all(...c.params)),
    await time(() => duckRun(count, c.params, 'none')),
    await time(() => duckRun(c.sql, c.params, 'rows')),
    await time(() => duckRun(c.sql, c.params, 'columns')),
  ]
  console.log(`| ${c.name} | ${rows.toLocaleString('en')} | ${cells.map((ms) => `${ms} ms`).join(' | ')} |`)
}
duck.closeSync()
instance.closeSync()
lite.close()
