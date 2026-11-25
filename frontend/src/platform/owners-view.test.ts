// Two Donos on the fixture (#131): Bruno and Vera. Each screen keys "the
// Dono" on the logged-in one: the form checks her and puts her first, the
// Feedback form lets her speak for herself (a Nota, no Relato), and the
// Cartaz calls her "Você".

import { makeEngine, recommendSession } from '@filmes/engine'
import { describe, expect, it } from 'vite-plus/test'
import { useFixture } from '../../../packages/engine/test/fixture.ts'
import { billboardsFromEngine } from './billboard'
import { feedbackFromEngine, openSessionList } from './feedback'
import { requestOptions, sessionsFromEngine } from './sessions'

describe('two Donos', () => {
  it('each sees herself as the Dono of the screens', async () => {
    const fixture = useFixture()
    const engine = makeEngine(fixture.vars)
    try {
      const opened = await engine.run(
        recommendSession({ attendees: ['dono', 'vera'], count: 3 }),
        { owner: 'bruno' },
      )
      if (opened.exitCode !== 0) throw new Error(JSON.stringify(opened))
      const id = opened.output.session.id

      for (const viewer of ['vera', 'bruno']) {
        const options = await requestOptions(sessionsFromEngine(engine, viewer))
        expect(options?.people.filter((p) => p.owner)).toEqual([
          expect.objectContaining({ person: viewer }),
        ])
        expect(options?.people[0]?.person).toBe(viewer)

        const [session] =
          (await openSessionList(feedbackFromEngine(engine, viewer))) ?? []
        // The Session's order: Bruno opened it with Vera.
        expect(session?.attendees.map((a) => [a.person, a.owner])).toEqual([
          ['bruno', viewer === 'bruno'],
          ['vera', viewer === 'vera'],
        ])

        const made = await billboardsFromEngine(engine, viewer).model(id)
        if (made.exitCode !== 0) throw new Error(JSON.stringify(made))
        expect(
          made.output.model.attendees.find((p) => p.label === 'Você')?.slug,
        ).toBe(viewer)
      }
    } finally {
      await engine.dispose()
    }
  })
})
