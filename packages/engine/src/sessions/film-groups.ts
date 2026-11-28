// The fixed groups of films of `config/film_groups.toml` (#415): what the
// Link da Sessão asks a new Pessoa, "Qual destes grupos tem mais a sua
// cara?". Each group has a name, 3 films and 3 labels, all for display
// but the films, which become the seeds of her Escolha de grupo. The
// groups came once from clustering the Tag Genome over the Candidates
// (research #405) and were reviewed by hand.

import { Effect, Schema } from 'effect'
import { Environment } from '../runtime/Environment.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'

/** How many films and labels each group has. */
export const GROUP_SIZE = 3

export interface FilmGroup {
  /** The table's key. */
  readonly id: string
  readonly name: string
  /** Films (tt...), in the order shown. */
  readonly films: ReadonlyArray<string>
  /** Words that describe the group, for display only. */
  readonly labels: ReadonlyArray<string>
}

const FilmGroupsToml = Schema.Record(
  Schema.String,
  Schema.Struct({
    name: Schema.String,
    films: Schema.Array(Schema.String),
    labels: Schema.Array(Schema.String),
  }),
)

/** Every group, in the file's order. A group without exactly 3 films and
 * 3 labels is `invalid_config`. */
export const readFilmGroups: Effect.Effect<
  ReadonlyArray<FilmGroup>,
  EngineError,
  Environment
> = Effect.gen(function* () {
  const table = yield* (yield* Environment).readConfig(
    'film_groups',
    FilmGroupsToml,
  )
  const groups = Object.entries(table).map(([id, group]) => ({ id, ...group }))
  const wrong = groups.find(
    (g) => g.films.length !== GROUP_SIZE || g.labels.length !== GROUP_SIZE,
  )
  if (wrong !== undefined)
    return yield* engineError(
      'invalid_config',
      `config/film_groups.toml: o grupo '${wrong.id}' precisa de ${GROUP_SIZE} filmes e ${GROUP_SIZE} rótulos`,
    )
  return groups
})
