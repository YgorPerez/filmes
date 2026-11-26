import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vite-plus/test'
import { makeEngine } from '@filmes/engine'
import { useFixture } from '../../../packages/engine/test/fixture.ts'
import { health } from './operations'

async function probe(vars: Record<string, string | undefined>) {
  const engine = makeEngine(vars)
  try {
    const response = await health(engine)
    return { status: response.status, body: await response.text() }
  } finally {
    await engine.dispose()
  }
}

describe('health', () => {
  it('is ok on a database this schema built', async () => {
    const fixture = useFixture()
    expect(await probe(fixture.vars)).toEqual({ status: 200, body: 'ok\n' })
  })

  it('says the database is outdated when another schema built it', async () => {
    const fixture = useFixture()
    const db = new DatabaseSync(fixture.database)
    db.exec('PRAGMA user_version = 0')
    db.close()
    expect(await probe(fixture.vars)).toEqual({
      status: 503,
      body: 'banco-desatualizado\n',
    })
  })

  it('says there is no database before the first publish', async () => {
    const fixture = useFixture()
    expect(
      await probe({
        ...fixture.vars,
        FILMES_BANCO: join(fixture.root, 'none.sqlite'),
      }),
    ).toEqual({ status: 503, body: 'sem-banco\n' })
  })
})
