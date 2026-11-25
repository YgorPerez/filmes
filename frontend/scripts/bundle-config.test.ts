import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import { makeEngine, listPeople } from '@filmes/engine'
import { useFixture } from '../../packages/engine/test/fixture.ts'
import { bundleConfig } from './bundle-config.ts'

const ROOT = join(import.meta.dirname, '../..')

describe('bundleConfig', () => {
  it("puts the repo's config, in English, where the engine reads it", async () => {
    const fixture = useFixture()
    const config = join(fixture.root, 'bundled')

    const written = bundleConfig(join(ROOT, 'config'), config)

    expect(written).toContain('weights.toml')
    expect(readFileSync(join(config, 'weights.toml'), 'utf8')).toBe(
      readFileSync(join(fixture.config, 'weights.toml'), 'utf8'),
    )
    const engine = makeEngine({ ...fixture.vars, FILMES_CONFIG: config })
    try {
      expect(await engine.run(listPeople)).toMatchObject({ exitCode: 0 })
    } finally {
      await engine.dispose()
    }
  })

  it('leaves local.toml out, and replaces what was there', () => {
    const fixture = useFixture()
    const source = join(fixture.root, 'source')
    mkdirSync(source)
    writeFileSync(join(source, 'pesos.toml'), '[catalogo]\nvotos_minimos = 1\n')
    writeFileSync(join(source, 'local.toml'), '[caminhos]\nbanco = "/x"\n')
    const destination = join(fixture.root, 'out')
    mkdirSync(destination)
    writeFileSync(join(destination, 'stale.toml'), '')

    expect(bundleConfig(source, destination)).toEqual(['weights.toml'])
    expect(existsSync(join(destination, 'local.toml'))).toBe(false)
    expect(existsSync(join(destination, 'stale.toml'))).toBe(false)
    expect(readFileSync(join(destination, 'weights.toml'), 'utf8')).toBe(
      '[catalog]\nmin_votes = 1\n',
    )
  })

  it('takes a config already in English as it is', () => {
    const fixture = useFixture()
    const destination = join(fixture.root, 'again')

    bundleConfig(fixture.config, destination)

    for (const name of ['weights.toml', 'moods.toml', 'tag_vetoes.toml'])
      expect(readFileSync(join(destination, name), 'utf8')).toBe(
        readFileSync(join(fixture.config, name), 'utf8'),
      )
  })
})
