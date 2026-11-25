// The first `pessoa` actions and the Pessoa sync (ticket #87): the pytest
// twins are tests/test_pessoa.py (criar, ver, declarar, relatar and the
// sync; the `vetar` and `recomendar` parts wait for their tickets) and
// tests/test_pessoa_visto.py. Where Python rebuilt the database with
// `reconstruir`, these reload the Pessoas (`reloadPeople`), the loading
// step of a rebuild; what a Declarado does to a Recomendação comes with the
// Recomendação's port, so these check the rows it feeds.
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { config, data, migrateDataFile, output } from '@filmes/key-migration'
import { Effect } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import {
  DB_LEVELS,
  DB_LINKS,
  DB_REACTIONS,
  DB_TAG_GROUPS,
  dbTarget,
  parseYaml,
  personCreate,
  personReport,
  personSeen,
  personState,
  personView,
  reloadPeople,
  Sqlite,
  type EngineServices,
  type Run,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'

// Sofia Rangel (Q9000018) directed Porão Escuro, A Casa do Fim and Risos de
// Domingo.
const SOFIA_RANGEL = 'Q9000018'
const COMEDY = 'Q9001802'
const DAVI_COUTO = 'Q9001803'
const FAROL = 'tt9000101'
const BARULHO = 'tt9000501'
// Teo has no Nota in the fixture.
const PEQUENOS_MILAGRES = 'tt9000601'
const CASA_CHEIA = 'tt9000602'

const file = (fixture: Fixture, slug: string) =>
  join(fixture.data, 'people', `${slug}.md`)

const read = (fixture: Fixture, slug: string) =>
  readFileSync(file(fixture, slug), 'utf8')

const frontmatter = (fixture: Fixture, slug: string) => {
  const text = read(fixture, slug)
  const value = parseYaml(text.slice(4, text.indexOf('\n---', 4)))
  return value instanceof Map ? Object.fromEntries(value) : value
}

const query = (fixture: Fixture, sql: string) =>
  fixture.ok(
    Effect.gen(function* () {
      return yield* (yield* Sqlite).read((db) => db.all(sql))
    }),
  )

const errorOf = async <A, E>(
  fixture: Fixture,
  effect: Effect.Effect<A, E, EngineServices | Run>,
) => {
  const outcome = await fixture.run(effect)
  if (outcome.exitCode === 0) throw new Error('expected an error')
  return { exitCode: outcome.exitCode, ...outcome.output.error }
}

const ana = (fixture: Fixture) =>
  fixture.ok(personCreate({ name: 'Ana', slug: 'ana' }))

/** Every row the Pessoa files feed, as a rebuild loads them. */
const PERSON_ROWS = [
  'SELECT slug, nome, dono FROM pessoas ORDER BY slug',
  'SELECT * FROM apelidos ORDER BY pessoa, apelido',
  'SELECT * FROM vetos ORDER BY fato_id',
  'SELECT * FROM ajustes ORDER BY fato_id',
  'SELECT * FROM perguntas_abertas ORDER BY fato_id',
  'SELECT * FROM declarados ORDER BY fato_id',
  'SELECT * FROM relatos ORDER BY fato_id',
  'SELECT * FROM notas ORDER BY fato_id',
  'SELECT * FROM ja_visto ORDER BY fato_id',
]

const personRows = (fixture: Fixture) =>
  Promise.all(PERSON_ROWS.map((sql) => query(fixture, sql)))

describe('the database spellings', () => {
  test('are the Portuguese values the key migration renames', () => {
    const flip = (table: Record<string, string>) =>
      Object.fromEntries(Object.entries(table).map(([pt, en]) => [en, pt]))
    expect(DB_LINKS).toEqual(flip(data.LINKS))
    const { normal: _, ...levels } = flip(data.LEVELS)
    expect(DB_LEVELS).toEqual(levels)
    expect(DB_REACTIONS).toEqual(flip(output.STATEMENT_REACTIONS))
    expect(DB_TAG_GROUPS).toEqual(flip(config.TAG_GROUPS))
    expect(dbTarget('slow')).toBe('lento')
    expect(dbTarget('Q9001801')).toBe('Q9001801')
    expect(dbTarget('toString')).toBe('toString')
  })
})

describe('pessoa criar and ver', () => {
  test('creating a Pessoa writes her file with name and aliases', async () => {
    const fixture = useFixture()

    const created = await fixture.ok(
      personCreate({
        name: 'Ana Lima',
        aliases: ['Ana', 'Aninha'],
        slug: 'ana',
      }),
    )

    expect(created).toEqual({
      person: 'ana',
      name: 'Ana Lima',
      aliases: ['Ana', 'Aninha'],
      owner: false,
    })
    const front = frontmatter(fixture, 'ana')
    expect(front.name).toBe('Ana Lima')
    expect(front.aliases).toEqual(['Ana', 'Aninha'])
    expect(front.vetoes).toEqual([])
    expect(front).not.toHaveProperty('age')
    expect(
      await query(fixture, "SELECT * FROM apelidos WHERE pessoa = 'ana'"),
    ).toEqual([
      { pessoa: 'ana', apelido: 'Ana' },
      { pessoa: 'ana', apelido: 'Aninha' },
    ])
  })

  test('a Dono is created with her Google e-mail, in lower case', async () => {
    const fixture = useFixture()

    const created = await fixture.ok(
      personCreate({
        name: 'Luana',
        owner: true,
        email: ' Luana.Farias@Example.ORG ',
      }),
    )

    expect(created).toMatchObject({ person: 'luana', owner: true })
    expect(frontmatter(fixture, 'luana')).toMatchObject({
      owner: true,
      email: 'luana.farias@example.org',
    })
  })

  test('ver finds the Pessoa by an alias', async () => {
    const fixture = useFixture()
    await fixture.ok(
      personCreate({ name: 'Ana Lima', aliases: ['Aninha'], slug: 'ana' }),
    )

    const view = await fixture.ok(personView('aninha'))

    expect(view).toMatchObject({
      person: 'ana',
      name: 'Ana Lima',
      aliases: ['Aninha'],
      owner: false,
    })
  })

  test('the slug is the name without accents', async () => {
    const fixture = useFixture()

    const created = await fixture.ok(personCreate({ name: 'Léo Araújo' }))

    expect(created.person).toBe('leo-araujo')
    expect(read(fixture, 'leo-araujo')).toContain('name: Léo Araújo')
  })

  test('creating a Pessoa that exists is an error', async () => {
    const fixture = useFixture()

    const error = await errorOf(
      fixture,
      personCreate({ name: 'Outro Bruno', slug: 'bruno' }),
    )

    expect(error).toMatchObject({ exitCode: 1, code: 'person_exists' })
  })

  test('an unknown Pessoa is an error', async () => {
    const fixture = useFixture()

    const error = await errorOf(fixture, personView('fulano'))

    expect(error).toMatchObject({ exitCode: 1, code: 'unknown_person' })
  })

  test('"dono" is the Dono', async () => {
    const fixture = useFixture()

    const view = await fixture.ok(personView('dono'))

    expect(view).toMatchObject({ person: 'bruno', owner: true })
  })

  test('ver shows the Notas of the Pessoa', async () => {
    const fixture = useFixture()

    const view = await fixture.ok(personView('dono'))

    expect(view.ratings).toHaveLength(11)
    expect(view.ratings).toContainEqual(
      expect.objectContaining({
        filmId: FAROL,
        title: 'O Farol de Areia',
        rating: 5,
        date: '2025-06-01',
        source: 'Letterboxd do Bruno',
        kind: 'rating',
      }),
    )
  })

  test('ver shows everything known of the Pessoa', async () => {
    const fixture = useFixture()
    await ana(fixture)
    await fixture.ok(
      personState({
        person: 'ana',
        text: 'amo O Farol',
        target: FAROL,
        reaction: 'love',
        source: 'questionário',
        date: '2026-10-01',
      }),
    )
    await fixture.ok(personReport({ person: 'ana', text: 'odeia filme lento' }))

    const view = await fixture.ok(personView('ana'))

    const [stated] = view.stated
    expect(view.stated).toHaveLength(1)
    expect(stated).toMatchObject({
      text: 'amo O Farol',
      source: 'questionário',
      date: '2026-10-01',
      reaction: 'love',
      target: FAROL,
      label: 'O Farol de Areia',
      rating: 5,
      kind: 'stated',
      strength: 'strong',
    })
    expect(
      view.reports.map((r) => [r.text, r.specific, r.strength, r.target]),
    ).toEqual([['odeia filme lento', false, 'weak', null]])
    expect(view.ratings?.map((r) => [r.filmId, r.rating, r.kind])).toEqual([
      [FAROL, 5, 'stated'],
    ])
    expect(view).toMatchObject({
      vetoes: [],
      adjustments: [],
      seen: [],
      openQuestions: [],
      imports: [],
    })
  })

  test('ver shows the Vetos, Ajustes, open questions and imports of the file, with their fato_ids', async () => {
    const fixture = useFixture()
    writeFileSync(
      file(fixture, 'carol'),
      migrateDataFile(
        'person',
        `---
nome: Carol
apelidos: []
vetos:
- texto: nada de comédia boba
  alvo: comedia_boba
  rotulo: comédia boba
  data: 2026-01-05
ajustes:
- elo: elenco
  nivel: pouco
  data: 2026-01-06
perguntas_abertas:
- texto: a Carol curte terror?
  assunto: lento
  rotulo: filme lento
  data: 2026-01-07
  puladas: 1
imports:
- tipo: letterboxd
  arquivo: imports/carol.zip
  data: '2026-01-08'
  original: carol.zip
  sha256: abc
---
`,
        'to-en',
      ),
    )

    const view = await fixture.ok(personView('carol'))

    // Python's ids: the same file, read by `pessoa ver`.
    expect(view.vetoes).toEqual([
      {
        text: 'nada de comédia boba',
        target: 'silly_comedy',
        label: 'comédia boba',
        date: '2026-01-05',
        factId: 'vetos:ccaca318c0d0',
      },
    ])
    expect(view.adjustments).toEqual([
      {
        link: 'cast',
        level: 'low',
        date: '2026-01-06',
        factId: 'ajustes:b84f5a60f900',
      },
    ])
    expect(view.openQuestions).toEqual([
      {
        text: 'a Carol curte terror?',
        subject: 'slow',
        label: 'filme lento',
        date: '2026-01-07',
        skips: 1,
        factId: 'perguntas_abertas:36a96bc7fb7f',
      },
    ])
    expect(view.imports).toEqual([
      {
        kind: 'letterboxd',
        file: 'imports/carol.zip',
        date: '2026-01-08',
        original: 'carol.zip',
        sha256: 'abc',
      },
    ])
  })

  test('without a database, ver shows the file and says the Notas are missing', async () => {
    const fixture = useFixture()
    rmSync(fixture.database)

    const view = await fixture.ok(personView('teo'))

    expect(view.ratings).toBeNull()
    expect(view.warning).toBe(
      'banco não encontrado: as Notas aparecem depois de `reconstruir`',
    )
  })
})

describe('pessoa declarar and relatar', () => {
  test('a Declarado about a director is specific and strong, in her file and in the database', async () => {
    const fixture = useFixture()
    await ana(fixture)

    const result = await fixture.ok(
      personState({
        person: 'ana',
        text: 'adoro os filmes da Sofia Rangel',
        target: SOFIA_RANGEL,
        reaction: 'like',
        source: 'questionário',
      }),
    )

    expect(read(fixture, 'ana')).toContain(
      '- 2026-11-20 · questionário · específico · gosta de Sofia Rangel (Q9000018) · ' +
        '"adoro os filmes da Sofia Rangel"',
    )
    expect(result).toMatchObject({
      person: 'ana',
      new: true,
      stated: {
        label: 'Sofia Rangel',
        specific: true,
        kind: 'stated',
        strength: 'strong',
        rating: null,
      },
    })
    expect(
      await query(
        fixture,
        "SELECT fato_id, reacao, alvo, especifico FROM declarados WHERE pessoa = 'ana'",
      ),
    ).toEqual([
      {
        fato_id: result.stated.factId,
        reacao: 'gosta',
        alvo: SOFIA_RANGEL,
        especifico: 1,
      },
    ])
  })

  test('a Declarado about a genre is generic and moderate', async () => {
    const fixture = useFixture()
    await ana(fixture)

    const result = await fixture.ok(
      personState({
        person: 'ana',
        text: 'gosto de comédia',
        target: COMEDY,
        reaction: 'like',
      }),
    )

    expect(result.stated).toMatchObject({
      specific: false,
      strength: 'moderate',
      label: 'Comédia',
      source: 'conversa com o Dono',
    })
  })

  test('a Declarado about an actor is specific', async () => {
    const fixture = useFixture()
    await ana(fixture)

    const result = await fixture.ok(
      personState({
        person: 'ana',
        text: 'vejo qualquer coisa com o Davi Couto',
        target: DAVI_COUTO,
        reaction: 'love',
      }),
    )

    expect(result.stated).toMatchObject({ specific: true, strength: 'strong' })
  })

  test('a Relato is one level below and goes into relatos', async () => {
    const fixture = useFixture()
    await ana(fixture)

    const result = await fixture.ok(
      personReport({
        person: 'ana',
        text: 'não suporta os filmes da Sofia Rangel',
        target: SOFIA_RANGEL,
        reaction: 'hate',
      }),
    )

    expect(result.report).toMatchObject({
      source: 'descrição do Dono',
      kind: 'report',
      strength: 'moderate',
    })
    expect(
      await query(
        fixture,
        "SELECT reacao, alvo FROM relatos WHERE pessoa = 'ana'",
      ),
    ).toEqual([{ reacao: 'odeia', alvo: SOFIA_RANGEL }])
  })

  test('a generic Relato is weak', async () => {
    const fixture = useFixture()
    await ana(fixture)

    const result = await fixture.ok(
      personReport({
        person: 'ana',
        text: 'gosta de comédia',
        target: COMEDY,
        reaction: 'like',
      }),
    )

    expect(result.report.strength).toBe('weak')
  })

  test('a Declarado or a Relato older than two years falls a level', async () => {
    const fixture = useFixture()
    await ana(fixture)

    const strengths = [
      (
        await fixture.ok(
          personState({
            person: 'ana',
            text: 'adoro a Sofia Rangel',
            target: SOFIA_RANGEL,
            reaction: 'like',
            date: '2024-11-19',
          }),
        )
      ).stated.strength,
      (
        await fixture.ok(
          personReport({
            person: 'ana',
            text: 'ama o Davi Couto',
            target: DAVI_COUTO,
            reaction: 'love',
            date: '2024-11-19',
          }),
        )
      ).report.strength,
      (
        await fixture.ok(
          personState({
            person: 'ana',
            text: 'gosto de comédia',
            target: COMEDY,
            reaction: 'like',
            date: '2024-11-21',
          }),
        )
      ).stated.strength,
    ]

    // Specific, 2 years and a day; specific, one below, one more; generic,
    // not 2 years yet.
    expect(strengths).toEqual(['moderate', 'weak', 'moderate'])
  })

  test('her own review counts as a specific Declarado', async () => {
    const fixture = useFixture()
    await ana(fixture)

    const result = await fixture.ok(
      personState({
        person: 'ana',
        text: 'comédia boa é comédia de constrangimento',
        target: COMEDY,
        reaction: 'like',
        review: true,
        source: 'review no Letterboxd',
      }),
    )

    expect(result.stated).toMatchObject({ specific: true, strength: 'strong' })
  })

  test('"ama" a film is a declared Nota 5', async () => {
    const fixture = useFixture()
    await ana(fixture)

    const result = await fixture.ok(
      personState({
        person: 'ana',
        text: 'O Farol de Areia é o meu filme favorito',
        target: FAROL,
        reaction: 'love',
        source: 'questionário',
      }),
    )

    expect(result.stated).toMatchObject({ specific: true, rating: 5 })
    expect(
      await query(
        fixture,
        "SELECT fato_id, nota, tipo, fonte FROM notas WHERE pessoa = 'ana'",
      ),
    ).toEqual([
      {
        fato_id: result.stated.factId,
        nota: 5,
        tipo: 'declarado',
        fonte: 'questionário',
      },
    ])
  })

  test('"odeia" a film is a declared Nota 1', async () => {
    const fixture = useFixture()
    await ana(fixture)

    await fixture.ok(
      personState({
        person: 'ana',
        text: 'Barulho é insuportável',
        target: BARULHO,
        reaction: 'hate',
      }),
    )

    expect(
      await query(fixture, "SELECT nota, tipo FROM notas WHERE pessoa = 'ana'"),
    ).toEqual([{ nota: 1, tipo: 'declarado' }])
  })

  test('a Relato that she loves a film is a Nota of kind relato', async () => {
    const fixture = useFixture()
    await ana(fixture)

    const result = await fixture.ok(
      personReport({
        person: 'ana',
        text: 'ama O Farol de Areia',
        target: FAROL,
        reaction: 'love',
      }),
    )

    expect(result.report).toMatchObject({ rating: 5, strength: 'moderate' })
    expect(
      await query(fixture, "SELECT nota, tipo FROM notas WHERE pessoa = 'ana'"),
    ).toEqual([{ nota: 5, tipo: 'relato' }])
  })

  test('liking a film is not a Nota', async () => {
    const fixture = useFixture()
    await ana(fixture)

    const result = await fixture.ok(
      personState({
        person: 'ana',
        text: 'gostei do Farol',
        target: FAROL,
        reaction: 'like',
      }),
    )

    expect(result.stated.rating).toBeNull()
    expect(
      await query(
        fixture,
        "SELECT count(*) AS n FROM notas WHERE pessoa = 'ana'",
      ),
    ).toEqual([{ n: 0 }])
  })

  test('the same Declarado again is not new and the file keeps one', async () => {
    const fixture = useFixture()
    await ana(fixture)
    const input = { person: 'ana', text: 'gosto de comédia', target: COMEDY }
    await fixture.ok(personState(input))

    const again = await fixture.ok(personState(input))

    expect(again.new).toBe(false)
    expect(read(fixture, 'ana').split('gosto de comédia')).toHaveLength(2)
  })

  test('writing to the file keeps the free text', async () => {
    const fixture = useFixture()
    writeFileSync(file(fixture, 'carol'), CAROL)

    await fixture.ok(
      personReport({ person: 'carol', text: 'odeia filme lento' }),
    )

    const text = read(fixture, 'carol')
    expect(text).toContain('Amiga da faculdade.')
    expect(text.indexOf('canastrão')).toBeLessThan(
      text.indexOf('"odeia filme lento"'),
    )
    expect(text.split('## Relatos')).toHaveLength(2)
  })

  test('a target outside the Catalog is an error and nothing is written', async () => {
    const fixture = useFixture()
    await ana(fixture)
    const before = read(fixture, 'ana')

    const error = await errorOf(
      fixture,
      personState({ person: 'ana', text: 'nunca vê isso', target: 'Q1' }),
    )

    expect(error).toMatchObject({
      exitCode: 1,
      code: 'unknown_target',
      message: "'Q1' não está no Catálogo",
    })
    expect(read(fixture, 'ana')).toBe(before)
  })

  test('a Relato about the Dono is invalid usage', async () => {
    const fixture = useFixture()

    const error = await errorOf(
      fixture,
      personReport({ person: 'dono', text: 'gosta de comédia' }),
    )

    expect(error).toMatchObject({ exitCode: 2, code: 'invalid_usage' })
  })

  test.each([
    [
      'a reaction without a target',
      { reaction: 'hate' as const },
      '--reacao precisa de --filme ou --entidade',
    ],
    [
      'a generic review',
      { review: true, specific: false },
      'review ou tag da própria Pessoa é sempre específico',
    ],
    [
      'a source with the separator',
      { source: 'a · b' },
      "a fonte não pode ser vazia nem ter ' · '",
    ],
    [
      'an empty source',
      { source: '  ' },
      "a fonte não pode ser vazia nem ter ' · '",
    ],
    [
      'a date that is not one',
      { date: 'ontem' },
      "data inválida: 'ontem' (use AAAA-MM-DD)",
    ],
    ['an empty text', { text: ' \t ' }, 'o texto não pode ser vazio'],
  ])('%s is invalid usage', async (_, input, message) => {
    const fixture = useFixture()
    await ana(fixture)
    const before = read(fixture, 'ana')

    const error = await errorOf(
      fixture,
      personState({ person: 'ana', text: 'odeio filme lento', ...input }),
    )

    expect(error).toEqual({ exitCode: 2, code: 'invalid_usage', message })
    expect(read(fixture, 'ana')).toBe(before)
  })

  test('the date is any ISO form Python takes, written as YYYY-MM-DD; the text and source lose their extra spaces', async () => {
    const fixture = useFixture()
    await ana(fixture)

    const result = await fixture.ok(
      personState({
        person: 'ana',
        text: '  gosto   de\tcomédia ',
        source: ' conversa  com o Dono ',
        date: '20261119',
      }),
    )

    expect(result.stated).toMatchObject({
      text: 'gosto de comédia',
      source: 'conversa com o Dono',
      date: '2026-11-19',
    })
  })

  test('without a database, a Declarado with no target is written to the file alone; one with a target needs the database', async () => {
    const fixture = useFixture()
    rmSync(fixture.database)

    const plain = await fixture.ok(
      personReport({ person: 'teo', text: 'odeia filme lento' }),
    )
    const error = await errorOf(
      fixture,
      personState({ person: 'teo', text: 'adoro', target: FAROL }),
    )

    expect(plain.new).toBe(true)
    expect(read(fixture, 'teo')).toContain('"odeia filme lento"')
    expect(error).toEqual({
      exitCode: 1,
      code: 'missing_database',
      message: `banco não encontrado em ${fixture.database}: rode \`pnpm db:publish --build\``,
    })
  })
})

/** Carol, as tests/test_pessoa.py writes her, migrated to English keys. */
const CAROL = migrateDataFile(
  'person',
  `---
nome: Carol
apelidos: [Carolzinha]
vetos:
- texto: nada da Sofia Rangel
  alvo: Q9000018
  rotulo: Sofia Rangel
  data: 2026-01-05
imports: []
---
Amiga da faculdade.

## Declarados

- 2025-03-01 · questionário · genérico · gosta de Comédia (Q9001802) · "comédia sempre"
- 2026-02-02 · questionário · específico · ama Barulho (tt9000501) · "Barulho é o melhor"

## Relatos

- 2026-04-04 · descrição do Dono · específico · não gosta de Davi Couto (Q9001803) · "acha o Davi Couto canastrão"
`,
  'to-en',
)

describe('the Pessoa sync and the reload', () => {
  test('reloading the fixture Pessoas gives the rows Python loaded', async () => {
    const fixture = useFixture()
    const built = await personRows(fixture)

    const slugs = await fixture.ok(reloadPeople)

    expect(slugs).toEqual(['bruno', 'iara', 'quim', 'rosa', 'teo', 'vera'])
    expect(await personRows(fixture)).toEqual(built)
  })

  test('the synced database equals the reloaded one', async () => {
    const fixture = useFixture()
    await ana(fixture)
    await fixture.ok(
      personState({
        person: 'ana',
        text: 'amo O Farol',
        target: FAROL,
        reaction: 'love',
      }),
    )
    await fixture.ok(
      personReport({
        person: 'ana',
        text: 'odeia comédia',
        target: COMEDY,
        reaction: 'hate',
      }),
    )
    writeFileSync(file(fixture, 'carol'), CAROL)
    await fixture.ok(
      personReport({ person: 'carol', text: 'odeia filme lento' }),
    )
    await fixture.ok(
      personSeen({ person: 'teo', film: CASA_CHEIA, rating: '4,5' }),
    )
    const synced = await personRows(fixture)

    await fixture.ok(reloadPeople)

    expect(await personRows(fixture)).toEqual(synced)
  })

  test('the reload reads Declarados, Relatos and Vetos from the file', async () => {
    const fixture = useFixture()
    writeFileSync(file(fixture, 'carol'), CAROL)

    await fixture.ok(reloadPeople)

    expect(
      await query(
        fixture,
        "SELECT reacao, alvo, especifico, texto FROM declarados WHERE pessoa = 'carol' ORDER BY data",
      ),
    ).toEqual([
      { reacao: 'gosta', alvo: COMEDY, especifico: 0, texto: 'comédia sempre' },
      {
        reacao: 'ama',
        alvo: BARULHO,
        especifico: 1,
        texto: 'Barulho é o melhor',
      },
    ])
    expect(
      await query(
        fixture,
        "SELECT reacao, alvo, texto FROM relatos WHERE pessoa = 'carol'",
      ),
    ).toEqual([
      {
        reacao: 'nao_gosta',
        alvo: DAVI_COUTO,
        texto: 'acha o Davi Couto canastrão',
      },
    ])
    expect(
      await query(
        fixture,
        "SELECT nota, tipo FROM notas WHERE pessoa = 'carol'",
      ),
    ).toEqual([{ nota: 5, tipo: 'declarado' }])
    expect(
      await query(
        fixture,
        "SELECT alvo, data FROM vetos WHERE pessoa = 'carol'",
      ),
    ).toEqual([{ alvo: SOFIA_RANGEL, data: '2026-01-05' }])
  })

  test('a Veto on a tag group, an Ajuste and an open question are kept with their Portuguese values', async () => {
    const fixture = useFixture()
    writeFileSync(
      file(fixture, 'carol'),
      `---
name: Carol
aliases: [Carol, Carolzinha, Carol]
vetoes:
- {text: nada bobo, target: silly_comedy, label: comédia boba, date: 2026-01-05}
adjustments:
- {link: series, level: high, date: 2026-01-06}
open_questions:
- {text: Curte filme lento?, subject: slow, label: filme lento, date: 2026-01-07, skips: 1}
- {text: E terror?, date: 2026-01-07, skips: 1}
imports: []
---
`,
    )

    await fixture.ok(reloadPeople)

    expect(
      await query(
        fixture,
        "SELECT 'v' AS t, alvo AS a, rotulo AS b FROM vetos WHERE pessoa = 'carol' " +
          "UNION ALL SELECT 'j', elo, nivel FROM ajustes WHERE pessoa = 'carol' " +
          "UNION ALL SELECT 'p', fato_id, assunto FROM perguntas_abertas WHERE pessoa = 'carol' " +
          "UNION ALL SELECT 'a', apelido, NULL FROM apelidos WHERE pessoa = 'carol' ORDER BY 1, 2",
      ),
    ).toEqual([
      { t: 'a', a: 'Carol', b: null },
      { t: 'a', a: 'Carolzinha', b: null },
      { t: 'j', a: 'serie', b: 'muito' },
      { t: 'p', a: 'perguntas_abertas:36a96bc7fb7f', b: 'lento' },
      // Without a subject, the id is the casefolded text's.
      { t: 'p', a: 'perguntas_abertas:c53ae61e78d0', b: null },
      { t: 'v', a: 'comedia_boba', b: 'comédia boba' },
    ])
  })

  test('a body line out of format is invalid data naming the file and the line', async () => {
    const fixture = useFixture()
    writeFileSync(
      file(fixture, 'carol'),
      CAROL.replace('2025-03-01 · questionário', 'ontem, no questionário'),
    )

    const error = await errorOf(fixture, reloadPeople)

    expect(error.code).toBe('invalid_data')
    expect(error.message).toContain('carol.md')
    expect(error.message).toContain('ontem, no questionário')
  })

  test('a sync creates the open questions table a database built before it lacks', async () => {
    const fixture = useFixture()
    await fixture.ok(
      Effect.gen(function* () {
        yield* (yield* Sqlite).write((db) =>
          db.exec('DROP TABLE perguntas_abertas'),
        )
      }),
    )

    await fixture.ok(
      personReport({ person: 'quim', text: 'odeia filme lento' }),
    )

    expect(
      await query(fixture, 'SELECT pessoa, assunto FROM perguntas_abertas'),
    ).toEqual([{ pessoa: 'quim', assunto: 'Q9000001' }])
  })

  test('a sync the database refuses keeps the file and asks for a rebuild', async () => {
    const fixture = useFixture()
    await fixture.ok(
      Effect.gen(function* () {
        yield* (yield* Sqlite).write((db) => db.exec('DROP TABLE relatos'))
      }),
    )

    const error = await errorOf(
      fixture,
      personReport({ person: 'teo', text: 'odeia filme lento' }),
    )

    expect(error).toEqual({
      exitCode: 1,
      code: 'outdated_database',
      message:
        'o arquivo da Pessoa foi salvo, mas o banco não aceitou a mudança (no such table: relatos): rode `reconstruir`',
    })
    expect(read(fixture, 'teo')).toContain('"odeia filme lento"')
  })
})

describe('pessoa visto', () => {
  test('a Já visto without a Nota is a row of ja_visto, at once', async () => {
    const fixture = useFixture()

    const result = await fixture.ok(
      personSeen({ person: 'teo', film: PEQUENOS_MILAGRES }),
    )

    expect(result).toMatchObject({
      person: 'teo',
      new: true,
      seen: {
        film: PEQUENOS_MILAGRES,
        title: 'Pequenos Milagres',
        rating: null,
        date: '2026-11-20',
        source: 'conversa com o Dono',
      },
    })
    expect(
      await query(
        fixture,
        "SELECT fato_id, filme_id, tipo FROM ja_visto WHERE pessoa = 'teo'",
      ),
    ).toEqual([
      {
        fato_id: result.seen.factId,
        filme_id: PEQUENOS_MILAGRES,
        tipo: 'declarado',
      },
    ])
  })

  test('a Nota from 1 to 10 becomes a Nota on the scale of 5', async () => {
    const fixture = useFixture()

    const result = await fixture.ok(
      personSeen({
        person: 'teo',
        film: CASA_CHEIA,
        rating: '8/10',
        source: 'Sessão de sábado',
      }),
    )

    expect(result.seen.rating).toBe(4)
    const { ratings } = await fixture.ok(personView('teo'))
    expect(ratings?.map((r) => [r.filmId, r.rating, r.source, r.date])).toEqual(
      [[CASA_CHEIA, 4, 'Sessão de sábado', '2026-11-20']],
    )
  })

  test('it holds after a reload as synced, and the body has the lines', async () => {
    const fixture = useFixture()
    await fixture.ok(
      personSeen({
        person: 'teo',
        film: PEQUENOS_MILAGRES,
        date: '2026-11-19',
      }),
    )
    await fixture.ok(
      personSeen({ person: 'teo', film: CASA_CHEIA, rating: '4,5' }),
    )
    const sql =
      "SELECT 'j' AS t, fato_id, filme_id, tipo AS x, data, fonte FROM ja_visto WHERE pessoa = 'teo' UNION ALL " +
      "SELECT 'n', fato_id, filme_id, nota, data, fonte FROM notas WHERE pessoa = 'teo' ORDER BY 1, 2"
    const synced = await query(fixture, sql)

    await fixture.ok(reloadPeople)

    expect(await query(fixture, sql)).toEqual(synced)
    expect(
      synced.map(({ filme_id, x, data, fonte }) => [filme_id, x, data, fonte]),
    ).toEqual([
      [PEQUENOS_MILAGRES, 'declarado', '2026-11-19', 'conversa com o Dono'],
      [CASA_CHEIA, 4.5, '2026-11-20', 'conversa com o Dono'],
    ])
    expect(read(fixture, 'teo')).toContain(
      '## Já vistos\n\n- 2026-11-19 · conversa com o Dono · Pequenos Milagres (tt9000601)\n' +
        '- 2026-11-20 · conversa com o Dono · Casa Cheia (tt9000602) · nota 4,5\n',
    )
  })

  test('the same again is not new and is not repeated', async () => {
    const fixture = useFixture()
    await fixture.ok(personSeen({ person: 'teo', film: PEQUENOS_MILAGRES }))

    const again = await fixture.ok(
      personSeen({ person: 'teo', film: PEQUENOS_MILAGRES }),
    )

    expect(again.new).toBe(false)
    expect(read(fixture, 'teo').split(PEQUENOS_MILAGRES)).toHaveLength(2)
  })

  test('a Nota off the scale is invalid usage and suggests 1 to 10', async () => {
    const fixture = useFixture()

    const error = await errorOf(
      fixture,
      personSeen({ person: 'teo', film: CASA_CHEIA, rating: '8' }),
    )

    expect(error).toMatchObject({ exitCode: 2, code: 'invalid_usage' })
    expect(error.message).toContain('"8/10"')
    expect(read(fixture, 'teo')).not.toContain('Já vistos')
  })

  test('a film outside the Catalog is an error', async () => {
    const fixture = useFixture()

    const error = await errorOf(
      fixture,
      personSeen({ person: 'teo', film: 'tt0000001' }),
    )

    expect(error.code).toBe('unknown_target')
  })

  test('an id that is not a film is invalid usage', async () => {
    const fixture = useFixture()

    const error = await errorOf(
      fixture,
      personSeen({ person: 'teo', film: SOFIA_RANGEL }),
    )

    expect(error).toEqual({
      exitCode: 2,
      code: 'invalid_usage',
      message: "--filme precisa ser um ID de filme (tt...), não 'Q9000018'",
    })
  })

  test('ver shows her Já vistos', async () => {
    const fixture = useFixture()
    await fixture.ok(personSeen({ person: 'teo', film: PEQUENOS_MILAGRES }))
    await fixture.ok(
      personSeen({ person: 'teo', film: CASA_CHEIA, rating: '7/10' }),
    )

    const view = await fixture.ok(personView('teo'))

    expect(view.seen.map((s) => [s.film, s.title, s.rating])).toEqual([
      [PEQUENOS_MILAGRES, 'Pequenos Milagres', null],
      [CASA_CHEIA, 'Casa Cheia', 3.5],
    ])
  })
})
