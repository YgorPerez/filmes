// Python's `csv.DictReader(io.StringIO(text, newline=""), strict=True)` on
// the default dialect (`excel`): the same rows, the same line numbers and
// the same `csv.Error` messages, which the import shows. A port of CPython
// 3.12's `_csv.c` state machine for that dialect (no escape character,
// double quotes, no initial-space skipping).

/** Python's `csv.Error`; the message is its `str()`. */
export class CsvError extends Error {
  override readonly name = 'CsvError'
}

/** `csv.field_size_limit()`'s default. */
const FIELD_LIMIT = 131_072

type State =
  | 'start_record'
  | 'start_field'
  | 'in_field'
  | 'in_quoted_field'
  | 'quote_in_quoted_field'
  | 'eat_crnl'

const EOL = null

/** The lines `StringIO(text, newline="")` iterates: split after "\n",
 * "\r" or "\r\n", each with its ending. */
const lines = (text: string): string[] =>
  text.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) ?? []

/** `csv.reader`: one record per `next()`, `null` at the end. */
class Reader {
  lineNum = 0
  private readonly lines: string[]
  private at = 0
  private state: State = 'start_record'
  private fields: string[] = []
  private field = ''
  private fieldLength = 0

  constructor(text: string) {
    this.lines = lines(text)
  }

  private save() {
    this.fields.push(this.field)
    this.field = ''
    this.fieldLength = 0
  }

  private add(char: string) {
    if (this.fieldLength >= FIELD_LIMIT)
      throw new CsvError(`field larger than field limit (${FIELD_LIMIT})`)
    this.field += char
    this.fieldLength += 1
  }

  private endOfLine(char: string | null) {
    this.save()
    this.state = char === EOL ? 'start_record' : 'eat_crnl'
  }

  private process(char: string | null) {
    const newline = char === '\n' || char === '\r'
    switch (this.state) {
      case 'start_record':
        if (char === EOL) return
        if (newline) {
          this.state = 'eat_crnl'
          return
        }
        this.state = 'start_field'
        this.startField(char)
        return
      case 'start_field':
        this.startField(char)
        return
      case 'in_field':
        if (newline || char === EOL) this.endOfLine(char)
        else if (char === ',') {
          this.save()
          this.state = 'start_field'
        } else this.add(char)
        return
      case 'in_quoted_field':
        if (char === EOL) return
        if (char === '"') this.state = 'quote_in_quoted_field'
        else this.add(char)
        return
      case 'quote_in_quoted_field':
        if (char === '"') {
          this.add(char)
          this.state = 'in_quoted_field'
        } else if (char === ',') {
          this.save()
          this.state = 'start_field'
        } else if (newline || char === EOL) this.endOfLine(char)
        else throw new CsvError(`',' expected after '"'`)
        return
      case 'eat_crnl':
        if (newline) return
        if (char === EOL) this.state = 'start_record'
        else
          throw new CsvError(
            "new-line character seen in unquoted field - do you need to open the file with newline=''?",
          )
        return
    }
  }

  private startField(char: string | null) {
    if (char === '\n' || char === '\r' || char === EOL) this.endOfLine(char)
    else if (char === '"') this.state = 'in_quoted_field'
    else if (char === ',') this.save()
    else {
      this.add(char)
      this.state = 'in_field'
    }
  }

  /** A method, so the check reads the state the characters left. */
  private inQuotedField(): boolean {
    return this.state === 'in_quoted_field'
  }

  next(): string[] | null {
    this.fields = []
    this.field = ''
    this.fieldLength = 0
    this.state = 'start_record'
    do {
      const line = this.lines[this.at]
      if (line === undefined) {
        if (this.fieldLength !== 0 || this.inQuotedField())
          throw new CsvError('unexpected end of data')
        return null
      }
      this.at += 1
      this.lineNum += 1
      for (const char of line) this.process(char)
      this.process(EOL)
    } while (this.state !== 'start_record')
    return this.fields
  }
}

/** A row as `DictReader` gives it: each column by its header (`None`
 * where the row is short); a later column with the same header wins. */
export type CsvRow = ReadonlyMap<string, string | null>

/** `csv.DictReader` over the text. `fieldnames` reads the header (null
 * for an empty text); `rows()` yields each non-blank row with the line the
 * reader stopped at, lazily, so an error surfaces where Python's would. */
export class CsvDictReader {
  private readonly reader: Reader
  private header: readonly string[] | null | undefined

  constructor(text: string) {
    this.reader = new Reader(text)
  }

  get fieldnames(): readonly string[] | null {
    if (this.header === undefined) this.header = this.reader.next()
    return this.header
  }

  *rows(): Generator<{ readonly row: CsvRow; readonly lineNum: number }> {
    const names = this.fieldnames ?? []
    for (;;) {
      const record = this.reader.next()
      if (record === null) return
      if (record.length === 0) continue
      const row = new Map<string, string | null>()
      names.forEach((name, i) => row.set(name, record[i] ?? null))
      yield { row, lineNum: this.reader.lineNum }
    }
  }
}
