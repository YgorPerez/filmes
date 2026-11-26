import { join } from 'node:path'
import {
  consult,
  makeEngine,
  recommendSession,
  recordFeedback,
} from '@filmes/engine'
import { expect, test } from 'vite-plus/test'
import { useFixture, type Fixture } from '../../../packages/engine/test/fixture'
import { pairwisePath } from '#/content/pairwise-address'
import { sessionLinkSearch } from '#/content/session-link-address'
import {
  pairwiseAnswerAction,
  pairwiseDecisionAction,
  pairwisePage,
  pairwiseWaiting,
} from './pairwise'
import { issueSessionLink } from './session-link'

const ORIGIN = 'https://cinema.example'

const post = (
  path: string,
  fields: Record<string, string>,
  headers: Record<string, string> = { origin: ORIGIN },
) =>
  new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers,
    body: new URLSearchParams(fields),
  })

async function linkSession(fixture: Fixture) {
  const engine = makeEngine(fixture.vars)
  const database = join(fixture.root, 'auth.sqlite')
  const opened = await fixture.ok(
    recommendSession({ attendees: ['dono', 'teo'], count: 1 }),
    {},
    { owner: 'bruno' },
  )
  const session = opened.session.id
  const url = await issueSessionLink(session, 'bruno', engine, database, ORIGIN)
  if (!url) throw new Error('Expected a Session link')
  const link = Object.fromEntries(new URL(url).searchParams) as {
    sessao: string
    chave: string
  }
  const search = (presente?: string) =>
    sessionLinkSearch({ ...link, ...(presente && { presente }) })
  return { fixture, engine, database, session, link, search }
}

test('a Presente answers the pairs one at a time through the Session link', async () => {
  const { engine, database, session, link, search } =
    await linkSession(useFixture())
  try {
    expect(await pairwisePage(search(), engine, database)).toBeNull()
    expect(
      await pairwisePage({ ...search('teo'), chave: 'x' }, engine, database),
    ).toBeNull()

    const first = await pairwisePage(search('teo'), engine, database)
    expect(first).toMatchObject({ answered: 0, total: 10 })
    const [a, b] = first!.pair!
    expect([a.id, b.id]).toEqual(['tt9000201', 'tt9000101'])

    const back = pairwisePath(session, link.chave, 'teo')
    const fields = {
      ...link,
      presente: 'teo',
      a: a.id,
      b: b.id,
      escolha: b.id,
    }
    const send = (headers: Record<string, string>) =>
      pairwiseAnswerAction(
        post('/participar/perguntas/enviar', fields, headers),
        engine,
        database,
        ORIGIN,
      )
    for (const headers of <Record<string, string>[]>[
      { origin: 'https://elsewhere.example' },
      { origin: 'null', 'sec-fetch-site': 'cross-site' },
      { origin: 'null' },
      {},
    ])
      expect((await send(headers)).status).toBe(403)

    // The page sends no Referer, so the browser's Origin is "null".
    const answered = await send({
      origin: 'null',
      'sec-fetch-site': 'same-origin',
    })
    expect(answered.status).toBe(303)
    expect(answered.headers.get('location')).toBe(back)
    const second = await pairwisePage(search('teo'), engine, database)
    expect(second).toMatchObject({ answered: 1, total: 10 })
    expect(second!.pair!.map((f) => f.id)).toEqual(['tt9000702', 'tt9000105'])

    // The same pair again is no longer asked.
    const again = await pairwiseAnswerAction(
      post('/participar/perguntas/enviar', fields),
      engine,
      database,
      ORIGIN,
    )
    expect(again.headers.get('location')).toBe(`${back}&erro=1`)

    // A form without the pair keeps nothing.
    const { a: _a, ...withoutPair } = fields
    const partial = await pairwiseAnswerAction(
      post('/participar/perguntas/enviar', withoutPair),
      engine,
      database,
      ORIGIN,
    )
    expect(partial.headers.get('location')).toBe(`${back}&erro=1`)
    // A server with no origin configured takes no form.
    expect(
      (
        await pairwiseAnswerAction(
          post('/participar/perguntas/enviar', fields),
          engine,
          database,
          undefined,
        )
      ).status,
    ).toBe(403)

    // A key that does not open the Session writes nothing.
    const forged = await pairwiseAnswerAction(
      post('/participar/perguntas/enviar', {
        ...fields,
        chave: 'x'.repeat(43),
        a: 'tt9000702',
        b: 'tt9000105',
      }),
      engine,
      database,
      ORIGIN,
    )
    expect(forged.headers.get('location')).toBe('/participar')
    expect(
      (await pairwisePage(search('teo'), engine, database))?.answered,
    ).toBe(1)
  } finally {
    await engine.dispose()
  }
})

test('the Dono sees the waiting answers and records them on her yes', async () => {
  const { fixture, engine, database, session, link } =
    await linkSession(useFixture())
  try {
    await pairwiseAnswerAction(
      post('/participar/perguntas/enviar', {
        ...link,
        presente: 'teo',
        a: 'tt9000201',
        b: 'tt9000101',
        escolha: 'tt9000101',
      }),
      engine,
      database,
      ORIGIN,
    )
    expect(await pairwiseWaiting(session, engine)).toEqual([
      {
        person: 'teo',
        name: 'Teo',
        answers: [
          {
            chosen: { id: 'tt9000101', title: 'O Farol de Areia', year: 2012 },
            other: { id: 'tt9000201', title: 'Ponte Aérea', year: 2016 },
          },
        ],
      },
    ])

    const page = `/sessoes/${session}`
    const decide = (
      fields: Record<string, string>,
      owner = { person: 'bruno' },
    ) =>
      pairwiseDecisionAction(
        post(`${page}/perguntas`, fields),
        owner,
        session,
        engine,
        ORIGIN,
      )
    const nobody = await pairwiseDecisionAction(
      post(`${page}/perguntas`, { presente: 'teo', decisao: 'gravar' }),
      null,
      session,
      engine,
      ORIGIN,
    )
    expect(nobody.headers.get('location')).toBe('/entrar')
    expect(
      (await decide({ presente: 'teo', decisao: 'talvez' })).headers.get(
        'location',
      ),
    ).toBe(`${page}?erro=indisponivel`)

    expect(
      (await decide({ presente: 'ninguem', decisao: 'gravar' })).headers.get(
        'location',
      ),
    ).toBe(`${page}?erro=indisponivel`)
    expect(await pairwiseWaiting('no-such-session', engine)).toEqual([])

    const recorded = await decide({ presente: 'teo', decisao: 'gravar' })
    expect(recorded.headers.get('location')).toBe(
      `${page}?feito=perguntas-gravadas`,
    )
    expect(await pairwiseWaiting(session, engine)).toEqual([])
    expect(
      (
        await fixture.ok(
          consult(
            "SELECT filme_id, nota FROM notas WHERE pessoa = 'teo' ORDER BY filme_id",
          ),
        )
      ).rows,
    ).toEqual([['tt9000101', 3.5]])

    await fixture.ok(
      recordFeedback({ session, film: null }),
      {},
      { owner: 'bruno' },
    )
    expect(
      (await decide({ presente: 'teo', decisao: 'descartar' })).headers.get(
        'location',
      ),
    ).toBe(`${page}?feito=perguntas-descartadas`)
  } finally {
    await engine.dispose()
  }
})
