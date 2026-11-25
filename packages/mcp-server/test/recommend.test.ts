// mcp/test/servidor.test.ts (the `recomendar` part) and parecido.test.ts,
// on the engine.

import assert from 'node:assert/strict'
import { readMoods } from '@filmes/engine'
import { describe, test } from 'vite-plus/test'
import { MOODS } from '../src/tools/recommend.ts'
import { useFixture } from '../../engine/test/fixture.ts'
import { connect, failureText } from './connect.ts'

type Film = {
  id: string
  title: string
  new?: boolean
  filmLines: Array<{ text: string }>
}

const titles = (output: { films: Film[] }) => output.films.map((f) => f.title)

describe('recommend', () => {
  test('gives the Dono top 5 with Evidence grouped by Presente', async () => {
    const { ok } = await connect(useFixture())

    const output = await ok('recommend', { attendees: ['dono'] })

    assert.deepEqual(output.attendees, ['bruno'])
    assert.equal(output.films.length, 5)
    assert.equal(output.films[0].title, 'As Horas Lentas')
    for (const film of output.films) {
      assert.deepEqual(Object.keys(film.evidence), ['bruno'])
      for (const evidence of film.evidence.bruno)
        assert.deepEqual(Object.keys(evidence).sort(), [
          'contribution',
          'date',
          'factId',
          'kind',
          'person',
          'source',
          'strength',
          'text',
        ])
    }
  })

  test('passes the Regra de escolha', async () => {
    const { ok } = await connect(useFixture())

    const output = await ok('recommend', {
      attendees: ['dono', 'Iara'],
      rule: 'by',
      by: 'iara',
    })

    assert.deepEqual(output.rule, { name: 'by', person: 'iara' })
    assert.equal(output.films[0].title, 'Inverno em Lisboa')
    assert.deepEqual(Object.keys(output.films[0].evidence), ['bruno', 'iara'])
  })

  test('the Climas in the description are the engine vocabulary', async () => {
    const { client, ok, fixture } = await connect(useFixture())
    const { tools } = await client.listTools()
    const moods = tools.find((t) => t.name === 'recommend')!.inputSchema
      .properties!['moods'] as { description: string }
    const vocabulary = moods.description
      .match(/vocabulário fixo: ([^.]+)\./)![1]!
      .split(', ')
    const engineMoods = await fixture.ok(readMoods)
    assert.deepEqual(vocabulary, MOODS)
    assert.deepEqual(
      engineMoods.map((m) => m.name),
      MOODS,
    )

    const output = await ok('recommend', {
      attendees: ['dono'],
      moods: [...vocabulary, ' épico ', '--sem-ja-visto'],
    })

    assert.deepEqual(output.moods, vocabulary)
    const [warning, dashed] = output.warnings
    assert.ok(warning.startsWith("o Clima 'épico' não está no vocabulário"))
    assert.ok(warning.endsWith(`Os Climas são ${vocabulary.join(', ')}.`))
    assert.ok(
      dashed.startsWith("o Clima '--sem-ja-visto' não está no vocabulário"),
    )
    // A Clima that looks like a flag asks for no Restrição: only the Série
    // na ordem, on by default (#165).
    assert.deepEqual(Object.keys(output.constraints), ['series_order'])
    assert.ok(Array.isArray(output.films[0].filmLines))
  })

  test('passes the Session Restrições', async () => {
    const { ok } = await connect(useFixture())

    const output = await ok('recommend', {
      attendees: ['dono'],
      count: 50,
      maxDuration: 110,
      language: 'pt',
      childAge: 7,
      triggers: ['a dog dies'],
    })

    assert.deepEqual(Object.keys(output.constraints).sort(), [
      'child',
      'duration',
      'language',
      'series_order',
      'trigger',
    ])
    assert.equal(output.constraints.child.age, 7)
    assert.deepEqual(output.constraints.trigger.themes, ['a dog dies'])
    // In Portuguese, up to 1h50 and rating 6, only Maré Baixa is left; with
    // no Does the Dog Die key, it carries a warning line.
    assert.deepEqual(titles(output), ['Maré Baixa'])
    assert.deepEqual(
      output.films[0].filmLines.map((e: { text: string }) => e.text).sort(),
      [
        'duração 1h38, dentro do limite de 1h50',
        'classificação L (Kijkwijzer AL convertida)',
        'sem informação do Does the Dog Die sobre "a dog dies"',
        'idioma original português',
      ].sort(),
    )
  })

  test('unseen drops what the Dono saw', async () => {
    const { ok } = await connect(useFixture())

    const output = await ok('recommend', {
      attendees: ['dono'],
      count: 50,
      unseen: true,
    })

    assert.ok(titles(output).includes('As Horas Lentas'))
    assert.ok(!titles(output).includes('O Farol de Areia'))
  })

  test('passes the year range', async () => {
    const { ok } = await connect(useFixture())

    const output = await ok('recommend', {
      attendees: ['dono'],
      count: 50,
      since: 2015,
      until: 2016,
    })

    const { removed, ...year } = output.constraints.year
    assert.deepEqual(year, { since: 2015, until: 2016 })
    assert.ok(removed > 0)
    assert.ok(titles(output).includes('Maré Baixa'))
    assert.ok(!titles(output).includes('O Farol de Areia'))
  })

  test('noSad drops the sad film and counts by signal', async () => {
    const { ok } = await connect(useFixture())

    const output = await ok('recommend', {
      attendees: ['dono'],
      count: 100,
      noSad: true,
    })

    assert.deepEqual(output.constraints.no_sad, {
      bySignal: { sad: 2, heavy_theme: 6 },
      removed: 8,
    })
    assert.ok(titles(output).includes('Casa Cheia'))
    assert.ok(!titles(output).includes('Pequenos Milagres'))
  })

  test('noSlow drops the film with a slow-pace tag', async () => {
    const { ok } = await connect(useFixture())

    const output = await ok('recommend', {
      attendees: ['dono'],
      count: 100,
      noSlow: true,
    })

    assert.deepEqual(output.constraints.no_slow, { removed: 3 })
    assert.ok(!titles(output).includes('Drama Juvenil'))
  })

  test('a child with no age means rating L', async () => {
    const { ok } = await connect(useFixture())

    const output = await ok('recommend', {
      attendees: ['dono'],
      count: 50,
      child: true,
    })

    assert.equal(output.constraints.child.age, 0)
    assert.deepEqual(titles(output).sort(), ['Maré Baixa', 'O Farol de Areia'])
  })

  test('keep leaves the kept film in its place and says what left', async () => {
    const { ok } = await connect(useFixture())
    const first = await ok('recommend', { attendees: ['dono', 'iara'] })
    const [one, two] = first.films

    const redone = await ok('recommend', {
      attendees: ['dono', 'iara'],
      session: first.session.id,
      keep: [two.id],
    })

    assert.deepEqual([redone.films[1].id, redone.films[1].new], [two.id, false])
    assert.equal(redone.films[0].new, true)
    assert.deepEqual(redone.kept, [two.id])
    assert.deepEqual(redone.dropped[0], {
      position: 1,
      id: one.id,
      title: one.title,
      cause: 'swapped',
    })
  })

  test('session redoes the Recomendação in the same open Session', async () => {
    const { ok } = await connect(useFixture())
    const first = await ok('recommend', {
      attendees: ['dono', 'quim'],
      request: 'algo bom',
    })

    const redone = await ok('recommend', {
      attendees: ['dono', 'quim'],
      request: 'algo curto',
      maxDuration: 100,
      session: first.session.id,
    })

    assert.deepEqual(redone.session, { ...first.session, version: 2 })
    assert.deepEqual(redone.constraints.out_of_session, {
      swapped: 0,
      seen: 0,
      removed: 0,
    })
    const open = await ok('open_sessions')
    assert.deepEqual(
      open.sessions
        .filter((s: { attendees: string[] }) => s.attendees.includes('quim'))
        .map((s: { request: string; version: number }) => [
          s.request,
          s.version,
        ]),
      [['algo curto', 2]],
    )
  })

  test('swap records the screen as Trocados and the redo brings others', async () => {
    const { ok } = await connect(useFixture())
    const first = await ok('recommend', { attendees: ['dono'] })
    const screen = first.films.map((f: Film) => f.id)

    const second = await ok('recommend', {
      attendees: ['dono'],
      session: first.session.id,
      swap: screen,
    })

    assert.equal(
      second.films.filter((f: Film) => screen.includes(f.id)).length,
      0,
    )
    assert.equal(second.constraints.out_of_session.swapped, screen.length)
  })

  test('an engine error comes back as a tool error', async () => {
    const { error } = await connect(useFixture())

    const output = await error('recommend', { attendees: ['fulano'] })

    assert.equal(output.error.code, 'unknown_person')
  })

  test('bad input is refused before the engine', async () => {
    const { call } = await connect(useFixture())

    assert.match(
      failureText(await call('recommend', { attendees: [] })),
      /attendees/,
    )
    assert.match(
      failureText(
        await call('recommend', {
          attendees: ['dono'],
          similar: ['Stuck in Love'],
        }),
      ),
      /similar/,
    )
  })
})

describe('recommend with similar (#67, #68)', () => {
  test('only the films similar to the references, with the line why', async () => {
    const { ok } = await connect(useFixture())

    const output = await ok('recommend', {
      attendees: ['dono'],
      similar: ['tt9006702'],
    })

    assert.deepEqual(
      output.films.map((f: Film) => f.id),
      ['tt9006713'],
    )
    assert.equal(
      output.films[0].filmLines[0].text,
      'parecido com Estrada Afora: road trip',
    )
    assert.ok(
      output.warnings.includes(
        'só 1 parecido com Estrada Afora passou nas Restrições',
      ),
    )
  })

  test('similar stays in the Session and noSimilar takes it off', async () => {
    const { ok } = await connect(useFixture())
    const first = await ok('recommend', {
      attendees: ['dono'],
      similar: ['tt9006702'],
    })
    const session = first.session.id

    const second = await ok('recommend', { attendees: ['dono'], session })
    const third = await ok('recommend', {
      attendees: ['dono'],
      session,
      noSimilar: true,
    })

    assert.deepEqual(second.constraints.similar.films, ['tt9006702'])
    assert.deepEqual(
      second.films.map((f: Film) => f.id),
      ['tt9006713'],
    )
    assert.equal(third.constraints.similar, undefined)
  })
})

describe('recommend with the Série na ordem (#165)', () => {
  test('a sequel only when every Presente saw the film before; seriesOrder changes it', async () => {
    const { ok } = await connect(useFixture())
    const all = { attendees: ['teo'], count: 100 }

    const byDefault = titles(await ok('recommend', all))
    const off = titles(await ok('recommend', { ...all, seriesOrder: 'off' }))

    assert.ok(byDefault.includes('Cais'))
    assert.ok(!byDefault.includes('Cais 2'))
    assert.ok(off.includes('Cais 2'))
  })

  test('the mode stays in the Session, and a kept film that leaves says who did not see what', async () => {
    const { ok } = await connect(useFixture())
    const first = await ok('recommend', {
      attendees: ['rosa'],
      count: 100,
      seriesOrder: 'off',
    })
    const session = first.session.id

    const second = await ok('recommend', {
      attendees: ['rosa', 'teo'],
      count: 100,
      session,
      keep: ['tt9016503'],
    })

    assert.deepEqual(second.constraints.series_order, {
      mode: 'off',
      removed: 0,
    })
    const third = await ok('recommend', {
      attendees: ['rosa', 'teo'],
      count: 100,
      session,
      keep: ['tt9016503'],
      seriesOrder: 'previous',
    })
    const { position: _, ...cais3 } = third.dropped.find(
      (d: { id: string }) => d.id === 'tt9016503',
    )
    assert.deepEqual(cais3, {
      id: 'tt9016503',
      title: 'Cais 3',
      cause: 'constraint',
      constraint: 'series_order',
      label: 'Teo não viu Cais 2',
      unseen: [{ people: ['teo'], films: ['Cais 2'] }],
    })
  })

  test('a mode outside the three is refused before the engine', async () => {
    const { call } = await connect(useFixture())

    assert.match(
      failureText(
        await call('recommend', {
          attendees: ['teo'],
          seriesOrder: 'sometimes',
        }),
      ),
      /seriesOrder/,
    )
  })
})
