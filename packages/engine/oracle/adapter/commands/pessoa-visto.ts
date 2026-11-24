import { personSeen } from '../../../src/index.ts'
import { defineCommand } from '../command.ts'

export default defineCommand({
  command: 'pessoa visto',
  args: {
    positionals: [{ name: 'pessoa' }],
    options: {
      filme: { kind: 'value', required: true },
      nota: { kind: 'value' },
      fonte: { kind: 'value' },
      data: { kind: 'value' },
    },
  },
  run: (args) =>
    personSeen({
      person: args.pessoa,
      film: args.filme,
      ...(args.nota !== undefined && { rating: args.nota }),
      ...(args.fonte !== undefined && { source: args.fonte }),
      ...(args.data !== undefined && { date: args.data }),
    }),
})
