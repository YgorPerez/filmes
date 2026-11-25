// The parts of `catalogo/review.py` the evaluation shares with the Catalog
// (#106 adds the ZIP loading): counting MovieLens tags by distinct user and
// giving each row its Fonte, date and `fato_id`.

import { compareTuple } from '../compat/compare.ts'
import { factId, pyInt, type PyValue } from '../compat/fact-id.ts'
import { pyParseInt } from '../compat/parse.ts'
import { pythonError } from '../compat/python-error.ts'
import { pyReprStr, pyStrip } from '../compat/text.ts'

/** `contar_tags`: distinct users by (film, tag), as `(film, tag, users)`,
 * by film then tag. `rows` gives (userId, movieId, tag) of tags.csv; `map`
 * takes the movieId (text) to the tconst. The tag counts lower-cased and
 * stripped; the users in `excluded` do not count (the evaluation leaves its
 * sampled users out). A userId `int()` refuses throws Python's
 * ValueError. */
export const countTags = (
  rows: Iterable<readonly [string, string, string]>,
  map: ReadonlyMap<string, string>,
  excluded: ReadonlySet<number> = new Set(),
): Array<readonly [string, string, number]> => {
  const users = new Map<
    string,
    { film: string; tag: string; ids: Set<number> }
  >()
  for (const [userId, movieId, rawTag] of rows) {
    const film = map.get(movieId)
    const tag = pyStrip(rawTag).toLowerCase()
    const user = pyParseInt(userId)
    if (user === null)
      throw pythonError(
        'ValueError',
        `invalid literal for int() with base 10: ${pyReprStr(userId)}`,
      )
    if (film && tag && !excluded.has(user)) {
      const key = `${film}\0${tag}`
      const entry = users.get(key) ?? { film, tag, ids: new Set<number>() }
      entry.ids.add(user)
      users.set(key, entry)
    }
  }
  return [...users.values()]
    .sort((a, b) => compareTuple([a.film, a.tag], [b.film, b.tag]))
    .map(({ film, tag, ids }) => [film, tag, ids.size] as const)
}

/** `fatos`: each row with Fonte and date after it and its `fato_id` in
 * front. Numbers are Python ints. */
export const reviewFacts = (
  table: string,
  rows: Iterable<ReadonlyArray<string | number>>,
  [source, date]: readonly [string, string],
): Array<Array<string | number>> => {
  const out: Array<Array<string | number>> = []
  for (const row of rows) {
    const values = [...row, source, date]
    const typed: PyValue[] = values.map((v) =>
      typeof v === 'number' ? pyInt(v) : v,
    )
    out.push([factId(table, ...typed), ...values])
  }
  return out
}
