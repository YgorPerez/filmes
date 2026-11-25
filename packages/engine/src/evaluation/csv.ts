// `avaliacao/movielens.py` `_linhas`: Python's `csv.reader` (default
// dialect, not strict) over a file opened with `encoding="utf-8-sig",
// newline=""`, read as a stream, since ml-32m's ratings.csv is about 900 MB.
// A line without a double quote is split on commas directly, which is what
// the state machine does with it; a quoted line goes through a port of
// CPython 3.12's `_csv.c` for that dialect (non-strict: a character after a
// closing quote joins the field, and end of data inside quotes keeps it).
//
// Errors carry the text Python's would: `csv.Error` messages, `ValueError`
// for the column checks. The caller adds the path.

import { closeSync, openSync, readSync } from 'node:fs'
import { basename } from 'node:path'

/** A row Python's reader or the column check refused. */
export class CsvLineError extends Error {
  override readonly name = 'CsvLineError'
}

const FIELD_LIMIT = 131_072
const CHUNK = 1 << 20

/** The file's lines as `open(newline="")` iterates them: each ends after
 * "\n", "\r" or "\r\n" and keeps it. The BOM goes. */
function* fileLines(path: string): Generator<string> {
  const fd = openSync(path, 'r')
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false })
    const buffer = Buffer.allocUnsafe(CHUNK)
    let pending = ''
    for (;;) {
      const read = readSync(fd, buffer, 0, CHUNK, null)
      let text: string
      try {
        text = decoder.decode(buffer.subarray(0, read), { stream: read > 0 })
      } catch {
        throw new CsvLineError(`'utf-8' codec can't decode the file`)
      }
      pending += text
      let start = 0
      for (let i = 0; i < pending.length; i++) {
        const c = pending.charCodeAt(i)
        if (c === 10) {
          yield pending.slice(start, i + 1)
          start = i + 1
        } else if (c === 13) {
          if (i + 1 === pending.length && read > 0) break
          const end = pending.charCodeAt(i + 1) === 10 ? i + 2 : i + 1
          yield pending.slice(start, end)
          start = end
          i = end - 1
        }
      }
      pending = pending.slice(start)
      if (read === 0) break
    }
    if (pending.length > 0) yield pending
  } finally {
    closeSync(fd)
  }
}

const tooLarge = () =>
  new CsvLineError(`field larger than field limit (${FIELD_LIMIT})`)

const checkLength = (field: string) => {
  if (field.length > FIELD_LIMIT && Array.from(field).length > FIELD_LIMIT)
    throw tooLarge()
}

type State =
  | 'start_record'
  | 'start_field'
  | 'in_field'
  | 'in_quoted_field'
  | 'quote_in_quoted_field'
  | 'eat_crnl'

/** One record through the state machine, from its first line; more lines
 * come from `more` while a quoted field is open. */
const parseRecord = (
  first: string,
  more: () => string | undefined,
  count: () => void,
): string[] => {
  const fields: string[] = []
  let field = ''
  let state: State = 'start_record'
  const save = () => {
    checkLength(field)
    fields.push(field)
    field = ''
  }
  const endOfLine = (c: string | null) => {
    save()
    state = c === null ? 'start_record' : 'eat_crnl'
  }
  const startField = (c: string | null) => {
    if (c === '\n' || c === '\r' || c === null) endOfLine(c)
    else if (c === '"') state = 'in_quoted_field'
    else if (c === ',') save()
    else {
      field += c
      state = 'in_field'
    }
  }
  const step = (c: string | null) => {
    const newline = c === '\n' || c === '\r'
    switch (state) {
      case 'start_record':
        if (c === null) return
        if (newline) {
          state = 'eat_crnl'
          return
        }
        state = 'start_field'
        startField(c)
        return
      case 'start_field':
        startField(c)
        return
      case 'in_field':
        if (newline || c === null) endOfLine(c)
        else if (c === ',') {
          save()
          state = 'start_field'
        } else field += c
        return
      case 'in_quoted_field':
        if (c === null) return
        if (c === '"') state = 'quote_in_quoted_field'
        else field += c
        return
      case 'quote_in_quoted_field':
        if (c === '"') {
          field += c
          state = 'in_quoted_field'
        } else if (c === ',') {
          save()
          state = 'start_field'
        } else if (newline || c === null) endOfLine(c)
        else {
          field += c
          state = 'in_field'
        }
        return
      case 'eat_crnl':
        if (newline) return
        if (c === null) state = 'start_record'
        else
          throw new CsvLineError(
            "new-line character seen in unquoted field - do you need to open the file with newline=''?",
          )
        return
    }
  }
  let line: string | undefined = first
  for (;;) {
    for (const c of line) step(c)
    step(null)
    if (state === 'start_record') return fields
    line = more()
    if (line === undefined) {
      // End of data inside a record: not strict, so the field stays.
      if (field.length > 0 || state === 'in_quoted_field') save()
      return fields
    }
    count()
  }
}

/** `csv.reader` rows with `line_num` (physical lines read so far). */
function* records(
  path: string,
): Generator<{ readonly fields: string[]; readonly line: number }> {
  const lines = fileLines(path)
  let line = 0
  const more = () => {
    const next = lines.next()
    return next.done ? undefined : next.value
  }
  for (;;) {
    const text = more()
    if (text === undefined) return
    line += 1
    if (!text.includes('"')) {
      const body = text.replace(/\r\n$|\r$|\n$/, '')
      if (body.includes('\r') || body.includes('\n')) {
        // Unreachable: lines end at the first line break.
        throw new CsvLineError('unexpected line break')
      }
      const fields = body === '' ? [] : body.split(',')
      for (const field of fields) checkLength(field)
      yield { fields, line }
      continue
    }
    const fields = parseRecord(text, more, () => {
      line += 1
    })
    yield { fields, line }
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
