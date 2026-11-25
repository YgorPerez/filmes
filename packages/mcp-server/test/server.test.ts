import assert from 'node:assert/strict'
import { KIND_IN_BODY, STRENGTH_IN_BODY } from '@filmes/engine'
import { describe, test } from 'vite-plus/test'
import { INSTRUCTIONS, SERVER_INFO, TOOLS } from '../src/index.ts'
import { useFixture } from '../../engine/test/fixture.ts'
import { connect } from './connect.ts'

describe('the server', () => {
  test('lists the tools, English names and PT-BR descriptions', async () => {
    const { client } = await connect(useFixture())

    const { tools } = await client.listTools()

    assert.deepEqual(
      tools.map((t) => t.name),
      [
        'open_sessions',
        'recommend',
        'billboard',
        'answer_billboard',
        'verify_answer',
        'record_feedback',
        'search_catalog',
        'person',
        'import',
        'import_queue',
        'export',
        'consult',
        'evaluate',
      ],
    )
    for (const tool of tools)
      assert.match(tool.description ?? '', /Sessão|Pessoa|Recomendação|banco/)
    assert.deepEqual(
      TOOLS.map((t) => t.name),
      tools.map((t) => t.name),
    )
  })

  test('sends the instructions, with the PT words for the output values', async () => {
    const { client } = await connect(useFixture())

    assert.deepEqual(client.getServerVersion(), SERVER_INFO)
    const instructions = client.getInstructions()
    assert.equal(instructions, INSTRUCTIONS)
    for (const [value, word] of Object.entries({
      ...STRENGTH_IN_BODY,
      ...KIND_IN_BODY,
    }))
      assert.ok(instructions?.includes(`\`${value}\` é ${word}`), value)
    // Every tool is in the instructions, and none is said to be missing.
    assert.doesNotMatch(instructions ?? '', /ainda não dá para fazer/)
    const named = new Set(
      [...(instructions ?? '').matchAll(/`([a-z]+(?:_[a-z]+)*)`/g)].map(
        (m) => m[1],
      ),
    )
    for (const tool of TOOLS) assert.ok(named.has(tool.name), tool.name)
  })

  test('runs every call as the logged-in Pessoa', async () => {
    const { ok } = await connect(useFixture(), 'iara')

    const recommendation = await ok('recommend', { attendees: ['dono'] })
    const billboard = await ok('billboard', {
      session: recommendation.session.id,
    })

    assert.deepEqual(recommendation.attendees, ['iara'])
    assert.deepEqual(
      billboard.billboard.attendees.map(
        (p: { slug: string; label: string }) => [p.slug, p.label],
      ),
      [['iara', 'Você']],
    )
  })
})
