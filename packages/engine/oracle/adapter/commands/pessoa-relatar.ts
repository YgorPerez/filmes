import { personReport } from '../../../src/index.ts'
import { defineCommand } from '../command.ts'
import { statementArgs, statementInput } from '../statement.ts'

export default defineCommand({
  command: 'pessoa relatar',
  args: statementArgs,
  run: (args) => personReport(statementInput(args)),
})
