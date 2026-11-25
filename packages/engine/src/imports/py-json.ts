// Python's `json.loads(bytes)` for the Trakt export, keeping the Python
// types the reader looks at: an int is a `bigint`, a float a `number`, an
// object a `Map`. `JSON.parse` would make 9 and 9.0 the same number and
// refuse NaN and Infinity, which Python takes.

export type PyJson =
  | null
  | boolean
  | string
  | bigint
  | number
  | PyJson[]
  | Map<string, PyJson>

/** Python's text of a JSON document, or null where `json.loads` raises
 * (`ValueError`, `UnicodeError`). */
export const pyJsonLoads = (bytes: Uint8Array): { value: PyJson } | null => {
  const text = decode(bytes)
  if (text === null) return null
  try {
    return { value: new Parser(text).document() }
  } catch (error) {
    if (error instanceof JsonError) return null
    throw error
  }
}

// --- decoding (`json.detect_encoding`, errors="surrogatepass") ---------------

const decode = (b: Uint8Array): string | null => {
  const starts = (...prefix: number[]) =>
    prefix.every((byte, i) => b[i] === byte)
  if (starts(0, 0, 0xfe, 0xff)) return utf32(b.subarray(4), false)
  if (starts(0xff, 0xfe, 0, 0)) return utf32(b.subarray(4), true)
  if (starts(0xfe, 0xff)) return utf16(b.subarray(2), false)
  if (starts(0xff, 0xfe)) return utf16(b.subarray(2), true)
  if (starts(0xef, 0xbb, 0xbf)) return utf8(b.subarray(3))
  if (b.length >= 4) {
    if (!b[0]) return b[1] ? utf16(b, false) : utf32(b, false)
    if (!b[1]) return b[2] || b[3] ? utf16(b, true) : utf32(b, true)
  } else if (b.length === 2) {
    if (!b[0]) return utf16(b, false)
    if (!b[1]) return utf16(b, true)
  }
  return utf8(b)
}

const utf16 = (b: Uint8Array, little: boolean): string | null => {
  if (b.length % 2 !== 0) return null
  const units: number[] = []
  for (let i = 0; i < b.length; i += 2) {
    const x = b.at(i) ?? 0
    const y = b.at(i + 1) ?? 0
    units.push(little ? x | (y << 8) : (x << 8) | y)
  }
  return chunked(units, (part) => String.fromCharCode(...part))
}

const utf32 = (b: Uint8Array, little: boolean): string | null => {
  if (b.length % 4 !== 0) return null
  const points: number[] = []
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  for (let i = 0; i < b.length; i += 4) {
    const point = view.getUint32(i, little)
    if (point > 0x10ffff) return null
    points.push(point)
  }
  return chunked(points, (part) => String.fromCodePoint(...part))
}

const chunked = (
  values: number[],
  make: (part: number[]) => string,
): string => {
  let text = ''
  for (let i = 0; i < values.length; i += 8192)
    text += make(values.slice(i, i + 8192))
  return text
}

/** Strict UTF-8 that lets encoded surrogates through (surrogatepass). */
const utf8 = (b: Uint8Array): string | null => {
  const points: number[] = []
  let i = 0
  const cont = (at: number) => {
    const byte = b[at]
    return byte !== undefined && (byte & 0xc0) === 0x80 ? byte & 0x3f : null
  }
  while (i < b.length) {
    const lead = b[i] ?? 0
    if (lead < 0x80) {
      points.push(lead)
      i += 1
      continue
    }
    if (lead >= 0xc2 && lead <= 0xdf) {
      const c1 = cont(i + 1)
      if (c1 === null) return null
      points.push(((lead & 0x1f) << 6) | c1)
      i += 2
      continue
    }
    if (lead >= 0xe0 && lead <= 0xef) {
      const c1 = cont(i + 1)
      const c2 = cont(i + 2)
      if (c1 === null || c2 === null) return null
      const point = ((lead & 0x0f) << 12) | (c1 << 6) | c2
      if (point < 0x800) return null
      points.push(point)
      i += 3
      continue
    }
    if (lead >= 0xf0 && lead <= 0xf4) {
      const c1 = cont(i + 1)
      const c2 = cont(i + 2)
      const c3 = cont(i + 3)
      if (c1 === null || c2 === null || c3 === null) return null
      const point = ((lead & 0x07) << 18) | (c1 << 12) | (c2 << 6) | c3
      if (point < 0x10000 || point > 0x10ffff) return null
      points.push(point)
      i += 4
      continue
    }
    return null
  }
  return chunked(points, (part) => String.fromCodePoint(...part))
}

// --- parsing (`json.decoder`, strict) ----------------------------------------

class JsonError extends Error {}

const WHITESPACE = new Set([' ', '\t', '\n', '\r'])
const NUMBER = /-?(?:0|[1-9][0-9]*)(\.[0-9]+)?([eE][-+]?[0-9]+)?/y
const ESCAPES: Readonly<Record<string, string>> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
}
/** CPython's limit on the digits of an int read from text. */
const MAX_INT_DIGITS = 4300

class Parser {
  private at = 0
  private readonly text: string
  constructor(text: string) {
    this.text = text
  }

  document(): PyJson {
    const value = this.value()
    this.space()
    if (this.at !== this.text.length) throw new JsonError('Extra data')
    return value
  }

  private space() {
    while (WHITESPACE.has(this.text[this.at] ?? '')) this.at++
  }

  private literal(word: string): boolean {
    if (!this.text.startsWith(word, this.at)) return false
    this.at += word.length
    return true
  }

  private value(): PyJson {
    this.space()
    const c = this.text[this.at]
    if (c === '"') return this.string()
    if (c === '{') return this.object()
    if (c === '[') return this.array()
    if (this.literal('null')) return null
    if (this.literal('true')) return true
    if (this.literal('false')) return false
    NUMBER.lastIndex = this.at
    const number = NUMBER.exec(this.text)
    if (number !== null) {
      this.at += number[0].length
      if (number[1] === undefined && number[2] === undefined) {
        if (number[0].replace('-', '').length > MAX_INT_DIGITS)
          throw new JsonError('Exceeds the limit for integer string conversion')
        return BigInt(number[0])
      }
      return Number(number[0])
    }
    if (this.literal('NaN')) return Number.NaN
    if (this.literal('Infinity')) return Number.POSITIVE_INFINITY
    if (this.literal('-Infinity')) return Number.NEGATIVE_INFINITY
    throw new JsonError('Expecting value')
  }

  private string(): string {
    this.at++
    let out = ''
    for (;;) {
      const c = this.text[this.at]
      if (c === undefined) throw new JsonError('Unterminated string')
      this.at++
      if (c === '"') return out
      if (c < ' ') throw new JsonError('Invalid control character')
      if (c !== '\\') {
        out += c
        continue
      }
      const escape = this.text[this.at]
      this.at++
      if (escape === 'u') {
        const hex = this.text.slice(this.at, this.at + 4)
        if (!/^[0-9a-fA-F]{4}$/.test(hex))
          throw new JsonError('Invalid \\uXXXX escape')
        out += String.fromCharCode(Number.parseInt(hex, 16))
        this.at += 4
        continue
      }
      const plain = escape === undefined ? undefined : ESCAPES[escape]
      if (plain === undefined) throw new JsonError('Invalid \\escape')
      out += plain
    }
  }

  private object(): Map<string, PyJson> {
    this.at++
    const map = new Map<string, PyJson>()
    this.space()
    if (this.literal('}')) return map
    for (;;) {
      this.space()
      if (this.text[this.at] !== '"')
        throw new JsonError('Expecting property name')
      const key = this.string()
      this.space()
      if (!this.literal(':')) throw new JsonError("Expecting ':' delimiter")
      map.set(key, this.value())
      this.space()
      if (this.literal('}')) return map
      if (!this.literal(',')) throw new JsonError("Expecting ',' delimiter")
    }
  }

  private array(): PyJson[] {
    this.at++
    const list: PyJson[] = []
    this.space()
    if (this.literal(']')) return list
    for (;;) {
      list.push(this.value())
      this.space()
      if (this.literal(']')) return list
      if (!this.literal(',')) throw new JsonError("Expecting ',' delimiter")
    }
  }
}
