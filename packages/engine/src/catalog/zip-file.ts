// One member of a ZIP on disk, streamed: the GroupLens dumps are too big to
// read whole (genome_2021.zip is 1.9 GB, ml-32m's ratings.csv inflates to
// 900 MB). Python's `ZipFile(path).open(name)`: the central directory read
// from the end of the file (ZIP64 included), the last entry of the name,
// stored or deflated, and the CRC-32 checked at the end of the member.

import {
  closeSync,
  createReadStream,
  fstatSync,
  openSync,
  readSync,
} from 'node:fs'
import type { Readable } from 'node:stream'
import { crc32, createInflateRaw } from 'node:zlib'
import { pythonError } from '../compat/python-error.ts'
import { pyReprStr } from '../compat/text.ts'
import { badZip, decodeName, ZipError } from '../imports/zip.ts'

const EOCD = 0x06054b50
const EOCD64 = 0x06064b50
const EOCD64_LOCATOR = 0x07064b50
const CENTRAL = 0x02014b50
const LOCAL = 0x04034b50
const EOCD_SIZE = 22
const MAX_COMMENT = 0xffff
const ZIP64_EXTRA = 0x0001

interface Member {
  readonly flags: number
  readonly method: number
  readonly crc: number
  readonly compressedSize: number
  readonly headerOffset: number
}

const read = (fd: number, position: number, length: number): Buffer => {
  const buffer = Buffer.alloc(length)
  const got = readSync(fd, buffer, 0, length, position)
  return buffer.subarray(0, got)
}

/** The sizes and offset of a ZIP64 extra field, for the 32-bit fields that
 * hold 0xFFFFFFFF. */
const zip64 = (
  extra: Buffer,
  sizes: { size: number; compressedSize: number; headerOffset: number },
) => {
  let at = 0
  while (at + 4 <= extra.length) {
    const id = extra.readUInt16LE(at)
    const length = extra.readUInt16LE(at + 2)
    if (id === ZIP64_EXTRA) {
      let field = at + 4
      const next = () => {
        const value = Number(extra.readBigUInt64LE(field))
        field += 8
        return value
      }
      if (sizes.size === 0xffffffff) sizes.size = next()
      if (sizes.compressedSize === 0xffffffff) sizes.compressedSize = next()
      if (sizes.headerOffset === 0xffffffff) sizes.headerOffset = next()
      return
    }
    at += 4 + length
  }
}

/** The central directory's entry for `name` (the last of that name). */
const findMember = (fd: number, name: string): Member => {
  const fileSize = fstatSync(fd).size
  if (fileSize < EOCD_SIZE) throw badZip('File is not a zip file')
  const tailStart = Math.max(0, fileSize - MAX_COMMENT - EOCD_SIZE)
  const tail = read(fd, tailStart, fileSize - tailStart)
  let end = -1
  for (let at = tail.length - EOCD_SIZE; at >= 0; at--)
    if (tail.readUInt32LE(at) === EOCD) {
      end = at
      break
    }
  if (end < 0) throw badZip('File is not a zip file')
  let size = tail.readUInt32LE(end + 12)
  let offset = tail.readUInt32LE(end + 16)
  let directoryEnd = tailStart + end
  const locator = tailStart + end - 20
  if (locator >= 0) {
    const bytes = read(fd, locator, 20)
    if (bytes.readUInt32LE(0) === EOCD64_LOCATOR) {
      const at = Number(bytes.readBigUInt64LE(8))
      const record = read(fd, at, 56)
      if (record.readUInt32LE(0) !== EOCD64)
        throw badZip('Corrupt zip64 end of central directory locator')
      size = Number(record.readBigUInt64LE(40))
      offset = Number(record.readBigUInt64LE(48))
      directoryEnd = locator - 56
    }
  }
  // The archive may sit after other bytes; zipfile shifts every offset.
  const shift = directoryEnd - size - offset
  if (shift < 0) throw badZip('File is not a zip file')
  const directory = read(fd, directoryEnd - size, size)
  let found: Member | undefined
  let at = 0
  while (at < directory.length) {
    if (at + 46 > directory.length || directory.readUInt32LE(at) !== CENTRAL)
      throw badZip('Bad magic number for central directory')
    const flags = directory.readUInt16LE(at + 8)
    const nameLength = directory.readUInt16LE(at + 28)
    const extraLength = directory.readUInt16LE(at + 30)
    const commentLength = directory.readUInt16LE(at + 32)
    const entryName = decodeName(
      directory.subarray(at + 46, at + 46 + nameLength),
      (flags & 0x800) !== 0,
    )
    if (entryName === name) {
      const sizes = {
        size: directory.readUInt32LE(at + 24),
        compressedSize: directory.readUInt32LE(at + 20),
        headerOffset: directory.readUInt32LE(at + 42),
      }
      const extraStart = at + 46 + nameLength
      zip64(directory.subarray(extraStart, extraStart + extraLength), sizes)
      found = {
        flags,
        method: directory.readUInt16LE(at + 10),
        crc: directory.readUInt32LE(at + 16),
        compressedSize: sizes.compressedSize,
        headerOffset: sizes.headerOffset + shift,
      }
    }
    at += 46 + nameLength + extraLength + commentLength
  }
  if (found === undefined)
    throw pythonError(
      'KeyError',
      `"There is no item named ${pyReprStr(name)} in the archive"`,
    )
  return found
}

/** Where the member's data starts, after its local header. */
const dataStart = (fd: number, name: string, member: Member): number => {
  const header = read(fd, member.headerOffset, 30)
  if (header.length < 30 || header.readUInt32LE(0) !== LOCAL)
    throw badZip('Bad magic number for file header')
  const nameLength = header.readUInt16LE(26)
  const extraLength = header.readUInt16LE(28)
  const headerName = decodeName(
    read(fd, member.headerOffset + 30, nameLength),
    (member.flags & 0x800) !== 0,
  )
  if (headerName !== name)
    throw badZip(
      `File name in directory ${pyReprStr(name)} and header ${pyReprStr(headerName)} differ.`,
    )
  if (member.flags & 0x1)
    throw new ZipError(
      'runtime',
      `File ${pyReprStr(name)} is encrypted, password required for extraction`,
    )
  return member.headerOffset + 30 + nameLength + extraLength
}

/** The bytes of member `name` of the ZIP at `path`, a chunk at a time. */
export async function* zipMember(
  path: string,
  name: string,
): AsyncGenerator<Buffer> {
  const fd = openSync(path, 'r')
  let member: Member
  let start: number
  try {
    member = findMember(fd, name)
    start = dataStart(fd, name, member)
  } finally {
    closeSync(fd)
  }
  if (member.method !== 0 && member.method !== 8)
    throw new Error(
      'NotImplementedError: That compression method is not supported',
    )
  if (member.compressedSize === 0) {
    if (member.crc !== 0) throw badZip(`Bad CRC-32 for file ${pyReprStr(name)}`)
    return
  }
  const source = createReadStream(path, {
    start,
    end: start + member.compressedSize - 1,
    highWaterMark: 1 << 20,
  })
  let stream: Readable = source
  if (member.method === 8) {
    const inflate = createInflateRaw({ chunkSize: 1 << 20 })
    source.on('error', (error) => inflate.destroy(error))
    stream = source.pipe(inflate)
  }
  // The last chunk waits for the CRC check, as Python's reader fails while
  // reading the member's last block, before its rows reach anyone.
  let crc = 0
  let held: Buffer | undefined
  try {
    for await (const chunk of stream) {
      const bytes = chunk as Buffer
      crc = crc32(bytes, crc)
      if (held !== undefined) yield held
      held = bytes
    }
  } finally {
    source.destroy()
    stream.destroy()
  }
  if (crc !== member.crc) throw badZip(`Bad CRC-32 for file ${pyReprStr(name)}`)
  if (held !== undefined) yield held
}
