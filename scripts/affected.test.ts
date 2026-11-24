import { describe, expect, it } from 'vite-plus/test'
import { planForDiff } from './affected.ts'

describe('planForDiff', () => {
  it('an app file runs only the app Vitest', () => {
    expect(planForDiff(['frontend/src/ui/home.tsx'])).toMatchObject({
      full: null,
      vitest: ['frontend'],
      mcp: false,
      python: false,
    })
  })

  it('the engine package also runs the app, which imports it', () => {
    expect(planForDiff(['packages/engine/src/index.ts']).vitest).toEqual([
      'frontend',
      'packages/engine',
    ])
  })

  it('the key migration runs only its own tests', () => {
    expect(
      planForDiff(['packages/key-migration/src/migrate.ts']),
    ).toMatchObject({
      vitest: ['packages/key-migration'],
      mcp: false,
      python: false,
    })
  })

  it('config/ and the fixture data also run the key migration, which round-trips them', () => {
    for (const file of [
      'config/pesos.toml',
      'tests/fixture/dados/pessoas/ana.md',
    ])
      expect({ file, ...planForDiff([file]) }).toMatchObject({
        file,
        vitest: ['packages/key-migration'],
        mcp: true,
        python: true,
      })
  })

  it('the Python engine runs pytest and the MCP tests, which call its CLI', () => {
    for (const file of ['filmes/cli.py', 'tests/test_recomendar.py', 'uv.lock'])
      expect({ file, ...planForDiff([file]) }).toMatchObject({
        file,
        vitest: [],
        mcp: true,
        python: true,
      })
  })

  it('the MCP runs only its own tests', () => {
    expect(planForDiff(['mcp/src/cli.ts'])).toMatchObject({
      vitest: [],
      mcp: true,
      python: false,
    })
  })

  it('the root scripts and the CI scripts run the root Vitest', () => {
    expect(
      planForDiff(['scripts/verify-push.ts', '.github/scripts/x.ts']).vitest,
    ).toEqual(['.'])
  })

  it('text runs nothing', () => {
    expect(
      planForDiff(['README.md', 'docs/x.md', 'skill/filmes/SKILL.md']),
    ).toMatchObject({ vitest: [], mcp: false, python: false })
  })

  it('the lockfile, a config or the CI runs everything, and says why', () => {
    for (const file of [
      'pnpm-lock.yaml',
      'frontend/package.json',
      'packages/engine/tsconfig.json',
      'vite.config.ts',
      '.github/workflows/pr.yml',
    ]) {
      const plan = planForDiff(['frontend/src/ui/home.tsx', file])
      expect(plan.full).toContain(file)
      expect(plan).toMatchObject({
        vitest: ['frontend', 'packages/engine', 'packages/key-migration', '.'],
        mcp: true,
        python: true,
      })
    }
  })
})
