// The Cartaz by Motivo (#183): the same films, in the same order, under
// titles from each film's strongest Evidence for it. The Session file keeps
// each film's Motivo, written when the Recomendação is made, because the
// body loses the sign of each Evidence.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import {
  billboardModel,
  filmReason,
  parseYaml,
  recommendSession,
  yamlToJson,
  type Billboard,
  type Kind,
  type RecommendSessionRequest,
  type SessionRecommendation,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'
import { weightsWith } from '../recommendation/support.ts'

/** Bruno's taste neighbours on (k 3, 5 films shared): Pequenos Milagres is
 * the Aposta (#178). */
const tasteOn = (fixture: Fixture) =>
  weightsWith(fixture, 'k = 50\nmin_shared = 10', 'k = 3\nmin_shared = 5')

const recommend = (
  fixture: Fixture,
  request: RecommendSessionRequest,
): Promise<SessionRecommendation> =>
  fixture.ok(recommendSession(request), tasteOn(fixture))

const sessionFile = (fixture: Fixture, id: string) =>
  join(fixture.data, 'sessions', `${id}.md`)

const front = (fixture: Fixture, id: string) => {
  const text = readFileSync(sessionFile(fixture, id), 'utf8')
  return yamlToJson(
    parseYaml(text.slice(4, text.indexOf('\n---', 4))),
  ) as Record<string, any>
}

/** Rewrites the `reason` of each recommended film with `change`. */
const editReasons = (
  fixture: Fixture,
  id: string,
  change: (reason: unknown, index: number) => string | null,
) => {
  const file = sessionFile(fixture, id)
  let index = 0
  const text = readFileSync(file, 'utf8').replace(
    /\n {2}reason:(?: null|(?:\n {4}.*)+)/gu,
    (match) => {
      const replacement = change(match, index++)
      return replacement === null ? '' : `\n  reason: ${replacement}`
    },
  )
  writeFileSync(file, text)
}

const sections = (model: Billboard) =>
  model.sections.map((s) => [
    s.title,
    s.again,
    s.films.map((id) => model.films.find((f) => f.id === id)?.position),
  ])

describe('the Motivo of each film, in the Session file', () => {
  test('is the strongest Evidence for it, with who shares it', async () => {
    const fixture = useFixture()
    const session = await recommend(fixture, { attendees: ['dono', 'iara'] })

    const reasons = front(fixture, session.session.id)['recommendation'].map(
      (r: any) => r.reason,
    )

    expect(reasons).toEqual([
      { kind: 'entity', name: 'Rui Tavares', people: ['bruno', 'iara'] },
      {
        kind: 'entity',
        name: 'Trilogia da Fronteira',
        people: ['bruno', 'iara'],
      },
      { kind: 'film', name: 'Fronteira (2008)', people: ['bruno', 'iara'] },
      {
        kind: 'film',
        name: 'O Farol de Areia (2012)',
        people: ['bruno', 'iara'],
      },
      { kind: 'taste', people: ['bruno'] },
    ])
  })

  test('Evidence against the film is never its Motivo', () => {
    expect(
      filmReason({
        bruno: [
          {
            text: 'disse "odeio a Helena Prado"; dirigido por Helena Prado',
            kind: 'stated',
            contribution: -1.5,
          },
          { text: 'já viu', kind: 'rating', contribution: -1 },
          {
            text: '3 pessoas de gosto parecido deram 2,1 em média a este',
            kind: 'review',
            contribution: -0.4,
          },
          {
            text: 'disse "adoro faroeste"; do gênero faroeste',
            kind: 'stated',
            contribution: 0.3,
          },
        ],
        iara: [{ text: 'sem fato', kind: 'guess', contribution: 0 }],
      }),
    ).toEqual({ kind: 'entity', name: 'faroeste', people: ['bruno'] })
  })

  test('a film with nothing for it has none', () => {
    expect(
      filmReason({
        teo: [{ text: 'sem fato', kind: 'guess', contribution: 0 }],
        bruno: [{ text: 'já viu', kind: 'rating', contribution: -1 }],
      }),
    ).toBeNull()
  })

  test('each path reads as its Motivo', () => {
    const one = (text: string, kind: Kind = 'review') =>
      filmReason({ bruno: [{ text, kind, contribution: 0.5 }] })

    expect([
      one(
        'com Davi Couto no elenco, como 1 filme a que deu Nota alta: X (2001)',
        'metadata',
      ),
      one(
        'escrito por Ana Ruiz, como 2 filmes a que deu Nota alta: X (2001) e Y, Z (2002)',
        'metadata',
      ),
      one(
        'disse que ama Fronteira, Parte 1 (2008), também com Davi Couto',
        'stated',
      ),
      one(
        'segundo o Dono, ama X (2001), também escrito por Ana Ruiz',
        'report',
      ),
      one('segundo o Dono, "ama a Rita"; com Rita Lobo no elenco', 'report'),
      one('disse "curte filme de júri"; tema: tribunal', 'stated'),
      one(
        'disse que ama Rio, Abaixo (2014), e de 1.200 pessoas que deram 4+ a ele, 65% deram 4+ a este',
      ),
      one('1.023 pessoas de gosto parecido deram 4,3 em média a este'),
      one('nota 8,5 no IMDb', 'metadata'),
    ]).toEqual([
      { kind: 'entity', name: 'Davi Couto', people: ['bruno'] },
      { kind: 'entity', name: 'Ana Ruiz', people: ['bruno'] },
      { kind: 'entity', name: 'Davi Couto', people: ['bruno'] },
      { kind: 'entity', name: 'Ana Ruiz', people: ['bruno'] },
      { kind: 'entity', name: 'Rita Lobo', people: ['bruno'] },
      { kind: 'entity', name: 'tribunal', people: ['bruno'] },
      { kind: 'film', name: 'Rio, Abaixo (2014)', people: ['bruno'] },
      { kind: 'taste', people: ['bruno'] },
      null,
    ])
  })

  test('on a tie the first Presente’s wins, and everyone with it shares it', () => {
    expect(
      filmReason({
        bruno: [
          {
            text: 'deu 5 a X (2001), também de Otávio Lins',
            kind: 'rating',
            contribution: 0.6,
          },
        ],
        iara: [
          {
            text: 'deu 5 a Y (2002), também de Helena Prado',
            kind: 'rating',
            contribution: 0.6,
          },
          {
            text: 'dirigido por Otávio Lins, como 1 filme a que deu Nota alta: X (2001)',
            kind: 'metadata',
            contribution: 0.3,
          },
        ],
      }),
    ).toEqual({
      kind: 'entity',
      name: 'Otávio Lins',
      people: ['bruno', 'iara'],
    })
  })
})

describe('the Cartaz by Motivo', () => {
  test('each film under the title of its Motivo, naming who has it; the Aposta has its own', async () => {
    const fixture = useFixture()
    const session = await recommend(fixture, { attendees: ['dono', 'iara'] })

    const model = await fixture.ok(
      billboardModel({ session: session.session.id }),
    )

    expect(sections(model)).toEqual([
      ['Porque você e Iara gostam de Rui Tavares', false, [1]],
      ['Porque você e Iara gostam de Trilogia da Fronteira', false, [2]],
      ['Porque você e Iara gostaram de Fronteira (2008)', false, [3]],
      ['Porque você e Iara gostaram de O Farol de Areia (2012)', false, [4]],
      ['Aposta', false, [5]],
    ])
    expect(model.sections.map((s) => s.kind)).toEqual([
      'entity',
      'entity',
      'film',
      'film',
      'bet',
    ])
  })

  test('order and size stay: a Motivo that comes back after another opens a section again', async () => {
    const fixture = useFixture()
    const session = await recommend(fixture, { attendees: ['dono'] })

    const model = await fixture.ok(
      billboardModel({ session: session.session.id }),
    )

    expect(sections(model)).toEqual([
      ['Porque você gosta de Helena Prado', false, [1, 2]],
      ['Porque você gosta de Otávio Lins', false, [3]],
      ['Porque você gosta de Helena Prado', true, [4]],
      ['Aposta', false, [5]],
    ])
    expect(model.sections.flatMap((s) => s.films)).toEqual(
      model.films.map((f) => f.id),
    )
  })

  test('the shown films are grouped in the order the Dono sees them', async () => {
    const fixture = useFixture()
    const session = await recommend(fixture, { attendees: ['dono'] })
    const [first, , third, fourth] = session.films

    const model = await fixture.ok(
      billboardModel({
        session: session.session.id,
        shown: [fourth!.id, first!.id, third!.id],
      }),
    )

    expect(sections(model)).toEqual([
      ['Porque você gosta de Helena Prado', false, [1, 2]],
      ['Porque você gosta de Otávio Lins', false, [3]],
    ])
  })

  test('the title names who shares the Motivo, and a film with none is among the other choices', async () => {
    const fixture = useFixture()
    const session = await recommend(fixture, { attendees: ['dono', 'iara'] })
    const id = session.session.id
    editReasons(
      fixture,
      id,
      (_, i) =>
        [
          '{kind: entity, name: Rui Tavares, people: [iara]}',
          '{kind: film, name: Fronteira (2008), people: [bruno]}',
          '{kind: taste, people: [iara, bruno]}',
          'null',
          null,
        ][i] ?? null,
    )

    const model = await fixture.ok(billboardModel({ session: id }))

    expect(sections(model)).toEqual([
      ['Porque Iara gosta de Rui Tavares', false, [1]],
      ['Porque você gostou de Fronteira (2008)', false, [2]],
      ['Gente de gosto parecido com você e Iara gostou', false, [3]],
      ['Outras escolhas', false, [4]],
      ['Aposta', false, [5]],
    ])
  })

  test('neighbours share a title with everyone who has the Motivo on any of them', async () => {
    const fixture = useFixture()
    const session = await recommend(fixture, { attendees: ['dono', 'iara'] })
    const id = session.session.id
    editReasons(
      fixture,
      id,
      (_, i) =>
        [
          '{kind: entity, name: Rui Tavares, people: [iara]}',
          '{kind: entity, name: Rui Tavares, people: [bruno]}',
        ][i] ?? 'null',
    )

    const model = await fixture.ok(billboardModel({ session: id }))

    expect(sections(model)[0]).toEqual([
      'Porque você e Iara gostam de Rui Tavares',
      false,
      [1, 2],
    ])
  })

  test('a Session from before #183, with no Motivo stored, has no sections', async () => {
    const fixture = useFixture()
    const session = await recommend(fixture, { attendees: ['dono'] })
    const id = session.session.id
    editReasons(fixture, id, () => null)

    const model = await fixture.ok(billboardModel({ session: id }))

    expect(model.films).toHaveLength(5)
    expect(model.sections).toEqual([])
  })
})
