// `verificar` → `verifyAnswer` (#98).

import { verifyAnswer } from '../../../src/index.ts'
import { defineCommand } from '../command.ts'

export default defineCommand({
  command: 'verificar',
  args: {
    options: {
      sessao: { kind: 'value', required: true },
      texto: { kind: 'value', required: true },
    },
  },
  run: (args) => verifyAnswer({ session: args.sessao, text: args.texto }),
})
