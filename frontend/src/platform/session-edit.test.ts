import { makeEngine, recommendSession, recordFeedback } from '@filmes/engine'
import { describe, expect, it } from 'vite-plus/test'
import {
  useFixture,
  type Fixture,
} from '../../../packages/engine/test/fixture.ts'
import { Notes } from './notes'
import { sessionEditPage, sessionEditsFromEngine } from './session-edit'
import { sessionEditAction } from './sessions'

const ORIGIN = 'http://localhost'
const BRUNO = { person: 'bruno' }

const open = async (fixture: Fixture, attendees: string[]) =>
  (
    await fixture.ok(
      recommendSession({
        attendees,
        count: 3,
        request: 'algo bom',
        maxDuration: 150,
      }),
      {},
      { owner: 'bruno' },
    )
  ).session.id

const post = (id: string, fields: [string, string][], origin = ORIGIN) => {
  const body = new FormData()
  for (const [name, value] of fields) body.append(name, value)
  return new Request(`${ORIGIN}/sessoes/${id}/pedido/enviar`, {
    method: 'POST',
    body,
    headers: { origin },
  })
}

/** Runs `task` with the edits over the fixture's engine. */
async function withEdits<A>(
  fixture: Fixture,
  task: (edits: ReturnType<typeof sessionEditsFromEngine>) => Promise<A>,
) {
  const engine = makeEngine(fixture.vars)
  try {
    return await task(sessionEditsFromEngine(engine))
  } finally {
    await engine.dispose()
  }
}

describe('sessionEditPage', () => {
  it('is the form filled with the current version, for a Presente', async () => {
    const fixture = useFixture()
    const id = await open(fixture, ['bruno', 'iara'])
    const page = await withEdits(fixture, (edits) =>
      sessionEditPage(id, 'bruno', edits),
    )
    expect(page).toMatchObject({
      id,
      fields: { request: 'algo bom', maxDuration: 150, moods: [] },
    })
    expect(page !== null && typeof page === 'object' && page.moods).toContain(
      'leve',
    )
  })

  it('says why there is no form', async () => {
    const fixture = useFixture()
    const id = await open(fixture, ['bruno', 'iara'])
    const told = await open(fixture, ['bruno', 'quim'])
    await fixture.ok(recordFeedback({ session: told, film: null }))
    const pages = await withEdits(fixture, async (edits) => [
      await sessionEditPage(id, 'vera', edits),
      await sessionEditPage(told, 'bruno', edits),
      await sessionEditPage('2026-01-01-ninguem', 'bruno', edits),
    ])
    expect(pages).toEqual(['absent', 'closed', 'unknown'])
  })
})

describe('sessionEditAction', () => {
  it('redoes the Session with the form and goes to its page', async () => {
    const fixture = useFixture()
    const id = await open(fixture, ['bruno', 'iara'])
    const response = await withEdits(fixture, (edits) =>
      sessionEditAction(
        post(id, [
          ['pedido', 'algo curto'],
          ['duracao', '120'],
          ['sem-lento', 'sim'],
        ]),
        id,
        BRUNO,
        edits,
        new Notes(),
        ORIGIN,
      ),
    )
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toMatch(
      new RegExp(`^/sessoes/${id}\\?feito=regerada`),
    )
    const page = await withEdits(fixture, (edits) =>
      sessionEditPage(id, 'bruno', edits),
    )
    expect(page).toMatchObject({
      fields: { request: 'algo curto', maxDuration: 120, noSlow: true },
    })
  })

  it('goes back to the form saying why not', async () => {
    const fixture = useFixture()
    const id = await open(fixture, ['bruno', 'iara'])
    const told = await open(fixture, ['bruno', 'quim'])
    await fixture.ok(recordFeedback({ session: told, film: null }))
    const locations = await withEdits(fixture, async (edits) => {
      const send = async (
        session: string,
        fields: [string, string][],
        person = 'bruno',
      ) =>
        (
          await sessionEditAction(
            post(session, fields),
            session,
            { person },
            edits,
            new Notes(),
            ORIGIN,
          )
        ).headers.get('Location')
      return [
        await send(id, [['duracao', 'muito']]),
        await send(id, [['parecido', 'tt0000001']]),
        await send(id, [['duracao', '90']], 'vera'),
        await send(told, [['duracao', '90']]),
      ]
    })
    expect(locations).toEqual([
      `/sessoes/${id}/pedido?erro=duracao`,
      `/sessoes/${id}/pedido?erro=parecido`,
      `/sessoes/${id}/pedido?erro=ausente`,
      `/sessoes/${told}/pedido?erro=fechada`,
    ])
  })

  it('takes a form only from a Dono of this site', async () => {
    const fixture = useFixture()
    const id = await open(fixture, ['bruno', 'iara'])
    const [anyone, elsewhere] = await withEdits(fixture, async (edits) => [
      await sessionEditAction(
        post(id, []),
        id,
        null,
        edits,
        new Notes(),
        ORIGIN,
      ),
      await sessionEditAction(
        post(id, [], 'https://outro.example'),
        id,
        BRUNO,
        edits,
        new Notes(),
        ORIGIN,
      ),
    ])
    expect(anyone?.headers.get('Location')).toBe('/entrar')
    expect(elsewhere?.status).toBe(403)
  })
})
