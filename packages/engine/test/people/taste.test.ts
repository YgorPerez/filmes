// The rest of the `pessoa` actions (ticket #88): `vetar`, `ajustar`,
// `pular`, `perguntas` and `remover`. The pytest twins are the `vetar` parts
// of tests/test_pessoa.py, tests/test_perguntas_abertas.py,
// tests/test_pessoa_remover.py (but the Feedback comment, which waits for
// #96) and the file parts of tests/test_ajuste_e_corte.py and
// tests/test_veto_por_tag_e_nota_imdb.py. What a Veto or an Ajuste does to a
// Recomendação comes with the Recomendação's port; these check the rows it
// reads, synced at once and equal to a reload's.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import {
  parseYaml,
  personAdjust,
  personCreate,
  personQuestions,
  personRemove,
  personReport,
  personSeen,
  personSkip,
  personState,
  personVeto,
  personView,
  reloadPeople,
  Sqlite,
  yamlToJson,
  type EngineServices,
  type Run,
  type YamlValue,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'

// Terror (Q9001801) is the genre of Porão Escuro, A Casa do Fim and
// Explosão Final.
const TERROR = 'Q9001801'
const COMEDY = 'Q9001802'
const HELENA = 'Q9000001'
const FAROL = 'tt9000101'
const PEQUENOS_MILAGRES = 'tt9000601'
const CASA_CHEIA = 'tt9000602'

const file = (fixture: Fixture, slug: string) =>
  join(fixture.data, 'people', `${slug}.md`)

const read = (fixture: Fixture, slug: string) =>
  readFileSync(file(fixture, slug), 'utf8')

const split = (text: string) => {
  const end = text.indexOf('\n---', 4)
  const value = parseYaml(text.slice(4, end))
  return {
    frontmatter: value instanceof Map ? Object.fromEntries(value) : {},
    body: text.slice(text.indexOf('\n', end + 1) + 1),
  }
}

const frontmatter = (fixture: Fixture, slug: string) =>
  split(read(fixture, slug)).frontmatter

const plain = (value: unknown): unknown =>
  value === undefined ? undefined : yamlToJson(value as YamlValue)

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

const PERSON_ROWS = [
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

describe('pessoa vetar', () => {
  test('writes the Veto to the frontmatter and to the database at once', async () => {
    const fixture = useFixture()
    await ana(fixture)

    const result = await fixture.ok(
      personVeto({ person: 'ana', text: 'nunca vê terror', target: TERROR }),
    )

    expect(result.veto.label).toBe('Terror')
    expect(result.new).toBe(true)
    expect(plain(frontmatter(fixture, 'ana').vetoes)).toEqual([
      {
        text: 'nunca vê terror',
        target: TERROR,
        label: 'Terror',
        date: '2026-11-20',
      },
    ])
    expect(
      await query(
        fixture,
        "SELECT alvo, rotulo, fato_id FROM vetos WHERE pessoa = 'ana'",
      ),
    ).toEqual([{ alvo: TERROR, rotulo: 'Terror', fato_id: result.veto.factId }])
  })

  test('the same target again is not new and keeps the first Veto', async () => {
    const fixture = useFixture()
    await ana(fixture)
    const first = await fixture.ok(
      personVeto({ person: 'ana', text: 'nunca vê terror', target: TERROR }),
    )

    const again = await fixture.ok(
      personVeto({ person: 'ana', text: 'terror nem pensar', target: TERROR }),
    )

    expect(again).toEqual({ ...first, new: false })
    expect((await fixture.ok(personView('ana'))).vetoes).toHaveLength(1)
  })

  test('a tag group is kept by its key, with its Portuguese value in the database', async () => {
    const fixture = useFixture()

    const result = await fixture.ok(
      personVeto({
        person: 'bruno',
        text: 'não quer comédia boba',
        target: 'silly_comedy',
        group: true,
      }),
    )

    expect([result.veto.target, result.veto.label]).toEqual([
      'silly_comedy',
      'comédia boba',
    ])
    expect(plain(frontmatter(fixture, 'bruno').vetoes)).toEqual([
      expect.objectContaining({ target: 'silly_comedy' }),
    ])
    expect(
      await query(
        fixture,
        "SELECT alvo, rotulo FROM vetos WHERE pessoa = 'bruno'",
      ),
    ).toEqual([{ alvo: 'comedia_boba', rotulo: 'comédia boba' }])

    await fixture.ok(
      personRemove({ person: 'bruno', kind: 'veto', id: 'silly_comedy' }),
    )
    expect(
      await query(
        fixture,
        "SELECT count(*) AS n FROM vetos WHERE pessoa = 'bruno'",
      ),
    ).toEqual([{ n: 0 }])
  })

  test('a group outside tag_vetoes.toml is an unknown target', async () => {
    const fixture = useFixture()

    expect(
      await errorOf(
        fixture,
        personVeto({
          person: 'bruno',
          text: 'nunca vê besteirol',
          target: 'besteirol',
          group: true,
        }),
      ),
    ).toEqual({
      exitCode: 1,
      code: 'unknown_target',
      message:
        "'besteirol' não é um grupo de config/tag_vetoes.toml (há: silly_comedy, slow)",
    })
  })

  test('a target outside the Catalog, an empty text or a bad date write nothing', async () => {
    const fixture = useFixture()
    const before = read(fixture, 'teo')

    // One after another: each run is its own engine, and a write holds
    // SQLite's lock while git runs.
    const errors = [
      await errorOf(
        fixture,
        personVeto({ person: 'teo', text: 'não', target: 'Q1' }),
      ),
      await errorOf(
        fixture,
        personVeto({ person: 'teo', text: '  ', target: TERROR }),
      ),
      await errorOf(
        fixture,
        personVeto({
          person: 'teo',
          text: 'não',
          target: TERROR,
          date: 'ontem',
        }),
      ),
    ]

    expect(errors).toEqual([
      {
        exitCode: 1,
        code: 'unknown_target',
        message: "'Q1' não está no Catálogo",
      },
      {
        exitCode: 2,
        code: 'invalid_usage',
        message: 'o texto não pode ser vazio',
      },
      {
        exitCode: 2,
        code: 'invalid_usage',
        message: "data inválida: 'ontem' (use AAAA-MM-DD)",
      },
    ])
    expect(read(fixture, 'teo')).toBe(before)
  })

  test('a Catalog target needs the database; a group does not', async () => {
    const fixture = useFixture()
    const vars = { FILMES_BANCO: join(fixture.root, 'missing.sqlite') }

    const outcome = await fixture.run(
      personVeto({ person: 'teo', text: 'não', target: TERROR }),
      vars,
    )
    const group = await fixture.ok(
      personVeto({
        person: 'teo',
        text: 'nada lento',
        target: 'slow',
        group: true,
      }),
      vars,
    )

    expect(outcome).toMatchObject({
      exitCode: 1,
      output: { error: { code: 'missing_database' } },
    })
    expect(group.veto.label).toBe('lento')
    expect(plain(frontmatter(fixture, 'teo').vetoes)).toEqual([
      expect.objectContaining({ target: 'slow' }),
    ])
  })
})

describe('pessoa ajustar', () => {
  test('keeps the Ajuste in the file and the database; normal undoes it', async () => {
    const fixture = useFixture()

    const set = await fixture.ok(
      personAdjust({ person: 'bruno', link: 'cast', level: 'none' }),
    )

    expect([set.adjustment.link, set.adjustment.level, set.new]).toEqual([
      'cast',
      'none',
      true,
    ])
    expect(plain(frontmatter(fixture, 'bruno').adjustments)).toEqual([
      { link: 'cast', level: 'none', date: '2026-11-20' },
    ])
    expect(
      await query(fixture, 'SELECT pessoa, elo, nivel FROM ajustes'),
    ).toEqual([{ pessoa: 'bruno', elo: 'elenco', nivel: 'nada' }])

    const normal = await fixture.ok(
      personAdjust({ person: 'bruno', link: 'cast', level: 'normal' }),
    )

    expect(normal).toEqual({
      person: 'bruno',
      adjustment: { link: 'cast', level: 'normal' },
      new: true,
    })
    expect(frontmatter(fixture, 'bruno')).not.toHaveProperty('adjustments')
    expect((await fixture.ok(personView('bruno'))).adjustments).toEqual([])
    expect(await query(fixture, 'SELECT * FROM ajustes')).toEqual([])
  })

  test('normal without an Ajuste changes nothing', async () => {
    const fixture = useFixture()
    const before = read(fixture, 'bruno')

    const result = await fixture.ok(
      personAdjust({
        person: 'bruno',
        link: 'cast',
        level: 'normal',
        date: 'x',
      }),
    )

    expect(result.new).toBe(false)
    expect(read(fixture, 'bruno')).toBe(before)
  })

  test('a new level of the same link replaces the old one; the same level is not new', async () => {
    const fixture = useFixture()
    await fixture.ok(
      personAdjust({ person: 'bruno', link: 'cast', level: 'none' }),
    )

    await fixture.ok(
      personAdjust({ person: 'bruno', link: 'cast', level: 'high' }),
    )
    const again = await fixture.ok(
      personAdjust({
        person: 'bruno',
        link: 'cast',
        level: 'high',
        date: '2026-12-01',
      }),
    )

    expect(again.new).toBe(false)
    expect(again.adjustment).toMatchObject({
      level: 'high',
      date: '2026-11-20',
    })
    expect(
      (await fixture.ok(personView('bruno'))).adjustments.map((a) => a.level),
    ).toEqual(['high'])
    expect(await query(fixture, 'SELECT elo, nivel FROM ajustes')).toEqual([
      { elo: 'elenco', nivel: 'muito' },
    ])
  })
})

describe('pessoa pular and perguntas', () => {
  test('a skipped question goes to the frontmatter without touching the rest', async () => {
    const fixture = useFixture()
    const before = split(read(fixture, 'bruno'))

    const result = await fixture.ok(
      personSkip({
        person: 'bruno',
        text: 'o Bruno curte a Helena Prado?',
        subject: HELENA,
      }),
    )

    expect([result.openQuestion.skips, result.dropped]).toEqual([1, false])
    const after = split(read(fixture, 'bruno'))
    expect(plain(after.frontmatter.open_questions)).toEqual([
      {
        text: 'o Bruno curte a Helena Prado?',
        subject: HELENA,
        label: 'Helena Prado',
        date: '2026-11-20',
        skips: 1,
      },
    ])
    const { open_questions: _, ...rest } = after.frontmatter
    expect(plain(rest)).toEqual(plain(before.frontmatter))
    expect(after.body).toBe(before.body)
  })

  test('skipped for the second time it leaves the list, keeping the first text', async () => {
    const fixture = useFixture()
    await fixture.ok(
      personSkip({
        person: 'bruno',
        text: 'o Bruno curte a Helena Prado?',
        subject: HELENA,
      }),
    )

    const result = await fixture.ok(
      personSkip({
        person: 'bruno',
        text: 'e a Helena Prado, Bruno?',
        subject: HELENA,
        date: '2026-11-27',
      }),
    )

    expect(result).toMatchObject({
      dropped: true,
      openQuestion: {
        skips: 2,
        date: '2026-11-27',
        text: 'o Bruno curte a Helena Prado?',
      },
    })
    expect(frontmatter(fixture, 'bruno')).not.toHaveProperty('open_questions')
  })

  test('without a subject the question is the same by its text', async () => {
    const fixture = useFixture()
    await fixture.ok(personSkip({ person: 'bruno', text: 'Curte filme mudo?' }))
    await fixture.ok(
      personSkip({ person: 'bruno', text: 'o Bruno gosta de filme longo?' }),
    )

    const result = await fixture.ok(
      personSkip({ person: 'bruno', text: 'curte  filme mudo?' }),
    )

    expect(result.dropped).toBe(true)
    expect(plain(frontmatter(fixture, 'bruno').open_questions)).toEqual([
      expect.objectContaining({ text: 'o Bruno gosta de filme longo?' }),
    ])
  })

  test('perguntas lists her open questions, as ver does', async () => {
    const fixture = useFixture()
    await fixture.ok(
      personSkip({
        person: 'bruno',
        text: 'o Bruno curte a Helena Prado?',
        subject: HELENA,
      }),
    )
    await fixture.ok(
      personSkip({
        person: 'bruno',
        text: 'o Bruno topa comédia boba?',
        subject: 'silly_comedy',
        group: true,
      }),
    )
    await fixture.ok(
      personSkip({ person: 'iara', text: 'a Iara curte filme mudo?' }),
    )

    const result = await fixture.ok(personQuestions('bruno'))

    expect(result.person).toBe('bruno')
    expect(
      result.openQuestions.map((q) => [q.text, q.subject, q.label, q.skips]),
    ).toEqual([
      ['o Bruno curte a Helena Prado?', HELENA, 'Helena Prado', 1],
      ['o Bruno topa comédia boba?', 'silly_comedy', 'comédia boba', 1],
    ])
    expect((await fixture.ok(personView('bruno'))).openQuestions).toEqual(
      result.openQuestions,
    )
  })

  test('skip and remove hold in the database at once', async () => {
    const fixture = useFixture()
    const skip = () =>
      personSkip({
        person: 'bruno',
        text: 'o Bruno topa comédia boba?',
        subject: 'silly_comedy',
        group: true,
      })
    const { openQuestion } = await fixture.ok(skip())

    expect(
      await query(
        fixture,
        "SELECT fato_id, pessoa, assunto, puladas FROM perguntas_abertas WHERE pessoa = 'bruno'",
      ),
    ).toEqual([
      {
        fato_id: openQuestion.factId,
        pessoa: 'bruno',
        assunto: 'comedia_boba',
        puladas: 1,
      },
    ])

    await fixture.ok(skip())
    expect(
      await query(
        fixture,
        "SELECT count(*) AS n FROM perguntas_abertas WHERE pessoa = 'bruno'",
      ),
    ).toEqual([{ n: 0 }])
  })

  test('skipped again with a subject keeps the subject', async () => {
    const fixture = useFixture()
    await fixture.ok(
      personSkip({ person: 'bruno', text: 'o Bruno topa comédia boba?' }),
    )

    const result = await fixture.ok(
      personSkip({
        person: 'bruno',
        text: 'o Bruno topa comédia boba?',
        subject: 'silly_comedy',
        group: true,
      }),
    )

    expect(result.dropped).toBe(true)
    expect([result.openQuestion.subject, result.openQuestion.skips]).toEqual([
      'silly_comedy',
      2,
    ])
  })

  test('a database from before the open questions takes a write to the Pessoa', async () => {
    const fixture = useFixture()
    await fixture.ok(
      Effect.gen(function* () {
        yield* (yield* Sqlite).write((db) =>
          db.exec('DROP TABLE perguntas_abertas'),
        )
      }),
    )

    await fixture.ok(
      personVeto({ person: 'bruno', text: 'esse não', target: FAROL }),
    )
    await fixture.ok(
      personSkip({
        person: 'bruno',
        text: 'o Bruno topa comédia boba?',
        subject: 'silly_comedy',
        group: true,
      }),
    )

    expect(
      await query(
        fixture,
        'SELECT pessoa, assunto FROM perguntas_abertas ORDER BY pessoa',
      ),
    ).toEqual([{ pessoa: 'bruno', assunto: 'comedia_boba' }])
    expect(
      await query(fixture, `SELECT pessoa FROM vetos WHERE alvo = '${FAROL}'`),
    ).toEqual([{ pessoa: 'bruno' }])
  })

  test('a film as subject is invalid usage; a group outside the file is an unknown target', async () => {
    const fixture = useFixture()

    expect(
      await errorOf(
        fixture,
        personSkip({ person: 'bruno', text: 'e o Farol?', subject: FAROL }),
      ),
    ).toEqual({
      exitCode: 2,
      code: 'invalid_usage',
      message:
        "o assunto é uma entidade (Q...) ou um grupo, não um filme: 'tt9000101'",
    })
    expect(
      await errorOf(
        fixture,
        personSkip({
          person: 'bruno',
          text: 'besteirol?',
          subject: 'Qx',
          group: true,
        }),
      ),
    ).toMatchObject({ code: 'unknown_target' })
  })
})

describe('pessoa remover', () => {
  test('removes the Declarado by its fato_id from the file and the database', async () => {
    const fixture = useFixture()
    await fixture.ok(
      personState({
        person: 'teo',
        text: 'adoro esse',
        target: FAROL,
        reaction: 'love',
      }),
    )
    const kept = (
      await fixture.ok(personState({ person: 'teo', text: 'gosto de comédia' }))
    ).stated
    const [wrong] = (await fixture.ok(personView('teo'))).stated

    const result = await fixture.ok(
      personRemove({ person: 'teo', kind: 'stated', id: wrong?.factId ?? '' }),
    )

    expect(result).toMatchObject({
      person: 'teo',
      kind: 'stated',
      removed: { factId: wrong?.factId, text: 'adoro esse' },
    })
    expect(
      (await fixture.ok(personView('teo'))).stated.map((s) => s.factId),
    ).toEqual([kept.factId])
    expect(
      await query(
        fixture,
        "SELECT fato_id FROM declarados WHERE pessoa = 'teo'",
      ),
    ).toEqual([{ fato_id: kept.factId }])
    expect(
      await query(
        fixture,
        `SELECT count(*) AS n FROM notas WHERE pessoa = 'teo' AND filme_id = '${FAROL}'`,
      ),
    ).toEqual([{ n: 0 }])
    expect(read(fixture, 'teo')).not.toContain('adoro esse')
  })

  test('removes the Veto by its target', async () => {
    const fixture = useFixture()
    const vetoed = await fixture.ok(
      personVeto({ person: 'teo', text: 'nunca vê terror', target: TERROR }),
    )

    const result = await fixture.ok(
      personRemove({ person: 'teo', kind: 'veto', id: TERROR }),
    )

    expect(result.removed.factId).toBe(vetoed.veto.factId)
    expect(plain(frontmatter(fixture, 'teo').vetoes)).toEqual([])
    expect((await fixture.ok(personView('teo'))).vetoes).toEqual([])
    expect(
      await query(fixture, "SELECT * FROM vetos WHERE pessoa = 'teo'"),
    ).toEqual([])
  })

  test('a target with more than one Relato asks for the fato_id', async () => {
    const fixture = useFixture()
    const one = (
      await fixture.ok(
        personReport({
          person: 'teo',
          text: 'gosta de comédia',
          target: COMEDY,
          reaction: 'like',
        }),
      )
    ).report
    const other = (
      await fixture.ok(
        personReport({
          person: 'teo',
          text: 'ri à toa com comédia',
          target: COMEDY,
          reaction: 'love',
        }),
      )
    ).report

    expect(
      await errorOf(
        fixture,
        personRemove({ person: 'teo', kind: 'report', id: COMEDY }),
      ),
    ).toEqual({
      exitCode: 1,
      code: 'ambiguous_report',
      message: `mais de um relato de teo tem o alvo ${COMEDY}; escolha pelo fato_id: ${one.factId}, ${other.factId}`,
    })

    await fixture.ok(
      personRemove({ person: 'teo', kind: 'report', id: other.factId }),
    )

    expect(
      (await fixture.ok(personView('teo'))).reports.map((r) => r.text),
    ).toEqual(['gosta de comédia'])
    expect(
      await query(fixture, "SELECT texto FROM relatos WHERE pessoa = 'teo'"),
    ).toEqual([{ texto: 'gosta de comédia' }])
  })

  test('an item not in the file is an error and nothing changes', async () => {
    const fixture = useFixture()
    await fixture.ok(personState({ person: 'teo', text: 'gosto de comédia' }))
    const before = read(fixture, 'teo')

    expect(
      await errorOf(
        fixture,
        personRemove({
          person: 'teo',
          kind: 'stated',
          id: 'declarados:nao-existe',
        }),
      ),
    ).toEqual({
      exitCode: 1,
      code: 'unknown_stated',
      message:
        "teo não tem declarado com fato_id ou alvo 'declarados:nao-existe' no arquivo",
    })
    expect(read(fixture, 'teo')).toBe(before)
  })

  test('an imported Declarado points to importar --remover', async () => {
    const fixture = useFixture()

    const error = await errorOf(
      fixture,
      personRemove({
        person: 'teo',
        kind: 'stated',
        id: 'letterboxd:0123abcd',
      }),
    )

    expect(error.message).toBe(
      "teo não tem declarado com fato_id ou alvo 'letterboxd:0123abcd' no arquivo; " +
        'ele veio de um import: tire o import com `importar --remover`',
    )
  })

  test('a removed Já visto leaves the database, as a reload agrees', async () => {
    const fixture = useFixture()
    const seen = (
      await fixture.ok(
        personSeen({ person: 'teo', film: PEQUENOS_MILAGRES, rating: '8/10' }),
      )
    ).seen
    const kept = (
      await fixture.ok(personSeen({ person: 'teo', film: CASA_CHEIA }))
    ).seen

    const result = await fixture.ok(
      personRemove({ person: 'teo', kind: 'seen', id: seen.factId }),
    )

    expect(result.removed).toMatchObject({ film: PEQUENOS_MILAGRES })
    const sql =
      "SELECT fato_id FROM ja_visto WHERE pessoa = 'teo' UNION ALL " +
      "SELECT fato_id FROM notas WHERE pessoa = 'teo' ORDER BY 1"
    expect(await query(fixture, sql)).toEqual([{ fato_id: kept.factId }])
    await fixture.ok(reloadPeople)
    expect(await query(fixture, sql)).toEqual([{ fato_id: kept.factId }])
    expect(split(read(fixture, 'teo')).body).toContain(
      '## Já vistos\n\n- 2026-11-20 · conversa com o Dono · Casa Cheia (tt9000602)\n',
    )
  })

  test('removes an answered question by its subject or its fato_id', async () => {
    const fixture = useFixture()
    await fixture.ok(
      personSkip({
        person: 'bruno',
        text: 'o Bruno curte a Helena Prado?',
        subject: HELENA,
      }),
    )
    const stays = (
      await fixture.ok(
        personSkip({ person: 'bruno', text: 'Curte filme mudo?' }),
      )
    ).openQuestion

    const result = await fixture.ok(
      personRemove({ person: 'bruno', kind: 'open_question', id: HELENA }),
    )

    expect([result.kind, result.removed]).toEqual([
      'open_question',
      expect.objectContaining({ subject: HELENA }),
    ])
    expect((await fixture.ok(personQuestions('bruno'))).openQuestions).toEqual([
      stays,
    ])
    await fixture.ok(
      personRemove({
        person: 'bruno',
        kind: 'open_question',
        id: stays.factId,
      }),
    )
    expect(frontmatter(fixture, 'bruno')).not.toHaveProperty('open_questions')
  })

  test('every item of ver has a fato_id, and the synced rows equal a reload', async () => {
    const fixture = useFixture()
    await ana(fixture)
    await fixture.ok(
      personVeto({ person: 'teo', text: 'nunca vê terror', target: TERROR }),
    )
    await fixture.ok(personState({ person: 'teo', text: 'gosto de comédia' }))
    await fixture.ok(
      personReport({ person: 'teo', text: 'gosta de comédia', target: COMEDY }),
    )
    await fixture.ok(personSeen({ person: 'teo', film: PEQUENOS_MILAGRES }))
    await fixture.ok(
      personAdjust({ person: 'ana', link: 'genre', level: 'low' }),
    )
    await fixture.ok(
      personVeto({
        person: 'ana',
        text: 'nada lento',
        target: 'slow',
        group: true,
      }),
    )
    await fixture.ok(
      personSkip({
        person: 'ana',
        text: 'topa comédia boba?',
        subject: 'silly_comedy',
        group: true,
      }),
    )

    const view = await fixture.ok(personView('teo'))
    for (const list of [view.vetoes, view.stated, view.reports, view.seen]) {
      expect(list.length).toBeGreaterThan(0)
      for (const item of list) expect(item.factId).toBeTruthy()
    }
    const synced = await personRows(fixture)
    await fixture.ok(reloadPeople)
    expect(await personRows(fixture)).toEqual(synced)
  })

  // The removal itself is in test/sessions/feedback.test.ts (#96).
  test('a Feedback comment whose Session file is gone is an unknown Session', async () => {
    const fixture = useFixture()
    await fixture.ok(
      Effect.gen(function* () {
        yield* (yield* Sqlite).write((db) =>
          db.run(
            `INSERT INTO declarados (fato_id, pessoa, data, fonte, especifico, reacao, alvo, rotulo, texto, sessao)
             VALUES ('feedback:1', 'teo', '2026-11-20', 'Feedback', 1, 'gosta', ?, 'O Farol', 'a trilha é linda', 's1')`,
            FAROL,
          ),
        )
      }),
    )

    expect(
      await errorOf(
        fixture,
        personRemove({ person: 'teo', kind: 'stated', id: 'feedback:1' }),
      ),
    ).toMatchObject({ exitCode: 1, code: 'unknown_session' })
  })
})
