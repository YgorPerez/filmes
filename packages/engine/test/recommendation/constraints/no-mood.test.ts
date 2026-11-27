// "nada de terror" (`noMoods`, #272): the film of a Clima turned away is
// out, by one of the Clima's genres or one of its tags with the
// `[tag_vetoes]` minimums (see the fixture's LEIAME: Dia de Feira and
// Carnaval de Rua are comedies; Dia de Feira has "suspense" 0.8 in the
// Genome, Carnaval de Rua 0.6).

import { Effect } from 'effect'
import { expect, test } from 'vite-plus/test'
import {
  constraintLabel,
  readConstraints,
  storedConstraints,
} from '../../../src/index.ts'
import { useFixture, type Fixture } from '../../fixture.ts'
import { engineRecommendation, titles } from '../support.ts'

const all = (fixture: Fixture, noMoods?: string[]) =>
  engineRecommendation(fixture, {
    attendees: ['dono'],
    count: 100,
    ...(noMoods && { noMoods }),
  })

test('removes the film of one of the Clima genres', async () => {
  const fixture = useFixture()
  expect(titles(await all(fixture))).toEqual(
    expect.arrayContaining(['Dia de Feira', 'Carnaval de Rua']),
  )

  const after = titles(await all(fixture, ['pra rir']))

  expect(after).not.toContain('Dia de Feira')
  expect(after).not.toContain('Carnaval de Rua')
})

test('removes the film of a Clima tag above the minimum only', async () => {
  const after = titles(await all(useFixture(), ['tenso']))

  expect(after).not.toContain('Dia de Feira') // suspense 0.8
  expect(after).toContain('Carnaval de Rua') // suspense 0.6
})

test('a name outside the vocabulary removes nothing and warns', async () => {
  const fixture = useFixture()
  const before = titles(await all(fixture))

  const out = await all(fixture, ['xpto'])

  expect(titles(out)).toEqual(before)
  expect(out.warnings.join(' ')).toContain("o Clima 'xpto'")
})

test('the Session stores the Climas, and it reads "nada assustador"', async () => {
  const asked = await Effect.runPromise(
    readConstraints({ noMoods: ['assustador', 'tenso', 'assustador'] }),
  )

  expect(storedConstraints(asked)).toEqual([
    { name: 'no_mood', moods: ['assustador', 'tenso'] },
  ])
  expect(
    constraintLabel({ name: 'no_mood', moods: ['assustador', 'tenso'] }),
  ).toBe('nada assustador nem tenso')
  const none = await Effect.runPromise(readConstraints({ noMoods: [] }))
  expect(none.map((c) => c.name)).not.toContain('no_mood')
})
