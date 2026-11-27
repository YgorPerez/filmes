import { constants, DatabaseSync } from 'node:sqlite'
import { Effect } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import {
  engineError,
  makeEngine,
  Sqlite,
  type Connection,
  type ReadOptions,
} from '../src/index.ts'
import { useFixture } from './fixture.ts'

const read = <A, E>(
  use: (db: Connection) => Effect.Effect<A, E>,
  options?: ReadOptions,
) =>
  Effect.gen(function* () {
    const sqlite = yield* Sqlite
    return yield* sqlite.read(use, options)
  })

const write = <A, E>(use: (db: Connection) => Effect.Effect<A, E>) =>
  Effect.gen(function* () {
    const sqlite = yield* Sqlite
    return yield* sqlite.write(use)
  })

const scratchRows = read((db) => db.all('SELECT x FROM scratch ORDER BY rowid'))

const withScratchTable = write((db) => db.exec('CREATE TABLE scratch (x)'))

describe('read', () => {
  test('is read-only', async () => {
    const fixture = useFixture()

    const outcome = await fixture.run(
      read((db) => db.run("DELETE FROM filmes WHERE id = 'tt9000101'")),
    )

    expect(outcome).toEqual({
      exitCode: 1,
      output: {
        error: {
          code: 'internal',
          message: 'SqliteError: attempt to write a readonly database',
        },
      },
    })
  })

  test('has the ln and ln1p functions, which fail where Python did', async () => {
    const fixture = useFixture()

    const row = await fixture.ok(
      read((db) => db.get('SELECT ln(1.0) AS a, ln1p(0) AS b, ln(4) AS c')),
    )
    const zero = await fixture.run(read((db) => db.get('SELECT ln(0)')))
    const minusOne = await fixture.run(read((db) => db.get('SELECT ln1p(-1)')))
    const nothing = await fixture.run(read((db) => db.get('SELECT ln(NULL)')))

    expect(row).toEqual({ a: 0, b: 0, c: Math.log(4) })
    for (const outcome of [zero, minusOne, nothing]) {
      expect(outcome.exitCode).toBe(1)
      expect(JSON.stringify(outcome.output)).toContain('SqliteError')
    }
  })
})

describe('read', () => {
  test('an authorizer can refuse actions', async () => {
    const fixture = useFixture()
    const denied: number[] = []
    const allowed = new Set([
      constants.SQLITE_SELECT,
      constants.SQLITE_READ,
      constants.SQLITE_FUNCTION,
    ])
    const authorizer = (action: number) => {
      if (allowed.has(action)) return constants.SQLITE_OK
      denied.push(action)
      return constants.SQLITE_DENY
    }

    const selected = await fixture.ok(
      read((db) => db.get('SELECT count(*) AS n FROM filmes'), { authorizer }),
    )
    const refused = await fixture.run(
      read((db) => db.run('DELETE FROM filmes'), { authorizer }),
    )

    expect(selected).toEqual({ n: 93 })
    expect(refused.exitCode).toBe(1)
    expect(denied).toContain(constants.SQLITE_DELETE)
  })

  test('readBigInts gives integers above 2^53 exactly', async () => {
    const fixture = useFixture()

    const row = await fixture.ok(
      read((db) => db.get('SELECT 9007199254740993 AS n'), {
        readBigInts: true,
      }),
    )

    expect(row).toEqual({ n: 9007199254740993n })
  })

  test('names the result columns even with no row', async () => {
    const fixture = useFixture()

    const columns = await fixture.ok(
      read((db) =>
        db.columns('SELECT id, titulo AS title FROM filmes WHERE 0'),
      ),
    )

    expect(columns).toEqual(['id', 'title'])
  })
})

describe('write', () => {
  test('commits what the use did', async () => {
    const fixture = useFixture()
    await fixture.ok(withScratchTable)

    const changes = await fixture.ok(
      write((db) => db.run('INSERT INTO scratch VALUES (?), (?)', 1, 'two')),
    )

    expect(changes).toEqual({ changes: 2, lastInsertRowid: 2 })
    expect(await fixture.ok(scratchRows)).toEqual([{ x: 1 }, { x: 'two' }])
  })

  test('rolls back when the use fails, and the next write still runs', async () => {
    const fixture = useFixture()
    const engine = makeEngine(fixture.vars)

    try {
      await engine.run(withScratchTable)
      const failed = await engine.run(
        write((db) =>
          db
            .run('INSERT INTO scratch VALUES (1)')
            .pipe(
              Effect.andThen(
                Effect.fail(engineError('unknown_person', 'ninguém')),
              ),
            ),
        ),
      )
      const next = await engine.run(
        write((db) => db.run('INSERT INTO scratch VALUES (2)')),
      )

      expect(failed.exitCode).toBe(1)
      expect(next.exitCode).toBe(0)
      expect(await engine.run(scratchRows)).toEqual({
        exitCode: 0,
        output: [{ x: 2 }],
      })
    } finally {
      await engine.dispose()
    }
  })
})

describe('write', () => {
  test('two writes at once run one after the other', async () => {
    const fixture = useFixture()
    await fixture.ok(withScratchTable)
    // Each write yields between its two inserts; without the lock, the other
    // would start inside the same moment and find the database locked.
    const pair = (a: number, b: number) =>
      write((db) =>
        db
          .run('INSERT INTO scratch VALUES (?)', a)
          .pipe(
            Effect.andThen(Effect.yieldNow),
            Effect.andThen(db.run('INSERT INTO scratch VALUES (?)', b)),
          ),
      )

    await fixture.ok(Effect.all([pair(1, 2), pair(3, 4)], { concurrency: 2 }))

    expect(await fixture.ok(scratchRows)).toEqual([
      { x: 1 },
      { x: 2 },
      { x: 3 },
      { x: 4 },
    ])
  })

  test('commits while a read transaction is open (WAL)', async () => {
    const fixture = useFixture()
    await fixture.ok(withScratchTable)

    const seen = await fixture.ok(
      Effect.gen(function* () {
        const sqlite = yield* Sqlite
        return yield* sqlite.read((db) =>
          Effect.gen(function* () {
            yield* db.exec('BEGIN')
            const before = yield* db.all('SELECT x FROM scratch')
            yield* sqlite.write((w) => w.run('INSERT INTO scratch VALUES (1)'))
            // The read keeps the state it began with.
            const after = yield* db.all('SELECT x FROM scratch')
            return { before, after }
          }),
        )
      }),
    )

    expect(seen).toEqual({ before: [], after: [] })
    expect(await fixture.ok(scratchRows)).toEqual([{ x: 1 }])
  })
})

describe('write', () => {
  test('switches a database built in rollback mode to WAL', async () => {
    const fixture = useFixture()
    const mode = () => {
      const db = new DatabaseSync(fixture.database)
      try {
        return db.prepare('PRAGMA journal_mode').get()?.['journal_mode']
      } finally {
        db.close()
      }
    }
    const old = new DatabaseSync(fixture.database)
    old.exec('PRAGMA journal_mode = DELETE')
    old.close()
    expect(mode()).toBe('delete')

    await fixture.ok(withScratchTable)

    expect(mode()).toBe('wal')
  })

  test('without a database it is missing_database too', async () => {
    const fixture = useFixture()

    const outcome = await fixture.run(withScratchTable, {
      FILMES_BANCO: `${fixture.root}/nothing.sqlite`,
    })

    expect(outcome.exitCode).toBe(1)
    if (outcome.exitCode === 0) return
    expect(outcome.output.error.code).toBe('missing_database')
  })
})

describe('a database built by another schema', () => {
  const stamp = (path: string, version: number) => {
    const db = new DatabaseSync(path)
    try {
      db.exec(`PRAGMA user_version = ${version}`)
    } finally {
      db.close()
    }
  }

  test.each([
    ['read', scratchRows],
    ['write', withScratchTable],
  ] as const)('%s refuses it as outdated_database', async (_, use) => {
    const fixture = useFixture()
    stamp(fixture.database, 0)

    const outcome = await fixture.run(use)

    expect(outcome.exitCode).toBe(1)
    if (outcome.exitCode === 0) return
    expect(outcome.output.error.code).toBe('outdated_database')
    expect(outcome.output.error.message).toContain('pnpm db:publish --build')
  })
})
