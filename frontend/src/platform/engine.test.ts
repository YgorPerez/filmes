import { describe, expect, it } from 'vite-plus/test'
import { listPeople } from '@filmes/engine'
import { appEngine, engineVars } from './engine'

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
    const outcome = await engine.run(listPeople)
    // Its result depends on the shell's FILMES_*; it answers, never throws.
    expect(outcome).toHaveProperty('exitCode')
  })
})
