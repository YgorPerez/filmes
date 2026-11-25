// filmes-dados, the fixture and `config/` have one shape: English keys and
// names (ADR 0002, #135). Nothing migrates them at run time any more, and
// this keeps it so: no source outside the tests imports the retired key
// migration, or reads a Portuguese data folder or config file.
//
// The site's URLs (`/pessoas`, `/sessoes`) are interface text (ADR 0001)
// and the derived database keeps its Portuguese tables: neither is a data
// folder, and neither matches.

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'

const ROOT = resolve(import.meta.dirname, '..')

const tracked = (): string[] =>
  spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
    .stdout.split('\0')
    .filter(Boolean)

/** Code, and what builds and ships it. */
const SOURCE = /\.(ts|tsx|js|mjs|cjs|sh|ya?ml|json|jsonc)$|(^|\/)Dockerfile$/
/** Tests, their fixtures, history and generated files. */
const NOT_SOURCE =
  /\.test\.tsx?$|(^|\/)(test|tests|e2e)\/|^docs\/|(^|\/)pnpm-lock\.yaml$|routeTree\.gen\.ts$/

const SHAPES: ReadonlyArray<[string, RegExp]> = [
  ['imports the key migration', /key-migration/],
  [
    'reads a Portuguese data folder',
    new RegExp(
      [
        // `join(root, 'pessoas')`, `join(data, "sessoes", id)`
        String.raw`join\([^)]*['"\x60](dados\/)?(pessoas|sessoes)['"\x60/]`,
        // `pessoas/bruno.md`, `sessoes/${id}.md`
        String.raw`\b(pessoas|sessoes)\/[^\s'"\x60]*\.md\b`,
      ].join('|'),
    ),
  ],
  [
    'reads a Portuguese config file',
    /\b(pesos|climas|tristeza|vetos_por_tag|grupo_sozinho)\.toml\b|versoes-catalogo\.json/,
  ],
]

/** The lines of `text` that go back to the two shapes, as `file:line: why`. */
const offences = (file: string, text: string): string[] =>
  text
    .split('\n')
    .flatMap((line, i) =>
      SHAPES.filter(([, pattern]) => pattern.test(line)).map(
        ([why]) => `${file}:${i + 1}: ${why}: ${line.trim()}`,
      ),
    )

describe('one shape of the data', () => {
  it('no source migrates keys or reads the Portuguese names', () => {
    const found = tracked()
      .filter((file) => SOURCE.test(file) && !NOT_SOURCE.test(file))
      .flatMap((file) => offences(file, readFileSync(join(ROOT, file), 'utf8')))
    expect(found).toEqual([])
  })

  it('catches what the readers did before the cutover', () => {
    for (const line of [
      "import { migrateDataFile } from '@filmes/key-migration'",
      "const folder = join(root, portuguese ? 'pessoas' : 'people')",
      'writeFileSync(join(data, `sessoes/${id}.md`), text)',
      "readFileSync(join(config, 'pesos.toml'))",
      "const MANIFEST = 'versoes-catalogo.json'",
    ])
      expect(offences('x.ts', line)).toHaveLength(1)
  })

  it('lets the site URLs and the database tables be', () => {
    for (const line of [
      "await page.goto('/pessoas/iara')",
      '`POST /sessoes/<id>/responder`',
      "SELECT slug, nome FROM pessoas WHERE slug = 'iara'",
      '<h2 id="pessoas">',
      "join(fixture.data, 'people', `${slug}.md`)",
    ])
      expect(offences('x.ts', line)).toEqual([])
  })
})
