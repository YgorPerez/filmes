// The admin tools (#110): `consult` (the old servidor.test's two cases) and
// `evaluate` (avaliar.test), only for a Pessoa with `admin: true`.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'vite-plus/test'
import { ADMIN_ONLY } from '../src/server.ts'
import { useFixture, type Fixture } from '../../engine/test/fixture.ts'
import { connect } from './connect.ts'

/** Gives the Pessoa `admin: true` in her file. */
const makeAdmin = (fixture: Fixture, slug: string) => {
  const file = join(fixture.data, 'people', `${slug}.md`)
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(/^---\n/, '---\nadmin: true\n'),
  )
}

describe('consult', () => {
  test('runs a SELECT for an admin and refuses a write', async () => {
    const fixture = useFixture()
    makeAdmin(fixture, 'bruno')
    const c = await connect(fixture, 'bruno')

    assert.deepEqual(
      await c.ok('consult', {
        sql: "SELECT titulo FROM filmes WHERE id = 'tt9000101'",
      }),
      { columns: ['titulo'], rows: [['O Farol de Areia']] },
    )
    assert.equal(
      (await c.error('consult', { sql: 'DELETE FROM filmes' })).error.code,
      'read_only',
    )
  })

  test('refuses a Pessoa without admin: true, with a code', async () => {
    const c = await connect(useFixture(), 'bruno')

    const refused = await c.error('consult', { sql: 'SELECT 1' })

    assert.deepEqual(refused, ADMIN_ONLY)
    assert.equal(refused.error.code, 'admin_only')
  })

  test('without a login, asks the Dono of the data', async () => {
    const fixture = useFixture()
    assert.deepEqual(
      await (await connect(fixture)).error('consult', { sql: 'SELECT 1' }),
      ADMIN_ONLY,
    )
    makeAdmin(fixture, 'bruno')
    assert.deepEqual(
      await (await connect(fixture)).ok('consult', { sql: 'SELECT 1 AS n' }),
      { columns: ['n'], rows: [[1]] },
    )
  })

  test('with no Dono in the data and no login, no one is admin', async () => {
    const fixture = useFixture()
    makeAdmin(fixture, 'bruno')
    const bruno = join(fixture.data, 'people', 'bruno.md')
    writeFileSync(
      bruno,
      readFileSync(bruno, 'utf8').replace(/^owner: true\n/m, ''),
    )

    assert.deepEqual(
      await (await connect(fixture)).error('consult', { sql: 'SELECT 1' }),
      ADMIN_ONLY,
    )
  })

  test('a logged-in Pessoa whose file is gone is no admin', async () => {
    const c = await connect(useFixture(), 'ninguem')

    assert.deepEqual(await c.error('consult', { sql: 'SELECT 1' }), ADMIN_ONLY)
  })
})

describe('evaluate', () => {
  test('writes the report and notifies its progress, in order', async () => {
    const fixture = useFixture()
    makeAdmin(fixture, 'bruno')
    const reports = join(fixture.root, 'avaliacoes')
    const c = await connect(fixture, 'bruno', { FILMES_AVALIACOES: reports })

    const steps: { progress: number; total?: number; message?: string }[] = []
    const result = await c.client.callTool(
      { name: 'evaluate', arguments: {} },
      { onprogress: (event) => void steps.push(event) },
    )

    assert.equal(result.isError, false)
    const [block] = result.content as { text: string }[]
    const evaluation: any = JSON.parse(block!.text)
    assert.equal(evaluation.offline.people.heldOut4Plus, 5)
    assert.ok(existsSync(evaluation.file))
    assert.deepEqual(steps[0], {
      progress: 0,
      total: 100,
      message: 'Lendo o Feedback e os diários',
    })
    assert.ok(steps.length > 2)
    assert.equal(steps.at(-1)?.progress, 100)
    assert.ok(
      steps.slice(1).every((step, i) => step.progress > steps[i]!.progress),
    )
  })

  test('tries the weight grid without progress, and is admin only', async () => {
    const fixture = useFixture()
    const vars = { FILMES_AVALIACOES: join(fixture.root, 'avaliacoes') }
    assert.deepEqual(
      await (await connect(fixture, 'bruno', vars)).error('evaluate'),
      ADMIN_ONLY,
    )
    makeAdmin(fixture, 'bruno')

    const evaluation = await (
      await connect(fixture, 'bruno', vars)
    ).ok('evaluate', { grid: true })

    assert.equal(evaluation.grid.best.length, 3)
    assert.ok(existsSync(evaluation.file))
    // 300 weight sets × 4 Pessoas: about 20 s alone, more under a full check.
  }, 180_000)
})

describe('the admin option of an edge that knows the Pessoa', () => {
  test('false leaves consult and evaluate out: not listed, not callable', async () => {
    const fixture = useFixture()
    // Her file says admin, but the edge's word is the one that counts.
    makeAdmin(fixture, 'bruno')
    const c = await connect(fixture, 'bruno', {}, false)

    const names = (await c.client.listTools()).tools.map((t) => t.name)

    assert.ok(names.includes('person'))
    assert.ok(!names.includes('consult'))
    assert.ok(!names.includes('evaluate'))
    await assert.rejects(
      c.call('consult', { sql: 'SELECT 1' }),
      /Tool consult not found/,
    )
  })

  test('true serves them without reading her file', async () => {
    const c = await connect(useFixture(), 'bruno', {}, true)

    assert.deepEqual(await c.ok('consult', { sql: 'SELECT 1 AS n' }), {
      columns: ['n'],
      rows: [[1]],
    })
  })
})
