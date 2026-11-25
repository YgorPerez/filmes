// The Feedback (ticket #96); the pytest twin is tests/test_feedback.py. The
// Dono tells what they watched and how each Presente reacted, and that
// closes the Session:
// - the Dono's Nota and the number he relays from someone are Nota; the
//   relayed one says "repassado pelo Dono" in its Fonte;
// - the Dono's impression of someone is a Relato: gostou, neutro or não
//   gostou;
// - a Presente with no reaction gives no Fato but gets the Já visto;
// - a Nota or Relato from the Feedback is one Força level up.
// Where Python rebuilt the database, these reload the Sessions
// (`reloadSessions`).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import {
  openSessions,
  parseYaml,
  personRemove,
  personView,
  recommendSession,
  recordFeedback,
  reloadSessions,
  Sqlite,
  yamlToJson,
  type FeedbackRequest,
  type FeedbackResult,
  type Recommendation,
  type RecommendSessionRequest,
  type Vars,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'

const open = async (
  fixture: Fixture,
  request: RecommendSessionRequest,
): Promise<string> => (await fixture.ok(recommendSession(request))).session.id

const feedback = (
  fixture: Fixture,
  request: FeedbackRequest,
  vars?: Vars,
): Promise<FeedbackResult> =>
  fixture.ok(recordFeedback(request), vars).then(
    // As an edge prints it.
    (out) => JSON.parse(JSON.stringify(out)) as FeedbackResult,
  )

const errorOf = async (
  fixture: Fixture,
  request: FeedbackRequest,
): Promise<[number, string]> => {
  const { exitCode, output } = await fixture.run(recordFeedback(request))
  return [exitCode, (output as { error: { code: string } }).error.code]
}

const sessionFile = (fixture: Fixture, id: string) =>
  join(fixture.data, 'sessions', `${id}.md`)

const readFile = (fixture: Fixture, id: string) => {
  const text = readFileSync(sessionFile(fixture, id), 'utf8')
  const end = text.indexOf('\n---', 4)
  return {
    text,
    front: yamlToJson(parseYaml(text.slice(4, end))) as Record<string, any>,
    body: text.slice(end + 5),
  }
}

const query = (fixture: Fixture, sql: string) =>
  fixture.ok(
    Effect.gen(function* () {
      const rows = yield* (yield* Sqlite).read((db) => db.all(sql))
      return rows.map((row) => Object.values(row))
    }),
  )

const execute = (fixture: Fixture, sql: string) =>
  fixture.ok(
    Effect.gen(function* () {
      yield* (yield* Sqlite).write((db) => db.exec(sql))
    }),
  )

const writeSessionFile = (fixture: Fixture, id: string, text: string) => {
  mkdirSync(join(fixture.data, 'sessions'), { recursive: true })
  writeFileSync(sessionFile(fixture, id), text)
}

// For the Bruno, Noite de Estreia comes 3rd: As Horas Lentas, Sal e
// Ferrugem, Noite de Estreia.

describe('feedback', () => {
  test('writes the chosen film and the reactions, and closes the Session', async () => {
    const fixture = useFixture()
    const id = await open(fixture, {
      attendees: ['dono', 'iara', 'teo'],
      rule: 'by',
      by: 'dono',
    })
    const before = readFile(fixture, id)

    await feedback(
      fixture,
      {
        session: id,
        film: 'noite de estreia',
        ratings: ['dono=4', 'iara=4,5'],
        reports: ['teo=gostou'],
      },
      { FILMES_HOJE: '2026-11-21' },
    )

    const after = readFile(fixture, id)
    expect(after.front.chosen).toBe('tt9000203')
    expect(after.front.chosen_in_recommendation).toBe(3)
    expect(after.text).toContain('\n  recorded_on: 2026-11-21\n')
    expect(after.front.feedback.reactions).toEqual([
      { person: 'bruno', kind: 'rating', rating: 4 },
      { person: 'iara', kind: 'rating', rating: 4.5, relayed: true },
      { person: 'teo', kind: 'report', reaction: 'liked' },
    ])
    // A float stays a float, as PyYAML writes it.
    expect(after.text).toMatch(/rating: 4\.0[,}\n]/u)
    expect(after.body).toBe(before.body)
    const rest = (front: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(front).filter(
          ([key]) =>
            !['chosen', 'chosen_in_recommendation', 'feedback'].includes(key),
        ),
      )
    expect(rest(after.front)).toEqual(rest(before.front))
    expect(await fixture.ok(openSessions)).toEqual({ sessions: [] })
  })

  test('returns the Fatos written, one Força level up', async () => {
    const fixture = useFixture()
    const id = await open(fixture, {
      attendees: ['dono', 'iara', 'teo'],
      rule: 'by',
      by: 'dono',
    })

    const out = await feedback(fixture, {
      session: id,
      film: 'Noite de Estreia (2022)',
      ratings: ['eu=4', 'Iara=2'],
      reports: ['teo=não gostou'],
    })

    expect(out.session).toEqual({ id, file: `sessions/${id}.md` })
    expect(out.chosen).toEqual({
      id: 'tt9000203',
      title: 'Noite de Estreia',
      year: 2022,
      position: 3,
    })
    expect(out.withoutReaction).toEqual([])
    const source = 'Feedback da Sessão 2026-11-20'
    expect(
      out.facts
        .filter((f) => f.text !== 'já viu')
        .map(({ factId: _, ...fact }) => fact),
    ).toEqual([
      // A 4 is moderate on the ruler; 2 is moderate against. From the
      // Feedback, both go up to strong.
      {
        person: 'bruno',
        text: 'deu 4 a Noite de Estreia (2022)',
        source,
        date: '2026-11-20',
        strength: 'strong',
        kind: 'rating',
      },
      {
        person: 'iara',
        text: 'deu 2 a Noite de Estreia (2022)',
        source: `${source}, repassado pelo Dono`,
        date: '2026-11-20',
        strength: 'strong',
        kind: 'rating',
      },
      // A Relato about a film: one level under the specific Declarado
      // (moderate), and up for coming from the Feedback.
      {
        person: 'teo',
        text: 'não gostou de Noite de Estreia (2022)',
        source,
        date: '2026-11-20',
        strength: 'strong',
        kind: 'report',
      },
    ])
    expect(out.facts.every((f) => f.factId)).toBe(true)
  })

  test('a weak Nota from the Feedback goes up to moderate', async () => {
    const fixture = useFixture()
    const id = await open(fixture, { attendees: ['dono'] })

    const out = await feedback(fixture, {
      session: id,
      film: 'tt9000203',
      ratings: ['dono=3'],
    })

    expect(
      out.facts.filter((f) => f.kind === 'rating').map((f) => f.strength),
    ).toEqual(['moderate'])
  })

  test('a Presente with no reaction gives no Fato but gets the Já visto', async () => {
    const fixture = useFixture()
    const id = await open(fixture, { attendees: ['dono', 'iara', 'teo'] })

    const out = await feedback(fixture, {
      session: id,
      film: 'Noite de Estreia',
      ratings: ['dono=4'],
    })

    expect(out.withoutReaction).toEqual(['iara', 'teo'])
    expect(
      new Set(out.facts.filter((f) => f.text !== 'já viu').map((f) => f.person)),
    ).toEqual(new Set(['bruno']))
    const source = 'Feedback da Sessão 2026-11-20'
    expect(
      out.facts
        .filter((f) => f.text === 'já viu')
        .map(({ person, source, strength, kind }) => ({
          person,
          source,
          strength,
          kind,
        })),
    ).toEqual([
      { person: 'bruno', source, strength: 'strong', kind: 'stated' },
      { person: 'iara', source, strength: 'strong', kind: 'report' },
      { person: 'teo', source, strength: 'strong', kind: 'report' },
    ])
    expect(
      await query(fixture, 'SELECT pessoa FROM notas WHERE sessao IS NOT NULL'),
    ).toEqual([['bruno']])
  })

  test('a Nota from the Feedback is a seed one level up', async () => {
    // Bruno gave 4 to Jardim Suspenso on Letterboxd (moderate). Giving 4 to
    // Vento Norte in the Feedback, the new Nota is a strong seed for Rio
    // Abaixo, by the same director.
    const fixture = useFixture()
    const id = await open(fixture, { attendees: ['dono'] })
    await feedback(fixture, {
      session: id,
      film: 'Vento Norte',
      ratings: ['dono=4'],
    })

    const out: Recommendation = await fixture.ok(
      recommendSession({ attendees: ['dono'], count: 50 }),
    )

    const [film] = out.films.filter((f) => f.title === 'Rio Abaixo')
    const seeds = Object.fromEntries(
      (film?.evidence['bruno'] ?? [])
        .filter((e) => e.kind === 'rating' && e.text !== 'já viu')
        .map((e) => [e.text, [e.source, e.strength]]),
    )
    expect(seeds).toEqual({
      'deu 4 a Jardim Suspenso (2017), também de Marta Quintal': [
        'Letterboxd do Bruno',
        'moderate',
      ],
      'deu 4 a Vento Norte (2020), também de Marta Quintal': [
        'Feedback da Sessão 2026-11-20',
        'strong',
      ],
    })
  })

  test('a film someone has seen weighs against and shows a strong Já visto', async () => {
    const fixture = useFixture()
    const request = { attendees: ['dono', 'iara'], count: 50 }
    const before = await fixture.ok(recommendSession(request))
    await feedback(fixture, {
      session: before.session.id,
      film: 'As Horas Lentas',
    })

    const after = await fixture.ok(recommendSession(request))

    const titles = (out: Recommendation) => out.films.map((f) => f.title)
    const film = (out: Recommendation) =>
      out.films.find((f) => f.title === 'As Horas Lentas')!
    for (const [person, kind] of [
      ['bruno', 'stated'],
      ['iara', 'report'],
    ] as const) {
      const seen = (film(after).evidence[person] ?? []).filter(
        (e) => e.text === 'já viu',
      )
      expect(JSON.parse(JSON.stringify(seen))).toEqual([
        {
          person,
          text: 'já viu',
          source: 'Feedback da Sessão 2026-11-20',
          date: '2026-11-20',
          strength: 'strong',
          kind,
          factId: seen[0]?.factId,
          contribution: -1,
        },
      ])
      expect(film(after).utility[person]).toBeLessThan(
        film(before).utility[person] as number,
      )
    }
    expect(titles(after).indexOf('As Horas Lentas')).toBeGreaterThan(
      titles(before).indexOf('As Horas Lentas'),
    )
  })

  test('"não vimos nada" closes the Session with no chosen film and no Fato', async () => {
    const fixture = useFixture()
    const id = await open(fixture, { attendees: ['dono', 'iara'] })

    const out = await feedback(fixture, { session: id, film: null })

    expect(out.chosen).toBeNull()
    expect(out.facts).toEqual([])
    expect(out.withoutReaction).toEqual([])
    const { front } = readFile(fixture, id)
    expect(front.chosen).toBeNull()
    expect(front.feedback.reactions).toEqual([])
    expect(await fixture.ok(openSessions)).toEqual({ sessions: [] })
    expect(await query(fixture, 'SELECT count(*) FROM ja_visto')).toEqual([
      [0],
    ])
  })

  test('a film outside the Recomendação is found by its title', async () => {
    const fixture = useFixture()
    const id = await open(fixture, { attendees: ['dono'] }) // no Deserto Branco

    const out = await feedback(fixture, {
      session: id,
      film: 'DESERTO BRANCO',
      ratings: ['dono=3,5'],
    })

    expect(out.chosen).toEqual({
      id: 'tt9000701',
      title: 'Deserto Branco',
      year: 2015,
      position: null,
    })
    const { front } = readFile(fixture, id)
    expect([front.chosen, front.chosen_in_recommendation]).toEqual([
      'tt9000701',
      null,
    ])
  })

  test('a closed Session takes no other Feedback', async () => {
    const fixture = useFixture()
    const id = await open(fixture, { attendees: ['dono'] })
    await feedback(fixture, { session: id, film: null })

    expect(await errorOf(fixture, { session: id, film: 'Vento Norte' })).toEqual(
      [1, 'closed_session'],
    )
  })

  test('refuses what does not fit the Session', async () => {
    const fixture = useFixture()
    const id = await open(fixture, { attendees: ['dono', 'iara'] })
    const film = { session: id, film: 'Vento Norte' }

    const cases: Array<[FeedbackRequest, [number, string]]> = [
      [{ session: '2026-01-01-ninguem', film: null }, [1, 'unknown_session']],
      [{ session: id, film: 'Filme Que Não Existe' }, [1, 'unknown_film']],
      [{ ...film, ratings: ['teo=4'] }, [2, 'invalid_usage']],
      [{ ...film, ratings: ['iara=6'] }, [2, 'invalid_usage']],
      [{ ...film, reports: ['dono=gostou'] }, [2, 'invalid_usage']],
      [{ ...film, reports: ['iara=amou'] }, [2, 'invalid_usage']],
      [
        { ...film, ratings: ['iara=4'], reports: ['iara=gostou'] },
        [2, 'invalid_usage'],
      ],
      [{ ...film, ratings: ['iara'] }, [2, 'invalid_usage']],
      [{ ...film, ratings: ['=4'] }, [2, 'invalid_usage']],
      [{ session: id, film: null, ratings: ['dono=4'] }, [2, 'invalid_usage']],
    ]
    for (const [request, expected] of cases)
      expect(await errorOf(fixture, request)).toEqual(expected)
    expect((await fixture.ok(openSessions)).sessions[0]?.id).toBe(id)
  })

  test('the messages name the option and the item', async () => {
    const fixture = useFixture()
    const id = await open(fixture, { attendees: ['dono', 'iara'] })
    const message = async (request: Omit<FeedbackRequest, 'session'>) =>
      (
        (await fixture.run(recordFeedback({ session: id, ...request })))
          .output as { error: { message: string } }
      ).error.message

    expect(await message({ film: 'Vento Norte', ratings: ['teo=4'] })).toBe(
      '--nota teo=4: teo não estava entre os Presentes da Sessão',
    )
    expect(await message({ film: 'Vento Norte', ratings: ['iara=6'] })).toBe(
      "--nota iara=6: nota fora da escala de 0,5 a 5: '6' (se é de 1 a 10, escreva \"6/10\")",
    )
    expect(await message({ film: 'Vento Norte', reports: ['dono=gostou'] })).toBe(
      '--relato dono=gostou: o Dono fala por si com --nota',
    )
    expect(
      await message({
        film: 'Vento Norte',
        ratings: ['iara=4'],
        reports: ['iara=gostou'],
      }),
    ).toBe('mais de uma reação para iara')
    expect(await message({ film: 'Ninguém Viu' })).toBe(
      "nenhum filme do Catálogo se chama 'Ninguém Viu'; passe o ID do IMDb",
    )
  })

  test('a Relato level is read loosely', async () => {
    const fixture = useFixture()
    const id = await open(fixture, { attendees: ['dono', 'iara', 'teo'] })

    await feedback(fixture, {
      session: id,
      film: 'Vento Norte',
      reports: ['iara=  NAO_gostou ', 'teo=Neutro'],
    })

    expect(readFile(fixture, id).front.feedback.reactions).toEqual([
      { person: 'iara', kind: 'report', reaction: 'disliked' },
      { person: 'teo', kind: 'report', reaction: 'neutral' },
    ])
  })

  test('a failure to load the Fatos keeps the file open', async () => {
    const fixture = useFixture()
    const id = '2026-11-20-bruno'
    const opened =
      '---\ndate: 2026-11-20\nattendees: [bruno, bruno]\nrule: {name: default}\n---\n'
    writeSessionFile(fixture, id, opened)

    const { exitCode } = await fixture.run(
      recordFeedback({ session: id, film: 'tt9000302' }),
    )

    expect(exitCode).not.toBe(0)
    expect(readFileSync(sessionFile(fixture, id), 'utf8')).toBe(opened)
    expect((await fixture.ok(openSessions)).sessions[0]?.id).toBe(id)
  })

  test('finds by title a recommended film that left the Catalog', async () => {
    const fixture = useFixture()
    const id = '2026-11-20-bruno'
    writeSessionFile(
      fixture,
      id,
      '---\ndate: 2026-11-20\nattendees: [bruno]\nrule: {name: default}\n' +
        'recommendation: [{position: 1, id: tt9999999, title: Filme Arquivado}]\n---\n',
    )

    const byTitle = await feedback(fixture, {
      session: id,
      film: 'filme arquivado',
    })

    expect(byTitle.chosen).toEqual({
      id: 'tt9999999',
      title: 'Filme Arquivado',
      year: null,
      position: 1,
    })
  })

  test('finds by id a film that left the Catalog, with its recommended title', async () => {
    const fixture = useFixture()
    const id = '2026-11-20-bruno'
    writeSessionFile(
      fixture,
      id,
      '---\ndate: 2026-11-20\nattendees: [bruno]\nrule: {name: default}\n' +
        'recommendation: [{position: 1, id: tt9999999, title: Filme Arquivado}]\n' +
        'shown: [{position: 1, id: tt9000302, title: Vento Norte}]\n---\n',
    )

    const out = await feedback(fixture, { session: id, film: ' tt9999999 ' })

    expect(out.chosen).toEqual({
      id: 'tt9999999',
      title: 'Filme Arquivado',
      year: null,
      position: 1,
      shownPosition: null,
    })
    expect(out.facts[0]?.text).toBe('já viu')
    expect(readFile(fixture, id).front.chosen_in_shown).toBeNull()
  })

  test('the films the Dono saw give the chosen film its shown position', async () => {
    const fixture = useFixture()
    const id = await open(fixture, { attendees: ['dono'] })
    const file = readFileSync(sessionFile(fixture, id), 'utf8')
    writeFileSync(
      sessionFile(fixture, id),
      file.replace(
        '\nchosen:',
        '\nshown:\n- {position: 1, id: tt9000101, title: O Farol de Areia}\n- {position: 2, id: tt9000302, title: Vento Norte}\nchosen:',
      ),
    )

    const out = await feedback(fixture, {
      session: id,
      film: 'Vento Norte (2020)',
    })

    expect(out.chosen?.shownPosition).toBe(2)
    expect(readFile(fixture, id).front.chosen_in_shown).toBe(2)
  })

  test('a title with no year that two films share is ambiguous', async () => {
    const fixture = useFixture()
    await execute(
      fixture,
      "INSERT INTO filmes (id, titulo, ano, duracao_min, votos) VALUES ('tt9999998', 'Vento Norte', 1990, 90, 10)",
    )
    const id = await open(fixture, { attendees: ['dono'] })

    const { output } = await fixture.run(
      recordFeedback({ session: id, film: 'vento norte' }),
    )
    expect(output).toEqual({
      error: {
        code: 'ambiguous_film',
        message:
          "'vento norte' pode ser mais de um filme: Vento Norte (2020) tt9000302; Vento Norte (1990) tt9999998",
      },
    })
    // The year tells them apart.
    const out = await feedback(fixture, {
      session: id,
      film: 'Vento Norte (1990)',
    })
    expect(out.chosen?.id).toBe('tt9999998')
  })

  test('the Recomendação wins over the Catalog for a shared title', async () => {
    const fixture = useFixture()
    const id = await open(fixture, { attendees: ['dono'] })
    const [first] = readFile(fixture, id).front.recommendation
    await execute(
      fixture,
      `INSERT INTO filmes (id, titulo, ano, duracao_min, votos) VALUES ('tt9999998', '${first.title}', 1990, 90, 999999)`,
    )

    const out = await feedback(fixture, { session: id, film: first.title })

    expect(out.chosen?.id).toBe(first.id)
    expect(out.chosen?.position).toBe(1)
  })
})

describe('a Nota on the scale of 10, and a comment per Presente (#40)', () => {
  test('writes the Nota converted and the number said', async () => {
    const fixture = useFixture()
    const id = await open(fixture, {
      attendees: ['dono', 'iara', 'teo'],
      rule: 'by',
      by: 'dono',
    })

    const out = await feedback(fixture, {
      session: id,
      film: 'Noite de Estreia',
      ratings: ['dono=9/10', 'iara=7/10', 'teo=4'],
    })

    expect(readFile(fixture, id).front.feedback.reactions).toEqual([
      { person: 'bruno', kind: 'rating', rating: 4.5, original_rating: '9/10' },
      {
        person: 'iara',
        kind: 'rating',
        rating: 3.5,
        original_rating: '7/10',
        relayed: true,
      },
      { person: 'teo', kind: 'rating', rating: 4, relayed: true },
    ])
    expect(
      await query(
        fixture,
        'SELECT pessoa, nota FROM notas WHERE sessao IS NOT NULL ORDER BY pessoa',
      ),
    ).toEqual([
      ['bruno', 4.5],
      ['iara', 3.5],
      ['teo', 4],
    ])
    expect(
      Object.fromEntries(
        out.facts
          .filter((f) => f.kind === 'rating')
          .map((f) => [f.person, f.text]),
      ),
    ).toEqual({
      bruno: 'deu 9/10 a Noite de Estreia (2022)',
      iara: 'deu 7/10 a Noite de Estreia (2022)',
      teo: 'deu 4 a Noite de Estreia (2022)',
    })
  })

  test('the scale of 10 goes from 1 to 10', async () => {
    const fixture = useFixture()
    const id = await open(fixture, { attendees: ['dono'] })
    const film = { session: id, film: 'Vento Norte' }

    for (const rating of ['dono=0/10', 'dono=11/10', 'dono=9/7'])
      expect(await errorOf(fixture, { ...film, ratings: [rating] })).toEqual([
        2,
        'invalid_usage',
      ])
    const out = await feedback(fixture, { ...film, ratings: ['dono=8,5/10'] })
    expect(out.facts[0]?.text).toBe('deu 8,5/10 a Vento Norte (2020)')
  })

  const STATED =
    'SELECT pessoa, reacao, alvo, especifico, fonte, data, texto FROM declarados WHERE sessao IS NOT NULL ORDER BY pessoa'

  test('a comment is a specific Declarado, liking by the Nota', async () => {
    const fixture = useFixture()
    const id = await open(fixture, {
      attendees: ['dono', 'iara', 'teo'],
      rule: 'by',
      by: 'dono',
    })
    const [[ratings]] = (await query(
      fixture,
      'SELECT count(*) FROM notas',
    )) as [[number]]

    const out = await feedback(
      fixture,
      {
        session: id,
        film: 'Noite de Estreia',
        ratings: ['dono=9/10', 'iara=5/10', 'teo=4/10'],
        comments: [
          'dono=enquadramento e diálogo muito bons',
          'iara=  bonito,   mas   comprido ',
          'teo=muita violência sem sentido',
        ],
      },
      { FILMES_HOJE: '2026-11-21' },
    )

    const source = 'Feedback da Sessão 2026-11-20'
    const relayed = `${source}, repassado pelo Dono`
    expect(await query(fixture, STATED)).toEqual([
      [
        'bruno',
        'gosta',
        'tt9000203',
        1,
        source,
        '2026-11-21',
        'enquadramento e diálogo muito bons',
      ],
      ['iara', null, 'tt9000203', 1, relayed, '2026-11-21', 'bonito, mas comprido'],
      [
        'teo',
        'nao_gosta',
        'tt9000203',
        1,
        relayed,
        '2026-11-21',
        'muita violência sem sentido',
      ],
    ])
    // The comment gives no new Nota: only the Session's three came in.
    expect(await query(fixture, 'SELECT count(*) FROM notas')).toEqual([
      [ratings + 3],
    ])
    expect(
      out.facts
        .filter((f) => f.kind === 'stated' && f.text !== 'já viu')
        .map(({ person, text, source, strength, kind }) => ({
          person,
          text,
          source,
          strength,
          kind,
        })),
    ).toEqual([
      {
        person: 'bruno',
        text: 'disse "enquadramento e diálogo muito bons" de Noite de Estreia (2022)',
        source,
        strength: 'strong',
        kind: 'stated',
      },
      {
        person: 'iara',
        text: 'disse "bonito, mas comprido" de Noite de Estreia (2022)',
        source: relayed,
        strength: 'strong',
        kind: 'stated',
      },
      {
        person: 'teo',
        text: 'disse "muita violência sem sentido" de Noite de Estreia (2022)',
        source: relayed,
        strength: 'strong',
        kind: 'stated',
      },
    ])
    expect(readFile(fixture, id).front.feedback.reactions[2]).toEqual({
      person: 'teo',
      kind: 'rating',
      rating: 2,
      original_rating: '4/10',
      relayed: true,
      comment: 'muita violência sem sentido',
    })
    const view = await fixture.ok(personView('teo'), {
      FILMES_HOJE: '2026-11-21',
    })
    expect(
      view.stated.map((s) => [s.text, s.reaction, s.strength]),
    ).toEqual([['muita violência sem sentido', 'dislike', 'strong']])

    await fixture.ok(reloadSessions)
    expect((await query(fixture, STATED))[2]?.at(-1)).toBe(
      'muita violência sem sentido',
    )
  })

  test('a comment on the scale of 5 and with a Relato', async () => {
    const fixture = useFixture()
    const id = await open(fixture, { attendees: ['dono', 'iara', 'teo'] })

    await feedback(fixture, {
      session: id,
      film: 'Vento Norte',
      ratings: ['dono=3,5'],
      reports: ['iara=gostou', 'teo=neutro'],
      comments: ['dono=lento', 'iara=amou a trilha', 'teo=tanto faz'],
    })

    // 3,5 is 7 on the scale of 10: likes it.
    expect(
      (await query(fixture, STATED)).map((row) => row.slice(0, 2)),
    ).toEqual([
      ['bruno', 'gosta'],
      ['iara', 'gosta'],
      ['teo', null],
    ])
  })

  test('a comment needs a reaction of the same Pessoa', async () => {
    const fixture = useFixture()
    const id = await open(fixture, { attendees: ['dono', 'iara'] })
    const film = { session: id, film: 'Vento Norte', ratings: ['dono=4'] }

    for (const comments of [['iara=chato'], ['dono=  '], ['dono=a', 'dono=b']])
      expect(await errorOf(fixture, { ...film, comments })).toEqual([
        2,
        'invalid_usage',
      ])
    expect(
      await errorOf(fixture, { session: id, film: null, comments: ['dono=a'] }),
    ).toEqual([2, 'invalid_usage'])
  })
})

describe('pessoa remover of a Feedback comment', () => {
  test('takes it out of the Session file and the database', async () => {
    const fixture = useFixture()
    const id = await open(fixture, { attendees: ['dono', 'teo'] })
    await feedback(fixture, {
      session: id,
      film: 'Vento Norte',
      ratings: ['dono=8/10', 'teo=9/10'],
      comments: ['teo=a trilha é linda'],
    })
    const comments = async () =>
      (await fixture.ok(personView('teo'))).stated.filter((s) =>
        s.factId.startsWith('feedback:'),
      )
    const [comment] = await comments()

    const out = await fixture.ok(
      personRemove({ person: 'teo', kind: 'stated', id: comment!.factId }),
    )

    expect(out.removed.factId).toBe(comment!.factId)
    expect((out.removed as { text: string }).text).toBe('a trilha é linda')
    expect(await comments()).toEqual([])
    const teo = readFile(fixture, id).front.feedback.reactions.find(
      (r: { person: string }) => r.person === 'teo',
    )
    expect(teo).toEqual({
      person: 'teo',
      kind: 'rating',
      rating: 4.5,
      original_rating: '9/10',
      relayed: true,
    })
    expect(
      await query(
        fixture,
        'SELECT count(*) FROM declarados WHERE sessao IS NOT NULL',
      ),
    ).toEqual([[0]])
    expect(
      await query(
        fixture,
        "SELECT nota FROM notas WHERE pessoa = 'teo' AND sessao IS NOT NULL",
      ),
    ).toEqual([[4.5]])
  })
})
