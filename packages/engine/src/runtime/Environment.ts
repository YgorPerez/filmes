// Where the engine reads and writes, and its config, built once per process
// from the environment variables. The variables keep the Portuguese names
// the Python engine gave them (`FILMES_*`), which the deploy and the
// machines already set; the config is read from English TOML (ADR 0002) in
// the folder `FILMES_CONFIG` names.
//
//     FILMES_CONFIG      the config folder: weights.toml, moods.toml... (required)
//     FILMES_PESOS       another weights file (default: <config>/weights.toml)
//     FILMES_LOCAL       another local.toml (default: <config>/local.toml)
//     FILMES_HOJE        today's date (YYYY-MM-DD), for tests
//     FILMES_DADOS       filmes-dados (People, Sessions)      [paths] data
//     FILMES_CATALOGO    the pinned dumps and CSV tables      [paths] catalog
//     FILMES_VERSOES     the dumps' manifest                  [paths] versions
//     FILMES_BANCO       the derived SQLite                   [paths] database
//     FILMES_CACHE       the on-demand sources' cache         [paths] cache
//     FILMES_GRAVACOES   recorded source answers, not the net [paths] recordings
//     FILMES_AVALIACOES  `avaliar`'s reports                  [paths] evaluations
//     FILMES_OMDB_CHAVE  FILMES_DDD_CHAVE  FILMES_TMDB_CHAVE  the on-demand
//                        sources' API keys (environment only, never local.toml)
//     FILMES_DATA_REMOTE   where `DataWriter` pushes filmes-dados (a git URL)
//     FILMES_DATA_KEY      the deploy key's file for that push (a path; the
//                          key itself is never read here)
//
// The last two came after the Python engine (which never committed), so
// they are named in English like the app's `FILMES_DATABASE`. Environment
// only, never local.toml: only the VPS pushes (ADR 0005).
//
// A variable wins over `[paths]` in local.toml. An empty variable counts as
// unset, as in Python.

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import { Context, Effect, Layer, Redacted, Schema } from 'effect'
import { parse as parseToml } from 'smol-toml'
import { engineError, type EngineError } from './EngineError.ts'
import { Weights } from './Weights.ts'

/** The environment variables, as `process.env` gives them. */
export type Vars = Readonly<Record<string, string | undefined>>

const PATH_VARIABLES = {
  data: 'FILMES_DADOS',
  catalog: 'FILMES_CATALOGO',
  versions: 'FILMES_VERSOES',
  database: 'FILMES_BANCO',
  cache: 'FILMES_CACHE',
  recordings: 'FILMES_GRAVACOES',
  evaluations: 'FILMES_AVALIACOES',
} as const

export type PathName = keyof typeof PATH_VARIABLES

/** The variables with the on-demand sources' API keys. */
export const SOURCE_KEY_VARIABLES = [
  'FILMES_OMDB_CHAVE',
  'FILMES_DDD_CHAVE',
  'FILMES_TMDB_CHAVE',
] as const

export type SourceKeyVariable = (typeof SOURCE_KEY_VARIABLES)[number]

/** The config files besides `weights.toml` and `local.toml`, by the stem of
 * their English name. */
export type ConfigName =
  | 'awards'
  | 'film_groups'
  | 'moods'
  | 'group_alone'
  | 'sadness'
  | 'tag_vetoes'
  | 'request_reading'

const LocalToml = Schema.Struct({
  paths: Schema.optionalKey(
    Schema.Struct({
      data: Schema.optionalKey(Schema.String),
      catalog: Schema.optionalKey(Schema.String),
      versions: Schema.optionalKey(Schema.String),
      database: Schema.optionalKey(Schema.String),
      cache: Schema.optionalKey(Schema.String),
      recordings: Schema.optionalKey(Schema.String),
      evaluations: Schema.optionalKey(Schema.String),
    }),
  ),
})

/** Reads a TOML config file: a missing file is `missing_config`, a broken
 * one `invalid_config`, with the messages of Python's `ler_toml`. */
const readToml = (path: string): Effect.Effect<unknown, EngineError> =>
  Effect.suspend(() => {
    if (!existsSync(path))
      return Effect.fail(
        engineError(
          'missing_config',
          `arquivo de config não encontrado: ${path}`,
        ),
      )
    return Effect.try({
      try: (): unknown => parseToml(readFileSync(path, 'utf8')),
      catch: (error) =>
        engineError('invalid_config', `${path}: ${String(error)}`),
    })
  })

/** Reads a TOML config file and decodes it; a file that does not fit the
 * schema is `invalid_config`. */
const readConfigFile = <S extends Schema.ConstraintDecoder<unknown>>(
  path: string,
  schema: S,
): Effect.Effect<S['Type'], EngineError> =>
  readToml(path).pipe(
    Effect.flatMap((parsed) =>
      Schema.decodeUnknownEffect(schema)(parsed).pipe(
        Effect.mapError((error) =>
          engineError('invalid_config', `${path}: ${error.message}`),
        ),
      ),
    ),
  )

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** `FILMES_HOJE`, checked: a real calendar date or `invalid_config`. */
const checkToday = (value: string): Effect.Effect<string, EngineError> => {
  const match = ISO_DATE.exec(value)
  const date = match
    ? new Date(
        Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
      )
    : undefined
  return date &&
    !Number.isNaN(date.getTime()) &&
    date.toISOString().startsWith(value)
    ? Effect.succeed(value)
    : Effect.fail(
        engineError('invalid_config', `FILMES_HOJE inválido: '${value}'`),
      )
}

export interface EnvironmentShape {
  /** The config folder (`FILMES_CONFIG`). */
  readonly config: string
  /** Every path that is set, absolute or as given. `cache` defaults to
   * `<database stem>-cache.sqlite` beside the database. */
  readonly paths: Readonly<Partial<Record<PathName, string>>>
  /** `weights.toml`, decoded. */
  readonly weights: Weights
  /** The on-demand sources' API keys that are set. */
  readonly sourceKeys: Readonly<
    Partial<Record<SourceKeyVariable, Redacted.Redacted<string>>>
  >
  /** `FILMES_DATA_REMOTE`: where filmes-dados is pushed. Unset, nothing is
   * pushed (tests and local runs). */
  readonly dataRemote: string | undefined
  /** `FILMES_DATA_KEY`: the path of the deploy key that pushes. Redacted so
   * a log or an error never shows it. */
  readonly dataKey: Redacted.Redacted<string> | undefined
  /** `FILMES_HOJE` when set. Code asks `Run` (or `Today`) for today, never
   * this. */
  readonly fixedToday: string | undefined
  /** A path that must be set: `missing_config` names the variable and the
   * `local.toml` key that set it. */
  readonly path: (name: PathName) => Effect.Effect<string, EngineError>
  /** Reads `<config>/<name>.toml` and decodes it with `schema`. */
  readonly readConfig: <S extends Schema.ConstraintDecoder<unknown>>(
    name: ConfigName,
    schema: S,
  ) => Effect.Effect<S['Type'], EngineError>
}

export class Environment extends Context.Service<
  Environment,
  EnvironmentShape
>()('@filmes/engine/runtime/Environment') {
  /** The environment of a process, from its variables. Fails when the config
   * folder, the weights or `FILMES_HOJE` are missing or broken: nothing in
   * the engine works without them. */
  static readonly layerFrom = (
    vars: Vars,
  ): Layer.Layer<Environment, EngineError> =>
    Layer.effect(Environment, makeEnvironment(vars))
}

/** The variables, with an empty one read as unset, as in Python. */
type Getter = (name: string) => string | undefined

/** Every path that is set: the variable, then `[paths]` in local.toml, then
 * the default; `cache` defaults to beside the database. */
const resolvePaths = (
  get: Getter,
  config: string,
  local: Partial<Record<PathName, string>>,
): Partial<Record<PathName, string>> => {
  const storage = join(
    get('XDG_DATA_HOME') ?? join(get('HOME') ?? homedir(), '.local', 'share'),
    'filmes',
  )
  const defaults: Partial<Record<PathName, string>> = {
    catalog: join(storage, 'catalogo'),
    versions: join(config, 'catalog-versions.json'),
    database: join(storage, 'filmes.sqlite'),
  }
  const paths: Partial<Record<PathName, string>> = {}
  for (const name of Object.keys(PATH_VARIABLES) as PathName[]) {
    const value = get(PATH_VARIABLES[name]) ?? local[name] ?? defaults[name]
    if (value !== undefined) paths[name] = value
  }
  if (paths.cache === undefined && paths.database !== undefined) {
    const database = paths.database
    const stem = basename(database, extname(database))
    paths.cache = join(dirname(database), `${stem}-cache.sqlite`)
  }
  return paths
}

const readSourceKeys = (
  get: Getter,
): Partial<Record<SourceKeyVariable, Redacted.Redacted<string>>> => {
  const sourceKeys: Partial<
    Record<SourceKeyVariable, Redacted.Redacted<string>>
  > = {}
  for (const name of SOURCE_KEY_VARIABLES) {
    const value = get(name)
    if (value !== undefined) sourceKeys[name] = Redacted.make(value)
  }
  return sourceKeys
}

const pathIn =
  (paths: Partial<Record<PathName, string>>) =>
  (name: PathName): Effect.Effect<string, EngineError> => {
    const value = paths[name]
    return value === undefined
      ? Effect.fail(
          engineError(
            'missing_config',
            `caminho '${name}' não configurado: defina ${PATH_VARIABLES[name]} ou [paths] ${name} em config/local.toml`,
          ),
        )
      : Effect.succeed(value)
  }

const makeEnvironment = Effect.fnUntraced(function* (vars: Vars) {
  const get: Getter = (name) => vars[name] || undefined

  const config = get('FILMES_CONFIG')
  if (config === undefined)
    return yield* engineError(
      'missing_config',
      'pasta de config não configurada: defina FILMES_CONFIG (a pasta com weights.toml)',
    )

  const localFile = get('FILMES_LOCAL') ?? join(config, 'local.toml')
  const local = existsSync(localFile)
    ? ((yield* readConfigFile(localFile, LocalToml)).paths ?? {})
    : {}
  const paths = resolvePaths(get, config, local)

  const weights = yield* readConfigFile(
    get('FILMES_PESOS') ?? join(config, 'weights.toml'),
    Weights,
  )
  const sourceKeys = readSourceKeys(get)

  const dataKey = get('FILMES_DATA_KEY')

  const pinned = get('FILMES_HOJE')
  const today = pinned === undefined ? undefined : yield* checkToday(pinned)

  return Environment.of({
    config,
    paths,
    weights,
    sourceKeys,
    dataRemote: get('FILMES_DATA_REMOTE'),
    dataKey: dataKey === undefined ? undefined : Redacted.make(dataKey),
    fixedToday: today,
    path: pathIn(paths),
    readConfig: (name, schema) =>
      readConfigFile(join(config, `${name}.toml`), schema),
  })
})
