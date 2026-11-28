import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vite-plus/test'
import {
  answerBillboard,
  answerPairwise,
  castVotes,
  consult,
  pairwiseAnswers,
  pairwiseQuestions,
  readSession,
  sessionDeletion,
  deleteSession,
  listSessions,
  rebuild,
  recommendSession,
  recordFeedback,
  satisfactionNow,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'

function sessionFacts(fixture: Fixture, id: string) {
  return fixture.ok(
    consult(`SELECT fato_id, fonte FROM notas WHERE sessao = '${id}'
             UNION ALL SELECT fato_id, fonte FROM ja_visto WHERE sessao = '${id}'
             UNION ALL SELECT fato_id, fonte FROM declarados WHERE sessao = '${id}'
             ORDER BY fato_id`),
  )
}

async function toldSession(fixture: Fixture) {
  const { session } = await fixture.ok(
    recommendSession({ attendees: ['bruno', 'quim'] }),
  )
  await fixture.ok(
    recordFeedback({
      session: session.id,
      film: 'Pequenos Milagres',
      ratings: ['bruno=1', 'quim=5'],
      comments: ['bruno=longo demais'],
    }),
  )
  return session.id
}

test('erases the Session and its Fatos and Satisfação, including after a rebuild', async () => {
  const fixture = useFixture()
  const id = await toldSession(fixture)
  const satisfaction = () => fixture.ok(satisfactionNow(['bruno', 'quim']))
  expect((await sessionFacts(fixture, id)).rows).toHaveLength(5)
  expect((await satisfaction()).disagreement).toBe(0.8889)

  await fixture.ok(deleteSession({ session: id, mode: 'erase' }))
  expect((await sessionFacts(fixture, id)).rows).toEqual([])
  expect(existsSync(join(fixture.data, 'sessions', `${id}.md`))).toBe(false)

  await fixture.ok(rebuild)
  expect((await sessionFacts(fixture, id)).rows).toEqual([])
  expect((await satisfaction()).disagreement).toBeNull()
  expect((await fixture.ok(listSessions)).sessions).toEqual([])
})

test('keeps the same Fatos and Fontes while dropping the Session from the list and Satisfação', async () => {
  const fixture = useFixture()
  const id = await toldSession(fixture)
  const before = await sessionFacts(fixture, id)

  await fixture.ok(deleteSession({ session: id, mode: 'keep_taste' }))
  expect(await sessionFacts(fixture, id)).toEqual(before)
  expect(
    readFileSync(join(fixture.data, 'sessions', `${id}.md`), 'utf8'),
  ).toContain('deleted_on: 2026-11-20')

  await fixture.ok(rebuild)
  expect(await sessionFacts(fixture, id)).toEqual(before)
  expect(
    (await fixture.ok(satisfactionNow(['bruno', 'quim']))).disagreement,
  ).toBeNull()
  expect((await fixture.ok(listSessions)).sessions).toEqual([])
})

test('requires no choice for pending pairwise answers and reserves the erased Link', async () => {
  const fixture = useFixture()
  const request = { attendees: ['bruno', 'quim'] }
  const { session, films } = await fixture.ok(recommendSession(request))
  const link = { session: session.id, person: 'quim' }
  const { pairs } = await fixture.ok(pairwiseQuestions(link))
  const [a, b] = pairs[0]!
  const answer = { ...link, films: [a.id, b.id] as const, choice: a.id }
  await fixture.ok(answerPairwise(answer))
  expect(await fixture.ok(pairwiseAnswers(session.id))).toHaveLength(1)
  expect(await fixture.ok(sessionDeletion(session.id))).toEqual({
    hasFacts: false,
  })

  await fixture.ok(deleteSession({ session: session.id }))
  const replacement = await fixture.ok(recommendSession(request))
  expect(replacement.session.id).not.toBe(session.id)
  const deleted = { error: { code: 'deleted_session' } }
  expect((await fixture.run(readSession(session.id))).output).toMatchObject(
    deleted,
  )
  expect((await fixture.run(answerPairwise(answer))).output).toMatchObject(
    deleted,
  )
  const vote = castVotes({
    ...link,
    version: 1,
    votes: [{ film: films[0]!.id, vote: 'yes' }],
  })
  expect((await fixture.run(vote)).output).toMatchObject(deleted)
})

test('requires a Dono among the Presentes', async () => {
  const fixture = useFixture()
  const { session } = await fixture.ok(
    recommendSession({ attendees: ['bruno', 'quim'] }),
  )
  for (const owner of ['vera', 'quim']) {
    const rejected = await fixture.run(
      deleteSession({ session: session.id }),
      undefined,
      { owner },
    )
    expect(rejected.output).toMatchObject({
      error: {
        code: 'invalid_usage',
        message: 'Só um Dono que esteve nesta Sessão pode excluí-la.',
      },
    })
  }
  const other = await fixture.ok(
    recommendSession({ attendees: ['bruno', 'vera'] }),
  )
  await fixture.ok(deleteSession({ session: other.session.id }), undefined, {
    owner: 'vera',
  })
  expect(
    (await fixture.ok(listSessions)).sessions.map((item) => item.id),
  ).toEqual([session.id])
})

test.each(['erase', 'keep_taste'] as const)(
  'applies %s to Cartaz Fatos recorded in the Pessoa',
  async (mode) => {
    const fixture = useFixture()
    const { session, films } = await fixture.ok(
      recommendSession({ attendees: ['bruno'] }),
    )
    const film = films[0]!
    await fixture.ok(
      answerBillboard({
        session: session.id,
        text: `#cartaz ${session.id} v1\n1 ${film.id} · já vi: bruno=8 · achou: gostei do final`,
      }),
    )
    const facts = () =>
      fixture.ok(
        consult(
          `SELECT fato_id FROM notas WHERE fonte = 'cartaz ${session.id}'
      UNION ALL SELECT fato_id FROM declarados WHERE fonte = 'cartaz ${session.id}'
     ORDER BY fato_id`,
        ),
      )
    const before = await facts()
    expect(before.rows).toHaveLength(2)
    expect(await fixture.ok(sessionDeletion(session.id))).toEqual({
      hasFacts: true,
    })
    const omitted = await fixture.run(deleteSession({ session: session.id }))
    expect(omitted.output).toMatchObject({ error: { code: 'invalid_usage' } })

    await fixture.ok(deleteSession({ session: session.id, mode }))
    await fixture.ok(rebuild)
    expect((await facts()).rows).toEqual(mode === 'erase' ? [] : before.rows)
  },
)
