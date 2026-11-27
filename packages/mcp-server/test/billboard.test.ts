// mcp/test/servidor.test.ts (the `cartaz` part), cartaz_responder.test.ts and
// verificar.test.ts, on the engine.

import assert from 'node:assert/strict'
import { personView } from '@filmes/engine'
import { describe, test } from 'vite-plus/test'
import { useFixture } from '../../engine/test/fixture.ts'
import { RECORDINGS } from '../../engine/test/sources/support.ts'
import { connect } from './connect.ts'

describe('billboard', () => {
  test('gives the Cartaz of the Session as data', async () => {
    const { ok } = await connect(useFixture())
    const recommendation = await ok('recommend', { attendees: ['dono'] })

    const output = await ok('billboard', { session: recommendation.session.id })

    assert.equal(output.session, recommendation.session.id)
    assert.equal(output.films, 5)
    assert.deepEqual(
      output.billboard.films.map((f: { id: string }) => f.id),
      recommendation.films.map((f: { id: string }) => f.id),
    )
    assert.equal(output.billboard.attendees[0].label, 'Você')
  })

  test('a card carries the trailer link TMDB gives, and no other has one', async () => {
    const { ok } = await connect(useFixture(), null, {
      FILMES_TMDB_CHAVE: 'chave-de-teste',
      FILMES_GRAVACOES: RECORDINGS,
    })
    const recommendation = await ok('recommend', { attendees: ['dono'] })

    const output = await ok('billboard', { session: recommendation.session.id })

    const trailers = output.billboard.films
      .filter((f: { trailer?: string }) => f.trailer !== undefined)
      .map((f: { id: string; trailer: string }) => [f.id, f.trailer])
    assert.deepEqual(trailers, [
      ['tt9000104', 'https://www.youtube.com/watch?v=hOrAsPtBr01'],
      ['tt9000105', 'https://www.youtube.com/watch?v=sAlTrUsTeN1'],
    ])
  })

  test('with films, only those, in the given order, recorded as shown', async () => {
    const { ok } = await connect(useFixture())
    const recommendation = await ok('recommend', { attendees: ['dono'] })
    const [first, , third] = recommendation.films

    const output = await ok('billboard', {
      session: recommendation.session.id,
      films: [third.id, first.id],
    })

    assert.equal(output.films, 2)
    assert.deepEqual(
      output.billboard.films.map((f: { position: number; id: string }) => [
        f.position,
        f.id,
      ]),
      [
        [1, third.id],
        [2, first.id],
      ],
    )
    const feedback = await ok('record_feedback', {
      session: recommendation.session.id,
      film: first.id,
    })
    assert.equal(feedback.chosen.shownPosition, 2)
  })
})

describe('answer_billboard', () => {
  test('records the Já vi with a rating and asks to regenerate', async () => {
    const { ok, fixture } = await connect(useFixture())
    const recommendation = await ok('recommend', {
      attendees: ['dono', 'iara'],
    })
    const session = recommendation.session.id
    const [a, b, c] = recommendation.films.map((f: { id: string }) => f.id)
    const text =
      `Marquei aqui:\n#cartaz ${session} v1\nacrescentar: --algo leve\n` +
      `1 ${a} · já vi: iara=8\n2 ${b} · trocar\n3 ${c} · estrelas: 4 · comentário: -- bom\n`

    const output = await ok('answer_billboard', { session, text })

    assert.equal(output.regenerate, true)
    assert.deepEqual(
      output.dropped.map((d: { id: string; cause: string }) => [d.id, d.cause]),
      [
        [a, 'seen'],
        [b, 'swapped'],
      ],
    )
    assert.ok(!output.keep.includes(a) && output.keep.includes(c))
    assert.equal(output.addition, '--algo leve')
    assert.deepEqual(
      output.comments.map((x: { comment: string }) => x.comment),
      ['-- bom'],
    )
    const iara = await fixture.ok(personView('iara'))
    assert.ok(iara.seen.some((v) => v.film === a && v.rating === 4))

    const redone = await ok('recommend', {
      attendees: ['dono', 'iara'],
      session,
      keep: output.keep,
    })
    assert.ok(
      !redone.films.some((f: { id: string }) => f.id === a || f.id === b),
    )
  })

  test('a text that is not from the Cartaz is invalid_usage', async () => {
    const { ok, error } = await connect(useFixture())
    const session = (await ok('recommend', { attendees: ['dono'] })).session.id

    const output = await error('answer_billboard', { session, text: 'oi' })

    assert.equal(output.error.code, 'invalid_usage')
  })
})

describe('verify_answer', () => {
  test('gives the lines the Session does not hold', async () => {
    const { ok } = await connect(useFixture())
    const { session } = await ok('recommend', {
      attendees: ['dono', 'teo'],
      by: 'dono',
      count: 1,
    })
    const valid = '- **Teo:** sem fato *(fraca, palpite)*'
    const invalid = '- **Teo:** gosta muito da diretora *(forte, declarado)*'
    const start = 'Você e Teo.\n\n**1. As Horas Lentas** (2021, 1h44)\n'

    assert.deepEqual(
      await ok('verify_answer', { session: session.id, text: start + valid }),
      { valid: true, invalidLines: [] },
    )
    assert.deepEqual(
      await ok('verify_answer', { session: session.id, text: start + invalid }),
      { valid: false, invalidLines: [invalid] },
    )
  })
})
