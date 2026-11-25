// Redoing a Session (ticket #95); the pytest twins are
// tests/test_refazer_sessao.py, test_regerar_mantidos.py,
// test_fora_da_sessao.py and test_parecido_na_sessao.py.
//
// `recomendar` with `session` redoes the Recomendação of an open Session in
// the same file: the earlier version goes to `versions`, the kept films
// (`keep`) stay at their number, each film says whether it is new, and
// `dropped` says what left and why. What the Dono swapped in some version
// and what a Presente marked Já vi in it stay out of the Session (#66); a
// similar request stays in it until the Dono asks for something else (#68).
//
// The Trocar and the Já vi go through the Cartaz's reply (`answerBillboard`,
// #97), as the Python tests paste them; the Cartaz's own checks (the "saiu"
// line, the top of the page) are in test/billboard/model.test.ts.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import {
  answerBillboard,
  currentVersion,
  openSessions,
  parseYaml,
  personSeen,
  personState,
  personVeto,
  pyInt,
  readSession,
  recommendSession,
  recordFeedback,
  shownFilms,
  writeSession,
  yamlToJson,
  type RecommendSessionRequest,
  type SessionRecommendation,
  type YamlValue,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'

const ESCREVER_CARTAS = 'tt9006701'
const ESTRADA_AFORA = 'tt9006702'
const PE_NA_ESTRADA = 'tt9006713'

type Out = SessionRecommendation

const recommend = async (
  fixture: Fixture,
  request: RecommendSessionRequest,
): Promise<Out> =>
  JSON.parse(JSON.stringify(await fixture.ok(recommendSession(request)))) as Out

const ids = (out: Out) => out.films.map((f) => f.id)

const front = (fixture: Fixture, id: string) => {
  const text = readFileSync(join(fixture.data, 'sessions', `${id}.md`), 'utf8')
  const end = text.indexOf('\n---', 4)
  return {
    text,
    front: yamlToJson(parseYaml(text.slice(4, end))) as Record<string, any>,
    body: text.slice(end + 5),
  }
}

/** The Cartaz's marks, pasted back (`cartaz responder`): `marks` after
 * each film's position and id, on the current version's screen. */
const answerOnCartaz = (
  fixture: Fixture,
  id: string,
  films: ReadonlyArray<string>,
  marks: string,
) =>
  fixture.ok(
    Effect.gen(function* () {
      const { frontmatter } = yield* readSession(id)
      const version = currentVersion(frontmatter)
      const screen = shownFilms(version)
      const lines = films.map((film) => {
        const position = screen.find((f) => f.id === film)?.position
        return `${position} ${film} · ${marks}`
      })
      const number = String(yamlToJson(version.get('version') ?? null))
      return yield* answerBillboard({
        session: id,
        text: [`#cartaz ${id} v${number}`, ...lines, ''].join('\n'),
      })
    }),
  )

/** The Cartaz's Trocar: `swapped` of the current version. */
const swapOnCartaz = (fixture: Fixture, id: string, films: string[]) =>
  answerOnCartaz(fixture, id, films, 'trocar')

/** The Cartaz's Já vi: a Já visto of today, from the Cartaz. */
const seenOnCartaz = (
  fixture: Fixture,
  id: string,
  person: string,
  film: string,
) => answerOnCartaz(fixture, id, [film], `já vi: ${person}`)

const withoutPosterWarning = (warnings: ReadonlyArray<string>) =>
  warnings.filter((w) => !w.startsWith('TMDB '))

describe('recomendar --sessao (test_refazer_sessao)', () => {
  test('writes the new request in the same Session and keeps the earlier version', async () => {
    const fixture = useFixture()
    const first = await recommend(fixture, {
      attendees: ['dono', 'iara'],
      count: 3,
      request: 'algo bom',
    })
    const redone = await recommend(fixture, {
      attendees: ['dono', 'iara'],
      count: 3,
      maxDuration: 100,
      request: 'algo curto',
      session: '2026-11-20-iara',
    })

    expect(redone.session).toEqual({
      id: '2026-11-20-iara',
      file: 'sessions/2026-11-20-iara.md',
      version: 2,
    })
    const { front: top, body } = front(fixture, '2026-11-20-iara')
    expect(top['context']['request']).toBe('algo curto')
    expect(top['context']['max_duration']).toBe(100)
    // What was on the earlier screen is not new.
    const before = new Set(ids(first))
    expect(top['recommendation']).toEqual(
      redone.films.map((f) => ({
        position: f.position,
        id: f.id,
        title: f.title,
        new: !before.has(f.id),
      })),
    )
    expect(top['versions']).toEqual([
      {
        version: 1,
        date: top['date'],
        attendees: ['bruno', 'iara'],
        context: {
          request: 'algo bom',
          max_duration: null,
          moods: [],
          constraints: [],
        },
        rule: { name: 'default' },
        recommendation: first.films.map((f) => ({
          position: f.position,
          id: f.id,
          title: f.title,
        })),
      },
    ])
    expect(body.split('## Recomendação')).toHaveLength(2)
  })

  test('each refazer adds a version and sessoes-abertas shows one Session', async () => {
    const fixture = useFixture()
    await recommend(fixture, {
      attendees: ['dono', 'iara'],
      request: 'algo bom',
    })
    await fixture.ok(
      recommendSession({
        attendees: ['dono', 'iara'],
        request: 'algo curto',
        maxDuration: 100,
        session: '2026-11-20-iara',
      }),
      { FILMES_HOJE: '2026-11-21' },
    )
    const third = await recommend(fixture, {
      attendees: ['dono', 'iara', 'teo'],
      request: 'o Teo chegou',
      session: '2026-11-20-iara',
    })

    expect(third.session.version).toBe(3)
    const { front: top, text } = front(fixture, '2026-11-20-iara')
    expect(text).toContain('\ndate: 2026-11-20\n')
    expect(top['attendees']).toEqual(['bruno', 'iara', 'teo'])
    expect(
      top['versions'].map((v: any) => [v.version, v.date, v.context.request]),
    ).toEqual([
      [1, '2026-11-20', 'algo bom'],
      [2, '2026-11-21', 'algo curto'],
    ])
    const { sessions } = await fixture.ok(openSessions)
    expect(sessions).toHaveLength(1)
    const [open] = sessions
    expect(open).toMatchObject({
      id: '2026-11-20-iara',
      request: 'o Teo chegou',
      attendees: ['bruno', 'iara', 'teo'],
      version: 3,
      recommendation: top['recommendation'],
    })
  })

  test('the Feedback finds the position in the redone list', async () => {
    const fixture = useFixture()
    await recommend(fixture, {
      attendees: ['dono'],
      count: 2,
      request: 'qualquer coisa',
    })
    const redone = await recommend(fixture, {
      attendees: ['dono'],
      count: 2,
      unseen: true,
      maxDuration: 100,
      session: '2026-11-20-bruno',
    })
    const second = redone.films[1]!.id

    const out = await fixture.ok(
      recordFeedback({
        session: '2026-11-20-bruno',
        film: second,
        ratings: ['dono=4'],
      }),
    )

    expect(out.chosen?.position).toBe(2)
  })

  test('a Session with Feedback is not redone', async () => {
    const fixture = useFixture()
    await recommend(fixture, { attendees: ['dono'], request: 'primeira' })
    await fixture.ok(
      recordFeedback({ session: '2026-11-20-bruno', film: null }),
    )
    const before = front(fixture, '2026-11-20-bruno').text

    const outcome = await fixture.run(
      recommendSession({ attendees: ['dono'], session: '2026-11-20-bruno' }),
    )

    expect(outcome.exitCode).not.toBe(0)
    expect(outcome.output).toMatchObject({ error: { code: 'closed_session' } })
    expect(front(fixture, '2026-11-20-bruno').text).toBe(before)
  })

  test('a Session that does not exist is an error and opens none', async () => {
    const fixture = useFixture()

    const outcome = await fixture.run(
      recommendSession({ attendees: ['dono'], session: '2026-11-20-bruno' }),
    )

    expect(outcome.output).toMatchObject({ error: { code: 'unknown_session' } })
    const { sessions } = await fixture.ok(openSessions)
    expect(sessions).toEqual([])
  })
})

const openAlone = async (fixture: Fixture, attendees = ['dono']) => {
  const first = await recommend(fixture, { attendees })
  return { first, id: first.session.id }
}

describe('regenerating with kept films (test_regerar_mantidos)', () => {
  test('kept films stay at their number and the free places get films the Session did not show', async () => {
    const fixture = useFixture()
    const { first, id } = await openAlone(fixture)
    const p = ids(first)

    const redone = await recommend(fixture, {
      attendees: ['dono'],
      session: id,
      keep: [`${p[0]},${p[2]},${p[3]}`],
    })

    expect(redone.films).toHaveLength(5)
    const at = new Map(redone.films.map((f) => [f.position, f]))
    expect([1, 3, 4].map((n) => at.get(n)?.id)).toEqual([p[0], p[2], p[3]])
    expect([1, 3, 4].map((n) => at.get(n)?.new)).toEqual([false, false, false])
    const free = [at.get(2)!, at.get(5)!]
    expect(free.every((f) => f.new)).toBe(true)
    expect(free.filter((f) => p.includes(f.id))).toEqual([])
  })

  test('dropped says who saw it and what was swapped', async () => {
    const fixture = useFixture()
    const { first, id } = await openAlone(fixture)
    const f = first.films
    await fixture.ok(
      personSeen({ person: 'dono', film: f[1]!.id, rating: '8/10' }),
    )

    const redone = await recommend(fixture, {
      attendees: ['dono'],
      session: id,
      keep: [`${f[0]!.id},${f[2]!.id}`],
    })

    expect(redone.kept).toEqual([f[0]!.id, f[2]!.id])
    expect(redone.dropped).toEqual([
      {
        position: 2,
        id: f[1]!.id,
        title: f[1]!.title,
        cause: 'seen',
        people: ['bruno'],
      },
      { position: 4, id: f[3]!.id, title: f[3]!.title, cause: 'swapped' },
      { position: 5, id: f[4]!.id, title: f[4]!.title, cause: 'swapped' },
    ])
  })

  test('the stored version keeps new, kept and dropped', async () => {
    const fixture = useFixture()
    const { first, id } = await openAlone(fixture)
    const p = ids(first)
    const redone = await recommend(fixture, {
      attendees: ['dono'],
      session: id,
      keep: [p[1]!],
    })

    let top = front(fixture, id).front
    expect(top['recommendation']).toEqual(
      redone.films.map((f) => ({
        position: f.position,
        id: f.id,
        title: f.title,
        new: f.new,
      })),
    )
    expect(top['kept']).toEqual([p[1]])
    expect(top['dropped']).toEqual(redone.dropped)

    const third = await recommend(fixture, { attendees: ['dono'], session: id })

    top = front(fixture, id).front
    expect(top['kept']).toEqual([])
    expect(top['versions'][1]['kept']).toEqual([p[1]])
    expect(top['versions'][1]['dropped']).toEqual(redone.dropped)
    expect(top['recommendation'].map((r: any) => r.new)).toEqual(
      third.films.map((f) => !ids(redone).includes(f.id)),
    )
  })

  test('keep without a Session is invalid usage', async () => {
    const fixture = useFixture()

    const outcome = await fixture.run(
      recommendSession({ attendees: ['dono'], keep: ['tt9000104'] }),
    )

    expect(outcome.exitCode).toBe(2)
    expect(outcome.output).toMatchObject({ error: { code: 'invalid_usage' } })
  })

  test('a kept film that was not in the earlier version stays out, with a warning', async () => {
    const fixture = useFixture()
    const { first, id } = await openAlone(fixture)
    const outside = 'tt9000101'
    expect(ids(first)).not.toContain(outside)

    const redone = await recommend(fixture, {
      attendees: ['dono'],
      session: id,
      keep: [outside],
    })

    expect(redone.films.every((f) => f.new)).toBe(true)
    expect(redone.kept).toEqual([])
    expect(redone.warnings.some((w) => w.includes(outside))).toBe(true)
  })

  test('a new Restrição removes the kept film that breaks it, with a warning', async () => {
    const fixture = useFixture()
    const { first, id } = await openAlone(fixture)
    const f = first.films
    expect(f[1]!.runtimeMinutes).toBeGreaterThan(110)
    expect(f[0]!.runtimeMinutes).toBeLessThanOrEqual(110)

    const redone = await recommend(fixture, {
      attendees: ['dono'],
      session: id,
      maxDuration: 110,
      keep: [`${f[0]!.id},${f[1]!.id}`],
    })

    expect(redone.kept).toEqual([f[0]!.id])
    expect(redone.dropped).toContainEqual({
      position: 2,
      id: f[1]!.id,
      title: f[1]!.title,
      cause: 'constraint',
      constraint: 'duration',
      label: 'até 1h50',
    })
    expect(
      redone.warnings.some(
        (w) => w.includes(f[1]!.title) && w.includes('mantido'),
      ),
    ).toBe(true)
    expect(redone.films[1]).toMatchObject({ new: true, position: 2 })
  })

  test('a new Veto removes the kept film and a new Declarado does not', async () => {
    const fixture = useFixture()
    const { first, id } = await openAlone(fixture)
    const f = first.films
    await fixture.ok(
      personVeto({
        person: 'dono',
        text: 'não vejo esse de jeito nenhum',
        target: f[0]!.id,
      }),
    )
    await fixture.ok(
      personState({
        person: 'dono',
        text: 'detestei o trailer',
        target: f[2]!.id,
        reaction: 'hate',
      }),
    )

    const redone = await recommend(fixture, {
      attendees: ['dono'],
      session: id,
      keep: [`${f[0]!.id},${f[2]!.id}`],
    })

    expect(redone.kept).toEqual([f[2]!.id])
    expect(redone.films[2]!.id).toBe(f[2]!.id)
    expect(redone.dropped).toContainEqual({
      position: 1,
      id: f[0]!.id,
      title: f[0]!.title,
      cause: 'veto',
      person: 'bruno',
      text: 'não vejo esse de jeito nenhum',
    })
    expect(
      redone.warnings.some(
        (w) => w.includes(f[0]!.title) && w.includes('mantido'),
      ),
    ).toBe(true)
  })

  test('a refazer without keep keeps nothing and says what left', async () => {
    // With no no-repeat (#66) what was not seen may come back; the
    // Session's Já visto leaves.
    const fixture = useFixture()
    const { first, id } = await openAlone(fixture)
    const seen = first.films[1]!
    await fixture.ok(personSeen({ person: 'dono', film: seen.id }))

    const redone = await recommend(fixture, {
      attendees: ['dono'],
      session: id,
    })

    expect(redone.kept).toEqual([])
    // What comes back from the earlier screen gets no "novo"; only what
    // took the seen film's place.
    expect(redone.films.map((f) => f.new)).toEqual(
      redone.films.map((f) => !ids(first).includes(f.id)),
    )
    expect(redone.films.some((f) => f.new)).toBe(true)
    expect(ids(redone)).not.toContain(seen.id)
    expect(redone.dropped).toContainEqual({
      position: 2,
      id: seen.id,
      title: seen.title,
      cause: 'seen',
      people: ['bruno'],
    })
  })

  test('a kept film below the minimum rating leaves with a warning', async () => {
    // Sombra Morna has 6,5 on IMDb: no Candidate. A Session from before the
    // minimum rating showed it at 2.
    const fixture = useFixture()
    const { first, id } = await openAlone(fixture)
    const file = join(fixture.data, 'sessions', `${id}.md`)
    const swapped = first.films[1]!
    writeFileSync(
      file,
      readFileSync(file, 'utf8')
        .replace(`id: ${swapped.id}`, 'id: tt9003401')
        .replace(`title: ${swapped.title}`, 'title: Sombra Morna'),
    )

    const redone = await recommend(fixture, {
      attendees: ['dono'],
      session: id,
      keep: [`${first.films[0]!.id},tt9003401`],
    })

    expect(ids(redone)).not.toContain('tt9003401')
    expect(redone.kept).toEqual([first.films[0]!.id])
    expect(redone.dropped).toContainEqual({
      position: 2,
      id: 'tt9003401',
      title: 'Sombra Morna',
      cause: 'min_rating',
      label: 'nota 6,5 no IMDb, abaixo de 7',
    })
    expect(
      redone.warnings.some(
        (w) => w.includes('Sombra Morna') && w.includes('mantido'),
      ),
    ).toBe(true)
  })

  test('a kept film with too few votes, or outside the Catálogo, leaves with the reason', async () => {
    // Curta da Madrugada has 600 votes; tt0000001 is in no Catálogo. A
    // Session written by hand showed them at 2 and 3, the second untitled.
    const fixture = useFixture()
    const { first, id } = await openAlone(fixture)
    await fixture.ok(
      Effect.gen(function* () {
        const { frontmatter, body } = yield* readSession(id)
        const top = new Map(frontmatter)
        top.set(
          'recommendation',
          first.films.map((f) => {
            if (f.position === 2)
              return new Map<string, YamlValue>([
                ['position', pyInt(2)],
                ['id', 'tt9000106'],
                ['title', 'Curta da Madrugada'],
              ])
            if (f.position === 3)
              return new Map<string, YamlValue>([
                ['position', pyInt(3)],
                ['id', 'tt0000001'],
              ])
            return new Map<string, YamlValue>([
              ['position', pyInt(f.position)],
              ['id', f.id],
              ['title', f.title],
            ])
          }),
        )
        yield* writeSession(id, top, body)
      }),
    )

    const redone = await recommend(fixture, {
      attendees: ['dono'],
      session: id,
      keep: ['tt9000106,tt0000001'],
    })

    expect(redone.kept).toEqual([])
    expect(redone.dropped?.slice(1, 3)).toEqual([
      {
        position: 2,
        id: 'tt9000106',
        title: 'Curta da Madrugada',
        cause: 'min_rating',
        label: '600 votos no IMDb, abaixo de 1.000',
      },
      {
        position: 3,
        id: 'tt0000001',
        title: null,
        cause: 'min_rating',
        label: 'fora do Catálogo',
      },
    ])
    expect(withoutPosterWarning(redone.warnings)).toEqual([
      'Curta da Madrugada saiu, apesar de mantido: 600 votos no IMDb, abaixo de 1.000',
      'tt0000001 saiu, apesar de mantido: fora do Catálogo',
    ])
  })

  test('a list shorter than a kept film’s number has no hole', async () => {
    const fixture = useFixture()
    const { first, id } = await openAlone(fixture)
    const p = ids(first)

    const redone = await recommend(fixture, {
      attendees: ['dono'],
      session: id,
      count: 3,
      keep: [`${p[1]},${p[4]}`],
    })

    expect(redone.films.map((f) => f.position)).toEqual([1, 2, 3])
    expect(redone.films.slice(1).map((f) => [f.id, f.new])).toEqual([
      [p[1], false],
      [p[4], false],
    ])
    expect(redone.films[0]!.new).toBe(true)
  })

  test('a Já visto of whoever was in the earlier version and left counts in dropped', async () => {
    const fixture = useFixture()
    const { first, id } = await openAlone(fixture, ['dono', 'iara'])
    const f = first.films
    await seenOnCartaz(fixture, id, 'iara', f[1]!.id)

    const redone = await recommend(fixture, {
      attendees: ['dono'],
      session: id,
      keep: [f[0]!.id],
    })

    expect(redone.dropped).toContainEqual({
      position: 2,
      id: f[1]!.id,
      title: f[1]!.title,
      cause: 'seen',
      people: ['iara'],
    })
  })
})

const DONO_IARA = ['dono', 'iara']
const openMany = async (fixture: Fixture) => {
  const first = await recommend(fixture, { attendees: DONO_IARA, count: 100 })
  return { first, id: first.session.id }
}
const redoMany = (
  fixture: Fixture,
  session: string,
  more: Partial<RecommendSessionRequest> = {},
) => recommend(fixture, { attendees: DONO_IARA, count: 100, session, ...more })

describe('out of the Session (test_fora_da_sessao)', () => {
  test('a refazer brings back what was shown and neither swapped nor seen', async () => {
    const fixture = useFixture()
    const { first, id } = await openMany(fixture)

    const second = await redoMany(fixture, id)

    expect(ids(second)).toEqual(ids(first))
    expect(second.constraints['out_of_session']).toEqual({
      swapped: 0,
      seen: 0,
      removed: 0,
    })
    expect(second.constraints['no_repeat']).toBeUndefined()
  })

  test('a film swapped on the Cartaz comes back in no version of the Session', async () => {
    const fixture = useFixture()
    const { first, id } = await openMany(fixture)
    const swapped = first.films[3]!

    await swapOnCartaz(fixture, id, [swapped.id])
    const second = await redoMany(fixture, id)
    const third = await redoMany(fixture, id)

    expect(ids(second)).not.toContain(swapped.id)
    expect(ids(third)).not.toContain(swapped.id)
    expect(third.constraints['out_of_session']).toEqual({
      swapped: 1,
      seen: 0,
      removed: 1,
    })
    expect(front(fixture, id).front['versions'][0]['swapped']).toEqual([
      swapped.id,
    ])
  })

  test('what did not stay in a refazer with keep is swapped', async () => {
    const fixture = useFixture()
    const { first, id } = await openMany(fixture)
    const f = ids(first)

    await redoMany(fixture, id, { count: 2, keep: [`${f[0]},${f[1]}`] })
    const third = await redoMany(fixture, id)

    expect(ids(third)).not.toContain(f[2])
    expect(ids(third)).not.toContain(f[3])
    expect(ids(third)).not.toContain(f[4])
    expect(ids(third)).toEqual(expect.arrayContaining([f[0], f[1]]))
  })

  test('a Presente’s Já vi in the Session keeps the film out without asking for unseen', async () => {
    const fixture = useFixture()
    const { first, id } = await openMany(fixture)
    const seen = first.films[0]!

    await seenOnCartaz(fixture, id, 'iara', seen.id)
    const second = await redoMany(fixture, id)

    expect(ids(second)).not.toContain(seen.id)
    expect(second.constraints['out_of_session']?.['seen']).toBe(1)
    expect(second.constraints['unseen']).toBeUndefined()
  })

  test('another Session does not count', async () => {
    const fixture = useFixture()
    const { first, id } = await openMany(fixture)
    const swapped = first.films[0]!.id
    await swapOnCartaz(fixture, id, [swapped])

    const other = await recommend(fixture, { attendees: DONO_IARA, count: 100 })

    expect(ids(other)).toContain(swapped)
    expect(other.constraints['out_of_session']).toBeUndefined()
  })

  test('what did not stay of a keep whose kept films all left stays swapped', async () => {
    // The only kept film leaves by the duration: the version has no kept
    // film, but the Dono chose.
    const fixture = useFixture()
    const first = await recommend(fixture, { attendees: ['dono'] })
    const id = first.session.id
    const f = ids(first)
    const longest = first.films.reduce((a, b) =>
      (b.runtimeMinutes ?? 0) > (a.runtimeMinutes ?? 0) ? b : a,
    )

    const second = await recommend(fixture, {
      attendees: ['dono'],
      session: id,
      keep: [longest.id],
      maxDuration: (longest.runtimeMinutes ?? 0) - 1,
    })
    const third = await recommend(fixture, { attendees: ['dono'], session: id })

    expect(second.kept).toEqual([])
    expect(
      f.filter((film) => film !== longest.id && ids(third).includes(film)),
    ).toEqual([])
  })

  test('swap records the films as swapped before the refazer', async () => {
    const fixture = useFixture()
    const { first, id } = await openMany(fixture)
    const screen = ids(first).slice(0, 5)

    const second = await redoMany(fixture, id, { swap: screen })
    const third = await redoMany(fixture, id)

    expect(ids(second).filter((f) => screen.includes(f))).toEqual([])
    expect(ids(third).filter((f) => screen.includes(f))).toEqual([])
    expect(
      new Set(
        second.dropped
          ?.filter((s) => screen.includes(s.id))
          .map((s) => s.cause),
      ),
    ).toEqual(new Set(['swapped']))
    expect(front(fixture, id).front['versions'][0]['swapped']).toEqual(
      [...screen].sort(),
    )
  })

  test('swap takes commas and holds only with a Session', async () => {
    const fixture = useFixture()
    const { first, id } = await openMany(fixture)
    const screen = ids(first).slice(0, 2)

    const second = await redoMany(fixture, id, { swap: [screen.join(',')] })
    const outcome = await fixture.run(
      recommendSession({ attendees: ['dono'], swap: [screen[0]!] }),
    )

    expect(ids(second).filter((f) => screen.includes(f))).toEqual([])
    expect(outcome.exitCode).toBe(2)
    expect(JSON.stringify(outcome.output)).toContain('--trocar')
  })

  test('what comes back from the earlier screen gets no "novo"', async () => {
    const fixture = useFixture()
    const { id } = await openMany(fixture)

    const second = await redoMany(fixture, id)

    expect(second.films.some((f) => f.new)).toBe(false)
  })

  test('a Já vi of whoever arrived in this refazer removes the film', async () => {
    const fixture = useFixture()
    const first = await recommend(fixture, { attendees: ['dono'] })
    const seen = first.films[0]!.id
    await fixture.ok(personSeen({ person: 'iara', film: seen }))

    const second = await redoMany(fixture, first.session.id)

    expect(ids(second)).not.toContain(seen)
    expect(second.constraints['out_of_session']?.['seen']).toBe(1)
  })
})

const openTen = async (
  fixture: Fixture,
  more: Partial<RecommendSessionRequest> = {},
) => {
  const first = await recommend(fixture, {
    attendees: ['dono'],
    count: 10,
    ...more,
  })
  return { first, id: first.session.id }
}
const redoTen = (
  fixture: Fixture,
  session: string,
  more: Partial<RecommendSessionRequest> = {},
) => recommend(fixture, { attendees: ['dono'], count: 10, session, ...more })

describe('the similar in the Session (test_parecido_na_sessao)', () => {
  test('a refazer without repeating similar keeps the filter', async () => {
    const fixture = useFixture()
    const { first, id } = await openTen(fixture, { similar: [ESCREVER_CARTAS] })

    const second = await redoTen(fixture, id)
    const third = await redoTen(fixture, id, { keep: [first.films[0]!.id] })

    expect(ids(second)).toEqual(ids(first))
    expect(second.constraints['similar']?.['films']).toEqual([ESCREVER_CARTAS])
    expect(third.constraints['similar']?.['films']).toEqual([ESCREVER_CARTAS])
    expect(ids(third).filter((f) => !ids(first).includes(f))).toEqual([])
    expect(third.kept).toEqual([first.films[0]!.id])
  })

  test('noSimilar drops the filter and it does not come back', async () => {
    const fixture = useFixture()
    const { first, id } = await openTen(fixture, { similar: [ESTRADA_AFORA] })

    const second = await redoTen(fixture, id, { noSimilar: true })
    const third = await redoTen(fixture, id)

    expect(ids(first)).toEqual([PE_NA_ESTRADA])
    expect(second.constraints['similar']).toBeUndefined()
    expect(third.constraints['similar']).toBeUndefined()
    expect(ids(second)).toHaveLength(10)
  })

  test('a similar with another reference replaces the earlier one', async () => {
    const fixture = useFixture()
    const { id } = await openTen(fixture, { similar: [ESCREVER_CARTAS] })

    const second = await redoTen(fixture, id, { similar: [ESTRADA_AFORA] })
    const third = await redoTen(fixture, id)

    expect(second.constraints['similar']?.['films']).toEqual([ESTRADA_AFORA])
    expect(ids(second)).toEqual([PE_NA_ESTRADA])
    expect(ids(third)).toEqual([PE_NA_ESTRADA])
  })

  test('a new similar replaces the whole list and ignores keep, with a warning', async () => {
    const fixture = useFixture()
    const { first, id } = await openTen(fixture)
    const screen = ids(first)

    const second = await redoTen(fixture, id, {
      similar: [ESTRADA_AFORA],
      keep: [screen[0]!],
    })

    expect(ids(second)).toEqual([PE_NA_ESTRADA])
    expect(second.kept).toEqual([])
    expect(second.films.every((f) => f.new)).toBe(true)
    expect(
      withoutPosterWarning(second.warnings).some(
        (w) => w.includes('--manter') && w.includes('parecido'),
      ),
    ).toBe(true)
    expect(second.dropped?.map((s) => s.id)).toEqual(
      screen.filter((f) => f !== PE_NA_ESTRADA),
    )
    expect(
      new Set(
        second.dropped?.map((s) =>
          s.cause === 'constraint' ? `${s.cause} ${s.constraint}` : s.cause,
        ),
      ),
    ).toEqual(new Set(['constraint similar']))
    expect(second.dropped?.[0]).toMatchObject({
      label: 'parecidos com Estrada Afora',
    })
  })

  test('a new similar does not count as swapped', async () => {
    const fixture = useFixture()
    const { first, id } = await openTen(fixture)

    await redoTen(fixture, id, { similar: [ESTRADA_AFORA] })
    const third = await redoTen(fixture, id, { noSimilar: true })

    expect(ids(third)).toEqual(ids(first))
  })

  test('repeating the same similar is no new request', async () => {
    const fixture = useFixture()
    const { first, id } = await openTen(fixture, { similar: [ESCREVER_CARTAS] })
    const stays = first.films[1]!.id

    const second = await redoTen(fixture, id, {
      similar: [ESCREVER_CARTAS],
      keep: [stays],
    })

    expect(second.kept).toEqual([stays])
    expect(
      withoutPosterWarning(second.warnings).some((w) => w.includes('--manter')),
    ).toBe(false)
  })

  test('noSimilar outside a Session is invalid usage', async () => {
    const fixture = useFixture()

    const outcome = await fixture.run(
      recommendSession({ attendees: ['dono'], noSimilar: true }),
    )

    expect(outcome.exitCode).toBe(2)
    expect(JSON.stringify(outcome.output)).toContain('--sem-parecido')
  })

  test('similar and noSimilar together are invalid usage', async () => {
    const fixture = useFixture()
    const { id } = await openTen(fixture, { similar: [ESCREVER_CARTAS] })

    const outcome = await fixture.run(
      recommendSession({
        attendees: ['dono'],
        session: id,
        similar: [ESTRADA_AFORA],
        noSimilar: true,
      }),
    )

    expect(outcome.exitCode).toBe(2)
  })

  test('a new similar keeps swapped what the Dono swapped on the Cartaz', async () => {
    const fixture = useFixture()
    const { first, id } = await openTen(fixture)
    const swapped = first.films[1]!.id
    await swapOnCartaz(fixture, id, [swapped])

    const second = await redoTen(fixture, id, { similar: [ESTRADA_AFORA] })

    expect(second.dropped?.filter((s) => s.id === swapped)).toMatchObject([
      { cause: 'swapped' },
    ])
  })
})
