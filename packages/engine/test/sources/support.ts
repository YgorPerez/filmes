// What the on-demand source tests share: the recordings, the keys, and an
// operation's value together with the request's warnings.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Effect } from 'effect'
import { Run } from '../../src/index.ts'
import { ROOT, type Fixture } from '../fixture.ts'

/** The recorded answers (`tests/fixture/gravacoes`). */
export const RECORDINGS = join(ROOT, 'tests/fixture/gravacoes')

/** Every source's key, and the recordings instead of the network. */
export const RECORDED = {
  FILMES_OMDB_CHAVE: 'chave-de-teste',
  FILMES_DDD_CHAVE: 'chave-de-teste',
  FILMES_TMDB_CHAVE: 'chave-de-teste',
  FILMES_GRAVACOES: RECORDINGS,
} as const

/** No key and no recordings: only the cache can answer. */
export const OFFLINE = {
  FILMES_OMDB_CHAVE: undefined,
  FILMES_DDD_CHAVE: undefined,
  FILMES_TMDB_CHAVE: undefined,
  FILMES_GRAVACOES: '/nonexistent/recordings',
} as const

/** `effect`'s value and the warnings of its request. */
export const withWarnings = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const value = yield* effect
    return { value, warnings: yield* (yield* Run).warnings }
  })

/** A copy of the recordings the test may add to. */
export const recordingsCopy = (fixture: Fixture): string => {
  const copy = join(fixture.root, 'recordings')
  cpSync(RECORDINGS, copy, { recursive: true })
  return copy
}

/** Writes `<dir>/<folder>/<key>.falha.json`. */
export const recordFailure = (
  dir: string,
  folder: string,
  key: string,
  failure: { motivo: string; vezes?: number },
): void => {
  mkdirSync(join(dir, folder), { recursive: true })
  writeFileSync(join(dir, folder, `${key}.falha.json`), JSON.stringify(failure))
}

/** The cache's rows, as the Python engine reads them. */
export const cacheRows = (path: string): Array<Record<string, unknown>> => {
  if (!existsSync(path)) return []
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    return db
      .prepare(
        'SELECT fonte, chave, corpo, obtido_em, expira_em FROM respostas ORDER BY fonte, chave',
      )
      .all()
      .map((row) => ({ ...row, corpo: JSON.parse(String(row['corpo'])) }))
  } finally {
    db.close()
  }
}

/** A recorded answer, parsed. */
export const recording = (folder: string, key: string): unknown =>
  JSON.parse(readFileSync(join(RECORDINGS, folder, `${key}.json`), 'utf8'))
