import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import {
  migrateConfig,
  migrateConfigFile,
  migrateData,
  migrateDataFile,
  roundTrip,
} from '../src/migrate.ts'
import { MigrationError } from '../src/error.ts'
import { readTree, scratch, writeTree } from './helpers.ts'

const PERSON = `---
nome: Ana
apelidos: [Aninha]
vetos:
- {texto: não quer comédia boba, alvo: comedia_boba, rotulo: comédia boba, data: '2026-11-20'}
- {texto: nunca vê terror, alvo: Q9001801, rotulo: Terror, data: '2026-11-20'}
ajustes:
- {elo: elenco, nivel: nada, data: '2026-11-20'}
imports: []
---
## Declarados

- 2026-11-20 · conversa com o Dono · ama Davi Couto (Q9001802) · "adoro o Davi Couto"
`

const SESSION = `---
data: 2026-11-20
presentes: [bruno, iara]
regra: {nome: de, pessoa: iara}
feedback:
  registrado_em: 2026-11-21
  reacoes:
  - {pessoa: iara, tipo: relato, reacao: não gostou}
  - {pessoa: bruno, tipo: nota, nota: 4.0}
---
## Recomendação
`

describe('a filmes-dados checkout', () => {
  test('moves pessoas/ and sessoes/ to people/ and sessions/, and copies the rest as is', () => {
    const work = scratch()
    const source = join(work, 'dados')
    writeTree(source, {
      'pessoas/ana.md': PERSON,
      'sessoes/2026-11-20-bruno-iara.md': SESSION,
      'imports/letterboxd.md': '---\nfilmes: []\n---\nResoluções.\n',
      'imports/ana/letterboxd-abc.zip': 'PK-bytes',
      'README.md': '# filmes-dados\n',
      '.git/HEAD': 'ref: refs/heads/main\n',
    })
    const results = migrateData(source, join(work, 'en'), 'to-en')
    expect(results.map((r) => [r.from, r.to, r.action])).toEqual([
      ['README.md', 'README.md', 'copied'],
      [
        'imports/ana/letterboxd-abc.zip',
        'imports/ana/letterboxd-abc.zip',
        'copied',
      ],
      ['imports/letterboxd.md', 'imports/letterboxd.md', 'rewritten'],
      ['pessoas/ana.md', 'people/ana.md', 'rewritten'],
      [
        'sessoes/2026-11-20-bruno-iara.md',
        'sessions/2026-11-20-bruno-iara.md',
        'rewritten',
      ],
    ])
    const english = readTree(join(work, 'en'))
    expect(Object.keys(english)).not.toContain('.git/HEAD')
    expect(english['imports/letterboxd.md']).toBe(
      '---\nfilms: []\n---\nResoluções.\n',
    )
    expect(english['people/ana.md']).toBe(`---
name: Ana
aliases: [Aninha]
vetoes:
- {text: não quer comédia boba, target: silly_comedy, label: comédia boba, date: '2026-11-20'}
- {text: nunca vê terror, target: Q9001801, label: Terror, date: '2026-11-20'}
adjustments:
- {link: cast, level: none, date: '2026-11-20'}
imports: []
---
## Declarados

- 2026-11-20 · conversa com o Dono · ama Davi Couto (Q9001802) · "adoro o Davi Couto"
`)
    expect(english['sessions/2026-11-20-bruno-iara.md']).toBe(`---
date: 2026-11-20
attendees: [bruno, iara]
rule: {name: by, person: iara}
feedback:
  recorded_on: 2026-11-21
  reactions:
  - {person: iara, kind: report, reaction: disliked}
  - {person: bruno, kind: rating, rating: 4.0}
---
## Recomendação
`)
    migrateData(join(work, 'en'), join(work, 'pt'), 'to-pt')
    const back = readTree(join(work, 'pt'))
    expect(back['pessoas/ana.md']).toBe(PERSON)
    expect(back['sessoes/2026-11-20-bruno-iara.md']).toBe(SESSION)
    expect(back['imports/ana/letterboxd-abc.zip']).toBe('PK-bytes')
  })

  test('never writes inside the source, nor into a folder with files', () => {
    const work = scratch()
    const source = join(work, 'dados')
    writeTree(source, { 'pessoas/ana.md': PERSON })
    expect(() => migrateData(source, join(source, 'en'), 'to-en')).toThrow(
      /outside the source/,
    )
    expect(() => migrateData(source, source, 'to-en')).toThrow(MigrationError)
    expect(() => migrateData(work, join(work, 'x'), 'to-en')).toThrow(
      /outside the source/,
    )
    writeTree(join(work, 'full'), { 'a.md': 'x' })
    expect(() => migrateData(source, join(work, 'full'), 'to-en')).toThrow(
      /not empty/,
    )
    expect(() =>
      migrateData(join(work, 'nope'), join(work, 'y'), 'to-en'),
    ).toThrow(/does not exist/)
    mkdirSync(join(work, 'empty'))
    migrateData(source, join(work, 'empty'), 'to-en')
    expect(existsSync(join(work, 'empty/people/ana.md'))).toBe(true)
  })

  test('a key outside the tables stops the migration and names the file and the path', () => {
    const work = scratch()
    writeTree(join(work, 'dados'), {
      'pessoas/ana.md':
        '---\nnome: Ana\nvetos:\n- {texto: x, cor: azul}\n---\n',
    })
    expect(() =>
      migrateData(join(work, 'dados'), join(work, 'en'), 'to-en'),
    ).toThrow("pessoas/ana.md: $.vetos[0]: unknown key 'cor'")
  })

  test('a closed-list value outside the tables stops it too', () => {
    expect(() =>
      migrateDataFile(
        'person',
        '---\najustes:\n- {elo: trilha, nivel: nada}\n---\n',
        'to-en',
      ),
    ).toThrow('$.ajustes[0].elo: unknown value "trilha"')
  })

  test('a shape the tables do not expect stops it', () => {
    expect(() =>
      migrateDataFile('person', '---\nvetos: {texto: x}\n---\n', 'to-en'),
    ).toThrow('a map where none was expected')
    expect(() =>
      migrateDataFile('person', '---\nnome: [Ana]\n---\n', 'to-en'),
    ).toThrow('a list where none was expected')
    expect(() =>
      migrateDataFile('person', '---\nvetos: [x]\n---\n', 'to-en'),
    ).toThrow('a single value where none was expected')
    expect(() =>
      migrateDataFile('person', '---\n[1, 2]: x\n---\n', 'to-en'),
    ).toThrow('not a single value')
    expect(() =>
      migrateDataFile('person', '---\nnome: [\n---\n', 'to-en'),
    ).toThrow('invalid YAML')
    expect(() =>
      migrateDataFile('person', '---\nnome: Ana\n', 'to-en'),
    ).toThrow("without the closing '---'")
  })

  test('a file without frontmatter is kept as it is', () => {
    expect(migrateDataFile('person', '# Ana\n', 'to-en')).toBe('# Ana\n')
  })

  test('keeps the quoting of a renamed value, and quotes what YAML would misread', () => {
    expect(
      migrateDataFile(
        'session',
        `---\nregra: {nome: "padrao"}\nsaidas:\n- {motivo: 'ja_visto'}\n---\n`,
        'to-en',
      ),
    ).toBe(`---\nrule: {name: "default"}\ndropped:\n- {cause: 'seen'}\n---\n`)
  })

  test('an English value that would read as a boolean or null in YAML 1.1 is quoted', async () => {
    const shape = await import('../src/shape.ts')
    const { rewriteYaml } = await import('../src/rewrite-yaml.ts')
    const yes = shape.map({
      a: ['b', shape.closed({ sim: 'yes', nulo: 'null', esp: 'x ', ok: 'ok' })],
    })
    expect(rewriteYaml('a: sim', yes)).toBe("b: 'yes'")
    expect(rewriteYaml('a: nulo', yes)).toBe("b: 'null'")
    expect(rewriteYaml('a: esp', yes)).toBe("b: 'x '")
    expect(rewriteYaml('a: ok', yes)).toBe('b: ok')
    expect(() => rewriteYaml('a: |-\n  sim\n', yes)).toThrow('block style')
  })
})

describe('older shapes', () => {
  test("a Session's rule written as a string becomes the default rule", () => {
    const old =
      '---\ndata: 2026-11-20\npresentes: [bruno]\nregra: media-sem-miseria-com-justica\nversoes:\n- versao: 1\n  regra: media-sem-miseria-com-justica\n---\n'
    const english = migrateDataFile('session', old, 'to-en')
    expect(english).toBe(
      '---\ndate: 2026-11-20\nattendees: [bruno]\nrule: {name: default}\nversions:\n- version: 1\n  rule: {name: default}\n---\n',
    )
  })

  test("a Letterboxd resolution's 'motivo' is its discard reason", () => {
    const old =
      "---\nfilmes:\n- {id: x, situacao: descartado, motivo: 'não é filme'}\n---\n"
    expect(migrateDataFile('letterboxd', old, 'to-en')).toBe(
      "---\nfilms:\n- {id: x, status: discarded, discard_reason: 'não é filme'}\n---\n",
    )
    expect(() =>
      migrateDataFile(
        'letterboxd',
        '---\nfilmes:\n- {motivo: a, razao: b}\n---\n',
        'to-en',
      ),
    ).toThrow("both 'motivo' and 'razao'")
  })

  test('the round trip reports such a file as normalized, not different', () => {
    const work = scratch()
    writeTree(join(work, 'dados'), {
      'sessoes/2026-11-20-bruno.md':
        '---\ndata: 2026-11-20\npresentes: [bruno]\nregra: media-sem-miseria-com-justica\n---\n',
      'imports/letterboxd.md': '---\nfilmes:\n- {id: x, motivo: r}\n---\n',
      'pessoas/ana.md': PERSON,
    })
    const result = roundTrip(join(work, 'dados'), 'data')
    expect(result).toMatchObject({
      identical: ['pessoas/ana.md'],
      normalized: ['imports/letterboxd.md', 'sessoes/2026-11-20-bruno.md'],
      different: [],
    })
  })

  test('a file that comes back different is reported', () => {
    const work = scratch()
    // A Veto target that is already the English name of a tag group passes
    // as an id on the way in and comes back as the Portuguese group.
    writeTree(join(work, 'dados'), {
      'pessoas/ana.md': '---\nvetos:\n- {alvo: silly_comedy}\n---\n',
    })
    expect(roundTrip(join(work, 'dados'), 'data').different).toEqual([
      'pessoas/ana.md',
    ])
  })
})

describe('config/', () => {
  test('renames the files it knows and copies the rest', () => {
    const work = scratch()
    writeTree(join(work, 'config'), {
      'grupo_sozinho.toml':
        'grupo = ["fun"]\nsozinho = [\n  "slow", # lento\n]\n',
      'local.toml':
        '[caminhos]\ndados = "/srv/filmes-dados"\nbanco = "/srv/filmes.sqlite"\n',
      'outra.txt': 'x',
    })
    mkdirSync(join(work, 'config/sub'))
    writeFileSync(join(work, 'config/sub/ignored.toml'), 'x = 1')
    const results = migrateConfig(
      join(work, 'config'),
      join(work, 'en'),
      'to-en',
    )
    expect(results.map((r) => [r.from, r.to, r.action])).toEqual([
      ['grupo_sozinho.toml', 'group_alone.toml', 'rewritten'],
      ['local.toml', 'local.toml', 'rewritten'],
      ['outra.txt', 'outra.txt', 'copied'],
    ])
    expect(readTree(join(work, 'en'))).toEqual({
      'group_alone.toml': 'group = ["fun"]\nalone = [\n  "slow", # lento\n]\n',
      'local.toml':
        '[paths]\ndata = "/srv/filmes-dados"\ndatabase = "/srv/filmes.sqlite"\n',
      'outra.txt': 'x',
    })
    migrateConfig(join(work, 'en'), join(work, 'pt'), 'to-pt')
    expect(readTree(join(work, 'pt'))['local.toml']).toBe(
      '[caminhos]\ndados = "/srv/filmes-dados"\nbanco = "/srv/filmes.sqlite"\n',
    )
  })

  test('a file it does not know has no migration', () => {
    expect(migrateConfigFile('outro.toml', 'x = 1', 'to-en')).toBeUndefined()
    expect(migrateConfigFile('pesos.toml', 'x = 1', 'to-pt')).toBeUndefined()
  })

  test('an error names the file', () => {
    expect(() => migrateConfigFile('pesos.toml', '[nada]\n', 'to-en')).toThrow(
      'pesos.toml: line 1: unknown table [nada]',
    )
  })
})
