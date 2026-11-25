import { rebuild } from '../../../src/index.ts'
import { defineCommand } from '../command.ts'

export default defineCommand({
  command: 'reconstruir',
  args: { positionals: [], options: {} },
  run: () => rebuild,
})
