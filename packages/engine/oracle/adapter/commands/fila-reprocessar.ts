// `fila reprocessar [--pessoa <p>]` → `reprocessLetterboxd` (#100).

import { ENGINE_AUTHOR, reprocessLetterboxd } from '../../../src/index.ts'
import { defineCommand } from '../command.ts'

export default defineCommand({
  command: 'fila reprocessar',
  args: { positionals: [], options: { pessoa: { kind: 'value' } } },
  run: (args) =>
    reprocessLetterboxd({ person: args.pessoa, author: ENGINE_AUTHOR }),
})
