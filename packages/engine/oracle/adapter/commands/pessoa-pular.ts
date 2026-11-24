import { personSkip } from '../../../src/index.ts'
import { defineCommand } from '../command.ts'
import { tagGroup } from '../tag-group.ts'

export default defineCommand({
  command: 'pessoa pular',
  args: {
    positionals: [{ name: 'pessoa' }, { name: 'texto' }],
    options: {
      entidade: { kind: 'value' },
      grupo: { kind: 'value' },
      data: { kind: 'value' },
    },
    exclusive: [{ options: ['entidade', 'grupo'] }],
  },
  run: (args) =>
    personSkip({
      person: args.pessoa,
      text: args.texto,
      ...(args.grupo !== undefined
        ? { subject: tagGroup(args.grupo), group: true }
        : args.entidade !== undefined && { subject: args.entidade }),
      ...(args.data !== undefined && { date: args.data }),
    }),
})
