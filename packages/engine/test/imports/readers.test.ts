// What a Letterboxd export or RSS copy may hold, and what the import says
// of each problem: Python's messages, word for word (`zip_letterboxd.py`,
// `rss_letterboxd.py`, `arquivos.py`). Also the RSS copies another ticket
// (#100) keeps, as the ZIP import reloads them.
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import {
  EngineError,
  importLetterboxd,
  LETTERBOXD_RSS_KIND,
  readLetterboxdExport,
  readLetterboxdRss,
  readUpload,
  resolvePerson,
  RSS_ORIGIN,
  Sqlite,
  storeImport,
  Zip,
} from '../../src/index.ts'
import { type Fixture, ROOT, useFixture } from '../fixture.ts'
import { RECORDINGS } from '../sources/support.ts'
import { zipOf } from './zip.ts'

const RSS = join(ROOT, 'tests/fixture/gravacoes/letterboxd/rss-olga_farol.xml')
const OLGA = join(ROOT, 'tests/fixture/letterboxd/olga')
const AUTHOR = { name: 'Dono', email: '' }

/** The message of the `EngineError` the reader throws. */
const failure = (read: () => unknown): { code: string; message: string } => {
  try {
    read()
  } catch (error) {
    if (error instanceof EngineError)
      return { code: error.code, message: error.message }
    throw error
  }
  throw new Error('no error')
}

const exportError = (zip: Uint8Array) =>
  failure(() => readLetterboxdExport('x.zip', zip)).message

const watched = (body: string, header = 'Date,Name,Year,Letterboxd URI') =>
  zipOf([['watched.csv', `${header}\n${body}`]])

describe('readLetterboxdExport', () => {
  test('reads each CSV, at the top or in one folder, deflated, with a BOM', () => {
    const rows = readLetterboxdExport(
      'x.zip',
      zipOf([
        { name: 'export/', content: '' },
        {
          name: 'export/diary.csv',
          content:
            '\u{FEFF}Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2024-01-11,  Farol ,2012,u,4.5,,"a, ,b",2024-01-10\n',
          deflate: true,
        },
        {
          name: 'deleted/watched.csv',
          content: 'Date,Name,Year\n2024-01-01,Apagado,2000\n',
        },
        {
          name: 'a/b/ratings.csv',
          content: 'Date,Name,Year\n2024-01-01,Fundo,2000\n',
        },
        {
          name: 'watched.csv',
          content: 'Date,Name,Year\n2024-01-02,Sem Ano,\n',
        },
        {
          name: 'export/watched.csv',
          content: 'Date,Name,Year\n2024-01-03,Pasta,2001\n',
        },
      ]),
    )
    expect(
      rows.map((r) => [
        r.file,
        r.name,
        r.year,
        r.date,
        r.watchedOn,
        r.rating,
        r.tags,
      ]),
    ).toEqual([
      ['watched', 'Sem Ano', null, '2024-01-02', null, null, []],
      ['diary', 'Farol', 2012, '2024-01-11', '2024-01-10', 4.5, ['a', 'b']],
    ])
  })
})

describe('readLetterboxdExport', () => {
  test('a review becomes one line of text', () => {
    const [row] = readLetterboxdExport(
      'x.zip',
      zipOf([
        [
          'reviews.csv',
          'Date,Name,Year,Review\n2024-01-01,F,2000,"<p>Bom ,  &amp; <b>belo</b> !</p>"\n2024-01-01,G,2000,"  "\n',
        ],
      ]),
    )
    expect(row?.review).toBe('Bom, & belo!')
  })
})

const exportErrors: Array<[string, Buffer, string]> = [
  ['not a ZIP', Buffer.from('PK nothing here'), 'x.zip: não é um ZIP'],
  [
    'no export CSV',
    zipOf([
      ['lists/watched.csv', 'x'],
      ['notes.txt', 'x'],
    ]),
    'x.zip: não parece um export do Letterboxd (sem watched.csv, ratings.csv, diary.csv, reviews.csv nem watchlist.csv)',
  ],
  [
    'missing columns',
    zipOf([['ratings.csv', 'Name\nx\n']]),
    'ratings.csv: faltam as colunas Date, Year',
  ],
  [
    'an empty CSV',
    zipOf([['ratings.csv', '']]),
    'ratings.csv: faltam as colunas Date, Name, Year',
  ],
  [
    'no name',
    watched('2024-01-01, ,2000,u\n'),
    'watched.csv, linha 2: filme sem nome',
  ],
  [
    'a bad year',
    watched('2024-01-01,F,20x0,u\n'),
    "watched.csv, linha 2: ano inválido: '20x0'",
  ],
  ['no date', watched(',F,2000,u\n'), 'watched.csv, linha 2: linha sem data'],
  [
    'a bad date',
    watched('2024-13-01,F,2000,u\n'),
    "watched.csv, linha 2: data inválida: '2024-13-01'",
  ],
  [
    'a bad Nota',
    watched(
      '2024-01-01,F,2000,u,dez\n',
      'Date,Name,Year,Letterboxd URI,Rating',
    ),
    "watched.csv, linha 2: nota inválida: 'dez'",
  ],
  [
    'a Nota out of range',
    watched(
      '2024-01-01,F,2000,u,5.5\n',
      'Date,Name,Year,Letterboxd URI,Rating',
    ),
    "watched.csv, linha 2: nota fora de 0,5 a 5: '5.5'",
  ],
  [
    'bad UTF-8',
    zipOf([['watched.csv', Buffer.from([0x44, 0xff])]]),
    "x.zip: 'utf-8' codec can't decode byte 0xff in position 1: invalid start byte",
  ],
  [
    'an encrypted member',
    zipOf([{ name: 'watched.csv', content: 'x', encrypted: true }]),
    "x.zip: File 'watched.csv' is encrypted, password required for extraction",
  ],
]

describe('readLetterboxdExport', () => {
  test.each(exportErrors)('%s', (_, zip, message) => {
    expect(exportError(zip)).toBe(message)
  })
})

describe('readLetterboxdExport', () => {
  test('a damaged member is not a ZIP', () => {
    const zip = zipOf([['watched.csv', 'Date,Name,Year\n']])
    zip[30 + 'watched.csv'.length] = 0x58 // the content's first byte: the CRC no longer matches
    expect(exportError(zip)).toBe('x.zip: não é um ZIP')
    const header = zipOf([['watched.csv', 'Date,Name,Year\n']])
    header.write('ZZ', 30) // the local header's name differs from the directory's
    expect(exportError(header)).toBe('x.zip: não é um ZIP')
    const magic = zipOf([['watched.csv', 'Date,Name,Year\n']])
    magic.writeUInt32LE(0, 0)
    expect(exportError(magic)).toBe('x.zip: não é um ZIP')
  })

  test('a ZIP after other bytes, with a comment, still reads', () => {
    const zip = zipOf([['watched.csv', 'Date,Name,Year\n2024-01-01,F,2000\n']])
    const comment = Buffer.from('comentário')
    zip.writeUInt16LE(comment.length, zip.length - 2)
    const shifted = Buffer.concat([Buffer.from('prefix'), zip, comment])
    expect(readLetterboxdExport('x.zip', shifted).map((r) => r.name)).toEqual([
      'F',
    ])
    expect(() => new Zip(Buffer.from('PK')).names()).toThrow(
      'File is not a zip file',
    )
    expect(() => new Zip(zip).read('nada.csv')).toThrow(
      "There is no item named 'nada.csv' in the archive",
    )
  })
})

describe('readLetterboxdRss', () => {
  test('the diary entries and Notas of the feed, the day in its own offset', () => {
    const rows = readLetterboxdRss('rss.xml', readFileSync(RSS))
    expect(
      rows.map((r) => [
        r.name,
        r.year,
        r.date,
        r.watchedOn,
        r.rating,
        r.tmdb,
        r.origin,
      ]),
    ).toEqual([
      [
        'O Farol de Areia',
        2012,
        '2024-05-05',
        '2024-05-05',
        5,
        '9001',
        RSS_ORIGIN,
      ],
      ['Vento Norte', 2020, '2024-07-16', null, 3.5, '9102', RSS_ORIGIN],
      [
        'Maré Baixa',
        2014,
        '2024-03-01',
        '2024-03-01',
        null,
        '9002',
        RSS_ORIGIN,
      ],
      ['Maré Baixa', 2015, '2024-02-12', '2024-02-11', 2, '9003', RSS_ORIGIN],
      [
        'O Farol de Areia',
        2012,
        '2024-01-11',
        '2024-01-10',
        4.5,
        '9001',
        RSS_ORIGIN,
      ],
    ])
  })
})

describe('readLetterboxdRss', () => {
  const item = (fields: string) =>
    Buffer.from(
      `<rss xmlns:letterboxd="https://letterboxd.com"><channel><item><guid>g1</guid><pubDate>Thu, 11 Jan 2024 08:00:00 -0300</pubDate><letterboxd:filmTitle>F</letterboxd:filmTitle>${fields}</item></channel></rss>`,
    )

  test.each([
    [
      'a bad year',
      '<letterboxd:filmYear>12</letterboxd:filmYear>',
      "rss.xml, entrada g1: ano inválido: '12'",
    ],
    [
      'a bad watched date',
      '<letterboxd:watchedDate>ontem</letterboxd:watchedDate>',
      "rss.xml, entrada g1: data do diário inválida: 'ontem'",
    ],
    [
      'a bad Nota',
      '<letterboxd:memberRating>x</letterboxd:memberRating>',
      "rss.xml, entrada g1: nota inválida: 'x'",
    ],
    [
      'a Nota out of range',
      '<letterboxd:memberRating>0</letterboxd:memberRating>',
      "rss.xml, entrada g1: nota fora de 0,5 a 5: '0'",
    ],
  ])('%s', (_, fields, message) => {
    expect(
      failure(() => readLetterboxdRss('rss.xml', item(fields))).message,
    ).toBe(message)
  })

  test('a feed that is not one', () => {
    const read = (xml: string) =>
      failure(() => readLetterboxdRss('rss.xml', Buffer.from(xml))).message
    expect(read('<feed><channel/></feed>')).toBe(
      'rss.xml: não parece um RSS do Letterboxd',
    )
    expect(read('<rss/>')).toBe('rss.xml: não parece um RSS do Letterboxd')
    expect(read('<rss><channel>')).toMatch(
      /^rss\.xml: o RSS não é XML válido \(/,
    )
    expect(read('')).toMatch(/^rss\.xml: o RSS não é XML válido \(/)
    expect(
      read(
        '<rss><channel><item><guid>g</guid><pubDate>ontem</pubDate><f:filmTitle xmlns:f="https://letterboxd.com">F</f:filmTitle></item></channel></rss>',
      ),
    ).toBe("rss.xml, entrada g: data de publicação inválida: 'ontem'")
  })
})

describe('the import edges', () => {
  test('a missing file, an unknown Pessoa, an outdated database', async () => {
    const fixture = useFixture()
    expect(await fixture.run(readUpload('/nonexistent/x.zip'))).toEqual({
      exitCode: 1,
      output: {
        error: {
          code: 'missing_file',
          message: 'arquivo não encontrado: /nonexistent/x.zip',
        },
      },
    })
    const zip = zipOf([['watched.csv', 'Date,Name,Year\n2024-01-01,F,2000\n']])
    const content = (await fixture.ok(readUpload(join(OLGA, 'watched.csv'))))
      .content
    expect(content).toEqual(readFileSync(join(OLGA, 'watched.csv')))
    const run = () =>
      fixture.run(
        importLetterboxd({
          person: 'ninguém',
          original: 'x.zip',
          content: zip,
          author: AUTHOR,
        }),
      )
    expect((await run()).output).toEqual({
      error: {
        code: 'unknown_person',
        message: "nenhuma Pessoa se chama 'ninguém'",
      },
    })
    await fixture.ok(
      Effect.flatMap(Sqlite, (s) =>
        s.write((db) => db.exec('DROP TABLE itens_letterboxd')),
      ),
    )
    expect((await run()).output).toEqual({
      error: {
        code: 'outdated_database',
        message:
          'o banco ainda não tem o import do Letterboxd. Rode `reconstruir`.',
      },
    })
  })
})

describe('the import edges', () => {
  test('a recorded import missing from filmes-dados is invalid data', async () => {
    const fixture = useFixture()
    const zip = zipOf([['watched.csv', 'Date,Name,Year\n2024-01-01,F,2000\n']])
    const imported = await fixture.ok(
      importLetterboxd({
        person: 'iara',
        original: 'x.zip',
        content: zip,
        author: AUTHOR,
      }),
    )
    rmSync(join(fixture.data, imported.file))
    expect(
      (
        await fixture.run(
          importLetterboxd({
            person: 'iara',
            original: 'y.zip',
            content: zip,
            author: AUTHOR,
          }),
        )
      ).output,
    ).toEqual({
      error: {
        code: 'invalid_data',
        message: `people/iara.md registra o import ${imported.file}, que não está no repo de dados`,
      },
    })
  })
})

/** Stores the fixture's RSS as Iara's imported copy, as the RSS import does. */
async function storeIaraRss(fixture: Fixture): Promise<void> {
  const rssPath = join(fixture.root, 'rss.xml')
  writeFileSync(rssPath, readFileSync(RSS))
  await fixture.ok(
    Effect.gen(function* () {
      const person = yield* resolvePerson('iara')
      yield* storeImport(
        person,
        LETTERBOXD_RSS_KIND,
        'https://letterboxd.com/olga_farol/rss/',
        readFileSync(rssPath),
        'xml',
      )
    }),
  )
}

const olgaZip = () =>
  zipOf(
    [
      'diary.csv',
      'ratings.csv',
      'reviews.csv',
      'watched.csv',
      'watchlist.csv',
    ].map((n) => [n, readFileSync(join(OLGA, n))] as const),
  )

const iaraLetterboxdNotas = (fixture: Fixture) =>
  fixture.ok(
    Effect.flatMap(Sqlite, (s) =>
      s.read((db) =>
        db.all(
          "SELECT filme_id, nota, data, fonte FROM notas WHERE pessoa = 'iara' AND fato_id LIKE 'letterboxd:%' ORDER BY data, filme_id",
        ),
      ),
    ),
  )

const iaraSeen = (fixture: Fixture, source: string) =>
  fixture.ok(
    Effect.flatMap(Sqlite, (s) =>
      s.read((db) =>
        db.all(
          "SELECT filme_id, data FROM ja_visto WHERE pessoa = 'iara' AND fonte = ?",
          source,
        ),
      ),
    ),
  )

describe('the import edges', () => {
  test("the RSS copies reload with the ZIP's, and the ZIP's Fonte wins", async () => {
    const fixture = useFixture()
    const tmdb = {
      FILMES_TMDB_CHAVE: 'chave-de-teste',
      FILMES_GRAVACOES: RECORDINGS,
    }
    await storeIaraRss(fixture)
    const result = await fixture.ok(
      importLetterboxd({
        person: 'iara',
        original: 'olga.zip',
        content: olgaZip(),
        author: AUTHOR,
      }),
      tmdb,
    )
    const notas = (await iaraLetterboxdNotas(fixture)).map((r) =>
      Object.values(r),
    )
    const rss = 'RSS do Letterboxd de Iara'
    const zipSource = 'Letterboxd de Iara'
    expect(notas.filter((n) => n[2] === '2024-01-10')).toEqual([
      ['tt9000101', 4.5, '2024-01-10', zipSource],
    ])
    expect(notas.filter((n) => n[2] === '2024-07-16')).toEqual([
      ['tt9000302', 3.5, '2024-07-16', zipSource],
    ])
    expect(notas).toContainEqual(['tt9000101', 5, '2024-05-05', rss])
    const seen = await iaraSeen(fixture, rss)
    // Maré Baixa (2014): the RSS's TMDB id 9002 is the 1980 namesake.
    expect(seen.map((r) => Object.values(r))).toContainEqual([
      'tt9023002',
      '2024-03-01',
    ])
    expect(result.queue.map((i) => i.name)).toEqual(['Filme Perdido'])
  })
})
