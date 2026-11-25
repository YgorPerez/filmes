// What the Letterboxd resolution keeps in filmes-dados: `imports/
// letterboxd.md` (`importar/decisoes.py`).
//
// The rebuild redoes the Wikidata lookup from the local Catalog. To repeat
// the result offline, it reads here TMDB's answers and the Dono's
// decisions, one entry per pair (Name, Year). The search's candidates stay
// in the source cache.
//
//     status: tmdb         TMDB found one film by the title; `film` is the tconst
//                          (with `tmdb` when it came from the TMDB id the RSS gave)
//     status: miniseries   TMDB's series with the title has more votes than the films
//     status: pending      TMDB did not find one film with an IMDb id
//     status: confirmed    the Dono said which film it is (`film`)
//     status: discarded    the Dono said it is not a film, or to ignore it (`discard_reason`)
//
// The last two come before anything, Wikidata included. Each entry is kept
// as read (its keys in order, the queue's `source`, `kind` and `input`
// too) and written back as it was.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { readMarkdown, writeMarkdown } from '../data/markdown.ts'
import {
  isMapping,
  pyIterate,
  pyStrValue,
  type YamlMapping,
  type YamlValue,
} from '../data/yaml.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import { Environment } from '../runtime/Environment.ts'

export const RESOLUTIONS_PATH = 'imports/letterboxd.md'

const BODY =
  'Resoluções do import do Letterboxd que não saem do Wikidata: os IDs resolvidos e as\n' +
  'decisões do Dono na fila. `reconstruir` lê este arquivo; os comandos `importar` e `fila` o escrevem.\n'

/** One entry, by its film key (`id`). */
export type Resolution = YamlMapping
export type Resolutions = Map<string, Resolution>

/** `decisao["situacao"]`, or undefined. */
export const statusOf = (
  resolution: Resolution | undefined,
): string | undefined => {
  const status = resolution?.get('status')
  return typeof status === 'string' ? status : undefined
}

/** `decisao.get(key)` as Python's `str()` would show it, null when absent
 * or None. */
export const textField = (
  resolution: Resolution,
  key: string,
): string | null => {
  const value = resolution.get(key)
  return value === undefined || value === null ? null : pyStrValue(value)
}

const resolutionsFile = Effect.map(Environment, (env) => env.path('data'))

/** Every entry, by id (`decisoes.ler`). */
export const readResolutions: Effect.Effect<
  Resolutions,
  EngineError,
  Environment
> = Effect.gen(function* () {
  const root = yield* yield* resolutionsFile
  const path = join(root, RESOLUTIONS_PATH)
  if (!(yield* Effect.sync(() => existsSync(path)))) return new Map()
  const { frontmatter } = yield* readMarkdown(path)
  const films: YamlValue =
    (isMapping(frontmatter) && frontmatter.get('films')) || []
  const resolutions: Resolutions = new Map()
  for (const entry of pyIterate(films))
    if (isMapping(entry))
      resolutions.set(pyStrValue(entry.get('id') ?? null), entry)
  return resolutions
})

/** Code point order, as Python sorts str. */
const byCodePoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Writes every entry, by id (`decisoes.salvar`). */
export const saveResolutions = (
  resolutions: Resolutions,
): Effect.Effect<void, EngineError, Environment> =>
  Effect.gen(function* () {
    const root = yield* yield* resolutionsFile
    const films = [...resolutions.keys()]
      .sort(byCodePoint)
      .map((id) => resolutions.get(id) ?? null)
    yield* writeMarkdown(
      join(root, RESOLUTIONS_PATH),
      new Map([['films', films]]),
      BODY,
    )
  })
