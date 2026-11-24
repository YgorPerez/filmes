// The tag groups of `tag_vetoes.toml` (Python's `config/vetos_por_tag.toml`,
// `recomendacao/vetos.py`): a Veto or an open question can name one by its
// key (`silly_comedy`), and the Restrição "nada lento" is the `slow` group.

import { Effect, Schema } from 'effect'
import { Environment } from '../runtime/Environment.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'

const TagGroup = Schema.Struct({
  /** How a Veto or a question names it: "comédia boba". */
  label: Schema.String,
  /** The film has one of these IMDb genres; empty is any genre. */
  imdb_genres: Schema.Array(Schema.String),
  /** And one of these tags, lower case, above `[tag_vetoes]`'s minimums. */
  tags: Schema.Array(Schema.String),
})

export type TagGroup = typeof TagGroup.Type

/** Group key → group, in file order. */
const TagGroups = Schema.Record(Schema.String, TagGroup)

/** Every tag group, read per call. */
export const readTagGroups: Effect.Effect<
  Readonly<Record<string, TagGroup>>,
  EngineError,
  Environment
> = Effect.flatMap(Environment, (env) =>
  env.readConfig('tag_vetoes', TagGroups),
)

/** A Veto target that is neither a film (tt...) nor an entity (Q...) is a
 * tag group's key (`e_grupo`). */
export const isTagGroup = (target: string): boolean =>
  !(target.startsWith('tt') || target.startsWith('Q'))

/** The group's label; a key that is not a group is `unknown_target`
 * (`_rotulo_do_grupo`). The message names the English file and keys the
 * engine reads, where Python's names `config/vetos_por_tag.toml`. */
export const tagGroupLabel = (
  key: string,
): Effect.Effect<string, EngineError, Environment> =>
  Effect.flatMap(readTagGroups, (groups) => {
    const group = Object.hasOwn(groups, key) ? groups[key] : undefined
    if (group === undefined || !isTagGroup(key)) {
      const keys = Object.keys(groups).join(', ') || 'nenhum'
      return Effect.fail(
        engineError(
          'unknown_target',
          `'${key}' não é um grupo de config/tag_vetoes.toml (há: ${keys})`,
        ),
      )
    }
    return Effect.succeed(group.label)
  })
