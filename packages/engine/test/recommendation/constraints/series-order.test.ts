// Série na ordem (#165): a film of a film series leaves when some Presente
// has not seen the film before it. The fixture's `tt90165NN` films (see its
// LEIAME): the Trilogia do Cais (Cais, Cais 2, Cais 3, and Cais: Origens with
// no release date), the media franchise Universo Estelar and the Díptico dos
// Lados, two films with the same date. Rosa saw Cais 2 only; Teo saw nothing.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import {
  billboardModel,
  parseYaml,
  personSeen,
  recommend,
  recommendSession,
  yamlToJson,
  type RecommendSessionRequest,
  type SessionRecommendation,
} from '../../../src/index.ts'
import { useFixture, type Fixture } from '../../fixture.ts'
import { engineRecommendation, titles } from '../support.ts'

const CAIS = 'tt9016501'
const CAIS_3 = 'tt9016503'

const SERIES_FILMS = [
  'Cais',
  'Cais 2',
  'Cais 3',
  'Cais: Origens',
  'Estelar',
  'Estelar: Retorno',
  'Lado A',
  'Lado B',
]

/** The #165 films that come for `attendees`, in the fixture's order. */
const seriesFilms = async (
  fixture: Fixture,
  attendees: string[],
  request: { seriesOrder?: 'previous' | 'all' | 'off' } = {},
): Promise<string[]> => {
  const out = await engineRecommendation(fixture, {
    attendees,
    count: 100,
    ...request,
  })
  return SERIES_FILMS.filter((t) => titles(out).includes(t))
}

describe('the default mode: the film right before', () => {
  test('whoever saw nothing gets only the first film of a film series', async () => {
    expect(await seriesFilms(useFixture(), ['teo'])).toEqual([
      'Cais',
      // No release date: neither before nor after any other.
      'Cais: Origens',
      // A media franchise does not count.
      'Estelar',
      'Estelar: Retorno',
      // The same date: neither is before the other.
      'Lado A',
      'Lado B',
    ])
  })

  test('the film right before is enough, the ones before it are not asked', async () => {
    // Rosa saw Cais 2, not Cais: Cais 3 comes and Cais 2 leaves.
    expect(await seriesFilms(useFixture(), ['rosa'])).toEqual([
      'Cais',
      'Cais 3',
      'Cais: Origens',
      'Estelar',
      'Estelar: Retorno',
      'Lado A',
      'Lado B',
    ])
  })

  test('every Presente must have seen it', async () => {
    const titles = await seriesFilms(useFixture(), ['rosa', 'teo'])

    expect(titles).not.toContain('Cais 2')
    expect(titles).not.toContain('Cais 3')
  })

  test('the answer repeats the mode and how many films it removed', async () => {
    const out = await engineRecommendation(useFixture(), {
      attendees: ['teo'],
      count: 100,
    })

    expect(out.constraints['series_order']).toEqual({
      mode: 'previous',
      removed: 2,
    })
    // The rule writes no line on the films that pass.
    for (const f of out.films)
      expect(f.filmLines.map((l) => l.text).join(' ')).not.toContain('série')
  })

  test('a Já visto recorded now counts, as any other', async () => {
    const fixture = useFixture()
    await fixture.ok(personSeen({ person: 'teo', film: CAIS }))

    expect(await seriesFilms(fixture, ['teo'])).toContain('Cais 2')
  })
})

describe('the other modes', () => {
  test('all the films before: Rosa never saw Cais', async () => {
    const fixture = useFixture()

    expect(
      await seriesFilms(fixture, ['rosa'], { seriesOrder: 'all' }),
    ).not.toContain('Cais 3')

    await fixture.ok(personSeen({ person: 'rosa', film: CAIS }))

    expect(
      await seriesFilms(fixture, ['rosa'], { seriesOrder: 'all' }),
    ).toContain('Cais 3')
  })

  test('off: every film of the series comes', async () => {
    const fixture = useFixture()

    expect(await seriesFilms(fixture, ['teo'], { seriesOrder: 'off' })).toEqual(
      SERIES_FILMS,
    )
    const out = await engineRecommendation(fixture, {
      attendees: ['teo'],
      seriesOrder: 'off',
    })
    expect(out.constraints['series_order']).toEqual({ mode: 'off', removed: 0 })
  })

  test('a mode that does not exist is invalid usage', async () => {
    const outcome = await useFixture().run(
      recommend({
        attendees: ['teo'],
        seriesOrder: 'sometimes' as 'off',
      }),
    )

    expect(outcome.exitCode).toBe(2)
    expect(outcome.output).toMatchObject({
      error: {
        message: 'série na ordem: sometimes não é um modo (previous, all, off)',
      },
    })
  })
})

const open = (
  fixture: Fixture,
  request: RecommendSessionRequest,
): Promise<SessionRecommendation> =>
  fixture.ok(recommendSession({ count: 100, ...request }))

const stored = (fixture: Fixture, id: string) => {
  const text = readFileSync(join(fixture.data, 'sessions', `${id}.md`), 'utf8')
  const front = yamlToJson(
    parseYaml(text.slice(4, text.indexOf('\n---', 4))),
  ) as { context: { constraints?: Array<Record<string, unknown>> } }
  return (front.context.constraints ?? []).filter(
    (c) => c['name'] === 'series_order',
  )
}

describe('in a Session', () => {
  test('the default mode is not stored, and the top says nothing of it', async () => {
    const fixture = useFixture()
    const session = await open(fixture, { attendees: ['rosa'] })
    const id = session.session.id

    expect(stored(fixture, id)).toEqual([])
    const model = await fixture.ok(billboardModel({ session: id }))
    expect(model.request.parts.join(' ')).not.toContain('série')
  })

  test('another mode is stored, said at the top and kept by every refazer until changed', async () => {
    const fixture = useFixture()
    const session = await open(fixture, {
      attendees: ['rosa'],
      seriesOrder: 'all',
    })
    const id = session.session.id

    expect(stored(fixture, id)).toEqual([{ name: 'series_order', mode: 'all' }])
    expect(
      (await fixture.ok(billboardModel({ session: id }))).request.parts,
    ).toContain('série na ordem: só se viram todos os anteriores')

    const redone = await open(fixture, { attendees: ['rosa'], session: id })
    expect(redone.constraints['series_order']).toMatchObject({ mode: 'all' })
    expect(stored(fixture, id)).toEqual([{ name: 'series_order', mode: 'all' }])

    const back = await open(fixture, {
      attendees: ['rosa'],
      session: id,
      seriesOrder: 'previous',
    })
    expect(back.constraints['series_order']).toMatchObject({
      mode: 'previous',
    })
    expect(stored(fixture, id)).toEqual([])
    const again = await open(fixture, { attendees: ['rosa'], session: id })
    expect(again.constraints['series_order']).toMatchObject({
      mode: 'previous',
    })
  })
})

describe('in a Session', () => {
  test('"tanto faz" is stored too, so a refazer keeps the rule off', async () => {
    const fixture = useFixture()
    const session = await open(fixture, {
      attendees: ['teo'],
      seriesOrder: 'off',
    })
    const id = session.session.id
    const redone = await open(fixture, { attendees: ['teo'], session: id })

    expect(redone.constraints['series_order']).toMatchObject({ mode: 'off' })
    expect(
      (await fixture.ok(billboardModel({ session: id }))).request.parts,
    ).toContain('série na ordem: tanto faz')
  })

  test('a kept film leaves when a new Presente did not see the one before, and the Cartaz says who', async () => {
    const fixture = useFixture()
    const session = await open(fixture, { attendees: ['dono', 'rosa'] })
    const id = session.session.id
    // The Dono saw Cais 2 too, so Cais 3 comes for both.
    await fixture.ok(personSeen({ person: 'dono', film: 'tt9016502' }))
    const both = await open(fixture, {
      attendees: ['dono', 'rosa'],
      session: id,
      swap: [session.films.map((f) => f.id).join(',')],
    })
    expect(both.films.map((f) => f.id)).toContain(CAIS_3)

    const withTeo = await open(fixture, {
      attendees: ['dono', 'rosa', 'teo'],
      session: id,
      keep: [CAIS_3],
    })

    expect(withTeo.films.map((f) => f.id)).not.toContain(CAIS_3)
    expect(withTeo.dropped?.find((d) => d.id === CAIS_3)).toMatchObject({
      cause: 'constraint',
      constraint: 'series_order',
      label: 'Teo não viu Cais 2',
      unseen: [{ people: ['teo'], films: ['Cais 2'] }],
    })
    expect(withTeo.warnings).toContain(
      'Cais 3 saiu, apesar de mantido: Teo não viu Cais 2',
    )
    const model = await fixture.ok(billboardModel({ session: id }))
    expect(
      model.dropped
        .filter((d) => d.id === CAIS_3)
        .map((d) => `${d.title} (${d.reason})`),
    ).toEqual(['Cais 3 (Teo não viu Cais 2)'])
  })
})

describe('in a Session', () => {
  test('the Dono is "você" on the Cartaz, and Presentes who missed the same films share the line', async () => {
    const fixture = useFixture()
    const session = await open(fixture, {
      attendees: ['rosa'],
      seriesOrder: 'off',
    })
    const id = session.session.id
    const cais3 = session.films.find((f) => f.id === CAIS_3)
    expect(cais3).toBeDefined()

    await open(fixture, {
      attendees: ['dono', 'rosa', 'teo'],
      session: id,
      seriesOrder: 'all',
      keep: [CAIS_3],
    })

    const model = await fixture.ok(billboardModel({ session: id }))
    expect(
      model.dropped.filter((d) => d.id === CAIS_3).map((d) => d.reason),
    ).toEqual(['você e Teo não viram Cais nem Cais 2; Rosa não viu Cais'])
  })
})
