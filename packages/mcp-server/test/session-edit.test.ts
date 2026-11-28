// Deleting and editing a Session (#373, map #369): the MCP tools over the
// engine operations of #370, #371 and #372.

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { consult, personVeto } from '@filmes/engine'
import { describe, test } from 'vite-plus/test'
import { useFixture } from '../../engine/test/fixture.ts'
import { connect, type Connected } from './connect.ts'

/** A Session of Bruno (the stdio Dono) and Quim, told with a Nota each. */
async function toldSession({ ok }: Connected) {
  const recommendation = await ok('recommend', {
    attendees: ['dono', 'quim'],
  })
  const session = recommendation.session.id
  const film: string = recommendation.films[0].id
  await ok('record_feedback', {
    session,
    film,
    ratings: [
      { person: 'dono', rating: 4 },
      { person: 'quim', rating: 5 },
    ],
  })
  return { session, film }
}

const sessionNotas = (id: string) =>
  consult(`SELECT count(*) FROM notas WHERE sessao = '${id}'`)

const sessionFile = (connected: Connected, id: string) =>
  join(connected.fixture.data, 'sessions', `${id}.md`)

describe('delete_session', () => {
  test('erase removes the file and the Session leaves the list', async () => {
    const connected = await connect(useFixture())
    const { session } = await toldSession(connected)

    assert.deepEqual(
      await connected.ok('delete_session', { session, mode: 'erase' }),
      { session },
    )

    assert.equal(existsSync(sessionFile(connected, session)), false)
    const { rows } = await connected.fixture.ok(sessionNotas(session))
    assert.deepEqual(rows, [[0]])
  })

  test('keep_taste keeps the file, marked deleted, and its Notas', async () => {
    const connected = await connect(useFixture())
    const { session } = await toldSession(connected)

    await connected.ok('delete_session', { session, mode: 'keep_taste' })

    assert.match(
      readFileSync(sessionFile(connected, session), 'utf8'),
      /deleted_on: 2026-11-20/,
    )
    const { rows } = await connected.fixture.ok(sessionNotas(session))
    assert.deepEqual(rows, [[2]])
  })

  test('a Dono who was not among the Presentes is refused', async () => {
    const fixture = useFixture()
    const { session } = await toldSession(await connect(fixture))
    const vera = await connect(fixture, 'vera')

    const refused = await vera.error('delete_session', {
      session,
      mode: 'erase',
    })

    assert.equal(refused.error.code, 'invalid_usage')
    assert.equal(
      existsSync(join(fixture.data, 'sessions', `${session}.md`)),
      true,
    )
  })
})

describe('edit_attendees', () => {
  test('a newcomer on an open Session drops the film she vetoes and keeps the rest', async () => {
    const connected = await connect(useFixture())
    const first = await connected.ok('recommend', {
      attendees: ['dono'],
      count: 3,
    })
    const session = first.session.id
    const [vetoed, kept, alsoKept] = first.films
    await connected.fixture.ok(
      personVeto({ person: 'iara', target: vetoed.id, text: 'não vejo este' }),
    )

    const edited = await connected.ok('edit_attendees', {
      session,
      attendees: ['dono', 'iara'],
    })

    assert.deepEqual(edited.session, { ...first.session, version: 2 })
    assert.deepEqual(edited.attendees, ['bruno', 'iara'])
    assert.deepEqual(edited.kept, [kept.id, alsoKept.id])
    assert.deepEqual(
      edited.dropped.map((d: { id: string; cause: string }) => [d.id, d.cause]),
      [[vetoed.id, 'veto']],
    )
  })

  test('a Dono who was not among the Presentes is refused', async () => {
    const fixture = useFixture()
    const { session } = await (
      await connect(fixture)
    ).ok('recommend', { attendees: ['dono'] })

    const refused = await (
      await connect(fixture, 'vera')
    ).error('edit_attendees', { session: session.id, attendees: ['vera'] })

    assert.equal(refused.error.code, 'invalid_usage')
  })
})

describe('record_feedback with attendees', () => {
  test('correcting a told Session swaps a departed Presente for a newcomer', async () => {
    const connected = await connect(useFixture())
    const { session, film } = await toldSession(connected)

    const corrected = await connected.ok('record_feedback', {
      session,
      film,
      correct: true,
      attendees: ['dono', 'teo'],
      ratings: [
        { person: 'dono', rating: 4 },
        { person: 'teo', rating: 5 },
      ],
    })

    assert.deepEqual(
      corrected.facts
        .filter((f: { kind: string }) => f.kind === 'rating')
        .map((f: { person: string }) => f.person),
      ['bruno', 'teo'],
    )
    const { rows } = await connected.fixture.ok(
      consult(
        `SELECT pessoa FROM notas WHERE sessao = '${session}' ORDER BY pessoa`,
      ),
    )
    assert.deepEqual(rows, [['bruno'], ['teo']])
  })
})

describe('edit_session_request', () => {
  test('a shorter time drops the longer films and keeps the one that still passes', async () => {
    const connected = await connect(useFixture())
    const first = await connected.ok('recommend', {
      attendees: ['dono'],
      count: 3,
      request: 'qualquer coisa',
    })
    const session = first.session.id
    const [shortest, ...longer] = [...first.films].sort(
      (a, b) => a.runtimeMinutes - b.runtimeMinutes,
    )

    const edited = await connected.ok('edit_session_request', {
      session,
      request: 'algo curto',
      moods: [],
      maxDuration: shortest.runtimeMinutes,
    })

    assert.equal(edited.session.version, 2)
    assert.deepEqual(edited.kept, [shortest.id])
    assert.deepEqual(
      edited.dropped.map((d: { id: string }) => d.id).sort(),
      longer.map((f: { id: string }) => f.id).sort(),
    )
  })

  test('a told Session is refused', async () => {
    const connected = await connect(useFixture())
    const { session } = await toldSession(connected)

    const refused = await connected.error('edit_session_request', {
      session,
      moods: [],
    })

    assert.equal(refused.error.code, 'closed_session')
  })
})
