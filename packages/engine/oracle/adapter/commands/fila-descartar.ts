// `fila descartar <id> [--razao <reason>]` → `discardQueueItem` (#100).

import { discardQueueItem, ENGINE_AUTHOR } from '../../../src/index.ts'
import { defineCommand } from '../command.ts'

export default defineCommand({
  command: 'fila descartar',
  args: {
    positionals: [{ name: 'id' }],
    options: { razao: { kind: 'value' } },
  },
  run: (args) =>
    discardQueueItem({
      id: args.id,
      reason: args.razao ?? 'ignorar',
      author: ENGINE_AUTHOR,
    }),
})
