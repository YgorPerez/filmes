// `evaluate` reads the live database in one transaction for its whole run
// (minutes on the whole MovieLens). The database is in WAL mode (#125), so a
// write meanwhile (a Feedback, an import, a Pessoa) never waits on it.
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, test } from 'vite-plus/test'
import { evaluate, progressTo } from '../../src/index.ts'
import { useFixture } from '../fixture.ts'

describe('evaluate on the live database', () => {
  test('takes writes while it measures', async () => {
    const fixture = useFixture()
    // A write that waits for no lock: it fails at once if `evaluate`
    // blocked writers.
    const live = new DatabaseSync(fixture.database, { timeout: 0 })
    live.exec('CREATE TABLE written_meanwhile (at REAL)')
    const seen: number[] = []
    try {
      const result = await fixture.ok(
        evaluate({
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
      expect(
        live.prepare('SELECT count(*) AS n FROM written_meanwhile').get(),
      ).toEqual({ n: seen.length })
      expect([seen[0], seen.at(-1)]).toEqual([0, 100])
    } finally {
      live.close()
    }
  })
})
