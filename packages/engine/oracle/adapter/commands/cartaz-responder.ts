// `cartaz responder` → `answerBillboard` (#97): the text comes in stdin.

import { answerBillboard, engineError } from '../../../src/index.ts'
import { defineCommand } from '../command.ts'

export default defineCommand({
  command: 'cartaz responder',
  args: {
    options: {
      sessao: { kind: 'value', required: true },
      filmes: { kind: 'value' },
      saida: { kind: 'value' },
    },
  },
  run: (args, { stdin }) =>
    args.filmes !== undefined || args.saida
      ? engineError(
          'invalid_usage',
          'cartaz responder só leva --sessao; o texto vem no stdin',
        )
      : answerBillboard({ session: args.sessao, text: stdin ?? '' }),
})
