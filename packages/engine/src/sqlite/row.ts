// Typed reads of one column of a row. The schema is the Python's and fixed,
// so a column of the wrong type is a defect (`internal` at the edge), not a
// user error.

import type { Row } from './Sqlite.ts'

const wrong = (column: string, value: unknown): Error =>
  new TypeError(`column ${column}: unexpected ${typeof value} ${String(value)}`)

export const text = (row: Row, column: string): string => {
  const value = row[column]
  if (typeof value !== 'string') throw wrong(column, value)
  return value
}

export const textOrNull = (row: Row, column: string): string | null =>
  row[column] === null ? null : text(row, column)

/** INTEGER or REAL as a number (REAL 4.0 comes back as 4: R2). */
export const num = (row: Row, column: string): number => {
  const value = row[column]
  if (typeof value !== 'number') throw wrong(column, value)
  return value
}

export const numOrNull = (row: Row, column: string): number | null =>
  row[column] === null ? null : num(row, column)
