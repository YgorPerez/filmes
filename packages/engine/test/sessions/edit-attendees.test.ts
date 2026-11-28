import { expect, test } from 'vite-plus/test'
import {
  editSessionAttendees,
  listSessions,
  personVeto,
  recommendSession,
  recordedFeedback,
  recordFeedback,
} from '../../src/index.ts'
import { useFixture } from '../fixture.ts'

test('editing the Presentes refills the place of a film vetoed by the newcomer', async () => {
  const fixture = useFixture()
  const owner = { owner: 'bruno' }
  const first = await fixture.ok(
    recommendSession({ attendees: ['bruno'], count: 3, request: 'até 2h' }),
    undefined,
    owner,
  )
  const [vetoed, kept, alsoKept] = first.films
  const id = first.session.id
  await fixture.ok(
    personVeto({ person: 'iara', target: vetoed!.id, text: 'não vejo este' }),
  )

  const outsider = await fixture.run(
    editSessionAttendees(id, ['bruno', 'iara']),
    undefined,
    { owner: 'vera' },
  )
  expect(outsider.output).toMatchObject({ error: { code: 'invalid_usage' } })

  const edited = await fixture.ok(
    editSessionAttendees(id, ['bruno', 'iara']),
    undefined,
    owner,
  )

  expect(edited.session).toMatchObject({ id, version: 2 })
  expect(edited.attendees).toEqual(['bruno', 'iara'])
  expect(edited.kept).toEqual([kept!.id, alsoKept!.id])
  expect(edited.films).toMatchObject([
    { position: 1, new: true },
    { position: 2, id: kept!.id },
    { position: 3, id: alsoKept!.id },
  ])
  expect(edited.dropped).toMatchObject([
    { position: 1, id: vetoed!.id, cause: 'veto', person: 'iara' },
  ])
  const { sessions } = await fixture.ok(listSessions)
  expect(sessions.find((s) => s.id === id)).toMatchObject({
    request: 'até 2h',
    attendees: ['bruno', 'iara'],
  })
})

test('correcting Feedback replaces a departed Presente with a newcomer', async () => {
  const fixture = useFixture()
  const owner = { owner: 'bruno' }
  const first = await fixture.ok(
    recommendSession({ attendees: ['bruno', 'iara'], count: 3 }),
    undefined,
    owner,
  )
  const session = first.session.id
  const film = first.films[0]!.id
  await fixture.ok(
    recordFeedback({ session, film, ratings: ['bruno=4', 'iara=2'] }),
    undefined,
    owner,
  )
  const correction = recordFeedback({
    session,
    film,
    correct: true,
    attendees: ['bruno', 'teo'],
    ratings: ['bruno=4', 'teo=5'],
  })

  const outsider = await fixture.run(correction, undefined, { owner: 'vera' })
  expect(outsider.output).toMatchObject({ error: { code: 'invalid_usage' } })
  await fixture.ok(correction, undefined, owner)

  const { sessions } = await fixture.ok(listSessions)
  expect(sessions.find((s) => s.id === session)).toMatchObject({
    attendees: ['bruno', 'teo'],
    open: false,
  })
  expect(await fixture.ok(recordedFeedback(session))).toMatchObject({
    chosen: film,
    reactions: [
      { person: 'bruno', rating: 8 },
      { person: 'teo', rating: 10 },
    ],
  })
})
