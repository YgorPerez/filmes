// `evaluateOnCopy` (#110): `evaluate` reads a copy of the database, so a
// write to the live file never waits on its long read transaction.
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, onTestFinished, test } from 'vite-plus/test'
import { evaluateOnCopy, progressTo } from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'

/** Points the process's temporary folder into the test's own, and gives
 * what the run left there. */
const ownTmp = (fixture: Fixture) => {
  const folder = join(fixture.root, 'tmp')
  mkdirSync(folder)
  const before = process.env['TMPDIR']
  process.env['TMPDIR'] = folder
  onTestFinished(() => {
    if (before === undefined) delete process.env['TMPDIR']
    else process.env['TMPDIR'] = before
  })
  return () => readdirSync(folder)
}

describe('evaluateOnCopy', () => {
  test('measures a copy while the live database takes writes, and removes it', async () => {
    const fixture = useFixture()
    const left = ownTmp(fixture)
    // A write that waits for no lock: it fails at once if `evaluate` held
    // the live file.
    const live = new DatabaseSync(fixture.database, { timeout: 0 })
    live.exec('CREATE TABLE written_meanwhile (at REAL)')
    const seen: number[] = []
    try {
      const result = await fixture.ok(
        evaluateOnCopy({
          onProgress: progressTo(({ progress }) => {
            seen.push(progress)
            live.exec('BEGIN IMMEDIATE')
            live
              .prepare('INSERT INTO written_meanwhile VALUES (?)')
              .run(progress)
            live.exec('COMMIT')
          }),
        }),
        { FILMES_AVALIACOES: join(fixture.root, 'avaliacoes') },
      )

      expect(result.offline.people.heldOut4Plus).toBe(5)
      expect(result.file).toBe(
        join(fixture.root, 'avaliacoes', '2026-11-20.md'),
      )
      expect(existsSync(result.file)).toBe(true)
      expect(
        live.prepare('SELECT count(*) AS n FROM written_meanwhile').get(),
      ).toEqual({ n: seen.length })
      expect([seen[0], seen.at(-1)]).toEqual([0, 100])
    } finally {
      live.close()
    }
    expect(left()).toEqual([])
  })

  test('a missing database is missing_database, before any copy', async () => {
    const fixture = useFixture()
    rmSync(fixture.database)

    const outcome = await fixture.run(evaluateOnCopy())

    expect(outcome).toMatchObject({
      exitCode: 1,
      output: { error: { code: 'missing_database' } },
    })
  })

  test('a database SQLite cannot read fails, and the copy folder goes', async () => {
    const fixture = useFixture()
    const left = ownTmp(fixture)
    rmSync(fixture.database)
    // A folder where the database should be: it exists, but no backup reads it.
    mkdirSync(fixture.database)

    const outcome = await fixture.run(evaluateOnCopy())

    expect(outcome).toMatchObject({
      exitCode: 1,
      output: { error: { code: 'internal' } },
    })
    expect(left()).toEqual([])
  })
})
