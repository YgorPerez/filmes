// The Cartaz's Acrescentar on the web (#184): which items of its reading
// go into the redo request, and how. Presentes and Climas are added; a
// Restrição is added or replaces the same one (the year range as a whole);
// a Parecido replaces the one there. How many films, the Regra and "de"
// are not read from an Acrescentar: their words come back not understood.

import { mergeReadFields } from './read-request.ts'
import type { ReadField, ReadFields } from './reader.ts'

/** The kinds of field an Acrescentar applies (`readRequest`'s `fields`). */
export const ADDITION_FIELDS: ReadonlyArray<ReadField> = [
  'attendees',
  'moods',
  'maxDuration',
  'child',
  'year',
  'language',
  'unseen',
  'noSlow',
  'noSad',
  'similar',
]

/** The redo request `asked` with what an Acrescentar read. */
export const withAddition = <R extends ReadFields>(
  asked: R,
  read: ReadFields,
): R => {
  const year = read.since !== undefined || read.until !== undefined
  return mergeReadFields(
    {
      ...asked,
      ...(year && { since: undefined, until: undefined }),
      ...(read.similar && { similar: undefined }),
    },
    read,
  )
}
