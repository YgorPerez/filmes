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

const ESCREVER_CARTAS = 'tt9006701'
const ESTRADA_AFORA = 'tt9006702'
// Up to 1h30 in the fixture: 4 films, none of them similar to Escrever
// Cartas; relaxing the Parecido (#358) brings them in, and still falls short.
const SHORT = 90

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
    maxDuration: SHORT,
    count: 10,
  })

  expect(out.films).toHaveLength(4)
  expect(out.shortfall).toEqual({
    asked: 10,
    found: 4,
    similar: ['Escrever Cartas'],
    relaxed: [
      { constraint: 'similar', films: 4, text: 'que não são parecidos' },
    ],
  })
})

test('the version stores the shortfall, and a redo moves it to the earlier version', async () => {
  const fixture = useFixture()
  const first = await recommend(fixture, {
    attendees: ['dono'],
    maxDuration: SHORT,
    count: 10,
  })
  const id = first.session.id
  const stored = { asked: 10, found: 4, similar: [], relaxed: [] }
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

test('the Cartaz says the shortfall in its strip, and that the list is still short', async () => {
  const fixture = useFixture()
  const out = await recommend(fixture, {
    attendees: ['dono'],
    similar: [ESCREVER_CARTAS],
    maxDuration: SHORT,
    count: 10,
  })

  const cartaz = await fixture.ok(billboard({ session: out.session.id }))

  expect(cartaz.billboard.shortfall).toBe(
    'Acabaram os parecidos com Escrever Cartas; entraram 4 que não são parecidos. Vieram 4 dos 10 filmes pedidos.',
  )
})

test('the Cartaz names both references when the similar films run out', async () => {
  const fixture = useFixture()
  const out = await recommend(fixture, {
    attendees: ['dono'],
    similar: [ESCREVER_CARTAS, ESTRADA_AFORA],
    maxDuration: 95,
    count: 10,
  })
  const cartaz = await fixture.ok(billboard({ session: out.session.id }))

  expect(out.films).toHaveLength(10)
  expect(cartaz.billboard.shortfall).toBe(
    'Acabaram os parecidos com Escrever Cartas e Estrada Afora; entraram 9 que não são parecidos.',
  )
})

test('the Cartaz says when nothing similar passed and nothing else came in', async () => {
  const fixture = useFixture()
  const out = await recommend(fixture, {
    attendees: ['dono'],
    similar: [ESCREVER_CARTAS],
    maxDuration: 80,
    count: 10,
  })
  const cartaz = await fixture.ok(billboard({ session: out.session.id }))

  expect(cartaz.billboard.shortfall).toBe(
    'Acabaram os parecidos com Escrever Cartas: vieram 0 dos 10 filmes pedidos.',
  )
})

test('without a Parecido, the strip says only how many passed', async () => {
  const fixture = useFixture()
  const out = await recommend(fixture, {
    attendees: ['dono'],
    count: 10,
    maxDuration: 86,
  })
  const cartaz = await fixture.ok(billboard({ session: out.session.id }))

  expect(out.films).toHaveLength(1)
  expect(cartaz.billboard.shortfall).toBe(
    'Só 1 filme passou nas Restrições, dos 10 pedidos.',
  )
})

test.each([
  {
    maxDuration: 88,
    found: 2,
    text: 'Só 2 filmes passaram nas Restrições, dos 10 pedidos.',
  },
  { maxDuration: 80, found: 0, text: 'Nenhum filme passou nas Restrições.' },
])(
  'on redo, the Cartaz explains a list with $found films',
  async ({ maxDuration, found, text }) => {
    const fixture = useFixture()
    const { session } = await recommend(fixture, {
      attendees: ['dono'],
      count: 10,
    })
    const redone = await recommend(fixture, {
      attendees: ['dono'],
      session: session.id,
      count: 10,
      maxDuration,
    })
    const cartaz = await fixture.ok(billboard({ session: session.id }))

    expect(redone.films).toHaveLength(found)
    expect(redone.shortfall).toEqual({
      asked: 10,
      found,
      similar: [],
      relaxed: [],
    })
    expect(cartaz.billboard.shortfall).toBe(text)
  },
)

test('with something relaxed, the strip says what came in (#358)', async () => {
  const fixture = useFixture()
  const out = await recommend(fixture, {
    attendees: ['dono'],
    similar: [ESCREVER_CARTAS],
    maxDuration: 80,
    count: 10,
  })
  const file = join(fixture.data, 'sessions', `${out.session.id}.md`)
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(
      'relaxed: []',
      'relaxed: [{constraint: year, films: 3, text: de antes de 1990}]',
    ),
  )

  const cartaz = await fixture.ok(billboard({ session: out.session.id }))

  expect(cartaz.billboard.shortfall).toBe(
    'Acabaram os parecidos com Escrever Cartas; entraram 3 de antes de 1990. Vieram 0 dos 10 filmes pedidos.',
  )
})

test.each([
  {
    stored:
      '{asked: 3, found: 3, relaxed: [{constraint: year, films: 1, text: de antes de 1990}]}',
    expected: 'Faltaram filmes; entrou 1 de antes de 1990.',
  },
  {
    stored:
      '{asked: 10, found: 1, relaxed: [{constraint: year, films: 1, text: de antes de 1990}]}',
    expected:
      'Faltaram filmes; entrou 1 de antes de 1990. Veio 1 dos 10 filmes pedidos.',
  },
  {
    stored: '{asked: 10, found: 3}',
    expected: 'Só 3 filmes passaram nas Restrições, dos 10 pedidos.',
  },
  { stored: '{asked: 10}', expected: undefined },
  { stored: '[10, 3]', expected: undefined },
  { stored: 'incompleto', expected: undefined },
])(
  'the Cartaz reads a version with shortfall: $stored',
  async ({ stored, expected }) => {
    const fixture = useFixture()
    const { session } = await recommend(fixture, {
      attendees: ['dono'],
      count: 3,
    })
    const file = join(fixture.data, session.file)
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace(
        /^---\n/,
        `---\nshortfall: ${stored}\n`,
      ),
    )

    const cartaz = await fixture.ok(billboard({ session: session.id }))

    expect(cartaz.billboard.shortfall).toBe(expected)
  },
)
