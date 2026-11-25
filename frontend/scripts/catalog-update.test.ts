// `pnpm catalog:update` over the recorded dumps (`FILMES_GRAVACOES`): the
// manifest goes back into the config folder in its own language.
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrateConfig } from '@filmes/key-migration'
import { afterEach, expect, it } from 'vite-plus/test'
import { FIXTURE_TODAY, ROOT } from '../../packages/engine/test/fixture.ts'
import { runUpdate } from './catalog-update.ts'

const folders: string[] = []
afterEach(() => {
  for (const folder of folders.splice(0))
    rmSync(folder, { recursive: true, force: true })
})

/** The repo's config (Portuguese, without local.toml), the catalog and the
 * recordings in a scratch folder. */
function setUp(language: 'pt' | 'en' = 'pt') {
  const root = mkdtempSync(join(tmpdir(), 'filmes-catalog-update-test-'))
  folders.push(root)
  const config = join(root, 'config')
  if (language === 'pt')
    cpSync(join(ROOT, 'config'), config, {
      recursive: true,
      filter: (path) => !path.endsWith('local.toml'),
    })
  else {
    migrateConfig(join(ROOT, 'config'), config, 'to-en')
    rmSync(join(config, 'local.toml'), { force: true })
  }
  const recordings = join(root, 'recordings')
  cpSync(
    join(ROOT, 'tests/fixture/gravacoes/catalogo'),
    join(recordings, 'catalogo'),
    { recursive: true },
  )
  const env = {
    FILMES_CATALOGO: join(root, 'dumps'),
    FILMES_GRAVACOES: recordings,
    FILMES_HOJE: FIXTURE_TODAY,
    FILMES_LOCAL: join(root, 'no-local.toml'),
  }
  return { root, config, recordings, env }
}

async function updateWith(
  env: Record<string, string>,
  argv: readonly string[],
) {
  const events: unknown[] = []
  const printed: string[] = []
  const code = await runUpdate({
    argv,
    env,
    progress: (event) => events.push(event),
    print: (text) => printed.push(text),
  })
  return { code, events, printed }
}

const manifestOf = (path: string) =>
  JSON.parse(readFileSync(path, 'utf8')) as {
    dumps: Record<string, Record<string, unknown>>
  }

it('pins the dumps in the Portuguese manifest of a Portuguese config', async () => {
  const { config, env } = setUp('pt')

  const { code, events } = await updateWith(env, ['--config', config])

  expect(code).toBe(0)
  const dumps = manifestOf(join(config, 'versoes-catalogo.json')).dumps
  expect(Object.keys(dumps)).toHaveLength(12)
  expect(Object.keys(dumps['title.basics.tsv.gz']!)).toEqual([
    'bytes',
    'data',
    'fonte',
    'sha256',
    'url',
  ])
  expect(dumps['title.basics.tsv.gz']).toMatchObject({
    data: FIXTURE_TODAY,
    fonte: 'IMDb',
  })
  expect(existsSync(join(config, 'catalog-versions.json'))).toBe(false)
  expect(events.at(-1)).toEqual({
    progress: 12,
    total: 12,
    message: 'Versões do Catálogo gravadas',
  })
})

it('pins the dumps in the English manifest of an English config', async () => {
  const { config, env } = setUp('en')

  const { code } = await updateWith(env, ['--config', config])

  expect(code).toBe(0)
  expect(
    manifestOf(join(config, 'catalog-versions.json')).dumps['ml-32m.zip'],
  ).toMatchObject({ date: '2023-10-13', source: 'MovieLens ml-32m' })
})

it('a failed update prints the error and keeps the manifest', async () => {
  const { config, recordings, env } = setUp('pt')
  const before = readFileSync(join(config, 'versoes-catalogo.json'))
  writeFileSync(join(recordings, 'catalogo', 'ml-32m.zip'), 'nada')

  const { code, printed } = await updateWith(env, ['--config', config])

  expect(code).toBe(1)
  expect(JSON.parse(printed[0]!)).toEqual({
    error: {
      code: 'update_failed',
      message: 'ml-32m.zip: File is not a zip file',
    },
  })
  expect(readFileSync(join(config, 'versoes-catalogo.json'))).toEqual(before)
})

it('a FILMES_VERSOES of the caller gets the manifest instead', async () => {
  const { root, config, env } = setUp('pt')
  const before = readFileSync(join(config, 'versoes-catalogo.json'))
  const versions = join(root, 'elsewhere.json')

  const { code } = await updateWith({ ...env, FILMES_VERSOES: versions }, [
    '--config',
    config,
  ])

  expect(code).toBe(0)
  expect(manifestOf(versions).dumps['ml-32m.zip']).toMatchObject({
    source: 'MovieLens ml-32m',
  })
  expect(readFileSync(join(config, 'versoes-catalogo.json'))).toEqual(before)
})

it('anything else gets the usage', async () => {
  const { code, printed } = await updateWith({}, ['--other'])

  expect(code).toBe(2)
  expect(printed).toEqual(['Usage: pnpm catalog:update [--config <config>]'])
})
