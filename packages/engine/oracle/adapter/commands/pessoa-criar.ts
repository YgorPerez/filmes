import { personCreate } from '../../../src/index.ts'
import { defineCommand } from '../command.ts'

export default defineCommand({
  command: 'pessoa criar',
  args: {
    positionals: [{ name: 'nome' }],
    options: {
      apelido: { kind: 'append' },
      slug: { kind: 'value' },
      dono: { kind: 'flag' },
    },
  },
  run: (args) =>
    personCreate({
      name: args.nome,
      aliases: args.apelido,
      ...(args.slug !== undefined && { slug: args.slug }),
      owner: args.dono,
    }),
})
