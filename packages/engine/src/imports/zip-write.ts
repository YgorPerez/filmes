// Writing a ZIP, for an import that keeps only part of the one it got (the
// TV Time backup, #300): stored members, no compression, a fixed date, so
// the same members always give the same bytes and the same hash.
import { crc32 } from 'node:zlib'

/** 1980-01-01 00:00, the earliest date a ZIP can hold. */
const DOS_DATE = 0x21

/** A ZIP of the members, in their order. */
export const zipStored = (
  members: readonly { readonly name: string; readonly content: Uint8Array }[],
): Buffer => {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const member of members) {
    const content = Buffer.from(member.content)
    const name = Buffer.from(member.name, 'utf8')
    const utf8 = /^\p{ASCII}*$/u.test(member.name) ? 0 : 0x800
    const crc = crc32(content)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(utf8, 6)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(content.length, 18)
    local.writeUInt32LE(content.length, 22)
    local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(utf8, 8)
    central.writeUInt16LE(DOS_DATE, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(content.length, 20)
    central.writeUInt32LE(content.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, name, content)
    centrals.push(central, name)
    offset += local.length + name.length + content.length
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
