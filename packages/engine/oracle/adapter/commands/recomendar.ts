// `recomendar` → `recommendSession` (#90, #94): the Recomendação and the
// Session it opens, with the local Restrições (#91) and the on-demand ones
// (#92). Refazer (`--sessao`, `--manter`, `--trocar`, #95) and the Session
// Restrições (#93) are ported later, so a step with those arguments stays
// `not_ported`.

import { data } from '@filmes/key-migration'
import { recommendSession, type RuleName } from '../../../src/index.ts'
import { engineError } from '../../../src/runtime/EngineError.ts'
import { Effect } from 'effect'
import { defineCommand } from '../command.ts'

/** Arguments of later tickets: refazer's (#95) and the Restrições'
 * (#93, `restricoes/*.py` `configurar`). */
const LATER = [
  '--sessao',
  '--manter',
  '--trocar',
  '--parecido',
  '--sem-parecido',
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
      // The local Restrições (#91).
      'duracao-max': { kind: 'value' },
      desde: { kind: 'value' },
      ate: { kind: 'value' },
      idioma: { kind: 'value' },
      'sem-ja-visto': { kind: 'flag' },
      'sem-lento': { kind: 'flag' },
      'sem-tristeza': { kind: 'flag' },
      // The on-demand Restrições (#92); `--crianca` alone is age 0.
      crianca: { kind: 'optional', const: '0' },
      gatilho: { kind: 'append' },
    },
  },
  ported: (argv) =>
    !argv.some((token) =>
      LATER.some((flag) => token === flag || token.startsWith(`${flag}=`)),
    ),
  run: (args) => {
    // argparse's `type=int` (the oracle does not compare an invalid_usage
    // message, so which bad one is named first does not matter).
    const ints: Record<string, number | undefined> = {}
    for (const name of [
      'quantos',
      'duracao-max',
      'desde',
      'ate',
      'crianca',
    ] as const) {
      const value = args[name]
      if (value === undefined) continue
      ints[name] = pyInt(value)
      if (ints[name] === undefined)
        return Effect.fail(
          engineError(
            'invalid_usage',
            `argument --${name}: invalid int value: '${value}'`,
          ),
        )
    }
    const count = ints['quantos']
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
      ...(ints['duracao-max'] !== undefined && {
        maxDuration: ints['duracao-max'],
      }),
      ...(ints['desde'] !== undefined && { since: ints['desde'] }),
      ...(ints['ate'] !== undefined && { until: ints['ate'] }),
      ...(args.idioma !== undefined && { language: args.idioma }),
      ...(args['sem-ja-visto'] && { unseen: true }),
      ...(args['sem-lento'] && { noSlow: true }),
      ...(args['sem-tristeza'] && { noSad: true }),
      ...(ints['crianca'] !== undefined && { child: ints['crianca'] }),
      ...(args.gatilho.length > 0 && { triggers: args.gatilho }),
    })
  },
})
