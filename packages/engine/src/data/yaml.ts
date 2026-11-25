// YAML 1.1 as PyYAML's `safe_load` reads it and `safe_dump` writes it, the
// format of every filmes-dados frontmatter (R6 of the port inventory).
//
// The `yaml` package parses; the tags here replace its 1.1 schema with
// PyYAML's resolvers: `y` and `n` stay text, `1e3` is text (a float needs a
// dot), `09` is text, `0o10` is text. A value keeps its Python type: an int
// is a `PyInt`, a float a `PyFloat`, and a date or a timestamp becomes the
// text of its Python `str()` ("2026-11-20", "2026-11-20 10:00:00+00:00"),
// which is how the Python engine used every date it read. A date the engine
// writes is a `PyDate` (`pyDate("2026-11-20")`), written plain.

import {
  Document,
  isAlias,
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  Scalar,
  YAMLMap,
  YAMLSeq,
  type Node,
  type ScalarTag,
  type Tags,
  type ToStringOptions,
} from 'yaml'
import {
  pyFloat,
  pyInt,
  pyStr,
  type PyFloat,
  type PyInt,
} from '../compat/fact-id.ts'
import { pyRepr } from '../compat/number.ts'
import { pythonError } from '../compat/python-error.ts'
import { pyReprStr } from '../compat/text.ts'

/** A date the engine writes (`2026-11-20`, plain, as PyYAML writes a
 * Python `date`). Reading gives the text instead: see the header. */
export interface PyDate {
  readonly isoDate: string
}

export const pyDate = (isoDate: string): PyDate => ({ isoDate })

export const isPyDate = (value: unknown): value is PyDate =>
  typeof value === 'object' && value !== null && 'isoDate' in value

export type YamlScalar = string | boolean | null | PyInt | PyFloat | PyDate

/** A YAML value with Python's types. A mapping is a `Map` (insertion order,
 * a repeated key keeps its first place and its last value, as a dict); its
 * keys are the `str()` of the YAML keys. */
export type YamlValue = YamlScalar | readonly YamlValue[] | YamlMapping

export type YamlMapping = ReadonlyMap<string, YamlValue>

export const isPyInt = (value: unknown): value is PyInt =>
  typeof value === 'object' && value !== null && 'int' in value

export const isPyFloat = (value: unknown): value is PyFloat =>
  typeof value === 'object' && value !== null && 'float' in value

export const isMapping = (value: YamlValue | undefined): value is YamlMapping =>
  value instanceof Map

export const isSequence = (
  value: YamlValue | undefined,
): value is readonly YamlValue[] => Array.isArray(value)

/** PyYAML's int: `int()` after the underscores go, in base 2, 8, 10, 16 or
 * 60. */
const constructInt = (text: string): PyInt => {
  let value = text.replaceAll('_', '')
  const sign = value.startsWith('-') ? -1n : 1n
  if (value.startsWith('-') || value.startsWith('+')) value = value.slice(1)
  const parse = (digits: string, radix: number, prefix: string): bigint => {
    if (digits === '')
      throw pythonError(
        'ValueError',
        `invalid literal for int() with base ${radix}: ''`,
      )
    return BigInt(prefix + digits)
  }
  let n: bigint
  if (value === '0') n = 0n
  else if (value.startsWith('0b')) n = parse(value.slice(2), 2, '0b')
  else if (value.startsWith('0x')) n = parse(value.slice(2), 16, '0x')
  else if (value.startsWith('0')) n = parse(value.slice(1), 8, '0o')
  else if (value.includes(':'))
    n = value.split(':').reduce((total, part) => total * 60n + BigInt(part), 0n)
  else n = BigInt(value)
  const int = sign * n
  return pyInt(Number.isSafeInteger(Number(int)) ? Number(int) : int)
}

/** PyYAML's float, base 60 included. */
const constructFloat = (text: string): PyFloat => {
  let value = text.replaceAll('_', '').toLowerCase()
  const sign = value.startsWith('-') ? -1 : 1
  if (value.startsWith('-') || value.startsWith('+')) value = value.slice(1)
  if (value === '.inf') return pyFloat(sign * Number.POSITIVE_INFINITY)
  if (value === '.nan') return pyFloat(Number.NaN)
  if (value.includes(':'))
    return pyFloat(
      sign *
        value.split(':').reduce((total, part) => total * 60 + Number(part), 0),
    )
  return pyFloat(sign * Number(value))
}

const TIMESTAMP =
  /^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:[Tt]|[ \t]+)([0-9]{1,2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]*))?(?:[ \t]*(Z|([-+])([0-9]{1,2})(?::([0-9]{2}))?))?)?$/

const two = (n: number) => String(n).padStart(2, '0')

const isLeap = (year: number) =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)

const daysIn = (year: number, month: number) =>
  month === 2
    ? isLeap(year)
      ? 29
      : 28
    : [4, 6, 9, 11].includes(month)
      ? 30
      : 31

/** PyYAML's `date` or `datetime`, as its `str()`. Out of range is the
 * `ValueError` Python's constructors raise. */
const constructTimestamp = (text: string): string => {
  const match = TIMESTAMP.exec(text)
  if (!match) throw pythonError('ValueError', `not a timestamp: ${text}`)
  const [, y, mo, d, h, mi, s, fraction, tz, tzSign, tzHour, tzMinute] = match
  const year = Number(y)
  const month = Number(mo)
  const day = Number(d)
  if (year < 1) throw pythonError('ValueError', `year ${year} is out of range`)
  if (month < 1 || month > 12)
    throw pythonError('ValueError', 'month must be in 1..12')
  if (day < 1 || day > daysIn(year, month))
    throw pythonError('ValueError', 'day is out of range for month')
  const date = `${y}-${two(month)}-${two(day)}`
  if (h === undefined) return date
  const [hour, minute, second] = [Number(h), Number(mi), Number(s)]
  if (hour > 23) throw pythonError('ValueError', 'hour must be in 0..23')
  if (minute > 59) throw pythonError('ValueError', 'minute must be in 0..59')
  if (second > 59) throw pythonError('ValueError', 'second must be in 0..59')
  const micro = fraction ? fraction.slice(0, 6).padEnd(6, '0') : '000000'
  let offset = ''
  if (tzSign !== undefined) {
    const minutes = Number(tzHour) * 60 + Number(tzMinute ?? 0)
    if (minutes >= 24 * 60)
      throw pythonError(
        'ValueError',
        'offset must be a timedelta strictly between -timedelta(hours=24) and timedelta(hours=24)',
      )
    const sign = tzSign === '-' && minutes > 0 ? '-' : '+'
    offset = `${sign}${two(Math.floor(minutes / 60))}:${two(minutes % 60)}`
  } else if (tz === 'Z') offset = '+00:00'
  const time = `${two(hour)}:${two(minute)}:${two(second)}`
  return `${date} ${time}${micro === '000000' ? '' : `.${micro}`}${offset}`
}

/** PyYAML's `represent_float`. */
const representFloat = (x: number): string => {
  if (Number.isNaN(x)) return '.nan'
  if (x === Number.POSITIVE_INFINITY) return '.inf'
  if (x === Number.NEGATIVE_INFINITY) return '-.inf'
  const value = pyRepr(x).toLowerCase()
  return !value.includes('.') && value.includes('e')
    ? value.replace('e', '.0e')
    : value
}

const tag = (
  name: string,
  test: RegExp,
  resolve: ScalarTag['resolve'],
  identify: (value: unknown) => boolean,
  stringify: (value: unknown) => string,
): ScalarTag => ({
  tag: `tag:yaml.org,2002:${name}`,
  default: true,
  test,
  resolve,
  identify,
  stringify: (item) => stringify(item.value),
})

const never = () => false

/** A plain `<<`: PyYAML's merge key, only meaningful as a key. */
const MERGE_KEY = Symbol('merge')

/** The implicit resolvers of PyYAML's `Resolver`, in its order. */
const PYYAML_TAGS: ScalarTag[] = [
  tag(
    'null',
    /^(?:~|null|Null|NULL|)$/,
    () => null,
    (value) => value === null,
    () => 'null',
  ),
  tag(
    'bool',
    /^(?:yes|Yes|YES|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF)$/,
    (text) => /^(?:yes|true|on)$/i.test(text),
    (value) => typeof value === 'boolean',
    (value) => (value ? 'true' : 'false'),
  ),
  tag(
    'float',
    /^(?:[-+]?(?:[0-9][0-9_]*)\.[0-9_]*(?:[eE][-+][0-9]+)?|\.[0-9][0-9_]*(?:[eE][-+][0-9]+)?|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/,
    constructFloat,
    isPyFloat,
    (value) => representFloat((value as PyFloat).float),
  ),
  tag(
    'int',
    /^(?:[-+]?0b[0-1_]+|[-+]?0[0-7_]+|[-+]?(?:0|[1-9][0-9_]*)|[-+]?0x[0-9a-fA-F_]+|[-+]?[1-9][0-9_]*(?::[0-5]?[0-9])+)$/,
    constructInt,
    isPyInt,
    (value) => BigInt((value as PyInt).int).toString(),
  ),
  tag(
    'timestamp',
    /^(?:[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}(?:[Tt]|[ \t]+)[0-9]{1,2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]*)?(?:[ \t]*(?:Z|[-+][0-9]{1,2}(?::[0-9]{2})?))?)$/,
    constructTimestamp,
    isPyDate,
    (value) => (value as PyDate).isoDate,
  ),
  tag('merge', /^<<$/, () => MERGE_KEY, never, String),
  // PyYAML resolves a plain `=` and has no constructor for it.
  tag(
    'value',
    /^=$/,
    () => {
      throw new YamlError(
        "could not determine a constructor for the tag 'tag:yaml.org,2002:value'",
      )
    },
    never,
    String,
  ),
]

const BREAK = '\n\x85\u{2028}\u{2029}'
const WHITESPACE = `\0 \t\r${BREAK}`

/** PyYAML's `Emitter.analyze_scalar`, reduced to what `choose_scalar_style`
 * needs: whether the text may go plain in block and in flow context, and
 * whether it may go single-quoted. */
const analyze = (text: string) => {
  const chars = Array.from(text)
  if (chars.length === 0)
    return {
      empty: true,
      multiline: false,
      flowPlain: false,
      blockPlain: true,
      single: true,
    }
  let block = text.startsWith('---') || text.startsWith('...')
  let flow = block
  let lineBreaks = false
  let special = false
  let leadingSpace = false
  let leadingBreak = false
  let trailingSpace = false
  let trailingBreak = false
  let breakSpace = false
  let spaceBreak = false
  let previousSpace = false
  let previousBreak = false
  chars.forEach((ch, i) => {
    const before = i === 0 || WHITESPACE.includes(chars[i - 1] ?? '')
    const after =
      i + 1 >= chars.length || WHITESPACE.includes(chars[i + 1] ?? '')
    if (i === 0) {
      if ('#,[]{}&*!|>\'"%@`'.includes(ch)) flow = block = true
      if ('?:'.includes(ch)) {
        flow = true
        if (after) block = true
      }
      if (ch === '-' && after) flow = block = true
    } else {
      if (',?[]{}'.includes(ch)) flow = true
      if (ch === ':') {
        flow = true
        if (after) block = true
      }
      if (ch === '#' && before) flow = block = true
    }
    if (BREAK.includes(ch)) lineBreaks = true
    const unicode = PRINTABLE_UNICODE.test(ch) && ch !== FEFF && ch !== LAST
    if (!(ch === '\n' || (ch >= ' ' && ch <= '~')) && !unicode) special = true
    if (ch === ' ') {
      if (i === 0) leadingSpace = true
      if (i === chars.length - 1) trailingSpace = true
      if (previousBreak) breakSpace = true
      previousSpace = true
      previousBreak = false
    } else if (BREAK.includes(ch)) {
      if (i === 0) leadingBreak = true
      if (i === chars.length - 1) trailingBreak = true
      if (previousSpace) spaceBreak = true
      previousSpace = false
      previousBreak = true
    } else {
      previousSpace = false
      previousBreak = false
    }
  })
  const edges = leadingSpace || leadingBreak || trailingSpace || trailingBreak
  const noPlain = edges || breakSpace || spaceBreak || special || lineBreaks
  return {
    empty: false,
    multiline: lineBreaks,
    flowPlain: !noPlain && !flow,
    blockPlain: !noPlain && !block,
    single: !(breakSpace || spaceBreak || special),
  }
}

/** The non-ASCII PyYAML writes as is with `allow_unicode=True`. */
const PRINTABLE_UNICODE =
  /^[\x85\xa0-\u{d7ff}\u{e000}-\u{fffd}\u{10000}-\u{10ffff}]$/u
const FEFF = '\u{feff}'
const LAST = '\u{10ffff}'

const ESCAPES: Readonly<Record<string, string>> = {
  '\0': '0',
  '\x07': 'a',
  '\x08': 'b',
  '\t': 't',
  '\n': 'n',
  '\v': 'v',
  '\f': 'f',
  '\r': 'r',
  '\x1b': 'e',
  '"': '"',
  '\\': '\\',
  '\x85': 'N',
  '\xa0': '_',
  '\u{2028}': 'L',
  '\u{2029}': 'P',
}

const DOUBLE_RAW = /^[\x20-\x7e\xa0-\u{d7ff}\u{e000}-\u{fffd}]$/u

/** PyYAML's `write_double_quoted`, on one line. */
const doubleQuoted = (text: string): string => {
  let out = '"'
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    const escape = ESCAPES[ch]
    if (escape !== undefined && ch !== '\xa0') out += `\\${escape}`
    else if (ch !== FEFF && DOUBLE_RAW.test(ch)) out += ch
    else if (cp <= 0xff)
      out += `\\x${cp.toString(16).toUpperCase().padStart(2, '0')}`
    else if (cp <= 0xffff)
      out += `\\u${cp.toString(16).toUpperCase().padStart(4, '0')}`
    else out += `\\U${cp.toString(16).toUpperCase().padStart(8, '0')}`
  }
  return `${out}"`
}

/** Whether PyYAML reads the text, written plain, as this same text. */
const resolvesToText = (text: string): boolean =>
  !PYYAML_TAGS.some((t) => t.test?.test(text))

/** PyYAML's `choose_scalar_style` for a str: plain when it may, else single
 * quotes, else double. A text with a line break goes double-quoted with
 * `\n`, where PyYAML folds it over lines: both read back the same. */
const stringifyText = (text: string, inFlow: boolean, key: boolean): string => {
  const a = analyze(text)
  const plain = inFlow ? a.flowPlain : a.blockPlain
  if (resolvesToText(text) && !(key && (a.empty || a.multiline)) && plain)
    return text
  if (a.single && !a.multiline) return `'${text.replaceAll("'", "''")}'`
  return doubleQuoted(text)
}

const TEXT_TAG: ScalarTag = {
  tag: 'tag:yaml.org,2002:str',
  default: true,
  identify: (value) => typeof value === 'string',
  resolve: (text) => text,
  stringify: (item, ctx) =>
    stringifyText(
      String(item.value),
      ctx.inFlow === true,
      ctx.implicitKey === true,
    ),
}

/** The map and the sequence of the `yaml` package, then PyYAML's str and
 * implicit types. No `!!binary`, `!!set`, `!!omap` or `!!pairs`: filmes
 * never wrote them, and an unknown tag is an error. */
const customTags = (tags: Tags): Tags => [
  ...tags.filter(
    (t) =>
      typeof t !== 'string' &&
      ['map', 'seq'].some((n) => t.tag === `tag:yaml.org,2002:${n}`),
  ),
  TEXT_TAG,
  ...PYYAML_TAGS,
]

/** What PyYAML's reader takes (`Reader.NON_PRINTABLE`), as regex
 * escapes; anything else anywhere in the stream is refused. */
const PRINTABLE =
  '\\t\\n\\r\\x20-\\x7e\\x85\\xa0-\\u{d7ff}\\u{e000}-\\u{fffd}\\u{10000}-\\u{10ffff}'
const NON_PRINTABLE = new RegExp(`[^${PRINTABLE}]`, 'u')

/** A YAML text that PyYAML would refuse. */
export class YamlError extends Error {
  override readonly name = 'YamlError'
}

/** The Python value of a node. A plain `<<` key merges a mapping (or a list
 * of them) in, before the node's own keys, as PyYAML's `flatten_mapping`. */
const toValue = (node: unknown, doc: Document.Parsed): YamlValue => {
  if (isAlias(node)) return toValue(node.resolve(doc), doc)
  if (isScalar(node)) {
    if (node.value === MERGE_KEY)
      throw new YamlError(
        "could not determine a constructor for the tag 'tag:yaml.org,2002:merge'",
      )
    return node.value as YamlScalar
  }
  if (isSeq(node)) return node.items.map((item) => toValue(item, doc))
  if (isMap(node)) {
    const merged: Array<[string, YamlValue]> = []
    const own: Array<[string, YamlValue]> = []
    for (const pair of node.items) {
      const value = toValue(pair.value, doc)
      if (isScalar(pair.key) && pair.key.value === MERGE_KEY) {
        const sources = isSequence(value) ? [...value].reverse() : [value]
        for (const source of sources) {
          if (!isMapping(source))
            throw new YamlError(
              'expected a mapping or list of mappings for merging',
            )
          merged.push(...source)
        }
      } else own.push([keyText(toValue(pair.key, doc)), value])
    }
    return new Map([...merged, ...own])
  }
  if (node === null || node === undefined) return null
  throw new YamlError('unexpected YAML node')
}

const keyText = (key: YamlValue): string => {
  if (isSequence(key) || isMapping(key))
    throw new YamlError('found unhashable key')
  return pyStrValue(key)
}

/** `yaml.safe_load(text)`. A text PyYAML refuses throws a `YamlError`. */
export const parseYaml = (text: string): YamlValue => {
  if (/[\u{2028}\u{2029}]/u.test(text))
    throw new YamlError(
      'a raw U+2028 or U+2029, which YAML 1.1 reads as a line break; write it escaped (\\L, \\P)',
    )
  const unacceptable = NON_PRINTABLE.exec(text)
  if (unacceptable)
    throw new YamlError(
      `unacceptable character #x${(unacceptable[0].codePointAt(0) ?? 0).toString(16).padStart(4, '0')}: special characters are not allowed`,
    )
  // A raw U+0085 is a line break in YAML 1.1, read as "\n" everywhere.
  const doc = parseDocument(text.replaceAll('\x85', '\n'), {
    version: '1.1',
    customTags,
    merge: false,
    uniqueKeys: false,
    prettyErrors: false,
  })
  const problem = doc.errors[0] ?? doc.warnings[0]
  if (problem) throw new YamlError(problem.message)
  return toValue(doc.contents, doc)
}

const isScalarValue = (value: YamlValue): value is YamlScalar =>
  !isSequence(value) && !isMapping(value)

/** A node for `value`: a mapping or a list of scalars only (or an empty one)
 * goes in flow style, as PyYAML's `default_flow_style=None`. */
const toNode = (value: YamlValue): Node => {
  if (isSequence(value)) {
    const seq = new YAMLSeq()
    seq.items = value.map(toNode)
    seq.flow = value.every(isScalarValue)
    return seq
  }
  if (isMapping(value)) {
    const map = new YAMLMap()
    for (const [key, item] of value) map.set(new Scalar(key), toNode(item))
    map.flow = [...value.values()].every(isScalarValue)
    return map
  }
  return new Scalar(value)
}

const OPTIONS: ToStringOptions = {
  blockQuote: false,
  defaultStringType: 'PLAIN',
  directives: false,
  flowCollectionPadding: false,
  indentSeq: false,
  lineWidth: 0,
  singleQuote: true,
}

/** The YAML text of `value`, as PyYAML's `safe_dump(value,
 * allow_unicode=True, sort_keys=False, default_flow_style=None)` would
 * read it back. The layout is the `yaml` package's: one flow collection per
 * line, never wrapped. */
export const stringifyYaml = (value: YamlValue): string => {
  const doc = new Document(null, { version: '1.1', customTags })
  doc.contents = toNode(value) as typeof doc.contents
  return doc.toString(OPTIONS)
}

// --- Python's view of a value --------------------------------------------

/** Python's truth value: empty text, 0, 0.0, None, False and an empty list
 * or dict are false. */
export const pyTruthy = (value: YamlValue | undefined): boolean => {
  if (value === undefined || value === null) return false
  if (typeof value === 'string' || typeof value === 'boolean')
    return Boolean(value)
  if (isPyInt(value)) return BigInt(value.int) !== 0n
  if (isPyFloat(value)) return value.float !== 0
  if (isPyDate(value)) return true
  if (isSequence(value)) return value.length > 0
  return value.size > 0
}

/** Python's `repr()` of a value read from YAML. */
export const pyReprValue = (value: YamlValue): string => {
  if (typeof value === 'string') return pyReprStr(value)
  if (isSequence(value)) return `[${value.map(pyReprValue).join(', ')}]`
  if (isMapping(value))
    return `{${[...value]
      .map(([k, v]) => `${pyReprStr(k)}: ${pyReprValue(v)}`)
      .join(', ')}}`
  if (isPyDate(value))
    return `datetime.date(${value.isoDate
      .split('-')
      .map((part) => Number(part))
      .join(', ')})`
  return pyStr(value)
}

/** Python's `str()` of a value read from YAML. */
export const pyStrValue = (value: YamlValue): string =>
  isSequence(value) || isMapping(value)
    ? pyReprValue(value)
    : isPyDate(value)
      ? value.isoDate
      : pyStr(value)

/** What a Python `for` over the value yields: the items of a list, the
 * keys of a dict, the characters of a str. Anything else is the
 * `TypeError` Python raises. */
export const pyIterate = (value: YamlValue): readonly YamlValue[] => {
  if (isSequence(value)) return value
  if (isMapping(value)) return [...value.keys()]
  if (typeof value === 'string') return Array.from(value)
  throw pythonError('TypeError', `${typeName(value)} object is not iterable`)
}

const typeName = (value: YamlScalar): string =>
  value === null
    ? "'NoneType'"
    : typeof value === 'boolean'
      ? "'bool'"
      : isPyInt(value)
        ? "'int'"
        : isPyDate(value)
          ? "'datetime.date'"
          : "'float'"

/** What `json.dumps` writes for a value read from YAML: a dict as an
 * object in its order, an int or a float as a number. */
export const yamlToJson = (value: YamlValue): unknown => {
  if (isSequence(value)) return value.map(yamlToJson)
  if (isMapping(value))
    return Object.fromEntries(
      [...value].map(([key, item]) => [key, yamlToJson(item)]),
    )
  if (isPyInt(value)) return Number(value.int)
  if (isPyFloat(value)) return value.float
  if (isPyDate(value)) return value.isoDate
  return value
}
