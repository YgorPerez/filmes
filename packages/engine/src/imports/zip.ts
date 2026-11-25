// Reading a ZIP the way Python's `zipfile` does, for the imports' exports:
// the names in central-directory order, a name read from its last entry,
// and the same refusals (`BadZipFile`, the `RuntimeError` of an encrypted
// member). Stored and deflated members; ZIP64 is not read (no export the
// imports take is that big).
import { crc32, inflateRawSync } from 'node:zlib'
import { pyReprStr } from '../compat/text.ts'

/** Python's `zipfile.BadZipFile` (`kind: 'bad_zip'`) or the `RuntimeError`
 * of an encrypted member (`kind: 'runtime'`); the message is its `str()`. */
export class ZipError extends Error {
  override readonly name = 'ZipError'
  readonly kind: 'bad_zip' | 'runtime'
  constructor(kind: 'bad_zip' | 'runtime', message: string) {
    super(message)
    this.kind = kind
  }
}

export const badZip = (message: string) => new ZipError('bad_zip', message)

interface Entry {
  readonly name: string
  readonly flags: number
  readonly method: number
  readonly crc: number
  readonly compressedSize: number
  readonly headerOffset: number
}

const EOCD = 0x06054b50
const CENTRAL = 0x02014b50
const LOCAL = 0x04034b50
const EOCD_SIZE = 22
const MAX_COMMENT = 0xffff

/** cp437, the names' encoding without the UTF-8 flag. */
const CP437_HIGH =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u{A0}'

export const decodeName = (bytes: Uint8Array, utf8: boolean): string => {
  const text = utf8
    ? new TextDecoder('utf-8').decode(bytes)
    : Array.from(bytes, (b) =>
        b < 0x80 ? String.fromCharCode(b) : (CP437_HIGH[b - 0x80] ?? ''),
      ).join('')
  // zipfile cuts a name at its first NUL.
  const nul = text.indexOf('\0')
  return nul === -1 ? text : text.slice(0, nul)
}

/** The End of Central Directory record's offset (`_EndRecData`). */
const findEnd = (data: Buffer): number => {
  if (data.length < EOCD_SIZE) throw badZip('File is not a zip file')
  const last = data.length - EOCD_SIZE
  if (data.readUInt32LE(last) === EOCD && data.readUInt16LE(last + 20) === 0)
    return last
  const from = Math.max(0, data.length - MAX_COMMENT - EOCD_SIZE)
  for (let at = last; at >= from; at--)
    if (data.readUInt32LE(at) === EOCD) return at
  throw badZip('File is not a zip file')
}

/** A ZIP read into memory. */
export class Zip {
  private readonly entries: readonly Entry[]
  private readonly byName: ReadonlyMap<string, Entry>

  private readonly data: Buffer

  constructor(data: Buffer) {
    this.data = data
    const end = findEnd(data)
    const size = data.readUInt32LE(end + 12)
    const offset = data.readUInt32LE(end + 16)
    // The archive may sit after other bytes; zipfile shifts every offset.
    const shift = end - size - offset
    if (shift < 0) throw badZip('File is not a zip file')
    const entries: Entry[] = []
    let at = end - size
    while (at < end) {
      if (at + 46 > data.length || data.readUInt32LE(at) !== CENTRAL)
        throw badZip('Bad magic number for central directory')
      const flags = data.readUInt16LE(at + 8)
      const nameLength = data.readUInt16LE(at + 28)
      const extraLength = data.readUInt16LE(at + 30)
      const commentLength = data.readUInt16LE(at + 32)
      entries.push({
        name: decodeName(
          data.subarray(at + 46, at + 46 + nameLength),
          (flags & 0x800) !== 0,
        ),
        flags,
        method: data.readUInt16LE(at + 10),
        crc: data.readUInt32LE(at + 16),
        compressedSize: data.readUInt32LE(at + 20),
        headerOffset: data.readUInt32LE(at + 42) + shift,
      })
      at += 46 + nameLength + extraLength + commentLength
    }
    this.entries = entries
    this.byName = new Map(entries.map((e) => [e.name, e]))
  }

  /** `namelist()`. */
  names(): readonly string[] {
    return this.entries.map((e) => e.name)
  }

  /** `read(name)`: the member's bytes, from the last entry of that name. */
  read(name: string): Buffer {
    const entry = this.byName.get(name)
    if (entry === undefined)
      throw badZip(`There is no item named ${pyReprStr(name)} in the archive`)
    return this.readEntry(entry)
  }

  /** `infolist()` then `read(info)`: every entry in directory order, each
   * read on demand (two entries of one name are two members). */
  members(): readonly { readonly name: string; read: () => Buffer }[] {
    return this.entries.map((entry) => ({
      name: entry.name,
      read: () => this.readEntry(entry),
    }))
  }

  private readEntry(entry: Entry): Buffer {
    const data = this.data
    const at = entry.headerOffset
    if (at + 30 > data.length || data.readUInt32LE(at) !== LOCAL)
      throw badZip('Bad magic number for file header')
    const nameLength = data.readUInt16LE(at + 26)
    const extraLength = data.readUInt16LE(at + 28)
    const headerName = decodeName(
      data.subarray(at + 30, at + 30 + nameLength),
      (entry.flags & 0x800) !== 0,
    )
    if (headerName !== entry.name)
      throw badZip(
        `File name in directory ${pyReprStr(entry.name)} and header ${pyReprStr(headerName)} differ.`,
      )
    if (entry.flags & 0x1)
      throw new ZipError(
        'runtime',
        `File ${pyReprStr(entry.name)} is encrypted, password required for extraction`,
      )
    const start = at + 30 + nameLength + extraLength
    const raw = data.subarray(start, start + entry.compressedSize)
    let content: Buffer
    if (entry.method === 0) content = Buffer.from(raw)
    else if (entry.method === 8) content = inflateRawSync(raw)
    else
      throw new Error(
        'NotImplementedError: That compression method is not supported',
      )
    if (crc32(content) !== entry.crc)
      throw badZip(`Bad CRC-32 for file ${pyReprStr(entry.name)}`)
    return content
  }
}
