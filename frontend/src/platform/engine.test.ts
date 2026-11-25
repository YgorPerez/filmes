import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vite-plus/test'
import { readPeople, makeEngine } from '@filmes/engine'
import { useFixture } from '../../../packages/engine/test/fixture.ts'
import { appEngine, engineReady, engineVars, reloadOnStart } from './engine'

describe('engineVars', () => {
  it('points the engine at the login folder and the live database', () => {
    const vars = engineVars({
      FILMES_CONFIG: '/app/config',
      DATA_REPO_PATH: '/data/filmes-dados',
      FILMES_DATABASE: '/data/db/20261124-120000.sqlite',
      FILMES_DADOS: '/somewhere/else',
    })
    expect(vars).toMatchObject({
      FILMES_CONFIG: '/app/config',
      FILMES_DADOS: '/data/filmes-dados',
      FILMES_BANCO: '/data/db/20261124-120000.sqlite',
    })
  })

  it('leaves the database unset before the first publish', () => {
    const vars = engineVars({})
    expect(vars.FILMES_DADOS).toBe('/data/filmes-dados')
    expect(vars.FILMES_BANCO).toBeUndefined()
  })
})

describe('appEngine', () => {
  it('is one engine per process, which answers even when misconfigured', async () => {
    const engine = appEngine()
    expect(appEngine()).toBe(engine)
    const outcome = await engine.run(readPeople)
    // Its result depends on the shell's FILMES_*; it answers, never throws.
    expect(outcome).toHaveProperty('exitCode')
  })
})

describe('reloadOnStart', () => {
  it('reloads filmes-dados into the database before the app serves', async () => {
    const fixture = useFixture()
    // A Pessoa the VPS wrote after the database was built.
    writeFileSync(
      join(fixture.data, 'people', 'olga.md'),
      '---\nname: Olga\n---\n',
    )
    const engine = makeEngine(fixture.vars)
    const lines: string[] = []
    try {
      await reloadOnStart(engine, fixture.database, (line) => lines.push(line))
    } finally {
      await engine.dispose()
    }
    const db = new DatabaseSync(fixture.database, { readOnly: true })
    const olga = db
      .prepare("SELECT nome FROM pessoas WHERE slug = 'olga'")
      .get()
    db.close()
    expect(olga).toEqual({ nome: 'Olga' })
    expect(lines).toEqual([
      expect.stringMatching(
        /^engine: reloaded 7 Pessoas and 0 Sessions in \d+ms$/,
      ),
    ])
  })

  it('logs the engine error and still lets the app serve', async () => {
    const fixture = useFixture()
    const missing = join(fixture.root, 'none.sqlite')
    const engine = makeEngine({ ...fixture.vars, FILMES_BANCO: missing })
    const lines: string[] = []
    try {
      await reloadOnStart(engine, missing, (line) => lines.push(line))
    } finally {
      await engine.dispose()
    }
    expect(lines).toEqual([
      expect.stringMatching(/^engine: reload: missing_database: /),
    ])
  })

  it('has nothing to reload before the first db:publish', async () => {
    const lines: string[] = []
    await reloadOnStart(appEngine(), undefined, (line) => lines.push(line))
    expect(lines).toEqual(['engine: no FILMES_DATABASE yet, nothing to reload'])
  })
})

describe('engineReady', () => {
  it('reloads once per process', async () => {
    const ready = engineReady()
    expect(engineReady()).toBe(ready)
    await expect(ready).resolves.toBeUndefined()
  })
})
