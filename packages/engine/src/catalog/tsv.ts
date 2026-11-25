// The IMDb's gzipped TSVs as Python's `csv.reader(f, delimiter="\t",
// quoting=csv.QUOTE_NONE)` reads them: no quoting, a field ends at a tab,
// a record at a line break. Only the named columns are cut out of each
// line: title.principals has close to 100 million lines.

import { pythonError } from '../compat/python-error.ts'
import { pyReprStr } from '../compat/text.ts'
import { gzipBytes, lineBatches, utf8Text } from './text-source.ts'

const body = (line: string): string => {
  const end = line.endsWith('\r\n')
    ? line.length - 2
    : line.endsWith('\n') || line.endsWith('\r')
      ? line.length - 1
      : line.length
  return line.slice(0, end)
}

/** The fields at `indexes` (ascending order not required) of one line. */
const cut = (
  line: string,
  wanted: readonly number[],
  last: number,
): string[] => {
  const fields: string[] = []
  let start = 0
  for (let field = 0; field <= last; field++) {
    if (start > line.length)
      throw pythonError('IndexError', 'list index out of range')
    let end = line.indexOf('\t', start)
    if (end < 0) end = line.length
    fields.push(line.slice(start, end))
    start = end + 1
  }
  return wanted.map((i) => fields[i]!)
}

/** The named columns of each row after the header, a batch per chunk. */
export async function* tsvColumns(
  path: string,
  columns: readonly string[],
): AsyncGenerator<string[][]> {
  let indexes: number[] | undefined
  let last = 0
  for await (const lines of lineBatches(utf8Text(gzipBytes(path)))) {
    const rows: string[][] = []
    for (const line of lines) {
      const text = body(line)
      if (indexes === undefined) {
        const header = text === '' ? [] : text.split('\t')
        indexes = columns.map((column) => {
          const at = header.indexOf(column)
          if (at < 0)
            throw pythonError(
              'ValueError',
              `${pyReprStr(column)} is not in list`,
            )
          return at
        })
        last = Math.max(...indexes)
        continue
      }
      // A blank line is an empty record: indexing it fails, as in Python.
      if (text === '')
        throw pythonError('IndexError', 'list index out of range')
      rows.push(cut(text, indexes, last))
    }
    if (rows.length > 0) yield rows
  }
}
