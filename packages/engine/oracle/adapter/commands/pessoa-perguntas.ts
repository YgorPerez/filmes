import { personQuestions } from '../../../src/index.ts'
import { defineCommand } from '../command.ts'

export default defineCommand({
  command: 'pessoa perguntas',
  args: { positionals: [{ name: 'pessoa' }], options: {} },
  run: (args) => personQuestions(args.pessoa),
})
