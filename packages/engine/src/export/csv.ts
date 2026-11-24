// CSV as Python's `csv.writer` writes it with the default `excel` dialect:
// fields joined by commas, a field quoted only when it holds a comma, a
// quote or a line break (quotes doubled inside), and every row ended by
// "\r\n".

const NEEDS_QUOTES = /[",\r\n]/

const field = (text: string): string =>
  NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text

/** One row, with its line ending. A row of one empty field is `""`, so a
 * reader sees a row and not a blank line. */
export const csvRow = (fields: ReadonlyArray<string>): string =>
  (fields.length === 1 && fields[0] === ''
    ? '""'
    : fields.map(field).join(',')) + '\r\n'
