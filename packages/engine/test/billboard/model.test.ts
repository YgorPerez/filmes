// The Cartaz as data (#97): tests/test_cartaz_mostrados.py, and the parts of
// test_cartaz.py, test_cartaz_responde.py, test_regerar_mantidos.py and
// test_parecido_na_sessao.py that check what the page says rather than its
// HTML (the HTML checks are the React Cartaz's, #114).

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import {
  answerBillboard,
  billboard,
  billboardModel,
  billboardPeople,
  parseYaml,
  personSeen,
  personVeto,
  recommendSession,
  readSession,
  recordFeedback,
  sessionBody,
  votesText,
  writeSession,
  yamlToJson,
  type RecommendSessionRequest,
  type SessionRecommendation,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'
import { tasteWeights } from '../recommendation/support.ts'
import { RECORDINGS } from '../sources/support.ts'

const recommend = (
  fixture: Fixture,
  request: RecommendSessionRequest,
): Promise<SessionRecommendation> => fixture.ok(recommendSession(request))

const front = (fixture: Fixture, id: string) => {
  const text = readFileSync(join(fixture.data, 'sessions', `${id}.md`), 'utf8')
  return yamlToJson(
    parseYaml(text.slice(4, text.indexOf('\n---', 4))),
  ) as Record<string, any>
}

describe('cartaz --filmes (test_cartaz_mostrados)', () => {
  test('with films it has only those, in the given order', async () => {
    const fixture = useFixture()
    const session = await recommend(fixture, { attendees: ['dono', 'iara'] })
    const [fourth, second] = [session.films[3]!, session.films[1]!]

    const out = await fixture.ok(
      billboard({ session: session.session.id, shown: [fourth.id, second.id] }),
    )

    expect(out.films).toBe(2)
    expect(out.billboard.films.map((f) => [f.position, f.id])).toEqual([
      [1, fourth.id],
      [2, second.id],
    ])
  })

  test('the Session keeps the shown films and the Feedback the chosen one’s position in them', async () => {
    const fixture = useFixture()
    const session = await recommend(fixture, { attendees: ['dono', 'iara'] })
    const id = session.session.id
    const [fourth, second] = [session.films[3]!, session.films[1]!]
    await fixture.ok(billboard({ session: id, shown: [fourth.id, second.id] }))

    expect(front(fixture, id)['shown']).toEqual([
      { position: 1, id: fourth.id, title: fourth.title },
      { position: 2, id: second.id, title: second.title },
    ])

    const out = await fixture.ok(
      recordFeedback({ session: id, film: fourth.id, ratings: ['dono=4'] }),
    )

    expect([out.chosen?.position, out.chosen?.shownPosition]).toEqual([4, 1])
    const top = front(fixture, id)
    expect([top['chosen_in_recommendation'], top['chosen_in_shown']]).toEqual([
      4, 1,
    ])
  })
})

describe('cartaz --filmes (test_cartaz_mostrados)', () => {
  test('a film outside the Recomendação, or repeated, is invalid_usage and the Session stays', async () => {
    const fixture = useFixture()
    const session = await recommend(fixture, {
      attendees: ['dono', 'iara'],
      count: 3,
    })
    const id = session.session.id
    const first = session.films[0]!.id
    const file = join(fixture.data, 'sessions', `${id}.md`)
    const before = readFileSync(file, 'utf8')

    for (const shown of [[first, 'tt9000701'], [first, first], []]) {
      const outcome = await fixture.run(billboard({ session: id, shown }))
      expect(outcome.exitCode).toBe(2)
      expect(outcome.output).toMatchObject({ error: { code: 'invalid_usage' } })
    }
    expect(readFileSync(file, 'utf8')).toBe(before)
  })

  test('a refazer takes the shown films to the earlier version and the new one starts without', async () => {
    const fixture = useFixture()
    const session = await recommend(fixture, {
      attendees: ['dono', 'iara'],
      request: 'algo bom',
    })
    const first = session.films[0]!
    await fixture.ok(
      billboard({ session: '2026-11-20-iara', shown: [first.id] }),
    )

    await recommend(fixture, {
      attendees: ['dono', 'iara'],
      request: 'algo curto',
      maxDuration: 100,
      session: '2026-11-20-iara',
    })

    const top = front(fixture, '2026-11-20-iara')
    expect(top['shown']).toBeUndefined()
    expect(top['versions'][0]['shown']).toEqual([
      { position: 1, id: first.id, title: first.title },
    ])
  })
})

describe('cartaz --filmes (test_cartaz_mostrados)', () => {
  test('a closed Session is shown but its shown films stay as they were', async () => {
    const fixture = useFixture()
    const session = await recommend(fixture, { attendees: ['dono'] })
    const id = session.session.id
    await fixture.ok(recordFeedback({ session: id, film: null }))

    const out = await fixture.ok(
      billboard({ session: id, shown: [session.films[1]!.id] }),
    )

    expect(out.billboard.open).toBe(false)
    expect(front(fixture, id)['shown']).toBeUndefined()
  })
})

describe('the Cartaz model', () => {
  test('one card per film in the Session’s order, version 1, nothing new or dropped', async () => {
    const fixture = useFixture()
    const session = await recommend(fixture, { attendees: ['dono', 'iara'] })

    const model = await fixture.ok(
      billboardModel({ session: session.session.id }),
    )

    expect(model.version).toBe(1)
    expect(model.title).toBe('Recomendação de 2026-11-20')
    expect(model.films.map((f) => [f.position, f.title])).toEqual(
      session.films.map((f) => [f.position, f.title]),
    )
    expect(model.films.some((f) => f.new)).toBe(false)
    expect(model.dropped).toEqual([])
    expect(
      model.attendees.map((p) => [p.slug, p.label, p.initial, p.color]),
    ).toEqual([
      ['bruno', 'Você', 'B', 1],
      ['iara', 'Iara', 'I', 2],
    ])
  })

  test('each Presente’s strongest Fato is a line, shared lines grouped, who has none apart', async () => {
    const fixture = useFixture()
    const session = await recommend(fixture, {
      attendees: ['dono', 'iara', 'teo'],
      count: 20,
    })

    const model = await fixture.ok(
      billboardModel({ session: session.session.id }),
    )

    const order = { strong: 0, moderate: 1, weak: 2 }
    for (const [i, card] of model.films.entries()) {
      const film = session.films[i]!
      expect(card.withoutFact).toEqual(film.coverage.withoutFact)
      expect(card.coverage).toBe(
        `Fato sobre ${film.coverage.withFact} de ${film.coverage.attendees}`,
      )
      for (const [person, evidence] of Object.entries(film.evidence)) {
        const strongest = evidence.find((e) => e.kind !== 'guess')
        if (strongest === undefined) continue
        const line = card.lines.find((l) => l.people.includes(person))
        expect(line?.text).toBe(strongest.text)
      }
      const people = card.lines.flatMap((l) => l.people)
      expect(new Set(people).size).toBe(people.length)
      const strengths = card.lines.map((l) => order[l.strength])
      expect(strengths).toEqual([...strengths].sort((a, b) => a - b))
    }
  })
})

describe('the Cartaz model', () => {
  test('Presentes with the same strongest Evidence share one line', async () => {
    const fixture = useFixture()
    const session = await recommend(fixture, { attendees: ['dono', 'iara'] })
    const id = session.session.id
    // Iara's Evidence on the first film becomes the same as Bruno's.
    const films = session.films.map((f, i) =>
      i === 0
        ? { ...f, evidence: { ...f.evidence, iara: f.evidence['bruno'] ?? [] } }
        : f,
    )
    await fixture.ok(
      Effect.gen(function* () {
        const { frontmatter } = yield* readSession(id)
        yield* writeSession(
          id,
          frontmatter,
          sessionBody(
            films,
            new Map([
              ['bruno', 'Bruno'],
              ['iara', 'Iara'],
            ]),
          ),
        )
      }),
    )

    const [card] = (await fixture.ok(billboardModel({ session: id }))).films

    const strongest = session.films[0]!.evidence['bruno']!.find(
      (e) => e.kind !== 'guess',
    )!
    expect(card!.lines).toEqual([
      {
        people: ['bruno', 'iara'],
        strength: strongest.strength,
        text: strongest.text,
        source: strongest.source || null,
      },
    ])
  })
})

describe('the Cartaz model', () => {
  test('the top reads the request', async () => {
    const fixture = useFixture()
    const session = await recommend(fixture, {
      attendees: ['dono', 'iara'],
      maxDuration: 125,
      moods: ['leve'],
      unseen: true,
      request: 'algo leve pra hoje',
    })

    const { request } = await fixture.ok(
      billboardModel({ session: session.session.id }),
    )

    expect(request.speech).toBe('algo leve pra hoje')
    expect([request.who, ...request.parts].join(' · ')).toContain(
      'Vocês dois · até 2h05 · nota 7+ no IMDb · leve · nada repetido',
    )
    expect(request.unseen).toBe(true)
  })

  test('a refazer keeps the Dono’s words and the label leaves out the Restrição it turns on by itself', async () => {
    const fixture = useFixture()
    const first = await recommend(fixture, {
      attendees: ['dono', 'iara'],
      request: 'algo leve pra hoje',
    })
    const id = first.session.id
    await recommend(fixture, {
      attendees: ['dono', 'iara'],
      session: id,
      swap: [first.films[0]!.id],
      keep: first.films.slice(1).map((f) => f.id),
    })

    const { request, version } = await fixture.ok(
      billboardModel({ session: id }),
    )

    expect(version).toBe(2)
    expect(front(fixture, id)['context']['constraints']).toContainEqual({
      name: 'out_of_session',
    })
    expect(request.speech).toBe('algo leve pra hoje')
    expect(request.parts.join(' · ')).not.toContain('nesta Sessão')
  })

  test('the Cartaz has the version’s Climas and the whole vocabulary for the chips', async () => {
    const fixture = useFixture()
    const session = await recommend(fixture, {
      attendees: ['dono'],
      moods: ['Tenso', 'leve'],
    })

    const model = await fixture.ok(
      billboardModel({ session: session.session.id }),
    )

    expect(model.moods).toEqual(['tenso', 'leve'])
    expect(model.moodChoices).toEqual([
      'leve',
      'pra rir',
      'tenso',
      'romântico',
      'pra chorar',
      'pra pensar',
      'assustador',
      'ação',
      'sombrio',
    ])
  })
})

describe('the Cartaz model', () => {
  test('what another Clima took off reads so', async () => {
    const fixture = useFixture()
    const first = await recommend(fixture, { attendees: ['iara'], count: 10 })
    const id = first.session.id
    await recommend(fixture, {
      attendees: ['iara'],
      count: 10,
      session: id,
      moods: ['leve'],
    })

    const model = await fixture.ok(billboardModel({ session: id }))

    expect(new Set(model.dropped.map((s) => s.reason))).toEqual(
      new Set(['outro Clima']),
    )
  })

  test('the card header has the w500 poster, rating, Portuguese title and synopsis', async () => {
    const fixture = useFixture()
    const session = await recommend(fixture, { attendees: ['dono'] })
    const tmdb = { FILMES_TMDB_CHAVE: 'x', FILMES_GRAVACOES: RECORDINGS }

    const out = await fixture.ok(
      billboard({ session: session.session.id }),
      tmdb,
    )

    const card = (title: string) =>
      out.billboard.films.find((f) => f.title.includes(title))!
    const hours = card('As Horas Lentas')
    expect(hours.poster).toBe(
      'https://image.tmdb.org/t/p/w500/hOrAsLeNtAs9104.jpg',
    )
    expect(hours.imdbRatingText).toBe('7,4')
    expect(hours.synopsis).toBe(
      'Numa cidade do interior, uma relojoeira percebe que os relógios da casa atrasam um minuto por noite.',
    )
    expect(hours.imdbUrl).toBe('https://www.imdb.com/title/tt9000104/')
    const salt = card('Sal & Ferrugem')
    expect([salt.title, salt.originalTitle, salt.poster]).toEqual([
      'Sal & Ferrugem',
      'Sal e Ferrugem',
      null,
    ])
    expect(out.warnings).toEqual([])
  })
})

describe('the trailer (#289)', () => {
  test('each card links the official YouTube trailer, pt-BR first, then English', async () => {
    const fixture = useFixture()
    const session = await recommend(fixture, { attendees: ['dono'] })
    const tmdb = { FILMES_TMDB_CHAVE: 'x', FILMES_GRAVACOES: RECORDINGS }

    const out = await fixture.ok(
      billboard({ session: session.session.id }),
      tmdb,
    )

    const trailers = new Map(out.billboard.films.map((f) => [f.id, f.trailer]))
    expect(trailers.get('tt9000104')).toBe(
      'https://www.youtube.com/watch?v=hOrAsPtBr01',
    )
    expect(trailers.get('tt9000105')).toBe(
      'https://www.youtube.com/watch?v=sAlTrUsTeN1',
    )
    const others = out.billboard.films.filter(
      (f) => f.id !== 'tt9000104' && f.id !== 'tt9000105',
    )
    expect(others.length).toBeGreaterThan(0)
    for (const film of others) expect(film).not.toHaveProperty('trailer')
    expect(out.warnings).toEqual([])
  })

  test('without TMDB, no card has a trailer', async () => {
    const fixture = useFixture()
    const session = await recommend(fixture, { attendees: ['dono'] })

    const out = await fixture.ok(billboard({ session: session.session.id }))

    for (const film of out.billboard.films)
      expect(film).not.toHaveProperty('trailer')
  })
})

describe('the Cartaz model', () => {
  test('a redone version has the new mark and what left and why', async () => {
    const fixture = useFixture()
    const first = await recommend(fixture, { attendees: ['dono', 'iara'] })
    const id = first.session.id
    const f = first.films
    await fixture.ok(
      personSeen({ person: 'dono', film: f[1]!.id, rating: '8/10' }),
    )
    const redone = await recommend(fixture, {
      attendees: ['dono', 'iara'],
      session: id,
      keep: [`${f[0]!.id},${f[2]!.id}`],
    })

    const model = await fixture.ok(billboardModel({ session: id }))

    expect(model.version).toBe(2)
    expect(model.films.map((g) => [g.id, g.new])).toEqual(
      redone.films.map((g) => [g.id, g.new ?? false]),
    )
    expect(
      model.dropped.map((s) => `${s.position} ${s.title} (${s.reason})`),
    ).toEqual([
      `2 ${f[1]!.title} (você já viu)`,
      `4 ${f[3]!.title} (trocado)`,
      `5 ${f[4]!.title} (trocado)`,
    ])
  })

  test('leaving by a Restrição or a Veto says which', async () => {
    const fixture = useFixture()
    const first = await recommend(fixture, { attendees: ['dono'] })
    const id = first.session.id
    const f = first.films
    await fixture.ok(
      personVeto({ person: 'dono', text: 'não vejo esse', target: f[0]!.id }),
    )
    await recommend(fixture, {
      attendees: ['dono'],
      session: id,
      maxDuration: 110,
      keep: [f.map((g) => g.id).join(',')],
    })

    const reasons = (
      await fixture.ok(billboardModel({ session: id }))
    ).dropped.map((s) => `${s.position} ${s.title} (${s.reason})`)

    expect(reasons).toContain(`1 ${f[0]!.title} (seu Veto: “não vejo esse”)`)
    expect(reasons).toContain(`2 ${f[1]!.title} (até 1h50)`)
  })
})

describe('the Cartaz model', () => {
  test('the top says the references while the similar holds', async () => {
    const fixture = useFixture()
    const first = await recommend(fixture, {
      attendees: ['dono'],
      similar: ['tt9006701', 'tt9006702'],
    })
    const id = first.session.id

    await recommend(fixture, { attendees: ['dono'], session: id })
    const withFilter = await fixture.ok(billboardModel({ session: id }))
    await recommend(fixture, {
      attendees: ['dono'],
      session: id,
      noSimilar: true,
    })
    const without = await fixture.ok(billboardModel({ session: id }))

    expect(withFilter.request.parts).toContain(
      'parecidos com Escrever Cartas e Estrada Afora',
    )
    expect(without.request.parts.join(' ')).not.toContain('parecido')
  })

  test('the top names the Regra, and one Presente is "Você"', async () => {
    const fixture = useFixture()
    const average = await recommend(fixture, {
      attendees: ['dono', 'iara'],
      rule: 'average',
    })
    const by = await recommend(fixture, {
      attendees: ['dono', 'iara'],
      rule: 'by',
      by: 'iara',
    })
    const alone = await recommend(fixture, { attendees: ['dono'] })

    const top = async (id: string) =>
      (await fixture.ok(billboardModel({ session: id }))).request

    expect((await top(average.session.id)).parts).toContain('pela média')
    expect((await top(by.session.id)).parts).toContain('pelo gosto de Iara')
    expect(await top(alone.session.id)).toMatchObject({
      who: 'Você',
      speech: null,
    })
  })
})

describe('the Cartaz model', () => {
  test('another Presente’s Veto and a Já visto of two read by name', async () => {
    const fixture = useFixture()
    const first = await recommend(fixture, {
      attendees: ['dono', 'iara', 'teo'],
    })
    const id = first.session.id
    const f = first.films
    await fixture.ok(
      personVeto({ person: 'iara', text: 'não gosto', target: f[0]!.id }),
    )
    await fixture.ok(
      answerBillboard({
        session: id,
        text: `#cartaz ${id} v1\n2 ${f[1]!.id} · já vi: iara, teo\n`,
      }),
    )
    await recommend(fixture, {
      attendees: ['dono', 'iara', 'teo'],
      session: id,
      keep: [
        f
          .filter((g) => g.id !== f[1]!.id)
          .map((g) => g.id)
          .join(','),
      ],
    })

    const reasons = (
      await fixture.ok(billboardModel({ session: id }))
    ).dropped.map((s) => s.reason)

    expect(reasons).toEqual([
      'Veto de Iara: “não gosto”',
      'Iara e Teo já viram',
    ])
  })
})

describe('the Cartaz model', () => {
  test('a film the Catálogo no longer has is invalid_data', async () => {
    const fixture = useFixture()
    const session = await recommend(fixture, { attendees: ['dono'] })
    const id = session.session.id
    await fixture.ok(
      Effect.gen(function* () {
        const { frontmatter, body } = yield* readSession(id)
        yield* writeSession(
          id,
          frontmatter,
          body.replace(session.films[0]!.id, 'tt0000001'),
        )
      }),
    )

    const outcome = await fixture.run(billboardModel({ session: id }))

    expect(outcome.output).toMatchObject({
      error: {
        code: 'invalid_data',
        message: `Sessão ${id}: tt0000001 não está no Catálogo`,
      },
    })
  })

  test('a stored Restrição that no longer exists is not on the top', async () => {
    const fixture = useFixture()
    const session = await recommend(fixture, { attendees: ['dono'] })
    const id = session.session.id
    const file = join(fixture.data, 'sessions', `${id}.md`)
    const text = readFileSync(file, 'utf8')
    expect(text).toContain('constraints: []')
    writeFileSync(
      file,
      text.replace('constraints: []', 'constraints:\n    - {name: no_repeat}'),
    )

    const { request } = await fixture.ok(billboardModel({ session: id }))

    expect(front(fixture, id)['context']['constraints']).toEqual([
      { name: 'no_repeat' },
    ])
    expect(request.parts.join(' · ')).toBe('nota 7+ no IMDb')
  })
})

describe('the Cartaz model', () => {
  test('a Session written by hand with no context reads as an empty request', async () => {
    const fixture = useFixture()
    const session = await recommend(fixture, { attendees: ['dono'] })
    const id = session.session.id
    await fixture.ok(
      Effect.gen(function* () {
        const { frontmatter, body } = yield* readSession(id)
        const top = new Map(frontmatter)
        top.delete('context')
        yield* writeSession(id, top, body)
      }),
    )

    const { request } = await fixture.ok(billboardModel({ session: id }))

    expect(request).toEqual({
      speech: null,
      additions: [],
      who: 'Você',
      parts: ['nota 7+ no IMDb'],
      unseen: false,
    })
  })

  test('an unknown Session is unknown_session', async () => {
    const outcome = await useFixture().run(
      billboardModel({ session: 'nao-existe' }),
    )

    expect(outcome.exitCode).toBe(1)
    expect(outcome.output).toMatchObject({ error: { code: 'unknown_session' } })
  })

  test('initials are the shortest start no other Presente shares', () => {
    const people = billboardPeople(
      ['leo', 'lopo', 'ana'],
      new Map([
        ['leo', 'Léo'],
        ['lopo', 'Lopo'],
      ]),
      'ana',
    )

    expect(people.map((p) => [p.initial, p.label, p.color])).toEqual([
      ['Lé', 'Léo', 1],
      ['Lo', 'Lopo', 2],
      ['A', 'Você', 3],
    ])
  })
})

describe('the Cartaz model', () => {
  test('votes read as the page writes them, rounding half to even', () => {
    expect([870, 2_500, 3_500, 1_250_000, 1_350_000].map(votesText)).toEqual([
      '870',
      '2 mil',
      '4 mil',
      '1,2 mi',
      '1,4 mi',
    ])
  })
})

// Bruno's taste neighbours in the fixture's sample (#174) rated Pequenos
// Milagres; Teo has none. With k = 3 and min_shared = 5 the prediction for
// Bruno is 8,31, an 8,84 calibrated to his Notas
// (test/recommendation/bet.test.ts).
describe('the predicted rating (#175)', () => {
  const pequenosMilagres = async (fixture: Fixture) => {
    const session = await fixture.ok(
      recommendSession({ attendees: ['bruno', 'teo'], count: 50 }),
      tasteWeights(fixture, 3, 5),
    )
    const id = session.session.id
    return {
      id,
      film: session.films.find((f) => f.title === 'Pequenos Milagres')!,
    }
  }

  test('each Presente with a prediction has it on the 1 to 10 scale; one without has none', async () => {
    const fixture = useFixture()
    const { id, film } = await pequenosMilagres(fixture)

    const model = await fixture.ok(
      billboardModel({ session: id }),
      tasteWeights(fixture, 3, 5),
    )

    const card = model.films.find((f) => f.id === film.id)
    expect(card?.predictedRatings).toEqual([
      { person: 'bruno', value: 8.84, text: '8,8', raters: 3 },
    ])
  })

  test('stays what the Session recorded when the neighbours change', async () => {
    const fixture = useFixture()
    const { id, film } = await pequenosMilagres(fixture)

    // With the default minimum of 10 shared films Bruno has no neighbour
    // now; the version the Dono saw keeps its prediction.
    const model = await fixture.ok(billboardModel({ session: id }))

    expect(model.films.find((f) => f.id === film.id)?.predictedRatings).toEqual(
      [{ person: 'bruno', value: 8.84, text: '8,8', raters: 3 }],
    )
  })

  test('a prediction stored without its raters still shows, without them', async () => {
    const fixture = useFixture()
    const { id, film } = await pequenosMilagres(fixture)
    const file = join(fixture.data, 'sessions', `${id}.md`)
    const text = readFileSync(file, 'utf8')
    const stored = 'bruno: {value: 8.84, raters: 3, deviation: '
    expect(text).toContain(stored)
    writeFileSync(
      file,
      text.replaceAll(stored, 'bruno: {value: 8.84, deviation: '),
    )

    const model = await fixture.ok(billboardModel({ session: id }))

    expect(model.films.find((f) => f.id === film.id)?.predictedRatings).toEqual(
      [{ person: 'bruno', value: 8.84, text: '8,8' }],
    )
  })

  test('a film nobody has a prediction for has none', async () => {
    const fixture = useFixture()
    const session = await recommend(fixture, { attendees: ['dono', 'iara'] })

    const model = await fixture.ok(
      billboardModel({ session: session.session.id }),
    )

    expect(model.films.map((f) => f.predictedRatings)).toEqual(
      model.films.map(() => []),
    )
  })
})

// A Session with Feedback (#264): on the chosen film, each Presente's
// Nota prevista as the version stored it, next to her Reação.
describe('the closed Cartaz (#264)', () => {
  const closed = async (
    fixture: Fixture,
    feedback: { ratings?: string[]; reports?: string[]; comments?: string[] },
  ) => {
    const session = await fixture.ok(
      recommendSession({ attendees: ['bruno', 'teo'], count: 50 }),
      tasteWeights(fixture, 3, 5),
    )
    const id = session.session.id
    const film = session.films.find((f) => f.title === 'Pequenos Milagres')!
    await fixture.ok(
      recordFeedback({ session: id, film: film.id, ...feedback }),
    )
    return { id, film }
  }

  test('the chosen film has the stored Nota prevista next to each Reação', async () => {
    const fixture = useFixture()
    const { id, film } = await closed(fixture, {
      ratings: ['bruno=3'],
      reports: ['teo=gostou'],
      comments: ['teo=dormiu no meio'],
    })

    // With the default minimum of 10 shared films Bruno has no neighbour
    // now: the 8,8 is the one the version stored.
    const model = await fixture.ok(billboardModel({ session: id }))

    const chosen = model.films.find((f) => f.id === film.id)
    expect(chosen?.reactions).toEqual([
      {
        person: 'bruno',
        predicted: '8,8',
        rating: '6',
        reaction: null,
        comment: null,
      },
      {
        person: 'teo',
        predicted: null,
        rating: null,
        reaction: 'liked',
        comment: 'dormiu no meio',
      },
    ])
    expect(
      model.films.filter((f) => f.reactions !== undefined).map((f) => f.id),
    ).toEqual([film.id])
  })

  test('a Presente with neither a Nota prevista nor a Reação is left out', async () => {
    const fixture = useFixture()
    const { id, film } = await closed(fixture, {})

    const model = await fixture.ok(billboardModel({ session: id }))

    expect(model.films.find((f) => f.id === film.id)?.reactions).toEqual([
      {
        person: 'bruno',
        predicted: '8,8',
        rating: null,
        reaction: null,
        comment: null,
      },
    ])
  })

  test('a chosen film outside the Recomendação has its own block', async () => {
    const fixture = useFixture()
    const session = await fixture.ok(
      recommendSession({ attendees: ['bruno', 'teo'], count: 50 }),
      tasteWeights(fixture, 3, 5),
    )
    const id = session.session.id
    // 600 votes: never a Candidate.
    await fixture.ok(
      recordFeedback({
        session: id,
        film: 'tt9000106',
        ratings: ['bruno=4'],
        reports: ['teo=nao_gostou'],
      }),
    )

    const model = await fixture.ok(billboardModel({ session: id }))

    expect(model.chosen).toEqual({
      id: 'tt9000106',
      title: 'Curta da Madrugada',
      year: 2010,
      reactions: [
        {
          person: 'bruno',
          predicted: null,
          rating: '8',
          reaction: null,
          comment: null,
        },
        {
          person: 'teo',
          predicted: null,
          rating: null,
          reaction: 'disliked',
          comment: null,
        },
      ],
    })
    expect(model.films.every((f) => f.reactions === undefined)).toBe(true)
  })

  test('a chosen film left out of the films shown has its own block, with its stored Nota prevista', async () => {
    const fixture = useFixture()
    const { id, film } = await closed(fixture, { ratings: ['bruno=3'] })
    const other = (
      await fixture.ok(billboardModel({ session: id }))
    ).films.find((f) => f.id !== film.id)!

    const model = await fixture.ok(
      billboardModel({ session: id, shown: [other.id] }),
    )

    expect(model.films.map((f) => f.id)).toEqual([other.id])
    expect(model.chosen).toEqual({
      id: film.id,
      title: 'Pequenos Milagres',
      year: film.year,
      reactions: [
        {
          person: 'bruno',
          predicted: '8,8',
          rating: '6',
          reaction: null,
          comment: null,
        },
      ],
    })
  })

  test('a chosen film on a card has no block of its own', async () => {
    const fixture = useFixture()
    const { id } = await closed(fixture, { ratings: ['bruno=3'] })

    const model = await fixture.ok(billboardModel({ session: id }))

    expect(model.chosen).toBeUndefined()
  })

  test('a reaction that does not parse is left out, not the Cartaz', async () => {
    const fixture = useFixture()
    const { id, film } = await closed(fixture, {
      ratings: ['bruno=3'],
      reports: ['teo=gostou'],
    })
    const file = join(fixture.data, 'sessions', `${id}.md`)
    const text = readFileSync(file, 'utf8')
    const valid = '  - {person: teo, kind: report, reaction: liked}\n'
    expect(text).toContain(valid)
    writeFileSync(
      file,
      text.replace(
        valid,
        valid +
          '  - {person: teo, kind: rating}\n' +
          '  - {person: teo, kind: shrug}\n' +
          '  - {person: teo, kind: report, reaction: amazed}\n',
      ),
    )

    const model = await fixture.ok(billboardModel({ session: id }))

    expect(model.films.find((f) => f.id === film.id)?.reactions).toEqual([
      {
        person: 'bruno',
        predicted: '8,8',
        rating: '6',
        reaction: null,
        comment: null,
      },
      {
        person: 'teo',
        predicted: null,
        rating: null,
        reaction: 'liked',
        comment: null,
      },
    ])
  })

  test('an open Session and "não vimos nada" have no reactions', async () => {
    const fixture = useFixture()
    const session = await recommend(fixture, { attendees: ['dono', 'iara'] })
    const id = session.session.id
    const open = await fixture.ok(billboardModel({ session: id }))
    await fixture.ok(recordFeedback({ session: id, film: null }))
    const none = await fixture.ok(billboardModel({ session: id }))

    for (const model of [open, none])
      expect(model.films.every((f) => f.reactions === undefined)).toBe(true)
  })
})
