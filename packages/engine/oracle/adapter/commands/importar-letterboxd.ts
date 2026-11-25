// `importar --letterboxd <zip>`. The other origins of `importar` (the RSS,
// Trakt, `--remover`) are other tickets' (#100, #101): each adds its own
// file with the same `ARGS` and its own `ported`.

import { Effect } from 'effect'
import {
  ENGINE_AUTHOR,
  engineError,
  importLetterboxd,
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
  // A step argparse refuses is answered here (`invalid_usage`).
  ported: (argv) => {
    try {
      return parseArgv(argv, ARGS).letterboxd !== undefined
    } catch (error) {
      if (error instanceof ArgvError) return true
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
      const { original, content } = yield* readUpload(args.letterboxd ?? '')
      return yield* importLetterboxd({
        person: args.pessoa,
        original,
        content,
        author: ENGINE_AUTHOR,
      })
    }),
})
