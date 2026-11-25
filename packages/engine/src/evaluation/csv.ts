// `avaliacao/movielens.py` `_linhas`: Python's `csv.reader` (default
// dialect, not strict) over a file opened with `encoding="utf-8-sig",
// newline=""`, read as a stream (`catalog/csv-stream.ts`), since ml-32m's
// ratings.csv is about 900 MB.
//
// Errors carry the text Python's would: `csv.Error` messages, `ValueError`
// for the column checks. The caller adds the path.

import { closeSync, openSync, readSync } from 'node:fs'
import { basename } from 'node:path'
import {
  CsvLineError,
  CsvRecords,
  LineSplitter,
  type CsvRecord,
} from '../catalog/csv-stream.ts'

export { CsvLineError } from '../catalog/csv-stream.ts'

const CHUNK = 1 << 20

/** `csv.reader` rows of a file, with `line_num`. The BOM goes. */
function* records(path: string): Generator<CsvRecord> {
  const fd = openSync(path, 'r')
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false })
    const buffer = Buffer.allocUnsafe(CHUNK)
    const lines = new LineSplitter()
    const rows = new CsvRecords()
    for (;;) {
      const read = readSync(fd, buffer, 0, CHUNK, null)
      let text: string
      try {
        text = decoder.decode(buffer.subarray(0, read), { stream: read > 0 })
      } catch {
        throw new CsvLineError(`'utf-8' codec can't decode the file`)
      }
      yield* rows.push(lines.push(text))
      if (read === 0) break
    }
    yield* rows.push(lines.end(), true)
  } finally {
    closeSync(fd)
  }
}

/** `_linhas(caminho, colunas)`: the named columns of each row, after the
 * header; a row with another number of columns is a `ValueError`. */
export function* csvColumns<const C extends readonly string[]>(
  path: string,
  columns: C,
): Generator<{ [K in keyof C]: string }> {
  const rows = records(path)
  const first = rows.next()
  const header = first.done ? [] : first.value.fields
  const indexes = columns.map((column) => {
    const at = header.indexOf(column)
    if (at < 0) throw new CsvLineError(`'${column}' is not in list`)
    return at
  })
  for (const { fields, line } of rows) {
    if (fields.length !== header.length)
      throw new CsvLineError(
        `${basename(path)}, linha ${line}: número de colunas inválido`,
      )
    yield indexes.map((i) => fields[i]!) as { [K in keyof C]: string }
  }
}
