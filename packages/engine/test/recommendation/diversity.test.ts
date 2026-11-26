// Diversidade [diversity] (#177): MMR in the final order. Each next place
// goes to the film with the best `λ·score − (1−λ)·Parecença to the films
// already above it`, with the Parecença of `--parecido` measured from the
// film above.
//
// In the fixture, Bruno's order by the Regra is As Horas Lentas (104) and
// Sal e Ferrugem (105), both 0.9734 and by Helena Prado, then Noite de
// Estreia (Otávio Lins, 0.9002), Cidade de Vidro (Helena, 0.8442), A Volta
// do Mar (Rui Tavares, 0.8176) and Vento Norte (Marta Quintal, 0.7685).
// These films have no MovieLens data, so the Parecença from a Helena film
// is the director (1) and the IMDb genres (Jaccard), weight 0.1 each: 0.5
// to Sal e Ferrugem (no genre in common), 2/3 to Cidade de Vidro (Drama of
// two genres and one); 0 to the other directors' films.

import { describe, expect, test } from 'vite-plus/test'
import {
  recommendSession,
  recordFeedback,
  type Recommendation,
  type Vars,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'
import { engineRecommendation, titles, weightsWith } from './support.ts'

/** The weights with MMR on (λ 0.8; `config/weights.toml` keeps it off
 * until the real evaluation), and each pair of `more`. */
const diverse = (
  fixture: Fixture,
  more: ReadonlyArray<readonly [string, string]> = [],
): Vars => weightsWith(fixture, 'lambda = 1.0', 'lambda = 0.8', more)

const BY_RULE = [
  'As Horas Lentas',
  'Sal e Ferrugem',
  'Noite de Estreia',
  'Cidade de Vidro',
  'A Volta do Mar',
]

describe('diversity in the final order', () => {
  test('a film like the one above it gives way to a film by another director', async () => {
    const fixture = useFixture()
    const out = await engineRecommendation(
      fixture,
      { attendees: ['dono'] },
      diverse(fixture),
    )

    // λ 0.8. Second place: Sal e Ferrugem 0.8 × 0.9734 − 0.2 × 0.5 = 0.679
    // loses to Noite de Estreia 0.8 × 0.9002 = 0.720. Third: Sal e Ferrugem
    // beats A Volta do Mar (0.654). Fourth: A Volta do Mar beats Cidade de
    // Vidro (0.675 − 0.2 × 2/3 = 0.542). Fifth: Vento Norte (0.615).
    expect(titles(out)).toEqual([
      'As Horas Lentas',
      'Noite de Estreia',
      'Sal e Ferrugem',
      'A Volta do Mar',
      'Vento Norte',
    ])
    // Positions follow the new order; the utility stays the Regra's.
    expect(out.films.map((f) => f.position)).toEqual([1, 2, 3, 4, 5])
    expect(out.films[1]?.utility).toEqual({ bruno: 0.9002 })
  })

  test('with λ 1 the order is the Regra de escolha alone', async () => {
    const fixture = useFixture()
    const out = await engineRecommendation(fixture, { attendees: ['dono'] })

    expect(titles(out)).toEqual(BY_RULE)
  })

  test('only the first places are chosen by MMR', async () => {
    const fixture = useFixture()
    const out = await engineRecommendation(
      fixture,
      { attendees: ['dono'] },
      diverse(fixture, [['depth = 10', 'depth = 2']]),
    )

    // Noite de Estreia takes the second place; the rest follow the Regra.
    expect(titles(out)).toEqual([
      'As Horas Lentas',
      'Noite de Estreia',
      'Sal e Ferrugem',
      'Cidade de Vidro',
      'A Volta do Mar',
    ])
  })

  test('MMR chooses only among the first films of the order', async () => {
    const fixture = useFixture()
    const out = await engineRecommendation(
      fixture,
      { attendees: ['dono'] },
      diverse(fixture, [['pool = 30', 'pool = 2']]),
    )

    // Only As Horas Lentas and Sal e Ferrugem compete: nothing moves.
    expect(titles(out)).toEqual(BY_RULE)
  })

  test('a kept film counts as already chosen', async () => {
    const fixture = useFixture()
    const vars = diverse(fixture)
    const opened = await fixture.ok(
      recommendSession({ attendees: ['dono'] }),
      vars,
    )
    const redone = await fixture.ok(
      recommendSession({
        attendees: ['dono'],
        session: opened.session.id,
        keep: ['tt9000104'],
      }),
      vars,
    )

    // The other four were swapped and stay out of the Session. The best
    // free film by the Regra, Cidade de Vidro (0.8 × 0.8442 = 0.675), is a
    // Helena film like the kept one: 0.675 − 0.2 × 2/3 = 0.542 puts it after
    // A Casa das Marés (0.585), Luz de Inverno and Fronteira II (0.569),
    // still ahead of Maré Cheia (0.538).
    expect(titles(redone)).toEqual([
      'As Horas Lentas',
      'A Casa das Marés',
      'Luz de Inverno',
      'Fronteira II',
      'Cidade de Vidro',
    ])
    expect(redone.kept).toEqual(['tt9000104'])
  })

  test('a film MMR moves up gets no satisfaction line', async () => {
    const fixture = useFixture()
    // As in satisfaction.test.ts: Bruno is behind in satisfaction after a
    // Session with Quim that only Quim liked; the IMDb bonus is off there.
    const noImdbBonus: ReadonlyArray<readonly [string, string]> = [
      ['\nweight = 0.3\n\n[no_sad]', '\nweight = 0.0\n\n[no_sad]'],
    ]
    const off = weightsWith(
      fixture,
      'lambda = 1.0',
      'lambda = 1.0',
      noImdbBonus,
    )
    const opened = await fixture.ok(
      recommendSession({ attendees: ['dono', 'quim'], count: 50 }),
      off,
    )
    await fixture.ok(
      recordFeedback({
        session: opened.session.id,
        film: 'Pequenos Milagres',
        ratings: ['dono=1', 'quim=5'],
      }),
    )
    const request = { attendees: ['dono', 'quim'], count: 50 }
    const withSatisfaction = (out: Recommendation) =>
      out.films
        .filter((f) => f.filmLines.some((l) => l.person === 'bruno'))
        .map((f) => f.id)
        .sort()

    const plain = await engineRecommendation(fixture, request, off)
    const diversified = await engineRecommendation(
      fixture,
      request,
      diverse(fixture, noImdbBonus),
    )

    // The same 50 films, in another order: MMR only moves the first 30.
    expect(titles(diversified)).not.toEqual(titles(plain))
    expect(titles(diversified).sort()).toEqual(titles(plain).sort())
    // The satisfaction line says weighing the satisfaction moved the film up
    // in the Regra's order, whatever MMR did after.
    expect(withSatisfaction(plain).length).toBeGreaterThan(0)
    expect(withSatisfaction(diversified)).toEqual(withSatisfaction(plain))
  })
})
