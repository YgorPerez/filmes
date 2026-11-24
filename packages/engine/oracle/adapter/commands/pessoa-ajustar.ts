import { data } from '@filmes/key-migration'
import { personAdjust, type Level, type Link } from '../../../src/index.ts'
import { defineCommand } from '../command.ts'

const LINKS: Readonly<Record<string, Link>> = data.LINKS as Record<string, Link>
const LEVELS: Readonly<Record<string, Level>> = data.LEVELS as Record<
  string,
  Level
>

export default defineCommand({
  command: 'pessoa ajustar',
  args: {
    positionals: [{ name: 'pessoa' }],
    options: {
      elo: { kind: 'value', required: true, choices: Object.keys(LINKS) },
      nivel: { kind: 'value', required: true, choices: Object.keys(LEVELS) },
      data: { kind: 'value' },
    },
  },
  run: (args) =>
    personAdjust({
      person: args.pessoa,
      link: LINKS[args.elo] ?? 'director',
      level: LEVELS[args.nivel] ?? 'normal',
      ...(args.data !== undefined && { date: args.data }),
    }),
})
