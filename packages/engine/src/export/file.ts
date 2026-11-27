// What every export format gives back, and how it reads a column.

import type { SQLOutputValue } from 'node:sqlite'
import type { Effect } from 'effect'
import { pyRepr } from '../compat/number.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import type { Sqlite, SqliteError } from '../sqlite/Sqlite.ts'

export interface ExportFile {
  /** How many Notas went into the file. */
  readonly ratings: number
  /** How many of its films are outside the Catálogo. */
  readonly outsideCatalog: number
  /** The file, as UTF-8 text. */
  readonly content: string
}

/** The file of the Pessoa with this slug. */
export type FileWriter = (
  slug: string,
) => Effect.Effect<ExportFile, EngineError | SqliteError, Sqlite>

/** From 0.5 to 5 stars to 1 to 10: a half star becomes an exact integer. */
export const tenScale = (rating: number): number => Math.trunc(rating * 2 + 0.5)

export type Value = SQLOutputValue | undefined

export const text = (value: Value): string =>
  typeof value === 'string' ? value : ''

/** Python's `str()` of an INTEGER column, blank for NULL. */
export const integer = (value: Value): string =>
  typeof value === 'number' || typeof value === 'bigint'
    ? String(value)
    : text(value)

/** Python's `str()` of a REAL column ("8.0"), blank for NULL. */
export const real = (value: Value): string =>
  typeof value === 'number' ? pyRepr(value) : text(value)
