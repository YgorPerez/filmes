// The YAML blocks of the evaluation report, laid out as PyYAML's
// `safe_dump(value, allow_unicode=True, sort_keys=True)` (block style,
// indentless sequences, keys in code point order, plain scalars folded at
// column 80). Only what the report holds: mappings, lists, text, numbers,
// booleans and null. A JavaScript number has no int/float type: integral
// numbers come out as ints.

import { compareTuple } from '../compat/compare.ts'
import { pyRepr } from '../compat/number.ts'

export type ReportValue =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<ReportValue>
  | { readonly [key: string]: ReportValue }

const WIDTH = 80
const INDENT = 2

const NULL = /^(?:~|null|Null|NULL|)$/
const BOOL =
  /^(?:yes|Yes|YES|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF)$/
const INT =
  /^(?:[-+]?0b[0-1_]+|[-+]?0[0-7_]+|[-+]?(?:0|[1-9][0-9_]*)|[-+]?0x[0-9a-fA-F_]+|[-+]?[1-9][0-9_]*(?::[0-5]?[0-9])+)$/
const FLOAT =
  /^(?:[-+]?(?:[0-9][0-9_]*)\.[0-9_]*(?:[eE][-+][0-9]+)?|\.[0-9][0-9_]*(?:[eE][-+][0-9]+)?|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/
const TIMESTAMP =
  /^(?:[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}(?:[Tt]|[ \t]+)[0-9]{1,2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]*)?(?:[ \t]*(?:Z|[-+][0-9]{1,2}(?::[0-9]{2})?))?)$/

/** Whether a plain scalar would read back as something else, or cannot be
 * plain at all (PyYAML's resolver and `analyze_scalar`, for one line of
 * printable text). */
const needsQuotes = (text: string): boolean => {
  if (NULL.test(text) || BOOL.test(text) || INT.test(text) || FLOAT.test(text))
    return true
  if (TIMESTAMP.test(text) || text === '<<' || text === '=') return true
  if (/^[\s]|[\s]$/.test(text)) return true
  if (/^[#,[\]{}&*!|>'"%@`]/.test(text)) return true
  if (/^[-?:](?:\s|$)/.test(text)) return true
  if (/:(?:\s|$)| #/.test(text)) return true
  if (/^---|^\.\.\./.test(text)) return true
  return /[^\x20-\x7e\x85\xa0-\u{d7ff}\u{e000}-\u{fffd}\u{10000}-\u{10ffff}]/u.test(
    text,
  )
}

/** Writes a scalar from `column`, breaking at a single space past the
 * width (PyYAML's `write_plain` / `write_single_quoted` with `split`). */
const folded = (
  text: string,
  column: number,
  indent: number,
  split: boolean,
): string => {
  if (!split) return text
  let out = ''
  let col = column
  const words = text.split(' ')
  words.forEach((word, i) => {
    if (i > 0) {
      const single = word !== '' && words[i - 1] !== ''
      if (single && col > WIDTH) {
        out += `\n${' '.repeat(indent)}`
        col = indent
      } else {
        out += ' '
        col += 1
      }
    }
    out += word
    col += Array.from(word).length
  })
  return out
}

const scalar = (
  value: string | number | boolean | null,
  column: number,
  indent: number,
  split: boolean,
): string => {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return '.nan'
    if (!Number.isFinite(value)) return value > 0 ? '.inf' : '-.inf'
    if (Number.isInteger(value)) return String(value)
    const repr = pyRepr(value).toLowerCase()
    return !repr.includes('.') && repr.includes('e')
      ? repr.replace('e', '.0e')
      : repr
  }
  if (/[\n\r\x85\u2028\u2029]/.test(value)) return JSON.stringify(value)
  if (!needsQuotes(value)) return folded(value, column, indent, split)
  return `'${folded(value.replaceAll("'", "''"), column + 1, indent, split)}'`
}

const isCollection = (
  value: ReportValue,
): value is
  | ReadonlyArray<ReportValue>
  | { readonly [key: string]: ReportValue } =>
  typeof value === 'object' && value !== null

const isEmpty = (value: ReportValue) =>
  isCollection(value) &&
  (Array.isArray(value) ? value.length === 0 : Object.keys(value).length === 0)

const emptyText = (value: ReportValue) => (Array.isArray(value) ? '[]' : '{}')

/** The lines of `value` as a block node whose first line starts at
 * `column` (after "key: " or "- ") and whose other lines start at
 * `indent`. */
const block = (value: ReportValue, indent: number, column: number): string => {
  if (!isCollection(value)) return scalar(value, column, indent + INDENT, true)
  if (isEmpty(value)) return emptyText(value)
  const lines: string[] = []
  if (Array.isArray(value)) {
    for (const item of value as ReadonlyArray<ReportValue>) {
      const at = indent + 2
      const prefix = `${' '.repeat(indent)}- `
      const text = isCollection(item)
        ? block(item, at, at).replace(/^ +/, '')
        : scalar(item, at, at, true)
      lines.push(prefix + text)
    }
  } else {
    const entries = Object.entries(value).sort(([a], [b]) =>
      compareTuple([a], [b]),
    )
    for (const [key, item] of entries) {
      // PyYAML writes a key it cannot keep simple (empty, or 128
      // characters or more) as `? key`; no report has one.
      if (key === '' || Array.from(key).length >= 128)
        throw new RangeError(
          `chave longa ou vazia no YAML do relatório: ${key.slice(0, 40)}`,
        )
      const head = `${' '.repeat(indent)}${scalar(key, indent, indent, false)}:`
      if (isCollection(item) && !isEmpty(item)) {
        const childIndent = Array.isArray(item) ? indent : indent + INDENT
        lines.push(`${head}\n${block(item, childIndent, childIndent)}`)
      } else {
        const text = isCollection(item)
          ? emptyText(item)
          : scalar(item, Array.from(head).length + 1, indent + INDENT, true)
        lines.push(`${head} ${text}`)
      }
    }
  }
  const out = lines.join('\n')
  // The first line is written where the caller already is.
  return column === indent ? out : out.slice(indent)
}

/** `yaml.safe_dump(value, allow_unicode=True, sort_keys=True)`. */
export const dumpYaml = (value: ReportValue): string => {
  if (!isCollection(value) || isEmpty(value)) {
    const text = isCollection(value)
      ? emptyText(value)
      : scalar(value, 0, 0, true)
    return isCollection(value) ? `${text}\n` : `${text}\n...\n`
  }
  return `${block(value, 0, 0)}\n`
}
