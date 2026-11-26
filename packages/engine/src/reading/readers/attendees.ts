// Presentes: a Pessoa by slug, name or nickname, and "eu" for the Dono.

import { Effect, Schema } from 'effect'
import { nameAt, personFound } from '../names.ts'
import { makeReader, scan, type Found, type PersonName } from '../reader.ts'
import { phrasesOf } from '../words.ts'

const attendee = (person: PersonName): Found => ({
  request: { attendees: [person.slug] },
  label: `Presente: ${person.name}`,
})

export const attendeesReader = makeReader({
  field: 'attendees',
  section: 'attendees',
  vocabulary: Schema.Struct({ me: Schema.Array(Schema.String) }),
  read: (words, { me }, context) => {
    const mePhrases = phrasesOf(me)
    return Effect.succeed(
      scan(words, (i) => {
        const length = words.longest(i, mePhrases)
        if (length > 0 && context.owner)
          return { start: i, end: i + length, found: attendee(context.owner) }
        const name = nameAt(words, i, context)
        return (
          name && {
            start: i,
            end: name.end,
            found: personFound(name.people, attendee),
          }
        )
      }),
    )
  },
})
