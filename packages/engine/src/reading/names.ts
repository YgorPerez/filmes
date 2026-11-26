// A Pessoa named in a sentence, as Presentes resolve (`attendees.ts`): by
// slug, name or nickname, here also without accents. A name of more than
// one Pessoa is never guessed.

import type { Found, PersonName, ReadingContext } from './reader.ts'
import type { Words } from './words.ts'

/** The longest name at `i`: where it ends and who it may be. */
export const nameAt = (
  words: Words,
  i: number,
  context: ReadingContext,
):
  | { readonly end: number; readonly people: ReadonlyArray<PersonName> }
  | undefined => {
  for (let size = context.longestName; size >= 1; size -= 1) {
    if (!words.span(i, i + size)) continue
    const key = Array.from({ length: size }, (_, at) => words.key(i + at))
    const people = context.people.get(key.join(' '))
    if (people) return { end: i + size, people }
  }
  return undefined
}

/** The item for one Pessoa, or the ambiguity for several. */
export const personFound = (
  people: ReadonlyArray<PersonName>,
  item: (person: PersonName) => Found,
): Found => {
  const [person] = people
  return people.length === 1 && person
    ? item(person)
    : {
        candidates: people.map(({ slug, name }) => ({ id: slug, label: name })),
      }
}
