// The key migration from the command line (ADR 0002). It only reads the
// source and writes a new folder: cutover copies the result over filmes-dados
// by hand, in one commit.
//
//   node packages/key-migration/src/cli.ts to-en --data <filmes-dados> --out <dir>
//   node packages/key-migration/src/cli.ts to-pt --config <config> --out <dir>
//   node packages/key-migration/src/cli.ts round-trip --data <filmes-dados>
//
// `round-trip` runs PT → EN → PT over copies in a temporary folder and exits
// with 1 when a file does not come back.

import { parseArgs } from 'node:util'
import {
  migrateConfig,
  migrateData,
  roundTrip,
  type Direction,
  type FileResult,
} from './migrate.ts'

const USAGE = `usage:
  cli.ts to-en|to-pt (--data <dir> | --config <dir>) --out <dir>
  cli.ts round-trip (--data <dir> | --config <dir>)`

export interface Io {
  readonly out: (line: string) => void
  readonly err: (line: string) => void
}

function summary(results: readonly FileResult[]): string {
  const rewritten = results.filter((r) => r.action === 'rewritten').length
  return `${rewritten} rewritten, ${results.length - rewritten} copied as is`
}

/** Runs the command line; returns the exit code. */
export function main(argv: readonly string[], io: Io): number {
  let parsed
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        data: { type: 'string' },
        config: { type: 'string' },
        out: { type: 'string' },
      },
    })
  } catch (error) {
    io.err(`${(error as Error).message}\n${USAGE}`)
    return 2
  }
  const { positionals, values } = parsed
  const [command] = positionals
  const source = values.data ?? values.config
  const kind = values.data !== undefined ? 'data' : 'config'
  if (
    positionals.length !== 1 ||
    source === undefined ||
    (values.data !== undefined && values.config !== undefined)
  ) {
    io.err(USAGE)
    return 2
  }
  try {
    if (command === 'round-trip') {
      if (values.out !== undefined) {
        io.err(`round-trip writes nothing; drop --out\n${USAGE}`)
        return 2
      }
      const result = roundTrip(source, kind)
      io.out(
        `${result.identical.length} identical, ${result.normalized.length} normalized from an older shape, ${result.different.length} different`,
      )
      for (const path of result.normalized) io.out(`normalized: ${path}`)
      for (const path of result.different) io.out(`different: ${path}`)
      return result.different.length === 0 ? 0 : 1
    }
    if ((command !== 'to-en' && command !== 'to-pt') || !values.out) {
      io.err(USAGE)
      return 2
    }
    const run = kind === 'data' ? migrateData : migrateConfig
    io.out(summary(run(source, values.out, command satisfies Direction)))
    return 0
  } catch (error) {
    io.err((error as Error).message)
    return 1
  }
}

if (import.meta.main)
  process.exitCode = main(process.argv.slice(2), {
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  })
