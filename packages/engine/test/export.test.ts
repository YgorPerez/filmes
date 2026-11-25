// `exportar --formato imdb` (tests/test_exportar.py): a Pessoa's Notas in
// the IMDb ratings CSV, the one format the MovieLens import takes.
//
// Teo has no Nota in the fixture. Python gives him some through `pessoa
// visto` and a Letterboxd import; until those are ported the test writes
// the same Notas into the database.
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vite-plus/test'
import { consult, exportRatings, IMDB_HEADER } from '../src/index.ts'
import { useFixture, type Fixture } from './fixture.ts'

/** Rows of a CSV as Python's `csv.reader` reads them. */
function readCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\r' && text[i + 1] === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
    } else field += c
  }
  return rows
}

const byFilm = (content: string) => {
  const [header = [], ...rows] = readCsv(content)
  return {
    header,
    films: new Map(
      rows.map((row) => [
        row[0],
        Object.fromEntries(header.map((name, i) => [name, row[i]])),
      ]),
    ),
  }
}

function giveTeoRatings(fixture: Fixture) {
  const db = new DatabaseSync(fixture.database)
  try {
    const insert = db.prepare(
      "INSERT INTO notas (fato_id, pessoa, filme_id, nota, data, fonte) VALUES (?, 'teo', ?, ?, ?, 'teste')",
    )
    insert.run('notas:a', 'tt9000602', 3, '2025-01-05')
    insert.run('notas:b', 'tt9000602', 4.5, '2026-02-01')
    insert.run('notas:c', 'tt9000601', 0.5, '2024-07-30')
    // Outside the Catálogo, from the Letterboxd import.
    insert.run('notas:d', 'tt1112223', 2, '2024-01-09')
  } finally {
    db.close()
  }
}

test('the current Notas go into the IMDb CSV, doubled', async () => {
  const fixture = useFixture()
  giveTeoRatings(fixture)

  const result = await fixture.ok(exportRatings('Teo', 'imdb'))

  expect(result).toMatchObject({
    person: 'teo',
    format: 'imdb',
    ratings: 3,
    outsideCatalog: 1,
  })
  const { header, films } = byFilm(result.content)
  expect(header).toEqual(IMDB_HEADER)
  expect([...films.keys()]).toEqual(['tt9000602', 'tt9000601', 'tt1112223'])
  expect(films.get('tt9000602')).toMatchObject({
    'Your Rating': '9',
    'Date Rated': '2026-02-01',
    Title: 'Casa Cheia',
    Year: '2021',
    'Runtime (mins)': '102',
    'Num Votes': '50000',
    'Title Type': 'Movie',
    Directors: 'Lia Moura',
    URL: 'https://www.imdb.com/title/tt9000602/',
  })
  expect(films.get('tt9000601')?.['Your Rating']).toBe('1')
  expect(films.get('tt1112223')).toEqual({
    Const: 'tt1112223',
    'Your Rating': '4',
    'Date Rated': '2024-01-09',
    Title: '',
    'Original Title': '',
    URL: 'https://www.imdb.com/title/tt1112223/',
    'Title Type': '',
    'IMDb Rating': '',
    'Runtime (mins)': '',
    Year: '',
    Genres: '',
    'Num Votes': '',
    'Release Date': '',
    Directors: '',
  })
})

test('genres and the IMDb rating come from the Catálogo', async () => {
  const fixture = useFixture()
  const db = new DatabaseSync(fixture.database)
  db.exec("UPDATE filmes SET nota_imdb = 8 WHERE id = 'tt9000101'")
  db.close()

  const { content } = await fixture.ok(exportRatings('bruno', 'imdb'))

  const film = byFilm(content).films.get('tt9000101')
  const { rows } = await fixture.ok(
    consult(
      "SELECT group_concat(genero, ', ') FROM (SELECT genero FROM generos_imdb WHERE filme_id = 'tt9000101' ORDER BY ordem)",
    ),
  )
  expect(film?.['Genres']).toBe(rows[0]?.[0])
  // Python's str() of a REAL.
  expect(film?.['IMDb Rating']).toBe('8.0')
})

test('the file is Python’s csv: quoted where needed, CRLF rows', async () => {
  const fixture = useFixture()
  const db = new DatabaseSync(fixture.database)
  db.prepare("UPDATE filmes SET titulo = ? WHERE id = 'tt9000101'").run(
    'Um "título", com\nquebra',
  )
  db.close()

  const { content } = await fixture.ok(exportRatings('bruno', 'imdb'))

  expect(content.startsWith(`${IMDB_HEADER.join(',')}\r\n`)).toBe(true)
  expect(content.endsWith('\r\n')).toBe(true)
  expect(content).toContain(',"Um ""título"", com\nquebra",')
})

test('an unknown Pessoa is an error', async () => {
  const fixture = useFixture()

  const outcome = await fixture.run(exportRatings('ninguem', 'imdb'))

  expect(outcome.exitCode).toBe(1)
  expect(outcome.output).toMatchObject({ error: { code: 'unknown_person' } })
})
