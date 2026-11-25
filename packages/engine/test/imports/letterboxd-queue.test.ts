// The Letterboxd queue (ticket #100): the Vitest twin of
// tests/test_fila_reprocessar.py, and the Dono's decisions (`fila
// confirmar`, `fila descartar`) beyond what tests/test_letterboxd.py
// exercises. Rio Abaixo resolves only by TMDB (the recordings); the
// fixture's LEIAME says each film's path.
import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import {
  confirmQueueItem,
  discardQueueItem,
  importLetterboxd,
  personCreate,
  reprocessLetterboxd,
  Sqlite,
  TMDB_ATTRIBUTION,
  viewQueue,
  type Vars,
} from '../../src/index.ts'
import { ROOT, useFixture, type Fixture } from '../fixture.ts'
import {
  RECORDINGS,
  recordFailure,
  recordingsCopy,
} from '../sources/support.ts'
import { zipOf } from './zip.ts'

const OLGA = join(ROOT, 'tests/fixture/letterboxd/olga')
const AUTHOR = { name: 'Dono', email: 'dono@example.org' }
const RIO = 'Rio Abaixo'
const RIO_SEARCH = 'filme-rio-abaixo-2014-cb01025b85e0'
const RECORDED: Vars = { FILMES_GRAVACOES: RECORDINGS }
const TMDB_ON: Vars = { ...RECORDED, FILMES_TMDB_CHAVE: 'chave-de-teste' }

const olgaZip = () =>
  zipOf(
    readdirSync(OLGA)
      .filter((name) => name.endsWith('.csv'))
      .sort()
      .map((name) => [name, readFileSync(join(OLGA, name))] as const),
  )

const importZip = (
  fixture: Fixture,
  person: string,
  content: Uint8Array,
  vars: Vars,
) =>
  fixture.ok(
    importLetterboxd({
      person,
      original: 'export.zip',
      content,
      author: AUTHOR,
    }),
    vars,
  )

/** Creates Olga; the fixture's other Pessoas stay as they are. */
const addOlga = (fixture: Fixture) => fixture.ok(personCreate({ name: 'Olga' }))

const queued = async (fixture: Fixture) =>
  new Set((await fixture.ok(viewQueue, RECORDED)).items.map((i) => i.name))

const ratedFilms = async (fixture: Fixture) =>
  new Set(
    (
      await fixture.ok(
        Effect.flatMap(Sqlite, (sqlite) =>
          sqlite.read((db) =>
            db.all("SELECT filme_id FROM notas WHERE pessoa = 'olga'"),
          ),
        ),
      )
    ).map((row) => row.filme_id),
  )

describe('reprocessLetterboxd', () => {
  test('resolves what TMDB was not asked in the import', async () => {
    const fixture = useFixture()
    await addOlga(fixture)
    await importZip(fixture, 'olga', olgaZip(), RECORDED) // no TMDB key
    expect(await queued(fixture)).toContain(RIO)

    const result = await fixture.ok(
      reprocessLetterboxd({ author: AUTHOR }),
      TMDB_ON,
    )

    expect(result.resolved.map((i) => i.name)).toContain(RIO)
    expect(result.resolved.find((i) => i.name === RIO)).toMatchObject({
      status: 'resolved',
      resolvedBy: 'tmdb',
      filmId: 'tt9000303',
      people: ['olga'],
    })
    expect(await queued(fixture)).not.toContain(RIO)
    expect(await ratedFilms(fixture)).toContain('tt9000303')
    expect(result.attributions).toEqual([TMDB_ATTRIBUTION])
  })

  test("one Pessoa's reprocess does not ask for the others' queue", async () => {
    const fixture = useFixture()
    await addOlga(fixture)
    await fixture.ok(personCreate({ name: 'Bia' }))
    const bia = zipOf([
      [
        'watched.csv',
        'Date,Name,Year,Letterboxd URI\n2024-06-15,Gambito,2020,https://boxd.it/9a6\n',
      ],
    ])
    await importZip(fixture, 'olga', olgaZip(), RECORDED)
    await importZip(fixture, 'bia', bia, RECORDED)

    const result = await fixture.ok(
      reprocessLetterboxd({ person: 'bia', author: AUTHOR }),
      TMDB_ON,
    )

    expect(result.people).toEqual(['bia'])
    expect(result.discarded.map((i) => i.name)).toEqual(['Gambito']) // a TMDB miniseries
    expect(await queued(fixture)).toContain(RIO)
  })

  test('a transient TMDB failure in the middle of the import is tried again', async () => {
    const fixture = useFixture()
    await addOlga(fixture)
    const recordings = recordingsCopy(fixture)
    recordFailure(recordings, 'tmdb', RIO_SEARCH, {
      motivo: 'Connection reset by peer',
      vezes: 2,
    })

    const result = await importZip(fixture, 'olga', olgaZip(), {
      ...TMDB_ON,
      FILMES_GRAVACOES: recordings,
    })

    expect(result.warnings).toEqual([])
    expect(await queued(fixture)).not.toContain(RIO)
  })

  test('TMDB out in the middle of the import leaves the queue to reprocess', async () => {
    const fixture = useFixture()
    await addOlga(fixture)
    const recordings = recordingsCopy(fixture)
    recordFailure(recordings, 'tmdb', RIO_SEARCH, {
      motivo: 'Connection reset by peer',
    })
    const vars = { ...TMDB_ON, FILMES_GRAVACOES: recordings }

    const result = await importZip(fixture, 'olga', olgaZip(), vars)

    const [warning] = result.warnings
    expect(result.warnings).toHaveLength(1)
    expect(warning).toContain('Connection reset by peer')
    expect(warning).toContain('fila reprocessar')
    expect(await queued(fixture)).toContain(RIO)

    rmSync(join(recordings, 'tmdb', `${RIO_SEARCH}.falha.json`))
    const again = await fixture.ok(
      reprocessLetterboxd({ person: 'olga', author: AUTHOR }),
      vars,
    )
    expect(again.resolved.map((i) => i.name)).toContain(RIO)
  })
})

describe("the Dono's decisions", () => {
  /** Olga's ZIP imported with TMDB on: Vento Norte and Filme Perdido wait. */
  const imported = async (fixture: Fixture) => {
    await addOlga(fixture)
    await importZip(fixture, 'olga', olgaZip(), TMDB_ON)
    const { items } = await fixture.ok(viewQueue, RECORDED)
    const id = (name: string) => items.find((i) => i.name === name)?.id ?? ''
    return { fixture, vento: id('Vento Norte'), perdido: id('Filme Perdido') }
  }

  test('a decision is recorded with who and when, and the same again is not new', async () => {
    const { fixture, perdido } = await imported(useFixture())
    const discard = (reason: string) =>
      fixture.ok(discardQueueItem({ id: perdido, reason, author: AUTHOR }))

    expect(await discard('  não é filme ')).toEqual({
      id: perdido,
      name: 'Filme Perdido',
      year: 2001,
      date: '2026-11-20',
      source: 'Dono',
      kind: 'stated',
      status: 'discarded',
      discardReason: 'não é filme',
      new: true,
      attributions: [],
    })
    expect(
      readFileSync(join(fixture.data, 'imports/letterboxd.md'), 'utf8'),
    ).toContain('discard_reason: não é filme')
    expect(await discard('não é filme')).toMatchObject({
      status: 'discarded',
      new: false,
    })
    expect(
      await fixture.run(
        discardQueueItem({ id: perdido, reason: 'outra', author: AUTHOR }),
      ),
    ).toEqual({
      exitCode: 1,
      output: {
        error: {
          code: 'item_not_queued',
          message: `'${perdido}' não está na fila; consulte \`fila ver\``,
        },
      },
    })
  })

  test('a confirmation by tconst, again, answers what was recorded', async () => {
    const { fixture, vento } = await imported(useFixture())
    const confirm = () =>
      fixture.ok(
        confirmQueueItem({ id: vento, film: 'tt9000302', author: AUTHOR }),
      )
    expect(await confirm()).toMatchObject({
      status: 'confirmed',
      film: 'tt9000302',
      input: 'tt9000302',
      new: true,
    })
    expect(await confirm()).toMatchObject({ film: 'tt9000302', new: false })
  })

  test('a TMDB link the Catalog does not know asks TMDB for the tconst', async () => {
    const { fixture, vento } = await imported(useFixture())
    const result = await fixture.ok(
      confirmQueueItem({
        id: vento,
        film: 'https://www.themoviedb.org/movie/9102-vento-norte',
        author: AUTHOR,
      }),
      TMDB_ON,
    )
    expect(result).toMatchObject({
      film: 'tt9000302',
      attributions: [TMDB_ATTRIBUTION],
    })
  })

  test('a TMDB link the Catalog knows needs no TMDB', async () => {
    const { fixture, vento } = await imported(useFixture())
    const result = await fixture.ok(
      confirmQueueItem({
        id: vento,
        film: 'https://themoviedb.org/movie/9001/',
        author: AUTHOR,
      }),
    )
    expect(result).toMatchObject({ film: 'tt9000101', attributions: [] })
  })

  test('what cannot be decided is an error', async () => {
    const { fixture, vento } = await imported(useFixture())
    const error = async (
      op: ReturnType<typeof confirmQueueItem | typeof discardQueueItem>,
    ) => ((await fixture.run(op)).output as { error: unknown }).error
    expect(
      await error(
        discardQueueItem({ id: vento, reason: '  ', author: AUTHOR }),
      ),
    ).toEqual({ code: 'invalid_usage', message: 'informe a razão do descarte' })
    expect(
      await error(
        confirmQueueItem({ id: vento, film: 'Vento Norte', author: AUTHOR }),
      ),
    ).toEqual({
      code: 'invalid_usage',
      message: 'use um tconst (tt...) ou um link de filme do IMDb ou do TMDB',
    })
    expect(
      await error(
        confirmQueueItem({
          id: vento,
          film: 'https://www.themoviedb.org/movie/77',
          author: AUTHOR,
        }),
      ),
    ).toEqual({
      code: 'film_without_imdb',
      message:
        'TMDB sem chave de API (defina FILMES_TMDB_CHAVE); o que o Wikidata não resolveu fica na fila; `fila reprocessar` consulta o TMDB de novo. Use o tconst ou o link do IMDb para confirmar.',
    })
  })

  test('an old database without the import tables is outdated', async () => {
    const fixture = useFixture()
    await addOlga(fixture)
    await fixture.ok(
      Effect.flatMap(Sqlite, (sqlite) =>
        sqlite.write((db) => db.run('DROP TABLE itens_letterboxd')),
      ),
    )
    expect(
      await fixture.run(reprocessLetterboxd({ author: AUTHOR })),
    ).toMatchObject({
      exitCode: 1,
      output: { error: { code: 'outdated_database' } },
    })
  })
})
