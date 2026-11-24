// `recomendar` → `recommendSession` (#90, #94): the Recomendação and the
// Session it opens. Refazer (`--sessao`, `--manter`, `--trocar`, #95) and
// the Restrições (#91, #92) are ported later, so a step with those
// arguments stays `not_ported`.

import { data } from '@filmes/key-migration'
import { recommendSession, type RuleName } from '../../../src/index.ts'
import { engineError } from '../../../src/runtime/EngineError.ts'
import { Effect } from 'effect'
import { defineCommand } from '../command.ts'

/** Arguments of later tickets: refazer's (#95) and the Restrições'
 * (#91, #92, `restricoes/*.py` `configurar`). */
const LATER = [
  '--sessao',
  '--manter',
  '--trocar',
  '--duracao-max',
  '--desde',
  '--ate',
  '--crianca',
  '--sem-lento',
  '--sem-ja-visto',
  '--parecido',
  '--sem-parecido',
  '--idioma',
  '--gatilho',
  '--sem-tristeza',
]

/** Python's `int()` on an argument: spaces around, a sign, digits with
 * single underscores between them. */
const pyInt = (text: string): number | undefined => {
  const match = /^\s*([+-]?)(\d(?:_?\d)*)\s*$/u.exec(text)
  return match
    ? Number(`${match[1]}${(match[2] ?? '').replaceAll('_', '')}`)
    : undefined
}

export default defineCommand({
  command: 'recomendar',
  args: {
    options: {
      presentes: { kind: 'list', required: true },
      regra: { kind: 'value', choices: Object.keys(data.RULES) },
      de: { kind: 'value' },
      clima: { kind: 'extend' },
      quantos: { kind: 'value' },
      pedido: { kind: 'value' },
    },
  },
  ported: (argv) =>
    !argv.some((token) =>
      LATER.some((flag) => token === flag || token.startsWith(`${flag}=`)),
    ),
  run: (args) => {
    let count: number | undefined
    if (args.quantos !== undefined) {
      count = pyInt(args.quantos)
      if (count === undefined)
        return Effect.fail(
          engineError(
            'invalid_usage',
            `argument --quantos: invalid int value: '${args.quantos}'`,
          ),
        )
    }
    const rule = args.regra
      ? ((data.RULES as Record<string, string>)[args.regra] as RuleName)
      : undefined
    return recommendSession({
      attendees: args.presentes,
      request: args.pedido ?? null,
      ...(count !== undefined && { count }),
      ...(rule && { rule }),
      ...(args.de !== undefined && { by: args.de }),
      moods: args.clima,
    })
  },
})
