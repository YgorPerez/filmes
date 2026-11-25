import { personView } from '../../../src/index.ts'
import { defineCommand } from '../command.ts'

export default defineCommand({
  command: 'pessoa ver',
  args: { positionals: [{ name: 'pessoa' }] },
  run: (args) => personView(args.pessoa),
})
