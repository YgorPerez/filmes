// `10_pessoas`: every Pessoa file of filmes-dados.

import { Effect } from 'effect'
import { loadPerson } from '../../people/facts.ts'
import { readPeople } from '../../people/people.ts'
import type { Step } from './Step.ts'

export const people: Step = {
  name: '10_pessoas',
  load: (db) =>
    Effect.flatMap(readPeople, (all) =>
      Effect.forEach(all, (person) => loadPerson(db, person), {
        discard: true,
      }),
    ),
}
