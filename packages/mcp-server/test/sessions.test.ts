// mcp/test/servidor.test.ts (open Sessions and Feedback) and feedback.test.ts,
// on the engine.

import assert from 'node:assert/strict'
import { consult } from '@filmes/engine'
import { describe, test } from 'vite-plus/test'
import { useFixture } from '../../engine/test/fixture.ts'
import { connect, failureText } from './connect.ts'

/** The Facts other than the Já visto every Presente gets. */
const notSeen = (facts: any[]) =>
  facts.filter((f: { text: string }) => f.text !== 'já viu')

describe('open_sessions and record_feedback', () => {
  test('recommend opens the Session, open_sessions lists it and record_feedback closes it', async () => {
    const { ok } = await connect(useFixture())
    const request = '-- eu e o Teo, qualquer coisa'
    const recommendation = await ok('recommend', {
      attendees: ['dono', 'teo'],
      request,
    })
    const session = recommendation.session.id
    assert.equal(session, '2026-11-20-teo')

    const open = await ok('open_sessions')
    assert.deepEqual(
      open.sessions
        .filter((s: { id: string }) => s.id === session)
        .map((s: { request: string }) => s.request),
      [request],
    )

    const feedback = await ok('record_feedback', {
      session,
      film: recommendation.films[0].title,
      ratings: [{ person: 'dono', rating: 4.5 }],
      reports: [{ person: 'teo', reaction: 'disliked' }],
    })

    assert.equal(feedback.chosen.position, 1)
    assert.deepEqual(
      notSeen(feedback.facts).map((f: { person: string; kind: string }) => [
        f.person,
        f.kind,
      ]),
      [
        ['bruno', 'rating'],
        ['teo', 'report'],
      ],
    )
    const after = await ok('open_sessions')
    assert.ok(!after.sessions.some((s: { id: string }) => s.id === session))
  })

  test('nothing closes with no film, and film with it is refused', async () => {
    const { ok, call } = await connect(useFixture())
    const session = (await ok('recommend', { attendees: ['iara'] })).session.id

    assert.match(
      failureText(
        await call('record_feedback', {
          session,
          nothing: true,
          film: 'Vento Norte',
        }),
      ),
      /film ou nothing/,
    )
    assert.match(
      failureText(await call('record_feedback', { session })),
      /film ou nothing/,
    )

    const nothing = await ok('record_feedback', { session, nothing: true })
    assert.equal(nothing.chosen, null)
  })

  test('correct replaces the Feedback of a told Session (#344)', async () => {
    const { ok, call } = await connect(useFixture())
    const session = (await ok('recommend', { attendees: ['iara'] })).session.id
    await ok('record_feedback', { session, nothing: true })

    assert.match(
      failureText(
        await call('record_feedback', { session, film: 'Noite de Estreia' }),
      ),
      /já tem Feedback/,
    )
    const corrected = await ok('record_feedback', {
      session,
      film: 'Noite de Estreia',
      correct: true,
    })
    assert.equal(corrected.chosen.id, 'tt9000203')
  })

  test('a 1-10 rating is halved, the original kept, and the comment becomes a Declarado', async () => {
    const { ok, fixture } = await connect(useFixture())
    const session = (
      await ok('recommend', { attendees: ['dono', 'iara', 'teo'] })
    ).session.id

    const output = await ok('record_feedback', {
      session,
      film: 'Noite de Estreia',
      ratings: [
        {
          person: 'dono',
          rating: 9,
          scale: 10,
          comment: '-- enquadramento e diálogo muito bons',
        },
        { person: 'iara', rating: 2 },
      ],
      reports: [
        {
          person: 'teo',
          reaction: 'disliked',
          comment: 'muita violência sem sentido',
        },
      ],
    })

    assert.deepEqual(
      notSeen(output.facts).map((f: { person: string; text: string }) => [
        f.person,
        f.text,
      ]),
      [
        ['bruno', 'deu 9/10 a Noite de Estreia (2022)'],
        ['iara', 'deu 4 de 10 a Noite de Estreia (2022)'],
        ['teo', 'não gostou de Noite de Estreia (2022)'],
        [
          'bruno',
          'disse "-- enquadramento e diálogo muito bons" de Noite de Estreia (2022)',
        ],
        [
          'teo',
          'disse "muita violência sem sentido" de Noite de Estreia (2022)',
        ],
      ],
    )
    const ratings = await fixture.ok(
      consult(
        'SELECT pessoa, nota FROM notas WHERE sessao IS NOT NULL ORDER BY pessoa',
      ),
    )
    assert.deepEqual(ratings.rows, [
      ['bruno', 4.5],
      ['iara', 2],
    ])
  })

  test('each report level reaches the engine', async () => {
    const { ok } = await connect(useFixture())
    const session = (
      await ok('recommend', { attendees: ['dono', 'iara', 'teo'] })
    ).session.id

    const output = await ok('record_feedback', {
      session,
      film: 'Noite de Estreia',
      reports: [
        { person: 'iara', reaction: 'liked' },
        { person: 'teo', reaction: 'neutral' },
      ],
    })

    assert.deepEqual(
      notSeen(output.facts).map((f: { text: string }) => f.text),
      [
        'gostou de Noite de Estreia (2022)',
        'achou Noite de Estreia (2022) neutro',
      ],
    )
  })

  test('a rating outside the 1-10 scale is refused', async () => {
    const { ok, call } = await connect(useFixture())
    const session = (await ok('recommend', { attendees: ['iara'] })).session.id

    assert.match(
      failureText(
        await call('record_feedback', {
          session,
          film: 'Vento Norte',
          ratings: [{ person: 'iara', rating: 0.5, scale: 10 }],
        }),
      ),
      /a Nota vai de 0,5 a 5/,
    )
  })
})
