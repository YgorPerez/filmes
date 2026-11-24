import { personState } from '../../../src/index.ts'
import { defineCommand } from '../command.ts'
import { statementArgs, statementInput } from '../statement.ts'

export default defineCommand({
  command: 'pessoa declarar',
  args: {
    ...statementArgs,
    options: { ...statementArgs.options, review: { kind: 'flag' } },
  },
  run: (args) =>
    personState({ ...statementInput(args), review: args.review }),
})
