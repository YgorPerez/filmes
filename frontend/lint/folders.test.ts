import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vite-plus/test'
import { outOfPlace } from './folders.ts'

let root: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'folders-'))
  for (const file of [
    // In place.
    'frontend/src/routes/_owner/sessoes/$sessao/index.tsx',
    'frontend/src/routes/sessoes/$sessao/responder.ts',
    'frontend/src/routes/__root.tsx',
    'frontend/src/ui/home.tsx',
    'frontend/src/ui/home.copy.ts',
    'frontend/src/ui/home.test.tsx',
    'frontend/src/ui/kit/chip.tsx',
    'frontend/src/mcp-view/index.html',
    'frontend/src/router.tsx',
    'frontend/src/routeTree.gen.ts',
    'packages/engine/src/index.ts',
    'packages/engine/src/evidence/ruler.ts',
    'packages/engine/src/recommendation/signals/director.ts',
    'packages/mcp-server/src/server.ts',
    'packages/mcp-server/src/tools/recommend.ts',
    // Out of place.
    'frontend/src/routes/_owner/-card.tsx',
    'frontend/src/routes/home.css',
    'frontend/src/routes/home.test.tsx',
    'frontend/src/components/button.tsx',
    'frontend/src/util.ts',
    'frontend/src/ui/__tests__/home.test.tsx',
    'packages/engine/src/helpers.ts',
    'packages/engine/src/misc/dates.ts',
    'packages/mcp-server/src/tools/people/add.ts',
    'packages/mcp-server/src/lib/json.ts',
  ]) {
    const path = join(root, file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, '')
  }
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

it('finds each file out of place, and only those', () => {
  expect(
    outOfPlace(root)
      .map((a) => a.file)
      .sort(),
  ).toEqual([
    'frontend/src/components/button.tsx',
    'frontend/src/routes/_owner/-card.tsx',
    'frontend/src/routes/home.css',
    'frontend/src/routes/home.test.tsx',
    'frontend/src/ui/__tests__/home.test.tsx',
    'frontend/src/util.ts',
    'packages/engine/src/helpers.ts',
    'packages/engine/src/misc/dates.ts',
    'packages/mcp-server/src/lib/json.ts',
    'packages/mcp-server/src/tools/people/add.ts',
  ])
})

it('each finding says where the file goes', () => {
  const fromEngine = outOfPlace(root).find((a) =>
    a.file.startsWith('packages/engine/'),
  )
  expect(fromEngine?.reason).toMatch(/areas/)
})

it('the real repository is in place', () => {
  expect(outOfPlace()).toEqual([])
})
