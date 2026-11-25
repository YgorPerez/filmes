// `cartaz` → `billboard` (#97): the Cartaz as data, and `shown` recorded
// with `--filmes`. The HTML is the app's (#114) and the MCP view's (#111),
// so `arquivo` has no twin (`billboard-is-a-model-not-a-file`).

import { Effect } from 'effect'
import { billboard, pyStrip } from '../../../src/index.ts'
import { defineCommand } from '../command.ts'

/** Python's `_ids`: the comma-separated ids, stripped, none empty. */
const ids = (value: string): string[] =>
  value
    .split(',')
    .map(pyStrip)
    .filter((part) => part !== '')

export default defineCommand({
  command: 'cartaz',
  args: {
    options: {
      sessao: { kind: 'value', required: true },
      filmes: { kind: 'value' },
      saida: { kind: 'value' },
    },
  },
  run: (args) =>
    Effect.map(
      billboard({
        session: args.sessao,
        ...(args.filmes !== undefined && { shown: ids(args.filmes) }),
      }),
      ({ billboard: _model, ...output }) => output,
    ),
})
