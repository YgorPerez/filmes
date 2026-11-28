// Programas [presets] (#402): fixed names in `presets.toml`, each with
// Climas and Restrições. Nova Sessão shows them as chips that fill the form,
// and the Leitura do pedido reads the name. A Programa is only a shorthand:
// the request it fills is the same as the one typed field by field.

import { Effect, Schema } from 'effect'
import { Environment } from '../runtime/Environment.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import { readConstraints } from './constraints/index.ts'
import { resolveMoods } from './moods.ts'
import type { RecommendRequest } from './recommend.ts'

/** What a Programa fills of a request: Climas and Restrições. */
export type PresetFields = Partial<
  Pick<
    RecommendRequest,
    | 'moods'
    | 'noMoods'
    | 'child'
    | 'maxDuration'
    | 'since'
    | 'until'
    | 'language'
    | 'unseen'
    | 'noSlow'
    | 'noSad'
  >
>

export interface Preset {
  readonly name: string
  readonly fields: PresetFields
}

const PresetToml = Schema.Struct({
  moods: Schema.optionalKey(Schema.Array(Schema.String)),
  no_moods: Schema.optionalKey(Schema.Array(Schema.String)),
  child: Schema.optionalKey(Schema.Int),
  max_duration: Schema.optionalKey(Schema.Int),
  since: Schema.optionalKey(Schema.Int),
  until: Schema.optionalKey(Schema.Int),
  language: Schema.optionalKey(Schema.String),
  unseen: Schema.optionalKey(Schema.Boolean),
  no_slow: Schema.optionalKey(Schema.Boolean),
  no_sad: Schema.optionalKey(Schema.Boolean),
})

const PresetsToml = Schema.Record(Schema.String, Schema.Unknown)

const refuse = (name: string, why: string) =>
  engineError('invalid_config', `presets.toml ['${name}']: ${why}`)

/** The Climas of `asked` as `moods.toml` spells them; one outside it is
 * `invalid_config`. */
const moodNames = (name: string, asked: ReadonlyArray<string> | undefined) =>
  Effect.gen(function* () {
    if (asked === undefined) return undefined
    const { moods, warnings } = yield* resolveMoods(asked)
    if (warnings.length > 0) return yield* refuse(name, warnings.join(' '))
    return moods.map((mood) => mood.name)
  })

/** One Programa, decoded and checked: its keys, its Climas and its
 * Restrições, as a request would be. */
const presetOf = (
  name: string,
  value: unknown,
): Effect.Effect<Preset, EngineError, Environment> =>
  Effect.gen(function* () {
    const toml = yield* Schema.decodeUnknownEffect(PresetToml, {
      onExcessProperty: 'error',
    })(value).pipe(Effect.mapError((error) => refuse(name, error.message)))
    const moods = yield* moodNames(name, toml.moods)
    const noMoods = yield* moodNames(name, toml.no_moods)
    const fields: PresetFields = Object.fromEntries(
      Object.entries({
        moods,
        noMoods,
        child: toml.child,
        maxDuration: toml.max_duration,
        since: toml.since,
        until: toml.until,
        language: toml.language,
        unseen: toml.unseen,
        noSlow: toml.no_slow,
        noSad: toml.no_sad,
      }).filter(([, field]) => field !== undefined),
    )
    yield* readConstraints(fields).pipe(
      Effect.mapError((error) => refuse(name, error.message)),
    )
    return { name, fields }
  })

/** Every Programa, in the file's order. */
export const readPresets: Effect.Effect<
  ReadonlyArray<Preset>,
  EngineError,
  Environment
> = Effect.gen(function* () {
  const table = yield* (yield* Environment).readConfig('presets', PresetsToml)
  return yield* Effect.forEach(Object.entries(table), ([name, value]) =>
    presetOf(name, value),
  )
})
