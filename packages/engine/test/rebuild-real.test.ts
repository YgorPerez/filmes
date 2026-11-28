// `reconstruir` over a catalog of dumps (tests/test_ingestao.py, the
// reconstruct cases): the IMDb TSVs, the Wikidata SPARQL results and the
// GroupLens ZIPs pinned in a versions manifest. Python's tests pin the
// recorded dumps with `atualizar`; `usePinnedDumps` does what it would write
// (gzip each recording, name the folder by its SHA-256, write the manifest
// in English).
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { crc32, deflateRawSync, gzipSync } from 'node:zlib'
import { expect, test } from 'vite-plus/test'
import { consult, rebuild, recommend, type Outcome } from '../src/index.ts'
import { ROOT, useFixture, type Fixture } from './fixture.ts'

const RECORDED = join(ROOT, 'tests/fixture/gravacoes')

interface Pinned {
  readonly fixture: Fixture
  readonly catalog: string
  readonly manifest: string
  readonly vars: Record<string, string>
}

const sha256 = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex')

const SOURCES: Record<string, readonly [string, string]> = {
  'ml-32m.zip': ['MovieLens ml-32m', '2023-10-13'],
  'genome_2021.zip': ['Tag Genome 2021', '2021-12-30'],
  'ml-latest.zip': ['MovieLens ml-latest', '2023-07-20'],
}

/** The dump's bytes from a recording: gzip for TSV and JSON, as is for a
 * ZIP. */
const dumpOf = (folder: string, file: string): [string, Buffer] => {
  const bytes = readFileSync(join(folder, file))
  return file.endsWith('.zip') ? [file, bytes] : [`${file}.gz`, gzipSync(bytes)]
}

/** Pins dumps under `<root>/dumps` and writes `<root>/versions.json`. */
function pin(
  root: string,
  dumps: ReadonlyArray<readonly [string, Buffer]>,
): { catalog: string; manifest: string } {
  const catalog = join(root, 'dumps')
  const entries: Record<string, unknown> = {}
  for (const [name, bytes] of dumps) {
    const hash = sha256(bytes)
    mkdirSync(join(catalog, hash), { recursive: true })
    writeFileSync(join(catalog, hash, name), bytes)
    const [source, date] = SOURCES[name] ?? [
      name.startsWith('title.') ? 'IMDb' : 'QLever',
      '2026-11-20',
    ]
    entries[name] = {
      bytes: bytes.length,
      date,
      source,
      sha256: hash,
      url: 'https://example.org',
    }
  }
  const manifest = join(root, 'versions.json')
  writeFileSync(manifest, `${JSON.stringify({ dumps: entries }, null, 2)}\n`)
  return { catalog, manifest }
}

/** The recorded catalog dumps, pinned; `edit` changes the list first. */
function usePinnedDumps(
  edit?: (
    dumps: Array<readonly [string, Buffer]>,
  ) => Array<readonly [string, Buffer]>,
): Pinned {
  const fixture = useFixture()
  rmSync(fixture.database)
  const folder = join(RECORDED, 'catalogo')
  const dumps = readdirSync(folder)
    .sort()
    .map((file) => dumpOf(folder, file))
  const { catalog, manifest } = pin(fixture.root, edit ? edit(dumps) : dumps)
  return {
    fixture,
    catalog,
    manifest,
    vars: {
      FILMES_CATALOGO: catalog,
      FILMES_VERSOES: manifest,
      FILMES_GRAVACOES: RECORDED,
    },
  }
}

const without =
  (...names: string[]) =>
  (dumps: Array<readonly [string, Buffer]>) =>
    dumps.filter(([name]) => !names.includes(name))

async function rebuilt(pinned: Pinned) {
  await pinned.fixture.ok(rebuild, pinned.vars)
  return (sql: string) => rows(pinned, sql)
}

const rows = async (pinned: Pinned, sql: string) =>
  (await pinned.fixture.ok(consult(sql), pinned.vars)).rows

const errorOf = (outcome: Outcome<unknown>) => {
  expect(outcome.exitCode).toBe(1)
  return (outcome.output as { error: { code: string; message: string } }).error
}

interface ZipOptions {
  /** 8 deflates the members; another number is written as is. */
  readonly method?: number
  readonly flags?: number
  /** Bytes before the archive (a self-extracting stub). */
  readonly prefix?: Buffer
  /** Sizes and offsets in ZIP64 fields, with the ZIP64 end records. */
  readonly zip64?: boolean
}

/** One member's sizes and place, as both of its headers write them. */
type MemberHeader = {
  readonly method: number
  readonly flags: number
  readonly zip64: boolean
  readonly crc: number
  readonly raw: Buffer
  readonly data: Buffer
  readonly fileName: Buffer
  readonly offset: number
}

function localHeader(m: MemberHeader): Buffer {
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(m.flags, 6)
  local.writeUInt16LE(m.method, 8)
  local.writeUInt32LE(m.crc, 14)
  local.writeUInt32LE(m.data.length, 18)
  local.writeUInt32LE(m.raw.length, 22)
  local.writeUInt16LE(m.fileName.length, 26)
  return local
}

function zip64Extra(m: MemberHeader): Buffer {
  const extra = Buffer.alloc(m.zip64 ? 28 : 0)
  if (m.zip64) {
    extra.writeUInt16LE(0x0001, 0)
    extra.writeUInt16LE(24, 2)
    extra.writeBigUInt64LE(BigInt(m.raw.length), 4)
    extra.writeBigUInt64LE(BigInt(m.data.length), 12)
    extra.writeBigUInt64LE(BigInt(m.offset), 20)
  }
  return extra
}

function centralEntry(m: MemberHeader, extra: Buffer): Buffer {
  const { zip64 } = m
  const entry = Buffer.alloc(46)
  entry.writeUInt32LE(0x02014b50, 0)
  entry.writeUInt16LE(45, 4)
  entry.writeUInt16LE(45, 6)
  entry.writeUInt16LE(m.flags, 8)
  entry.writeUInt16LE(m.method, 10)
  entry.writeUInt32LE(m.crc, 16)
  entry.writeUInt32LE(zip64 ? 0xffffffff : m.data.length, 20)
  entry.writeUInt32LE(zip64 ? 0xffffffff : m.raw.length, 24)
  entry.writeUInt16LE(m.fileName.length, 28)
  entry.writeUInt16LE(extra.length, 30)
  entry.writeUInt32LE(zip64 ? 0xffffffff : m.offset, 42)
  return entry
}

/** The end records after the central directory, ZIP64's first if asked. */
function endRecords(
  count: number,
  directory: Buffer,
  offset: number,
  { prefix, zip64 }: { readonly prefix: Buffer; readonly zip64: boolean },
): Buffer[] {
  const records: Buffer[] = []
  if (zip64) {
    const end64 = Buffer.alloc(56)
    end64.writeUInt32LE(0x06064b50, 0)
    end64.writeBigUInt64LE(44n, 4)
    end64.writeBigUInt64LE(BigInt(count), 24)
    end64.writeBigUInt64LE(BigInt(count), 32)
    end64.writeBigUInt64LE(BigInt(directory.length), 40)
    end64.writeBigUInt64LE(BigInt(offset), 48)
    const locator = Buffer.alloc(20)
    locator.writeUInt32LE(0x07064b50, 0)
    locator.writeBigUInt64LE(
      BigInt(prefix.length + offset + directory.length),
      8,
    )
    locator.writeUInt32LE(1, 16)
    records.push(end64, locator)
  }
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(zip64 ? 0xffff : count, 8)
  end.writeUInt16LE(zip64 ? 0xffff : count, 10)
  end.writeUInt32LE(zip64 ? 0xffffffff : directory.length, 12)
  end.writeUInt32LE(zip64 ? 0xffffffff : offset, 16)
  records.push(end)
  return records
}

/** A ZIP, as `ZipFile(..., "w").writestr` makes (stored by default). */
function zip(
  members: Record<string, string>,
  options: ZipOptions = {},
): Buffer {
  const {
    method = 0,
    flags = 0,
    prefix = Buffer.alloc(0),
    zip64 = false,
  } = options
  const locals: Buffer[] = [prefix]
  const central: Buffer[] = []
  let offset = 0
  for (const [name, text] of Object.entries(members)) {
    const raw = Buffer.from(text)
    const data = method === 8 ? deflateRawSync(raw) : raw
    const fileName = Buffer.from(name)
    const header = {
      method,
      flags,
      zip64,
      crc: crc32(raw),
      raw,
      data,
      fileName,
      offset,
    }
    const extra = zip64Extra(header)
    locals.push(localHeader(header), fileName, data)
    central.push(centralEntry(header, extra), fileName, extra)
    offset += 30 + fileName.length + data.length
  }
  const directory = Buffer.concat(central)
  const count = Object.keys(members).length
  const records = endRecords(count, directory, offset, { prefix, zip64 })
  return Buffer.concat([...locals, directory, ...records])
}

test('loads only feature films with 100 votes', async () => {
  const query = await rebuilt(usePinnedDumps())

  expect(
    await query('SELECT id, duracao_min, votos FROM filmes ORDER BY id'),
  ).toEqual([
    ['tt0000009', 45, 241],
    ['tt0017839', 60, 100],
    ['tt0108052', 196, 1614297],
    ['tt0133093', 136, 2295248],
  ])
  expect(await query('SELECT filme_id, fonte, data FROM adultos')).toEqual([
    ['tt0065442', 'IMDb', '2026-11-20'],
  ])
})

test('ties the IMDb to the graph and converts the age ratings', async () => {
  const query = await rebuilt(usePinnedDumps())

  expect(
    await query(
      "SELECT slug, item, imdb, tmdb, ano FROM slugs_letterboxd WHERE item = 'Q483941'",
    ),
  ).toEqual([['schindlers-list', 'Q483941', 'tt0108052', '424', 1993]])
  expect(
    await query(`
      SELECT r.pt, r.en, r.mul, a.fonte, a.data FROM arestas a
      JOIN rotulos_wikidata r ON r.item = a.entidade_id
      WHERE a.filme_id = 'tt0108052' AND a.predicado = 'diretor'`),
  ).toEqual([
    [
      'Steven Spielberg',
      'Steven Spielberg',
      'Steven Spielberg',
      'Wikidata',
      '2026-11-20',
    ],
  ])
  expect(
    await query(`
      SELECT r.en FROM arestas a JOIN rotulos_wikidata r ON r.item = a.entidade_id
      WHERE a.filme_id = 'tt0108052' AND a.predicado = 'elenco'`),
  ).toEqual([['Mark Ivanir']])
  expect(
    await query(
      "SELECT codigo, rotulo FROM idiomas_originais WHERE filme_id = 'tt0108052'",
    ),
  ).toEqual([['en', 'inglês']])
  expect(
    await query(`
      SELECT propriedade, faixa, convertida FROM faixas_etarias
      WHERE filme_id = 'tt0108052' ORDER BY propriedade`),
  ).toEqual([
    ['P1657', '16', 1],
    ['P1981', '12', 1],
    ['P2629', '16', 1],
    ['P2756', '16', 1],
    ['P3216', '16', 0],
    ['P5970', '16', 1],
  ])
})

test('keeps the first three acting credits and ties them to the Wikidata cast', async () => {
  const query = await rebuilt(usePinnedDumps())

  // In title.principals Schindler's List opens with Liam Neeson, Ralph
  // Fiennes and Ben Kingsley; Miss Jerry has two actresses and two actors
  // before the director.
  expect(
    await query(
      'SELECT filme_id, ordem, ator_imdb FROM elenco_principal_imdb ORDER BY filme_id, ordem',
    ),
  ).toEqual([
    ['tt0000009', 1, 'nm0063086'],
    ['tt0000009', 2, 'nm0183823'],
    ['tt0000009', 3, 'nm1309758'],
    ['tt0108052', 1, 'nm0000553'],
    ['tt0108052', 2, 'nm0000146'],
    ['tt0108052', 3, 'nm0001426'],
    ['tt0133093', 1, 'nm0000206'],
    ['tt0133093', 2, 'nm0000401'],
    ['tt0133093', 3, 'nm0005251'],
  ])
  // Mark Ivanir, Schindler's List's recorded cast, is the ninth credit: a
  // supporting actor.
  expect(
    await query(
      'SELECT filme_id, entidade_id FROM elenco_principal ORDER BY filme_id',
    ),
  ).toEqual([['tt0108052', 'Q58444']])
})

test('takes a manifest without the IMDb credits', async () => {
  const query = await rebuilt(
    usePinnedDumps(
      without('title.principals.tsv.gz', 'wikidata-atores.json.gz'),
    ),
  )

  expect(await query('SELECT count(*) FROM elenco_principal_imdb')).toEqual([
    [0],
  ])
  expect(await query('SELECT count(*) FROM filmes')).toEqual([[4]])
})

test('keeps only the series that is a film series', async () => {
  const query = await rebuilt(usePinnedDumps())

  // The Matrix series is a film series; the BBC's list is a Wikimedia list
  // article.
  expect(
    await query(
      "SELECT filme_id, entidade_id FROM arestas WHERE predicado = 'serie'",
    ),
  ).toEqual([['tt0133093', 'Q1210827']])
})

test('says whether each series falls under film series or media franchise (#165)', async () => {
  const recorded = JSON.parse(
    readFileSync(join(RECORDED, 'catalogo/wikidata-series.json'), 'utf8'),
  ) as { results: { bindings: Array<Record<string, unknown>> } }
  const uri = (q: string) => ({
    type: 'uri',
    value: `http://www.wikidata.org/entity/${q}`,
  })
  const p31 = { type: 'uri', value: 'http://www.wikidata.org/prop/direct/P31' }
  const bindings = [
    ...recorded.results.bindings,
    // A franchise class below Q196600.
    { item: uri('Q1'), p: p31, valor: uri('Q2'), raiz: uri('Q196600') },
    // A dump from before #165, without ?raiz: the root only when the class
    // is one.
    { item: uri('Q3'), p: p31, valor: uri('Q196600') },
    { item: uri('Q4'), p: p31, valor: uri('Q5') },
  ]
  const query = await rebuilt(
    usePinnedDumps(
      replacing(
        'wikidata-series.json.gz',
        gzipSync(JSON.stringify({ results: { bindings } })),
      ),
    ),
  )

  expect(
    await query(
      'SELECT item, classe, raiz FROM series_de_filmes ORDER BY item',
    ),
  ).toEqual([
    ['Q1', 'Q2', 'Q196600'],
    ['Q1210827', 'Q24856', 'Q24856'],
    ['Q3', 'Q196600', 'Q196600'],
    ['Q4', 'Q5', null],
  ])
})

test('the release date is the first day of the earliest year (#165)', async () => {
  // Schindler's List: 1993-01-01 (Wikidata's year-only date), 1993-12-15
  // and two dates in 1994. Matrix has no P577.
  const query = await rebuilt(usePinnedDumps())

  expect(await query('SELECT filme_id, data FROM estreias')).toEqual([
    ['tt0108052', '1993-12-15'],
  ])
})

test('a year with only the 1st of January keeps only the year (#165)', async () => {
  const recorded = JSON.parse(
    readFileSync(join(RECORDED, 'catalogo/wikidata-ids.json'), 'utf8'),
  ) as { results: { bindings: Array<Record<string, { value: string }>> } }
  const bindings = recorded.results.bindings.filter(
    (b) =>
      !b['p']?.value.endsWith('/P577') ||
      b['valor']?.value.startsWith('1993-01-01'),
  )
  const query = await rebuilt(
    usePinnedDumps(
      replacing(
        'wikidata-ids.json.gz',
        gzipSync(JSON.stringify({ results: { bindings } })),
      ),
    ),
  )

  expect(await query('SELECT filme_id, data FROM estreias')).toEqual([
    ['tt0108052', '1993'],
  ])
})

test('without the series dump keeps every series edge', async () => {
  const query = await rebuilt(
    usePinnedDumps(without('wikidata-series.json.gz')),
  )

  expect(
    await query(
      "SELECT filme_id, entidade_id FROM arestas WHERE predicado = 'serie' ORDER BY filme_id",
    ),
  ).toEqual([
    ['tt0108052', 'Q26705935'],
    ['tt0133093', 'Q1210827'],
  ])
})

test('keeps the Wikidata genre hierarchy', async () => {
  const query = await rebuilt(usePinnedDumps())

  // QLever's real answer of 2026-11-21: romantic comedy film (Q118612349)
  // is a subclass of romance film, comedy film and romantic comedy.
  expect(
    await query(
      "SELECT classe FROM subclasses_wikidata WHERE item = 'Q118612349' ORDER BY classe",
    ),
  ).toEqual([['Q1054574'], ['Q157443'], ['Q860626']])
})

test('takes a manifest without the genre hierarchy', async () => {
  const query = await rebuilt(
    usePinnedDumps(without('wikidata-subgeneros.json.gz')),
  )

  expect(await query('SELECT count(*) FROM subclasses_wikidata')).toEqual([[0]])
  expect(await query('SELECT count(*) FROM filmes')).toEqual([[4]])
})

test('refuses a dump other than the pinned one and keeps the database', async () => {
  const pinned = usePinnedDumps()
  await rebuilt(pinned)
  const manifest = JSON.parse(readFileSync(pinned.manifest, 'utf8')) as {
    dumps: Record<string, { sha256: string }>
  }
  const name = 'title.ratings.tsv.gz'
  writeFileSync(
    join(pinned.catalog, manifest.dumps[name]!.sha256, name),
    'dump mudou',
  )

  const error = errorOf(await pinned.fixture.run(rebuild, pinned.vars))

  expect(error).toEqual({
    code: 'invalid_versions',
    message: `${pinned.manifest}: SHA-256 diverge para title.ratings.tsv.gz`,
  })
  expect(
    await rows(pinned, "SELECT titulo FROM filmes WHERE id = 'tt0133093'"),
  ).toEqual([['The Matrix']])
})

test('reads the ids from one dump per property', async () => {
  // What `atualizar` pins when QLever cuts the ids short: WDQS, by property.
  const pinned = usePinnedDumps((dumps) => {
    const ids = JSON.parse(
      readFileSync(join(RECORDED, 'catalogo/wikidata-ids.json'), 'utf8'),
    ) as { results: { bindings: Array<{ p: { value: string } }> } }
    const split = ['P345', 'P4947', 'P6127', 'P4983', 'P577'].map(
      (property) =>
        [
          `wikidata-ids-${property}.json.gz`,
          gzipSync(
            JSON.stringify({
              results: {
                bindings: ids.results.bindings.filter((row) =>
                  row.p.value.endsWith(`/${property}`),
                ),
              },
            }),
          ),
        ] as const,
    )
    return [...without('wikidata-ids.json.gz')(dumps), ...split]
  })
  const query = await rebuilt(pinned)

  expect(
    await query(
      "SELECT imdb, ano FROM slugs_letterboxd WHERE slug = 'schindlers-list'",
    ),
  ).toEqual([['tt0108052', 1993]])
})

test('a recommendation from the real catalog gives the IMDb credit', async () => {
  const pinned = usePinnedDumps()
  await rebuilt(pinned)

  const output = await pinned.fixture.ok(
    recommend({ attendees: ['dono'], maxDuration: 150 }),
    pinned.vars,
  )

  expect(output.films[0]!.title).toBe('The Matrix')
  expect(output.attributions).toContainEqual({
    source: 'IMDb',
    text: 'Information courtesy of IMDb (https://www.imdb.com). Used with permission.',
  })
})

test('the genres of a recommendation come from title.basics', async () => {
  const pinned = usePinnedDumps()
  await rebuilt(pinned)

  const output = await pinned.fixture.ok(
    recommend({ attendees: ['dono'] }),
    pinned.vars,
  )

  const genres = Object.fromEntries(
    output.films.map((film) => [film.title, film.genres]),
  )
  expect(genres['The Matrix']).toEqual(['Ação', 'Ficção científica'])
  expect(genres["Schindler's List"]).toEqual(['Biografia', 'Drama', 'História'])
})

test("poster, Portuguese title and synopsis come from TMDB's real pt-BR find", async () => {
  // gravacoes/tmdb/find-tt0133093-pt-BR.json is a real /find answer with
  // language=pt-BR, recorded on 2026-11-21.
  const pinned = usePinnedDumps()
  await rebuilt(pinned)

  const output = await pinned.fixture.ok(
    recommend({ attendees: ['dono'], maxDuration: 150 }),
    { ...pinned.vars, FILMES_TMDB_CHAVE: 'x' },
  )

  const matrix = output.films.find((film) => film.title === 'The Matrix')!
  expect(matrix.imdbUrl).toBe('https://www.imdb.com/title/tt0133093/')
  expect(matrix.poster).toBe(
    'https://image.tmdb.org/t/p/w185/lDqMDI3xpbB9UQRyeXfei0MXhqb.jpg',
  )
  expect(matrix.titlePt).toBe('Matrix')
  expect(matrix.synopsis).toBe(
    'O jovem programador Thomas Anderson é atormentado por estranhos pesadelos ' +
      'em que está sempre conectado por cabos a um imenso sistema de computadores do futuro.',
  )
})

test('counts directional neighbours from the ratings of four or more', async () => {
  const query = await rebuilt(usePinnedDumps())

  expect(
    await query(`
      SELECT filme_id, vizinho_id, base, ambos, fonte, data FROM vizinhos
      ORDER BY filme_id, vizinho_id`),
  ).toEqual([
    ['tt0108052', 'tt0133093', 3, 1, 'MovieLens ml-32m', '2023-10-13'],
    ['tt0114709', 'tt0133093', 1, 1, 'MovieLens ml-32m', '2023-10-13'],
    ['tt0133093', 'tt0108052', 2, 1, 'MovieLens ml-32m', '2023-10-13'],
    ['tt0133093', 'tt0114709', 2, 1, 'MovieLens ml-32m', '2023-10-13'],
  ])
})

test('limits the neighbourhood and breaks ties by IMDb id', async () => {
  const ids = Array.from({ length: 53 }, (_, i) => i + 1)
  const movielens = zip({
    'ml-32m/links.csv': `movieId,imdbId,tmdbId\n${ids
      .map((id) => `${id},${String(id).padStart(7, '0')},\n`)
      .join('')}`,
    'ml-32m/ratings.csv': `userId,movieId,rating,timestamp\n${ids
      .toReversed()
      .map((id) => `1,${id},4,1\n`)
      .join('')}2,1,4,1\n2,53,4,1\n`,
    'ml-32m/tags.csv': 'userId,movieId,tag,timestamp\n',
  })
  const query = await rebuilt(
    usePinnedDumps((dumps) => [
      ...without('ml-32m.zip')(dumps),
      ['ml-32m.zip', movielens],
    ]),
  )

  expect(
    await query(
      "SELECT vizinho_id FROM vizinhos WHERE filme_id = 'tt0000001' ORDER BY ambos DESC, vizinho_id",
    ),
  ).toEqual([
    ['tt0000053'],
    ...ids.slice(1, 50).map((id) => [`tt${String(id).padStart(7, '0')}`]),
  ])
})

test("measures how each film's MovieLens ratings spread", async () => {
  const movielens = zip({
    'ml-32m/links.csv':
      'movieId,imdbId,tmdbId\n1,0000001,\n2,0000002,\n3,0000003,\n',
    // Film 1: four users split over two values (1 bit). Film 2: one rating
    // twice by the same value (0 bits). Film 3 is not in the ratings.
    'ml-32m/ratings.csv':
      'userId,movieId,rating,timestamp\n1,1,5.0,1\n2,1,5.0,1\n3,1,2.5,1\n4,1,2.5,1\n1,2,4.0,1\n2,2,4.0,1\n',
    'ml-32m/tags.csv': 'userId,movieId,tag,timestamp\n',
  })
  const query = await rebuilt(
    usePinnedDumps((dumps) => [
      ...without('ml-32m.zip')(dumps),
      ['ml-32m.zip', movielens],
    ]),
  )

  expect(
    await query(
      'SELECT filme_id, avaliacoes, entropia FROM entropia_movielens ORDER BY filme_id',
    ),
  ).toEqual([
    ['tt0000001', 4, 1],
    ['tt0000002', 2, 0],
  ])
})

test('aggregates the normalized tags by distinct user', async () => {
  const query = await rebuilt(usePinnedDumps())

  expect(
    await query(
      'SELECT filme_id, tag, usuarios, fonte, data FROM tags_movielens',
    ),
  ).toEqual([
    ['tt0133093', 'sci-fi, action', 3, 'MovieLens ml-32m', '2023-10-13'],
  ])
})

test("ties the genome to the IMDb and keeps the score's precision", async () => {
  const pinned = usePinnedDumps()
  const { FILMES_GRAVACOES: _recordings, ...offline } = pinned.vars
  await pinned.fixture.ok(rebuild, offline)

  expect(
    await rows(
      pinned,
      "SELECT filme_id, tag, relevancia, fonte, data FROM genoma WHERE fonte = 'Tag Genome 2021' ORDER BY filme_id",
    ),
  ).toEqual([
    ['tt0108052', 'funny', 0.599999999999999, 'Tag Genome 2021', '2021-12-30'],
    ['tt0133093', 'funny', 0.876543210987654, 'Tag Genome 2021', '2021-12-30'],
  ])

  const output = await pinned.fixture.ok(
    recommend({ attendees: ['dono'], moods: ['pra rir'] }),
    pinned.vars,
  )

  expect(
    output.attributions.some(
      (credit) =>
        credit.source === 'Tag Genome' && credit.text.includes('CC BY-NC 3.0'),
    ),
  ).toBe(true)
})

test("ml-latest's genome fills only the films the Tag Genome 2021 lacks", async () => {
  const query = await rebuilt(usePinnedDumps())

  // tt0133093 keeps its 2021 relevance (ml-latest says 0.5) and gets no
  // "scary", a tag the 2021 genome lacks; tt0114709 has no 2021 row, so it
  // takes ml-latest's highest of its two movieIds.
  expect(
    await query(
      'SELECT filme_id, tag, relevancia, fonte, data FROM genoma ORDER BY filme_id, tag',
    ),
  ).toEqual([
    ['tt0108052', 'funny', 0.599999999999999, 'Tag Genome 2021', '2021-12-30'],
    [
      'tt0114709',
      'funny',
      0.7250000000000001,
      'MovieLens ml-latest',
      '2023-07-20',
    ],
    ['tt0133093', 'funny', 0.876543210987654, 'Tag Genome 2021', '2021-12-30'],
  ])
})

test('a Clima line from the ml-latest genome cites MovieLens ml-latest', async () => {
  const recorded = (file: string) =>
    readFileSync(join(RECORDED, 'catalogo', file), 'utf8')
  // Toy Story, in ml-latest's genome only, becomes a Candidate.
  const pinned = usePinnedDumps((dumps) =>
    replacing(
      'title.basics.tsv.gz',
      gzipSync(
        `${recorded('title.basics.tsv')}tt0114709\tmovie\tToy Story\tToy Story\t0\t1995\t\\N\t81\tAnimation,Comedy\n`,
      ),
    )(
      replacing(
        'title.ratings.tsv.gz',
        gzipSync(`${recorded('title.ratings.tsv')}tt0114709\t8.3\t1100000\n`),
      )(dumps),
    ),
  )
  await pinned.fixture.ok(rebuild, pinned.vars)

  const output = await pinned.fixture.ok(
    recommend({ attendees: ['dono'], moods: ['pra rir'] }),
    pinned.vars,
  )

  expect(output.attributions).toContainEqual({
    source: 'MovieLens ml-latest',
    text:
      'MovieLens ml-latest, do GroupLens Research, da Universidade de Minnesota ' +
      '(F. Maxwell Harper e Joseph A. Konstan, 2015, https://doi.org/10.1145/2827872). ' +
      'O GroupLens não endossa o filmes.',
  })
})

test('a catalog of dumps needs the manifest', async () => {
  const pinned = usePinnedDumps()
  rmSync(pinned.manifest)

  expect(errorOf(await pinned.fixture.run(rebuild, pinned.vars))).toEqual({
    code: 'missing_versions',
    message: `manifesto ausente em ${pinned.manifest}. Rode atualizar.`,
  })
})

test.each([
  [
    'a GroupLens dump without the other',
    without('genome_2021.zip'),
    'faltam dumps da GroupLens',
  ],
  [
    'no IMDb ratings',
    without('title.ratings.tsv.gz'),
    'faltam os dumps do IMDb ou os rótulos do Wikidata',
  ],
  [
    'no cast group',
    without('wikidata-elenco.json.gz'),
    'faltam dumps do Wikidata (elenco)',
  ],
  [
    'an unknown dump',
    (dumps: Array<readonly [string, Buffer]>) => [
      ...dumps,
      ['outro.json.gz', Buffer.from('x')] as const,
    ],
    'dumps desconhecidos: outro.json.gz',
  ],
])('refuses a manifest with %s', async (_, edit, reason) => {
  const pinned = usePinnedDumps(edit)

  expect(errorOf(await pinned.fixture.run(rebuild, pinned.vars))).toEqual({
    code: 'invalid_versions',
    message: `${pinned.manifest}: ${reason}`,
  })
})

test.each([
  [
    'an invalid date',
    { date: '2026-13-01' },
    "Invalid isoformat string: '2026-13-01'",
  ],
  [
    'an invalid hash',
    { sha256: 'abc' },
    'SHA-256 inválido para title.basics.tsv.gz',
  ],
])('refuses a dump with %s', async (_, change, reason) => {
  const pinned = usePinnedDumps()
  const manifest = JSON.parse(readFileSync(pinned.manifest, 'utf8')) as {
    dumps: Record<string, object>
  }
  manifest.dumps['title.basics.tsv.gz'] = {
    ...manifest.dumps['title.basics.tsv.gz'],
    ...change,
  }
  writeFileSync(pinned.manifest, JSON.stringify(manifest))

  expect(errorOf(await pinned.fixture.run(rebuild, pinned.vars))).toEqual({
    code: 'invalid_versions',
    message: `${pinned.manifest}: ${reason}`,
  })
})

test('refuses a pinned dump that is missing', async () => {
  const pinned = usePinnedDumps()
  const manifest = JSON.parse(readFileSync(pinned.manifest, 'utf8')) as {
    dumps: Record<string, { sha256: string }>
  }
  const hash = manifest.dumps['title.basics.tsv.gz']!.sha256
  const file = join(pinned.catalog, hash, 'title.basics.tsv.gz')
  copyFileSync(file, `${file}.bak`)
  rmSync(file)

  expect(errorOf(await pinned.fixture.run(rebuild, pinned.vars))).toEqual({
    code: 'invalid_versions',
    message: `${pinned.manifest}: dump fixado ausente: ${file}`,
  })
})

/** A dump replaced by other bytes, pinned under its new hash. */
const replacing =
  (name: string, bytes: Buffer) => (dumps: Array<readonly [string, Buffer]>) =>
    dumps.map((dump) => (dump[0] === name ? ([name, bytes] as const) : dump))

const internalError = async (pinned: Pinned) => {
  const error = errorOf(await pinned.fixture.run(rebuild, pinned.vars))
  expect(error.code).toBe('internal')
  return error.message
}

test('a SPARQL result cut short is an error and leaves no database', async () => {
  const pinned = usePinnedDumps(
    replacing(
      'wikidata-ids.json.gz',
      gzipSync('{"results":{"bindings":[{"item":'),
    ),
  )

  expect(await internalError(pinned)).toContain(
    'resultado SPARQL ausente ou incompleto',
  )
  expect(readdirSync(pinned.fixture.root)).not.toContain('filmes.sqlite')
})

test('a SPARQL result with fewer rows than QLever announced is an error', async () => {
  const pinned = usePinnedDumps(
    replacing(
      'wikidata-series.json.gz',
      gzipSync('{"meta":{"result-size-total":2},"results":{"bindings":[]}}'),
    ),
  )

  expect(await internalError(pinned)).toContain(
    'resultado SPARQL ausente ou incompleto',
  )
})

test('a ZIP member whose CRC does not match is an error', async () => {
  const movielens = zip({
    'ml-32m/links.csv': 'movieId,imdbId,tmdbId\n1,0133093,\n',
    'ml-32m/ratings.csv': 'userId,movieId,rating,timestamp\n',
    'ml-32m/tags.csv': 'userId,movieId,tag,timestamp\n',
  })
  // Flip one byte of the first member's data, after its 30-byte header
  // and name.
  movielens[30 + 'ml-32m/links.csv'.length] ^= 1
  const pinned = usePinnedDumps(replacing('ml-32m.zip', movielens))

  expect(await internalError(pinned)).toContain(
    "Bad CRC-32 for file 'ml-32m/links.csv'",
  )
})

test('a ZIP without a member the loading reads is an error', async () => {
  const pinned = usePinnedDumps(
    replacing('ml-32m.zip', zip({ 'ml-32m/links.csv': 'movieId,imdbId\n' })),
  )

  expect(await internalError(pinned)).toContain(
    "There is no item named 'ml-32m/ratings.csv' in the archive",
  )
})

test('an isAdult other than 0 or 1 is an error', async () => {
  const basics = readFileSync(
    join(RECORDED, 'catalogo/title.basics.tsv'),
    'utf8',
  )
  const lines = basics.split('\n')
  const matrix = lines.findIndex((line) => line.startsWith('tt0133093\t'))
  const fields = lines[matrix]!.split('\t')
  fields[4] = 'x'
  lines[matrix] = fields.join('\t')
  const pinned = usePinnedDumps(
    replacing('title.basics.tsv.gz', gzipSync(lines.join('\n'))),
  )

  expect(await internalError(pinned)).toContain(
    "isAdult inesperado no IMDb para tt0133093: 'x'",
  )
})

test('quoted MovieLens tags across lines and short rows read as csv does', async () => {
  const movielens = zip({
    'ml-32m/links.csv': 'movieId,imdbId,tmdbId\n1,0133093,\n2,,\n\n3\n',
    'ml-32m/ratings.csv': 'userId,movieId,rating,timestamp\r\n1,1,4.5,1\r\n',
    'ml-32m/tags.csv':
      'userId,movieId,tag,timestamp\n1,1,"two\nlines",1\n2,1," Two\nLines ",1\n3,9,x,1\n',
  })
  const query = await rebuilt(
    usePinnedDumps(replacing('ml-32m.zip', movielens)),
  )

  expect(
    await query('SELECT filme_id, tag, usuarios FROM tags_movielens'),
  ).toEqual([['tt0133093', 'two\nlines', 2]])
})

/** ml-32m with two films and two users who gave both 4+. */
const SMALL_MOVIELENS = {
  'ml-32m/links.csv': 'movieId,imdbId,tmdbId\n1,0133093,\n2,0108052,\n',
  'ml-32m/ratings.csv':
    'userId,movieId,rating,timestamp\n1,1,4,1\n1,2,5,1\n2,1,4.5,1\n2,2,4,1\n3,2,nan,1\n',
  'ml-32m/tags.csv': 'userId,movieId,tag,timestamp\n',
}

const neighbours = (query: (sql: string) => Promise<unknown>) =>
  query(
    'SELECT filme_id, vizinho_id, base, ambos FROM vizinhos ORDER BY filme_id',
  )

test("counts the population's ratings by value, for the ruler (#172)", async () => {
  const movielens = zip({
    ...SMALL_MOVIELENS,
    // Film 9 has no IMDb link: its rating still counts, as the population's.
    'ml-32m/ratings.csv':
      'userId,movieId,rating,timestamp\n1,1,4,1\n1,2,5,1\n2,1,4.5,1\n2,2,4,1\n3,2,nan,1\n3,9,0.5,1\n',
  })
  const query = await rebuilt(
    usePinnedDumps(replacing('ml-32m.zip', movielens)),
  )

  expect(
    await query('SELECT nota, quantidade FROM notas_movielens ORDER BY nota'),
  ).toEqual([
    [0.5, 1],
    [4, 2],
    [4.5, 1],
    [5, 1],
  ])
})

test("keeps a sample of users' ratings for the taste neighbours (#174)", async () => {
  // 60 linked films. User 10 rated 50 of them and stays; user 20 rated
  // 49, too few; user 15 rated 60 but his id is not a multiple of 10.
  const films = Array.from({ length: 60 }, (_, i) => i + 1)
  const rows = [
    ...films.slice(0, 50).map((f) => `10,${f},${(f % 10) / 2 + 0.5},1`),
    ...films.slice(0, 49).map((f) => `20,${f},4,1`),
    ...films.map((f) => `15,${f},3,1`),
    '10,999,5,1',
  ]
  const movielens = zip({
    ...SMALL_MOVIELENS,
    'ml-32m/links.csv': `movieId,imdbId,tmdbId\n${films.map((f) => `${f},${String(f).padStart(7, '0')},`).join('\n')}\n`,
    'ml-32m/ratings.csv': `userId,movieId,rating,timestamp\n${rows.join('\n')}\n`,
  })
  const query = await rebuilt(
    usePinnedDumps(replacing('ml-32m.zip', movielens)),
  )

  expect(
    await query(
      'SELECT usuario, count(*), min(nota), max(nota) FROM notas_gosto_movielens GROUP BY usuario',
    ),
  ).toEqual([[10, 50, 0.5, 5]])
  expect(
    await query(
      "SELECT filme_id, nota FROM notas_gosto_movielens WHERE filme_id = 'tt0000007'",
    ),
  ).toEqual([['tt0000007', 4]])
  // Five of each value: 0,5 is his 0,05, 5 his 0,95.
  expect(
    await query(
      'SELECT nota, percentil FROM percentis_gosto_movielens WHERE nota IN (0.5, 5) ORDER BY nota',
    ),
  ).toEqual([
    [0.5, 0.05],
    [5, 0.95],
  ])
  expect(await query('SELECT fonte, data FROM fonte_gosto_movielens')).toEqual([
    ['MovieLens ml-32m', '2023-10-13'],
  ])
})

test('reads a deflated ZIP64 archive behind a stub', async () => {
  const movielens = zip(SMALL_MOVIELENS, {
    method: 8,
    zip64: true,
    prefix: Buffer.from('#!/bin/sh\nexit 0\n'),
  })
  const query = await rebuilt(
    usePinnedDumps(replacing('ml-32m.zip', movielens)),
  )

  expect(await neighbours(query)).toEqual([
    ['tt0108052', 'tt0133093', 2, 2],
    ['tt0133093', 'tt0108052', 2, 2],
  ])
})

test('an empty ZIP member is an empty table', async () => {
  const query = await rebuilt(
    usePinnedDumps(
      replacing(
        'ml-32m.zip',
        zip({ ...SMALL_MOVIELENS, 'ml-32m/tags.csv': '' }),
      ),
    ),
  )

  expect(await query('SELECT count(*) FROM tags_movielens')).toEqual([[0]])
})

test.each([
  [
    'an encrypted member',
    { flags: 1 },
    'is encrypted, password required for extraction',
  ],
  [
    'another compression method',
    { method: 12 },
    'That compression method is not supported',
  ],
])('a ZIP with %s is an error', async (_, options, reason) => {
  const pinned = usePinnedDumps(
    replacing('ml-32m.zip', zip(SMALL_MOVIELENS, options)),
  )

  expect(await internalError(pinned)).toContain(reason)
})

test('a file that is not a ZIP is an error', async () => {
  const pinned = usePinnedDumps(
    replacing('ml-32m.zip', Buffer.from('not a zip')),
  )

  expect(await internalError(pinned)).toContain('File is not a zip file')
})

/** `rows` padded so the 1 MiB read boundary falls right after `before`. */
const straddling = (
  header: string,
  before: string,
  after: string,
  rest: string,
) => {
  const boundary = 1 << 20
  const filler = boundary - header.length - before.length
  // Rows of 8 bytes and one of 8 + filler % 8, all a tag of user 9.
  const odd = filler % 8
  const rows =
    `9,1,${'x'.repeat(1 + odd)},1\n` +
    '9,1,x,1\n'.repeat((filler - 8 - odd) / 8)
  return header + rows + before + after + rest
}

test('a quoted tag and a CRLF across the 1 MiB read boundary read as csv does', async () => {
  // A stored member is read in chunks of exactly 1 MiB from its first byte.
  const tags = straddling(
    'userId,movieId,tag,timestamp\n',
    '1,1,"two\n',
    'lines",1\r',
    '\n2,1,"Two\nLines",1\r\n3,1,"a""b"c,1\n\n4,1,"unclosed\n',
  )
  const query = await rebuilt(
    usePinnedDumps(
      replacing(
        'ml-32m.zip',
        zip({ ...SMALL_MOVIELENS, 'ml-32m/tags.csv': tags }),
      ),
    ),
  )

  expect(
    await query(
      "SELECT tag, usuarios FROM tags_movielens WHERE tag <> 'x' AND tag NOT LIKE 'xx%' ORDER BY tag",
    ),
  ).toEqual([
    ['a"bc', 1],
    ['two\nlines', 2],
    // End of data inside quotes keeps the field; the tag is stripped.
    ['unclosed', 1],
  ])
})

test('IMDb files with CRLF line endings read as csv does', async () => {
  const crlf = (name: string) => (dumps: Array<readonly [string, Buffer]>) =>
    replacing(
      `${name}.gz`,
      gzipSync(
        readFileSync(join(RECORDED, 'catalogo', name), 'utf8').replaceAll(
          '\n',
          '\r\n',
        ),
      ),
    )(dumps)
  const query = await rebuilt(
    usePinnedDumps((dumps) =>
      crlf('title.basics.tsv')(crlf('title.ratings.tsv')(dumps)),
    ),
  )

  expect(
    await query('SELECT id, titulo FROM filmes ORDER BY id LIMIT 1'),
  ).toEqual([['tt0000009', 'Miss Jerry']])
})

test.each([
  [
    'a column the header lacks',
    'tconst\tnumVotes\ntt0133093\t5\n',
    "ValueError: 'averageRating' is not in list",
  ],
  [
    'a short row',
    'tconst\taverageRating\tnumVotes\ntt0133093\t8.7\n',
    'IndexError: list index out of range',
  ],
  [
    'a blank row',
    'tconst\taverageRating\tnumVotes\n\n',
    'IndexError: list index out of range',
  ],
  [
    'a vote count that is not a number',
    'tconst\taverageRating\tnumVotes\ntt0133093\t8.7\tmany\n',
    "invalid literal for int() with base 10: 'many'",
  ],
])('an IMDb TSV with %s is an error', async (_, ratings, reason) => {
  const pinned = usePinnedDumps(
    replacing('title.ratings.tsv.gz', gzipSync(ratings)),
  )

  expect(await internalError(pinned)).toContain(reason)
})

test('a SPARQL result reads its envelope past escaped strings', async () => {
  const series = JSON.parse(
    readFileSync(join(RECORDED, 'catalogo/wikidata-series.json'), 'utf8'),
  ) as { results: { bindings: unknown[] } }
  const text = JSON.stringify({
    head: { vars: ['item', 'va\\"lor'], 'li\\"nk': [] },
    'x\\"y': -1.5e3,
    meta: { 'result-size-total': series.results.bindings.length, done: true },
    results: { bindings: series.results.bindings },
  })
  const query = await rebuilt(
    usePinnedDumps(replacing('wikidata-series.json.gz', gzipSync(text))),
  )

  expect(
    await query(
      "SELECT filme_id, entidade_id FROM arestas WHERE predicado = 'serie'",
    ),
  ).toEqual([['tt0133093', 'Q1210827']])
})

test('a SPARQL result without results.bindings is an error', async () => {
  const pinned = usePinnedDumps(
    replacing('wikidata-series.json.gz', gzipSync('{"results":{"other":[]}}')),
  )

  expect(await internalError(pinned)).toContain(
    'resultado SPARQL ausente ou incompleto',
  )
})

test.each([
  ['no dumps key', '{}', "'dumps'"],
  ['dumps that are a list', '{"dumps":[]}', 'dumps is not an object'],
])('refuses a manifest with %s', async (_, text, reason) => {
  const pinned = usePinnedDumps()
  writeFileSync(pinned.manifest, text)

  expect(errorOf(await pinned.fixture.run(rebuild, pinned.vars))).toEqual({
    code: 'invalid_versions',
    message: `${pinned.manifest}: ${reason}`,
  })
})

test('refuses a dump without its SHA-256', async () => {
  const pinned = usePinnedDumps()
  const manifest = JSON.parse(readFileSync(pinned.manifest, 'utf8')) as {
    dumps: Record<string, Record<string, unknown>>
  }
  delete manifest.dumps['title.basics.tsv.gz']!['sha256']
  writeFileSync(pinned.manifest, JSON.stringify(manifest))

  expect(errorOf(await pinned.fixture.run(rebuild, pinned.vars))).toEqual({
    code: 'invalid_versions',
    message: `${pinned.manifest}: 'sha256'`,
  })
})

test('a GroupLens dump without its source in the manifest is an error', async () => {
  const pinned = usePinnedDumps()
  const manifest = JSON.parse(readFileSync(pinned.manifest, 'utf8')) as {
    dumps: Record<string, Record<string, unknown>>
  }
  delete manifest.dumps['ml-32m.zip']!['source']
  manifest.dumps['title.basics.tsv.gz']!['source'] = { name: 'IMDb' }
  writeFileSync(pinned.manifest, JSON.stringify(manifest))

  expect(await internalError(pinned)).toContain("KeyError: 'source'")
})

test('a Tag Genome id that is a number is an error', async () => {
  const genome = zip({
    'movie_dataset_public_final/raw/metadata.json':
      '{"imdbId":133093,"item_id":11}\n',
    'movie_dataset_public_final/scores/glmer.csv': 'tag,item_id,score\n',
  })
  const pinned = usePinnedDumps(replacing('genome_2021.zip', genome))

  expect(await internalError(pinned)).toContain(
    "AttributeError: 'int' object has no attribute 'isdecimal'",
  )
})

test('the genre hierarchy keeps only item-to-item rows', async () => {
  const uri = (value: string) => ({ type: 'uri', value })
  const rows = [
    {
      item: uri('https://www.wikidata.org/entity/Q1'),
      valor: uri('http://www.wikidata.org/entity/Q2'),
    },
    {
      item: uri('http://www.wikidata.org/entity/Q3'),
      valor: { type: 'literal', value: 'Q4' },
    },
    {
      item: uri('http://www.wikidata.org/entity/P5'),
      valor: uri('http://www.wikidata.org/entity/Q6'),
    },
    {
      item: uri('http://example.org/entity/Q7'),
      valor: uri('http://www.wikidata.org/entity/Q8'),
    },
    { item: uri('http://www.wikidata.org/entity/Q9') },
  ]
  const query = await rebuilt(
    usePinnedDumps(
      replacing(
        'wikidata-subgeneros.json.gz',
        gzipSync(JSON.stringify({ results: { bindings: rows } })),
      ),
    ),
  )

  expect(await query('SELECT item, classe FROM subclasses_wikidata')).toEqual([
    ['Q1', 'Q2'],
  ])
})
