// `fila confirmar <id> --filme <tconst or link>` → `confirmQueueItem` (#100).

import { confirmQueueItem, ENGINE_AUTHOR } from '../../../src/index.ts'
import { defineCommand } from '../command.ts'

export default defineCommand({
  command: 'fila confirmar',
  args: {
    positionals: [{ name: 'id' }],
    options: { filme: { kind: 'value', required: true } },
  },
  run: (args) =>
    confirmQueueItem({
      id: args.id,
      film: args.filme,
      author: ENGINE_AUTHOR,
    }),
})
