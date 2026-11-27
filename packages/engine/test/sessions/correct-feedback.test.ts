// Correcting a told Session (#344, decided in #341): the Dono reopens
// Contar, prefilled with what was told, and saving replaces the whole
// Feedback. The night's date stays; the Fatos, the Satisfação and the
// Histórico de apostas follow from the file.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import {
  openSessions,
  parseYaml,
  recommendSession,
  recordedFeedback,
  recordFeedback,
  Sqlite,
  yamlToJson,
  type FeedbackRequest,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'

const open = async (fixture: Fixture, attendees: string[]) =>
  (await fixture.ok(recommendSession({ attendees }))).session.id

const front = (fixture: Fixture, id: string) => {
  const text = readFileSync(join(fixture.data, 'sessions', `${id}.md`), 'utf8')
  return {
    text,
    front: yamlToJson(
      parseYaml(text.slice(4, text.indexOf('\n---', 4))),
    ) as Record<string, any>,
  }
}

const notas = (fixture: Fixture, id: string) =>
  fixture.ok(
    Effect.gen(function* () {
      const rows = yield* (yield* Sqlite).read((db) =>
        db.all(
          'SELECT pessoa, filme_id, nota FROM notas WHERE sessao = ? ORDER BY pessoa',
          id,
        ),
      )
      return rows.map((row) => Object.values(row))
    }),
  )

const told = (fixture: Fixture, request: FeedbackRequest, vars?: object) =>
  fixture.ok(recordFeedback(request), vars as never)

describe('correcting a told Session', () => {
  test('replaces the whole Feedback and keeps the night’s date', async () => {
    const fixture = useFixture()
    const id = await open(fixture, ['dono', 'iara'])
    await told(fixture, {
      session: id,
      film: 'noite de estreia',
      ratings: ['dono=4', 'iara=2'],
      comments: ['iara=longo demais'],
    })

    await told(
      fixture,
      {
        session: id,
        film: 'deserto branco',
        ratings: ['dono=9/10'],
        reports: ['iara=gostou'],
        correct: true,
      },
      { FILMES_HOJE: '2026-11-23' },
    )

    const after = front(fixture, id)
    expect(after.front.chosen).toBe('tt9000701')
    expect(after.front.feedback.reactions).toEqual([
      { person: 'bruno', kind: 'rating', rating: 4.5, original_rating: '9/10' },
      { person: 'iara', kind: 'report', reaction: 'liked' },
    ])
    // The night is when it was told; the correction has its own date.
    expect(after.text).toContain('\n  recorded_on: 2026-11-20\n')
    expect(after.text).toContain('\n  corrected_on: 2026-11-23\n')
    expect(await notas(fixture, id)).toEqual([['bruno', 'tt9000701', 4.5]])
    expect(await fixture.ok(openSessions)).toEqual({ sessions: [] })
  })

  test('without correct, a told Session still takes no other Feedback', async () => {
    const fixture = useFixture()
    const id = await open(fixture, ['dono'])
    await told(fixture, { session: id, film: null })

    const { output } = await fixture.run(
      recordFeedback({ session: id, film: 'Vento Norte' }),
    )
    expect(output).toMatchObject({ error: { code: 'closed_session' } })
  })

  test('only a Dono who was there corrects it, and she becomes its Dono', async () => {
    const fixture = useFixture()
    const id = await open(fixture, ['dono', 'iara'])
    await told(fixture, { session: id, film: null })
    const request = {
      session: id,
      film: 'noite de estreia',
      ratings: ['iara=4'],
      correct: true,
    }

    const outsider = await fixture.run(recordFeedback(request), undefined, {
      owner: 'teo',
    })
    expect(outsider.output).toMatchObject({
      error: { code: 'invalid_usage' },
    })
    expect(front(fixture, id).front.chosen).toBeNull()

    await fixture.ok(recordFeedback(request), undefined, { owner: 'iara' })
    expect(front(fixture, id).front.owner).toBe('iara')
  })

  test('correct on an open Session is a plain Feedback', async () => {
    const fixture = useFixture()
    const id = await open(fixture, ['dono'])

    await told(fixture, { session: id, film: null, correct: true })

    const after = front(fixture, id)
    expect(after.front.feedback.reactions).toEqual([])
    expect(after.text).not.toContain('corrected_on')
  })
})

describe('what was told, to prefill the correction', () => {
  test('gives the chosen film and each reaction on the scale of 10', async () => {
    const fixture = useFixture()
    const id = await open(fixture, ['dono', 'iara', 'teo'])
    await told(fixture, {
      session: id,
      film: 'noite de estreia',
      ratings: ['dono=9/10', 'iara=2'],
      reports: ['teo=não gostou'],
      comments: ['iara=longo demais'],
    })

    expect(await fixture.ok(recordedFeedback(id))).toEqual({
      session: id,
      chosen: 'tt9000203',
      reactions: [
        { person: 'bruno', rating: 9, report: null, comment: null },
        { person: 'iara', rating: 4, report: null, comment: 'longo demais' },
        { person: 'teo', rating: null, report: 'disliked', comment: null },
      ],
    })
  })

  test('an open Session has nothing told', async () => {
    const fixture = useFixture()
    const id = await open(fixture, ['dono'])
    expect(await fixture.ok(recordedFeedback(id))).toBeNull()
  })
})
