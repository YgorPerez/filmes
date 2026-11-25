// `search_catalog` (#128): any logged-in Dono turns a title or a name into
// the IDs the other tools take, where `consult` is the admin's.
import assert from 'node:assert/strict'
import { describe, test } from 'vite-plus/test'
import { useFixture } from '../../engine/test/fixture.ts'
import { connect } from './connect.ts'

describe('search_catalog', () => {
  test('is listed and answers a Dono without admin, where consult does not', async () => {
    // The edge says she is no admin: consult is not even served.
    const c = await connect(useFixture(), 'bruno', {}, { admin: false })

    const names = (await c.client.listTools()).tools.map((t) => t.name)
    const found = await c.ok('search_catalog', {
      query: 'mare baixa',
      kinds: ['film'],
    })

    assert.ok(names.includes('search_catalog'))
    assert.ok(!names.includes('consult'))
    assert.deepEqual(found.films, [
      {
        id: 'tt9000102',
        title: 'Maré Baixa',
        year: 2015,
        votes: 32000,
        rating: null,
        directors: ['Helena Prado'],
      },
    ])
  })

  test('gives the target for a Declarado, which person then records', async () => {
    const c = await connect(useFixture(), 'bruno')

    const { people } = await c.ok('search_catalog', {
      query: 'Helena Prado',
      kinds: ['person'],
      limit: 1,
    })
    const [helena] = people
    await c.ok('person', {
      action: 'state',
      person: 'iara',
      text: 'adora a Helena Prado',
      entity: helena.id,
      reaction: 'love',
    })
    const view = await c.ok('person', { action: 'view', person: 'iara' })

    assert.deepEqual(helena.links, ['director'])
    assert.ok(JSON.stringify(view).includes(helena.id))
  })

  test('a query too short is the engine coded refusal; a bad limit, the schema', async () => {
    const c = await connect(useFixture(), 'bruno')

    const short = await c.error('search_catalog', { query: 'é' })
    const limit = await c.call('search_catalog', { query: 'mar', limit: 99 })

    assert.equal(short.error.code, 'invalid_usage')
    assert.equal(limit.isError, true)
    assert.match(JSON.stringify(limit.content), /Input validation error/)
  })
})
