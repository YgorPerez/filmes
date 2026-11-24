import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import { normalizeLegacy } from '../src/legacy.ts'
import {
  migrateConfigFile,
  migrateDataFile,
  roundTrip,
} from '../src/migrate.ts'
import { renameValue } from '../src/output.ts'
import { CONFIG_FILES } from '../src/tables/config.ts'
import { letterboxdResolutions, person, session } from '../src/tables/data.ts'
import {
  CONFIG,
  corpus,
  FIXTURE_DATA,
  frontmatter,
  type Kind,
} from './helpers.ts'

const SHAPES = { person, session, letterboxd: letterboxdResolutions }

describe('PT → EN → PT gives the same files', () => {
  test('over the fixture filmes-dados', () => {
    const result = roundTrip(FIXTURE_DATA, 'data')
    expect(result.different).toEqual([])
    expect(result.normalized).toEqual([])
    expect(result.identical.length).toBeGreaterThan(0)
    expect(result.english.map((f) => f.to)).toContain('people/bruno.md')
  })

  test('over config/', () => {
    const result = roundTrip(CONFIG, 'config')
    expect(result.different).toEqual([])
    // `local.toml` is outside git: only on the machines that have one.
    const local = existsSync(join(CONFIG, 'local.toml')) ? ['local.toml'] : []
    expect(result.identical).toEqual(
      Object.keys(CONFIG_FILES)
        .filter((n) => n !== 'local.toml')
        .concat(local)
        .sort(),
    )
    expect(result.english.map((f) => f.to).sort()).toEqual(
      [
        'catalog-versions.json',
        'group_alone.toml',
        'moods.toml',
        'sadness.toml',
        'tag_vetoes.toml',
        'weights.toml',
        ...local,
      ].sort(),
    )
  })

  for (const kind of ['person', 'session', 'letterboxd'] as const)
    test.each(corpus(kind))(`over the corpus: ${kind} $name`, ({ text }) => {
      const english = migrateDataFile(kind, text, 'to-en')
      expect(migrateDataFile(kind, english, 'to-pt')).toBe(text)
    })
})

describe('the English file holds the same data under English names', () => {
  const cases = (['person', 'session', 'letterboxd'] as const).flatMap(
    (kind: Kind) => corpus(kind).map((file) => ({ kind, ...file })),
  )
  test.each(cases)('$kind $name', ({ kind, text }) => {
    const english = migrateDataFile(kind, text, 'to-en')
    expect(frontmatter(english)).toEqual(
      renameValue(frontmatter(normalizeLegacy(kind, text)), SHAPES[kind]),
    )
    // The body is not touched.
    expect(english.slice(english.indexOf('\n---', 4))).toBe(
      text.slice(text.indexOf('\n---', 4)),
    )
  })

  test('a Session in English', () => {
    const [first] = corpus('session').filter((f) => f.text.includes('saidas:'))
    const english = migrateDataFile('session', first!.text, 'to-en')
    expect(english).toMatch(/^attendees: /m)
    expect(english).toMatch(/^dropped:/m)
    expect(english).not.toMatch(/^(presentes|saidas|recomendacao):/m)
  })

  test('config: weights.toml keeps its comments and renames tables and keys', () => {
    const text = readFileSync(join(CONFIG, 'pesos.toml'), 'utf8')
    const english = migrateConfigFile('pesos.toml', text, 'to-en')!
    expect(english.name).toBe('weights.toml')
    expect(english.text).toContain('[strength.multiplier]\n')
    expect(english.text).toMatch(/^strong = 1\.0$/m)
    expect(english.text).toMatch(/^min_imdb_rating = 7\.0$/m)
    expect(english.text).toContain('[similar.weight]')
    expect(english.text).toContain('# Pesos do motor.')
    expect(english.text).not.toMatch(/^\[(forca|caminho|parecido)/m)
  })

  test('config: the Clima names stay and their keys move', () => {
    const text = readFileSync(join(CONFIG, 'climas.toml'), 'utf8')
    const english = migrateConfigFile('climas.toml', text, 'to-en')!.text
    expect(english).toContain('["pra rir"]')
    expect(english).toMatch(/^genres = /m)
    expect(english).not.toMatch(/^generos = /m)
  })

  test('config: the tag groups are renamed and their label stays PT', () => {
    const text = readFileSync(join(CONFIG, 'vetos_por_tag.toml'), 'utf8')
    const english = migrateConfigFile('vetos_por_tag.toml', text, 'to-en')!.text
    expect(english).toContain('[silly_comedy]')
    expect(english).toContain('label = "comédia boba"')
    expect(english).toContain('imdb_genres = ["Comedy"]')
  })

  test('config: the catalog manifest keeps the dump names', () => {
    const text = readFileSync(join(CONFIG, 'versoes-catalogo.json'), 'utf8')
    const english = migrateConfigFile('versoes-catalogo.json', text, 'to-en')!
    const parsed = JSON.parse(english.text) as {
      dumps: Record<string, Record<string, unknown>>
    }
    const original = JSON.parse(text) as typeof parsed
    expect(Object.keys(parsed.dumps)).toEqual(Object.keys(original.dumps))
    const [name] = Object.keys(original.dumps)
    expect(parsed.dumps[name!]).toEqual({
      bytes: original.dumps[name!]!['bytes'],
      date: original.dumps[name!]!['data'],
      source: original.dumps[name!]!['fonte'],
      sha256: original.dumps[name!]!['sha256'],
      url: original.dumps[name!]!['url'],
    })
  })
})
