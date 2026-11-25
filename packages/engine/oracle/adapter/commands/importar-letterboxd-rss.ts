// `importar --letterboxd-rss <user>` (#100). `importar-letterboxd.ts`
// answers the steps argparse refuses.

import { Effect } from 'effect'
import {
  ENGINE_AUTHOR,
  engineError,
  importLetterboxdRss,
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
  ported: (argv) => {
    try {
      return parseArgv(argv, ARGS)['letterboxd-rss'] !== undefined
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
      return yield* importLetterboxdRss({
        person: args.pessoa,
        user: args['letterboxd-rss'] ?? '',
        author: ENGINE_AUTHOR,
      })
    }),
})
