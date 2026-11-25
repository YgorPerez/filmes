// Python's `csv.reader` (default dialect, not strict) over a text stream
// opened with `newline=""`, fed a chunk at a time: the big catalog files
// (ml-32m's ratings.csv is about 900 MB, the Tag Genome's glmer.csv 370 MB)
// never sit in memory whole. A line without a double quote is split on
// commas directly, which is what the state machine does with it; a quoted
// line goes through a port of CPython 3.12's `_csv.c` for that dialect
// (non-strict: a character after a closing quote joins the field, and end
// of data inside quotes keeps it).
//
// Errors carry the text Python's would (`csv.Error` messages); the caller
// adds the path.

import { pythonError } from '../compat/python-error.ts'
import { pyReprStr } from '../compat/text.ts'

/** A row Python's reader or a column check refused. */
export class CsvLineError extends Error {
  override readonly name = 'CsvLineError'
}

const FIELD_LIMIT = 131_072

/** Splits decoded text into the lines `open(newline="")` iterates: each
 * ends after "\n", "\r" or "\r\n" and keeps it. */
export class LineSplitter {
  private pending = ''

  /** The lines complete so far. A "\r" at the end of the text waits for
   * the next chunk, which may start with its "\n". */
  push(text: string): string[] {
    const lines: string[] = []
    const pending = this.pending + text
    let start = 0
    for (let i = 0; i < pending.length; i++) {
      const c = pending.charCodeAt(i)
      if (c === 10) {
        lines.push(pending.slice(start, i + 1))
        start = i + 1
      } else if (c === 13) {
        if (i + 1 === pending.length) break
        const end = pending.charCodeAt(i + 1) === 10 ? i + 2 : i + 1
        lines.push(pending.slice(start, end))
        start = end
        i = end - 1
      }
    }
    this.pending = pending.slice(start)
    return lines
  }

  /** The last line, when the text did not end with a line break. */
  end(): string[] {
    const last = this.pending
    this.pending = ''
    return last.length > 0 ? [last] : []
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

/** Thrown by `more` when a quoted record runs past the lines fed so far. */
const NEED_MORE = Symbol('need more lines')

/** One record through the state machine, from its first line; more lines
 * come from `more` while a quoted field is open (`undefined` = end of
 * data). */
const parseRecord = (
  first: string,
  more: () => string | undefined,
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
  }
}

/** A `csv.reader` row and its `line_num` (physical lines read so far). */
export interface CsvRecord {
  readonly fields: string[]
  readonly line: number
}

/** `csv.reader` fed lines (from a `LineSplitter`) a batch at a time. A
 * blank line is an empty record, as Python's. */
export class CsvRecords {
  private pending: string[] = []
  private line = 0

  /** The records complete in these lines; `final` marks the end of data.
   * A quoted record still open waits for the next batch. */
  push(lines: readonly string[], final = false): CsvRecord[] {
    const buffer = this.pending.length > 0 ? [...this.pending, ...lines] : lines
    this.pending = []
    const out: CsvRecord[] = []
    let at = 0
    while (at < buffer.length) {
      const text = buffer[at]!
      if (!text.includes('"')) {
        at += 1
        this.line += 1
        const body = text.replace(/\r\n$|\r$|\n$/, '')
        const fields = body === '' ? [] : body.split(',')
        for (const field of fields) checkLength(field)
        out.push({ fields, line: this.line })
        continue
      }
      const start = at
      at += 1
      try {
        const fields = parseRecord(text, () => {
          if (at < buffer.length) return buffer[at++]
          if (final) return undefined
          throw NEED_MORE
        })
        this.line += at - start
        out.push({ fields, line: this.line })
      } catch (error) {
        if (error !== NEED_MORE) throw error
        this.pending = buffer.slice(start)
        return out
      }
    }
    return out
  }
}

/** Python's `csv.DictReader` over `CsvRecords`: the first row names the
 * columns, a blank row is skipped, a short row's missing columns are
 * `null` (`restval`). */
export class CsvDictRows {
  private columns: ReadonlyMap<string, number> | undefined

  /** The rows of these records as column lookups. A column the header
   * does not name throws Python's `KeyError`. */
  push(
    records: readonly CsvRecord[],
  ): Array<(column: string) => string | null> {
    const rows: Array<(column: string) => string | null> = []
    for (const { fields } of records) {
      if (this.columns === undefined) {
        this.columns = new Map(fields.map((name, i) => [name, i] as const))
        continue
      }
      if (fields.length === 0) continue
      const columns = this.columns
      rows.push((column) => {
        const at = columns.get(column)
        if (at === undefined) throw pythonError('KeyError', pyReprStr(column))
        return fields[at] ?? null
      })
    }
    return rows
  }
}
