// The start-up reload (#104): a database built before some writes, reloaded
// from filmes-dados, holds the same rows as a fresh Python rebuild of that
// filmes-dados. The writes go through the engine (Pessoa actions, a Trakt
// import and its removal, a Session), as the app makes them on the VPS.
import { readFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { migrateConfig, migrateData } from '@filmes/key-migration'
import { describe, expect, test } from 'vite-plus/test'
import {
  importTrakt,
  personCreate,
  personSeen,
  personState,
  recommendSession,
  reloadData,
  removeImport,
} from '../src/index.ts'
import { ROOT, useFixture, type Fixture } from './fixture.ts'
import { zipOf } from './imports/zip.ts'
import { PYTHON_TIMEOUT, pythonOk } from './recommendation/support.ts'

const AUTHOR = { name: 'Dono', email: 'dono@example.org' }

const traktZip = () =>
  zipOf(
    ['ratings-movies.json', 'watched-history-1.json'].map(
      (name) =>
        [
          `trakt-export/${name}`,
          readFileSync(join(ROOT, 'tests/fixture/trakt', name)),
        ] as const,
    ),
  )

/** Every table, its rows as JSON in a stable order. */
const tables = (database: string): Record<string, string[]> => {
  const db = new DatabaseSync(database, { readOnly: true })
  try {
    const names = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((row) => String(row['name']))
    return Object.fromEntries(
      names.map((name) => [
        name,
        db
          .prepare(`SELECT * FROM "${name}"`)
          .all()
          .map((row) => JSON.stringify(Object.values(row)))
          .sort(),
      ]),
    )
  } finally {
    db.close()
  }
}

/** `python -m filmes reconstruir` over the fixture's filmes-dados as it is
 * now, migrated back to Portuguese, with the config the same way
 * (`FILMES_CONFIG`): what `db:publish --build` does. */
const pythonRebuild = (fixture: Fixture): string => {
  const data = join(fixture.root, 'rebuild-dados')
  const config = join(fixture.root, 'rebuild-config')
  const database = join(fixture.root, 'rebuild.sqlite')
  migrateData(fixture.data, data, 'to-pt')
  migrateConfig(fixture.config, config, 'to-pt')
  pythonOk(fixture, ['reconstruir'], {
    FILMES_DADOS: data,
    FILMES_CONFIG: config,
    FILMES_BANCO: database,
  })
  return database
}

describe('reloadData', () => {
  test(
    'a database built before the writes, reloaded, equals a fresh rebuild',
    async () => {
      const fixture = useFixture()
      // Teo's Trakt export is in the database the VPS gets...
      const { file } = await fixture.ok(
        importTrakt({
          person: 'teo',
          original: 'trakt.zip',
          content: traktZip(),
          author: AUTHOR,
        }),
      )
      const before = join(fixture.root, 'before.sqlite')
      copyFileSync(fixture.database, before)
      // ...and these writes happen after it was built.
      await fixture.ok(removeImport({ file, person: 'teo', author: AUTHOR }))
      await fixture.ok(personCreate({ name: 'Olga', aliases: ['Olguinha'] }))
      await fixture.ok(
        personState({
          person: 'bruno',
          text: 'adora filme de farol',
          source: 'conversa',
          reaction: 'like',
          target: 'tt9000101',
        }),
      )
      await fixture.ok(
        personSeen({ person: 'olga', film: 'tt9000102', rating: '4' }),
      )
      const { session } = await fixture.ok(
        recommendSession({ attendees: ['dono', 'bruno'] }),
      )

      const reload = await fixture.ok(reloadData, { FILMES_BANCO: before })

      expect(reload.people).toContain('olga')
      expect(reload.sessions).toContain(session.id)
      expect(tables(before)).toEqual(tables(pythonRebuild(fixture)))
    },
    PYTHON_TIMEOUT,
  )

  test('without a database it is the missing_database error', async () => {
    const fixture = useFixture()

    const outcome = await fixture.run(reloadData, {
      FILMES_BANCO: join(fixture.root, 'none.sqlite'),
    })

    expect(outcome).toMatchObject({
      exitCode: 1,
      output: { error: { code: 'missing_database' } },
    })
  })
})
