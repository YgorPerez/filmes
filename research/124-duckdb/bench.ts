// The #124 measurement: `recommend` on the SQLite copy (today's engine) and
// on the DuckDB copy, interleaved request by request so the shared machine's
// load hits both alike.
//
// Each round: evict both database files from the page cache, start one
// worker per engine, then two passes over the seeded requests. Pass 1 is
// cold (fresh process, files out of the page cache), pass 2 warm. Within a
// pass the engine that goes first alternates per request.
//
// node bench.ts <work dir> <seed> <count> <rounds> <duckdb threads> <out.json>

import { spawn, execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { loadavg } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const [work, seed, countText, roundsText, threads, out] = process.argv.slice(2) as string[]
const count = Number(countText)
const rounds = Number(roundsText)
const ENGINES = ['sqlite', 'duckdb'] as const
type EngineName = (typeof ENGINES)[number]

const evict = () =>
  execFileSync('python3', [
    '-I',
    '-c',
    'import os,sys\nfor p in sys.argv[1:]:\n fd=os.open(p,os.O_RDONLY)\n os.posix_fadvise(fd,0,0,os.POSIX_FADV_DONTNEED)\n os.close(fd)',
    join(work, 'base.sqlite'),
    join(work, 'base.duckdb'),
    join(work, 'base-cache.sqlite'),
  ])

const resident = (file: string): string => {
  try {
    return execFileSync('fincore', ['-n', '-o', 'RES', join(work, file)], { encoding: 'utf8' }).trim()
  } catch {
    return '?'
  }
}

const startWorker = (engine: EngineName) => {
  const child = spawn('node', ['worker.ts', engine, work, seed as string, String(count), threads as string], {
    cwd: import.meta.dirname,
    stdio: ['pipe', 'pipe', 'inherit'],
  })
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]()
  const ask = async (command: string): Promise<Record<string, unknown>> => {
    child.stdin.write(command + '\n')
    const next = await lines.next()
    if (next.done) throw new Error(`${engine} worker ended`)
    return JSON.parse(next.value) as Record<string, unknown>
  }
  return { ask }
}

const results: Array<Record<string, unknown>> = []
const ends: Array<Record<string, unknown>> = []
const loads: number[] = []
const t0 = Date.now()
for (let round = 1; round <= rounds; round++) {
  evict()
  console.error(`round ${round}: resident after evict sqlite=${resident('base.sqlite')} duckdb=${resident('base.duckdb')}`)
  const workers = { sqlite: startWorker('sqlite'), duckdb: startWorker('duckdb') }
  for (const [pass, temperature] of [
    [1, 'cold'],
    [2, 'warm'],
  ] as const) {
    for (let index = 0; index < count; index++) {
      const order: EngineName[] = (index + round + pass) % 2 === 0 ? ['sqlite', 'duckdb'] : ['duckdb', 'sqlite']
      for (const engine of order) {
        const load = loadavg()[0] ?? 0
        loads.push(load)
        const r = await workers[engine].ask(`run ${index}`)
        results.push({ round, pass, temperature, engine, load, ...r })
      }
      const last = results.slice(-2)
      console.error(
        `r${round} ${temperature} #${index} ` +
          last.map((r) => `${String(r['engine'])}=${Math.round(Number(r['ms']))}ms`).join(' ') +
          ` load=${loadavg()[0]?.toFixed(1)} ${Math.round((Date.now() - t0) / 1000)}s`,
      )
    }
  }
  for (const engine of ENGINES) ends.push({ round, ...(await workers[engine].ask('end')) })
}
writeFileSync(out, JSON.stringify({ seed, count, rounds, threads, results, ends, loads }, null, 1))
