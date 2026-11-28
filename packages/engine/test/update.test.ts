// `atualizar` (tests/test_ingestao.py, the update cases): the dumps pinned
// by date and SHA-256, the manifest kept when a download fails, and the
// per-property WDQS fallback. Python's tests read the recorded dumps
// (`FILMES_GRAVACOES`); the network path runs on a fake `fetch` that serves
// the same recordings.
import { createHash } from 'node:crypto'
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { crc32, gunzipSync, gzipSync } from 'node:zlib'
import { Effect } from 'effect'
import { expect, test } from 'vite-plus/test'
import {
  consult,
  rebuild,
  update,
  type Outcome,
  type UpdateProgress,
} from '../src/index.ts'
import { ROOT, useFixture, type Fixture } from './fixture.ts'

const RECORDED = join(ROOT, 'tests/fixture/gravacoes')
const RECORDED_DUMPS = join(RECORDED, 'catalogo')
const RECORDED_WIKIPEDIA = join(RECORDED, 'wikipedia')

const ALL_DUMPS = [
  'title.basics.tsv.gz',
  'title.ratings.tsv.gz',
  'wikidata-ids.json.gz',
  'wikidata-conteudo.json.gz',
  'wikidata-elenco.json.gz',
  'wikidata-rotulos.json.gz',
  'ml-32m.zip',
  'genome_2021.zip',
  'title.principals.tsv.gz',
  'wikidata-atores.json.gz',
  'wikidata-series.json.gz',
  'wikidata-subgeneros.json.gz',
  'wikidata-colecao.json.gz',
  'wikipedia-competicoes.json.gz',
]

interface Catalog {
  readonly fixture: Fixture
  readonly catalog: string
  readonly manifest: string
  readonly vars: Record<string, string | undefined>
}

/** `catalogo_real`: an empty catalog and no manifest, the recordings as
 * the network (`'network'`: none, for a fake `fetch`). */
function useCatalog(from: 'recordings' | 'network' = 'recordings'): Catalog {
  const fixture = useFixture()
  const catalog = join(fixture.root, 'dumps')
  const manifest = join(fixture.root, 'versions.json')
  return {
    fixture,
    catalog,
    manifest,
    vars: {
      FILMES_CATALOGO: catalog,
      FILMES_VERSOES: manifest,
      FILMES_GRAVACOES: from === 'recordings' ? RECORDED : undefined,
    },
  }
}

/** A copy of the recordings to change, in the test's folder. */
function copyRecordings(fixture: Fixture): string {
  const recordings = join(fixture.root, 'recordings')
  cpSync(RECORDED_DUMPS, join(recordings, 'catalogo'), { recursive: true })
  return recordings
}

const pinned = (manifest: string) =>
  (
    JSON.parse(readFileSync(manifest, 'utf8')) as {
      dumps: Record<string, Record<string, unknown>>
    }
  ).dumps

const errorOf = (outcome: Outcome<unknown>) => {
  expect(outcome.exitCode).toBe(1)
  return (outcome.output as { error: { code: string; message: string } }).error
}

const rows = async (catalog: Catalog, sql: string) =>
  (await catalog.fixture.ok(consult(sql), catalog.vars)).rows

test('pins the dumps by date and hash', async () => {
  const catalog = useCatalog()

  const updated = await catalog.fixture.ok(update(), catalog.vars)

  const dumps = pinned(catalog.manifest)
  expect(updated.dumps).toEqual(dumps)
  expect(updated.versions).toBe(catalog.manifest)
  expect(new Set(Object.keys(dumps))).toEqual(new Set(ALL_DUMPS))
  for (const [name, dump] of Object.entries(dumps)) {
    expect(dump['date']).toBe(
      { 'ml-32m.zip': '2023-10-13', 'genome_2021.zip': '2021-12-30' }[name] ??
        '2026-11-20',
    )
    const bytes = readFileSync(
      join(catalog.catalog, String(dump['sha256']), name),
    )
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      dump['sha256'],
    )
    expect(dump['bytes']).toBe(bytes.length)
  }
})

test('writes the manifest with sorted keys and English names', async () => {
  const catalog = useCatalog()
  await catalog.fixture.ok(update(), catalog.vars)

  const text = readFileSync(catalog.manifest, 'utf8')
  const basics = pinned(catalog.manifest)['title.basics.tsv.gz']!

  expect(Object.keys(basics)).toEqual([
    'bytes',
    'date',
    'sha256',
    'source',
    'url',
  ])
  expect(basics['source']).toBe('IMDb')
  expect(basics['url']).toBe('https://datasets.imdbws.com/title.basics.tsv.gz')
  expect(text.endsWith('}\n')).toBe(true)
  expect(text.startsWith('{\n  "dumps": {\n    "genome_2021.zip": {')).toBe(
    true,
  )
})

test('what it pins is what rebuild reads', async () => {
  const catalog = useCatalog()
  await catalog.fixture.ok(update(), catalog.vars)

  await catalog.fixture.ok(rebuild, catalog.vars)

  expect(await rows(catalog, 'SELECT id FROM filmes ORDER BY id')).toEqual([
    ['tt0000009'],
    ['tt0017839'],
    ['tt0108052'],
    ['tt0133093'],
  ])
})

test('reports its progress, step by step', async () => {
  const catalog = useCatalog()
  const events: UpdateProgress[] = []

  await catalog.fixture.ok(
    update({
      onProgress: (event) => Effect.sync(() => events.push(event)),
    }),
    catalog.vars,
  )

  expect(events[0]).toEqual({
    progress: 0,
    total: 14,
    message: 'Baixando ml-32m.zip',
  })
  expect(events).toContainEqual({
    progress: 5,
    total: 14,
    message: 'Consultando o QLever (ids)',
  })
  expect(events).toContainEqual({
    progress: 12,
    total: 14,
    message: 'Lendo as competições na Wikipedia',
  })
  expect(events).toContainEqual({
    progress: 13,
    total: 14,
    message: 'Consultando o QLever (rótulos)',
  })
  expect(events.at(-1)).toEqual({
    progress: 14,
    total: 14,
    message: 'Versões do Catálogo gravadas',
  })
})

test('keeps the manifest when the GroupLens ZIP fails', async () => {
  const catalog = useCatalog()
  await catalog.fixture.ok(update(), catalog.vars)
  const before = readFileSync(catalog.manifest)
  const recordings = copyRecordings(catalog.fixture)
  writeFileSync(
    join(recordings, 'catalogo', 'genome_2021.zip'),
    'zip incompleto',
  )

  const error = errorOf(
    await catalog.fixture.run(update(), {
      ...catalog.vars,
      FILMES_GRAVACOES: recordings,
    }),
  )

  expect(error.code).toBe('update_failed')
  expect(error.message).toBe('genome_2021.zip: File is not a zip file')
  expect(readFileSync(catalog.manifest)).toEqual(before)
})

test('a GroupLens ZIP without a member the loading reads fails', async () => {
  const catalog = useCatalog('network')
  const recordings = copyRecordings(catalog.fixture)
  // ml-32m.zip in the place of the genome: no genome member.
  cpSync(
    join(RECORDED_DUMPS, 'ml-32m.zip'),
    join(recordings, 'catalogo', 'genome_2021.zip'),
  )

  const error = errorOf(
    await catalog.fixture.run(update(), {
      ...catalog.vars,
      FILMES_GRAVACOES: recordings,
    }),
  )

  expect(error.message).toBe(
    `genome_2021.zip: "There is no item named 'movie_dataset_public_final/raw/metadata.json' in the archive"`,
  )
  expect(existsSync(catalog.manifest)).toBe(false)
})

test('an IMDb dump with another header fails', async () => {
  const catalog = useCatalog()
  const recordings = copyRecordings(catalog.fixture)
  writeFileSync(join(recordings, 'catalogo', 'title.ratings.tsv'), 'id\tx\n')

  const error = errorOf(
    await catalog.fixture.run(update(), {
      ...catalog.vars,
      FILMES_GRAVACOES: recordings,
    }),
  )

  expect(error).toEqual({
    code: 'update_failed',
    message: 'cabeçalho inesperado em title.ratings.tsv.gz',
  })
})

test('a SPARQL row without its fields fails', async () => {
  const catalog = useCatalog()
  const recordings = copyRecordings(catalog.fixture)
  writeFileSync(
    join(recordings, 'catalogo', 'wikidata-rotulos.json'),
    JSON.stringify({ results: { bindings: [{ pt: { value: 'x' } }] } }),
  )

  const error = errorOf(
    await catalog.fixture.run(update(), {
      ...catalog.vars,
      FILMES_GRAVACOES: recordings,
    }),
  )

  expect(error.message).toBe(
    'linha SPARQL sem os campos esperados em wikidata-rotulos.json.gz',
  )
})

test('a missing recording fails with the path', async () => {
  const catalog = useCatalog()
  const recordings = join(catalog.fixture.root, 'nothing')

  const error = errorOf(
    await catalog.fixture.run(update(), {
      ...catalog.vars,
      FILMES_GRAVACOES: recordings,
    }),
  )

  expect(error.message).toBe(
    `ml-32m.zip: [Errno 2] No such file or directory: '${join(recordings, 'catalogo', 'ml-32m.zip')}'`,
  )
})

test('takes the ids by property from the WDQS when QLever gives incomplete JSON', async () => {
  const catalog = useCatalog()
  const recordings = copyRecordings(catalog.fixture)
  const folder = join(recordings, 'catalogo')
  const ids = JSON.parse(
    readFileSync(join(folder, 'wikidata-ids.json'), 'utf8'),
  ) as { results: { bindings: Array<{ p: { value: string } }> } }
  writeFileSync(join(folder, 'wikidata-ids.json'), '{"results":{"bindings":[')
  for (const property of ['P345', 'P4947', 'P6127', 'P4983', 'P577'])
    writeFileSync(
      join(folder, `wikidata-ids-${property}.json`),
      JSON.stringify({
        results: {
          bindings: ids.results.bindings.filter((row) =>
            row.p.value.endsWith(`/${property}`),
          ),
        },
      }),
    )
  const vars = { ...catalog.vars, FILMES_GRAVACOES: recordings }

  await catalog.fixture.ok(update(), vars)
  await catalog.fixture.ok(rebuild, vars)

  const dumps = pinned(catalog.manifest)
  expect(dumps['wikidata-ids.json.gz']).toBeUndefined()
  expect(
    Object.entries(dumps)
      .filter(([name]) => name.startsWith('wikidata-ids-'))
      .map(([, dump]) => dump['source']),
  ).toEqual(['WDQS', 'WDQS', 'WDQS', 'WDQS', 'WDQS'])
  expect(
    await rows(
      catalog,
      "SELECT imdb, ano FROM slugs_letterboxd WHERE slug = 'schindlers-list'",
    ),
  ).toEqual([['tt0108052', 1993]])
})

test('refuses a catalog inside the code repository', async () => {
  const catalog = useCatalog()

  const error = errorOf(
    await catalog.fixture.run(update(), {
      ...catalog.vars,
      FILMES_CATALOGO: join(ROOT, 'tests/fixture/catalogo-novo'),
    }),
  )

  expect(error).toEqual({
    code: 'invalid_config',
    message: 'ponha FILMES_CATALOGO fora do repositório de código',
  })
  expect(existsSync(join(ROOT, 'tests/fixture/catalogo-novo'))).toBe(false)
})

// The network, faked: the recordings served as the real hosts would.

interface Asked {
  readonly url: URL
  readonly method: string
  readonly headers: Headers
  readonly query: string | undefined
}

type Answer = (asked: Asked) => Response | undefined

const recorded = (name: string) => readFileSync(join(RECORDED_DUMPS, name))

const sparqlJson = (bindings: unknown[]) =>
  new Response(JSON.stringify({ results: { bindings } }))

/** Which recorded group a query asks (by its scope and properties). */
const groupOf = (query: string): string => {
  if (query.includes('wdt:P161 ?item')) return 'atores'
  if (query.includes('wdt:P179 ?item')) return 'series'
  if (query.includes('wdt:P136/wdt:P279*')) return 'subgeneros'
  if (query.includes('?slug')) return 'ids'
  if (/VALUES \?p \{ wdt:P161 \}/.test(query)) return 'elenco'
  if (query.includes('wdt:P9584')) return 'colecao'
  return 'conteudo'
}

/** The recorded label rows of the items asked, and a bare row for an item
 * the recording lacks. */
const labelRows = (query: string) => {
  const recordedRows = (
    JSON.parse(recorded('wikidata-rotulos.json').toString()) as {
      results: { bindings: Array<{ valor: { value: string } }> }
    }
  ).results.bindings
  const asked = /VALUES \?valor \{ ([^}]*) \}/.exec(query)![1]!.split(' ')
  return asked.map((item) => {
    const value = `http://www.wikidata.org/entity/${item.slice(3)}`
    return (
      recordedRows.find((row) => row.valor.value === value) ?? {
        valor: { type: 'uri', value },
      }
    )
  })
}

/** The recorded English Wikipedia: each article's revision and wikitext,
 * the redirects and each page's Wikidata item. */
interface RecordedWikipedia {
  readonly pages: Record<string, { revid: number; content: string }>
  readonly redirects: Record<string, string>
  readonly items: Record<string, string>
}

/** The MediaWiki API over the recording: titles normalized (`_` to space)
 * and redirected; the revisions one page per answer, with `continue`. */
const wikipedia = (url: URL): Response => {
  const recording = JSON.parse(
    readFileSync(join(RECORDED_WIKIPEDIA, 'api.json'), 'utf8'),
  ) as RecordedWikipedia
  const asked = url.searchParams.get('titles')!.split('|')
  const normalized = asked
    .filter((title) => title.includes('_'))
    .map((from) => ({ from, to: from.replaceAll('_', ' ') }))
  const named = asked.map((title) => title.replaceAll('_', ' '))
  const redirects = named
    .filter((title) => title in recording.redirects)
    .map((from) => ({ from, to: recording.redirects[from]! }))
  const titles = [
    ...new Set(named.map((title) => recording.redirects[title] ?? title)),
  ]
  const query = (pages: unknown[]) => ({ normalized, redirects, pages })
  if (url.searchParams.get('prop') === 'pageprops')
    return Response.json({
      query: query(
        titles.map((title) =>
          title in recording.items
            ? { title, pageprops: { wikibase_item: recording.items[title] } }
            : { title, missing: true },
        ),
      ),
    })
  const at = Number(url.searchParams.get('rvcontinue') ?? 0)
  const title = titles[at]!
  const page = recording.pages[title]
  return Response.json({
    ...(at + 1 < titles.length && {
      continue: { rvcontinue: String(at + 1), continue: '||' },
    }),
    query: query([
      page === undefined
        ? { title, missing: true }
        : {
            title,
            revisions: [
              { revid: page.revid, slots: { main: { content: page.content } } },
            ],
          },
    ]),
  })
}

const hosts: Answer = ({ url, query }) => {
  if (url.host === 'datasets.imdbws.com')
    return new Response(
      gzipSync(recorded(url.pathname.slice(1).replace(/\.gz$/, ''))),
      { headers: { 'x-amz-meta-run-date': '2026-11-19' } },
    )
  if (url.host === 'files.grouplens.org')
    return new Response(recorded(url.pathname.split('/').at(-1)!))
  if (url.host === 'en.wikipedia.org') return wikipedia(url)
  if (query === undefined) return undefined
  if (query.includes('VALUES ?valor')) return sparqlJson(labelRows(query))
  if (query.includes('schema:about'))
    return new Response(readFileSync(join(RECORDED_WIKIPEDIA, 'edicoes.json')))
  return new Response(recorded(`wikidata-${groupOf(query)}.json`))
}

/** A `fetch` that answers with `answers` in order, then `hosts`, and keeps
 * every request. */
function fakeFetch(...answers: Answer[]) {
  const asked: Asked[] = []
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input)
    const body = typeof init?.body === 'string' ? init.body : null
    const query =
      (body === null ? url.searchParams : new URLSearchParams(body)).get(
        'query',
      ) ?? undefined
    const request: Asked = {
      url,
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      query,
    }
    asked.push(request)
    for (const answer of answers) {
      const response = answer(request)
      if (response !== undefined) return response
    }
    return hosts(request) ?? new Response('', { status: 404 })
  }) as typeof globalThis.fetch
  return { fetch, asked }
}

test('downloads every dump and pins the IMDb run date', async () => {
  const catalog = useCatalog('network')
  const { fetch, asked } = fakeFetch()

  const updated = await catalog.fixture.ok(update({ fetch }), catalog.vars)

  expect(new Set(Object.keys(updated.dumps))).toEqual(new Set(ALL_DUMPS))
  expect(updated.dumps['title.basics.tsv.gz']?.date).toBe('2026-11-19')
  expect(updated.dumps['wikidata-ids.json.gz']).toMatchObject({
    date: '2026-11-20',
    source: 'QLever',
    url: 'https://qlever.dev/api/wikidata',
  })
  expect(updated.dumps['wikidata-rotulos.json.gz']).toMatchObject({
    source: 'QLever',
  })
  expect(
    asked.every(
      (request) =>
        request.headers.get('User-Agent') ===
        'filmes/0.1 (https://github.com/YgorPerez/filmes)',
    ),
  ).toBe(true)
  const labels = asked.filter((request) =>
    request.query?.includes('VALUES ?valor'),
  )
  expect(labels.map((request) => request.method)).toEqual(['POST'])
  expect(labels[0]!.headers.get('Content-Type')).toBe(
    'application/x-www-form-urlencoded',
  )
  await catalog.fixture.ok(rebuild, catalog.vars)
  expect(
    await rows(
      catalog,
      "SELECT r.en FROM arestas a JOIN rotulos_wikidata r ON r.item = a.entidade_id WHERE a.filme_id = 'tt0108052' AND a.predicado = 'diretor'",
    ),
  ).toEqual([['Steven Spielberg']])
})

test('builds the festival competitions from the edition articles (#411)', async () => {
  const catalog = useCatalog('network')
  const { fetch, asked } = fakeFetch()

  const updated = await catalog.fixture.ok(update({ fetch }), catalog.vars)

  expect(updated.dumps['wikipedia-competicoes.json.gz']).toMatchObject({
    date: '2026-11-20',
    source: 'Wikipedia',
    url: 'https://en.wikipedia.org/w/api.php',
  })
  const api = asked.filter((request) => request.url.host === 'en.wikipedia.org')
  expect(api.length).toBeGreaterThan(0)
  for (const request of api) {
    expect(request.url.searchParams.get('formatversion')).toBe('2')
    expect(
      request.url.searchParams.get('titles')!.split('|').length,
    ).toBeLessThanOrEqual(50)
  }
  // The competition inside the official selection, not the jury's or Un
  // Certain Regard's films; the 66th Berlinale's main competition without
  // the sections under it; no competition in Venice 1969 nor in Cannes 2020.
  await catalog.fixture.ok(rebuild, catalog.vars)
  expect(
    await rows(
      catalog,
      "SELECT filme_id, entidade_id, fonte FROM arestas WHERE predicado = 'competicao' ORDER BY filme_id",
    ),
  ).toEqual([
    ['tt0108052', 'Q42369', 'Wikipedia'],
    ['tt0133093', 'Q130871', 'Wikipedia'],
  ])
  expect(
    await rows(
      catalog,
      "SELECT filme_id, entidade_id FROM arestas WHERE predicado = 'colecao'",
    ),
  ).toEqual([['tt0133093', 'Q1204187']])
})

test('builds the same competitions dump the recordings hold (#411)', async () => {
  const network = useCatalog('network')
  const { fetch } = fakeFetch()
  const built = await network.fixture.ok(update({ fetch }), network.vars)
  const recorded = useCatalog()
  const pinnedDumps = await recorded.fixture.ok(update(), recorded.vars)

  const editions = (catalog: Catalog, sha256: string) =>
    JSON.parse(
      gunzipSync(
        readFileSync(
          join(catalog.catalog, sha256, 'wikipedia-competicoes.json.gz'),
        ),
      ).toString('utf8'),
    ) as unknown
  expect(
    editions(network, built.dumps['wikipedia-competicoes.json.gz']!.sha256),
  ).toEqual(
    editions(
      recorded,
      pinnedDumps.dumps['wikipedia-competicoes.json.gz']!.sha256,
    ),
  )
})

test('the series query asks which root each class falls under (#165)', async () => {
  const catalog = useCatalog('network')
  const { fetch, asked } = fakeFetch()

  await catalog.fixture.ok(update({ fetch }), catalog.vars)

  const series = asked.filter(
    (request) => request.query && groupOf(request.query) === 'series',
  )
  expect(series.length).toBeGreaterThan(0)
  for (const request of series)
    expect(request.query).toContain('SELECT DISTINCT ?item ?p ?valor ?raiz')
  await catalog.fixture.ok(rebuild, catalog.vars)
  expect(
    await rows(catalog, 'SELECT item, raiz FROM series_de_filmes'),
  ).toEqual([['Q1210827', 'Q24856']])
})

test('tries a busy host again after its Retry-After', async () => {
  const catalog = useCatalog('network')
  let busy = 2
  const { fetch, asked } = fakeFetch(({ url }) =>
    url.host === 'files.grouplens.org' && busy-- > 0
      ? new Response('', { status: 503, headers: { 'Retry-After': '0' } })
      : undefined,
  )

  await catalog.fixture.ok(update({ fetch }), catalog.vars)

  expect(
    asked.filter((request) => request.url.pathname.endsWith('/ml-32m.zip')),
  ).toHaveLength(3)
})

test('a host that stays busy fails the update after three tries', async () => {
  const catalog = useCatalog('network')
  const { fetch, asked } = fakeFetch(({ url }) =>
    url.host === 'datasets.imdbws.com'
      ? new Response('', {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'Retry-After': '0' },
        })
      : undefined,
  )

  const error = errorOf(
    await catalog.fixture.run(update({ fetch }), catalog.vars),
  )

  expect(error).toEqual({
    code: 'update_failed',
    message: 'HTTP Error 429: Too Many Requests',
  })
  expect(
    asked.filter((request) => request.url.host === 'datasets.imdbws.com'),
  ).toHaveLength(3)
  expect(existsSync(catalog.manifest)).toBe(false)
})

test('an answer that is not retried fails at once', async () => {
  const catalog = useCatalog('network')
  const { fetch, asked } = fakeFetch(({ url }) =>
    url.pathname.endsWith('/genome_2021.zip')
      ? new Response('', { status: 404, statusText: 'Not Found' })
      : undefined,
  )

  const error = errorOf(
    await catalog.fixture.run(update({ fetch }), catalog.vars),
  )

  expect(error.message).toBe('genome_2021.zip: HTTP Error 404: Not Found')
  expect(
    asked.filter((request) => request.url.pathname.endsWith('genome_2021.zip')),
  ).toHaveLength(1)
})

test('labels QLever leaves out come from the WDQS, and the manifest says so', async () => {
  const catalog = useCatalog('network')
  const { fetch, asked } = fakeFetch(({ url, query }) =>
    url.host === 'qlever.dev' && query?.includes('VALUES ?valor')
      ? sparqlJson([])
      : undefined,
  )

  const updated = await catalog.fixture.ok(update({ fetch }), catalog.vars)

  expect(updated.dumps['wikidata-rotulos.json.gz']).toMatchObject({
    source: 'QLever e WDQS',
    url: 'https://qlever.dev/api/wikidata',
    fallback: 'https://query.wikidata.org/sparql',
  })
  expect(pinned(catalog.manifest)['wikidata-rotulos.json.gz']).toMatchObject({
    fallback: 'https://query.wikidata.org/sparql',
  })
  expect(
    asked.filter(
      (request) =>
        request.url.host === 'query.wikidata.org' &&
        request.query?.includes('VALUES ?valor'),
    ),
  ).toHaveLength(1)
  await catalog.fixture.ok(rebuild, catalog.vars)
})

test('a group QLever fails is asked to the WDQS by property', async () => {
  const catalog = useCatalog('network')
  const recordedIds = JSON.parse(recorded('wikidata-ids.json').toString()) as {
    results: { bindings: Array<{ p: { value: string } }> }
  }
  const { fetch } = fakeFetch(({ url, query }) => {
    if (query === undefined || groupOf(query) !== 'ids') return undefined
    if (url.host === 'qlever.dev')
      return new Response('', { status: 500, statusText: 'Server Error' })
    const property = /VALUES \?p \{ wdt:(P[0-9]+) \}/.exec(query)![1]!
    return sparqlJson(
      recordedIds.results.bindings.filter((row) =>
        row.p.value.endsWith(`/${property}`),
      ),
    )
  })
  const events: UpdateProgress[] = []

  const updated = await catalog.fixture.ok(
    update({ fetch, onProgress: (e) => Effect.sync(() => events.push(e)) }),
    catalog.vars,
  )

  expect(
    Object.keys(updated.dumps).filter((name) =>
      name.startsWith('wikidata-ids'),
    ),
  ).toEqual([
    'wikidata-ids-P345.json.gz',
    'wikidata-ids-P4947.json.gz',
    'wikidata-ids-P6127.json.gz',
    'wikidata-ids-P4983.json.gz',
    'wikidata-ids-P577.json.gz',
  ])
  expect(events).toContainEqual({
    progress: 5.1,
    total: 14,
    message:
      'QLever falhou (ids): HTTP Error 500: Server Error. Consultando o WDQS por predicado.',
  })
})

/** The update over the recordings with one of them replaced by `bytes`. */
async function failWithRecording(
  catalog: Catalog,
  name: string,
  bytes: string | Buffer,
) {
  const recordings = copyRecordings(catalog.fixture)
  writeFileSync(join(recordings, 'catalogo', name), bytes)
  return errorOf(
    await catalog.fixture.run(update(), {
      ...catalog.vars,
      FILMES_GRAVACOES: recordings,
    }),
  )
}

test('an IMDb dump shorter than its header fails', async () => {
  expect(
    await failWithRecording(useCatalog(), 'title.basics.tsv', 'tcon'),
  ).toEqual({
    code: 'update_failed',
    message: 'cabeçalho inesperado em title.basics.tsv.gz',
  })
})

test('a competitions dump of another shape fails (#411)', async () => {
  expect(
    await failWithRecording(
      useCatalog(),
      'wikipedia-competicoes.json',
      '{"editions":[{"festival":"Cannes"}]}',
    ),
  ).toEqual({
    code: 'update_failed',
    message: 'wikipedia-competicoes.json.gz fora do formato',
  })
})

test('a SPARQL result that is not UTF-8 fails', async () => {
  const error = await failWithRecording(
    useCatalog(),
    'wikidata-rotulos.json',
    Buffer.from([0x7b, 0xff, 0x7d]),
  )

  expect(error.code).toBe('update_failed')
  expect(error.message).toMatch(/^'utf-8' codec can't decode/)
})

test('a SPARQL row that is not JSON fails', async () => {
  const error = await failWithRecording(
    useCatalog(),
    'wikidata-rotulos.json',
    '{"results":{"bindings":[{"valor": nope}]}}',
  )

  expect(error.code).toBe('update_failed')
})

test('a downloaded IMDb dump cut short or not gzip fails', async () => {
  const basics = gzipSync(recorded('title.basics.tsv'))
  for (const [body, message] of [
    [
      basics.subarray(0, basics.length - 20),
      'Compressed file ended before the end-of-stream marker was reached',
    ],
    [Buffer.from('not gzip at all'), /header/],
  ] as const) {
    const catalog = useCatalog('network')
    const { fetch } = fakeFetch(({ url }) =>
      url.pathname === '/title.basics.tsv.gz' ? new Response(body) : undefined,
    )

    const error = errorOf(
      await catalog.fixture.run(update({ fetch }), catalog.vars),
    )

    expect(error.code).toBe('update_failed')
    expect(error.message).toMatch(message)
  }
})

test('an IMDb answer without its run date is pinned with today', async () => {
  const catalog = useCatalog('network')
  const { fetch } = fakeFetch(({ url }) =>
    url.host === 'datasets.imdbws.com'
      ? new Response(
          gzipSync(recorded(url.pathname.slice(1).replace(/\.gz$/, ''))),
        )
      : undefined,
  )

  const updated = await catalog.fixture.ok(update({ fetch }), catalog.vars)

  expect(updated.dumps['title.ratings.tsv.gz']?.date).toBe('2026-11-20')
})

/** A ZIP of one member stored under compression `method`. */
function zipWithMethod(name: string, text: string, method: number): Buffer {
  const data = Buffer.from(text)
  const fileName = Buffer.from(name)
  const crc = crc32(data)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(method, 8)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(data.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(fileName.length, 26)
  const entry = Buffer.alloc(46)
  entry.writeUInt32LE(0x02014b50, 0)
  entry.writeUInt16LE(20, 4)
  entry.writeUInt16LE(20, 6)
  entry.writeUInt16LE(method, 10)
  entry.writeUInt32LE(crc, 16)
  entry.writeUInt32LE(data.length, 20)
  entry.writeUInt32LE(data.length, 24)
  entry.writeUInt16LE(fileName.length, 28)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(46 + fileName.length, 12)
  end.writeUInt32LE(30 + fileName.length + data.length, 16)
  return Buffer.concat([local, fileName, data, entry, fileName, end])
}

test('a ZIP member in a method Python cannot read either is an internal error', async () => {
  const catalog = useCatalog()
  const recordings = copyRecordings(catalog.fixture)
  writeFileSync(
    join(recordings, 'catalogo', 'ml-32m.zip'),
    zipWithMethod('ml-32m/links.csv', 'movieId,imdbId,tmdbId\n', 12),
  )

  const outcome = await catalog.fixture.run(update(), {
    ...catalog.vars,
    FILMES_GRAVACOES: recordings,
  })

  expect(errorOf(outcome).code).toBe('internal')
  expect(existsSync(catalog.manifest)).toBe(false)
})

test('a GroupLens answer without a body is not a ZIP', async () => {
  const catalog = useCatalog('network')
  const { fetch } = fakeFetch(({ url }) =>
    url.host === 'files.grouplens.org' ? new Response(null) : undefined,
  )

  const error = errorOf(
    await catalog.fixture.run(update({ fetch }), catalog.vars),
  )

  expect(error.message).toBe('ml-32m.zip: File is not a zip file')
})
