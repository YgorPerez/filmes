// Editing an open Session's request and Restrições (#372, map #369): the
// app's form replaces the request of the current version, and saving is a
// refazer with Mantidos (every film on the screen is kept where it still
// passes). No Python twin.

import { describe, expect, test } from 'vite-plus/test'
import {
  castVotes,
  editSessionRequest,
  sessionRequestEditDraft,
  recommendSession,
  recordFeedback,
  type RecommendSessionRequest,
  type SessionRecommendation,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'

const ESCREVER_CARTAS = 'tt9006701'

const plain = <A>(value: A): A => JSON.parse(JSON.stringify(value)) as A

const open = async (
  fixture: Fixture,
  request: RecommendSessionRequest,
): Promise<SessionRecommendation> =>
  plain(await fixture.ok(recommendSession(request)))

/** "dono" is Bruno in the fixture: he edits. */
const AS_DONO = { owner: 'bruno' }

const ids = (out: SessionRecommendation) => out.films.map((f) => f.id)

describe('editSessionRequest', () => {
  test('a new Restrição drops the kept film that breaks it and the place refills', async () => {
    const fixture = useFixture()
    const first = await open(fixture, { attendees: ['dono'] })
    const f = first.films
    expect(f[1]!.runtimeMinutes).toBeGreaterThan(110)
    expect(f[0]!.runtimeMinutes).toBeLessThanOrEqual(110)

    const edited = plain(
      await fixture.ok(
        editSessionRequest(first.session.id, { moods: [], maxDuration: 110 }),
        undefined,
        AS_DONO,
      ),
    )

    expect(edited.session.version).toBe(2)
    expect(edited.films).toHaveLength(5)
    expect(edited.kept).toContain(f[0]!.id)
    expect(edited.kept).not.toContain(f[1]!.id)
    expect(edited.dropped).toContainEqual(
      expect.objectContaining({ id: f[1]!.id, cause: 'constraint' }),
    )
    expect(edited.films[1]).toMatchObject({ new: true, position: 2 })
    expect(edited.films[0]).toMatchObject({ id: f[0]!.id, new: false })
    expect(edited.warnings.filter((w) => w.startsWith('--manter'))).toEqual([])
  })

  test('the films that still pass keep their numbers', async () => {
    const fixture = useFixture()
    const first = await open(fixture, { attendees: ['dono'], request: 'algo' })

    const edited = plain(
      await fixture.ok(
        editSessionRequest(first.session.id, {
          moods: [],
          request: 'algo bom',
        }),
        undefined,
        AS_DONO,
      ),
    )

    expect(ids(edited)).toEqual(ids(first))
    expect(edited.films.every((film) => !film.new)).toBe(true)
  })

  test('a kept film with yes Votos keeps its number', async () => {
    const fixture = useFixture()
    const first = await open(fixture, { attendees: ['dono', 'iara'] })
    await fixture.ok(
      castVotes({
        session: first.session.id,
        person: 'iara',
        version: 1,
        votes: [{ film: first.films[3]!.id, vote: 'yes' }],
      }),
    )

    const edited = plain(
      await fixture.ok(
        editSessionRequest(first.session.id, { moods: [], request: 'algo' }),
        undefined,
        AS_DONO,
      ),
    )

    expect(ids(edited)).toEqual(ids(first))
  })

  test('an edit of a version that is no longer the current one refuses', async () => {
    const fixture = useFixture()
    const first = await open(fixture, { attendees: ['dono'] })
    await open(fixture, {
      attendees: ['dono'],
      session: first.session.id,
      swap: [first.films[0]!.id],
    })

    const out = await fixture.run(
      editSessionRequest(first.session.id, {
        moods: [],
        maxDuration: 110,
        version: 1,
      }),
      undefined,
      AS_DONO,
    )

    expect(out.output).toMatchObject({
      error: {
        code: 'invalid_usage',
        message: 'a Sessão mudou; tente de novo',
      },
    })
  })

  test('a new Clima replaces the list', async () => {
    const fixture = useFixture()
    const first = await open(fixture, { attendees: ['vera'], count: 10 })

    const edited = plain(
      await fixture.ok(
        editSessionRequest(first.session.id, { moods: ['leve'] }),
        undefined,
        { owner: 'vera' },
      ),
    )

    expect(edited.kept).toEqual([])
    expect(edited.moods).toEqual(['leve'])
    const left = ids(first).filter((id) => !ids(edited).includes(id))
    expect(left.length).toBeGreaterThan(0)
    expect(edited.dropped?.map((film) => film.id).toSorted()).toEqual(
      left.toSorted(),
    )
    expect(edited.warnings.filter((w) => w.startsWith('--manter'))).toEqual([])
  })

  test('a Restrição the Session inherits is removed when the edit leaves it out', async () => {
    const fixture = useFixture()
    const first = await open(fixture, {
      attendees: ['dono'],
      count: 10,
      similar: [ESCREVER_CARTAS],
      seriesOrder: 'all',
    })
    expect(first.constraints['similar']).toBeDefined()

    const edited = plain(
      await fixture.ok(
        editSessionRequest(first.session.id, { moods: [] }),
        undefined,
        AS_DONO,
      ),
    )

    expect(edited.constraints['similar']).toBeUndefined()
    expect(edited.constraints['series_order']?.['mode']).toBe('previous')
  })

  test('a told Session refuses', async () => {
    const fixture = useFixture()
    const first = await open(fixture, { attendees: ['dono'] })
    await fixture.ok(recordFeedback({ session: first.session.id, film: null }))

    const out = await fixture.run(
      editSessionRequest(first.session.id, { moods: [], maxDuration: 110 }),
      undefined,
      AS_DONO,
    )

    expect(out.exitCode).not.toBe(0)
    expect(out.output).toMatchObject({ error: { code: 'closed_session' } })
  })

  test('an edit with no Dono logged in refuses', async () => {
    const fixture = useFixture()
    const first = await open(fixture, { attendees: ['dono'] })

    const out = await fixture.run(
      editSessionRequest(first.session.id, { moods: [], maxDuration: 110 }),
    )

    expect(out.output).toMatchObject({
      error: {
        code: 'invalid_usage',
        message: 'Só um Dono entre os Presentes pode editar a Sessão.',
      },
    })
  })

  test('a Dono who is not among the Presentes cannot edit', async () => {
    const fixture = useFixture()
    const first = await open(fixture, { attendees: ['iara'] })

    const out = await fixture.run(
      editSessionRequest(first.session.id, { moods: [], maxDuration: 110 }),
      {},
      { owner: 'bruno' },
    )

    expect(out.output).toMatchObject({ error: { code: 'invalid_usage' } })
  })

  test('the draft is the current request, with the inherited Restrições', async () => {
    const fixture = useFixture()
    const first = await open(fixture, {
      attendees: ['dono'],
      count: 10,
      request: 'algo bom',
      moods: ['leve'],
      maxDuration: 130,
      noSlow: true,
      similar: [ESCREVER_CARTAS],
      seriesOrder: 'all',
    })

    const draft = await fixture.ok(sessionRequestEditDraft(first.session.id))

    // "dono" is Bruno in the fixture.
    expect(draft).toEqual({
      attendees: ['bruno'],
      request: 'algo bom',
      moods: ['leve'],
      count: 10,
      maxDuration: 130,
      noSlow: true,
      similar: [ESCREVER_CARTAS],
      seriesOrder: 'all',
    })
  })
})
