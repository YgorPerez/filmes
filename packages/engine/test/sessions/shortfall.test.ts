// The Falta [shortfall] (#357, map #355): when fewer films pass than the
// Recomendação asks, the version of the Session stores how many were asked
// and found, and the Cartaz says it in a strip at its top, so the list never
// shrinks in silence. The relax of #358 adds what was relaxed to it.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vite-plus/test'
import {
  billboard,
  parseYaml,
  recommendSession,
  yamlToJson,
  type RecommendSessionRequest,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'

const ESCREVER_CARTAS = 'tt9006701' // 4 similar films pass its Restrições

const recommend = (fixture: Fixture, request: RecommendSessionRequest) =>
  fixture.ok(recommendSession(request))

const front = (fixture: Fixture, id: string) => {
  const text = readFileSync(join(fixture.data, 'sessions', `${id}.md`), 'utf8')
  return yamlToJson(
    parseYaml(text.slice(4, text.indexOf('\n---', 4))),
  ) as Record<string, any>
}

test('a short list carries the shortfall, naming the similar films that ran out', async () => {
  const out = await recommend(useFixture(), {
    attendees: ['dono'],
    similar: [ESCREVER_CARTAS],
    count: 10,
  })

  expect(out.films).toHaveLength(4)
  expect(out.shortfall).toEqual({
    asked: 10,
    found: 4,
    similar: ['Escrever Cartas'],
    relaxed: [],
  })
})

test('the version stores the shortfall, and a redo moves it to the earlier version', async () => {
  const fixture = useFixture()
  const first = await recommend(fixture, {
    attendees: ['dono'],
    similar: [ESCREVER_CARTAS],
    count: 10,
  })
  const id = first.session.id
  const stored = {
    asked: 10,
    found: 4,
    similar: ['Escrever Cartas'],
    relaxed: [],
  }
  expect(front(fixture, id)['shortfall']).toEqual(stored)

  // Asking for the 4 it had, the redo finds them all again.
  await recommend(fixture, { attendees: ['dono'], session: id, count: 4 })

  const redone = front(fixture, id)
  expect(redone['shortfall']).toBeUndefined()
  expect(redone['versions'][0]['shortfall']).toEqual(stored)
})

test('a full list has no shortfall', async () => {
  const fixture = useFixture()
  const out = await recommend(fixture, { attendees: ['dono'], count: 3 })

  expect(out.shortfall).toBeUndefined()
  expect(front(fixture, out.session.id)).not.toHaveProperty('shortfall')
})

test('the Cartaz says the shortfall in its strip', async () => {
  const fixture = useFixture()
  const out = await recommend(fixture, {
    attendees: ['dono'],
    similar: [ESCREVER_CARTAS],
    count: 10,
  })

  const cartaz = await fixture.ok(billboard({ session: out.session.id }))

  expect(cartaz.billboard.shortfall).toBe(
    'Acabaram os parecidos com Escrever Cartas: vieram 4 dos 10 filmes pedidos.',
  )
})

test('without a Parecido, the strip says only how many passed', async () => {
  const fixture = useFixture()
  const out = await recommend(fixture, {
    attendees: ['dono'],
    count: 10,
    since: 2024,
  })
  const cartaz = await fixture.ok(billboard({ session: out.session.id }))

  expect(out.films).toHaveLength(1)
  expect(cartaz.billboard.shortfall).toBe(
    'Só 1 filme passou nas Restrições, dos 10 pedidos.',
  )
})

test('with something relaxed, the strip says what came in (#358)', async () => {
  const fixture = useFixture()
  const out = await recommend(fixture, {
    attendees: ['dono'],
    similar: [ESCREVER_CARTAS],
    count: 10,
  })
  const file = join(fixture.data, 'sessions', `${out.session.id}.md`)
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(
      'relaxed: []',
      'relaxed: [{constraint: since, films: 3, text: de antes de 1990}]',
    ),
  )

  const cartaz = await fixture.ok(billboard({ session: out.session.id }))

  expect(cartaz.billboard.shortfall).toBe(
    'Acabaram os parecidos com Escrever Cartas; entraram 3 de antes de 1990.',
  )
})
