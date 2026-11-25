import { personVeto } from '../../../src/index.ts'
import { defineCommand } from '../command.ts'
import { tagGroup } from '../tag-group.ts'

export default defineCommand({
  command: 'pessoa vetar',
  args: {
    positionals: [{ name: 'pessoa' }, { name: 'texto' }],
    options: {
      filme: { kind: 'value' },
      entidade: { kind: 'value' },
      grupo: { kind: 'value' },
      data: { kind: 'value' },
    },
    exclusive: [{ options: ['filme', 'entidade', 'grupo'], required: true }],
  },
  run: (args) =>
    personVeto({
      person: args.pessoa,
      text: args.texto,
      ...(args.grupo
        ? { target: tagGroup(args.grupo), group: true }
        : { target: args.filme || args.entidade || '' }),
      ...(args.data !== undefined && { date: args.data }),
    }),
})
