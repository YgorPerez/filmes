// The import readers against the vectors `golden.py` wrote with the Python
// they replace: the CSV reader, `html.unescape`, the RSS dates and the
// UTF-8 errors the import shows.
import { describe, expect, test } from 'vite-plus/test'
import {
  CsvDictReader,
  CsvError,
  pyDecodeUtf8,
  pyEmailDate,
  pyHtmlUnescape,
} from '../../src/index.ts'
import { golden } from '../compat/golden.ts'

const FOLDER = new URL('./golden/', import.meta.url)

interface CsvVector {
  readonly text: string
  readonly fieldnames?: readonly string[] | null
  readonly rows?: [number, [string, string | null][]][]
  readonly error?: string
}

/** What the reader gives for the text, in the vector's shape. */
const readAll = (text: string): Omit<CsvVector, 'text'> => {
  try {
    const reader = new CsvDictReader(text)
    const fieldnames = reader.fieldnames
    const rows = [...reader.rows()].map(
      ({ row, lineNum }): [number, [string, string | null][]] => [
        lineNum,
        [...row],
      ],
    )
    return { fieldnames, rows }
  } catch (error) {
    if (error instanceof CsvError) return { error: error.message }
    throw error
  }
}

describe('golden vectors', () => {
  test('csv.DictReader, strict', () => {
    const vectors = golden<CsvVector>('csv', FOLDER)
    expect(vectors.map(({ text }) => ({ text, ...readAll(text) }))).toEqual(
      vectors,
    )
  })

  test('html.unescape', () => {
    const vectors = golden<{ text: string; unescaped: string }>(
      'html-unescape',
      FOLDER,
    )
    expect(
      vectors.map(({ text }) => ({ text, unescaped: pyHtmlUnescape(text) })),
    ).toEqual(vectors)
  })

  test('parsedate_to_datetime(...).date()', () => {
    const vectors = golden<{ text: string; day: string | null }>(
      'email-date',
      FOLDER,
    )
    expect(
      vectors.map(({ text }) => ({ text, day: pyEmailDate(text) })),
    ).toEqual(vectors)
  })

  test("bytes.decode('utf-8-sig')", () => {
    const vectors = golden<{ hex: string; text?: string; error?: string }>(
      'utf8-sig',
      FOLDER,
    )
    expect(
      vectors.map(({ hex }) => ({
        hex,
        ...pyDecodeUtf8(Buffer.from(hex, 'hex'), true),
      })),
    ).toEqual(vectors)
  })
})
