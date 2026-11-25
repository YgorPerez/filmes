import { describe, expect, it } from 'vite-plus/test'
import { planForDiff } from './affected.ts'

describe('planForDiff', () => {
  it('an app file runs only the app Vitest', () => {
    expect(planForDiff(['frontend/src/ui/home.tsx'])).toMatchObject({
      full: null,
      vitest: ['frontend'],
    })
  })

  it('the engine package also runs the app and the MCP server, which import it', () => {
    expect(planForDiff(['packages/engine/src/index.ts']).vitest).toEqual([
      'frontend',
      'packages/engine',
      'packages/mcp-server',
    ])
  })

  it('the MCP server runs only its own tests', () => {
    expect(
      planForDiff(['packages/mcp-server/src/tools/recommend.ts']),
    ).toMatchObject({
      vitest: ['packages/mcp-server'],
    })
  })

  it("config/ and the fixture data run the engine's and the MCP server's tests", () => {
    for (const file of [
      'config/weights.toml',
      'tests/fixture/dados/people/ana.md',
    ])
      expect({ file, ...planForDiff([file]) }).toMatchObject({
        file,
        vitest: ['packages/engine', 'packages/mcp-server'],
      })
  })

  it("Markdown a package's tests read is data: it runs that package's tests", () => {
    expect(
      planForDiff(['packages/mcp-server/test/fixture/note.md']),
    ).toMatchObject({
      vitest: ['packages/mcp-server'],
    })
  })

  it("the engine's fixture also runs the engine's and the MCP server's tests", () => {
    // The MCP server's tests run the engine on the same fixture.
    expect(planForDiff(['tests/fixture/catalogo/filmes.csv'])).toMatchObject({
      vitest: ['packages/engine', 'packages/mcp-server'],
    })
  })

  it('the root scripts and the CI scripts run the root Vitest', () => {
    expect(
      planForDiff(['scripts/verify-push.ts', '.github/scripts/x.ts']).vitest,
    ).toEqual(['.'])
  })

  it('text runs nothing', () => {
    expect(
      planForDiff(['README.md', 'docs/x.md', '.claude/x.md']),
    ).toMatchObject({ vitest: [] })
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
        vitest: ['frontend', 'packages/engine', 'packages/mcp-server', '.'],
      })
    }
  })
})
