// `sessoes-abertas` → `openSessions` (#94).

import { openSessions } from '../../../src/index.ts'
import { defineCommand } from '../command.ts'

export default defineCommand({
  command: 'sessoes-abertas',
  args: { options: {} },
  run: () => openSessions,
})
