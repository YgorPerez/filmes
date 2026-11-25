// `feedback` → `recordFeedback` (#96).

import { recordFeedback } from '../../../src/index.ts'
import { defineCommand } from '../command.ts'

export default defineCommand({
  command: 'feedback',
  args: {
    options: {
      sessao: { kind: 'value', required: true },
      filme: { kind: 'value' },
      nada: { kind: 'flag' },
      nota: { kind: 'append' },
      relato: { kind: 'append' },
      comentario: { kind: 'append' },
    },
    exclusive: [{ options: ['filme', 'nada'], required: true }],
  },
  run: (args) =>
    recordFeedback({
      session: args.sessao,
      film: args.nada ? null : (args.filme ?? null),
      ratings: args.nota,
      reports: args.relato,
      comments: args.comentario,
    }),
})
