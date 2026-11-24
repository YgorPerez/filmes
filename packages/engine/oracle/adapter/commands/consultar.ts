import { consult } from '../../../src/index.ts'
import { defineCommand } from '../command.ts'

export default defineCommand({
  command: 'consultar',
  args: { positionals: [{ name: 'sql' }], options: {} },
  run: (args) => consult(args.sql),
})
