// The arguments `pessoa declarar` and `pessoa relatar` share
// (`_argumentos_de_dito` in `filmes/comandos/pessoa.py`).

import { output } from '@filmes/key-migration'
import type { StatementInput, StatementReaction } from '../../src/index.ts'

export const statementArgs = {
  positionals: [{ name: 'pessoa' }, { name: 'texto' }],
  options: {
    filme: { kind: 'value' },
    entidade: { kind: 'value' },
    reacao: { kind: 'value', choices: ['ama', 'gosta', 'nao-gosta', 'odeia'] },
    // `store_const` into one `especifico`: true, false or absent.
    especifico: { kind: 'flag' },
    generico: { kind: 'flag' },
    fonte: { kind: 'value' },
    data: { kind: 'value' },
  },
  exclusive: [
    { options: ['filme', 'entidade'] },
    { options: ['especifico', 'generico'] },
  ],
} as const

interface StatementArgs {
  readonly pessoa: string
  readonly texto: string
  readonly filme: string | undefined
  readonly entidade: string | undefined
  readonly reacao: string | undefined
  readonly especifico: boolean
  readonly generico: boolean
  readonly fonte: string | undefined
  readonly data: string | undefined
}

const REACTIONS: Readonly<Record<string, string>> = output.STATEMENT_REACTIONS

export const statementInput = (args: StatementArgs): StatementInput => {
  const target = args.filme || args.entidade
  return {
    person: args.pessoa,
    text: args.texto,
    ...(target && { target }),
    ...(args.reacao !== undefined && {
      reaction: REACTIONS[args.reacao.replace('-', '_')] as StatementReaction,
    }),
    ...((args.especifico || args.generico) && { specific: args.especifico }),
    ...(args.fonte !== undefined && { source: args.fonte }),
    ...(args.data !== undefined && { date: args.data }),
  }
}
