// `importar --trakt <zip>` (#101). Shares `importar` with the other origins'
// adapters: each has the same `ARGS` and its own `ported`.

import { Effect } from 'effect'
import {
  ENGINE_AUTHOR,
  engineError,
  importTrakt,
  readUpload,
} from '../../../src/index.ts'
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
  // An argv argparse refuses is importar-letterboxd.ts's.
  ported: (argv) => {
    try {
      return parseArgv(argv, ARGS).trakt !== undefined
    } catch (error) {
      if (error instanceof ArgvError) return false
      throw error
    }
  },
  run: (args) =>
    Effect.gen(function* () {
      if (!args.pessoa)
        return yield* engineError(
          'invalid_usage',
          'importar precisa de --pessoa',
        )
      const { original, content } = yield* readUpload(args.trakt ?? '')
      return yield* importTrakt({
        person: args.pessoa,
        original,
        content,
        author: ENGINE_AUTHOR,
      })
    }),
})
