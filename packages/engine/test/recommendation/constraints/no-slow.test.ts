// `tests/test_sem_lento.py`: "nada lento" (`noSlow`, #57) removes the film
// with a tag of the `slow` group of `tag_vetoes.toml` (see the fixture's
// LEIAME). What the Session stores is the stored form (the Session is
// ported apart).

import { Effect } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import {
  constraintLabel,
  personVeto,
  readConstraints,
  storedConstraints,
} from '../../../src/index.ts'
import { useFixture, type Fixture } from '../../fixture.ts'
import {
  expectRecordedRecommendation,
  engineRecommendation,
  titles,
} from '../support.ts'

const all = (fixture: Fixture, noSlow = false) =>
  engineRecommendation(fixture, {
    attendees: ['dono'],
    count: 100,
    ...(noSlow && { noSlow }),
  })

test('removes the film with a pace tag, of any genre', async () => {
  const fixture = useFixture()
  expect(titles(await all(fixture))).toEqual(
    expect.arrayContaining(['Piada Pronta', 'Riso Contido', 'Drama Juvenil']),
  )

  const out = await all(fixture, true)

  const after = titles(out)
  expect(after).not.toContain('Piada Pronta') // boring, 10 users
  expect(after).not.toContain('Drama Juvenil') // boring 0.8 in the Genome, a drama
  expect(after).toContain('Riso Contido') // boring by 9 users, below the minimum
  expect(after).not.toContain('Silêncio no Lago') // slow 0.9 in the Genome
  expect(out.constraints['no_slow']).toEqual({ removed: 3 })
})

test('the Session stores the request, and it reads "nada lento"', async () => {
  const asked = await Effect.runPromise(readConstraints({ noSlow: true }))

  expect(storedConstraints(asked)).toEqual([{ name: 'no_slow' }])
  expect(constraintLabel({ name: 'no_slow' })).toBe('nada lento')
})

describe('the whole output, as recorded', () => {
  test('slow is also a group for a Veto', async () => {
    const fixture = useFixture()
    await fixture.ok(
      personVeto({
        person: 'bruno',
        text: 'não aguenta filme lento',
        target: 'slow',
        group: true,
      }),
    )

    expect(titles(await all(fixture))).not.toContain('Drama Juvenil')
  })

  test('nothing slow', async () => {
    await expectRecordedRecommendation(useFixture(), {
      attendees: ['dono'],
      count: 100,
      noSlow: true,
    })
  })
})
