// `importar --remover <arquivo>` (#101). Shares `importar` with the other
// origins' adapters: each has the same `ARGS` and its own `ported`.

import { ENGINE_AUTHOR, removeImport } from '../../../src/index.ts'
import { ArgvError, parseArgv } from '../argv.ts'
import { defineCommand } from '../command.ts'

const ARGS = {
  positionals: [],
  options: {
    pessoa: { kind: 'value' },
    letterboxd: { kind: 'value' },
    'letterboxd-rss': { kind: 'value' },
    trakt: { kind: 'value' },
    remover: { kind: 'value' },
  },
  exclusive: [
    {
      options: ['letterboxd', 'letterboxd-rss', 'trakt', 'remover'],
      required: true,
    },
  ],
} as const

export default defineCommand({
  command: 'importar',
  args: ARGS,
  // Python's `if args.remover`: an empty one is not a removal. An argv
  // argparse refuses is importar-letterboxd.ts's.
  ported: (argv) => {
    try {
      return Boolean(parseArgv(argv, ARGS).remover)
    } catch (error) {
      if (error instanceof ArgvError) return false
      throw error
    }
  },
  run: (args) =>
    removeImport({
      file: args.remover ?? '',
      person: args.pessoa,
      author: ENGINE_AUTHOR,
    }),
})
