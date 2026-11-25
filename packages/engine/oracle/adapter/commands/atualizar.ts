// `atualizar` → `update` (#107). Its progress lines went to stderr, which
// the oracle does not compare; the engine gives them to a callback, so here
// they are dropped. Every fixture step reads the recordings
// (`FILMES_GRAVACOES`), never the network.

import { update } from '../../../src/index.ts'
import { defineCommand } from '../command.ts'

export default defineCommand({
  command: 'atualizar',
  args: { positionals: [], options: {} },
  run: () => update(),
})
