// Sessions, opening and listing (ticket #94); the pytest twin is
// tests/test_sessoes.py. `recomendar` opens the Session in
// `sessions/<date>-<attendees>.md`: a frontmatter with the date, the
// Presentes, the context, the Regra and no Feedback yet, and in the body
// the whole Recomendação with every Evidence in the full line format.
// `sessoes-abertas` lists the ones without Feedback. Where Python rebuilt
// the database with `reconstruir`, these reload the Sessions
// (`reloadSessions`), the loading step of a rebuild; the Feedback is
// written by Python until its port (#96).

import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { migrateDataFile, output } from '@filmes/key-migration'
import { Effect } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import {
  filmsInBody,
  KIND_IN_BODY,
  makeEngine,
  openSessions,
  readConstraints,
  parseYaml,
  currentVersion,
  onScreen,
  readSession,
  writeSession,
  recommendSession,
  reloadSessions,
  sessionContext,
  Sqlite,
  STRENGTH_IN_BODY,
  yamlToJson,
  type Outcome,
  type YamlMapping,
  type SessionRecommendation,
  type Vars,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'
import { PYTHON_TIMEOUT, pythonOk } from '../recommendation/support.ts'

const sessionFile = (fixture: Fixture, id: string) =>
  join(fixture.data, 'sessions', `${id}.md`)

const readFile = (fixture: Fixture, id: string) => {
  const text = readFileSync(sessionFile(fixture, id), 'utf8')
  const end = text.indexOf('\n---', 4)
  return {
    text,
    front: yamlToJson(parseYaml(text.slice(4, end))) as Record<string, unknown>,
    body: text.slice(end + 5).replace(/^\n+/u, ''),
  }
}

const open = (
  fixture: Fixture,
  request: Parameters<typeof recommendSession>[0],
  vars?: Vars,
): Promise<SessionRecommendation> => fixture.ok(recommendSession(request), vars)

const query = (fixture: Fixture, sql: string) =>
  fixture.ok(
    Effect.gen(function* () {
      return yield* (yield* Sqlite).read((db) => db.all(sql))
    }),
  )

/** Every row of the tables a Session fills. */
const sessionRows = async (fixture: Fixture) => {
  const rows: Record<string, unknown[]> = {}
  for (const table of [
    'sessoes',
    'sessao_presentes',
    'sessao_recomendacao',
    'reacoes',
    'notas',
    'ja_visto',
    'declarados',
  ])
    rows[table] = (await query(fixture, `SELECT * FROM "${table}` + '"')).map(
      (row) => ({ ...row }),
    )
  for (const list of Object.values(rows))
    list.sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1))
  return rows
}

describe('recomendar opens the Session', () => {
  test('in a file of filmes-dados', async () => {
    const fixture = useFixture()

    const out = await open(fixture, {
      attendees: ['dono', 'iara'],
      request: 'eu e a Iara, algo bom',
    })

    expect(out.session).toEqual({
      id: '2026-11-20-iara',
      file: 'sessions/2026-11-20-iara.md',
      version: 1,
    })
    const { text, front } = readFile(fixture, '2026-11-20-iara')
    // A date, as PyYAML writes a Python date: plain.
    expect(text).toContain('\ndate: 2026-11-20\n')
    expect(front).toEqual({
      date: '2026-11-20',
      owner: 'bruno',
      attendees: ['bruno', 'iara'],
      context: {
        request: 'eu e a Iara, algo bom',
        max_duration: null,
        moods: [],
        constraints: [],
      },
      rule: { name: 'default' },
      recommendation: out.films.map((f) => ({
        position: f.position,
        id: f.id,
        title: f.title,
      })),
      chosen: null,
      chosen_in_recommendation: null,
      feedback: null,
    })
  })

  test('its body keeps every Evidence in the full line format', async () => {
    const fixture = useFixture()

    await open(fixture, { attendees: ['dono', 'iara'], count: 50 })

    const { body } = readFile(fixture, '2026-11-20-iara')
    expect(body.startsWith('## Recomendação\n')).toBe(true)
    expect(body).toContain(
      '. As Horas Lentas (2021, 1h44) · tt9000104\n   - Bruno\n',
    )
    expect(body).toContain(
      '     - Evidência: deu 5 a O Farol de Areia (2012), também de Helena Prado' +
        ' · Fonte: Letterboxd do Bruno, 2025-06-01 · Força: forte · Tipo: nota\n',
    )
    expect(body).toContain(
      '     - Evidência: dirigido por Helena Prado, como 3 filmes a que deu 4 ou mais:' +
        ' O Farol de Areia (2012), Maré Baixa (2015) e Cidade de Vidro (2018)' +
        ' · Fonte: Wikidata, 2026-11-20 · Força: forte · Tipo: metadado\n',
    )
    expect(body).toContain(
      '     - Evidência: deu 3 a O Farol de Areia (2012), também de Helena Prado' +
        ' · Fonte: Letterboxd da Iara, 2025-04-12 · Força: fraca · Tipo: nota\n',
    )
    expect(body).toContain(
      'Pequenos Milagres (2019, 1h36) · tt9000601 · sem fato que o sustente\n',
    )
    expect(body).toContain(
      '     - Evidência: sem fato · Força: fraca · Tipo: palpite\n',
    )
  })

  test('the body reads back into each Presente’s Evidence', async () => {
    const fixture = useFixture()
    const out = await open(fixture, { attendees: ['dono', 'iara'], count: 50 })

    const { body } = readFile(fixture, '2026-11-20-iara')
    const films = filmsInBody(['bruno', 'iara'], body)

    expect(films).toEqual(
      out.films.map((f) => ({
        position: f.position,
        id: f.id,
        onlyGuesses: f.onlyGuesses,
        evidence: Object.fromEntries(
          Object.entries(f.evidence).map(([person, list]) => [
            person,
            list.map((e) => ({
              text: e.text,
              source: e.source,
              date: e.date,
              strength: e.strength,
              kind: e.kind,
            })),
          ]),
        ),
      })),
    )
  })

  test('the Dono alone names the Session', async () => {
    const fixture = useFixture()

    const out = await open(fixture, { attendees: ['dono'] })

    expect(out.session.id).toBe('2026-11-20-bruno')
    expect(readdirSync(join(fixture.data, 'sessions'))).toEqual([
      '2026-11-20-bruno.md',
    ])
  })

  test('a new request on the same day keeps the earlier Session', async () => {
    const fixture = useFixture()

    const first = await open(fixture, {
      attendees: ['dono', 'iara'],
      request: 'primeira Sessão',
    })
    const second = await open(fixture, {
      attendees: ['dono', 'iara'],
      rule: 'average',
      request: 'outra Sessão',
    })

    expect(first.session.id).toBe('2026-11-20-iara')
    expect(second.session.id).toBe('2026-11-20-iara-2')
    expect(readFile(fixture, '2026-11-20-iara').front['context']).toMatchObject(
      { request: 'primeira Sessão' },
    )
    const { sessions } = await fixture.ok(openSessions)
    expect(sessions.map((s) => s.id)).toEqual([
      '2026-11-20-iara-2',
      '2026-11-20-iara',
    ])
  })

  test('the Session’s rows are those a reload gives', async () => {
    const fixture = useFixture()
    await open(fixture, { attendees: ['dono', 'iara'], request: 'algo bom' })
    await open(fixture, { attendees: ['dono', 'teo'], rule: 'by', by: 'teo' })
    const synced = await sessionRows(fixture)
    expect(synced['sessoes']).toHaveLength(2)

    await fixture.ok(
      Effect.gen(function* () {
        yield* (yield* Sqlite).write((db) =>
          Effect.gen(function* () {
            for (const table of [
              'sessao_presentes',
              'sessao_recomendacao',
              'sessoes',
            ])
              yield* db.run(`DELETE FROM ${table}`)
          }),
        )
      }),
    )
    const ids = await fixture.ok(reloadSessions)

    expect(ids).toEqual(['2026-11-20-iara', '2026-11-20-teo'])
    expect(await sessionRows(fixture)).toEqual(synced)
    expect(
      await query(
        fixture,
        'SELECT regra, regra_pessoa, pedido FROM sessoes ORDER BY id',
      ),
    ).toEqual([
      { regra: 'padrao', regra_pessoa: null, pedido: 'algo bom' },
      { regra: 'de', regra_pessoa: 'teo', pedido: null },
    ])
  })

  test('the logged-in Pessoa is the Dono of the request', async () => {
    const fixture = useFixture()
    const engine = makeEngine(fixture.vars)
    try {
      const out = await engine.run(
        recommendSession({ attendees: ['dono', 'bruno'] }),
        { owner: 'iara' },
      )
      expect(out.exitCode).toBe(0)
      const { session, attendees } = (
        out as Outcome<SessionRecommendation> & {
          exitCode: 0
        }
      ).output
      expect(attendees).toEqual(['iara', 'bruno'])
      expect(session.id).toBe('2026-11-20-bruno')
      expect(readFile(fixture, session.id).front['owner']).toBe('iara')
    } finally {
      await engine.dispose()
    }
  })

  test('the Session keeps the Restrições asked and the Climas accepted', () => {
    // The child Restrição's report and stored keys differ
    // (`maxAgeRating`, `max_age_rating`).
    const asked = Effect.runSync(
      readConstraints({ maxDuration: 120, unseen: true, child: 7 }),
    )

    const context = sessionContext('duas horas', ['leve'], asked)

    expect(yamlToJson(context)).toEqual({
      request: 'duas horas',
      max_duration: 120,
      moods: ['leve'],
      constraints: [
        { name: 'child', age: 7, max_age_rating: '6' },
        { name: 'unseen' },
      ],
    })
  })

  test('the Session file stores the Restrições the request asks for, without the counts', async () => {
    const fixture = useFixture()
    const { session } = await open(fixture, {
      attendees: ['dono'],
      since: 1990,
      noSlow: true,
      noSad: true,
    })

    expect(readFile(fixture, session.id).front['context']).toMatchObject({
      constraints: [
        { name: 'year', since: 1990, until: null },
        { name: 'no_slow' },
        { name: 'no_sad' },
      ],
    })
  })

  test('the body writes Força and Tipo as the Python engine', () => {
    const invert = (table: Readonly<Record<string, string>>) =>
      Object.fromEntries(Object.entries(table).map(([pt, en]) => [en, pt]))
    expect(STRENGTH_IN_BODY).toEqual(invert(output.STRENGTHS))
    expect(KIND_IN_BODY).toEqual(invert(output.KINDS))
  })
})

describe('sessoes-abertas', () => {
  test('lists the Sessions without Feedback, the latest first', async () => {
    const fixture = useFixture()
    expect(await fixture.ok(openSessions)).toEqual({ sessions: [] })

    await open(
      fixture,
      { attendees: ['dono', 'iara'], count: 2, request: 'eu e a Iara' },
      { FILMES_HOJE: '2026-11-19' },
    )
    await open(fixture, { attendees: ['dono'] })

    const { sessions } = await fixture.ok(openSessions)
    expect(sessions.map((s) => s.id)).toEqual([
      '2026-11-20-bruno',
      '2026-11-19-iara',
    ])
    expect(sessions[1]).toEqual({
      id: '2026-11-19-iara',
      file: 'sessions/2026-11-19-iara.md',
      date: '2026-11-19',
      attendees: ['bruno', 'iara'],
      request: 'eu e a Iara',
      recommendation: [
        { position: 1, id: 'tt9000403', title: 'A Volta do Mar' },
        { position: 2, id: 'tt9001903', title: 'Fronteira II' },
      ],
      version: 1,
    })
  })

  test('the tenth Session of a day comes after the ninth', async () => {
    const fixture = useFixture()
    mkdirSync(join(fixture.data, 'sessions'))
    for (const n of [1, 2, 9, 10]) {
      const id = n === 1 ? '2026-11-20-iara' : `2026-11-20-iara-${n}`
      writeFileSync(
        sessionFile(fixture, id),
        '---\ndate: 2026-11-20\nattendees: [bruno, iara]\nrule: {name: default}\n---\n',
      )
    }

    const { sessions } = await fixture.ok(openSessions)

    expect(sessions.map((s) => s.id)).toEqual([
      '2026-11-20-iara-10',
      '2026-11-20-iara-9',
      '2026-11-20-iara-2',
      '2026-11-20-iara',
    ])
  })

  test('a Session with Feedback is not listed', async () => {
    const fixture = useFixture()
    mkdirSync(join(fixture.data, 'sessions'))
    writeFileSync(
      sessionFile(fixture, '2026-11-20-iara'),
      '---\ndate: 2026-11-20\nattendees: [bruno, iara]\nrule: {name: default}\n' +
        'chosen: tt9000302\nfeedback: {recorded_on: 2026-11-21, reactions: []}\n---\n',
    )

    expect(await fixture.ok(openSessions)).toEqual({ sessions: [] })
  })
})

describe('the Session file', () => {
  const write = (fixture: Fixture, id: string, text: string) => {
    mkdirSync(join(fixture.data, 'sessions'), { recursive: true })
    writeFileSync(sessionFile(fixture, id), text)
  }

  const error = async (fixture: Fixture, id: string) =>
    (await fixture.run(readSession(id))).output

  test('the prototype’s format is read as today’s', async () => {
    const fixture = useFixture()
    write(
      fixture,
      '2026-11-20-iara',
      migrateDataFile(
        'session',
        '---\ndata: 2026-11-20\npresentes: [bruno, iara]\n' +
          'regra: media-sem-miseria-com-justica\n---\n\n' +
          '## Recomendação\n\n1. Vento Norte (tt9000302)\n',
        'to-en',
      ),
    )

    await fixture.ok(reloadSessions)

    expect(await query(fixture, 'SELECT id, regra FROM sessoes')).toEqual([
      { id: '2026-11-20-iara', regra: 'padrao' },
    ])
    expect(
      await query(fixture, 'SELECT posicao, filme_id FROM sessao_recomendacao'),
    ).toEqual([{ posicao: 1, filme_id: 'tt9000302' }])
    const { sessions } = await fixture.ok(openSessions)
    expect(sessions[0]?.recommendation).toEqual([
      { position: 1, id: 'tt9000302', title: 'Vento Norte' },
    ])
  })

  test('the legacy Regra in an English file is the default one', async () => {
    const fixture = useFixture()
    write(
      fixture,
      'x',
      '---\ndate: 2026-11-20\nattendees: [bruno]\nrule: media-sem-miseria-com-justica\n---\n',
    )

    const session = await fixture.ok(readSession('x'))

    expect(yamlToJson(session.frontmatter.get('rule') ?? null)).toEqual({
      name: 'default',
    })
  })

  test('an unknown id, a path, or a missing field is an error', async () => {
    const fixture = useFixture()
    write(
      fixture,
      'sem-regra',
      '---\ndate: 2026-11-20\nattendees: [bruno]\n---\n',
    )

    expect(await error(fixture, 'nada')).toEqual({
      error: {
        code: 'unknown_session',
        message: `não há Sessão 'nada' em ${join(fixture.data, 'sessions')}`,
      },
    })
    for (const id of ['', '.', '..', 'a/b', '../x'])
      expect(await error(fixture, id)).toMatchObject({
        error: { code: 'invalid_usage' },
      })
    expect(await error(fixture, 'sem-regra')).toEqual({
      error: {
        code: 'invalid_data',
        message: `${sessionFile(fixture, 'sem-regra')}: falta o campo regra`,
      },
    })
  })
})

describe('a redone Session', () => {
  const REDONE =
    '---\ndate: 2026-11-20\nowner: bruno\nattendees: [bruno, iara]\n' +
    "context: {request: '2026-11-19', max_duration: null, moods: [], constraints: []}\n" +
    'rule: {name: default}\n' +
    'recommendation:\n- {position: 1, id: tt9000104, title: As Horas Lentas, new: true}\n' +
    'kept: []\n' +
    "replies:\n- {date: '2026-11-21', addition: algo leve}\n" +
    "redone_on: '2026-11-21'\n" +
    'versions:\n' +
    "- version: 1\n  date: '2026-11-20'\n  attendees: [bruno, iara]\n  context: null\n" +
    '  rule: {name: default}\n' +
    '  recommendation:\n  - {position: 1, id: tt9000102, title: Maré Baixa}\n' +
    '  shown:\n  - {position: 1, id: tt9000102, title: Maré Baixa}\n' +
    "  replies:\n  - {date: '2026-11-20', films: []}\n" +
    "feedback: {recorded_on: '2026-11-22', reactions: []}\n---\n## Recomendação\n"

  test('is written with its dates as dates, and reads back the same', async () => {
    const fixture = useFixture()
    mkdirSync(join(fixture.data, 'sessions'))
    writeFileSync(sessionFile(fixture, 'x'), REDONE)
    const before = await fixture.ok(readSession('x'))

    await fixture.ok(writeSession('x', before.frontmatter, before.body))

    const text = readFileSync(sessionFile(fixture, 'x'), 'utf8')
    for (const line of [
      'redone_on: 2026-11-21',
      '- {date: 2026-11-21, addition: algo leve}',
      '  date: 2026-11-20',
      '  - date: 2026-11-20',
      '  recorded_on: 2026-11-22',
    ])
      expect(text.split('\n')).toContain(line)
    // A request that looks like a date stays text.
    expect(text).toContain("request: '2026-11-19'")
    const after = await fixture.ok(readSession('x'))
    expect(yamlToJson(after.frontmatter)).toEqual(
      yamlToJson(before.frontmatter),
    )
    expect(after.body).toBe(before.body)
  })

  test('its current version is the top of the frontmatter', async () => {
    const fixture = useFixture()
    mkdirSync(join(fixture.data, 'sessions'))
    writeFileSync(sessionFile(fixture, 'x'), REDONE)
    const { frontmatter } = await fixture.ok(readSession('x'))

    const current = currentVersion(frontmatter)

    expect(yamlToJson(current)).toEqual({
      version: 2,
      date: '2026-11-21',
      attendees: ['bruno', 'iara'],
      context: {
        request: '2026-11-19',
        max_duration: null,
        moods: [],
        constraints: [],
      },
      rule: { name: 'default' },
      recommendation: [
        { position: 1, id: 'tt9000104', title: 'As Horas Lentas', new: true },
      ],
      kept: [],
      replies: [{ date: '2026-11-21', addition: 'algo leve' }],
    })
    expect(yamlToJson([...onScreen(current)])).toEqual([
      { position: 1, id: 'tt9000104', title: 'As Horas Lentas', new: true },
    ])
    const [first] = frontmatter.get('versions') as YamlMapping[]
    expect(yamlToJson([...onScreen(first as YamlMapping)])).toEqual([
      { position: 1, id: 'tt9000102', title: 'Maré Baixa' },
    ])
    expect(onScreen(new Map())).toEqual([])
    expect(
      yamlToJson(currentVersion(new Map([['date', '2026-11-20']]))),
    ).toMatchObject({
      version: 1,
      date: '2026-11-20',
      recommendation: [],
    })
  })
})

describe('the Feedback’s Fatos in the database', () => {
  /** Python opens and closes the Sessions; the engine reloads them from
   * the same files, migrated to English. */
  const pythonSessions = (fixture: Fixture) => {
    const folder = join(fixture.root, 'py-dados', 'sessoes')
    mkdirSync(join(fixture.data, 'sessions'), { recursive: true })
    for (const name of readdirSync(folder))
      writeFileSync(
        join(fixture.data, 'sessions', name),
        migrateDataFile(
          'session',
          readFileSync(join(folder, name), 'utf8'),
          'to-en',
        ),
      )
  }

  test(
    'a reload gives the rows Python’s Feedback wrote',
    async () => {
      const fixture = useFixture()
      const opened = pythonOk(fixture, [
        'recomendar',
        '--presentes',
        'dono',
        'iara',
        'teo',
      ])
      const id = (opened as { sessao: { id: string } }).sessao.id
      pythonOk(fixture, [
        'feedback',
        '--sessao',
        id,
        '--filme',
        'Vento Norte',
        '--nota',
        'dono=4',
        '--nota',
        'iara=9/10',
        '--relato',
        'teo=gostou',
        '--comentario',
        'iara=lindo demais',
        '--comentario',
        'dono=longo',
      ])
      const other = pythonOk(fixture, [
        'recomendar',
        '--presentes',
        'dono',
        'teo',
      ])
      pythonOk(fixture, [
        'feedback',
        '--sessao',
        (other as { sessao: { id: string } }).sessao.id,
        '--filme',
        'Vento Norte',
        '--relato',
        'teo=neutro',
      ])
      const python = await sessionRows(fixture)
      expect(python['reacoes']?.length).toBeGreaterThan(0)
      expect(
        python['declarados']?.some((r) => (r as { sessao: unknown }).sessao),
      ).toBe(true)
      pythonSessions(fixture)

      await fixture.ok(reloadSessions)

      expect(await sessionRows(fixture)).toEqual(python)
    },
    PYTHON_TIMEOUT,
  )

  test('a reaction outside the list is invalid data', async () => {
    const fixture = useFixture()
    mkdirSync(join(fixture.data, 'sessions'))
    writeFileSync(
      sessionFile(fixture, 'x'),
      '---\ndate: 2026-11-20\nattendees: [bruno]\nrule: {name: default}\nchosen: tt9000302\n' +
        'feedback: {recorded_on: 2026-11-21, reactions: [{person: bruno, kind: report, reaction: amou}]}\n---\n',
    )

    expect((await fixture.run(reloadSessions)).output).toEqual({
      error: {
        code: 'invalid_data',
        message:
          "Sessão x: reação inválida {'person': 'bruno', 'kind': 'report', 'reaction': 'amou'}",
      },
    })
  })
})

describe('filmes-dados as a git repository', () => {
  const gitIn = (cwd: string, ...args: string[]) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
    if (result.status !== 0) throw new Error(result.stderr)
    return result.stdout
  }

  test('opening a Session is one commit by the Dono', async () => {
    const fixture = useFixture()
    gitIn(fixture.data, 'init', '--quiet', '-b', 'master')
    gitIn(fixture.data, 'add', '--all')
    gitIn(
      fixture.data,
      '-c',
      'user.name=x',
      '-c',
      'user.email=x@x',
      'commit',
      '--quiet',
      '-m',
      'initial',
    )

    await open(fixture, { attendees: ['dono', 'iara'] })

    expect(
      gitIn(fixture.data, 'log', '-1', '--format=%an|%s', '--name-only').trim(),
    ).toBe(
      'Bruno|open session 2026-11-20 (bruno, iara)\n\nsessions/2026-11-20-iara.md',
    )
  })
})
