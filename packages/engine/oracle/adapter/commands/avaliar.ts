// `avaliar` → `evaluate` (#103). `--progresso` wrote progress lines on
// stderr, which the oracle does not compare; the engine gives them to a
// callback, so here they are dropped.

import { evaluate } from '../../../src/index.ts'
import { defineCommand } from '../command.ts'

export default defineCommand({
  command: 'avaliar',
  args: {
    options: {
      grade: { kind: 'flag' },
      progresso: { kind: 'flag' },
    },
  },
  run: (args) => evaluate({ grid: args.grade }),
  // The report is `<FILMES_AVALIACOES>/<today>.md`; every test points
  // FILMES_AVALIACOES at `{work}/avaliacoes`.
  files: () => ['avaliacoes'],
})
