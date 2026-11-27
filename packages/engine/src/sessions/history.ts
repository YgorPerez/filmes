// What a Session went through on the Cartaz (#272), for the pages around
// it: the acrescentares, the stars, and the films that left the shelf.
// The request (`context.request`) keeps the words the Dono opened with;
// the acrescentares say what came after ("chegou a Rosa").

import {
  isMapping,
  isSequence,
  pyStrValue,
  pyTruthy,
  yamlToJson,
  type YamlMapping,
  type YamlValue,
} from '../data/yaml.ts'

const listOf = (value: YamlValue | undefined): ReadonlyArray<YamlValue> =>
  value !== undefined && pyTruthy(value) && isSequence(value) ? value : []

const mappings = (value: YamlValue | undefined): YamlMapping[] =>
  listOf(value).filter(isMapping)

/** Every reply of the Session: the earlier versions in order, then the
 * current one. */
const repliesOf = (front: YamlMapping): YamlMapping[] => [
  ...mappings(front.get('versions')).flatMap((version) =>
    mappings(version.get('replies')),
  ),
  ...mappings(front.get('replies')),
]

/** Every acrescentar of the Session's replies, each once, in order. */
export const additionsOf = (front: YamlMapping): string[] => {
  const additions: string[] = []
  for (const reply of repliesOf(front)) {
    const addition = reply.get('addition')
    if (addition === undefined || !pyTruthy(addition)) continue
    const text = pyStrValue(addition).trim()
    if (text !== '' && !additions.includes(text)) additions.push(text)
  }
  return additions
}

/** The stars each film got on the Cartaz, the last ones given, by IMDb
 * id. */
export const starsOf = (front: YamlMapping): Record<string, number> => {
  const stars: Record<string, number> = {}
  for (const reply of repliesOf(front))
    for (const film of mappings(reply.get('films'))) {
      const given = yamlToJson(film.get('stars') ?? null)
      if (typeof given === 'number')
        stars[pyStrValue(film.get('id') ?? null)] = given
    }
  return stars
}

/** A film of an earlier version. */
export interface EarlierFilm {
  readonly id: string
  readonly title: string
}

/** The films of the earlier versions that the current one no longer has,
 * each once, in the order they first showed. */
export const earlierFilmsOf = (front: YamlMapping): EarlierFilm[] => {
  const current = new Set(
    mappings(front.get('recommendation')).map((item) =>
      pyStrValue(item.get('id') ?? null),
    ),
  )
  const earlier = new Map<string, string>()
  for (const version of mappings(front.get('versions')))
    for (const item of mappings(version.get('recommendation'))) {
      const id = pyStrValue(item.get('id') ?? null)
      if (current.has(id) || earlier.has(id)) continue
      earlier.set(id, pyStrValue(item.get('title') ?? id))
    }
  return [...earlier].map(([id, title]) => ({ id, title }))
}
