// `pnpm oracle --real`: the real-database run, on servidor-azul (#76 §4.6).
//
//     pnpm oracle --real                       seed from the clock, 300 requests
//     pnpm oracle --real --seed 84 --count 40 --lanes 2 --work /big/disk/dir
//     pnpm oracle --real --keep --details /scratch/details.json
//
// The real paths come from `--local` (default: `config/local.toml` of the
// repo), read only. Everything is copied into `--work` (default: a temp
// folder), which goes at the end unless `--keep`. The dated report goes to
// `--out` (default `docs/oracle/real-<date>.md`); `--details` writes every
// difference with both values, which can hold private data: keep it out of
// the repo.

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { display } from '../compare.ts'
import { ROOT } from '../paths.ts'
import { resolvePython } from '../python.ts'
import { formatReport } from '../report.ts'
import { formatRealReport } from './report.ts'
import { readLocalToml, runReal, todayInSaoPaulo } from './run.ts'

export interface RealCliOptions {
  readonly local?: string
  readonly seed?: string
  readonly count?: string
  readonly lanes?: string
  readonly today?: string
  readonly work?: string
  readonly out?: string
  readonly details?: string
  readonly 'live-keys'?: boolean
  readonly keep?: boolean
  readonly 'no-self-check'?: boolean
}

/** Runs it and returns the exit code. */
export async function realCli(options: RealCliOptions): Promise<number> {
  const ranOn = todayInSaoPaulo()
  const seed = options.seed ? Number(options.seed) : Date.now() % 1_000_000
  const lanes = options.lanes ? Number(options.lanes) : 3
  const work = options.work
    ? join(options.work, `filmes-oracle-real-${seed}`)
    : mkdtempSync(join(tmpdir(), 'filmes-oracle-real-'))
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).stdout.trim()
  const {
    report,
    results,
    facts,
    private: names,
  } = await runReal({
    python: resolvePython(),
    source: readLocalToml(options.local ?? join(ROOT, 'config', 'local.toml')),
    work,
    seed,
    ...(options.count && { count: Number(options.count) }),
    today: options.today ?? ranOn,
    lanes,
    selfCheck: !options['no-self-check'],
    liveKeys: options['live-keys'] ?? false,
    keep: options.keep ?? false,
    onScenario: (_, done, total) => {
      if (done % 10 === 0 || done === total)
        process.stderr.write(`replayed ${done}/${total}\n`)
    },
  })
  const markdown = formatRealReport({
    facts,
    report,
    private: names,
    commit,
    lanes,
    ranOn,
  })
  const out = options.out ?? join(ROOT, 'docs', 'oracle', `real-${ranOn}.md`)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, markdown)
  if (options.details)
    writeFileSync(
      options.details,
      JSON.stringify({ report, results }, (_, value: unknown) =>
        typeof value === 'symbol' ? display(value) : value,
      ),
    )
  // The terminal gets the counts only: `formatReport` would print values.
  process.stdout.write(
    `${formatReport({ ...report, unexplained: [], errors: [] })
      .split('\n')
      .slice(0, 4)
      .join('\n')}\n` +
      `unexplained: ${report.unexplained.length}, harness errors: ${report.errors.length}\n` +
      `report: ${out}${options.keep ? `\nkept: ${work}` : ''}\n` +
      (report.ok ? 'oracle --real: clean\n' : 'oracle --real: FAILED\n'),
  )
  return report.ok ? 0 : 1
}
