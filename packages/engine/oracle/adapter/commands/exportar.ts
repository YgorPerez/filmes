// The engine gives the file's text; the CLI wrote it at `--saida`, so the
// adapter writes it there and answers with Python's output.

import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { Effect } from 'effect'
import {
  engineError,
  EXPORT_FORMATS,
  exportRatings,
} from '../../../src/index.ts'
import { defineCommand } from '../command.ts'

/** `Path(saida).expanduser().resolve()`. */
const outputPath = (path: string): string =>
  resolve(
    path === '~' || path.startsWith('~/') ? homedir() + path.slice(1) : path,
  )

export default defineCommand({
  command: 'exportar',
  args: {
    positionals: [],
    options: {
      pessoa: { kind: 'value', required: true },
      formato: { kind: 'value', required: true, choices: EXPORT_FORMATS },
      saida: { kind: 'value', required: true },
    },
  },
  run: (args) => {
    const format = EXPORT_FORMATS.find((known) => known === args.formato)
    if (format === undefined)
      return Effect.fail(
        engineError('invalid_usage', `formato ${args.formato}`),
      )
    return exportRatings(args.pessoa, format).pipe(
      Effect.map(({ content, ...summary }) => {
        const file = outputPath(args.saida)
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, content)
        const { person, ratings, outsideCatalog } = summary
        return { person, format, file, ratings, outsideCatalog }
      }),
    )
  },
  files: (args) => [outputPath(args.saida)],
})
