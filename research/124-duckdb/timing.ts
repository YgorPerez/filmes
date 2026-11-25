// Time spent waiting on the database, per request: the rest of a request's
// wall time is JS (the engine's TypeScript, Effect, row conversion).
export const timing = {
  ms: 0,
  queries: 0,
  rows: 0,
  bySql: new Map<string, { ms: number; n: number; rows: number }>(),
  add(sql: string, ms: number, rows = 0) {
    this.ms += ms
    this.rows += rows
    this.queries++
    const e = this.bySql.get(sql) ?? { ms: 0, n: 0, rows: 0 }
    e.ms += ms
    e.n++
    e.rows += rows
    this.bySql.set(sql, e)
  },
  reset() {
    this.ms = 0
    this.queries = 0
    this.rows = 0
  },
}
