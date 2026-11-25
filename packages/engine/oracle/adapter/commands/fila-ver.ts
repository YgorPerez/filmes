// `fila ver` → `viewQueue` (#100).

import { viewQueue } from '../../../src/index.ts'
import { defineCommand } from '../command.ts'

export default defineCommand({
  command: 'fila ver',
  args: { positionals: [], options: {} },
  run: () => viewQueue,
})
