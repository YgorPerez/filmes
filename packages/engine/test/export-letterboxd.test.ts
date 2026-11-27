// The Letterboxd CSV (#286): what a Pessoa rated and saw in filmes, in the
// format letterboxd.com/about/importing-data documents, for her diary.
//
// Teo has no Nota in the fixture: the tests give him a Feedback, two Já
// vistos from the conversation and, like the IMDb test, rows the imports
// would write.
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vite-plus/test'
import {
  exportRatings,
  LETTERBOXD_HEADER,
  personSeen,
  recommendSession,
  recordFeedback,
} from '../src/index.ts'
import { useFixture, type Fixture } from './fixture.ts'

const NOITE_DE_ESTREIA = 'tt9000203'
const PEQUENOS_MILAGRES = 'tt9000601'
const CASA_CHEIA = 'tt9000602'

/** A Feedback where Teo gives 4/10 to Noite de Estreia and says why. */
async function teoFeedback(fixture: Fixture, comment: string) {
  const { session } = await fixture.ok(
    recommendSession({ attendees: ['dono', 'teo'] }),
  )
  await fixture.ok(
    recordFeedback({
      session: session.id,
      film: NOITE_DE_ESTREIA,
      ratings: ['teo=4/10'],
      comments: [`teo=${comment}`],
    }),
    { FILMES_HOJE: '2026-11-21' },
  )
}

/** What the Letterboxd and Trakt imports would have written for Teo. */
function importedRows(fixture: Fixture) {
  const db = new DatabaseSync(fixture.database)
  try {
    // Outside the Catálogo, from the Trakt import.
    db.prepare(
      "INSERT INTO notas (fato_id, pessoa, filme_id, nota, data, fonte) VALUES ('notas:fora', 'teo', 'tt1112223', 4.5, '2024-01-09', 'Trakt do Teo')",
    ).run()
    // A review Letterboxd already has: it does not go back there.
    db.prepare(
      "INSERT INTO declarados (fato_id, pessoa, data, fonte, especifico, alvo, texto) VALUES ('letterboxd:review', 'teo', '2026-11-22', 'Letterboxd do Teo', 1, ?, 'um texto do Letterboxd')",
    ).run(CASA_CHEIA)
  } finally {
    db.close()
  }
}

test('Notas, Já vistos and Reações go into the Letterboxd CSV', async () => {
  const fixture = useFixture()
  await teoFeedback(fixture, 'longo demais')
  await fixture.ok(
    personSeen({ person: 'teo', film: PEQUENOS_MILAGRES, date: '2026-11-15' }),
  )
  await fixture.ok(
    personSeen({
      person: 'teo',
      film: CASA_CHEIA,
      rating: '8/10',
      date: '2026-10-02',
    }),
  )
  importedRows(fixture)

  const result = await fixture.ok(exportRatings('Teo', 'letterboxd'))

  expect(result).toMatchObject({
    person: 'teo',
    format: 'letterboxd',
    ratings: 3,
    outsideCatalog: 1,
  })
  expect(result.content).toBe(
    [
      'imdbID,Title,Year,Rating10,WatchedDate,Review',
      // The Reação of the Feedback, 2 on the scale of 5, and his comment.
      `${NOITE_DE_ESTREIA},Noite de Estreia,2022,4,2026-11-21,longo demais`,
      // A Já visto with no Nota: a diary entry without a rating.
      `${PEQUENOS_MILAGRES},Pequenos Milagres,2019,,2026-11-15,`,
      `${CASA_CHEIA},Casa Cheia,2021,8,2026-10-02,`,
      // Letterboxd finds it by the imdbID alone.
      'tt1112223,,,9,2024-01-09,',
      '',
    ].join('\r\n'),
  )
})

test('the header is the importer’s columns', () => {
  expect(LETTERBOXD_HEADER).toEqual([
    'imdbID',
    'Title',
    'Year',
    'Rating10',
    'WatchedDate',
    'Review',
  ])
})

test('a field with a comma or a quote is quoted, the quote escaped as Letterboxd asks', async () => {
  const fixture = useFixture()
  await teoFeedback(fixture, 'muita violência, "sem" sentido')

  const { content } = await fixture.ok(exportRatings('teo', 'letterboxd'))

  expect(content.split('\r\n')[1]).toBe(
    `${NOITE_DE_ESTREIA},Noite de Estreia,2022,4,2026-11-21,"muita violência, \\"sem\\" sentido"`,
  )
})

test('a film seen again goes with the last day he watched it', async () => {
  const fixture = useFixture()
  await fixture.ok(
    personSeen({ person: 'teo', film: CASA_CHEIA, date: '2025-03-01' }),
  )
  await fixture.ok(
    personSeen({
      person: 'teo',
      film: CASA_CHEIA,
      date: '2026-06-30',
      source: 'Sessão de sábado',
    }),
  )

  const { content, ratings } = await fixture.ok(
    exportRatings('teo', 'letterboxd'),
  )

  expect(ratings).toBe(0)
  expect(content.split('\r\n').slice(1)).toEqual([
    `${CASA_CHEIA},Casa Cheia,2021,,2026-06-30,`,
    '',
  ])
})

test('an unknown Pessoa is an error', async () => {
  const fixture = useFixture()

  const outcome = await fixture.run(exportRatings('ninguem', 'letterboxd'))

  expect(outcome.exitCode).toBe(1)
  expect(outcome.output).toMatchObject({ error: { code: 'unknown_person' } })
})
