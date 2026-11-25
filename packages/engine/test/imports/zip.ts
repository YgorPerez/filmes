// A ZIP writer for the import tests, as Python's `zipfile` writes one:
// stored or deflated members, a non-ASCII name flagged as UTF-8.
import { crc32, deflateRawSync } from 'node:zlib'

export interface Member {
  readonly name: string
  readonly content: string | Uint8Array
  readonly deflate?: boolean
  /** Sets the "encrypted" flag (the content stays plain). */
  readonly encrypted?: boolean
}

export const zipOf = (
  members: readonly (Member | readonly [string, string | Uint8Array])[],
): Buffer => {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const entry of members) {
    const member: Member = Array.isArray(entry)
      ? { name: entry[0] as string, content: entry[1] as string | Uint8Array }
      : (entry as Member)
    const content = Buffer.from(member.content)
    const data = member.deflate ? deflateRawSync(content) : content
    const name = Buffer.from(member.name, 'utf8')
    const flags =
      (/^\p{ASCII}*$/u.test(member.name) ? 0 : 0x800) |
      (member.encrypted ? 1 : 0)
    const method = member.deflate ? 8 : 0
    const crc = crc32(content)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(flags, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(0x21, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(content.length, 22)
    local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(flags, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(0x21, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(content.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, name, data)
    centrals.push(central, name)
    offset += local.length + name.length + data.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(members.length, 8)
  end.writeUInt16LE(members.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}
