import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeEngine, type ErrorCode, type Outcome } from '@filmes/engine'
import { describe, expect, it, vi } from 'vite-plus/test'
import { ROOT, useFixture } from '../../../packages/engine/test/fixture.ts'
import { zipOf } from '../../../packages/engine/test/imports/zip.ts'
import {
  MAX_UPLOAD_BYTES,
  parseImport,
  parseQueue,
  type ImportAction,
  type QueueAction,
} from '#/content/import-action'
import {
  importAction,
  importsFromEngine,
  importsOverview,
  importsPage,
  queueAction,
  queuePage,
  type ImportDone,
  type Imports,
  type QueueDone,
} from './imports'
import type { Owner } from './owners'

const BRUNO: Owner = {
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

describe('parseImport', () => {
  it('reads an upload with its name and bytes', async () => {
    expect(
      await parseImport(form({ acao: 'letterboxd', arquivo: zipFile() })),
    ).toEqual({
      kind: 'letterboxd',
      original: 'export.zip',
      content: new Uint8Array([80, 75, 3, 4]),
    })
    expect(
      await parseImport(form({ acao: 'trakt', arquivo: zipFile('t.zip') })),
    ).toMatchObject({ kind: 'trakt', original: 't.zip' })
  })

  it.each<[Record<string, string | Blob>, ImportAction | string]>([
    [{ acao: 'letterboxd' }, 'arquivo'],
    [{ acao: 'trakt', arquivo: zipFile('vazio.zip', []) }, 'arquivo'],
    [
      { acao: 'rss', usuario: 'olga_farol', consentimento: 'sim' },
      { kind: 'rss', user: 'olga_farol' },
    ],
    [{ acao: 'rss', usuario: 'olga_farol' }, 'consentimento'],
    [{ acao: 'rss', usuario: 'olga farol', consentimento: 'sim' }, 'pedido'],
    [{ acao: 'rss', consentimento: 'sim' }, 'pedido'],
    [
      { acao: 'remover', arquivo: ' imports/teo/trakt-1.zip ' },
      { kind: 'remove', file: 'imports/teo/trakt-1.zip' },
    ],
    [{ acao: 'remover' }, 'pedido'],
    [{ acao: 'outra' }, 'pedido'],
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
    overview: async () => ({
      exitCode: 0,
      output: {
        people: [{ person: 'teo', name: 'Teo', owner: false, imports: 1 }],
        queued: 2,
      },
    }),
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
      '/importar/teo?feito=letterboxd&novos=12',
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
      post('/importar/teo/acao', { acao: 'trakt', arquivo: zipFile() }),
      'teo',
      BRUNO,
      imports,
      ORIGIN,
    )
    expect(response.headers.get('Location')).toBe(
      '/importar/teo?feito=trakt&novos=3&fora=2',
    )
  })

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
      '/importar/teo?erro=consentimento',
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
    expect(big.headers.get('Location')).toBe('/importar/teo?erro=grande')
    expect(calls).toEqual([])
  })

  it.each<[ErrorCode, string]>([
    ['invalid_file', '/importar/teo?erro=arquivo'],
    ['invalid_usage', '/importar/teo?erro=pedido'],
    ['missing_rss', '/importar/teo?erro=rss'],
    ['source_unavailable', '/importar/teo?erro=fonte'],
    ['unknown_import', '/importar/teo?erro=item'],
    ['unknown_person', '/importar?erro=pessoa'],
    ['outdated_database', '/importar/teo?erro=indisponivel'],
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
    expect(response.headers.get('Location')).toBe('/fila?feito=confirmado')
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
      '/fila?feito=reprocessado&resolvidos=2&restam=1',
    )
  })

  it('refuses an incomplete form, no Dono, another site', async () => {
    const { imports, calls } = fakeImports()
    const incomplete = await queueAction(
      post('/fila/acao', { acao: 'confirmar', id: 'x-1' }),
      BRUNO,
      imports,
      ORIGIN,
    )
    expect(incomplete.headers.get('Location')).toBe('/fila?erro=pedido')
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
    ['invalid_usage', '/fila?erro=filme'],
    ['film_without_imdb', '/fila?erro=sem-imdb'],
    ['item_not_queued', '/fila?erro=item'],
    ['internal', '/fila?erro=indisponivel'],
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
  it('give what the engine read, unknown, or null when it cannot run', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { imports } = fakeImports()
    expect(await importsOverview(imports)).toEqual({
      people: [{ person: 'teo', name: 'Teo', owner: false, imports: 1 }],
      queued: 2,
    })
    expect(await importsPage('ninguem', imports)).toBe('unknown')
    expect(await importsPage('teo', imports)).toBeNull()
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

describe('importsFromEngine', () => {
  it('imports, decides the queue and removes, each a commit signed by the Dono', async () => {
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
    const author = { name: 'Bruno', email: 'bruno@example.org' }
    const ok = async <A>(outcome: Promise<Outcome<A>>) => {
      const done = await outcome
      if (done.exitCode !== 0) throw new Error(JSON.stringify(done.output))
      return done.output
    }
    try {
      const imports = importsFromEngine(engine)
      const letterboxd = folderZip(join(ROOT, 'tests/fixture/letterboxd/olga'))
      expect(
        await ok(
          imports.run(
            'quim',
            { kind: 'letterboxd', original: 'olga.zip', content: letterboxd },
            author,
          ),
        ),
      ).toEqual({ notice: 'letterboxd', facts: 14 })
      expect(
        await ok(
          imports.run(
            'quim',
            { kind: 'letterboxd', original: 'olga.zip', content: letterboxd },
            author,
          ),
        ),
      ).toEqual({ notice: 'repetido', facts: 0 })
      expect(
        await ok(
          imports.run(
            'quim',
            {
              kind: 'trakt',
              original: 'trakt.zip',
              content: folderZip(
                join(ROOT, 'tests/fixture/trakt'),
                'trakt-export/',
              ),
            },
            author,
          ),
        ),
      ).toEqual({ notice: 'trakt', facts: 3, outside: 0 })

      const page = await ok(imports.page('quim'))
      expect(page.imports.map((i) => [i.kind, i.original])).toEqual([
        ['letterboxd', 'olga.zip'],
        ['trakt', 'trakt.zip'],
      ])
      expect(page.trakt).toEqual({ ratings: 2, seen: 1 })

      const overview = await ok(imports.overview())
      expect(overview.people.find((p) => p.person === 'quim')?.imports).toBe(2)
      expect(overview.queued).toBe(2)

      const queue = await ok(imports.queue())
      expect(queue.items.map((i) => i.name)).toEqual([
        'Filme Perdido',
        'Vento Norte',
      ])
      expect(queue.names.quim).toBe('Quim')
      const vento = queue.items[1]
      expect(vento?.candidates.map((c) => [c.title, c.originalTitle])).toEqual([
        ['Vento Norte', null],
        ['Vento Norte', 'Nordwind'],
      ])
      expect(
        await ok(
          imports.decide(
            {
              kind: 'confirm',
              id: vento?.id ?? '',
              film: vento?.candidates[0]?.link ?? '',
            },
            author,
          ),
        ),
      ).toEqual({ notice: 'confirmado' })
      const lost = queue.items[0]?.id ?? ''
      expect(
        await ok(
          imports.decide(
            { kind: 'discard', id: lost, reason: 'ignorar' },
            author,
          ),
        ),
      ).toEqual({ notice: 'descartado' })
      expect(
        await ok(
          imports.decide(
            { kind: 'discard', id: lost, reason: 'ignorar' },
            author,
          ),
        ),
      ).toEqual({ notice: 'igual' })
      expect(await ok(imports.decide({ kind: 'reprocess' }, author))).toEqual({
        notice: 'reprocessado',
        resolved: 0,
        left: 0,
      })

      expect(
        await ok(
          imports.run('quim', { kind: 'rss', user: 'olga_farol' }, author),
        ),
      ).toMatchObject({ notice: 'rss' })
      const trakt = page.imports[1]?.file ?? ''
      expect(
        await ok(imports.run('quim', { kind: 'remove', file: trakt }, author)),
      ).toEqual({ notice: 'removido', facts: 3 })
      expect(existsSync(join(fixture.data, trakt))).toBe(false)

      const log = git(fixture.data, 'log', '--reverse', '--format=%an <%ae>|%s')
        .trim()
        .split('\n')
        .slice(1)
      // The same file again, the same decision again and a reprocess that
      // found nothing changed nothing: no commit.
      expect(log.map((line) => line.replace(/: imports\/.*$/, ''))).toEqual([
        'Bruno <bruno@example.org>|import letterboxd quim: olga.zip',
        'Bruno <bruno@example.org>|import trakt quim: trakt.zip',
        `Bruno <bruno@example.org>|letterboxd queue confirm ${vento?.id}`,
        `Bruno <bruno@example.org>|letterboxd queue discard ${lost}`,
        'Bruno <bruno@example.org>|import letterboxd-rss quim: https://letterboxd.com/olga_farol/rss/',
        'Bruno <bruno@example.org>|remove import quim',
      ])
    } finally {
      await engine.dispose()
    }
  })
})
