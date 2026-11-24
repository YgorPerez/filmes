import { output } from '@filmes/key-migration'
import { personRemove, type Removable } from '../../../src/index.ts'
import { defineCommand } from '../command.ts'
import { tagGroup } from '../tag-group.ts'

// Option → what it removes: `--declarado` is `stated`...
const REMOVABLE: Readonly<Record<string, Removable>> =
  output.REMOVABLE as Record<string, Removable>

const OPTIONS = ['declarado', 'relato', 'veto', 'visto', 'pergunta'] as const

export default defineCommand({
  command: 'pessoa remover',
  args: {
    positionals: [{ name: 'pessoa' }],
    options: {
      declarado: { kind: 'value' },
      relato: { kind: 'value' },
      veto: { kind: 'value' },
      visto: { kind: 'value' },
      pergunta: { kind: 'value' },
    },
    exclusive: [{ options: OPTIONS, required: true }],
  },
  run: (args) => {
    const option =
      OPTIONS.find((o) => args[o] !== undefined) ?? ('declarado' as const)
    return personRemove({
      person: args.pessoa,
      kind: REMOVABLE[option] ?? 'stated',
      id: tagGroup(args[option] ?? ''),
    })
  },
})
