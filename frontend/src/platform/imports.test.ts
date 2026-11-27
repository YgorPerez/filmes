import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  makeEngine,
  type ErrorCode,
  type ErrorReason,
  type Outcome,
} from '@filmes/engine'
import { describe, expect, it, onTestFinished, vi } from 'vite-plus/test'
import { ROOT, useFixture } from '../../../packages/engine/test/fixture.ts'
import { zipOf } from '../../../packages/engine/test/imports/zip.ts'
import {
  MAX_UPLOAD_BYTES,
  parseImport,
  parseQueue,
  type ImportAction,
  type ImportRun,
  type QueueAction,
} from '#/content/import-action'
import {
  importAction,
  importsFromEngine,
  importsPage,
  queueAction,
  queuePage,
  type ImportDone,
  type Imports,
  type QueueDone,
} from './imports'

const BRUNO = {
  person: 'bruno',
  name: 'Bruno',
  email: 'bruno@example.org',
  admin: false,
}
const ORIGIN = 'http://localhost'
const RECORDINGS = join(ROOT, 'tests/fixture/gravacoes')

const failure = (code: ErrorCode): Outcome<never> => ({
  exitCode: 1,
  output: { error: { code, message: `mensagem de ${code}` } },
})

const form = (fields: Record<string, string | Blob>) => {
  const data = new FormData()
  for (const [name, value] of Object.entries(fields)) data.set(name, value)
  return data
}

const zipFile = (name = 'export.zip', bytes = [80, 75, 3, 4]) =>
  new File([new Uint8Array(bytes)], name, { type: 'application/zip' })

const letterboxdZip = new File(
  [new Uint8Array(zipOf([['letterboxd/ratings.csv', 'Date,Name,Year\n']]))],
  'letterboxd.zip',
)
const traktZip = new File(
  [new Uint8Array(zipOf([['trakt/ratings-movies.json', '[]']]))],
  'trakt.zip',
)
const imdbCsv = new File(
  [readFileSync(join(ROOT, 'tests/fixture/imdb/vera.csv'))],
  'ratings.csv',
  { type: 'text/csv' },
)
const simklJson = new File(
  [readFileSync(join(ROOT, 'tests/fixture/simkl/SimklBackup.json'))],
  'SimklBackup.json',
  {
    type: 'application/json',
  },
)
const simklZip = new File(
  [
    new Uint8Array(
      zipOf([
        [
          'SimklBackup.json',
          readFileSync(join(ROOT, 'tests/fixture/simkl/SimklBackup.json')),
        ],
      ]),
    ),
  ],
  'SimklBackup.zip',
)

describe('parseImport', () => {
  it('reads an upload with its name and bytes, of either service', async () => {
    expect(
      await parseImport(form({ acao: 'arquivo', arquivo: zipFile() })),
    ).toEqual({
      kind: 'upload',
      original: 'export.zip',
      content: new Uint8Array([80, 75, 3, 4]),
    })
  })

  it.each([
    'ygorperez',
    '@ygorperez',
    'https://letterboxd.com/ygorperez/',
    'http://www.letterboxd.com/ygorperez',
    'letterboxd.com/ygorperez/films/',
    ' https://Letterboxd.com/ygorperez/rss/ ',
  ])('reads the Letterboxd user out of %o', async (typed) => {
    expect(
      await parseImport(
        form({ acao: 'rss', usuario: typed, consentimento: 'sim' }),
      ),
    ).toEqual({ kind: 'rss', user: 'ygorperez' })
  })

  it('asks no consent on the Dono’s own page', async () => {
    expect(
      await parseImport(form({ acao: 'rss', usuario: 'ygorperez' }), true),
    ).toEqual({ kind: 'rss', user: 'ygorperez' })
  })
})

describe('parseImport', () => {
  it.each<[Record<string, string | Blob>, ImportAction | string]>([
    [{ acao: 'arquivo' }, 'arquivo'],
    [{ acao: 'arquivo', arquivo: zipFile('vazio.zip', []) }, 'arquivo'],
    [
      { acao: 'rss', usuario: 'olga_farol', consentimento: 'sim' },
      { kind: 'rss', user: 'olga_farol' },
    ],
    [{ acao: 'rss', usuario: 'olga_farol' }, 'consentimento'],
    [{ acao: 'rss', usuario: 'olga farol', consentimento: 'sim' }, 'usuario'],
    [{ acao: 'rss', usuario: '@', consentimento: 'sim' }, 'usuario'],
    [
      {
        acao: 'rss',
        usuario: 'https://trakt.tv/users/olga_farol',
        consentimento: 'sim',
      },
      'usuario',
    ],
    [{ acao: 'rss', consentimento: 'sim' }, 'usuario'],
    [
      { acao: 'remover', arquivo: ' imports/teo/trakt-1.zip ' },
      { kind: 'remove', file: 'imports/teo/trakt-1.zip' },
    ],
    [{ acao: 'remover' }, 'pedido'],
    [{ acao: 'outra' }, 'pedido'],
    // Her Trakt (#269): her connection or the username of before, a public
    // profile by its name, @name or address, and another Pessoa's yes.
    [{ acao: 'trakt' }, { kind: 'trakt-sync', user: null }],
    [
      {
        acao: 'trakt',
        usuario: 'https://trakt.tv/users/olga-f',
        consentimento: 'sim',
      },
      { kind: 'trakt-sync', user: 'olga-f' },
    ],
    [
      { acao: 'trakt', usuario: '@olga', consentimento: 'sim' },
      { kind: 'trakt-sync', user: 'olga' },
    ],
    [{ acao: 'trakt', usuario: 'olga' }, 'consentimento'],
    [
      { acao: 'trakt', usuario: 'olga f', consentimento: 'sim' },
      'trakt-usuario',
    ],
  ])('%o → %o', async (fields, expected) => {
    expect(await parseImport(form(fields))).toEqual(expected)
  })
})

describe('parseQueue', () => {
  it.each<[Record<string, string>, QueueAction | null]>([
    [
      { acao: 'confirmar', id: 'x-1', filme: ' tt9000303 ' },
      { kind: 'confirm', id: 'x-1', film: 'tt9000303' },
    ],
    [{ acao: 'confirmar', id: 'x-1', filme: '' }, null],
    [
      { acao: 'descartar', id: 'x-1', motivo: 'não é filme' },
      { kind: 'discard', id: 'x-1', reason: 'não é filme' },
    ],
    [
      { acao: 'descartar', id: 'x-1', motivo: '  ' },
      { kind: 'discard', id: 'x-1', reason: 'ignorar' },
    ],
    [{ acao: 'descartar' }, null],
    [{ acao: 'reprocessar' }, { kind: 'reprocess' }],
    [{ acao: 'outra', id: 'x' }, null],
  ])('%o → %o', (fields, expected) => {
    expect(parseQueue(form(fields))).toEqual(expected)
  })
})

// --- the routes' logic, on a stand-in engine ------------------------------------

function fakeImports(
  result: Outcome<ImportDone> = {
    exitCode: 0,
    output: { notice: 'letterboxd', facts: 12 },
  },
  decided: Outcome<QueueDone> = {
    exitCode: 0,
    output: { notice: 'confirmado' },
  },
) {
  const calls: unknown[] = []
  const imports: Imports = {
    page: async (person) =>
      person === 'teo'
        ? failure('missing_database')
        : failure('unknown_person'),
    queue: async () => failure('outdated_database'),
    run: async (person, action, author) => {
      calls.push({ person, action, author })
      return result
    },
    decide: async (action, author) => {
      calls.push({ action, author })
      return decided
    },
  }
  return { imports, calls }
}

const post = (
  path: string,
  fields: Record<string, string | Blob>,
  headers: Record<string, string> = { Origin: ORIGIN },
) =>
  new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers,
    body: form(fields),
  })

const RSS = { acao: 'rss', usuario: 'olga_farol', consentimento: 'sim' }

describe('importAction', () => {
  it('runs the import as the logged-in Dono and says what came in', async () => {
    const { imports, calls } = fakeImports()
    const response = await importAction(
      post('/importar/teo/acao', RSS),
      'teo',
      BRUNO,
      imports,
      ORIGIN,
    )
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe(
      '/pessoas/teo/importar?feito=letterboxd&novos=12',
    )
    expect(calls).toEqual([
      {
        person: 'teo',
        action: { kind: 'rss', user: 'olga_farol' },
        author: { name: 'Bruno', email: 'bruno@example.org' },
      },
    ])
  })

  it('carries the Trakt films left out', async () => {
    const { imports } = fakeImports({
      exitCode: 0,
      output: { notice: 'trakt', facts: 3, outside: 2 },
    })
    const response = await importAction(
      post('/importar/teo/acao', { acao: 'arquivo', arquivo: traktZip }),
      'teo',
      BRUNO,
      imports,
      ORIGIN,
    )
    expect(response.headers.get('Location')).toBe(
      '/pessoas/teo/importar?feito=trakt&novos=3&fora=2',
    )
  })
})

describe('importAction', () => {
  it('tells Letterboxd, Trakt and Simkl by what the ZIP holds, IMDb by its CSV and Simkl by its JSON', async () => {
    const { imports, calls } = fakeImports()
    const upload = (file: File) =>
      importAction(
        post('/importar/teo/acao', { acao: 'arquivo', arquivo: file }),
        'teo',
        BRUNO,
        imports,
        ORIGIN,
      )
    await upload(letterboxdZip)
    await upload(traktZip)
    await upload(imdbCsv)
    await upload(simklJson)
    await upload(simklZip)
    expect(
      calls.map((call) => {
        const { action } = call as { action: ImportRun }
        return action.kind
      }),
    ).toEqual(['letterboxd', 'trakt', 'imdb', 'simkl', 'simkl'])
    const neither = await upload(
      new File([new Uint8Array(zipOf([['notas.csv', 'x']]))], 'outro.zip'),
    )
    expect(neither.headers.get('Location')).toBe(
      '/pessoas/teo/importar?erro=origem',
    )
    const notZip = await upload(zipFile())
    expect(notZip.headers.get('Location')).toBe(
      '/pessoas/teo/importar?erro=origem',
    )
    const otherCsv = await upload(
      new File(['Date,Name,Year\n'], 'ratings.csv', { type: 'text/csv' }),
    )
    expect(otherCsv.headers.get('Location')).toBe(
      '/pessoas/teo/importar?erro=origem',
    )
    expect(calls).toHaveLength(5)
  })
})

describe('importAction', () => {
  it('names the form a refusal came from, so the page shows it there', async () => {
    const { imports } = fakeImports()
    const refused = await importAction(
      post('/importar/teo/acao?de=outro', {
        acao: 'arquivo',
        arquivo: new File(['x'], 'nada.txt'),
      }),
      'teo',
      BRUNO,
      imports,
      ORIGIN,
    )
    expect(refused.headers.get('Location')).toBe(
      '/pessoas/teo/importar?erro=origem&de=outro',
    )
    const profile = await importAction(
      post('/importar/teo/acao?de=perfil', { acao: 'rss', usuario: 'a b' }),
      'teo',
      BRUNO,
      imports,
      ORIGIN,
    )
    expect(profile.headers.get('Location')).toBe(
      '/pessoas/teo/importar?erro=usuario&de=perfil',
    )
  })

  it('takes the RSS without the consent box on the Dono’s own page', async () => {
    const { imports, calls } = fakeImports()
    const response = await importAction(
      post('/importar/bruno/acao', { acao: 'rss', usuario: '@olga_farol' }),
      'bruno',
      BRUNO,
      imports,
      ORIGIN,
    )
    expect(response.headers.get('Location')).toBe(
      '/meu-gosto/importar?feito=letterboxd&novos=12',
    )
    expect(calls).toMatchObject([
      { action: { kind: 'rss', user: 'olga_farol' } },
    ])
  })
})

describe('importAction', () => {
  it('sends whoever is not a Dono to the login, and refuses another site', async () => {
    const { imports, calls } = fakeImports()
    const anonymous = await importAction(
      post('/importar/teo/acao', RSS),
      'teo',
      null,
      imports,
      ORIGIN,
    )
    expect(anonymous.headers.get('Location')).toBe('/entrar')
    const elsewhere = await importAction(
      post('/importar/teo/acao', RSS, { Origin: 'https://elsewhere.example' }),
      'teo',
      BRUNO,
      imports,
      ORIGIN,
    )
    expect(elsewhere.status).toBe(403)
    expect(calls).toEqual([])
  })

  it('refuses the RSS without her consent, and a file too big, before the engine', async () => {
    const { imports, calls } = fakeImports()
    const noConsent = await importAction(
      post('/importar/teo/acao', { acao: 'rss', usuario: 'olga_farol' }),
      'teo',
      BRUNO,
      imports,
      ORIGIN,
    )
    expect(noConsent.headers.get('Location')).toBe(
      '/pessoas/teo/importar?erro=consentimento',
    )
    const big = await importAction(
      post('/importar/teo/acao', RSS, {
        Origin: ORIGIN,
        'Content-Length': String(MAX_UPLOAD_BYTES + 1),
      }),
      'teo',
      BRUNO,
      imports,
      ORIGIN,
    )
    expect(big.headers.get('Location')).toBe(
      '/pessoas/teo/importar?erro=grande',
    )
    expect(calls).toEqual([])
  })
})

describe('importAction', () => {
  it.each<[ErrorCode, ErrorReason | undefined, string]>([
    ['invalid_usage', 'trakt_user_missing', 'trakt-usuario'],
    ['source_unavailable', 'trakt_private', 'trakt-privado'],
    ['invalid_usage', 'trakt_not_linked', 'trakt-sem'],
    ['source_unavailable', 'trakt_off', 'trakt-off'],
    ['source_unavailable', undefined, 'trakt-fonte'],
  ])('says why her Trakt was not read: %s %s', async (code, reason, erro) => {
    const { imports, calls } = fakeImports({
      exitCode: 1,
      output: {
        error: {
          code,
          message: 'x',
          ...(reason !== undefined && { reason }),
        },
      },
    })
    const response = await importAction(
      post('/importar/teo/acao', { acao: 'trakt' }),
      'teo',
      BRUNO,
      imports,
      ORIGIN,
    )
    expect(response.headers.get('Location')).toBe(
      `/pessoas/teo/importar?erro=${erro}`,
    )
    expect(calls).toHaveLength(1)
  })

  it.each<[ErrorCode, string]>([
    ['invalid_file', '/pessoas/teo/importar?erro=arquivo'],
    ['invalid_usage', '/pessoas/teo/importar?erro=pedido'],
    ['missing_rss', '/pessoas/teo/importar?erro=rss'],
    ['source_unavailable', '/pessoas/teo/importar?erro=fonte'],
    ['unknown_import', '/pessoas/teo/importar?erro=item'],
    ['unknown_person', '/pessoas?erro=pessoa'],
    ['outdated_database', '/pessoas/teo/importar?erro=falha'],
  ])('says why the engine refused: %s', async (code, location) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { imports } = fakeImports(failure(code))
    const response = await importAction(
      post('/importar/teo/acao', RSS),
      'teo',
      BRUNO,
      imports,
      ORIGIN,
    )
    expect(response.headers.get('Location')).toBe(location)
    expect(log.mock.calls.length).toBe(code === 'outdated_database' ? 1 : 0)
    log.mockRestore()
  })
})

describe('queueAction', () => {
  it('records the decision as the logged-in Dono', async () => {
    const { imports, calls } = fakeImports()
    const response = await queueAction(
      post('/fila/acao', { acao: 'confirmar', id: 'x-1', filme: 'tt1' }),
      BRUNO,
      imports,
      ORIGIN,
    )
    expect(response.headers.get('Location')).toBe(
      '/meu-gosto/fila?feito=confirmado',
    )
    expect(calls).toEqual([
      {
        action: { kind: 'confirm', id: 'x-1', film: 'tt1' },
        author: { name: 'Bruno', email: 'bruno@example.org' },
      },
    ])
  })

  it('says how many films left the queue after asking TMDB again', async () => {
    const { imports } = fakeImports(undefined, {
      exitCode: 0,
      output: { notice: 'reprocessado', resolved: 2, left: 1 },
    })
    const response = await queueAction(
      post('/fila/acao', { acao: 'reprocessar' }),
      BRUNO,
      imports,
      ORIGIN,
    )
    expect(response.headers.get('Location')).toBe(
      '/meu-gosto/fila?feito=reprocessado&resolvidos=2&restam=1',
    )
  })
})

describe('queueAction', () => {
  it('refuses an incomplete form, no Dono, another site', async () => {
    const { imports, calls } = fakeImports()
    const incomplete = await queueAction(
      post('/fila/acao', { acao: 'confirmar', id: 'x-1' }),
      BRUNO,
      imports,
      ORIGIN,
    )
    expect(incomplete.headers.get('Location')).toBe(
      '/meu-gosto/fila?erro=pedido',
    )
    const anonymous = await queueAction(
      post('/fila/acao', { acao: 'reprocessar' }),
      null,
      imports,
      ORIGIN,
    )
    expect(anonymous.headers.get('Location')).toBe('/entrar')
    const elsewhere = await queueAction(
      post('/fila/acao', { acao: 'reprocessar' }, {}),
      BRUNO,
      imports,
      ORIGIN,
    )
    expect(elsewhere.status).toBe(403)
    expect(calls).toEqual([])
  })

  it.each<[ErrorCode, string]>([
    ['invalid_usage', '/meu-gosto/fila?erro=filme'],
    ['film_without_imdb', '/meu-gosto/fila?erro=sem-imdb'],
    ['item_not_queued', '/meu-gosto/fila?erro=item'],
    ['internal', '/meu-gosto/fila?erro=falha'],
  ])('says why the engine refused: %s', async (code, location) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { imports } = fakeImports(undefined, failure(code))
    const response = await queueAction(
      post('/fila/acao', { acao: 'descartar', id: 'x-1' }),
      BRUNO,
      imports,
      ORIGIN,
    )
    expect(response.headers.get('Location')).toBe(location)
    log.mockRestore()
  })
})

describe('the pages', () => {
  it('say whether the page is the Dono’s own', async () => {
    const none = { wikidata: 0, tmdb: 0, manual: 0 }
    const { imports } = fakeImports()
    const bruno: Imports = {
      ...imports,
      page: async () => ({
        exitCode: 0,
        output: {
          person: 'bruno',
          name: 'Bruno',
          imports: [],
          letterboxd: {
            person: 'bruno',
            films: 0,
            resolved: none,
            discarded: none,
            queued: 0,
            queue: [],
            discardedItems: [],
          },
          trakt: { ratings: 0, seen: 0, watchlist: 0 },
          imdb: { ratings: 0 },
          simkl: { ratings: 0, seen: 0, watchlist: 0 },
        },
      }),
    }
    expect(await importsPage('bruno', 'bruno', bruno)).toMatchObject({
      own: true,
    })
    expect(await importsPage('bruno', 'quim', bruno)).toMatchObject({
      own: false,
    })
  })

  it('give what the engine read, unknown, or null when it cannot run', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { imports } = fakeImports()
    expect(await importsPage('ninguem', 'bruno', imports)).toBe('unknown')
    expect(await importsPage('teo', 'bruno', imports)).toBeNull()
    expect(await queuePage(imports)).toBeNull()
    expect(log.mock.calls).toEqual([
      ['engine: missing_database: mensagem de missing_database'],
      ['engine: outdated_database: mensagem de outdated_database'],
    ])
    log.mockRestore()
  })
})

// --- the real engine -----------------------------------------------------------

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' })

const folderZip = (folder: string, prefix = '') =>
  zipOf(
    readdirSync(folder)
      .sort()
      .map(
        (name) => [prefix + name, readFileSync(join(folder, name))] as const,
      ),
  )

const AUTHOR = { name: 'Bruno', email: 'bruno@example.org' }
const LETTERBOXD: ImportRun = {
  kind: 'letterboxd',
  original: 'olga.zip',
  content: folderZip(join(ROOT, 'tests/fixture/letterboxd/olga')),
}
const TRAKT: ImportRun = {
  kind: 'trakt',
  original: 'trakt.zip',
  content: folderZip(join(ROOT, 'tests/fixture/trakt'), 'trakt-export/'),
}
const IMDB: ImportRun = {
  kind: 'imdb',
  original: 'ratings.csv',
  content: readFileSync(join(ROOT, 'tests/fixture/imdb/vera.csv')),
}
const SIMKL: ImportRun = {
  kind: 'simkl',
  original: 'SimklBackup.json',
  content: readFileSync(join(ROOT, 'tests/fixture/simkl/SimklBackup.json')),
}
const VENTO = 'vento-norte-2020-e2bf439e1af6'
const LOST = 'filme-perdido-2001-91d7fc73cdee'

/** The fixture with filmes-dados as a git repo, the app's `Imports` on it
 * (TMDB from the recordings), and its commits after the first. */
function useImportsRepo() {
  const fixture = useFixture()
  git(fixture.data, 'init', '--quiet', '-b', 'master')
  git(fixture.data, 'add', '--all')
  git(
    fixture.data,
    '-c',
    'user.name=fixture',
    '-c',
    'user.email=fixture@example.org',
    'commit',
    '--quiet',
    '-m',
    'initial',
  )
  const engine = makeEngine({
    ...fixture.vars,
    FILMES_GRAVACOES: RECORDINGS,
    FILMES_TMDB_CHAVE: 'chave-de-teste',
  })
  onTestFinished(() => engine.dispose())
  const imports = importsFromEngine(engine)
  const ok = async <A>(outcome: Promise<Outcome<A>>) => {
    const done = await outcome
    if (done.exitCode !== 0) throw new Error(JSON.stringify(done.output))
    return done.output
  }
  /** Each commit after the first: author and subject, no stored path. */
  const log = () =>
    git(fixture.data, 'log', '--reverse', '--format=%an <%ae>|%s')
      .trim()
      .split('\n')
      .slice(1)
      .map((line) => line.replace(/: imports\/.*$/, ''))
  return { fixture, imports, ok, log }
}

/** Each site's file once, and Letterboxd's twice: the second changes
 * nothing. */
async function importEach(run: (action: ImportRun) => Promise<ImportDone>) {
  expect(await run(LETTERBOXD)).toMatchObject({
    notice: 'letterboxd',
    facts: 14,
  })
  expect(await run(LETTERBOXD)).toEqual({
    notice: 'repetido',
    facts: 0,
    ratings: 0,
    seen: 0,
  })
  expect(await run(TRAKT)).toEqual({
    notice: 'trakt',
    facts: 3,
    ratings: 2,
    seen: 1,
    outside: 0,
  })
  expect(await run(IMDB)).toEqual({
    notice: 'imdb',
    facts: 3,
    ratings: 3,
    seen: 0,
    outside: 1,
  })
  expect(await run(SIMKL)).toMatchObject({
    notice: 'simkl',
    facts: 6,
    ratings: 3,
    seen: 2,
    outside: 2,
  })
}

describe('importsFromEngine, imports', () => {
  it('imports, reports and removes, each a commit signed by the Dono', async () => {
    const { fixture, imports, ok, log } = useImportsRepo()
    const run = (action: ImportRun) => ok(imports.run('quim', action, AUTHOR))
    await importEach(run)

    const page = await ok(imports.page('quim'))
    expect(page.imports.map((i) => [i.kind, i.original])).toEqual([
      ['letterboxd', 'olga.zip'],
      ['trakt', 'trakt.zip'],
      ['imdb', 'ratings.csv'],
      ['simkl', 'SimklBackup.json'],
    ])
    expect(page.trakt).toEqual({ ratings: 2, seen: 1, watchlist: 0 })
    expect(page.imdb).toEqual({ ratings: 3 })
    expect(page.simkl).toEqual({ ratings: 3, seen: 2, watchlist: 1 })
    expect((await ok(imports.queue())).items).toHaveLength(2)

    expect(await run({ kind: 'rss', user: 'olga_farol' })).toMatchObject({
      notice: 'rss',
    })
    const [, trakt] = page.imports
    expect(await run({ kind: 'remove', file: String(trakt?.file) })).toEqual({
      notice: 'removido',
      facts: 3,
    })
    expect(existsSync(join(fixture.data, String(trakt?.file)))).toBe(false)
    // The same file again changed nothing: no commit.
    expect(log()).toEqual([
      'Bruno <bruno@example.org>|import letterboxd quim: olga.zip',
      'Bruno <bruno@example.org>|import trakt quim: trakt.zip',
      'Bruno <bruno@example.org>|import imdb quim: ratings.csv',
      'Bruno <bruno@example.org>|import simkl quim: SimklBackup.json',
      'Bruno <bruno@example.org>|import letterboxd-rss quim: https://letterboxd.com/olga_farol/rss/',
      'Bruno <bruno@example.org>|remove import quim',
    ])
  })
})

describe('importsFromEngine, the queue', () => {
  it('shows TMDB’s suggestions and records each decision as the Dono', async () => {
    const { imports, ok, log } = useImportsRepo()
    await ok(imports.run('quim', LETTERBOXD, AUTHOR))
    const queue = await ok(imports.queue())
    expect(queue.items.map((i) => [i.id, i.name])).toEqual([
      [LOST, 'Filme Perdido'],
      [VENTO, 'Vento Norte'],
    ])
    expect(queue.names.quim).toBe('Quim')
    expect(
      queue.items[1]?.candidates.map((c) => [c.title, c.originalTitle, c.link]),
    ).toEqual([
      ['Vento Norte', null, 'https://www.themoviedb.org/movie/9102'],
      ['Vento Norte', 'Nordwind', 'https://www.themoviedb.org/movie/9103'],
    ])

    const decide = (action: QueueAction) => ok(imports.decide(action, AUTHOR))
    const film = 'https://www.themoviedb.org/movie/9102'
    const vento = { id: VENTO, title: 'Vento Norte (2020)' }
    const lost = { id: LOST, title: 'Filme Perdido (2001)' }
    expect(await decide({ kind: 'confirm', id: VENTO, film })).toEqual({
      notice: 'confirmado',
      item: vento,
    })
    // Taken back, it waits again; confirmed again for good.
    expect(await decide({ kind: 'reopen', id: VENTO })).toEqual({
      notice: 'reaberto',
      item: vento,
    })
    expect((await ok(imports.queue())).items).toHaveLength(2)
    await decide({ kind: 'confirm', id: VENTO, film })
    const discard = { kind: 'discard', id: LOST, reason: 'ignorar' } as const
    expect(await decide(discard)).toEqual({ notice: 'descartado', item: lost })
    expect(await decide(discard)).toEqual({ notice: 'igual', item: lost })
    expect(await decide({ kind: 'reprocess' })).toEqual({
      notice: 'reprocessado',
      resolved: 0,
      left: 0,
    })
    // The same decision again and a reprocess that found nothing changed
    // nothing: no commit.
    expect(log()).toEqual([
      'Bruno <bruno@example.org>|import letterboxd quim: olga.zip',
      `Bruno <bruno@example.org>|letterboxd queue confirm ${VENTO}`,
      `Bruno <bruno@example.org>|letterboxd queue reopen ${VENTO}`,
      `Bruno <bruno@example.org>|letterboxd queue confirm ${VENTO}`,
      `Bruno <bruno@example.org>|letterboxd queue discard ${LOST}`,
    ])
  })
})

describe('importsFromEngine, what does not go', () => {
  it('passes on the engine’s refusal, and a decision taken twice is the same', async () => {
    const { imports, ok } = useImportsRepo()
    const unknown = await imports.run('ninguem', LETTERBOXD, AUTHOR)
    expect(unknown.exitCode).not.toBe(0)
    const sync = await imports.run(
      'quim',
      { kind: 'trakt-sync', user: null },
      AUTHOR,
    )
    expect(sync.exitCode).not.toBe(0)
    await ok(imports.run('quim', LETTERBOXD, AUTHOR))
    const film = 'https://www.themoviedb.org/movie/9102'
    const confirm = { kind: 'confirm', id: VENTO, film } as const
    await ok(imports.decide(confirm, AUTHOR))
    expect(await ok(imports.decide(confirm, AUTHOR))).toMatchObject({
      notice: 'igual',
    })
  })
})
