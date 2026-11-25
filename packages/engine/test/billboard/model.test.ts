// The Cartaz as data (#97): tests/test_cartaz_mostrados.py, and the parts of
// test_cartaz.py, test_cartaz_responde.py, test_regerar_mantidos.py and
// test_parecido_na_sessao.py that check what the page says rather than its
// HTML (the HTML checks are the React Cartaz's, #114).

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import {
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

  test('an unknown Session is unknown_session', async () => {
    const outcome = await useFixture().run(
      billboardModel({ session: 'nao-existe' }),
    )

    expect(outcome.exitCode).toBe(1)
    expect(outcome.output).toMatchObject({ error: { code: 'unknown_session' } })
  })

  test('initials are the shortest start no other Presente shares', () => {
    const people = billboardPeople(
      ['leo', 'lorenzo', 'ana'],
      new Map([
        ['leo', 'Léo'],
        ['lorenzo', 'Lorenzo'],
      ]),
      'ana',
    )

    expect(people.map((p) => [p.initial, p.label, p.color])).toEqual([
      ['Lé', 'Léo', 1],
      ['Lo', 'Lorenzo', 2],
      ['A', 'Você', 3],
    ])
  })

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
