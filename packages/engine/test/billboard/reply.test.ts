// `cartaz responder` (#97); the pytest twin is tests/test_cartaz_responder.py.
//
// The text comes as the Cartaz's Copiar pro chat builds it (`billboardText`).
// Já vi becomes the Pessoa's Já visto (with a Nota, half of it); stars,
// comments and acrescentar stay in the Session's version. The answer says
// whether to regenerate and what to keep.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import {
  answerBillboard,
  billboardText,
  parseYaml,
  personView,
  recommendSession,
  recordFeedback,
  yamlToJson,
  type BillboardMarks,
  type BillboardReply,
  type BillboardState,
  type SessionRecommendation,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'

const open = async (fixture: Fixture, ...attendees: string[]) => {
  const out = await fixture.ok(
    recommendSession({ attendees: ['dono', ...attendees] }),
  )
  return { first: out, id: out.session.id, f: out.films }
}

const answer = async (
  fixture: Fixture,
  session: string,
  text: string,
  vars = {},
): Promise<BillboardReply> =>
  JSON.parse(
    JSON.stringify(await fixture.ok(answerBillboard({ session, text }), vars)),
  ) as BillboardReply

const view = (fixture: Fixture, person: string) =>
  fixture.ok(personView(person))

const front = (fixture: Fixture, id: string) => {
  const text = readFileSync(join(fixture.data, 'sessions', `${id}.md`), 'utf8')
  return yamlToJson(
    parseYaml(text.slice(4, text.indexOf('\n---', 4))),
  ) as Record<string, any>
}

const fromCartaz = (id: string) => (s: { source: string }) =>
  s.source === `cartaz ${id}`

describe('cartaz responder (test_cartaz_responder)', () => {
  test('Já vi with a Nota records a Já visto and the Nota halved', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture, 'iara')
    const film = f[0]!.id

    await answer(fixture, id, `#cartaz ${id} v1\n1 ${film} · já vi: iara=8\n`)

    const iara = await view(fixture, 'iara')
    expect(iara.seen.map((v) => [v.film, v.rating, v.date])).toEqual([
      [film, 4, '2026-11-20'],
    ])
    expect(iara.ratings?.some((n) => n.filmId === film && n.rating === 4)).toBe(
      true,
    )
  })

  test('Já vi todos is for the version’s Presentes and the film leaves', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture, 'iara')

    const out = await answer(
      fixture,
      id,
      `#cartaz ${id} v1\n2 ${f[1]!.id} · já vi: todos\n`,
    )

    expect(out.seen.map((v) => [v.person, v.film, v.rating])).toEqual([
      ['bruno', f[1]!.id, null],
      ['iara', f[1]!.id, null],
    ])
    expect(out.regenerate).toBe(true)
    expect(out.dropped).toEqual([
      {
        position: 2,
        id: f[1]!.id,
        title: f[1]!.title,
        cause: 'seen',
        people: ['bruno', 'iara'],
      },
    ])
    expect(out.keep).toEqual([f[0]!.id, ...f.slice(2).map((x) => x.id)])
    const iara = await view(fixture, 'iara')
    expect(iara.ratings?.every((n) => n.filmId !== f[1]!.id)).toBe(true)
  })
})

describe('cartaz responder (test_cartaz_responder)', () => {
  test('stars, comments and acrescentar stay in the Session’s version', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture, 'iara')
    const text =
      `#cartaz ${id} v1\n` +
      'acrescentar: chegou a Ana, algo leve\n' +
      `1 ${f[0]!.id} · estrelas: 4\n` +
      `3 ${f[2]!.id} · estrelas: 2 · comentário: lindo, mas · longo\n`

    const out = await answer(fixture, id, text)

    expect(front(fixture, id)['replies']).toEqual([
      {
        date: '2026-11-20',
        addition: 'chegou a Ana, algo leve',
        films: [
          { position: 1, id: f[0]!.id, stars: 4 },
          {
            position: 3,
            id: f[2]!.id,
            stars: 2,
            comment: 'lindo, mas · longo',
          },
        ],
      },
    ])
    // The date goes plain, as Python's date object.
    expect(
      readFileSync(join(fixture.data, 'sessions', `${id}.md`), 'utf8'),
    ).toContain('- date: 2026-11-20\n')
    expect(out.addition).toBe('chegou a Ana, algo leve')
    expect(out.comments).toEqual([
      {
        position: 3,
        id: f[2]!.id,
        title: f[2]!.title,
        comment: 'lindo, mas · longo',
      },
    ])
    expect(out.regenerate).toBe(true)
    expect(out.dropped).toEqual([])
    expect(out.keep).toEqual(f.map((x) => x.id))
  })

  test('a star is no Fato', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture, 'iara')
    const before = await view(fixture, 'dono')

    await answer(fixture, id, `#cartaz ${id} v1\n1 ${f[0]!.id} · estrelas: 1\n`)

    expect(await view(fixture, 'dono')).toEqual(before)
  })
})

describe('cartaz responder (test_cartaz_responder)', () => {
  test('only stars or comments ask for no regenerate', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture, 'iara')

    const out = await answer(
      fixture,
      id,
      `#cartaz ${id} v1\n1 ${f[0]!.id} · estrelas: 5\n2 ${f[1]!.id} · comentário: bom\n`,
    )

    expect(out.regenerate).toBe(false)
    expect(out.dropped).toEqual([])
    expect(out.addition).toBeNull()
  })

  test('Trocar takes the film off and says why', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture, 'iara')

    const out = await answer(
      fixture,
      id,
      `#cartaz ${id} v1\n4 ${f[3]!.id} · trocar · estrelas: 1\n`,
    )

    expect(out.regenerate).toBe(true)
    expect(out.dropped).toEqual([
      { position: 4, id: f[3]!.id, title: f[3]!.title, cause: 'swapped' },
    ])
    expect(out.keep).not.toContain(f[3]!.id)
    expect(front(fixture, id)['swapped']).toEqual([f[3]!.id])
  })
})

describe('cartaz responder (test_cartaz_responder)', () => {
  test('an old version’s text counts by film and ignores the Trocar of what left', async () => {
    const fixture = useFixture()
    const { id, f: v1 } = await open(fixture, 'iara')
    const second: SessionRecommendation = await fixture.ok(
      recommendSession({
        attendees: ['dono', 'iara'],
        session: id,
        keep: [`${v1[0]!.id},${v1[1]!.id}`],
      }),
    )
    const left = v1.find((x) => !second.films.some((g) => g.id === x.id))!
    const text =
      `#cartaz ${id} v1\n` +
      `1 ${v1[0]!.id} · trocar\n` +
      `${left.position} ${left.id} · trocar · estrelas: 3\n`

    const out = await answer(fixture, id, text)

    expect([out.version, out.currentVersion]).toEqual([1, 2])
    expect(out.dropped).toEqual([
      { position: 1, id: v1[0]!.id, title: v1[0]!.title, cause: 'swapped' },
    ])
    expect(out.keep).toEqual(
      second.films.map((g) => g.id).filter((g) => g !== v1[0]!.id),
    )
    expect(
      out.warnings.some((w) => w.includes(left.id) && w.includes('trocar')),
    ).toBe(true)
    const top = front(fixture, id)
    expect(top['replies']).toBeUndefined()
    expect(top['versions'][0]['replies'][0]['films']).toEqual([
      { position: left.position, id: left.id, stars: 3 },
    ])
  })

  test('the current version’s replies go with it when the Session is redone', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture, 'iara')
    await answer(fixture, id, `#cartaz ${id} v1\n1 ${f[0]!.id} · estrelas: 5\n`)

    await fixture.ok(
      recommendSession({ attendees: ['dono', 'iara'], session: id }),
    )

    const top = front(fixture, id)
    expect(top['replies']).toBeUndefined()
    expect(top['versions'][0]['replies'][0]['films'][0]['stars']).toBe(5)
  })
})

describe('cartaz responder (test_cartaz_responder)', () => {
  test('a text with conversation around it is read from the Cartaz line', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture, 'iara')

    const out = await answer(
      fixture,
      id,
      `olha só o que marquei:\n\n#cartaz ${id} v1\n2 ${f[1]!.id} · trocar\n\nvaleu!\n3 ${f[2]!.id} · trocar\n`,
    )

    expect(out.dropped.map((s) => s.id)).toEqual([f[1]!.id])
  })

  test('another Session, or a text that is not a Cartaz’s, is invalid_usage', async () => {
    const fixture = useFixture()
    const { id } = await open(fixture, 'iara')

    for (const text of [
      'oi, tudo bem?\n',
      '#cartaz 2026-01-01-outra v1\n',
      `#cartaz ${id} v9\n`,
    ]) {
      const outcome = await fixture.run(answerBillboard({ session: id, text }))
      expect(outcome.exitCode).toBe(2)
      expect(outcome.output).toMatchObject({
        error: { code: 'invalid_usage' },
      })
    }
    const unknown = await fixture.run(
      answerBillboard({
        session: 'nao-existe',
        text: '#cartaz nao-existe v1\n',
      }),
    )
    expect(unknown.exitCode).toBe(2)
    expect(unknown.output).toMatchObject({ error: { code: 'invalid_usage' } })
  })

  test('a closed Session is closed_session', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture, 'iara')
    await fixture.ok(recordFeedback({ session: id, film: f[0]!.id }))

    const outcome = await fixture.run(
      answerBillboard({ session: id, text: `#cartaz ${id} v1\n` }),
    )

    expect(outcome.output).toMatchObject({ error: { code: 'closed_session' } })
  })
})

describe('cartaz responder (test_cartaz_responder)', () => {
  test('Já vi of someone who was not there is an error and nothing is written', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture, 'iara')
    const file = join(fixture.data, 'people', 'iara.md')
    const before = readFileSync(file, 'utf8')

    const outcome = await fixture.run(
      answerBillboard({
        session: id,
        text: `#cartaz ${id} v1\n1 ${f[0]!.id} · já vi: iara\n2 ${f[1]!.id} · já vi: teo\n`,
      }),
    )

    expect(outcome.exitCode).toBe(2)
    expect(readFileSync(file, 'utf8')).toBe(before)
  })
})

describe('cartaz responder (test_cartaz_responder)', () => {
  test('end to end, the text the Cartaz builds is the one the reply reads', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture, 'iara')
    const text = billboardText(
      state(id, 1, ['bruno', 'iara'], 'algo\n leve', [
        {
          position: 1,
          id: f[0]!.id,
          seen: ['iara'],
          ratings: { iara: 9 },
          stars: 3,
        },
        { position: 2, id: f[1]!.id, seen: ['bruno', 'iara'] },
        {
          position: 3,
          id: f[2]!.id,
          swap: true,
          comment: 'já cansei · de drama',
        },
        { position: 4, id: f[3]!.id, stars: 5 },
        { position: 5, id: f[4]!.id },
      ]),
    )

    const out = await answer(fixture, id, text)

    expect(out.seen.map((v) => [v.person, v.film, v.rating])).toEqual([
      ['iara', f[0]!.id, 4.5],
      ['bruno', f[1]!.id, null],
      ['iara', f[1]!.id, null],
    ])
    expect(out.dropped.map((s) => [s.id, s.cause])).toEqual([
      [f[0]!.id, 'seen'],
      [f[1]!.id, 'seen'],
      [f[2]!.id, 'swapped'],
    ])
    expect(out.keep).toEqual([f[3]!.id, f[4]!.id])
    expect(out.addition).toBe('algo leve')
    expect(out.comments.map((c) => c.comment)).toEqual(['já cansei · de drama'])
    expect(out.stars.map((e) => [e.id, e.stars])).toEqual([
      [f[0]!.id, 3],
      [f[3]!.id, 5],
    ])
    expect(out.regenerate).toBe(true)
    expect(out.warnings).toEqual([])

    // Regenerating with what stays drops the same films, for the same reasons.
    const redone = await fixture.ok(
      recommendSession({
        attendees: ['dono', 'iara'],
        session: id,
        keep: [out.keep.join(',')],
      }),
    )
    expect(redone.dropped?.map((s) => [s.id, s.cause])).toEqual(
      out.dropped.map((s) => [s.id, s.cause]),
    )
  })
})

describe('cartaz responder (test_cartaz_responder)', () => {
  test('pasting the same text again duplicates neither the reply nor the Já visto', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture, 'iara')
    const film = f[0]!.id
    const text = `#cartaz ${id} v1\n1 ${film} · já vi: iara=8 · estrelas: 4\n`

    await answer(fixture, id, text)
    await answer(fixture, id, text)
    const second = await answer(fixture, id, text.replace('iara=8', 'iara=9'), {
      FILMES_HOJE: '2026-11-21',
    })

    expect(front(fixture, id)['replies'].map((r: any) => r.films)).toEqual([
      [{ position: 1, id: film, stars: 4 }],
    ])
    const iara = await view(fixture, 'iara')
    expect(iara.seen.map((v) => [v.film, v.rating])).toEqual([[film, 4.5]])
    expect(
      iara.ratings?.filter((n) => n.filmId === film).map((n) => n.rating),
    ).toEqual([4.5])
    expect(second.seen.map((v) => [v.person, v.rating, v.new])).toEqual([
      ['iara', 4.5, false],
    ])
  })

  test('a mark of a film off the version’s screen is skipped with a warning', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture, 'iara')
    const outside = 'tt9000101'
    expect(f.map((x) => x.id)).not.toContain(outside)
    const file = join(fixture.data, 'people', 'iara.md')
    const before = readFileSync(file, 'utf8')

    const out = await answer(
      fixture,
      id,
      `#cartaz ${id} v1\n6 ${outside} · já vi: iara · trocar · estrelas: 3 · comentário: oi\n`,
    )

    expect(readFileSync(file, 'utf8')).toBe(before)
    expect([out.seen, out.stars, out.comments]).toEqual([[], [], []])
    expect(out.regenerate).toBe(false)
    expect(front(fixture, id)['replies']).toBeUndefined()
    expect(
      out.warnings.some((w) => w.includes(outside) && w.includes('tela')),
    ).toBe(true)
  })
})

describe('cartaz responder (test_cartaz_responder)', () => {
  test('what she thought becomes her specific Declarado about the film', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture, 'iara')
    const text =
      `#cartaz ${id} v1\n1 ${f[0]!.id} · já vi: iara=8 · achou: final lindo\n` +
      `2 ${f[1]!.id} · já vi: iara · achou: nada demais\n`

    const out = await answer(fixture, id, text)
    await answer(fixture, id, text)

    const stated = (await view(fixture, 'iara')).stated
      .filter(fromCartaz(id))
      .map((d) => [d.target, d.reaction, d.text, d.specific, d.source])
    expect(stated).toEqual([
      [f[0]!.id, 'like', 'final lindo', true, `cartaz ${id}`],
      [f[1]!.id, null, 'nada demais', true, `cartaz ${id}`],
    ])
    expect(out.seen.map((v) => [v.film, v.comment])).toEqual([
      [f[0]!.id, 'final lindo'],
      [f[1]!.id, 'nada demais'],
    ])
  })

  test('what she thought, pasted again with other text, replaces the earlier one', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture, 'iara')
    const film = f[0]!.id

    await answer(
      fixture,
      id,
      `#cartaz ${id} v1\n1 ${film} · já vi: iara=8 · achou: bom\n`,
    )
    await answer(
      fixture,
      id,
      `#cartaz ${id} v1\n1 ${film} · já vi: iara=3 · achou: pensei melhor, ruim\n`,
    )

    const stated = (await view(fixture, 'iara')).stated
      .filter(fromCartaz(id))
      .map((d) => [d.reaction, d.text])
    expect(stated).toEqual([['dislike', 'pensei melhor, ruim']])
  })
})

describe('cartaz responder (test_cartaz_responder)', () => {
  test('each Pessoa of the Já vi has her own Nota and what she thought', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture, 'iara')
    const film = f[0]!.id

    const out = await answer(
      fixture,
      id,
      `#cartaz ${id} v1\n1 ${film} · já vi: bruno=9, iara=3 · achou bruno: lindo · achou iara: chato\n`,
    )

    expect(out.seen.map((v) => [v.person, v.rating, v.comment])).toEqual([
      ['bruno', 4.5, 'lindo'],
      ['iara', 1.5, 'chato'],
    ])
    const iara = (await view(fixture, 'iara')).stated
      .filter(fromCartaz(id))
      .map((d) => [d.reaction, d.text])
    expect(iara).toEqual([['dislike', 'chato']])
  })

  test('an empty acrescentar or comment is none, and a Nota of 5 or 6 gives no reaction', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture, 'iara')

    const out = await answer(
      fixture,
      id,
      `#cartaz ${id} v1\nacrescentar:   \nacrescentar: algo leve\n` +
        `1 ${f[0]!.id} · já vi: iara=5 · achou: ok · comentário:  \n`,
    )

    expect(out.addition).toBe('algo leve')
    expect(out.comments).toEqual([])
    const stated = (await view(fixture, 'iara')).stated.filter(fromCartaz(id))
    expect(stated.map((d) => [d.text, d.reaction])).toEqual([['ok', null]])
  })

  test('only acrescentar is a reply with no films, and it regenerates', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture, 'iara')

    const out = await answer(
      fixture,
      id,
      `#cartaz ${id} v1\nacrescentar: chegou a Ana\n`,
    )

    expect(front(fixture, id)['replies']).toEqual([
      { date: '2026-11-20', addition: 'chegou a Ana' },
    ])
    expect([out.regenerate, out.keep]).toEqual([true, f.map((x) => x.id)])
  })
})

describe('cartaz responder (test_cartaz_responder)', () => {
  test('another Clima redoes the whole list, and the same one asks nothing', async () => {
    const fixture = useFixture()
    const { id } = await open(fixture, 'iara')

    const lighter = await answer(fixture, id, `#cartaz ${id} v1\nclima: Leve\n`)
    const same = await answer(fixture, id, `#cartaz ${id} v1\nclima: nenhum\n`)

    expect([lighter.regenerate, lighter.moods, lighter.keep]).toEqual([
      true,
      ['leve'],
      [],
    ])
    expect([same.regenerate, same.moods]).toEqual([false, null])
    expect(front(fixture, id)['replies']).toBeUndefined()
  })

  test('a Clima outside the vocabulary is a warning', async () => {
    const fixture = useFixture()
    const { id } = await open(fixture, 'iara')

    const out = await answer(
      fixture,
      id,
      `#cartaz ${id} v1\nclima: tenso, épico\n`,
    )

    expect(out.moods).toEqual(['tenso'])
    expect(out.warnings).toEqual([
      expect.stringContaining("o Clima 'épico' não está no vocabulário"),
    ])
  })

  test('what someone not in the Já vi thought is invalid_usage', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture, 'iara')

    for (const marks of [
      'já vi: iara · achou bruno: bom',
      'já vi: bruno, iara · achou: bom',
      'achou: bom',
      'estrelas: 6',
    ]) {
      const outcome = await fixture.run(
        answerBillboard({
          session: id,
          text: `#cartaz ${id} v1\n1 ${f[0]!.id} · ${marks}\n`,
        }),
      )
      expect(outcome.exitCode).toBe(2)
      expect(outcome.output).toMatchObject({ error: { code: 'invalid_usage' } })
    }
  })
})

// --- the text (the textoDoCartaz half of tests/test_cartaz_responde.py) ------

type Marked = Partial<BillboardMarks> & Pick<BillboardMarks, 'position' | 'id'>

const state = (
  session: string,
  version: number,
  attendees: string[],
  addition = '',
  films: Marked[] = [],
): BillboardState => ({
  session,
  version,
  attendees,
  addition,
  films: films.map((f) => ({
    seen: [],
    ratings: {},
    thoughts: {},
    swap: false,
    stars: 0,
    comment: '',
    ...f,
  })),
})

describe('the text the Cartaz copies (test_cartaz_responde)', () => {
  test('header, acrescentar and one line per marked film', () => {
    expect(
      billboardText(
        state(
          '2026-11-20-iara',
          2,
          ['bruno', 'iara'],
          '  chegou a Ana,\n algo leve ',
          [
            {
              position: 1,
              id: 'tt9000104',
              seen: ['bruno'],
              ratings: { bruno: 8 },
              stars: 4,
            },
            { position: 2, id: 'tt9000105' },
            { position: 3, id: 'tt9000106', seen: ['bruno', 'iara'] },
            {
              position: 4,
              id: 'tt9000107',
              seen: ['iara'],
              swap: true,
              comment: 'lindo,\n mas · longo',
            },
            { position: 5, id: 'tt9000108', stars: 2 },
          ],
        ),
      ),
    ).toBe(
      '#cartaz 2026-11-20-iara v2\n' +
        'acrescentar: chegou a Ana, algo leve\n' +
        '1 tt9000104 · já vi: bruno=8 · estrelas: 4\n' +
        '3 tt9000106 · já vi: todos\n' +
        '4 tt9000107 · já vi: iara · trocar · comentário: lindo, mas · longo\n' +
        '5 tt9000108 · estrelas: 2\n',
    )
  })
})

describe('the text the Cartaz copies (test_cartaz_responde)', () => {
  test('each marked Pessoa has her own Nota and what she thought, even with several', () => {
    expect(
      billboardText(
        state('s', 1, ['bruno', 'iara', 'teo'], '', [
          {
            position: 1,
            id: 'tt1',
            seen: ['teo', 'bruno'],
            ratings: { bruno: 9, teo: 6 },
            thoughts: { teo: ' meio · arrastado\n ', bruno: 'lindo' },
          },
          {
            position: 2,
            id: 'tt2',
            seen: ['bruno', 'iara', 'teo'],
            ratings: { iara: 3 },
            thoughts: { iara: 'chato' },
          },
          { position: 3, id: 'tt3', seen: ['bruno', 'iara', 'teo'] },
          {
            position: 4,
            id: 'tt4',
            seen: ['iara'],
            ratings: { bruno: 5 },
            thoughts: { bruno: 'some' },
          },
        ]),
      ),
    ).toBe(
      '#cartaz s v1\n' +
        '1 tt1 · já vi: bruno=9, teo=6 · achou bruno: lindo · achou teo: meio - arrastado\n' +
        '2 tt2 · já vi: bruno, iara=3, teo · achou iara: chato\n' +
        '3 tt3 · já vi: todos\n' +
        '4 tt4 · já vi: iara\n',
    )
  })

  test('Já vi alone with one Presente is not todos', () => {
    expect(
      billboardText(
        state('s', 1, ['bruno'], '', [
          {
            position: 1,
            id: 'tt1',
            seen: ['bruno'],
            ratings: { bruno: 10 },
            thoughts: { bruno: 'obra-prima' },
          },
        ]),
      ),
    ).toBe('#cartaz s v1\n1 tt1 · já vi: bruno=10 · achou bruno: obra-prima\n')
  })
})

describe('the text the Cartaz copies (test_cartaz_responde)', () => {
  test('the Climas the Dono chose go after acrescentar; none is nenhum', () => {
    const chose = (moods: string[]) =>
      billboardText({ ...state('s', 2, ['bruno'], 'chegou a Ana'), moods })

    expect(chose(['leve', 'pra rir'])).toBe(
      '#cartaz s v2\nacrescentar: chegou a Ana\nclima: leve, pra rir\n',
    )
    expect(chose([])).toBe(
      '#cartaz s v2\nacrescentar: chegou a Ana\nclima: nenhum\n',
    )
  })

  test('with nothing marked the text is only the header', () => {
    expect(billboardText(state('s', 3, ['bruno'], '   '))).toBe(
      '#cartaz s v3\n',
    )
  })
})
