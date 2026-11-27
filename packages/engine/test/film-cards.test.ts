// The public card of a film (#275): what the Link da Sessão shows the
// Presentes, with no Evidence or Nota prevista.
import { expect, test } from 'vite-plus/test'
import { filmCards } from '../src/index.ts'
import { useFixture } from './fixture.ts'

test('each film’s card, in the order asked; an id out of the Catálogo is left out', async () => {
  const fixture = useFixture()

  const cards = await fixture.ok(
    filmCards(['tt9001901', 'tt0000000', 'tt9000102']),
  )

  expect(cards.map((c) => c.id)).toEqual(['tt9001901', 'tt9000102'])
  expect(cards[1]).toMatchObject({
    id: 'tt9000102',
    title: 'Maré Baixa',
    year: 2015,
  })
  for (const card of cards)
    expect(Object.keys(card).sort()).toEqual([
      'duration',
      'genres',
      'id',
      'imdbRating',
      'originalTitle',
      'poster',
      'synopsis',
      'title',
      'year',
    ])
})
